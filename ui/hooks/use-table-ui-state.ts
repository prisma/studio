import { eq, useLiveQuery } from "@tanstack/react-db";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo } from "react";

import type { Table } from "../../data/adapter";
import { type TableUiState, useStudio } from "../studio/context";
import {
  cloneEditingFilter,
  createDefaultFilter,
  createEditingFilterFromApplied,
  type EditingFilterGroup,
} from "./filter-utils";
import { useNavigation } from "./use-navigation";

export interface TableUiStateDefaults {
  editingFilter?: EditingFilterGroup;
  rowSelectionState?: RowSelectionState;
  stagedRows?: Record<string, unknown>[];
  stagedUpdates?: NonNullable<TableUiState["stagedUpdates"]>;
}

function createDefaultTableUiState(
  scopeKey: string,
  defaults?: TableUiStateDefaults,
): TableUiState {
  return {
    id: scopeKey,
    editingFilter: cloneEditingFilter(
      defaults?.editingFilter ??
        createEditingFilterFromApplied(createDefaultFilter()),
    ),
    rowSelectionState: { ...(defaults?.rowSelectionState ?? {}) },
    stagedRows: [...(defaults?.stagedRows ?? [])],
    stagedUpdates: [...(defaults?.stagedUpdates ?? [])],
  };
}

export function getTableScopeKey(activeTable: Table | undefined): string {
  if (!activeTable) {
    return "";
  }

  return `${activeTable.schema}.${activeTable.name}`;
}

export function useTableUiState(defaults?: TableUiStateDefaults) {
  const { tableUiStateCollection } = useStudio();
  const {
    metadata: { activeTable },
  } = useNavigation();
  const scopeKey = useMemo(() => getTableScopeKey(activeTable), [activeTable]);

  const { data: tableUiState } = useLiveQuery(
    (q) => {
      if (!scopeKey) {
        return undefined;
      }

      return q
        .from({ item: tableUiStateCollection })
        .where(({ item }) => eq(item.id, scopeKey))
        .select(({ item }) => ({
          id: item.id,
          editingFilter: item.editingFilter,
          rowSelectionState: item.rowSelectionState,
          stagedRows: item.stagedRows,
          stagedUpdates: item.stagedUpdates,
        }))
        .findOne();
    },
    [scopeKey, tableUiStateCollection],
  );

  useEffect(() => {
    if (!scopeKey || tableUiStateCollection.has(scopeKey)) {
      return;
    }

    tableUiStateCollection.insert(
      createDefaultTableUiState(scopeKey, defaults),
    );
  }, [defaults, scopeKey, tableUiStateCollection]);

  const resolvedState =
    !scopeKey || tableUiState
      ? tableUiState
      : createDefaultTableUiState(scopeKey, defaults);

  const updateTableUiState = useCallback(
    (updater: (draft: TableUiState) => void) => {
      if (!scopeKey) {
        return;
      }

      if (!tableUiStateCollection.has(scopeKey)) {
        const nextState = createDefaultTableUiState(scopeKey, defaults);
        updater(nextState);
        tableUiStateCollection.insert(nextState);
        return;
      }

      tableUiStateCollection.update(scopeKey, updater);
    },
    [defaults, scopeKey, tableUiStateCollection],
  );

  return {
    scopeKey,
    tableUiState: resolvedState,
    updateTableUiState,
  };
}
