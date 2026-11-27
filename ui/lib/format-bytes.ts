import type { DataType } from "../../data/adapter";

/**
 * Bytes shown in a grid cell before the value is cut short. Copy always uses
 * the full value.
 */
export const BYTES_DISPLAY_LIMIT = 64;

// Binary column types per dialect. "char binary"/"varchar binary" are text with
// a binary collation, so they are deliberately absent.
const BYTES_TYPE_NAMES = new Set([
  // PostgreSQL
  "bytea",
  // MySQL / MariaDB
  "binary",
  "bit",
  "blob",
  "longblob",
  "longvarbinary",
  "mediumblob",
  "tinyblob",
  "varbinary",
]);

export type BytesDataTypeLike = Pick<DataType, "affinity" | "isArray" | "name">;

/** True for binary column types (bytea, the MySQL blob/binary family, SQLite BLOB affinity). */
export function isBytesDataType(datatype: BytesDataTypeLike): boolean {
  if (datatype.isArray) {
    return false;
  }

  if (datatype.affinity === "BLOB") {
    return true;
  }

  return BYTES_TYPE_NAMES.has(datatype.name.toLowerCase());
}

/**
 * Formats a binary value as `\x`-prefixed hex, the way psql shows bytea.
 *
 * Returns `null` unless the column is a bytes type AND the value is bytes:
 * a `Uint8Array`/`ArrayBuffer`, or the JSON a Node `Buffer` (`{type:"Buffer",data}`)
 * or `Uint8Array` (`{"0":…,"1":…}`) becomes on its way through the BFF. A JSON
 * column holding a Buffer-shaped object is never touched.
 *
 * With `maxBytes`, longer values are cut to that many bytes and end in `… (N bytes)`.
 */
export function formatBytesAsHex(
  value: unknown,
  datatype: BytesDataTypeLike,
  options?: { maxBytes?: number },
): string | null {
  if (!isBytesDataType(datatype)) {
    return null;
  }

  const bytes = toBytes(value);

  if (bytes == null) {
    return null;
  }

  const maxBytes = options?.maxBytes;
  const shown =
    maxBytes != null && bytes.length > maxBytes
      ? bytes.subarray(0, maxBytes)
      : bytes;

  let hex = "\\x";

  for (const byte of shown) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return shown === bytes ? hex : `${hex}… (${bytes.length} bytes)`;
}

/** Column datatypes by column id, for copy paths that only see row values. */
export type ColumnDatatypesById = Readonly<
  Record<string, { datatype: BytesDataTypeLike } | undefined>
>;

/** Narrows untyped column `meta` (set to a `Column` by table and SQL views) to one carrying a datatype. */
export function hasColumnDatatype(
  meta: unknown,
): meta is { datatype: BytesDataTypeLike } {
  if (typeof meta !== "object" || meta === null || !("datatype" in meta)) {
    return false;
  }

  const { datatype } = meta;

  return (
    typeof datatype === "object" &&
    datatype !== null &&
    "name" in datatype &&
    typeof datatype.name === "string"
  );
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  // JSON of a Node Buffer: exactly { type: "Buffer", data: number[] }.
  if (
    keys.length === 2 &&
    record.type === "Buffer" &&
    Array.isArray(record.data) &&
    record.data.every(isByte)
  ) {
    return Uint8Array.from(record.data as number[]);
  }

  // JSON of a Uint8Array: { "0": n, "1": n, … } with consecutive indexes.
  if (
    keys.every((key, index) => key === String(index) && isByte(record[key]))
  ) {
    return Uint8Array.from(keys.map((key) => record[key] as number));
  }

  return null;
}

function isByte(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255
  );
}
