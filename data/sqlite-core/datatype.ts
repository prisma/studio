import type { DataType } from "../adapter";

export type SQLiteAffinity =
  | "BLOB"
  | "INTEGER"
  | "NULL"
  | "NUMERIC"
  | "REAL"
  | "TEXT";

export const SQLITE_AFFINITY_TO_METADATA: Record<
  SQLiteAffinity,
  Pick<DataType, "format" | "group">
> = {
  BLOB: {
    group: "raw",
  },
  INTEGER: {
    group: "numeric",
  },
  NULL: {
    group: "raw",
  },
  NUMERIC: {
    group: "numeric",
  },
  REAL: {
    group: "numeric",
  },
  TEXT: {
    group: "string",
  },
};

/**
 * Declared types like `date`, `datetime`, or `timestamp` fall through SQLite's
 * affinity rules to NUMERIC, but their stored values are date/time strings.
 */
const DATE_LIKE_DECLARED_TYPE_REGEX = /DATE|TIME/;

/**
 * Resolves the affinity and Studio datatype metadata for a declared type.
 *
 * Date-like declared types (`date`, `datetime`, `timestamp`, ...) keep their
 * NUMERIC affinity but are grouped as strings: their values are date/time
 * text, and treating them as numbers would coerce edits to `NaN`.
 */
export function determineColumnMetadata(
  declaredDataType: string | null,
): Pick<DataType, "format" | "group"> & { affinity: SQLiteAffinity } {
  const affinity = determineColumnAffinity(declaredDataType);

  if (
    affinity === "NUMERIC" &&
    declaredDataType &&
    DATE_LIKE_DECLARED_TYPE_REGEX.test(declaredDataType.toUpperCase())
  ) {
    return { affinity, group: "string" };
  }

  return { affinity, ...SQLITE_AFFINITY_TO_METADATA[affinity] };
}

/**
 * https://sqlite.org/datatype3.html#determination_of_column_affinity
 *
 * DO NOT CHANGE THE ORDER OF THE CHECKS IN THIS FUNCTION!
 */
export function determineColumnAffinity(
  declaredDataType: string | null,
): SQLiteAffinity {
  if (!declaredDataType) {
    return "BLOB";
  }

  const upperType = declaredDataType.toUpperCase();

  if (upperType.includes("INT")) {
    return "INTEGER";
  }

  if (
    upperType.includes("TEXT") ||
    upperType.includes("CHAR") ||
    upperType.includes("CLOB")
  ) {
    return "TEXT";
  }

  if (upperType.includes("BLOB")) {
    return "BLOB";
  }

  if (
    upperType.includes("REAL") ||
    upperType.includes("FLOA") ||
    upperType.includes("DOUB")
  ) {
    return "REAL";
  }

  return "NUMERIC";
}
