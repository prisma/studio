import type { AdapterError } from "../adapter";

/**
 * PostgreSQL SQLSTATE `datatype_mismatch`.
 *
 * Raised when an INSERT/UPDATE supplies a value whose type does not match
 * the column's current type and Postgres cannot coerce it.
 */
export const POSTGRES_DATATYPE_MISMATCH_CODE = "42804";

/**
 * PostgreSQL SQLSTATE `invalid_text_representation`.
 *
 * Raised when a text value cannot be parsed into the target type, e.g. the
 * editor sent `"true"`/`true` for a column whose live type is no longer
 * boolean and the value cannot be cast.
 */
export const POSTGRES_INVALID_TEXT_REPRESENTATION_CODE = "22P02";

const TYPE_MISMATCH_SQLSTATES = new Set<string>([
  POSTGRES_DATATYPE_MISMATCH_CODE,
  POSTGRES_INVALID_TEXT_REPRESENTATION_CODE,
]);

/**
 * Returns the PostgreSQL SQLSTATE code carried on an error, if any.
 *
 * Postgres drivers (e.g. `postgres`) attach the server's `SqlState` as a
 * string `code` property on the thrown/rejected error. `createAdapterError`
 * mutates that same error object to add `adapterSource`/`query`, so the code
 * survives onto the `AdapterError` that reaches mutation handlers. This
 * mirrors the shape already read by lint diagnostics
 * (`getPostgresErrorCode` in `./sql-lint`).
 */
export function getPostgresErrorCode(error: unknown): string | undefined {
  if (
    error == null ||
    (typeof error !== "object" && typeof error !== "function")
  ) {
    return undefined;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : undefined;
}

/**
 * Whether a write error is a PostgreSQL type-mismatch that warrants
 * invalidating cached introspection so the cell editor re-renders with the
 * correct column type.
 *
 * Used by the write-error self-heal path in the row mutation hooks. This only
 * inspects the error; callers MUST still surface the original error to the
 * user (e.g. via `studio_operation_error`).
 */
export function isPostgresTypeMismatchError(error: unknown): boolean {
  const code = getPostgresErrorCode(error);
  return code != null && TYPE_MISMATCH_SQLSTATES.has(code);
}

/**
 * Type helper for documentation: the error reaching mutation handlers is an
 * `AdapterError` carrying the driver's SQLSTATE `code`.
 */
export type PostgresWriteError = AdapterError & { code?: string };
