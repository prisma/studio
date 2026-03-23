import { describe, expect, it, vi } from "vitest";

import type { Executor } from "../executor";
import {
  createLintDiagnosticsFromMySQLError,
  lintMySQLWithExplainFallback,
} from "./sql-lint";

describe("mysql-core/sql-lint", () => {
  it("maps missing-table diagnostics to token ranges", () => {
    const sql = "select * from missing_table";
    const diagnostics = createLintDiagnosticsFromMySQLError({
      error: new Error("Table 'studio.missing_table' doesn't exist"),
      sql,
    });

    expect(diagnostics).toEqual([
      {
        code: undefined,
        from: sql.indexOf("missing_table"),
        message: "Table 'studio.missing_table' doesn't exist",
        severity: "error",
        source: "mysql",
        to: sql.indexOf("missing_table") + "missing_table".length,
      },
    ]);
  });

  it("rewrites timeout diagnostics to user-friendly lint timeout message", () => {
    const error = new Error(
      "maximum statement execution time exceeded",
    ) as Error & {
      code?: string;
    };
    error.code = "ER_QUERY_TIMEOUT";

    const diagnostics = createLintDiagnosticsFromMySQLError({
      error,
      sql: "select * from organizations",
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "ER_QUERY_TIMEOUT",
        message: "Lint query timed out. Simplify the statement and try again.",
        source: "mysql",
      }),
    ]);
  });

  it("returns validation diagnostics for invalid SQL without hitting the executor", async () => {
    const execute = vi.fn<Executor["execute"]>(() => {
      return Promise.resolve([null, [] as never]);
    });

    const [error, result] = await lintMySQLWithExplainFallback(
      {
        execute,
      } as Executor,
      { sql: "   " },
      { abortSignal: new AbortController().signal },
    );

    expect(error).toBeNull();
    expect(result?.diagnostics).toEqual([
      expect.objectContaining({
        message: "Type a SQL statement to lint.",
        severity: "info",
      }),
    ]);
    expect(execute).not.toHaveBeenCalled();
  });
});
