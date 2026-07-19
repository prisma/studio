import { useMutation } from "@tanstack/react-query";

import {
  useActiveTableQueryCollection,
  type UseActiveTableQueryProps,
} from "./use-active-table-query";

// Persistence is delegated to the rows collection's `onUpdate` handler, which
// owns the `adapter.update` call. There is intentionally no per-call
// `AdapterUpdateOptions` channel here: options passed at this level could not
// reach the adapter and would be silently ignored.
export interface UseActiveTableUpdateParams {
  changes: Record<string, unknown>;
  row: Record<string, unknown>;
}

export function useActiveTableUpdate(query: UseActiveTableQueryProps) {
  const { activeTable, collection } = useActiveTableQueryCollection(query);
  const queryKeyPrefix = [
    "schema",
    activeTable?.schema ?? null,
    "table",
    activeTable?.name ?? null,
  ] as const;

  return useMutation({
    mutationFn: async (params: UseActiveTableUpdateParams) => {
      const rowId = String(params.row.__ps_rowid ?? "");

      if (!collection || !activeTable || !rowId) {
        throw new Error("Active table collection is not available");
      }

      const transaction = collection.update(rowId, (draft) => {
        Object.assign(draft, params.changes);
      });

      await transaction.isPersisted.promise;

      return {
        row: collection.get(rowId),
      };
    },
    mutationKey: [...queryKeyPrefix, "update"],
    retry: false,
  });
}
