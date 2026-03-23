import { useMutation } from "@tanstack/react-query";

import { useActiveTableRowsCollection } from "./use-active-table-rows-collection";
import { useFiltering } from "./use-filtering";
import { usePagination } from "./use-pagination";
import { useSorting } from "./use-sorting";

export interface UseActiveTableUpdateManyParams {
  updates: Array<{
    changes: Record<string, unknown>;
    row: Record<string, unknown>;
  }>;
}

export function useActiveTableUpdateMany() {
  const { paginationState } = usePagination();
  const { sortingState } = useSorting();
  const { appliedFilter } = useFiltering();
  const { activeTable, collection } = useActiveTableRowsCollection({
    pageIndex: paginationState.pageIndex,
    pageSize: paginationState.pageSize,
    sortOrder: sortingState,
    filter: appliedFilter,
  });
  const queryKeyPrefix = [
    "schema",
    activeTable?.schema ?? null,
    "table",
    activeTable?.name ?? null,
  ] as const;

  return useMutation({
    mutationFn: async (params: UseActiveTableUpdateManyParams) => {
      if (!collection || !activeTable || params.updates.length === 0) {
        throw new Error("Active table collection is not available");
      }

      const rowIds = params.updates.map((update) =>
        String(update.row.__ps_rowid ?? ""),
      );

      if (rowIds.some((rowId) => rowId.length === 0)) {
        throw new Error("Active table collection is not available");
      }

      const transaction = collection.update(rowIds, (drafts) => {
        drafts.forEach((draft, index) => {
          Object.assign(draft, params.updates[index]?.changes ?? {});
        });
      });

      await transaction.isPersisted.promise;

      return {
        rows: rowIds.map((rowId) => collection.get(rowId)),
      };
    },
    mutationKey: [...queryKeyPrefix, "update-many"],
    retry: false,
  });
}
