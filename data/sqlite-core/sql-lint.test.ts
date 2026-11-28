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

describe("sqlite-core/sql-lint token ranges", () => {
  it("marks the missing table as a whole word, not inside a comment or longer name", () => {
    const sql =
      "-- orders report\nselect * from orders_archive join orders using (id)";
    const [diagnostic] = createLintDiagnosticsFromSQLiteError({
      error: new Error("no such table: orders"),
      sql,
    });
    const from = sql.lastIndexOf("orders");

    expect(diagnostic).toMatchObject({ from, to: from + "orders".length });
  });

  it("marks the table name when its qualifier is quoted", () => {
    const sql = 'select * from "main".missing_table';
    const [diagnostic] = createLintDiagnosticsFromSQLiteError({
      error: new Error("no such table: main.missing_table"),
      sql,
    });
    const from = sql.indexOf("missing_table");

    expect(diagnostic).toMatchObject({
      from,
      to: from + "missing_table".length,
    });
  });
});
