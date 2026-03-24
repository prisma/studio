import { useCallback, useEffect, useMemo, useRef } from "react";

import type { FilterGroup, Table } from "../../data/adapter";
import {
  countFiltersRecursive,
  createAppliedFilterFromEditing,
  createEditingFilterFromApplied,
  defaultFilter,
  type EditingFilterGroup,
  mergeEditingFilterUiMetadata,
} from "./filter-utils";
import { useLatestAsyncParam } from "./use-latest-async-param";
import { useNavigation } from "./use-navigation";
import { useTableUiState } from "./use-table-ui-state";

function parseAppliedFilter(filterParam: string): FilterGroup {
  try {
    return JSON.parse(filterParam) as FilterGroup;
  } catch (error) {
    console.error("Failed to parse filter param", error);
    return defaultFilter;
  }
}

export function useFiltering(columns?: Table["columns"]) {
  const { filterParam, setFilterParam } = useNavigation();
  const {
    value: effectiveFilterParam,
    writeLatestValue: writeLatestFilterParam,
  } = useLatestAsyncParam({
    value: filterParam,
    write: setFilterParam,
  });
  const appliedFilter = useMemo(
    () => parseAppliedFilter(effectiveFilterParam),
    [effectiveFilterParam],
  );
  const appliedFilterSerialized = useMemo(
    () => JSON.stringify(appliedFilter),
    [appliedFilter],
  );
  const editingFilterDefaults = useMemo(
    () => createEditingFilterFromApplied(appliedFilter),
    [appliedFilter],
  );
  const setAppliedFilter = useCallback(
    (filter: FilterGroup) =>
      void writeLatestFilterParam(JSON.stringify(filter)),
    [writeLatestFilterParam],
  );
  const { scopeKey, tableUiState, updateTableUiState } = useTableUiState({
    editingFilter: editingFilterDefaults,
  });
  const editingFilter = tableUiState?.editingFilter ?? editingFilterDefaults;
  const currentFilterSyncKey = `${scopeKey}:${appliedFilterSerialized}`;
  const previousFilterSyncKey = useRef(currentFilterSyncKey);
  const setEditingFilter = useCallback(
    (filter: EditingFilterGroup) => {
      updateTableUiState((draft) => {
        draft.editingFilter = filter;
      });
    },
    [updateTableUiState],
  );
  const applyEditingFilter = useCallback(
    (filter: EditingFilterGroup = editingFilter) => {
      setAppliedFilter(createAppliedFilterFromEditing(filter, columns));
    },
    [columns, editingFilter, setAppliedFilter],
  );

  // Keep table editing state synchronized with the currently applied URL filter.
  useEffect(() => {
    if (previousFilterSyncKey.current === currentFilterSyncKey) {
      return;
    }

    previousFilterSyncKey.current = currentFilterSyncKey;
    setEditingFilter(
      mergeEditingFilterUiMetadata({
        currentFilter: editingFilterDefaults,
        previousFilter: editingFilter,
      }),
    );
  }, [
    currentFilterSyncKey,
    editingFilter,
    editingFilterDefaults,
    setEditingFilter,
  ]);

  const totalEditingFilters = useMemo(
    () => countFiltersRecursive(editingFilter),
    [editingFilter],
  );

  return {
    appliedFilter,
    setAppliedFilter,
    editingFilter,
    setEditingFilter,
    applyEditingFilter,
    totalEditingFilters,
  };
}
