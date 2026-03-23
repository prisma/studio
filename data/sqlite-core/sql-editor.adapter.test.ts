import { describe, expect, it, vi } from "vitest";

import type { AdapterSqlLintResult } from "../adapter";
import type { Executor } from "../executor";
import { createSQLiteAdapter } from "./adapter";

function createExecutor(args?: {
  execute?: Executor["execute"];
  lintSql?: Executor["lintSql"];
}): Executor {
  return {
    execute:
      args?.execute ??
      (() => {
        return Promise.resolve([null, [] as never]);
      }),
    ...(args?.lintSql ? { lintSql: args.lintSql } : {}),
  } as Executor;
}

describe("sqlite-core/adapter sql-editor support", () => {
  it("always reports sql lint capability for sqlite adapters", () => {
    const adapter = createSQLiteAdapter({
      executor: createExecutor(),
    });

    expect(adapter.capabilities?.sqlEditorLint).toBe(true);
  });

  it("delegates sql lint to executor lintSql when available", async () => {
    const lintResult: AdapterSqlLintResult = {
      diagnostics: [
        {
          from: 0,
          message: "bad syntax",
          severity: "error",
          to: 1,
        },
      ],
    };
    const lintSql = vi.fn().mockResolvedValue([null, lintResult]);
    const adapter = createSQLiteAdapter({
      executor: createExecutor({ lintSql }),
    });
    const abortController = new AbortController();

    const [error, result] = await adapter.sqlLint!(
      { sql: "select * from" },
      { abortSignal: abortController.signal },
    );

    expect(error).toBeNull();
    expect(result).toEqual(lintResult);
    expect(lintSql).toHaveBeenCalledWith(
      { sql: "select * from" },
      { abortSignal: abortController.signal },
    );
  });

  it("falls back to EXPLAIN linting when executor has no lintSql method", async () => {
    const execute = vi.fn<Executor["execute"]>((query) => {
      if (query.sql.includes("missing_table")) {
        return Promise.resolve([
          new Error("no such table: missing_table"),
        ] as const);
      }

      return Promise.resolve([null, [] as never] as const);
    });
    const adapter = createSQLiteAdapter({
      executor: createExecutor({ execute: execute as Executor["execute"] }),
    });

    const sql = "select 1;\nselect * from missing_table";
    const missingFrom = sql.indexOf("missing_table");
    const missingTo = missingFrom + "missing_table".length;

    const [error, result] = await adapter.sqlLint!(
      { sql },
      { abortSignal: new AbortController().signal },
    );

    expect(error).toBeNull();
    expect(result?.diagnostics).toEqual([
      {
        code: undefined,
        from: missingFrom,
        message: "no such table: missing_table",
        severity: "error",
        source: "sqlite",
        to: missingTo,
      },
    ]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sql: "EXPLAIN select 1" }),
      expect.any(Object),
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sql: "EXPLAIN select * from missing_table" }),
      expect.any(Object),
    );
  });

  it("falls back to EXPLAIN linting when lint procedure is unsupported", async () => {
    const lintSql = vi.fn().mockResolvedValue([new Error("Invalid procedure")]);
    const execute = vi.fn<Executor["execute"]>((query) => {
      if (query.sql.includes("missing_table")) {
        return Promise.resolve([
          new Error("no such table: missing_table"),
        ] as const);
      }

      return Promise.resolve([null, [] as never] as const);
    });
    const adapter = createSQLiteAdapter({
      executor: createExecutor({
        execute: execute as Executor["execute"],
        lintSql,
      }),
    });

    const [error, result] = await adapter.sqlLint!(
      { sql: "select 1;\nselect * from missing_table" },
      { abortSignal: new AbortController().signal },
    );
    const [secondError] = await adapter.sqlLint!(
      { sql: "select 1;\nselect * from missing_table" },
      { abortSignal: new AbortController().signal },
    );

    expect(error).toBeNull();
    expect(secondError).toBeNull();
    expect(result?.diagnostics).toEqual([
      expect.objectContaining({
        message: "no such table: missing_table",
        source: "sqlite",
      }),
    ]);
    expect(lintSql).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
