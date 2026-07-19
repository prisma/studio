import { useMutation } from "@tanstack/react-query";

import {
  useActiveTableQueryCollection,
  type UseActiveTableQueryProps,
} from "./use-active-table-query";

export function useActiveTableDelete(query: UseActiveTableQueryProps) {
  const { activeTable, collection, refetch } =
    useActiveTableQueryCollection(query);
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
