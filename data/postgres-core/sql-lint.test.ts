import { describe, expect, it } from "vitest";

import {
  createLintDiagnosticsFromPostgresError,
  SQL_LINT_MAX_LENGTH,
  validateSqlForLint,
} from "./sql-lint";

describe("postgres-core/sql-lint", () => {
  it("accepts a single top-level statement", () => {
    const result = validateSqlForLint("select * from users;");

    expect(result).toMatchObject({
      ok: true,
      statements: [
        {
          from: 0,
          statement: "select * from users",
        },
      ],
    });
  });

  it("accepts semicolons in strings/comments/dollar quotes", () => {
    const sql = `
      select ';' as quoted, $$foo;bar$$ as dollar
      -- ; line comment
      /* ; block comment */
      from users;
    `;
    const result = validateSqlForLint(sql);

    expect(result).toMatchObject({
      ok: true,
    });
    if (result.ok) {
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0]?.statement).toContain("$$foo;bar$$");
      expect(result.statements[0]?.statement).toContain("from users");
    }
  });

  it("accepts multi-statement input", () => {
    const result = validateSqlForLint("select 1; select 2;");

    expect(result).toMatchObject({
      ok: true,
    });
    if (result.ok) {
      expect(result.statements.map((statement) => statement.statement)).toEqual(
        ["select 1", "select 2"],
      );
    }
  });

  it("rejects unsupported statements", () => {
    const result = validateSqlForLint("create table nope(id int)");

    expect(result).toMatchObject({
      ok: false,
      diagnostic: {
        message:
          "SQL lint supports SELECT, WITH, VALUES, INSERT, UPDATE, and DELETE statements.",
      },
    });
  });

  it("rejects unsupported statements in multi-statement SQL at the right offset", () => {
    const sql = "select 1;\ncreate table nope(id int)";
    const result = validateSqlForLint(sql);

    expect(result).toMatchObject({
      ok: false,
      diagnostic: {
        from: sql.indexOf("create table"),
        message:
          "SQL lint supports SELECT, WITH, VALUES, INSERT, UPDATE, and DELETE statements.",
      },
    });
  });

  it("rejects oversized SQL", () => {
    const result = validateSqlForLint("x".repeat(SQL_LINT_MAX_LENGTH + 1));

    expect(result).toMatchObject({
      ok: false,
      diagnostic: {
        message: `SQL lint limit exceeded (${SQL_LINT_MAX_LENGTH} characters).`,
      },
    });
  });

  it("maps postgres error metadata to editor diagnostics", () => {
    const error = Object.assign(
      new Error('relation "missing" does not exist'),
      {
        code: "42P01",
        position: "15",
        severity: "ERROR",
      },
    );

    expect(
      createLintDiagnosticsFromPostgresError({
        error,
        sql: "select * from missing",
      }),
    ).toEqual([
      {
        code: "42P01",
        from: 14,
        message: 'relation "missing" does not exist',
        severity: "error",
        source: "postgres",
        to: 21,
      },
    ]);
  });

  it("rewrites timeout diagnostics to a user-facing message", () => {
    const error = Object.assign(
      new Error("canceling statement due to timeout"),
      {
        code: "57014",
        severity: "ERROR",
      },
    );

    expect(
      createLintDiagnosticsFromPostgresError({
        error,
        sql: "select pg_sleep(10)",
      }),
    ).toEqual([
      {
        code: "57014",
        from: 0,
        message: "Lint query timed out. Simplify the statement and try again.",
        severity: "error",
        source: "postgres",
        to: 6,
      },
    ]);
  });

  it("infers diagnostic range from error message when position is unavailable", () => {
    const error = new Error(
      'relation "public.all_data_typesfail" does not exist',
    );

    expect(
      createLintDiagnosticsFromPostgresError({
        error,
        sql: "select * from public.all_data_typesfail",
      }),
    ).toEqual([
      {
        code: undefined,
        from: 14,
        message: 'relation "public.all_data_typesfail" does not exist',
        severity: "error",
        source: "postgres",
        to: 39,
      },
    ]);
  });

  it("maps statement-relative postgres error positions back to full-sql offsets", () => {
    const error = Object.assign(
      new Error('relation "missing" does not exist'),
      {
        code: "42P01",
        position: "15",
        severity: "ERROR",
      },
    );
    const sql = "select 1;\nselect * from missing";
    const statementOffset = sql.indexOf("select *");

    expect(
      createLintDiagnosticsFromPostgresError({
        error,
        positionOffset: statementOffset,
        sql: "select * from missing",
      }),
    ).toEqual([
      {
        code: "42P01",
        from: statementOffset + 14,
        message: 'relation "missing" does not exist',
        severity: "error",
        source: "postgres",
        to: statementOffset + 21,
      },
    ]);
  });
});

describe("postgres-core/sql-lint comments and positions", () => {
  it("accepts a statement that starts with a line comment and anchors it at the keyword", () => {
    const sql = "-- recent customers\nselect * from users";
    const result = validateSqlForLint(sql);

    expect(result).toMatchObject({
      ok: true,
      statements: [
        { from: sql.indexOf("select"), statement: "select * from users" },
      ],
    });
  });

  it("accepts a statement that starts with block comments", () => {
    const sql = "/* one */ /* two\n */ with x as (select 1) select * from x";
    const result = validateSqlForLint(sql);

    expect(result).toMatchObject({
      ok: true,
      statements: [{ from: sql.indexOf("with") }],
    });
  });

  it("ignores comment-only segments such as a trailing comment", () => {
    const result = validateSqlForLint("select 1;\n-- done");

    expect(result).toMatchObject({
      ok: true,
      statements: [{ from: 0, statement: "select 1" }],
    });
  });

  it("reports a comment-only document as nothing to lint", () => {
    expect(validateSqlForLint("-- just a note")).toMatchObject({
      ok: false,
      diagnostic: { severity: "info" },
    });
  });

  it("removes the EXPLAIN prefix from postgres error positions and spans the identifier", () => {
    const statement = "select * from missing where id = 1";
    const prefix = "EXPLAIN (FORMAT JSON) ";
    // Postgres reports a 1-based position within the query it received.
    const position = String(prefix.length + statement.indexOf("missing") + 1);
    const error = Object.assign(
      new Error('relation "missing" does not exist'),
      { code: "42P01", position, severity: "ERROR" },
    );

    expect(
      createLintDiagnosticsFromPostgresError({
        error,
        positionOffset: 10,
        queryPrefixLength: prefix.length,
        sql: statement,
      }),
    ).toEqual([
      expect.objectContaining({
        from: 10 + statement.indexOf("missing"),
        to: 10 + statement.indexOf("missing") + "missing".length,
      }),
    ]);
  });

  it("matches inferred identifiers as whole words, outside comments", () => {
    const sql =
      "-- uses the orders table\nselect * from orders_archive, orders";
    const error = new Error('relation "orders" does not exist');

    expect(createLintDiagnosticsFromPostgresError({ error, sql })).toEqual([
      expect.objectContaining({
        from: sql.lastIndexOf("orders"),
        to: sql.lastIndexOf("orders") + "orders".length,
      }),
    ]);
  });
});
