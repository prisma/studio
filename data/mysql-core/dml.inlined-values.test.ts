import { describe, expect, it } from "vitest";

import { mockIntrospect } from "./adapter";
import { getInsertQuery, getUpdateQuery } from "./dml";

// MySQL treats a backslash inside a string literal as an escape character
// (unless NO_BACKSLASH_ESCAPES is set). When `noParameters` inlines values into
// the SQL text, a value ending in a backslash must not be able to escape the
// closing quote. See GHSA-8cpq-38p9-67gx / CVE-2026-33468.
const INJECTION_PAYLOAD = "\\' or 1=1 -- ";

describe("mysql-core/dml inlined values (noParameters)", () => {
  const table = mockIntrospect().schemas.studio.tables.users;

  it("escapes backslashes in inlined update values", () => {
    const query = getUpdateQuery(
      {
        changes: { name: INJECTION_PAYLOAD },
        row: { id: 1 },
        table,
      },
      { noParameters: true },
    );

    expect(query.parameters).toEqual([]);
    expect(query.sql).toBe(
      "update `studio`.`users` set `name` = '\\\\'' or 1=1 -- ' where `id` = 1",
    );
  });

  it("escapes backslashes in inlined insert values", () => {
    const query = getInsertQuery(
      {
        rows: [{ id: 2, name: INJECTION_PAYLOAD }],
        table,
      },
      { noParameters: true },
    );

    expect(query.parameters).toEqual([]);
    expect(query.sql).toContain("'\\\\'' or 1=1 -- '");
    expect(query.sql).not.toMatch(/[^\\]\\'' or 1=1/);
  });
});
