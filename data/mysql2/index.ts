import type { Pool, PoolConnection } from "mysql2/promise";

import { AbortError, getAbortResult, type SequenceExecutor } from "../executor";
import { getCancelQuery } from "../mysql-core/utility";

export function createMySQL2Executor(pool: Pool): SequenceExecutor {
  return {
    async execute(query, options) {
      const { abortSignal } = options || {};

      if (!abortSignal) {
        try {
          const [result] = await pool.query(query.sql, query.parameters);

          return [null, asArray(result)] as never;
        } catch (error: unknown) {
          return [error as Error];
        }
      }

      if (abortSignal.aborted) {
        return getAbortResult();
      }

      let abortListener: (() => void) | undefined;
      let connection: PoolConnection | undefined;

      try {
        let aborted: () => void;
        const abortionPromise = new Promise<void>(
          (resolve) => (aborted = resolve),
        );

        abortSignal.addEventListener(
          "abort",
          (abortListener = () => aborted()),
        );

        const connectionPromise = pool.getConnection();

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

        const queryPromise = (connection || pool).query(
          query.sql,
          query.parameters,
        );

        const queryResult = await Promise.race([queryPromise, abortionPromise]);

        if (!queryResult) {
          // not important enough to await.
          void Promise.allSettled([
            cancelQuery(pool, queryResult),
            queryPromise,
          ]).finally(() => connection?.release());

          return getAbortResult();
        }

        connection.release();

        const [result] = queryResult;

        return [null, asArray(result)] as never;
      } catch (error: unknown) {
        connection?.release();

        return [error as Error];
      } finally {
        if (abortListener) {
          abortSignal?.removeEventListener("abort", abortListener);
        }
      }
    },

    // TODO: abort signal handling
    // TODO: transaction?
    async executeSequence(sequence, _options) {
      let connection: PoolConnection | undefined;

      try {
        connection = await pool.getConnection();

        const [query0, query1] = sequence;

        const [result0] = await connection
          .query(query0.sql, query0.parameters)
          .catch((error) => [error as Error]);

        if (result0 instanceof Error) {
          return [[result0]];
        }

        const [result1] = await connection
          .query(query1.sql, query1.parameters)
          .catch((error) => [error as Error]);

        if (result1 instanceof Error) {
          return [[null, asArray(result0)], [result1]] as never;
        }

        return [
          [null, asArray(result0)],
          [null, asArray(result1)],
        ] as never;
      } catch (error: unknown) {
        return [[error as Error]];
      } finally {
        connection?.release();
      }
    },

    async executeTransaction(queries, options) {
      const { abortSignal } = options || {};

      if (abortSignal?.aborted) {
        return getAbortResult();
      }

      let connection: PoolConnection | undefined;

      try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const results = [];

        for (const query of queries) {
          if (abortSignal?.aborted) {
            throw new AbortError();
          }

          const [result] = await connection.query(query.sql, query.parameters);
          results.push(asArray(result));
        }

        await connection.commit();

        return [null, results] as never;
      } catch (error: unknown) {
        await connection?.rollback().catch(() => undefined);
        return [error as Error];
      } finally {
        connection?.release();
      }
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asArray<T>(value: T): T extends any[] ? T : T[] {
  return (Array.isArray(value) ? value : [value]) as never;
}

async function cancelQuery(pool: Pool, threadId: unknown): Promise<void> {
  const query = getCancelQuery(threadId);

  try {
    await pool.query(query.sql, query.parameters);
  } catch (error: unknown) {
    console.error("Failed to cancel query:", error);
  }
}
