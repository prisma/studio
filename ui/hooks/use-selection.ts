import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef } from "react";

type QueryRows = {
  rows: Record<string, unknown>[];
};

import { useActiveTableDelete } from "./use-active-table-delete";
import { usePagination } from "./use-pagination";
import { useTableUiState } from "./use-table-ui-state";

export function useSelection(data: QueryRows | undefined) {
  const { paginationState } = usePagination();
  const { mutate } = useActiveTableDelete();
  const { scopeKey, tableUiState, updateTableUiState } = useTableUiState();
  const rowSelectionState = useMemo(
    () => tableUiState?.rowSelectionState ?? {},
    [tableUiState?.rowSelectionState],
  );
  const isSelecting = Object.keys(rowSelectionState).length !== 0;
  const previousScopeRef = useRef(scopeKey);
  const previousPageIndexRef = useRef(paginationState.pageIndex);
  const previousPageSizeRef = useRef(paginationState.pageSize);

  useEffect(() => {
    const scopeChanged = previousScopeRef.current !== scopeKey;
    const pageChanged =
      previousPageIndexRef.current !== paginationState.pageIndex;
    const pageSizeChanged =
      previousPageSizeRef.current !== paginationState.pageSize;

    previousScopeRef.current = scopeKey;
    previousPageIndexRef.current = paginationState.pageIndex;
    previousPageSizeRef.current = paginationState.pageSize;

    if (
      !scopeKey ||
      (!scopeChanged && !pageChanged && !pageSizeChanged) ||
      Object.keys(rowSelectionState).length === 0
    ) {
      return;
    }

    updateTableUiState((draft) => {
      draft.rowSelectionState = {};
    });
  }, [
    paginationState.pageIndex,
    paginationState.pageSize,
    rowSelectionState,
    scopeKey,
    updateTableUiState,
  ]);

  const setRowSelectionState = useCallback<OnChangeFn<RowSelectionState>>(
    (updater) => {
      updateTableUiState((draft) => {
        const previous = draft.rowSelectionState ?? {};
        draft.rowSelectionState =
          typeof updater === "function" ? updater(previous) : updater;
      });
    },
    [updateTableUiState],
  );

  function deleteSelection() {
    const rows = data?.rows.filter((row) => {
      return rowSelectionState[row.__ps_rowid as string];
    });

    mutate(rows ?? [], {
      onSuccess() {
        setRowSelectionState({});
      },
    });
  }

  return {
    deleteSelection,
    setRowSelectionState,
    rowSelectionState,
    isSelecting,
  };
}
