import { useMutation } from "@tanstack/react-query";

import { useActiveTableRowsCollection } from "./use-active-table-rows-collection";
import { useFiltering } from "./use-filtering";
import { usePagination } from "./use-pagination";
import { useSorting } from "./use-sorting";

export function useActiveTableDelete() {
  const { paginationState } = usePagination();
  const { sortingState } = useSorting();
  const { appliedFilter } = useFiltering();
  const { activeTable, collection, refetch } = useActiveTableRowsCollection({
    pageIndex: paginationState.pageIndex,
    pageSize: paginationState.pageSize,
    sortOrder: sortingState,
    filter: appliedFilter,
  });
  const { schema = null, name: table = null } = activeTable ?? {};

  return useMutation({
    mutationKey: ["schema", schema, "table", table, "delete"],
    async mutationFn(rows: Record<string, unknown>[]) {
      if (!collection || !activeTable) {
        throw new Error("Active table collection is not available");
      }

      const rowIds = rows
        .map((row) => String(row.__ps_rowid ?? ""))
        .filter((rowId) => rowId.length > 0);

      if (rowIds.length === 0) {
        return {
          rows: [],
        };
      }

      const transaction = collection.delete(rowIds);
      await transaction.isPersisted.promise;
      await refetch();

      return {
        rows,
      };
    },
    retry: false,
  });
}
