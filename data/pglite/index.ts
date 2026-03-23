import type { PGlite } from "@electric-sql/pglite";

import type { Adapter } from "../adapter";
import { AbortError, type Executor, getAbortResult } from "../executor";
import { createPostgresAdapter } from "../postgres-core";
import {
  createLintDiagnosticsFromPostgresError,
  validateSqlForLint,
} from "../postgres-core/sql-lint";
import { asQuery, type Query, type QueryResult } from "../query";

export interface PGLiteExecutorOptions {
  /**
   * Delay in milliseconds to add before executing the query.
   * This can be a static number or a function that takes the query as an argument and returns a number.
   *
   * This is useful for simulating network latency or for debugging purposes.
   */
  addDelay?: number | ((query: Query<unknown>) => number);

  /**
   * Whether to log the query and its parameters.
   *
   * Defaults to `false`.
   */
  logging?: boolean | ((query: Query<unknown>) => boolean);
}

export function createPGLiteExecutor(
  pglite: PGlite,
  options?: PGLiteExecutorOptions,
): Executor {
  const { addDelay = 0, logging = false } = options ?? {};

  const executeQuery: Executor["execute"] = async (query, options) => {
    const { abortSignal } = options || {};

    let abort: (reason?: unknown) => void;
    const abortionPromise = new Promise<never>((_, reject) => (abort = reject));

    function abortListener(): void {
      abort(new AbortError());
    }

    abortSignal?.addEventListener("abort", abortListener);

    const addedDelay =
      typeof addDelay === "function" ? addDelay(query) : addDelay;

    const queryPGLite = () =>
      pglite.query(query.sql, query.parameters as never[], {
        rowMode: "object",
      });

    const queryPGLitePossiblyDelayed =
      addedDelay > 0
        ? () =>
            new Promise((resolve) => setTimeout(resolve, addedDelay)).then(() =>
              queryPGLite(),
            )
        : queryPGLite;

    try {
      const shouldLog =
        typeof logging === "function" ? logging(query) : logging;

      let loggableQuery: string;
      if (shouldLog) {
        console.log(
          "PGLiteExecutor: Executing query:",
          (loggableQuery = JSON.stringify(query, null, 2)),
        );
      }

      const now = Date.now();

      const result = await Promise.race([
        queryPGLitePossiblyDelayed(),
        abortionPromise,
      ]);

      const duration = Date.now() - now;

      if (shouldLog) {
        console.log(
          "PGLiteExecutor: Query executed in",
          duration,
          "ms:",
          loggableQuery!,
        );
      }

      return [null, result.rows as never];
    } catch (error: unknown) {
      return [error as Error];
    } finally {
      abortSignal?.removeEventListener("abort", abortListener);
    }
  };

  return {
    execute: executeQuery,

    async executeTransaction(queries, options) {
      const { abortSignal } = options || {};

      if (abortSignal?.aborted) {
        return getAbortResult();
      }

      try {
        await pglite.query("BEGIN");
        const results: QueryResult<Query<unknown>>[] = [];

        for (const query of queries) {
          if (abortSignal?.aborted) {
            throw new AbortError();
          }

          const result = await pglite.query(query.sql, query.parameters as never[], {
            rowMode: "object",
          });
          results.push(result.rows as never);
        }

        await pglite.query("COMMIT");

        return [null, results];
      } catch (error: unknown) {
        await pglite.query("ROLLBACK").catch(() => undefined);
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

      const diagnostics: NonNullable<
        Awaited<ReturnType<NonNullable<Executor["lintSql"]>>>[1]
      >["diagnostics"] = [];

      for (const statement of validation.statements) {
        const [error] = await executeQuery(
          asQuery(`EXPLAIN (FORMAT JSON) ${statement.statement}`),
          options,
        );

        if (!error) {
          continue;
        }

        if (error.name === "AbortError") {
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

      return [null, { diagnostics, schemaVersion: details.schemaVersion }];
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PGLiteAdapterOptions extends PGLiteExecutorOptions {}

export function createPGLiteAdapter(
  pglite: PGlite,
  options?: PGLiteAdapterOptions,
): Adapter {
  return createPostgresAdapter({
    executor: createPGLiteExecutor(pglite, options),
  });
}
