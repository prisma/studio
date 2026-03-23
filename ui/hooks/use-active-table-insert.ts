import { useMutation } from "@tanstack/react-query";

import { useStudio } from "../studio/context";
import { useActiveTableRowsCollection } from "./use-active-table-rows-collection";
import { useFiltering } from "./use-filtering";
import { usePagination } from "./use-pagination";
import { useSorting } from "./use-sorting";
import { addRowIdToResult } from "./utils/add-row-id-to-result";

export function useActiveTableInsert() {
  const { adapter, onEvent } = useStudio();
  const { paginationState } = usePagination();
  const { sortingState } = useSorting();
  const { appliedFilter } = useFiltering();
  const { activeTable, refetch } = useActiveTableRowsCollection({
    pageIndex: paginationState.pageIndex,
    pageSize: paginationState.pageSize,
    sortOrder: sortingState,
    filter: appliedFilter,
  });
  const { schema = null, name: table = null } = activeTable ?? {};

  return useMutation({
    mutationKey: ["schema", schema, "table", table, "insert"],
    async mutationFn(rows: Record<string, unknown>[]) {
      if (!activeTable) {
        throw new Error("Active table is not available");
      }

      const [error, result] = await adapter.insert(
        { rows, table: activeTable },
        {},
      );

      if (error) {
        onEvent({
          name: "studio_operation_error",
          payload: {
            operation: "insert",
            query: error.query,
            error,
          },
        });

        throw error;
      }

      onEvent({
        name: "studio_operation_success",
        payload: {
          operation: "insert",
          query: result.query,
          error: undefined,
        },
      });

      return addRowIdToResult(result, activeTable);
    },
    async onSuccess() {
      await refetch();
    },
    retry: false,
  });
}
