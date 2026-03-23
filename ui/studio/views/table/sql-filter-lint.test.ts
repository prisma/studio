import { describe, expect, it } from "vitest";

import {
  buildSqlFilterLintStatement,
  getSqlFilterLintFailureMessage,
} from "./sql-filter-lint";

describe("sql-filter-lint", () => {
  it("builds a full postgres lint statement around the WHERE clause", () => {
    expect(
      buildSqlFilterLintStatement({
        dialect: "postgresql",
        table: {
          name: "users",
          schema: "public",
        },
        whereClause: "WHERE lower(email) like '%abba%'",
      }),
    ).toBe(`select * from "public"."users" where (lower(email) like '%abba%')`);
  });

  it("quotes mysql identifiers with backticks", () => {
    expect(
      buildSqlFilterLintStatement({
        dialect: "mysql",
        table: {
          name: "user`events",
          schema: "tenant`1",
        },
        whereClause: "score > 3",
      }),
    ).toBe("select * from `tenant``1`.`user``events` where (score > 3)");
  });

  it("returns the lint transport error message when linting fails before diagnostics", () => {
    expect(
      getSqlFilterLintFailureMessage({
        lintedSql: 'select * from "public"."users" where (email = 1)',
        result: [new Error("lint unavailable")],
        whereClause: "WHERE email = 1",
      }),
    ).toBe("lint unavailable");
  });

  it("returns the first lint diagnostic message when diagnostics are present", () => {
    expect(
      getSqlFilterLintFailureMessage({
        lintedSql: 'select * from "public"."users" where (email = )',
        result: [
          null,
          {
            diagnostics: [
              {
                from: 12,
                message: 'syntax error at or near ")"',
                severity: "error",
                to: 13,
              },
            ],
          },
        ],
        whereClause: "WHERE email = ",
      }),
    ).toBe('syntax error at or near ")"');
  });

  it("adds a WHERE-clause excerpt to vague end-of-input lint diagnostics", () => {
    const lintedSql =
      'select * from "public"."users" where (lower(name) like (\'%acme%\')';

    expect(
      getSqlFilterLintFailureMessage({
        lintedSql,
        result: [
          null,
          {
            diagnostics: [
              {
                from: lintedSql.length,
                message: "syntax error at end of input",
                severity: "error",
                to: lintedSql.length,
              },
            ],
          },
        ],
        whereClause: "WHERE lower(name) like ('%acme%'",
      }),
    ).toBe(
      "syntax error at end of input. Near: WHERE lower(name) like ('%acme%'",
    );
  });

  it("returns null when lint succeeds cleanly", () => {
    expect(
      getSqlFilterLintFailureMessage({
        lintedSql: 'select * from "public"."users" where (email = 1)',
        result: [
          null,
          {
            diagnostics: [],
          },
        ],
        whereClause: "WHERE email = 1",
      }),
    ).toBeNull();
  });
});
