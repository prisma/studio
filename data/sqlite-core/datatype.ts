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
