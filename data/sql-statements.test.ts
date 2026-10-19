import { describe, expect, it } from "vitest";

import {
  getTopLevelSqlStatementAtCursor,
  splitTopLevelSqlStatements,
} from "./sql-statements";

describe("data/sql-statements", () => {
  it("splits top-level SQL statements while ignoring quoted/commented semicolons", () => {
    const sql = `
      select ';' as quoted, $$a;b$$ as dollar;
      -- ; in comment
      select 2;
      /* ; in block */
      select 3
    `;

    expect(
      splitTopLevelSqlStatements(sql).map((segment) => segment.statement),
    ).toEqual([
      "select ';' as quoted, $$a;b$$ as dollar",
      "-- ; in comment\n      select 2",
      "/* ; in block */\n      select 3",
    ]);
  });

  it("returns statement under cursor for multi-statement input", () => {
    const sql = "select 1;\nselect 2;\nselect 3";
    const cursorInSecondStatement = sql.indexOf("2");

    expect(
      getTopLevelSqlStatementAtCursor({
        cursorIndex: cursorInSecondStatement,
        sql,
      })?.statement,
    ).toBe("select 2");
  });

  it("picks nearest statement when cursor is in separator whitespace", () => {
    const sql = "select 1;\n\nselect 2";
    const cursorBetween = sql.indexOf("\n\n") + 1;

    expect(
      getTopLevelSqlStatementAtCursor({
        cursorIndex: cursorBetween,
        sql,
      })?.statement,
    ).toBe("select 2");
  });

  it("respects MySQL backslash escapes, backtick identifiers, and hash comments", () => {
    const sql = String.raw`
      select 'O\'Brien; x' as name, "say \"hi\";" as quote;
      select 1 as ${"`"}a;b${"`"};
      # don't split here;
      select 2
    `;

    expect(
      splitTopLevelSqlStatements(sql, { dialect: "mysql" }).map(
        (segment) => segment.statement,
      ),
    ).toEqual([
      String.raw`select 'O\'Brien; x' as name, "say \"hi\";" as quote`,
      "select 1 as `a;b`",
      "# don't split here;\n      select 2",
    ]);
  });

  it("keeps standard string quoting for PostgreSQL and SQLite", () => {
    const sql = String.raw`select 'C:\'; select 2`;

    for (const dialect of ["postgresql", "sqlite"] as const) {
      expect(
        splitTopLevelSqlStatements(sql, { dialect }).map(
          (segment) => segment.statement,
        ),
      ).toEqual([String.raw`select 'C:\'`, "select 2"]);
    }
  });

  it("returns only the MySQL statement under the cursor when a string contains an escaped quote", () => {
    const sql = String.raw`select * from users where name = 'O\'Brien';
select 2;`;

    expect(
      getTopLevelSqlStatementAtCursor({
        cursorIndex: 0,
        dialect: "mysql",
        sql,
      })?.statement,
    ).toBe(String.raw`select * from users where name = 'O\'Brien'`);
  });
});
