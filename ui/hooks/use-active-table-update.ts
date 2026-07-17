import { useMutation } from "@tanstack/react-query";

import type {
  AdapterUpdateDetails,
  AdapterUpdateOptions,
} from "../../data/adapter";
import {
  useActiveTableQueryCollection,
  type UseActiveTableQueryProps,
} from "./use-active-table-query";

export interface UseActiveTableUpdateParams {
  details: AdapterUpdateDetails;
  options: AdapterUpdateOptions;
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
      const rowId = String(params.details.row.__ps_rowid ?? "");

      if (!collection || !activeTable || !rowId) {
        throw new Error("Active table collection is not available");
      }

      const transaction = collection.update(rowId, (draft) => {
        Object.assign(draft, params.details.changes);
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
