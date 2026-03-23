import { describe, expect, it, vi } from "vitest";

import type { AdapterSqlLintResult } from "../adapter";
import type { SequenceExecutor } from "../executor";
import { createMySQLAdapter } from "./adapter";

function createSequenceExecutor(args?: {
  execute?: SequenceExecutor["execute"];
  lintSql?: SequenceExecutor["lintSql"];
}): SequenceExecutor {
  return {
    execute:
      args?.execute ??
      (() => {
        return Promise.resolve([null, [] as never]);
      }),
    executeSequence: vi.fn(),
    ...(args?.lintSql ? { lintSql: args.lintSql } : {}),
  } as SequenceExecutor;
}

describe("mysql-core/adapter sql-editor support", () => {
  it("always reports sql lint capability for mysql adapters", () => {
    const adapter = createMySQLAdapter({
      executor: createSequenceExecutor(),
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
    const executor = createSequenceExecutor({ lintSql });
    const adapter = createMySQLAdapter({ executor });
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
    const execute = vi.fn<SequenceExecutor["execute"]>((query) => {
      if (query.sql.includes("missing_table")) {
        const error = new Error(
          "Table 'studio.missing_table' doesn't exist",
        ) as Error & {
          code?: string;
        };
        error.code = "ER_NO_SUCH_TABLE";

        return Promise.resolve([error] as const);
      }

      return Promise.resolve([null, [] as never] as const);
    });
    const adapter = createMySQLAdapter({
      executor: createSequenceExecutor({
        execute: execute as SequenceExecutor["execute"],
      }),
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
        code: "ER_NO_SUCH_TABLE",
        from: missingFrom,
        message: "Table 'studio.missing_table' doesn't exist",
        severity: "error",
        source: "mysql",
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
    const execute = vi.fn<SequenceExecutor["execute"]>((query) => {
      if (query.sql.includes("missing_table")) {
        return Promise.resolve([
          new Error("Unknown table 'missing_table'"),
        ] as const);
      }

      return Promise.resolve([null, [] as never] as const);
    });
    const adapter = createMySQLAdapter({
      executor: createSequenceExecutor({
        execute: execute as SequenceExecutor["execute"],
        lintSql,
      }),
    });

    const sql = "select 1;\nselect * from missing_table";

    const [error, result] = await adapter.sqlLint!(
      { sql },
      { abortSignal: new AbortController().signal },
    );
    const [secondError] = await adapter.sqlLint!(
      { sql },
      { abortSignal: new AbortController().signal },
    );

    expect(error).toBeNull();
    expect(secondError).toBeNull();
    expect(result?.diagnostics).toEqual([
      expect.objectContaining({
        message: "Unknown table 'missing_table'",
        source: "mysql",
      }),
    ]);
    expect(lintSql).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
