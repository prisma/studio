import { describe, expect, it, vi } from "vitest";

import type { Executor } from "../executor";
import {
  createLintDiagnosticsFromSQLiteError,
  lintSQLiteWithExplainFallback,
} from "./sql-lint";

describe("sqlite-core/sql-lint", () => {
  it("maps missing-table diagnostics to token ranges", () => {
    const sql = "select * from main.missing_table";
    const diagnostics = createLintDiagnosticsFromSQLiteError({
      error: new Error("no such table: main.missing_table"),
      sql,
    });

    expect(diagnostics).toEqual([
      {
        code: undefined,
        from: sql.indexOf("main.missing_table"),
        message: "no such table: main.missing_table",
        severity: "error",
        source: "sqlite",
        to: sql.indexOf("main.missing_table") + "main.missing_table".length,
      },
    ]);
  });

  it("maps near-token syntax errors to token ranges", () => {
    const sql = "select * form organizations";
    const diagnostics = createLintDiagnosticsFromSQLiteError({
      error: new Error('near "form": syntax error'),
      sql,
    });

    expect(diagnostics).toEqual([
      {
        code: undefined,
        from: sql.indexOf("form"),
        message: 'near "form": syntax error',
        severity: "error",
        source: "sqlite",
        to: sql.indexOf("form") + "form".length,
      },
    ]);
  });

  it("returns validation diagnostics for invalid SQL without hitting the executor", async () => {
    const execute = vi.fn<Executor["execute"]>(() => {
      return Promise.resolve([null, [] as never]);
    });

    const [error, result] = await lintSQLiteWithExplainFallback(
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
