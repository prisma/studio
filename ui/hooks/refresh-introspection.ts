import type { QueryClient } from "@tanstack/react-query";

import { isPostgresTypeMismatchError } from "../../data/postgres-core/postgres-error";

/**
 * Stable React Query key for the introspection query.
 *
 * The manual "refresh schema" action, the write-error self-heal path, and any
 * future invalidation all go through this key so there is a single place that
 * owns the cache identity of the DB schema.
 */
export const INTROSPECTION_QUERY_KEY: ["introspection"] = ["introspection"];

/**
 * Invalidate cached introspection and trigger a refetch of any active
 * introspection query.
 *
 * This is the single shared mechanism used by:
 * - the manual "refresh schema" button (via `useIntrospection().refreshSchema`)
 * - the write-error self-heal path (via {@link selfHealOnWriteError})
 *
 * `invalidateQueries` marks the query stale and refetches active observers,
 * so the editor re-renders with the freshly introspected column types.
 */
export async function refreshIntrospection(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: INTROSPECTION_QUERY_KEY,
    refetchType: "active",
  });
}

/**
 * Inspect a row-write (insert/update) error and, when it indicates the column
 * type Studio cached no longer matches the live database schema, invalidate
 * cached introspection so the cell editor re-renders with the correct type.
 *
 * The original error is NOT swallowed: callers still surface it to the user
 * (e.g. via `studio_operation_error`). This helper only additionally triggers
 * a background introspection refetch on Postgres SQLSTATE `42804`
 * (`datatype_mismatch`) or `22P02` (`invalid_text_representation`).
 */
export function selfHealOnWriteError(args: {
  error: unknown;
  queryClient: QueryClient;
}): void {
  if (isPostgresTypeMismatchError(args.error)) {
    void refreshIntrospection(args.queryClient);
  }
}
