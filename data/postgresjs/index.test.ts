import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";

import { createPostgresJSExecutor } from "./index";

function createPostgresJsMock(args?: {
  beginImpl?: (
    callback: (tx: { unsafe: (sql: string) => Promise<unknown> }) => unknown,
  ) => Promise<unknown>;
}): {
  begin: ReturnType<typeof vi.fn>;
  postgresjs: Sql;
  reserve: ReturnType<typeof vi.fn>;
  unsafe: ReturnType<typeof vi.fn>;
} {
  const beginImpl =
    args?.beginImpl ??
    (async (
      callback: (tx: { unsafe: (sql: string) => Promise<unknown> }) => unknown,
    ) => {
      await callback({
        unsafe: vi.fn().mockResolvedValue([]),
      });
    });

  const begin = vi.fn(beginImpl);
  const reserve = vi.fn();
  const unsafe = vi.fn();

  return {
    begin,
    postgresjs: {
      begin,
      reserve,
      unsafe,
    } as unknown as Sql,
    reserve,
    unsafe,
  };
}

describe("postgresjs executor sql lint", () => {
  it("returns validation diagnostics without touching the database for invalid SQL", async () => {
    const { begin, postgresjs } = createPostgresJsMock();
    const executor = createPostgresJSExecutor(postgresjs);

    if (!executor.lintSql) {
      throw new Error("Expected postgresjs executor to expose lintSql");
    }

    const [error, result] = await executor.lintSql({ sql: "   " });

    expect(error).toBeNull();
    expect(result?.diagnostics).toEqual([
      expect.objectContaining({
        message: "Type a SQL statement to lint.",
        severity: "info",
      }),
    ]);
    expect(begin).not.toHaveBeenCalled();
  });

  it("runs lint query with transaction-local timeouts and returns no diagnostics on success", async () => {
    const txUnsafe = vi.fn().mockResolvedValue([]);
    const { postgresjs } = createPostgresJsMock({
      beginImpl: async (callback) => {
        await callback({ unsafe: txUnsafe });
      },
    });
    const executor = createPostgresJSExecutor(postgresjs);

    if (!executor.lintSql) {
      throw new Error("Expected postgresjs executor to expose lintSql");
    }

    const [error, result] = await executor.lintSql({ sql: "select 1;" });

    expect(error).toBeNull();
    expect(result?.diagnostics).toEqual([]);
    expect(txUnsafe).toHaveBeenCalledWith(
      "set local statement_timeout = '1000ms'",
    );
    expect(txUnsafe).toHaveBeenCalledWith("set local lock_timeout = '100ms'");
    expect(txUnsafe).toHaveBeenCalledWith(
      "set local idle_in_transaction_session_timeout = '1000ms'",
    );
    expect(txUnsafe).toHaveBeenCalledWith("EXPLAIN (FORMAT JSON) select 1");
  });

  it("maps postgres errors to lint diagnostics", async () => {
    const txUnsafe = vi.fn((sql: string) => {
      if (sql.startsWith("EXPLAIN")) {
        const error = new Error(
          'relation "public.missing_table" does not exist',
        ) as Error & {
          code?: string;
        };
        error.code = "42P01";
        return Promise.reject(error);
      }

      return Promise.resolve([]);
    });
    const { postgresjs } = createPostgresJsMock({
      beginImpl: async (callback) => {
        await callback({ unsafe: txUnsafe });
      },
    });
    const executor = createPostgresJSExecutor(postgresjs);

    if (!executor.lintSql) {
      throw new Error("Expected postgresjs executor to expose lintSql");
    }

    const [error, result] = await executor.lintSql({
      sql: "select * from public.missing_table",
    });

    expect(error).toBeNull();
    expect(result?.diagnostics).toEqual([
      expect.objectContaining({
        code: "42P01",
        message: 'relation "public.missing_table" does not exist',
        severity: "error",
      }),
    ]);
  });

  it("lints multiple statements and maps error offsets to full SQL", async () => {
    const txUnsafe = vi.fn((sql: string) => {
      if (sql.includes("all_data_typesfail")) {
        const error = new Error(
          'relation "public.all_data_typesfail" does not exist',
        ) as Error & { code?: string };
        error.code = "42P01";
        return Promise.reject(error);
      }

      return Promise.resolve([]);
    });
    const { begin, postgresjs } = createPostgresJsMock({
      beginImpl: async (callback) => {
        await callback({ unsafe: txUnsafe });
      },
    });
    const executor = createPostgresJSExecutor(postgresjs);

    if (!executor.lintSql) {
      throw new Error("Expected postgresjs executor to expose lintSql");
    }

    const sql = "select 1;\nselect * from public.all_data_typesfail";
    const relationFrom = sql.indexOf("public.all_data_typesfail");
    const relationTo = relationFrom + "public.all_data_typesfail".length;
    const [error, result] = await executor.lintSql({ sql });

    expect(error).toBeNull();
    expect(begin).toHaveBeenCalledTimes(2);
    expect(result?.diagnostics).toEqual([
      expect.objectContaining({
        code: "42P01",
        from: relationFrom,
        message: 'relation "public.all_data_typesfail" does not exist',
        to: relationTo,
      }),
    ]);
  });
});
