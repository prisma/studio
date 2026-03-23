import type { ReservedSql, Sql } from "postgres";

import { AbortError, type Executor, getAbortResult } from "../executor";
import {
  createLintDiagnosticsFromPostgresError,
  validateSqlForLint,
} from "../postgres-core/sql-lint";
import { getCancelQuery, getPIDQuery } from "../postgres-core/utility";
import type { Query, QueryResult } from "../query";

const SQL_LINT_STATEMENT_TIMEOUT = "1000ms";
const SQL_LINT_LOCK_TIMEOUT = "100ms";
const SQL_LINT_IDLE_IN_TRANSACTION_TIMEOUT = "1000ms";

export function createPostgresJSExecutor(postgresjs: Sql): Executor {
  return {
    execute: async (query, options) => {
      const { abortSignal } = options || {};

      if (!abortSignal) {
        try {
          const result = await postgresjs.unsafe(
            query.sql,
            query.parameters as never,
          );

          return [null, result as never];
        } catch (error: unknown) {
          return [error as Error];
        }
      }

      if (abortSignal.aborted) {
        return getAbortResult();
      }

      let abortListener: (() => void) | undefined;
      let connection: ReservedSql | undefined;

      try {
        let aborted: () => void;
        const abortionPromise = new Promise<void>(
          (resolve) => (aborted = resolve),
        );

        abortSignal.addEventListener(
          "abort",
          (abortListener = () => aborted()),
        );

        const connectionPromise = postgresjs.reserve();

        const connectionResult = await Promise.race([
          connectionPromise,
          abortionPromise,
        ]);

        if (!connectionResult) {
          void connectionPromise.catch(() => {});

          return getAbortResult();
        }

        connection = connectionResult;

        if (abortSignal.aborted) {
          connection.release();

          return getAbortResult();
        }

        const pidPromise = getConnectionPID(connection);

        const pidResult = await Promise.race([pidPromise, abortionPromise]);

        if (pidResult === undefined) {
          void pidPromise.catch(() => {}).finally(() => connection?.release());

          return getAbortResult();
        }

        if (abortSignal.aborted) {
          connection.release();

          return getAbortResult();
        }

        const queryPromise = connection.unsafe(
          query.sql,
          query.parameters as never,
        );

        const queryResult = await Promise.race([queryPromise, abortionPromise]);

        if (!queryResult) {
          void Promise.allSettled([
            cancelQuery(postgresjs, pidResult!),
            queryPromise,
          ]).finally(() => connection?.release());

          return getAbortResult();
        }

        connection.release();

        return [null, queryResult as never];
      } catch (error: unknown) {
        connection?.release();

        return [error as Error];
      } finally {
        if (abortListener) {
          abortSignal?.removeEventListener("abort", abortListener);
        }
      }
    },

    async executeTransaction(queries, options) {
      const { abortSignal } = options || {};

      if (abortSignal?.aborted) {
        return getAbortResult();
      }

      try {
        const results = await postgresjs.begin(async (tx) => {
          const transactionResults: QueryResult<Query<unknown>>[] = [];

          for (const query of queries) {
            if (abortSignal?.aborted) {
              throw new AbortError();
            }

            const result = await tx.unsafe(
              query.sql,
              query.parameters as never,
            );

            transactionResults.push(result as never);
          }

          return transactionResults;
        });

        return [null, results];
      } catch (error: unknown) {
        return [error as Error];
      }
    },

    async lintSql(details, options) {
      const validation = validateSqlForLint(details.sql);

      if (!validation.ok) {
        return [
          null,
          {
            diagnostics: [validation.diagnostic],
            schemaVersion: details.schemaVersion,
          },
        ];
      }

      const executeLint = async (statementSql: string) => {
        await postgresjs.begin(async (tx) => {
          await tx.unsafe(
            `set local statement_timeout = '${SQL_LINT_STATEMENT_TIMEOUT}'`,
          );
          await tx.unsafe(
            `set local lock_timeout = '${SQL_LINT_LOCK_TIMEOUT}'`,
          );
          await tx.unsafe(
            `set local idle_in_transaction_session_timeout = '${SQL_LINT_IDLE_IN_TRANSACTION_TIMEOUT}'`,
          );
          await tx.unsafe(`EXPLAIN (FORMAT JSON) ${statementSql}`);
        });
      };

      const { abortSignal } = options || {};
      const diagnostics: NonNullable<
        Awaited<ReturnType<NonNullable<Executor["lintSql"]>>>[1]
      >["diagnostics"] = [];

      if (!abortSignal) {
        for (const statement of validation.statements) {
          try {
            await executeLint(statement.statement);
          } catch (error: unknown) {
            diagnostics.push(
              ...createLintDiagnosticsFromPostgresError({
                error,
                positionOffset: statement.from,
                sql: statement.statement,
              }),
            );
          }
        }

        return [null, { diagnostics, schemaVersion: details.schemaVersion }];
      }

      if (abortSignal.aborted) {
        return getAbortResult();
      }

      let rejectAbort: (reason?: unknown) => void = () => undefined;
      const abortionPromise = new Promise<never>((_, reject) => {
        rejectAbort = reject;
      });
      const onAbort = () => rejectAbort(new AbortError());
      abortSignal.addEventListener("abort", onAbort);

      try {
        for (const statement of validation.statements) {
          try {
            await Promise.race([
              executeLint(statement.statement),
              abortionPromise,
            ]);
          } catch (error: unknown) {
            if (error instanceof AbortError) {
              return [error];
            }

            diagnostics.push(
              ...createLintDiagnosticsFromPostgresError({
                error,
                positionOffset: statement.from,
                sql: statement.statement,
              }),
            );
          }
        }

        return [null, { diagnostics, schemaVersion: details.schemaVersion }];
      } catch (error: unknown) {
        if (error instanceof AbortError) {
          return [error];
        }

        return [
          null,
          {
            diagnostics: createLintDiagnosticsFromPostgresError({
              error,
              sql: details.sql,
            }),
            schemaVersion: details.schemaVersion,
          },
        ];
      } finally {
        abortSignal.removeEventListener("abort", onAbort);
      }
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
async function cancelQuery(postgresjs: Sql, pid: {}): Promise<void> {
  const query = getCancelQuery(pid);

  try {
    await postgresjs.unsafe(query.sql, query.parameters as never);
  } catch (error) {
    console.error("Failed to cancel query:", error);
  }
}

async function getConnectionPID(connection: ReservedSql): Promise<unknown> {
  const query = getPIDQuery();

  try {
    const [result] = await connection.unsafe<QueryResult<typeof query>>(
      query.sql,
      query.parameters as never,
    );

    return result?.pid;
  } catch (error) {
    console.error("Failed to get connection PID:", error);

    return undefined;
  }
}
