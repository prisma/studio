import { useCallback, useEffect, useState } from "react";

import { AdapterError } from "../../data/adapter";

export interface UseTableReloadArgs {
  /**
   * Refetches the active table's rows collection. Rejections (the collection
   * refetches with `throwOnError: true`) are captured as `reloadError`.
   */
  refetchActiveTable: () => Promise<unknown>;

  /**
   * Re-introspects the database schema. Runs before the rows refetch so a
   * refresh picks up schema changes before reloading rows.
   */
  refetchIntrospection: () => Promise<unknown>;

  /**
   * Identity of the query scope the reload applies to. When it changes (the
   * user pages, sorts, filters, or switches tables), any stale reload error
   * is cleared.
   */
  resetKey: string | undefined;
}

export interface UseTableReloadResult {
  reload: () => Promise<void>;
  reloadError: AdapterError | null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function resolveReloadError(error: unknown): AdapterError {
  if (error instanceof AdapterError) {
    return error;
  }

  if (error instanceof Error) {
    return new AdapterError(error.message);
  }

  return new AdapterError("Table refresh failed");
}

/**
 * Orchestrates the "Refresh table" action: schema introspection first, then
 * the active table's rows. Rejections are captured so a failed refresh
 * surfaces as `reloadError` (rendered inline by the view) instead of being
 * dropped by `void reload()` call sites. `AbortError` rejections are expected
 * churn from superseded queries and are ignored.
 *
 * This hook keeps no local busy boolean: the busy state for a table refresh
 * already exists as `isFetching || isIntrospectionRefetching` in the view (see
 * `Architecture/db-state.md`).
 */
export function useTableReload(args: UseTableReloadArgs): UseTableReloadResult {
  const { refetchActiveTable, refetchIntrospection, resetKey } = args;
  const [reloadError, setReloadError] = useState<AdapterError | null>(null);

  const reload = useCallback(async () => {
    try {
      await refetchIntrospection();
      await refetchActiveTable();
      setReloadError(null);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setReloadError(resolveReloadError(error));
    }
  }, [refetchActiveTable, refetchIntrospection]);

  useEffect(() => {
    setReloadError(null);
  }, [resetKey]);

  return { reload, reloadError };
}
