import { describe, expect, it } from "vitest";

import { mockIntrospect } from "./adapter";
import { getUpdateQuery } from "./dml";

describe("mysql-core/dml nullability", () => {
  it("compiles nullable datetime updates to SQL NULL literals", () => {
    const table = mockIntrospect().schemas.studio.tables.users;

    const query = getUpdateQuery({
      changes: { created_at: null },
      row: { id: 201 },
      table,
    });

    expect(query.sql).toBe(
      "update `studio`.`users` set `created_at` = null where `id` = ?",
    );
    expect(query.parameters).toEqual([201]);
  });
});
