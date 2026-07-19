import type { DataType } from "../../data/adapter";

/**
 * Common SQL spellings for PostgreSQL catalog type names.
 *
 * The catalog (`pg_type.typname`) stores internal names like `int8`, but
 * users generally know these types by the SQL aliases they write in DDL.
 * Short catalog names that are themselves in common use (e.g. `timestamptz`,
 * `varchar`, `numeric`) are intentionally left as-is for readability.
 */
const POSTGRES_DISPLAY_ALIASES: Record<string, string> = {
  bool: "boolean",
  bpchar: "char",
  float4: "real",
  float8: "double precision",
  int2: "smallint",
  int4: "integer",
  int8: "bigint",
};

/**
 * Returns the user-facing spelling of a column datatype name.
 *
 * Only native PostgreSQL catalog types (schema `pg_catalog`) are aliased;
 * user-defined types (enums, composites) and other dialects are displayed
 * unchanged. Array types keep their `[]` suffix around the aliased element
 * type, and the raw catalog array spelling (leading underscore, e.g.
 * `_int8`) is handled as well.
 *
 * Display-only: never use the returned value for type logic or SQL.
 */
export function formatDatatypeName(
  datatype: Pick<DataType, "name" | "schema">,
): string {
  const { name, schema } = datatype;

  if (schema !== "pg_catalog") {
    return name;
  }

  let base = name;
  let isArray = false;

  if (base.endsWith("[]")) {
    isArray = true;
    base = base.slice(0, -2);
  } else if (base.startsWith("_")) {
    isArray = true;
    base = base.slice(1);
  }

  const alias = POSTGRES_DISPLAY_ALIASES[base];

  if (!alias) {
    return name;
  }

  return isArray ? `${alias}[]` : alias;
}
