import type { OnChangeFn, PaginationState } from "@tanstack/react-table";
import { useCallback } from "react";

import { useStudio } from "../studio/context";
import { useNavigation } from "./use-navigation";

export function usePagination() {
  const { pageIndexParam, setPageIndexParam, setPageSizeParam } =
    useNavigation();
  const {
    isInfiniteScrollEnabled,
    setInfiniteScrollEnabled,
    setTablePageSize,
    tablePageSize,
  } = useStudio();

  const normalizedPageIndex = Number.isSafeInteger(Number(pageIndexParam))
    ? Math.max(0, Number(pageIndexParam))
    : 0;

  // Compatible with TanStack Table's OnChangeFn<PaginationState>
  const setPaginationState: OnChangeFn<PaginationState> = useCallback(
    (updaterOrValue) => {
      const currentState = {
        pageIndex: normalizedPageIndex,
        pageSize: tablePageSize,
      };

      if (typeof updaterOrValue === "function") {
        const state = updaterOrValue(currentState);
        void setPageIndexParam(state.pageIndex + "");
        void setPageSizeParam(state.pageSize + "");
        setTablePageSize(state.pageSize);
      } else {
        void setPageIndexParam(updaterOrValue.pageIndex + "");
        void setPageSizeParam(updaterOrValue.pageSize + "");
        setTablePageSize(updaterOrValue.pageSize);
      }
    },
    [
      normalizedPageIndex,
      setPageIndexParam,
      setPageSizeParam,
      setTablePageSize,
      tablePageSize,
    ],
  );

  return {
    isInfiniteScrollEnabled,
    paginationState: {
      pageIndex: normalizedPageIndex,
      pageSize: tablePageSize,
    },
    setInfiniteScrollEnabled,
    setPaginationState,
  };
}
