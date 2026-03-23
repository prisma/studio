import { MySQL, PostgreSQL, SQLite } from "@codemirror/lang-sql";
import { describe, expect, it } from "vitest";

import {
  getCodeMirrorDialect,
  toCodeMirrorSqlNamespace,
} from "./sql-editor-config";

describe("sql-editor-config", () => {
  it("maps adapter dialects to codemirror SQL dialects", () => {
    expect(getCodeMirrorDialect("postgresql")).toBe(PostgreSQL);
    expect(getCodeMirrorDialect("mysql")).toBe(MySQL);
    expect(getCodeMirrorDialect("sqlite")).toBe(SQLite);
    expect(getCodeMirrorDialect(undefined)).toBe(PostgreSQL);
  });

  it("normalizes schema namespace deterministically", () => {
    expect(
      toCodeMirrorSqlNamespace({
        zoo: {
          animals: ["name", "id"],
        },
        public: {
          users: ["name", "id"],
        },
      }),
    ).toEqual({
      public: {
        users: ["id", "name"],
      },
      zoo: {
        animals: ["id", "name"],
      },
    });
  });
});
