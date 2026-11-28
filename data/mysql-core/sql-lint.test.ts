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

describe("mysql-core/sql-lint token ranges", () => {
  it("marks the missing table as a whole word, not inside a comment or longer name", () => {
    const sql =
      "-- orders report\nselect * from orders_archive join orders using (id)";
    const [diagnostic] = createLintDiagnosticsFromMySQLError({
      error: new Error("Table 'studio.orders' doesn't exist"),
      sql,
    });
    const from = sql.lastIndexOf("orders");

    expect(diagnostic).toMatchObject({ from, to: from + "orders".length });
  });

  it("reads backslash-escaped quotes as part of the string", () => {
    const sql = "SELECT 'it\\'s' FROM missing_table";
    const [diagnostic] = createLintDiagnosticsFromMySQLError({
      error: new Error("Table 'studio.missing_table' doesn't exist"),
      sql,
    });
    const from = sql.indexOf("missing_table");

    expect(diagnostic).toMatchObject({
      from,
      to: from + "missing_table".length,
    });
  });

  it("marks the table name when its qualifier is quoted", () => {
    const sql = "select * from `studio`.orders";
    const [diagnostic] = createLintDiagnosticsFromMySQLError({
      error: new Error("Table 'studio.orders' doesn't exist"),
      sql,
    });
    const from = sql.lastIndexOf("orders");

    expect(diagnostic).toMatchObject({ from, to: from + "orders".length });
  });

  it("does not treat comment markers inside a backtick identifier as a comment", () => {
    const sql = "select 1 as `a--b` from missing_table";
    const [diagnostic] = createLintDiagnosticsFromMySQLError({
      error: new Error("Table 'studio.missing_table' doesn't exist"),
      sql,
    });
    const from = sql.indexOf("missing_table");

    expect(diagnostic).toMatchObject({
      from,
      to: from + "missing_table".length,
    });
  });

  it("reads double-quoted text as a string literal", () => {
    const sql = "SELECT \"'missing_table'\" FROM missing_table";
    const [diagnostic] = createLintDiagnosticsFromMySQLError({
      error: new Error("Table 'studio.missing_table' doesn't exist"),
      sql,
    });
    const from = sql.lastIndexOf("missing_table");

    expect(diagnostic).toMatchObject({
      from,
      to: from + "missing_table".length,
    });
  });

  it("marks a syntax-error fragment that contains a whole quoted identifier", () => {
    const sql = "SELECT id, * FROM `users`";
    const fragment = "* FROM `users`";
    const [diagnostic] = createLintDiagnosticsFromMySQLError({
      error: new Error(
        `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${fragment}' at line 1`,
      ),
      sql,
    });
    const from = sql.indexOf(fragment);

    expect(diagnostic).toMatchObject({ from, to: from + fragment.length });
  });
});
