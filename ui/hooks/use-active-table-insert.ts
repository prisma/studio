import { useMutation } from "@tanstack/react-query";

import { useStudio } from "../studio/context";
import {
  useActiveTableQueryCollection,
  type UseActiveTableQueryProps,
} from "./use-active-table-query";
import { addRowIdToResult } from "./utils/add-row-id-to-result";

export function useActiveTableInsert(query: UseActiveTableQueryProps) {
  const { adapter, onEvent } = useStudio();
  const { activeTable, refetch } = useActiveTableQueryCollection(query);
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
