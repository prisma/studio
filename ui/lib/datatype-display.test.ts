import { describe, expect, it } from "vitest";

import { formatDatatypeName } from "./datatype-display";

/**
 * Acceptance criteria for displaying PostgreSQL datatype aliases
 * (https://github.com/prisma/studio/issues/1416):
 *
 * 1. Native PostgreSQL catalog names are displayed as their common SQL
 *    aliases (int8 -> bigint, int4 -> integer, int2 -> smallint,
 *    float8 -> double precision, float4 -> real, bool -> boolean,
 *    bpchar -> char).
 * 2. Array types keep the `[]` suffix around the aliased element type
 *    (int8[] -> bigint[]); the raw catalog spelling `_int8` is also handled.
 * 3. Catalog names that are already in common use (timestamptz, varchar,
 *    text, numeric, ...) are displayed unchanged.
 * 4. User-defined types and non-Postgres dialects (datatype schema other
 *    than `pg_catalog`) are displayed unchanged, even if their name
 *    collides with a catalog name.
 * 5. The mapping is display-only: it lives in the UI layer and does not
 *    alter the datatype metadata used for filtering, editing, or SQL.
 */
describe("formatDatatypeName", () => {
  it.each([
    { name: "int8", expected: "bigint" },
    { name: "int4", expected: "integer" },
    { name: "int2", expected: "smallint" },
    { name: "float8", expected: "double precision" },
    { name: "float4", expected: "real" },
    { name: "bool", expected: "boolean" },
    { name: "bpchar", expected: "char" },
  ])(
    "aliases the native catalog name $name to $expected",
    ({ name, expected }) => {
      expect(formatDatatypeName({ name, schema: "pg_catalog" })).toBe(expected);
    },
  );

  it.each([
    { name: "int8[]", expected: "bigint[]" },
    { name: "float4[]", expected: "real[]" },
    { name: "_int8", expected: "bigint[]" },
    { name: "text[]", expected: "text[]" },
  ])("handles the array type $name as $expected", ({ name, expected }) => {
    expect(formatDatatypeName({ name, schema: "pg_catalog" })).toBe(expected);
  });

  it.each([
    "timestamptz",
    "timetz",
    "timestamp",
    "varchar",
    "text",
    "numeric",
    "uuid",
    "jsonb",
    "date",
  ])("keeps the commonly used catalog name %s unchanged", (name) => {
    expect(formatDatatypeName({ name, schema: "pg_catalog" })).toBe(name);
  });

  it("keeps user-defined types unchanged, even on a name collision", () => {
    expect(formatDatatypeName({ name: "int8", schema: "public" })).toBe("int8");
    expect(formatDatatypeName({ name: "mood", schema: "public" })).toBe("mood");
  });

  it("keeps non-Postgres dialect types unchanged", () => {
    // MySQL and SQLite adapters set the datatype schema to the table
    // schema (e.g. the database name or `main`), never `pg_catalog`.
    expect(formatDatatypeName({ name: "bigint", schema: "mydb" })).toBe(
      "bigint",
    );
    expect(formatDatatypeName({ name: "INT8", schema: "main" })).toBe("INT8");
  });
});
