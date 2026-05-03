import { useIsMutating } from "@tanstack/react-query";
import { type ColumnDef, type ColumnPinningState } from "@tanstack/react-table";
import { ChevronDown, History, RefreshCw } from "lucide-react";
import {
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { isDeepEqual } from "remeda";
import { toast } from "sonner";

import type { Adapter, Column, FilterGroup } from "../../../../data/adapter";
import { createSqlEditorSchemaFromIntrospection } from "../../../../data/sql-editor-schema";
import type { BigIntString, NumericString } from "../../../../data/type-utils";
import { coerceToValue } from "../../../../lib/conversionUtils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { Button, type ButtonProps } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { CheckboxTable } from "../../../components/ui/checkbox-table";
import { TableHead } from "../../../components/ui/table";
import { useActiveTableInsert } from "../../../hooks/use-active-table-insert";
import { useActiveTableQuery } from "../../../hooks/use-active-table-query";
import { useActiveTableUpdateMany } from "../../../hooks/use-active-table-update-many";
import { useColumnPinning } from "../../../hooks/use-column-pinning";
import { useFiltering } from "../../../hooks/use-filtering";
import { useIntrospection } from "../../../hooks/use-introspection";
import { useIsInserting } from "../../../hooks/use-is-inserting";
import { useNavigation } from "../../../hooks/use-navigation";
import { usePagination } from "../../../hooks/use-pagination";
import { useSelection } from "../../../hooks/use-selection";
import { useSorting } from "../../../hooks/use-sorting";
import { useStreams } from "../../../hooks/use-streams";
import { useTableUiState } from "../../../hooks/use-table-ui-state";
import { useUiState } from "../../../hooks/use-ui-state";
import { cn } from "../../../lib/utils";
import {
  Cell,
  type CellProps,
  focusedCellClassName,
  focusedStagedCellClassName,
  stagedCellClassName,
} from "../../cell/Cell";
import { getCell } from "../../cell/get-cell";
import { Link, RelationLink } from "../../cell/Link";
import { WriteableCell } from "../../cell/WriteableCell";
import { useRegisterCommandPaletteActions } from "../../CommandPalette";
import { type TableUiState, useStudio } from "../../context";
import type {
  GridCellCoordinate,
  GridPasteChange,
} from "../../grid/cell-selection";
import { DataGrid } from "../../grid/DataGrid";
import { DataGridDraggableHeaderCell } from "../../grid/DataGridDraggableHeaderCell";
import { DataGridHeader } from "../../grid/DataGridHeader";
import {
  clampFocusedCell,
  focusedCellsAreEqual,
  type GridFocusedCell,
  moveFocusedCell,
} from "../../grid/focused-cell";
import {
  getCellSelectionAnchor,
  getCellSelectionRange,
  GRID_SELECTION_MACHINE_INITIAL_STATE,
  type GridSelectionMachineState,
  transitionGridSelectionMachine,
} from "../../grid/selection-state-machine";
import { ExpandableSearchControl } from "../../input/ExpandableSearchControl";
import {
  type CellEditNavigationDirection,
  getInput,
} from "../../input/get-input";
import {
  TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY,
  type TableGridFocusRequestUiState,
} from "../../navigation-ui-state";
import { StudioHeader } from "../../StudioHeader";
import { ViewProps } from "../View";
import { createActiveTableCommandPaletteActions } from "./active-table-command-actions";
import {
  type BackRelationColumnMeta,
  getBackRelationColumns,
} from "./back-relation-columns";
import {
  getNextInfinitePageRowTarget,
  INFINITE_SCROLL_BATCH_SIZE,
} from "./infinite-scroll";
import {
  InlineTableFilterAddButton,
  InlineTableFiltersHeaderRow,
} from "./InlineTableFilters";
import {
  buildCellSelectionExportTable,
  buildRowSelectionExportTable,
  buildSelectionExportFilename,
  downloadSelectionExport,
  type SelectionExportFormat,
  serializeSelectionExport,
} from "./selection-export";
import { StagedRows } from "./StagedRows";
import { applyAiTableFilterRequest } from "./table-ai-filter";
import { useActiveTableRowSearch } from "./use-active-table-row-search";

const FOCUSED_CELL_REPEAT_DELAY_MS = 50;

export function ActiveTableView(_props: ViewProps) {
  const isMutating = Boolean(useIsMutating());
  const { adapter, hasAiFilter, requestLlm } = useStudio();
  const {
    metadata: { activeTable },
    createUrl,
    searchParam,
    setPageIndexParam,
    setSearchParam,
  } = useNavigation();
  const supportsFullTableSearch =
    adapter.capabilities?.fullTableSearch === true;
  const selectionScopeKey = activeTable
    ? `${activeTable.schema}.${activeTable.name}`
    : undefined;
  const { pinnedColumnIds, setPinnedColumnIds } = useColumnPinning();
  const searchTerm = searchParam ?? "";
  const activeRowSearchTerm = supportsFullTableSearch ? searchTerm : "";
  const { sortingState, setSortingState } = useSorting();
  const {
    isInfiniteScrollEnabled,
    paginationState,
    setInfiniteScrollEnabled,
    setPaginationState,
  } = usePagination();
  const [loadedInfinitePageCount, setLoadedInfinitePageCount] = useState(1);
  const {
    appliedFilter,
    editingFilter,
    setEditingFilter,
    applyEditingFilter,
    totalEditingFilters,
  } = useFiltering(activeTable?.columns);
  const infiniteScrollResetKey = useMemo(
    () =>
      getInfiniteScrollResetKey({
        activeRowSearchTerm,
        filter: appliedFilter,
        pageSize: isInfiniteScrollEnabled
          ? INFINITE_SCROLL_BATCH_SIZE
          : paginationState.pageSize,
        selectionScopeKey,
        sortingState,
      }),
    [
      activeRowSearchTerm,
      appliedFilter,
      isInfiniteScrollEnabled,
      paginationState.pageSize,
      selectionScopeKey,
      sortingState,
    ],
  );

  const { data: introspection, refetch: refetchIntrospection } =
    useIntrospection();
  const sqlEditorSchema = useMemo(() => {
    return createSqlEditorSchemaFromIntrospection({
      defaultSchema: adapter.defaultSchema,
      dialect: adapter.capabilities?.sqlDialect ?? "postgresql",
      introspection,
    });
  }, [adapter.capabilities?.sqlDialect, adapter.defaultSchema, introspection]);
  const sqlFilterLint = useMemo(() => {
    if (
      !adapter.capabilities?.sqlEditorLint ||
      !adapterSupportsSqlLint(adapter)
    ) {
      return null;
    }

    return {
      dialect: sqlEditorSchema.dialect,
      lintSql: (
        details: Parameters<typeof adapter.sqlLint>[0],
        options: Parameters<typeof adapter.sqlLint>[1],
      ) => adapter.sqlLint(details, options),
      schemaVersion: sqlEditorSchema.version,
    };
  }, [adapter, sqlEditorSchema.dialect, sqlEditorSchema.version]);
  const {
    data,
    isFetching,
    refetch: refetchActiveTable,
  } = useActiveTableQuery({
    pageIndex: isInfiniteScrollEnabled ? 0 : paginationState.pageIndex,
    pageSize: isInfiniteScrollEnabled
      ? INFINITE_SCROLL_BATCH_SIZE * loadedInfinitePageCount
      : paginationState.pageSize,
    sortOrder: sortingState,
    filter: appliedFilter,
    searchScope: supportsFullTableSearch ? "row" : "table",
    searchTerm: activeRowSearchTerm,
  });
  const [stableInfiniteData, setStableInfiniteData] = useState<{
    data: NonNullable<typeof data>;
    key: string;
  } | null>(null);
  const visibleData = useMemo(() => {
    if (!isInfiniteScrollEnabled) {
      return data;
    }

    if (
      isFetching &&
      (data == null || data.rows.length === 0) &&
      stableInfiniteData?.key === infiniteScrollResetKey
    ) {
      return stableInfiniteData.data;
    }

    return data;
  }, [
    data,
    infiniteScrollResetKey,
    isFetching,
    isInfiniteScrollEnabled,
    stableInfiniteData,
  ]);

  useEffect(() => {
    if (!isInfiniteScrollEnabled || !data) {
      if (stableInfiniteData != null) {
        setStableInfiniteData(null);
      }
      return;
    }

    if (isFetching && data.rows.length === 0) {
      return;
    }

    setStableInfiniteData((previous) => {
      if (
        previous?.key === infiniteScrollResetKey &&
        previous.data.filteredRowCount === data.filteredRowCount &&
        previous.data.rows === data.rows
      ) {
        return previous;
      }

      return {
        data,
        key: infiniteScrollResetKey,
      };
    });
  }, [
    data,
    infiniteScrollResetKey,
    isFetching,
    isInfiniteScrollEnabled,
    stableInfiniteData,
  ]);

  const {
    deleteSelection,
    isSelecting,
    rowSelectionState,
    setRowSelectionState,
  } = useSelection(visibleData);
  const { streams } = useStreams();
  const { tableUiState, updateTableUiState } = useTableUiState({
    editingFilter,
  });
  const [tableGridFocusRequest] = useUiState<TableGridFocusRequestUiState>(
    TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY,
    {
      requestId: 0,
      tableId: null,
    },
  );
  const [gridSelectionState, setGridSelectionState] =
    useUiState<GridSelectionMachineState>(
      selectionScopeKey
        ? `datagrid:${selectionScopeKey}:selection-state`
        : undefined,
      GRID_SELECTION_MACHINE_INITIAL_STATE,
    );
  const [gridFocusedCell, setGridFocusedCell] =
    useUiState<GridFocusedCell | null>(
      selectionScopeKey
        ? `datagrid:${selectionScopeKey}:focused-cell`
        : undefined,
      null,
    );
  const [gridColumnOrder] = useUiState<string[]>(
    selectionScopeKey
      ? `datagrid:${selectionScopeKey}:column-order`
      : undefined,
    [],
  );
  const [gridColumnPinning] = useUiState<ColumnPinningState>(
    selectionScopeKey
      ? `datagrid:${selectionScopeKey}:column-pinning`
      : undefined,
    {
      left: ["__ps_select"],
      right: [],
    },
  );
  const rowSearch = useActiveTableRowSearch({
    scopeKey: selectionScopeKey ?? "",
    searchTerm,
    setPageIndexParam,
    setSearchParam,
    supportsFullTableSearch,
  });
  const rows = useMemo(() => visibleData?.rows ?? [], [visibleData?.rows]);
  const stagedRows = useMemo(
    () => tableUiState?.stagedRows ?? [],
    [tableUiState?.stagedRows],
  );
  const stagedUpdates = useMemo(
    () => tableUiState?.stagedUpdates ?? [],
    [tableUiState?.stagedUpdates],
  );
  const [activeEditorCellKey, setActiveEditorCellKey] = useState<string | null>(
    null,
  );
  const [aiFocusRequestKey, setAiFocusRequestKey] = useState(0);
  const [gridFocusRequestId, setGridFocusRequestId] = useState(0);
  const [isSelectionExportOpen, setSelectionExportOpen] = useState(false);
  const [includeSelectionExportHeader, setIncludeSelectionExportHeader] =
    useState(true);
  const [discardWiggleCount, setDiscardWiggleCount] = useState(0);
  const [isSaveDialogOpen, setSaveDialogOpen] = useState(false);
  const [isDiscardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const selectedRowCount =
    Object.values(rowSelectionState).filter(Boolean).length;
  const hasPrismaWalStream = useMemo(
    () => streams.some((stream) => stream.name === "prisma-wal"),
    [streams],
  );
  const selectedRowHistoryClause = useMemo(
    () =>
      resolveWalHistoryKeyClause({
        columns: activeTable?.columns,
        rows,
        rowSelectionState,
      }),
    [activeTable?.columns, rowSelectionState, rows],
  );
  const tableHistoryUrl = useMemo(() => {
    if (!activeTable || !hasPrismaWalStream) {
      return null;
    }

    const tableClause = `table:${JSON.stringify(
      `${activeTable.schema}.${activeTable.name}`,
    )}`;
    const searchParam = selectedRowHistoryClause
      ? `${tableClause} AND ${selectedRowHistoryClause}`
      : tableClause;

    return createUrl({
      searchParam,
      streamParam: "prisma-wal",
      viewParam: "stream",
    });
  }, [activeTable, createUrl, hasPrismaWalStream, selectedRowHistoryClause]);
  const tableHistoryAriaLabel = useMemo(() => {
    if (!activeTable || !hasPrismaWalStream) {
      return null;
    }

    return selectedRowHistoryClause
      ? `Open history for selected ${activeTable.schema}.${activeTable.name} row`
      : `Open history for ${activeTable.schema}.${activeTable.name}`;
  }, [activeTable, hasPrismaWalStream, selectedRowHistoryClause]);
  const cellSelectionRange = getCellSelectionRange(gridSelectionState);
  const hasSelectionExport = cellSelectionRange != null || selectedRowCount > 0;
  const deleteSelectionLabel = getDeleteSelectionLabel(selectedRowCount);
  const deleteConfirmationPrompt =
    getDeleteConfirmationPrompt(selectedRowCount);
  const discardConfirmationPrompt = getDiscardConfirmationPrompt(
    getStagedCellCount({
      stagedRows,
      stagedUpdates,
    }),
  );
  const pendingInfinitePageRowTargetRef = useRef<number | null>(null);
  const observedInfiniteFetchRef = useRef(false);
  const previousInfiniteScrollResetKeyRef = useRef(infiniteScrollResetKey);
  const setStagedRows = useCallback<
    Dispatch<SetStateAction<Record<string, unknown>[]>>
  >(
    (updater) => {
      updateTableUiState((draft) => {
        const previous = draft.stagedRows ?? [];
        draft.stagedRows =
          typeof updater === "function" ? updater(previous) : updater;
      });
    },
    [updateTableUiState],
  );
  const setStagedUpdates = useCallback<
    Dispatch<SetStateAction<NonNullable<typeof stagedUpdates>>>
  >(
    (updater) => {
      updateTableUiState((draft) => {
        const previous = draft.stagedUpdates ?? [];
        draft.stagedUpdates =
          typeof updater === "function" ? updater(previous) : updater;
      });
    },
    [updateTableUiState],
  );
  const stagedUpdateMap = useMemo(
    () =>
      new Map(
        stagedUpdates.map((stagedUpdate) => [stagedUpdate.rowId, stagedUpdate]),
      ),
    [stagedUpdates],
  );
  const displayRows = useMemo(
    () =>
      rows.map((row) => {
        const rowId = String(row.__ps_rowid ?? "");
        const stagedUpdate = stagedUpdateMap.get(rowId);

        if (!stagedUpdate) {
          return row;
        }

        return {
          ...row,
          ...stagedUpdate.changes,
        };
      }),
    [rows, stagedUpdateMap],
  );
  const hasStagedChanges = stagedRows.length > 0 || stagedUpdates.length > 0;
  const stagedExistingRowCount = stagedUpdates.length;
  const totalStagedRowCount = stagedRows.length + stagedExistingRowCount;
  const saveConfirmationPrompt = getSaveConfirmationPrompt(totalStagedRowCount);
  const discardWiggleAnimationClassName =
    discardWiggleCount === 0
      ? null
      : discardWiggleCount % 2 === 0
        ? "motion-safe:animate-[ps-discard-wiggle-b_420ms_ease-in-out]"
        : "motion-safe:animate-[ps-discard-wiggle-a_420ms_ease-in-out]";
  const discardWiggleAnimationKey =
    discardWiggleCount === 0
      ? null
      : discardWiggleCount % 2 === 0
        ? "ps-discard-wiggle-b"
        : "ps-discard-wiggle-a";

  useEffect(() => {
    setActiveEditorCellKey(null);
  }, [
    activeTable?.name,
    activeTable?.schema,
    paginationState.pageIndex,
    paginationState.pageSize,
  ]);

  useEffect(() => {
    if (previousInfiniteScrollResetKeyRef.current === infiniteScrollResetKey) {
      return;
    }

    previousInfiniteScrollResetKeyRef.current = infiniteScrollResetKey;
    pendingInfinitePageRowTargetRef.current = null;
    observedInfiniteFetchRef.current = false;
    setLoadedInfinitePageCount(1);
  }, [infiniteScrollResetKey]);

  useEffect(() => {
    if (isInfiniteScrollEnabled) {
      return;
    }

    pendingInfinitePageRowTargetRef.current = null;
    observedInfiniteFetchRef.current = false;
    setLoadedInfinitePageCount(1);
  }, [isInfiniteScrollEnabled]);

  useEffect(() => {
    if (selectedRowCount === 0 && isDeleteDialogOpen) {
      setDeleteDialogOpen(false);
    }
  }, [isDeleteDialogOpen, selectedRowCount]);

  useEffect(() => {
    if (hasStagedChanges) {
      return;
    }

    if (isSaveDialogOpen) {
      setSaveDialogOpen(false);
    }

    if (isDiscardDialogOpen) {
      setDiscardDialogOpen(false);
    }

    if (discardWiggleCount !== 0) {
      setDiscardWiggleCount(0);
    }
  }, [
    discardWiggleCount,
    hasStagedChanges,
    isDiscardDialogOpen,
    isSaveDialogOpen,
  ]);

  useEffect(() => {
    if (!hasSelectionExport && isSelectionExportOpen) {
      setSelectionExportOpen(false);
    }
  }, [hasSelectionExport, isSelectionExportOpen]);

  const readonly = !Object.values(activeTable?.columns ?? {}).some(
    (column) => column.pkPosition != null,
  );
  const isInserting = useIsInserting();
  const insert = useActiveTableInsert();
  const updateMany = useActiveTableUpdateMany();
  const pageCount = getPageCount(
    visibleData?.filteredRowCount ?? Infinity,
    paginationState.pageSize,
  );
  const hasMoreInfiniteRows =
    isInfiniteScrollEnabled &&
    hasMoreRowsToLoad(visibleData?.filteredRowCount ?? Infinity, rows.length);
  const canGoToPreviousPage = paginationState.pageIndex > 0;
  const canGoToNextPage =
    pageCount != null && paginationState.pageIndex < pageCount - 1;
  useLayoutEffect(() => {
    const pendingRowTarget = pendingInfinitePageRowTargetRef.current;

    if (pendingRowTarget == null) {
      observedInfiniteFetchRef.current = false;
      return;
    }

    if (isFetching) {
      observedInfiniteFetchRef.current = true;
      return;
    }

    if (
      rows.length >= pendingRowTarget ||
      !hasMoreInfiniteRows ||
      observedInfiniteFetchRef.current
    ) {
      pendingInfinitePageRowTargetRef.current = null;
      observedInfiniteFetchRef.current = false;
    }
  }, [hasMoreInfiniteRows, isFetching, rows.length]);
  const activeTableId = activeTable
    ? `${activeTable.schema}.${activeTable.name}`
    : null;
  const backRelationColumns = useMemo(
    () =>
      getBackRelationColumns({
        introspection,
        table: activeTable,
      }),
    [activeTable, introspection],
  );
  const defaultColumnIds = useMemo(
    () =>
      getDefaultTableColumnIds({
        backRelationColumns,
        columns: activeTable?.columns,
      }),
    [activeTable?.columns, backRelationColumns],
  );
  const fallbackSelectionExportColumnIds = useMemo(
    () => defaultColumnIds,
    [defaultColumnIds],
  );
  const selectionExportColumnIds = useMemo(
    () =>
      getSelectionExportColumnIds({
        columnOrder: gridColumnOrder,
        columnPinning: gridColumnPinning,
        defaultColumnIds: fallbackSelectionExportColumnIds,
      }),
    [fallbackSelectionExportColumnIds, gridColumnOrder, gridColumnPinning],
  );
  const selectionExportTable = useMemo(() => {
    const exportRows = displayRows;

    if (cellSelectionRange) {
      return buildCellSelectionExportTable({
        columnIds: selectionExportColumnIds,
        range: cellSelectionRange,
        rows: exportRows,
      });
    }

    if (selectedRowCount > 0) {
      return buildRowSelectionExportTable({
        columnIds: selectionExportColumnIds,
        rowSelectionState,
        rows: exportRows,
      });
    }

    return null;
  }, [
    cellSelectionRange,
    displayRows,
    rowSelectionState,
    selectedRowCount,
    selectionExportColumnIds,
  ]);
  const editableColumnIds = useMemo(
    () => getEditableColumnIds(activeTable?.columns, readonly),
    [activeTable?.columns, readonly],
  );
  const focusedColumnIds = useMemo(
    () =>
      getSelectionExportColumnIds({
        columnOrder: gridColumnOrder,
        columnPinning: gridColumnPinning,
        defaultColumnIds: fallbackSelectionExportColumnIds,
      }),
    [fallbackSelectionExportColumnIds, gridColumnOrder, gridColumnPinning],
  );
  const editorRows = useMemo(
    () =>
      buildEditorRows({
        displayRows,
        persistedRows: rows,
        stagedRows,
      }),
    [displayRows, rows, stagedRows],
  );
  const resolvedFocusedCell = useMemo(
    () =>
      clampFocusedCell({
        columnIds: focusedColumnIds,
        focusedCell: gridFocusedCell,
        rowCount: editorRows.length,
      }),
    [editorRows.length, focusedColumnIds, gridFocusedCell],
  );
  const triggerDiscardButtonWiggle = useCallback(() => {
    if (!hasStagedChanges) {
      return;
    }

    setDiscardWiggleCount((current) => current + 1);
  }, [hasStagedChanges]);
  const handleInfiniteScrollEnabledChange = useCallback(
    (enabled: boolean) => {
      if (hasStagedChanges) {
        triggerDiscardButtonWiggle();
        return;
      }

      previousInfiniteScrollResetKeyRef.current = getInfiniteScrollResetKey({
        activeRowSearchTerm,
        filter: appliedFilter,
        pageSize: enabled
          ? INFINITE_SCROLL_BATCH_SIZE
          : paginationState.pageSize,
        selectionScopeKey,
        sortingState,
      });
      pendingInfinitePageRowTargetRef.current = null;
      observedInfiniteFetchRef.current = false;
      setLoadedInfinitePageCount(1);
      setInfiniteScrollEnabled(enabled);

      if (enabled && paginationState.pageIndex !== 0) {
        void setPageIndexParam("0");
      }
    },
    [
      activeRowSearchTerm,
      appliedFilter,
      hasStagedChanges,
      paginationState.pageIndex,
      paginationState.pageSize,
      selectionScopeKey,
      setInfiniteScrollEnabled,
      setPageIndexParam,
      sortingState,
      triggerDiscardButtonWiggle,
    ],
  );
  const handleLoadMoreRows = useCallback(() => {
    const nextRowTarget = getNextInfinitePageRowTarget({
      hasMoreInfiniteRows,
      isInfiniteScrollEnabled,
      loadedInfinitePageCount,
      loadedRowCount: rows.length,
      pendingRowTarget: pendingInfinitePageRowTargetRef.current,
    });

    if (nextRowTarget == null) {
      return;
    }

    pendingInfinitePageRowTargetRef.current = null;
    observedInfiniteFetchRef.current = false;
    pendingInfinitePageRowTargetRef.current = nextRowTarget;
    setLoadedInfinitePageCount((current) => current + 1);
  }, [
    hasMoreInfiniteRows,
    isInfiniteScrollEnabled,
    loadedInfinitePageCount,
    rows.length,
  ]);
  const handleFocusedCellChange = useCallback(
    (focusedCell: GridFocusedCell | null) => {
      if (!isGridFocusedCell(focusedCell)) {
        return;
      }

      if (focusedCellsAreEqual(gridFocusedCell, focusedCell)) {
        return;
      }

      setGridFocusedCell(focusedCell);
    },
    [gridFocusedCell, setGridFocusedCell],
  );

  useEffect(() => {
    if (focusedCellsAreEqual(gridFocusedCell, resolvedFocusedCell)) {
      return;
    }

    setGridFocusedCell(resolvedFocusedCell);
  }, [gridFocusedCell, resolvedFocusedCell, setGridFocusedCell]);

  const requestAiFilter = useCallback(
    async (prompt: string) => {
      return await requestLlm({
        prompt,
        task: "table-filter",
      });
    },
    [requestLlm],
  );

  const handleAiPaletteFilter = useCallback(
    async (request: string) => {
      if (!hasAiFilter || !activeTable) {
        return;
      }

      try {
        await applyAiTableFilterRequest({
          aiFilter: requestAiFilter,
          applyEditingFilter,
          filterOperators: introspection.filterOperators,
          request,
          setEditingFilter,
          table: activeTable,
        });
      } catch (error) {
        toast.error("AI filtering failed.", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [
      activeTable,
      applyEditingFilter,
      hasAiFilter,
      introspection.filterOperators,
      requestAiFilter,
      setEditingFilter,
    ],
  );
  const focusAiPaletteFilter = useCallback(() => {
    setAiFocusRequestKey((current) => current + 1);
  }, []);

  function saveStagedRows() {
    if (!hasStagedChanges) {
      return;
    }

    const finishSuccess = () => {
      setActiveEditorCellKey(null);
      toast.success(getSaveStagedRowsSuccessMessage(totalStagedRowCount));
    };

    const persistStagedUpdates = () => {
      if (stagedUpdates.length === 0) {
        finishSuccess();
        return;
      }

      updateMany.mutate(
        {
          updates: stagedUpdates.map(({ changes, row }) => ({
            changes,
            row,
          })),
        },
        {
          onSuccess() {
            setStagedUpdates([]);
            finishSuccess();
          },
        },
      );
    };

    if (stagedRows.length === 0) {
      persistStagedUpdates();
      return;
    }

    insert.mutate(stripDraftMetadataFromStagedRows(stagedRows), {
      onSuccess() {
        setStagedRows([]);
        persistStagedUpdates();
      },
    });
  }

  const reload = useCallback(async () => {
    await refetchIntrospection();
    await refetchActiveTable();
  }, [refetchActiveTable, refetchIntrospection]);

  const newStagedRow = useCallback(() => {
    // TODO: the new object should have some things set to null if they're nullable or have a default value?
    setStagedRows((old) => [...old, createEmptyStagedRowDraft()]);
    handleFocusedCellChange(
      focusedColumnIds[0]
        ? {
            columnId: focusedColumnIds[0],
            rowIndex: 0,
          }
        : null,
    );
  }, [focusedColumnIds, handleFocusedCellChange, setStagedRows]);

  function dropStagedRows() {
    setActiveEditorCellKey(null);
    setStagedRows([]);
    setStagedUpdates([]);
  }

  function confirmDiscardStagedChanges() {
    dropStagedRows();
    setDiscardDialogOpen(false);
  }

  function confirmDeleteSelection() {
    deleteSelection();
    setDeleteDialogOpen(false);
  }

  function buildSerializedSelectionExport(
    format: SelectionExportFormat,
  ): string {
    if (!selectionExportTable) {
      return "";
    }

    return serializeSelectionExport({
      table: selectionExportTable,
      format,
      includeColumnHeader: includeSelectionExportHeader,
    });
  }

  function handleCopySelectionExport(format: SelectionExportFormat) {
    const content = buildSerializedSelectionExport(format);

    setSelectionExportOpen(false);

    if (!content || typeof navigator.clipboard?.writeText !== "function") {
      return;
    }

    void navigator.clipboard.writeText(content).catch((error) => {
      console.error("Failed to copy selection export:", error);
    });
  }

  function handleSaveSelectionExport(format: SelectionExportFormat) {
    if (!activeTable) {
      return;
    }

    const content = buildSerializedSelectionExport(format);

    setSelectionExportOpen(false);

    if (!content) {
      return;
    }

    downloadSelectionExport({
      content,
      filename: buildSelectionExportFilename({
        format,
        schema: activeTable.schema,
        table: activeTable.name,
      }),
      format,
    });
  }

  const commandPaletteActions = useMemo(
    () =>
      createActiveTableCommandPaletteActions({
        canGoToNextPage,
        canGoToPreviousPage,
        hasAiFilter,
        hasStagedChanges,
        isInsertingDisabled: isInserting > 0,
        onDiscardStagedChanges: () => setDiscardDialogOpen(true),
        onFocusFilterWithAi: focusAiPaletteFilter,
        onFocusSearch: rowSearch.openRowSearch,
        onGoToNextPage() {
          if (hasStagedChanges) {
            triggerDiscardButtonWiggle();
            return;
          }

          if (!canGoToNextPage) {
            return;
          }

          setPaginationState((previous) => ({
            ...previous,
            pageIndex: previous.pageIndex + 1,
          }));
        },
        onGoToPreviousPage() {
          if (hasStagedChanges) {
            triggerDiscardButtonWiggle();
            return;
          }

          if (!canGoToPreviousPage) {
            return;
          }

          setPaginationState((previous) => ({
            ...previous,
            pageIndex: previous.pageIndex - 1,
          }));
        },
        onInsertRow: newStagedRow,
        onRefresh: () => void reload(),
        onRunFilterWithAi: handleAiPaletteFilter,
        onRunSearch: rowSearch.runRowSearch,
        onSaveStagedChanges: () => setSaveDialogOpen(true),
        saveStagedChangesLabel: getSaveStagedRowsLabel(totalStagedRowCount),
      }),
    [
      canGoToNextPage,
      canGoToPreviousPage,
      focusAiPaletteFilter,
      handleAiPaletteFilter,
      hasAiFilter,
      hasStagedChanges,
      isInserting,
      newStagedRow,
      reload,
      rowSearch.openRowSearch,
      rowSearch.runRowSearch,
      totalStagedRowCount,
      setPaginationState,
      triggerDiscardButtonWiggle,
    ],
  );

  useRegisterCommandPaletteActions(commandPaletteActions);

  function handleCellInputSubmit(
    value: unknown,
    column: Column,
    row: Record<string, unknown>,
  ): void {
    const rowId = String(row.__ps_rowid ?? "");

    if (!rowId) {
      return;
    }

    setStagedUpdates((previous) =>
      upsertStagedCellUpdate(previous, {
        columnName: column.name,
        row,
        rowId,
        value,
      }),
    );
  }

  function handleEditorNavigate(params: {
    columnId: string;
    direction: CellEditNavigationDirection;
    rowKey: string;
    rowKind: EditableRowKind;
  }) {
    const nextTarget = getAdjacentEditorTarget({
      columnId: params.columnId,
      direction: params.direction,
      editableColumnIds,
      rowKey: params.rowKey,
      rowKind: params.rowKind,
      rows: editorRows,
    });

    setActiveEditorCellKey(
      nextTarget
        ? createEditorCellKey({
            columnId: nextTarget.columnId,
            rowKey: nextTarget.rowKey,
            rowKind: nextTarget.rowKind,
          })
        : null,
    );
  }

  const closePersistedEditor = useCallback(
    (params: { columnId: string; editorCellKey: string; rowIndex: number }) => {
      flushSync(() => {
        handleFocusedCellChange({
          columnId: params.columnId,
          rowIndex: params.rowIndex,
        });
        setActiveEditorCellKey((current) =>
          current === params.editorCellKey ? null : current,
        );
      });
    },
    [handleFocusedCellChange],
  );

  const openFocusedCellEditor = useCallback(
    (focusedCell: GridFocusedCell | null) => {
      if (!focusedCell || !editableColumnIds.includes(focusedCell.columnId)) {
        return;
      }

      const targetRow = editorRows[focusedCell.rowIndex];

      if (!targetRow) {
        return;
      }

      setActiveEditorCellKey(
        createEditorCellKey({
          columnId: focusedCell.columnId,
          rowKey: targetRow.rowKey,
          rowKind: targetRow.rowKind,
        }),
      );
    },
    [editableColumnIds, editorRows],
  );

  const previousActiveEditorCellKeyRef = useRef<string | null>(null);
  const lastFocusedCellNavigationAtRef = useRef(0);
  const lastAppliedNavigationGridFocusRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTableId || tableGridFocusRequest.tableId !== activeTableId) {
      return;
    }

    const requestToken = `${activeTableId}:${tableGridFocusRequest.requestId}`;

    if (lastAppliedNavigationGridFocusRequestRef.current === requestToken) {
      return;
    }

    lastAppliedNavigationGridFocusRequestRef.current = requestToken;
    setGridFocusRequestId((previous) => previous + 1);
  }, [
    activeTableId,
    tableGridFocusRequest.requestId,
    tableGridFocusRequest.tableId,
  ]);

  useLayoutEffect(() => {
    if (previousActiveEditorCellKeyRef.current && !activeEditorCellKey) {
      document
        .querySelector<HTMLElement>('[data-grid-scroll-container="true"]')
        ?.focus({
          preventScroll: true,
        });
      setGridFocusRequestId((previous) => previous + 1);
    }

    previousActiveEditorCellKeyRef.current = activeEditorCellKey;
  }, [activeEditorCellKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeEditorCellKey) {
        return;
      }

      if (isKeyboardEditableElement(document.activeElement)) {
        return;
      }

      if (
        document.querySelector(
          '[role="dialog"]:not([data-studio-cell-editor="true"])',
        )
      ) {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (!resolvedFocusedCell) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        openFocusedCellEditor(resolvedFocusedCell);
        return;
      }

      const direction = getFocusedCellDirection(event.key);

      if (!direction) {
        return;
      }

      const now = Date.now();

      if (
        event.repeat &&
        now - lastFocusedCellNavigationAtRef.current <
          FOCUSED_CELL_REPEAT_DELAY_MS
      ) {
        event.preventDefault();
        return;
      }

      const nextFocusedCell = moveFocusedCell({
        columnIds: focusedColumnIds,
        direction,
        focusedCell: resolvedFocusedCell,
        rowCount: editorRows.length,
      });

      if (!nextFocusedCell) {
        return;
      }

      event.preventDefault();
      lastFocusedCellNavigationAtRef.current = now;

      if (event.shiftKey) {
        const selectionStart =
          getCellSelectionAnchor(gridSelectionState) ??
          toPersistedSelectionCoordinate({
            columnIds: focusedColumnIds,
            focusedCell: resolvedFocusedCell,
            stagedRowCount: stagedRows.length,
          });
        const selectionEnd = toPersistedSelectionCoordinate({
          columnIds: focusedColumnIds,
          focusedCell: nextFocusedCell,
          stagedRowCount: stagedRows.length,
        });

        if (selectionStart && selectionEnd) {
          setRowSelectionState({});
          setGridSelectionState((previous) =>
            transitionGridSelectionMachine(previous, {
              type: "cell.select",
              end: selectionEnd,
              start: selectionStart,
            }),
          );
        }

        handleFocusedCellChange(nextFocusedCell);
        return;
      }

      setRowSelectionState({});
      setGridSelectionState((previous) =>
        transitionGridSelectionMachine(previous, {
          type: "reset",
        }),
      );
      handleFocusedCellChange(nextFocusedCell);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeEditorCellKey,
    editorRows.length,
    focusedColumnIds,
    gridSelectionState,
    handleFocusedCellChange,
    openFocusedCellEditor,
    resolvedFocusedCell,
    setGridSelectionState,
    setRowSelectionState,
    stagedRows.length,
  ]);

  function canWriteToCell(params: {
    columnId: string;
    row: Record<string, unknown>;
  }): boolean {
    if (!activeTable) {
      return false;
    }

    const { columnId } = params;
    const column = activeTable.columns[columnId];

    if (!column) {
      return false;
    }

    return isWritableColumn(column, readonly);
  }

  function handlePasteSelection(changes: GridPasteChange[]) {
    if (!activeTable || changes.length === 0) {
      return;
    }

    const rowChangesById = new Map<
      string,
      { row: Record<string, unknown>; changes: Record<string, unknown> }
    >();

    for (const change of changes) {
      const row = rows[change.rowIndex];

      if (!row) {
        continue;
      }

      const column = activeTable.columns[change.columnId];

      if (!column || !canWriteToCell({ columnId: column.name, row })) {
        continue;
      }

      const rowId = String(row.__ps_rowid);
      const existing = rowChangesById.get(rowId);
      const coerced = coerceToValue(column, "=", change.value);

      if (!existing) {
        rowChangesById.set(rowId, {
          row,
          changes: { [column.name]: coerced },
        });
        continue;
      }

      existing.changes[column.name] = coerced;
    }

    if (rowChangesById.size === 0) {
      return;
    }

    setStagedUpdates((previous) =>
      upsertStagedRowUpdates(previous, [...rowChangesById.values()]),
    );

    toast.success(
      `Bulk paste staged for ${rowChangesById.size} row${rowChangesById.size === 1 ? "" : "s"}`,
    );
  }

  // real column definitions that correspond to database columns
  const concreteColumnDefs = Object.values(activeTable?.columns ?? {})
    .sort(compareColumnsForEditing)
    .map((column) => {
      return {
        id: column.name,
        accessorKey: column.name,
        meta: column,
        header({ table, header }) {
          return (props: Omit<CellProps, "children" | "ref">) => {
            return (
              <DataGridDraggableHeaderCell
                table={table}
                header={header}
                {...props}
              >
                <DataGridHeader
                  header={header}
                  column={column}
                  isSortDisabled={hasStagedChanges}
                  onBlockedSortInteraction={triggerDiscardButtonWiggle}
                />
              </DataGridDraggableHeaderCell>
            );
          };
        },
        cell({ cell }) {
          return (props: Omit<CellProps, "children" | "ref">) => {
            const baseRow = rows[cell.row.index] ?? cell.row.original;
            const rowId = String(baseRow.__ps_rowid ?? "");
            const visualRowIndex = stagedRows.length + cell.row.index;
            const editorCellKey = createEditorCellKey({
              columnId: column.name,
              rowKey: rowId,
              rowKind: "persisted",
            });
            const isEditorOpen = activeEditorCellKey === editorCellKey;
            const stagedUpdate = stagedUpdateMap.get(rowId);
            const isCellStaged = Boolean(
              stagedUpdate &&
              Object.prototype.hasOwnProperty.call(
                stagedUpdate.changes,
                column.name,
              ),
            );
            const isFocused =
              resolvedFocusedCell?.rowIndex === visualRowIndex &&
              resolvedFocusedCell.columnId === column.name;

            if (column.isAutoincrement || column.isComputed) {
              return (
                <Cell
                  {...props}
                  className={cn(
                    props.className,
                    isFocused && focusedCellClassName,
                  )}
                  data-focused={isFocused || undefined}
                  data-grid-visual-row-index={visualRowIndex}
                  withContextMenu={false}
                >
                  {getCell({ cell, column, searchTerm: activeRowSearchTerm })}
                </Cell>
              );
            }

            return (
              <WriteableCell
                cellComponent={getCell({
                  cell,
                  column,
                  searchTerm: activeRowSearchTerm,
                })}
                containerProps={{
                  ...props,
                  "data-focused": isFocused || undefined,
                  "data-grid-visual-row-index": visualRowIndex,
                  className: cn(
                    props.className,
                    isFocused && isCellStaged
                      ? focusedStagedCellClassName
                      : isFocused
                        ? focusedCellClassName
                        : isCellStaged
                          ? stagedCellClassName
                          : undefined,
                  ),
                }}
                inputComponent={
                  isEditorOpen
                    ? getInput({
                        cell,
                        column,
                        context: "edit",
                        onNavigate(direction) {
                          handleEditorNavigate({
                            columnId: column.name,
                            direction,
                            rowKey: rowId,
                            rowKind: "persisted",
                          });
                        },
                        onSubmit(value) {
                          handleCellInputSubmit(value, column, baseRow);
                          closePersistedEditor({
                            columnId: column.name,
                            editorCellKey,
                            rowIndex: visualRowIndex,
                          });
                        },
                        readonly,
                        showSaveAction: false,
                      })
                    : null
                }
                isEditorOpen={isEditorOpen}
                linkComponent={Link({
                  cell,
                  column,
                  createUrl,
                  introspection,
                })}
                onRequestClose={() =>
                  closePersistedEditor({
                    columnId: column.name,
                    editorCellKey,
                    rowIndex: visualRowIndex,
                  })
                }
                onRequestOpen={() => {
                  handleFocusedCellChange({
                    columnId: column.name,
                    rowIndex: visualRowIndex,
                  });
                  setActiveEditorCellKey(editorCellKey);
                }}
              />
            );
          };
        },
      } satisfies ColumnDef<Record<string, unknown>>;
    });

  const backRelationColumnDefs = backRelationColumns.map((column) => {
    return {
      accessorFn: () => null,
      enableSorting: false,
      id: column.name,
      meta: column,
      header({ table, header }) {
        return (props: Omit<CellProps, "children" | "ref">) => {
          return (
            <DataGridDraggableHeaderCell
              table={table}
              header={header}
              {...props}
            >
              <BackRelationHeaderCell name={column.name} />
            </DataGridDraggableHeaderCell>
          );
        };
      },
      cell({ cell }) {
        return (props: Omit<CellProps, "children" | "ref">) => {
          const baseRow = rows[cell.row.index] ?? cell.row.original;
          const visualRowIndex = stagedRows.length + cell.row.index;
          const isFocused =
            resolvedFocusedCell?.rowIndex === visualRowIndex &&
            resolvedFocusedCell.columnId === column.name;

          return (
            <Cell
              {...props}
              className={cn(props.className, isFocused && focusedCellClassName)}
              data-focused={isFocused || undefined}
              data-grid-visual-row-index={visualRowIndex}
              withContextMenu={false}
            >
              <div className="flex h-full w-full items-center justify-end">
                <RelationLink
                  createUrl={createUrl}
                  filterColumn={column.sourceColumn}
                  filterValue={baseRow[column.currentColumnName]}
                  introspection={introspection}
                  targetSchema={column.sourceSchema}
                  targetTable={column.sourceTable}
                />
              </div>
            </Cell>
          );
        };
      },
    } satisfies ColumnDef<Record<string, unknown>>;
  });

  // these are columns that exist virtually and are not db columns
  const virtualColumnDefs = [
    {
      id: "__ps_select",
      accessorKey: "__ps_select",
      enablePinning: true,
      enableResizing: false,
      enableSorting: false,
      size: 35,
      minSize: 35,
      header({ table }) {
        return (props: Omit<CellProps, "children" | "ref">) => {
          return (
            <TableHead {...props} aria-label="Row selection spacer">
              <div className="flex items-center justify-center h-full w-full">
                <CheckboxTable
                  checked={table.getIsAllRowsSelected()}
                  className="pointer-events-none h-4 w-4"
                />
              </div>
            </TableHead>
          );
        };
      },
      cell({ row }) {
        return (props: Omit<CellProps, "children" | "ref">) => {
          return (
            <Cell data-select="true" {...props}>
              <div className="flex items-center justify-center h-full w-full">
                <CheckboxTable
                  checked={row.getIsSelected()}
                  className="pointer-events-none h-4 w-4"
                />
              </div>
            </Cell>
          );
        };
      },
    },
  ] satisfies (ColumnDef<Record<string, unknown>> & {
    disableDragging?: boolean;
  })[];

  const columnDefs: (ColumnDef<Record<string, unknown>> & {
    disableDragging?: boolean;
  })[] = [
    ...concreteColumnDefs,
    ...virtualColumnDefs,
    ...backRelationColumnDefs,
  ];

  if (!activeTable) {
    return null;
  }

  return (
    <>
      <StudioHeader
        className={
          editingFilter.filters.length > 0 ? "border-b-0 pb-2" : undefined
        }
        endContent={
          <>
            {tableHistoryUrl ? (
              <Button
                aria-label={tableHistoryAriaLabel ?? "Open table history"}
                variant="outline"
                size="icon"
                asChild
              >
                <a href={tableHistoryUrl}>
                  <History data-icon="inline-start" />
                </a>
              </Button>
            ) : null}
            <Button
              aria-label="Refresh table"
              variant="outline"
              size="icon"
              onClick={() => void reload()}
              disabled={isFetching}
            >
              <RefreshCw
                data-icon="inline-start"
                className={cn(isFetching && "animate-spin")}
              />
            </Button>
          </>
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          <ExpandableSearchControl
            disabled={hasStagedChanges}
            onBlockedInteraction={triggerDiscardButtonWiggle}
            rowSearch={rowSearch}
            supportsSearch={supportsFullTableSearch}
          />
        </div>
        <InlineTableFilterAddButton
          aiFilter={hasAiFilter ? requestAiFilter : undefined}
          aiFocusRequestKey={aiFocusRequestKey}
          applyEditingFilter={applyEditingFilter}
          disabled={hasStagedChanges}
          editingFilter={editingFilter}
          filterOperators={introspection.filterOperators}
          onBlockedInteraction={triggerDiscardButtonWiggle}
          setEditingFilter={setEditingFilter}
          table={activeTable}
          totalEditingFilters={totalEditingFilters}
        />
        <Button
          variant="outline"
          className="h-9 px-5"
          onClick={newStagedRow}
          disabled={isInserting > 0}
        >
          Insert row
        </Button>
        {hasSelectionExport && (
          <DropdownMenu
            open={isSelectionExportOpen}
            onOpenChange={(open) => {
              setSelectionExportOpen(open);

              if (open) {
                setIncludeSelectionExportHeader(true);
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                aria-expanded={isSelectionExportOpen}
                aria-label="Copy selection as"
                variant="outline"
                className={cn(
                  "h-9 shrink-0 gap-1.5 px-3 font-sans",
                  isSelectionExportOpen && "bg-accent text-accent-foreground",
                )}
              >
                <span>copy as</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="bottom"
              className="w-[220px] max-w-[calc(100vw-2rem)] overflow-hidden p-1 font-sans"
            >
              <DropdownMenuCheckboxItem
                checked={includeSelectionExportHeader}
                className="rounded-lg font-sans text-sm font-medium"
                onCheckedChange={(checked) =>
                  setIncludeSelectionExportHeader(checked === true)
                }
                onSelect={(event) => {
                  event.preventDefault();
                }}
              >
                include column header
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <div className="p-0.5">
                {[
                  {
                    action: () => handleCopySelectionExport("markdown"),
                    label: "copy markdown",
                  },
                  {
                    action: () => handleCopySelectionExport("csv"),
                    label: "copy csv",
                  },
                  {
                    action: () => handleSaveSelectionExport("markdown"),
                    label: "save markdown",
                  },
                  {
                    action: () => handleSaveSelectionExport("csv"),
                    label: "save csv",
                  },
                ].map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    className="rounded-lg font-sans text-sm font-medium"
                    onSelect={item.action}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {hasStagedChanges && (
          <>
            <Button
              className="h-9 border border-emerald-300 bg-emerald-100 px-5 font-sans text-emerald-950 hover:bg-emerald-200"
              onClick={() => setSaveDialogOpen(true)}
            >
              {getSaveStagedRowsLabel(totalStagedRowCount)}
            </Button>
            <Button
              data-wiggle-animation={
                discardWiggleAnimationKey
                  ? `${discardWiggleAnimationKey}-${discardWiggleCount}`
                  : undefined
              }
              variant="outline"
              className={cn(
                "h-9 border-amber-300 bg-amber-100 px-4 font-sans text-amber-950 hover:border-amber-400 hover:bg-amber-200 motion-safe:origin-center motion-safe:will-change-transform",
                discardWiggleAnimationClassName,
              )}
              onClick={() => setDiscardDialogOpen(true)}
            >
              Discard edits
            </Button>
          </>
        )}
        {isSelecting && selectedRowCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            {deleteSelectionLabel}
          </Button>
        )}
      </StudioHeader>
      <InlineTableFiltersHeaderRow
        applyEditingFilter={applyEditingFilter}
        disabled={hasStagedChanges}
        editingFilter={editingFilter}
        filterOperators={introspection.filterOperators}
        onBlockedInteraction={triggerDiscardButtonWiggle}
        setEditingFilter={setEditingFilter}
        sqlFilterLint={sqlFilterLint}
        table={activeTable}
      />
      <DataGrid
        areRowsInViewActionsLocked={hasStagedChanges}
        canWriteToCell={canWriteToCell}
        columnDefs={columnDefs}
        focusScrollContainerKey={gridFocusRequestId || undefined}
        focusRowIndexOffset={stagedRows.length}
        focusedCell={resolvedFocusedCell}
        getBeforeRows={(table) => (
          <StagedRows
            activeEditorCellKey={activeEditorCellKey}
            focusedCell={resolvedFocusedCell}
            onEditorNavigate={handleEditorNavigate}
            onFocusedCellChange={handleFocusedCellChange}
            setActiveEditorCellKey={setActiveEditorCellKey}
            setStagedRows={setStagedRows}
            stagedRows={stagedRows}
            table={table}
          />
        )}
        hasMoreInfiniteRows={hasMoreInfiniteRows}
        infiniteScrollEnabled={isInfiniteScrollEnabled}
        isFetching={isFetching}
        isProcessing={isMutating}
        onFocusedCellChange={handleFocusedCellChange}
        onBlockedRowsInViewAction={triggerDiscardButtonWiggle}
        onInfiniteScrollEnabledChange={handleInfiniteScrollEnabledChange}
        onLoadMoreRows={handleLoadMoreRows}
        onPinnedColumnIdsChange={setPinnedColumnIds}
        onPaginationChange={setPaginationState}
        onPasteSelection={handlePasteSelection}
        onRowSelectionChange={setRowSelectionState}
        onSortingChange={setSortingState}
        pageCount={pageCount}
        paginationState={paginationState}
        pinnedColumnIds={pinnedColumnIds}
        rows={displayRows}
        rowSelectionState={rowSelectionState}
        selectionScopeKey={selectionScopeKey}
        sortingState={sortingState}
      />
      <BinaryAlertDialog
        onOpenChange={setDeleteDialogOpen}
        onPrimaryAction={confirmDeleteSelection}
        open={isDeleteDialogOpen}
        primaryLabel="delete"
        primaryVariant="destructive"
        prompt={deleteConfirmationPrompt}
        secondaryLabel="keep"
        title="Confirm row deletion"
      />
      <BinaryAlertDialog
        onOpenChange={setSaveDialogOpen}
        onPrimaryAction={() => {
          setSaveDialogOpen(false);
          saveStagedRows();
        }}
        open={isSaveDialogOpen}
        primaryLabel="yes, write to db"
        prompt={saveConfirmationPrompt}
        secondaryLabel="no, keep editing"
        title="Confirm staged row save"
      />
      <BinaryAlertDialog
        onOpenChange={setDiscardDialogOpen}
        onPrimaryAction={confirmDiscardStagedChanges}
        open={isDiscardDialogOpen}
        primaryLabel="yes, discard"
        primaryVariant="destructive"
        prompt={discardConfirmationPrompt}
        secondaryLabel="no, keep editing"
        title="Confirm staged edit discard"
      />
    </>
  );
}

function getDeleteSelectionLabel(selectedRowCount: number) {
  return `Delete ${selectedRowCount} ${selectedRowCount === 1 ? "row" : "rows"}`;
}

function getDeleteConfirmationPrompt(selectedRowCount: number) {
  return `Do you want to delete ${selectedRowCount} ${selectedRowCount === 1 ? "row" : "rows"}?`;
}

function getSelectionExportColumnIds(args: {
  defaultColumnIds: string[];
  columnOrder: string[];
  columnPinning: ColumnPinningState;
}) {
  const { columnOrder, columnPinning, defaultColumnIds } = args;
  const validColumnIds = new Set(defaultColumnIds);
  const orderedColumnIds = [
    ...columnOrder.filter((columnId) => validColumnIds.has(columnId)),
    ...defaultColumnIds.filter((columnId) => !columnOrder.includes(columnId)),
  ];
  const pinnedColumnIds = (columnPinning.left ?? []).filter(
    (columnId) => columnId !== "__ps_select" && validColumnIds.has(columnId),
  );
  const seen = new Set<string>();

  return [...pinnedColumnIds, ...orderedColumnIds].filter((columnId) => {
    if (seen.has(columnId)) {
      return false;
    }

    seen.add(columnId);
    return true;
  });
}

type EditableRowKind = "insert" | "persisted";

interface EditableGridRow {
  row: Record<string, unknown>;
  rowKey: string;
  rowKind: EditableRowKind;
}

const STAGED_ROW_DRAFT_ID_KEY = "__ps_draft_id";

function createEditorCellKey(args: {
  columnId: string;
  rowKey: string;
  rowKind: EditableRowKind;
}) {
  return `${args.rowKind}:${args.rowKey}:${args.columnId}`;
}

function createEmptyStagedRowDraft(): Record<string, unknown> {
  return {
    [STAGED_ROW_DRAFT_ID_KEY]: crypto.randomUUID(),
  };
}

function getStagedRowDraftId(row: Record<string, unknown>, rowIndex: number) {
  const draftId = row[STAGED_ROW_DRAFT_ID_KEY];

  return typeof draftId === "string" && draftId.length > 0
    ? draftId
    : `draft-${rowIndex}`;
}

function stripDraftMetadataFromStagedRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const { [STAGED_ROW_DRAFT_ID_KEY]: _draftId, ...persistableRow } = row;

    return persistableRow;
  });
}

function getEditableColumnIds(
  columns: Record<string, Column> | undefined,
  readonly: boolean,
) {
  return Object.values(columns ?? {})
    .filter((column) => isWritableColumn(column, readonly))
    .sort(compareColumnsForEditing)
    .map((column) => column.name);
}

function buildEditorRows(args: {
  displayRows: Record<string, unknown>[];
  persistedRows: Record<string, unknown>[];
  stagedRows: Record<string, unknown>[];
}): EditableGridRow[] {
  const { displayRows, persistedRows, stagedRows } = args;

  return [
    ...stagedRows.map((row, rowIndex) => ({
      row,
      rowKey: getStagedRowDraftId(row, rowIndex),
      rowKind: "insert" as const,
    })),
    ...displayRows.map((row, rowIndex) => ({
      row,
      rowKey: String(
        persistedRows[rowIndex]?.__ps_rowid ?? row.__ps_rowid ?? "",
      ),
      rowKind: "persisted" as const,
    })),
  ];
}

function getAdjacentEditorTarget(args: {
  columnId: string;
  direction: CellEditNavigationDirection;
  editableColumnIds: string[];
  rowKey: string;
  rowKind: EditableRowKind;
  rows: EditableGridRow[];
}) {
  const { columnId, direction, editableColumnIds, rowKey, rowKind, rows } =
    args;
  const rowIndex = rows.findIndex(
    (row) => row.rowKey === rowKey && row.rowKind === rowKind,
  );
  const columnIndex = editableColumnIds.indexOf(columnId);

  if (rowIndex === -1 || columnIndex === -1) {
    return null;
  }

  if (direction === "tab") {
    const nextColumnIndex = columnIndex + 1;

    if (nextColumnIndex < editableColumnIds.length) {
      return {
        columnId: editableColumnIds[nextColumnIndex]!,
        rowKey,
        rowKind,
      };
    }

    const nextRow = rows[rowIndex + 1];

    if (!nextRow) {
      return null;
    }

    return {
      columnId: editableColumnIds[0]!,
      rowKey: nextRow.rowKey,
      rowKind: nextRow.rowKind,
    };
  }

  if (direction === "left" || direction === "right") {
    const delta = direction === "left" ? -1 : 1;
    const targetColumnId = editableColumnIds[columnIndex + delta];

    if (!targetColumnId) {
      return null;
    }

    return {
      columnId: targetColumnId,
      rowKey,
      rowKind,
    };
  }

  const targetRow = rows[rowIndex + (direction === "up" ? -1 : 1)];

  if (!targetRow) {
    return null;
  }

  return {
    columnId,
    rowKey: targetRow.rowKey,
    rowKind: targetRow.rowKind,
  };
}

function isWritableColumn(column: Column, readonly: boolean) {
  return !readonly && !column.isAutoincrement && !column.isComputed;
}

function compareColumnsForEditing(left: Column, right: Column) {
  const leftPk = left.pkPosition || Infinity;
  const rightPk = right.pkPosition || Infinity;
  const delta = leftPk - rightPk;

  if (Number.isFinite(delta)) {
    return delta || left.name.localeCompare(right.name);
  }

  if (Number.isNaN(delta)) {
    return left.name.localeCompare(right.name);
  }

  return delta;
}

function getDefaultTableColumnIds(args: {
  backRelationColumns: BackRelationColumnMeta[];
  columns: Record<string, Column> | undefined;
}) {
  const { backRelationColumns, columns } = args;

  return [
    ...Object.values(columns ?? {})
      .sort(compareColumnsForEditing)
      .map((column) => column.name),
    ...backRelationColumns.map((column) => column.name),
  ];
}

function resolveWalHistoryKeyClause(args: {
  columns: Record<string, Column> | undefined;
  rows: Record<string, unknown>[];
  rowSelectionState: Record<string, boolean>;
}): string | null {
  const { columns, rows, rowSelectionState } = args;
  const selectedRowIds = Object.entries(rowSelectionState)
    .filter(([, isSelected]) => isSelected)
    .map(([rowId]) => rowId);

  if (selectedRowIds.length !== 1) {
    return null;
  }

  const primaryKeyColumns = Object.values(columns ?? {})
    .filter((column) => column.pkPosition != null)
    .sort((left, right) => (left.pkPosition ?? 0) - (right.pkPosition ?? 0));

  if (primaryKeyColumns.length !== 1) {
    return null;
  }

  const selectedRow = rows.find(
    (row) => String(row.__ps_rowid ?? "") === selectedRowIds[0],
  );

  if (!selectedRow) {
    return null;
  }

  const primaryKeyValue = selectedRow[primaryKeyColumns[0]!.name];

  if (primaryKeyValue == null) {
    return null;
  }

  return `key:${JSON.stringify(String(primaryKeyValue))}`;
}

function BackRelationHeaderCell(props: { name: string }) {
  const { name } = props;

  return (
    <div className="flex h-full min-w-0 items-center px-2">
      <span className="min-w-0 truncate font-mono text-xs text-foreground/90">
        {name}
      </span>
    </div>
  );
}

function upsertStagedCellUpdate(
  stagedUpdates: NonNullable<TableUiState["stagedUpdates"]>,
  args: {
    columnName: string;
    row: Record<string, unknown>;
    rowId: string;
    value: unknown;
  },
) {
  const { columnName, row, rowId, value } = args;
  const nextStagedUpdates = [...stagedUpdates];
  const existingIndex = nextStagedUpdates.findIndex(
    (stagedUpdate) => stagedUpdate.rowId === rowId,
  );
  const existing = nextStagedUpdates[existingIndex];
  const baseRow = existing?.row ?? row;
  const nextChanges = { ...(existing?.changes ?? {}) };

  if (isDeepEqual(baseRow[columnName], value)) {
    delete nextChanges[columnName];
  } else {
    nextChanges[columnName] = value;
  }

  if (Object.keys(nextChanges).length === 0) {
    if (existingIndex !== -1) {
      nextStagedUpdates.splice(existingIndex, 1);
    }

    return nextStagedUpdates;
  }

  const nextStagedUpdate = {
    changes: nextChanges,
    row: baseRow,
    rowId,
  };

  if (existingIndex === -1) {
    nextStagedUpdates.push(nextStagedUpdate);
    return nextStagedUpdates;
  }

  nextStagedUpdates[existingIndex] = nextStagedUpdate;
  return nextStagedUpdates;
}

function upsertStagedRowUpdates(
  stagedUpdates: NonNullable<TableUiState["stagedUpdates"]>,
  updates: Array<{
    changes: Record<string, unknown>;
    row: Record<string, unknown>;
  }>,
) {
  let nextStagedUpdates = stagedUpdates;

  for (const update of updates) {
    const rowId = String(update.row.__ps_rowid ?? "");

    if (!rowId) {
      continue;
    }

    for (const [columnName, value] of Object.entries(update.changes)) {
      nextStagedUpdates = upsertStagedCellUpdate(nextStagedUpdates, {
        columnName,
        row: update.row,
        rowId,
        value,
      });
    }
  }

  return nextStagedUpdates;
}

function getSaveStagedRowsLabel(rowCount: number) {
  return `Save ${rowCount} ${rowCount === 1 ? "row" : "rows"}`;
}

function getDiscardConfirmationPrompt(cellCount: number) {
  return `Discard edits to ${cellCount} ${cellCount === 1 ? "cell" : "cells"}?`;
}

function getSaveConfirmationPrompt(rowCount: number) {
  return `Commit ${rowCount} updated ${rowCount === 1 ? "row" : "rows"} to the database?`;
}

function getSaveStagedRowsSuccessMessage(rowCount: number) {
  return `${rowCount === 1 ? "Row" : "Rows"} saved successfully`;
}

function getStagedCellCount(args: {
  stagedRows: Record<string, unknown>[];
  stagedUpdates: Array<{ changes: Record<string, unknown> }>;
}) {
  const { stagedRows, stagedUpdates } = args;
  const stagedRowCellCount = stagedRows.reduce((count, row) => {
    const draftCellCount = Object.keys(row).filter(
      (key) => key !== STAGED_ROW_DRAFT_ID_KEY,
    ).length;

    return count + Math.max(draftCellCount, 1);
  }, 0);
  const stagedUpdateCellCount = stagedUpdates.reduce(
    (count, stagedUpdate) => count + Object.keys(stagedUpdate.changes).length,
    0,
  );

  return stagedRowCellCount + stagedUpdateCellCount;
}

function getFocusedCellDirection(key: string) {
  switch (key) {
    case "ArrowUp":
      return "up" as const;
    case "ArrowDown":
      return "down" as const;
    case "ArrowLeft":
      return "left" as const;
    case "ArrowRight":
      return "right" as const;
    default:
      return null;
  }
}

function isKeyboardEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (!target.isConnected) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  return target.isContentEditable;
}

function toPersistedSelectionCoordinate(args: {
  columnIds: string[];
  focusedCell: GridFocusedCell | null;
  stagedRowCount: number;
}): GridCellCoordinate | null {
  const { columnIds, focusedCell, stagedRowCount } = args;

  if (!focusedCell || focusedCell.rowIndex < stagedRowCount) {
    return null;
  }

  const columnIndex = columnIds.indexOf(focusedCell.columnId);

  if (columnIndex === -1) {
    return null;
  }

  return {
    columnId: focusedCell.columnId,
    columnIndex,
    rowIndex: focusedCell.rowIndex - stagedRowCount,
  };
}

function isGridFocusedCell(value: unknown): value is GridFocusedCell | null {
  if (value == null) {
    return true;
  }

  if (typeof value !== "object") {
    return false;
  }

  return (
    "columnId" in value &&
    typeof value.columnId === "string" &&
    "rowIndex" in value &&
    Number.isInteger(value.rowIndex)
  );
}

function handleBinaryDialogKeyDown(args: {
  event: ReactKeyboardEvent<HTMLDivElement>;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  primaryRef: { current: HTMLButtonElement | null };
  secondaryRef: { current: HTMLButtonElement | null };
}) {
  const {
    event,
    onPrimaryAction,
    onSecondaryAction,
    primaryRef,
    secondaryRef,
  } = args;

  if (
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight" &&
    event.key !== "ArrowUp" &&
    event.key !== "ArrowDown" &&
    event.key !== "Enter"
  ) {
    return;
  }

  const activeElement = document.activeElement;
  const activeAction =
    activeElement === secondaryRef.current ? "secondary" : "primary";

  if (event.key === "Enter") {
    event.preventDefault();

    if (activeAction === "primary") {
      onPrimaryAction();
      return;
    }

    onSecondaryAction();
    return;
  }

  event.preventDefault();

  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    primaryRef.current?.focus();
    return;
  }

  secondaryRef.current?.focus();
}

type BinaryAlertDialogProps = {
  onOpenChange: (open: boolean) => void;
  onPrimaryAction: () => void;
  open: boolean;
  primaryClassName?: string;
  primaryLabel: string;
  primaryVariant?: ButtonProps["variant"];
  prompt: string;
  secondaryLabel: string;
  title: string;
};

function BinaryAlertDialog(props: BinaryAlertDialogProps) {
  const {
    onOpenChange,
    onPrimaryAction,
    open,
    primaryClassName,
    primaryLabel,
    primaryVariant = "default",
    prompt,
    secondaryLabel,
    title,
  } = props;
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const secondaryButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleSecondaryAction = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-[280px] gap-2.5 p-3 font-sans"
        onKeyDown={(event) =>
          handleBinaryDialogKeyDown({
            event,
            onPrimaryAction,
            onSecondaryAction: handleSecondaryAction,
            primaryRef: primaryButtonRef,
            secondaryRef: secondaryButtonRef,
          })
        }
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          primaryButtonRef.current?.focus();
        }}
      >
        <AlertDialogHeader className="gap-0 text-left">
          <AlertDialogTitle className="sr-only">{title}</AlertDialogTitle>
          <AlertDialogDescription className="font-sans text-[13px] leading-5 text-foreground">
            {prompt}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-end gap-1.5">
          <AlertDialogAction
            ref={primaryButtonRef}
            size="sm"
            variant={primaryVariant}
            className={primaryClassName}
            onClick={onPrimaryAction}
          >
            {primaryLabel}
          </AlertDialogAction>
          <AlertDialogCancel
            ref={secondaryButtonRef}
            size="sm"
            variant="secondary"
            onClick={handleSecondaryAction}
          >
            {secondaryLabel}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function adapterSupportsSqlLint(adapter: Adapter): adapter is Adapter & {
  sqlLint: NonNullable<Adapter["sqlLint"]>;
} {
  return typeof adapter.sqlLint === "function";
}

function getPageCount(
  rowCount: number | bigint | NumericString | BigIntString,
  pageSize: number,
): number | undefined {
  if (rowCount === Infinity) {
    return;
  }

  const pageCount = Number(
    (BigInt(rowCount) + BigInt(pageSize) - BigInt(1)) / BigInt(pageSize),
  );

  return Number.isSafeInteger(pageCount) ? pageCount : Number.MAX_SAFE_INTEGER;
}

function getInfiniteScrollResetKey(args: {
  activeRowSearchTerm: string;
  filter: FilterGroup;
  pageSize: number;
  selectionScopeKey: string | undefined;
  sortingState: ReturnType<typeof useSorting>["sortingState"];
}): string {
  const {
    activeRowSearchTerm,
    filter,
    pageSize,
    selectionScopeKey,
    sortingState,
  } = args;

  return JSON.stringify({
    activeRowSearchTerm,
    filter,
    pageSize,
    sortingState,
    table: selectionScopeKey ?? "",
  });
}

function hasMoreRowsToLoad(
  rowCount: number | bigint | NumericString | BigIntString,
  loadedRowCount: number,
): boolean {
  if (rowCount === Infinity) {
    return true;
  }

  return BigInt(rowCount) > BigInt(loadedRowCount);
}
