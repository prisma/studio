import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import type {
  Cell as ReactTableCellModel,
  ColumnDef,
  Header as ReactTableHeaderModel,
  Row as ReactTableRowModel,
  RowSelectionState,
} from "@tanstack/react-table";
import {
  type ColumnPinningState,
  type ColumnSizingState,
  getCoreRowModel,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  type Table as ReactTable,
  useReactTable,
} from "@tanstack/react-table";
import { AnimatePresence, motion } from "motion/react";
import {
  ComponentType,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SortOrderItem } from "../../../data/adapter";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { useUiState } from "../../hooks/use-ui-state";
import { isGridInteractionSuppressionActive } from "../../lib/grid-interaction-suppression";
import { setGridInteractionSuppressionWindow } from "../../lib/grid-interaction-suppression";
import { cn } from "../../lib/utils";
import type { CellProps } from "../cell/Cell";
import {
  buildClipboardText,
  buildPasteChanges,
  type GridCellCoordinate,
  type GridPasteChange,
  isCellInRange,
  parseClipboardMatrix,
} from "./cell-selection";
import {
  clampColumnSizingState,
  DEFAULT_GRID_COLUMN_MAX_SIZE,
  DEFAULT_GRID_COLUMN_MIN_SIZE,
  DEFAULT_GRID_COLUMN_SIZE,
  resolveColumnSizingStateUpdate,
} from "./column-sizing";
import { computeColumnVirtualizationWindow } from "./column-virtualization";
import { DataGridLoadingBar } from "./DataGridLoadingBar";
import { DataGridPagination } from "./DataGridPagination";
import { getColumnPinningStyles } from "./features/column-pinning";
import {
  focusedCellsAreEqual,
  getFocusedCellScrollLeft,
  type GridFocusedCell,
} from "./focused-cell";
import {
  getCellSelectionAnchor,
  getCellSelectionFocus,
  getCellSelectionRange,
  GRID_SELECTION_MACHINE_INITIAL_STATE,
  type GridSelectionMachineState,
  hasAnySelection,
  rowSelectionStateToIds,
  transitionGridSelectionMachine,
} from "./selection-state-machine";

const ROW_SELECTOR_COLUMN_ID = "__ps_select";
const COLUMN_VIRTUALIZATION_MIN_COLUMN_COUNT = 16;
const COLUMN_VIRTUALIZATION_OVERSCAN_PX = 320;
const DEFAULT_COLUMN_ORDER: string[] = [];
const DEFAULT_COLUMN_PINNING: ColumnPinningState = {
  left: [ROW_SELECTOR_COLUMN_ID],
  right: [],
};
const DEFAULT_COLUMN_SIZING: ColumnSizingState = {};
const GRID_LAYOUT_ANIMATION_DURATION_MS = 1000;
const FOCUSED_CELL_SCROLL_OPTIONS = {
  block: "nearest",
  inline: "nearest",
} as const;
const INFINITE_SCROLL_MIN_THRESHOLD_PX = 120;
const INFINITE_SCROLL_MAX_THRESHOLD_PX = 360;

type GridLayoutAnimationSnapshot = Map<string, { left: number; top: number }>;
type GridLayoutAnimationDeltas = Record<string, { x: number; y: number }>;

interface GridLayoutAnimationState {
  deltas: GridLayoutAnimationDeltas;
  phase: "from" | "true";
}

function getGridPinningAnimationKey(element: HTMLElement): string | null {
  const headerColumnId = element.dataset.gridHeaderColumnId;

  if (headerColumnId) {
    return `header:${headerColumnId}`;
  }

  const rowIndex = element.dataset.gridRowIndex;
  const columnId = element.dataset.gridColumnId;

  if (rowIndex != null && columnId) {
    return `cell:${rowIndex}:${columnId}`;
  }

  return null;
}

function getInfiniteScrollThresholdPx(clientHeight: number): number {
  if (!Number.isFinite(clientHeight) || clientHeight <= 0) {
    return INFINITE_SCROLL_MIN_THRESHOLD_PX;
  }

  return Math.max(
    INFINITE_SCROLL_MIN_THRESHOLD_PX,
    Math.min(INFINITE_SCROLL_MAX_THRESHOLD_PX, Math.round(clientHeight * 0.25)),
  );
}

function captureGridLayoutAnimationSnapshot(
  tableElement: HTMLTableElement,
): GridLayoutAnimationSnapshot {
  const snapshot: GridLayoutAnimationSnapshot = new Map();
  const elements = tableElement.querySelectorAll<HTMLElement>(
    "th[data-grid-header-column-id], td[data-grid-row-index][data-grid-column-id]",
  );

  elements.forEach((element) => {
    const key = getGridPinningAnimationKey(element);

    if (!key) {
      return;
    }

    const rect = element.getBoundingClientRect();
    snapshot.set(key, {
      left: rect.left,
      top: rect.top,
    });
  });

  return snapshot;
}

interface GridContextMenuTarget {
  columnId: string;
  rowIndex: number;
}

interface ActiveColumnDragState {
  columnId: string;
  width: number;
}

interface ActiveColumnDragMetrics {
  centerY: number;
  top: number;
  bottom: number;
}

export interface DataGridProps {
  areRowsInViewActionsLocked?: boolean;
  hasMoreInfiniteRows?: boolean;
  infiniteScrollEnabled?: boolean;
  pinnedColumnIds?: string[];
  focusScrollContainerKey?: number;
  focusRowIndexOffset?: number;
  focusedCell?: GridFocusedCell | null;
  selectionScopeKey?: string;
  columnDefs: ColumnDef<Record<string, unknown>, unknown>[];
  getBeforeHeaderRows?(
    this: void,
    table: ReactTable<Record<string, unknown>>,
  ): ReactNode;
  getBeforeRows?(
    this: void,
    table: ReactTable<Record<string, unknown>>,
  ): ReactNode;
  isFetching: boolean;
  isProcessing: boolean;
  onFocusedCellChange?: (focusedCell: GridFocusedCell | null) => void;
  onBlockedRowsInViewAction?: () => void;
  onPinnedColumnIdsChange?: (columnIds: string[]) => void;
  onInfiniteScrollEnabledChange?: (enabled: boolean) => void;
  onLoadMoreRows?: () => void;
  onPaginationChange: OnChangeFn<PaginationState>;
  onPasteSelection?: (changes: GridPasteChange[]) => Promise<void> | void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onSortingChange?: OnChangeFn<SortOrderItem[]>;
  pageCount: number | undefined;
  paginationState: PaginationState;
  rows: Record<string, unknown>[];
  rowSelectionState: RowSelectionState;
  sortingState?: SortOrderItem[];
  canWriteToCell?: (params: {
    columnId: string;
    row: Record<string, unknown>;
  }) => boolean;
}

export function getColumnDefinitionIdentityKey(
  columnDefs: ColumnDef<Record<string, unknown>, unknown>[],
): string {
  return getColumnOrderFromDefs(columnDefs).join("|");
}

function getColumnOrderFromDefs(
  columnDefs: ColumnDef<Record<string, unknown>, unknown>[],
): string[] {
  return columnDefs
    .map((columnDef) => {
      if (typeof columnDef.id === "string" && columnDef.id.length > 0) {
        return columnDef.id;
      }

      if (
        "accessorKey" in columnDef &&
        typeof columnDef.accessorKey === "string" &&
        columnDef.accessorKey.length > 0
      ) {
        return columnDef.accessorKey;
      }

      return "";
    })
    .filter((columnId) => columnId.length > 0);
}

function normalizePinnedColumnIds(
  columnIds: string[],
  validDataColumnIds: string[],
): string[] {
  const validColumnIdSet = new Set(validDataColumnIds);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const columnId of columnIds) {
    if (
      columnId === ROW_SELECTOR_COLUMN_ID ||
      !validColumnIdSet.has(columnId) ||
      seen.has(columnId)
    ) {
      continue;
    }

    seen.add(columnId);
    normalized.push(columnId);
  }

  return normalized;
}

function buildColumnPinningState(dataPinnedColumnIds: string[]) {
  return {
    left: [ROW_SELECTOR_COLUMN_ID, ...dataPinnedColumnIds],
    right: [],
  } satisfies ColumnPinningState;
}

function getDataPinnedColumnIds(pinning: ColumnPinningState): string[] {
  return (pinning.left ?? []).filter(
    (columnId) => columnId !== ROW_SELECTOR_COLUMN_ID,
  );
}

function arraysAreEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function pinningStatesAreEqual(
  left: ColumnPinningState,
  right: ColumnPinningState,
): boolean {
  return (
    arraysAreEqual(left.left ?? [], right.left ?? []) &&
    arraysAreEqual(left.right ?? [], right.right ?? [])
  );
}

type ColumnPinningZone = "left" | "center" | "right";

interface ResolveColumnDragReorderArgs {
  activeId: string;
  columnOrder: string[];
  columnPinning: ColumnPinningState;
  overId: string;
}

interface ResolveColumnDragReorderResult {
  didReorder: boolean;
  nextColumnOrder: string[];
  nextColumnPinning: ColumnPinningState;
}

interface ResolveColumnDragDropTargetArgs {
  activeId: string;
  columnPinning: ColumnPinningState;
  lastCompatibleOverId: string | null;
  overId: string | null;
}

interface ResolveColumnDragDropTargetResult {
  compatibleOverId: string | null;
  nextLastCompatibleOverId: string | null;
  resolvedDropTargetId: string | null;
}

interface ResolveDirectionalColumnDragTargetArgs {
  activeId: string;
  columnOrder: string[];
  columnPinning: ColumnPinningState;
  deltaX: number;
}

function reorderPinnedSubsetByColumnOrder(args: {
  columnOrder: string[];
  pinnedColumnIds: string[];
}): string[] {
  const { columnOrder, pinnedColumnIds } = args;
  const missingPinnedIds = new Set(pinnedColumnIds);
  const reorderedPinnedIds = columnOrder.filter((columnId) => {
    if (!missingPinnedIds.has(columnId)) {
      return false;
    }

    missingPinnedIds.delete(columnId);
    return true;
  });

  // Keep stale ids (if any) to avoid accidental state loss when column
  // metadata updates race with URL/UI synchronization.
  return [...reorderedPinnedIds, ...Array.from(missingPinnedIds)];
}

export function getColumnPinningZone(
  columnId: string,
  columnPinning: ColumnPinningState,
): ColumnPinningZone {
  if ((columnPinning.left ?? []).includes(columnId)) {
    return "left";
  }

  if ((columnPinning.right ?? []).includes(columnId)) {
    return "right";
  }

  return "center";
}

export function resolveColumnDragReorder(
  args: ResolveColumnDragReorderArgs,
): ResolveColumnDragReorderResult {
  const { activeId, columnOrder, columnPinning, overId } = args;

  if (activeId === overId) {
    return {
      didReorder: false,
      nextColumnOrder: columnOrder,
      nextColumnPinning: columnPinning,
    };
  }

  const activeIndex = columnOrder.indexOf(activeId);
  const overIndex = columnOrder.indexOf(overId);

  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return {
      didReorder: false,
      nextColumnOrder: columnOrder,
      nextColumnPinning: columnPinning,
    };
  }

  const activeZone = getColumnPinningZone(activeId, columnPinning);
  const overZone = getColumnPinningZone(overId, columnPinning);

  if (activeZone !== overZone) {
    return {
      didReorder: false,
      nextColumnOrder: columnOrder,
      nextColumnPinning: columnPinning,
    };
  }

  const nextColumnOrder = arrayMove(columnOrder, activeIndex, overIndex);

  if (activeZone === "left") {
    const leftDataPinnedColumnIds = getDataPinnedColumnIds(columnPinning);
    const activePinnedIndex = leftDataPinnedColumnIds.indexOf(activeId);
    const overPinnedIndex = leftDataPinnedColumnIds.indexOf(overId);

    if (activePinnedIndex < 0 || overPinnedIndex < 0) {
      return {
        didReorder: false,
        nextColumnOrder: columnOrder,
        nextColumnPinning: columnPinning,
      };
    }

    const reorderedLeftDataPinnedColumnIds = arrayMove(
      leftDataPinnedColumnIds,
      activePinnedIndex,
      overPinnedIndex,
    );

    return {
      didReorder: !arraysAreEqual(
        reorderedLeftDataPinnedColumnIds,
        leftDataPinnedColumnIds,
      ),
      nextColumnOrder,
      nextColumnPinning: {
        left: [ROW_SELECTOR_COLUMN_ID, ...reorderedLeftDataPinnedColumnIds],
        right: columnPinning.right ?? [],
      },
    };
  }

  if (activeZone === "right") {
    const rightPinnedColumnIds = columnPinning.right ?? [];
    const activePinnedIndex = rightPinnedColumnIds.indexOf(activeId);
    const overPinnedIndex = rightPinnedColumnIds.indexOf(overId);

    if (activePinnedIndex < 0 || overPinnedIndex < 0) {
      return {
        didReorder: false,
        nextColumnOrder: columnOrder,
        nextColumnPinning: columnPinning,
      };
    }

    const reorderedRightPinnedColumnIds = arrayMove(
      rightPinnedColumnIds,
      activePinnedIndex,
      overPinnedIndex,
    );

    return {
      didReorder: !arraysAreEqual(
        reorderedRightPinnedColumnIds,
        rightPinnedColumnIds,
      ),
      nextColumnOrder,
      nextColumnPinning: {
        left: columnPinning.left ?? [],
        right: reorderedRightPinnedColumnIds,
      },
    };
  }

  return {
    didReorder: true,
    nextColumnOrder,
    nextColumnPinning: columnPinning,
  };
}

function resolveCompatibleColumnDragOverId(args: {
  activeId: string;
  columnPinning: ColumnPinningState;
  overId: string | null;
}): string | null {
  const { activeId, columnPinning, overId } = args;

  if (!overId) {
    return null;
  }

  const activeZone = getColumnPinningZone(activeId, columnPinning);
  const overZone = getColumnPinningZone(overId, columnPinning);
  return activeZone === overZone ? overId : null;
}

export function resolveColumnDragDropTarget(
  args: ResolveColumnDragDropTargetArgs,
): ResolveColumnDragDropTargetResult {
  const { activeId, columnPinning, lastCompatibleOverId, overId } = args;
  const compatibleOverId = resolveCompatibleColumnDragOverId({
    activeId,
    columnPinning,
    overId,
  });

  if (compatibleOverId) {
    return {
      compatibleOverId,
      nextLastCompatibleOverId: compatibleOverId,
      resolvedDropTargetId: compatibleOverId,
    };
  }

  if (overId) {
    return {
      compatibleOverId: null,
      nextLastCompatibleOverId: null,
      resolvedDropTargetId: null,
    };
  }

  return {
    compatibleOverId: null,
    nextLastCompatibleOverId: lastCompatibleOverId,
    resolvedDropTargetId: lastCompatibleOverId,
  };
}

export function resolveDirectionalColumnDragTarget(
  args: ResolveDirectionalColumnDragTargetArgs,
): string | null {
  const { activeId, columnOrder, columnPinning, deltaX } = args;

  if (Math.abs(deltaX) < 8) {
    return null;
  }

  const activeZone = getColumnPinningZone(activeId, columnPinning);
  let zoneColumnIds: string[] = [];

  if (activeZone === "left") {
    zoneColumnIds = reorderPinnedSubsetByColumnOrder({
      columnOrder,
      pinnedColumnIds: getDataPinnedColumnIds(columnPinning),
    });
  } else if (activeZone === "right") {
    zoneColumnIds = reorderPinnedSubsetByColumnOrder({
      columnOrder,
      pinnedColumnIds: columnPinning.right ?? [],
    });
  } else {
    zoneColumnIds = columnOrder.filter(
      (columnId) => getColumnPinningZone(columnId, columnPinning) === "center",
    );
  }

  const activeIndex = zoneColumnIds.indexOf(activeId);
  if (activeIndex < 0 || zoneColumnIds.length < 2) {
    return null;
  }

  const nextIndex =
    deltaX > 0
      ? Math.min(zoneColumnIds.length - 1, activeIndex + 1)
      : Math.max(0, activeIndex - 1);

  if (nextIndex === activeIndex) {
    return null;
  }

  return zoneColumnIds[nextIndex] ?? null;
}

function normalizeColumnPinningState(
  pinning: ColumnPinningState,
  validDataColumnIds: string[],
): ColumnPinningState {
  return buildColumnPinningState(
    normalizePinnedColumnIds(
      getDataPinnedColumnIds(pinning),
      validDataColumnIds,
    ),
  );
}

export function DataGrid(props: DataGridProps) {
  const {
    pinnedColumnIds,
    focusScrollContainerKey,
    focusRowIndexOffset = 0,
    focusedCell,
    selectionScopeKey,
    columnDefs,
    getBeforeHeaderRows,
    getBeforeRows,
    isFetching,
    isProcessing,
    onFocusedCellChange,
    areRowsInViewActionsLocked = false,
    hasMoreInfiniteRows = false,
    infiniteScrollEnabled = false,
    onBlockedRowsInViewAction,
    onInfiniteScrollEnabledChange,
    onLoadMoreRows,
    onPinnedColumnIdsChange,
    onPaginationChange,
    onPasteSelection,
    onRowSelectionChange,
    onSortingChange,
    pageCount,
    paginationState,
    rows,
    rowSelectionState,
    sortingState,
    canWriteToCell,
  } = props;

  const gridScope = selectionScopeKey ?? "__default__";
  const [columnOrder, setColumnOrder] = useUiState<string[]>(
    `datagrid:${gridScope}:column-order`,
    DEFAULT_COLUMN_ORDER,
  );
  const [columnPinning, setColumnPinning] = useUiState<ColumnPinningState>(
    `datagrid:${gridScope}:column-pinning`,
    DEFAULT_COLUMN_PINNING,
  );
  const [columnSizing, setColumnSizing] = useUiState<ColumnSizingState>(
    `datagrid:${gridScope}:column-sizing`,
    DEFAULT_COLUMN_SIZING,
  );
  const normalizedColumnSizing = useMemo(
    () => clampColumnSizingState(columnSizing),
    [columnSizing],
  );
  const [selectionState, setSelectionState] =
    useUiState<GridSelectionMachineState>(
      `datagrid:${gridScope}:selection-state`,
      GRID_SELECTION_MACHINE_INITIAL_STATE,
    );
  const selectionStart = getCellSelectionAnchor(selectionState);
  const selectionEnd = getCellSelectionFocus(selectionState);
  const selectionRange = getCellSelectionRange(selectionState);
  const selectedRowIds = useMemo(
    () => rowSelectionStateToIds(rowSelectionState),
    [rowSelectionState],
  );
  const selectedRowIdsKey = selectedRowIds.join("|");
  const selectionStartRef = useRef<GridCellCoordinate | null>(null);
  const pointerSelectionRef = useRef<{
    anchor: GridCellCoordinate;
    base: GridCellCoordinate;
    cellSelectionMode: boolean;
  } | null>(null);
  const rowSelectionAnchorRef = useRef<number | null>(null);
  const rowSelectionDragRef = useRef(false);
  const previousSelectionScopeKeyRef = useRef<string | undefined>(
    selectionScopeKey,
  );
  const sorting = useMemo(() => toSortingState(sortingState), [sortingState]);
  const columnDefinitionIdentityKey = useMemo(
    () => getColumnDefinitionIdentityKey(columnDefs),
    [columnDefs],
  );
  const initialColumnOrderRef = useRef<string[]>([]);
  const previousColumnDefinitionIdentityKeyRef = useRef("");

  if (
    previousColumnDefinitionIdentityKeyRef.current !==
    columnDefinitionIdentityKey
  ) {
    previousColumnDefinitionIdentityKeyRef.current =
      columnDefinitionIdentityKey;
    initialColumnOrderRef.current = getColumnOrderFromDefs(columnDefs);
  }

  const initialColumnOrder = initialColumnOrderRef.current;
  const validDataColumnIds = useMemo(
    () =>
      initialColumnOrder.filter(
        (columnId) => columnId !== ROW_SELECTOR_COLUMN_ID,
      ),
    [initialColumnOrder],
  );
  const normalizedPropPinnedColumnIds = useMemo(
    () => normalizePinnedColumnIds(pinnedColumnIds ?? [], validDataColumnIds),
    [pinnedColumnIds, validDataColumnIds],
  );
  const normalizedPropPinnedColumnIdsKey =
    normalizedPropPinnedColumnIds.join("|");
  const defaultColumnPinning = useMemo(
    () =>
      pinnedColumnIds == null
        ? DEFAULT_COLUMN_PINNING
        : buildColumnPinningState(normalizedPropPinnedColumnIds),
    [normalizedPropPinnedColumnIds, pinnedColumnIds],
  );
  const displayLoader = isFetching || isProcessing;

  // Reset column order/pinning/sizing only when column identities change.
  // This avoids expensive state churn when parent components re-render with
  // new columnDef object references but equivalent column ids.
  useEffect(() => {
    setColumnOrder(initialColumnOrder);
    setColumnPinning(defaultColumnPinning);
    setColumnSizing(DEFAULT_COLUMN_SIZING);
  }, [
    columnDefinitionIdentityKey,
    defaultColumnPinning,
    initialColumnOrder,
    setColumnOrder,
    setColumnPinning,
    setColumnSizing,
  ]);

  useEffect(() => {
    if (pinnedColumnIds == null) {
      return;
    }

    const nextPinningState = buildColumnPinningState(
      normalizedPropPinnedColumnIds,
    );
    if (!pinningStatesAreEqual(columnPinning, nextPinningState)) {
      setColumnPinning(nextPinningState);
    }

    if (
      onPinnedColumnIdsChange &&
      !arraysAreEqual(pinnedColumnIds, normalizedPropPinnedColumnIds)
    ) {
      onPinnedColumnIdsChange(normalizedPropPinnedColumnIds);
    }
  }, [
    columnPinning,
    onPinnedColumnIdsChange,
    normalizedPropPinnedColumnIds,
    normalizedPropPinnedColumnIdsKey,
    pinnedColumnIds,
    setColumnPinning,
  ]);

  useEffect(() => {
    if (normalizedColumnSizing === columnSizing) {
      return;
    }

    setColumnSizing(normalizedColumnSizing);
  }, [columnSizing, normalizedColumnSizing, setColumnSizing]);

  const tableRef = useRef<HTMLTableElement | null>(null);
  const pendingLayoutAnimationSnapshotRef =
    useRef<GridLayoutAnimationSnapshot | null>(null);
  const layoutAnimationFrameRef = useRef<number | null>(null);
  const layoutAnimationCleanupTimeoutRef = useRef<number | null>(null);
  const [layoutAnimationState, setLayoutAnimationState] =
    useState<GridLayoutAnimationState | null>(null);

  const clearGridLayoutAnimation = useCallback(() => {
    if (layoutAnimationFrameRef.current != null) {
      window.cancelAnimationFrame(layoutAnimationFrameRef.current);
      layoutAnimationFrameRef.current = null;
    }

    if (layoutAnimationCleanupTimeoutRef.current != null) {
      window.clearTimeout(layoutAnimationCleanupTimeoutRef.current);
      layoutAnimationCleanupTimeoutRef.current = null;
    }
    setLayoutAnimationState(null);
  }, []);

  const queueGridLayoutAnimation = useCallback(() => {
    const tableElement = tableRef.current;

    if (!tableElement) {
      return;
    }

    clearGridLayoutAnimation();
    pendingLayoutAnimationSnapshotRef.current =
      captureGridLayoutAnimationSnapshot(tableElement);
  }, [clearGridLayoutAnimation]);

  const handleColumnPinningChange = useCallback<OnChangeFn<ColumnPinningState>>(
    (updaterOrValue) => {
      setColumnPinning((current) => {
        const nextPinningState =
          typeof updaterOrValue === "function"
            ? updaterOrValue(current)
            : updaterOrValue;
        const normalizedNextPinningState = normalizeColumnPinningState(
          nextPinningState,
          validDataColumnIds,
        );

        if (
          onPinnedColumnIdsChange &&
          !arraysAreEqual(
            getDataPinnedColumnIds(current),
            getDataPinnedColumnIds(normalizedNextPinningState),
          )
        ) {
          onPinnedColumnIdsChange(
            getDataPinnedColumnIds(normalizedNextPinningState),
          );
        }

        if (!pinningStatesAreEqual(current, normalizedNextPinningState)) {
          queueGridLayoutAnimation();
        }

        return pinningStatesAreEqual(current, normalizedNextPinningState)
          ? current
          : normalizedNextPinningState;
      });
    },
    [
      onPinnedColumnIdsChange,
      queueGridLayoutAnimation,
      setColumnPinning,
      validDataColumnIds,
    ],
  );

  const getHeaderCellMetrics = useCallback(
    (
      headerId: string,
    ): { metrics: ActiveColumnDragMetrics | null; width: number } => {
      const tableElement = tableRef.current;

      if (!tableElement) {
        return { metrics: null, width: DEFAULT_GRID_COLUMN_SIZE };
      }

      const headerElements = tableElement.querySelectorAll<HTMLElement>(
        "th[data-grid-header-id]",
      );
      const matchedHeaderElement = Array.from(headerElements).find(
        (headerElement) => headerElement.dataset.gridHeaderId === headerId,
      );

      if (!matchedHeaderElement) {
        return { metrics: null, width: DEFAULT_GRID_COLUMN_SIZE };
      }

      const rect = matchedHeaderElement.getBoundingClientRect();
      return {
        metrics: {
          bottom: rect.bottom,
          centerY: rect.top + rect.height / 2,
          top: rect.top,
        },
        width: rect.width,
      };
    },
    [],
  );

  const handleDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      const activeId = String(active.id);
      lastCompatibleColumnDragOverIdRef.current = null;
      activeColumnDragDeltaRef.current = { x: 0, y: 0 };
      const headerMetrics = getHeaderCellMetrics(activeId);
      activeColumnDragMetricsRef.current = headerMetrics.metrics;
      setActiveColumnDragState({
        columnId: activeId,
        width: headerMetrics.width,
      });
      setIsColumnReorderPreviewEnabled(false);
    },
    [getHeaderCellMetrics],
  );

  const handleDragMove = useCallback(({ delta }: DragMoveEvent) => {
    activeColumnDragDeltaRef.current = delta;
  }, []);

  const isPointerOutsideHeaderBand = useCallback(() => {
    const dragMetrics = activeColumnDragMetricsRef.current;

    if (!dragMetrics) {
      return false;
    }

    const currentPointerY =
      dragMetrics.centerY + activeColumnDragDeltaRef.current.y;
    return (
      currentPointerY < dragMetrics.top - 4 ||
      currentPointerY > dragMetrics.bottom + 4
    );
  }, []);

  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      const activeId = String(active.id);
      const dragDropTarget = resolveColumnDragDropTarget({
        activeId,
        columnPinning,
        lastCompatibleOverId: lastCompatibleColumnDragOverIdRef.current,
        overId: over ? String(over.id) : null,
      });
      const shouldEnablePreview = Boolean(
        dragDropTarget.compatibleOverId &&
        dragDropTarget.compatibleOverId !== activeId,
      );
      setIsColumnReorderPreviewEnabled((current) =>
        current === shouldEnablePreview ? current : shouldEnablePreview,
      );

      if (
        dragDropTarget.compatibleOverId &&
        dragDropTarget.compatibleOverId !== activeId
      ) {
        lastCompatibleColumnDragOverIdRef.current =
          dragDropTarget.compatibleOverId;
        return;
      }

      if (over && !dragDropTarget.compatibleOverId) {
        if (isPointerOutsideHeaderBand()) {
          return;
        }

        lastCompatibleColumnDragOverIdRef.current = null;
      }
    },
    [columnPinning, isPointerOutsideHeaderBand],
  );

  // Handles drag reorder and keeps pinned-column URL state in sync.
  const handleDragEnd = useCallback(
    ({ active, over, delta }: DragEndEvent) => {
      const activeId = String(active.id);
      const dragDropTarget = resolveColumnDragDropTarget({
        activeId,
        columnPinning,
        lastCompatibleOverId: lastCompatibleColumnDragOverIdRef.current,
        overId: over ? String(over.id) : null,
      });
      let overId = dragDropTarget.resolvedDropTargetId;
      const hasExplicitIncompatibleOver = Boolean(
        over && !dragDropTarget.compatibleOverId,
      );

      if ((!overId || overId === activeId) && !hasExplicitIncompatibleOver) {
        overId = resolveDirectionalColumnDragTarget({
          activeId,
          columnOrder,
          columnPinning,
          deltaX: delta.x,
        });
      }

      lastCompatibleColumnDragOverIdRef.current = null;
      activeColumnDragMetricsRef.current = null;
      activeColumnDragDeltaRef.current = { x: 0, y: 0 };
      setActiveColumnDragState(null);
      setIsColumnReorderPreviewEnabled(true);

      if (!overId) {
        return;
      }

      const result = resolveColumnDragReorder({
        activeId,
        columnOrder,
        columnPinning,
        overId,
      });

      if (!result.didReorder) {
        return;
      }

      queueGridLayoutAnimation();
      setColumnOrder(result.nextColumnOrder);

      const normalizedNextPinningState = normalizeColumnPinningState(
        result.nextColumnPinning,
        validDataColumnIds,
      );
      const currentPinnedColumnIds = getDataPinnedColumnIds(columnPinning);
      const nextPinnedColumnIds = getDataPinnedColumnIds(
        normalizedNextPinningState,
      );

      if (
        onPinnedColumnIdsChange &&
        !arraysAreEqual(currentPinnedColumnIds, nextPinnedColumnIds)
      ) {
        onPinnedColumnIdsChange(nextPinnedColumnIds);
      }

      if (!pinningStatesAreEqual(columnPinning, normalizedNextPinningState)) {
        setColumnPinning(normalizedNextPinningState);
      }
    },
    [
      columnOrder,
      columnPinning,
      onPinnedColumnIdsChange,
      queueGridLayoutAnimation,
      setColumnOrder,
      setColumnPinning,
      validDataColumnIds,
    ],
  );

  const handleDragCancel = useCallback(() => {
    lastCompatibleColumnDragOverIdRef.current = null;
    activeColumnDragMetricsRef.current = null;
    activeColumnDragDeltaRef.current = { x: 0, y: 0 };
    setActiveColumnDragState(null);
    setIsColumnReorderPreviewEnabled(true);
  }, []);

  // Configure the mouse sensor for drag and drop
  const mouseSensor = useSensor(MouseSensor, {
    // Require the mouse to move by 10 pixels before activating
    activationConstraint: {
      distance: 10,
    },
  });
  const sensors = useSensors(mouseSensor);
  const [centerViewport, setCenterViewport] = useState({
    scrollLeft: 0,
    width: 0,
  });
  const [contextMenuTarget, setContextMenuTarget] =
    useState<GridContextMenuTarget | null>(null);
  const [activeColumnDragState, setActiveColumnDragState] =
    useState<ActiveColumnDragState | null>(null);
  const [isColumnReorderPreviewEnabled, setIsColumnReorderPreviewEnabled] =
    useState(true);
  const lastCompatibleColumnDragOverIdRef = useRef<string | null>(null);
  const activeColumnDragMetricsRef = useRef<ActiveColumnDragMetrics | null>(
    null,
  );
  const activeColumnDragDeltaRef = useRef({ x: 0, y: 0 });
  const autoScrolledFocusedCellRef = useRef<GridFocusedCell | null>(null);

  useLayoutEffect(() => {
    const snapshot = pendingLayoutAnimationSnapshotRef.current;
    const tableElement = tableRef.current;

    if (!snapshot || !tableElement) {
      return;
    }

    pendingLayoutAnimationSnapshotRef.current = null;
    const nextSnapshot = captureGridLayoutAnimationSnapshot(tableElement);
    const deltas: GridLayoutAnimationDeltas = {};

    tableElement
      .querySelectorAll<HTMLElement>(
        "th[data-grid-header-column-id], td[data-grid-row-index][data-grid-column-id]",
      )
      .forEach((element) => {
        const key = getGridPinningAnimationKey(element);

        if (!key) {
          return;
        }

        const previousRect = snapshot.get(key);
        const nextRect = nextSnapshot.get(key);

        if (!previousRect || !nextRect) {
          return;
        }

        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;

        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
          return;
        }

        deltas[key] = {
          x: deltaX,
          y: deltaY,
        };
      });

    if (Object.keys(deltas).length === 0) {
      return;
    }

    setLayoutAnimationState({
      deltas,
      phase: "from",
    });
    layoutAnimationFrameRef.current = window.requestAnimationFrame(() => {
      layoutAnimationFrameRef.current = window.requestAnimationFrame(() => {
        setLayoutAnimationState((current) =>
          current
            ? {
                ...current,
                phase: "true",
              }
            : current,
        );
        layoutAnimationFrameRef.current = null;
      });
    });

    layoutAnimationCleanupTimeoutRef.current = window.setTimeout(() => {
      clearGridLayoutAnimation();
    }, GRID_LAYOUT_ANIMATION_DURATION_MS + 40);

    return () => {
      clearGridLayoutAnimation();
    };
  }, [clearGridLayoutAnimation, columnOrder, columnPinning]);

  const table = useReactTable({
    columnResizeMode: "onChange",
    columns: columnDefs,
    data: rows,
    defaultColumn: {
      size: DEFAULT_GRID_COLUMN_SIZE,
      minSize: DEFAULT_GRID_COLUMN_MIN_SIZE,
      maxSize: DEFAULT_GRID_COLUMN_MAX_SIZE,
    },
    enableColumnPinning: true,
    enableColumnResizing: true,
    enableRowSelection: true,
    enableSorting: Boolean(onSortingChange && sortingState),
    getCoreRowModel: getCoreRowModel(),
    getRowId: ({ __ps_rowid }) => __ps_rowid as string,
    manualPagination: true,
    manualSorting: true,
    meta: {
      isColumnReorderPreviewEnabled,
    },
    onColumnOrderChange: setColumnOrder,
    onColumnPinningChange: handleColumnPinningChange,
    onColumnSizingChange: (updaterOrValue) =>
      setColumnSizing((previous) =>
        resolveColumnSizingStateUpdate(previous, updaterOrValue),
      ),
    onPaginationChange,
    onRowSelectionChange,
    onSortingChange: (updaterOrValue) =>
      onSortingChange?.((old) => {
        if (typeof updaterOrValue === "function") {
          updaterOrValue = updaterOrValue(toSortingState(old));
        }

        return toSortOrderItems(updaterOrValue);
      }),
    pageCount,
    state: {
      columnOrder,
      columnPinning,
      columnSizing: normalizedColumnSizing,
      pagination: paginationState,
      rowSelection: rowSelectionState,
      sorting,
    },
  });

  const centerVisibleLeafColumns = table.getCenterVisibleLeafColumns();
  const gridTableWidth = `${table.getTotalSize()}px`;
  const leftPinnedWidth = table
    .getLeftVisibleLeafColumns()
    .reduce((total, column) => total + column.getSize(), 0);
  const rightPinnedWidth = table
    .getRightVisibleLeafColumns()
    .reduce((total, column) => total + column.getSize(), 0);
  const centerViewportWidth = Math.max(
    0,
    centerViewport.width - leftPinnedWidth - rightPinnedWidth,
  );
  const centerViewportScrollLeft = Math.max(
    0,
    centerViewport.scrollLeft - leftPinnedWidth,
  );
  const centerColumnWindow = computeColumnVirtualizationWindow({
    columnWidths: centerVisibleLeafColumns.map((column) => column.getSize()),
    minColumnCount: COLUMN_VIRTUALIZATION_MIN_COLUMN_COUNT,
    overscanPx: COLUMN_VIRTUALIZATION_OVERSCAN_PX,
    scrollLeft: centerViewportScrollLeft,
    viewportWidth: centerViewportWidth,
  });

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const selectableColumnIds = useMemo(() => {
    return visibleLeafColumns
      .map((column) => column.id)
      .filter((columnId) => columnId !== ROW_SELECTOR_COLUMN_ID);
  }, [visibleLeafColumns]);

  const columnIndexById = useMemo(
    () =>
      new Map(
        selectableColumnIds.map((columnId, columnIndex) => [
          columnId,
          columnIndex,
        ]),
      ),
    [selectableColumnIds],
  );
  const selectableColumnsKey = selectableColumnIds.join("|");

  const hasRowSelection = selectedRowIds.length > 0;
  const lastSelectableColumnIndex = selectableColumnIds.length - 1;

  function getVirtualizedCenterSlice<T>(items: T[]): T[] {
    if (!centerColumnWindow.enabled) {
      return items;
    }

    return items.slice(
      centerColumnWindow.startIndex,
      centerColumnWindow.endIndex + 1,
    );
  }

  const getSingleCellClipboardText = useCallback(
    (rowIndex: number, columnIndex: number): string => {
      return buildClipboardText({
        columnIds: selectableColumnIds,
        range: {
          rowStart: rowIndex,
          rowEnd: rowIndex,
          columnStart: columnIndex,
          columnEnd: columnIndex,
        },
        rows,
      });
    },
    [rows, selectableColumnIds],
  );

  const getSelectedClipboardText = useCallback(() => {
    if (!selectionRange || rows.length === 0) {
      return "";
    }

    return buildClipboardText({
      columnIds: selectableColumnIds,
      range: selectionRange,
      rows,
    });
  }, [rows, selectableColumnIds, selectionRange]);

  const getRowClipboardText = useCallback(
    (rowIndex: number): string => {
      if (
        rows.length === 0 ||
        selectableColumnIds.length === 0 ||
        lastSelectableColumnIndex < 0
      ) {
        return "";
      }

      return buildClipboardText({
        columnIds: selectableColumnIds,
        range: {
          rowStart: rowIndex,
          rowEnd: rowIndex,
          columnStart: 0,
          columnEnd: lastSelectableColumnIndex,
        },
        rows,
      });
    },
    [lastSelectableColumnIndex, rows, selectableColumnIds],
  );

  const getSelectedRowClipboardText = useCallback(() => {
    if (
      !hasRowSelection ||
      rows.length === 0 ||
      selectableColumnIds.length === 0 ||
      lastSelectableColumnIndex < 0
    ) {
      return "";
    }

    return table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected())
      .map((row) => getRowClipboardText(row.index))
      .filter((text) => text.length > 0)
      .join("\n");
  }, [
    getRowClipboardText,
    hasRowSelection,
    lastSelectableColumnIndex,
    rows.length,
    selectableColumnIds.length,
    table,
  ]);

  const focusedCellCopyTarget = useMemo(() => {
    if (!focusedCell) {
      return null;
    }

    const rowIndex = focusedCell.rowIndex - focusRowIndexOffset;
    const columnIndex = columnIndexById.get(focusedCell.columnId);

    if (rowIndex < 0 || rowIndex >= rows.length || columnIndex == null) {
      return null;
    }

    return {
      columnIndex,
      rowIndex,
    };
  }, [columnIndexById, focusRowIndexOffset, focusedCell, rows.length]);

  const getFocusedCellClipboardText = useCallback(() => {
    if (!focusedCellCopyTarget) {
      return "";
    }

    return getSingleCellClipboardText(
      focusedCellCopyTarget.rowIndex,
      focusedCellCopyTarget.columnIndex,
    );
  }, [focusedCellCopyTarget, getSingleCellClipboardText]);

  const setCellSelection = useCallback(
    (start: GridCellCoordinate, end: GridCellCoordinate) => {
      setSelectionState((previous) =>
        transitionGridSelectionMachine(previous, {
          type: "cell.select",
          start,
          end,
        }),
      );
    },
    [setSelectionState],
  );

  const clearCellSelectionState = useCallback(() => {
    setSelectionState((previous) =>
      transitionGridSelectionMachine(previous, {
        type: "cell.clear",
      }),
    );
    pointerSelectionRef.current = null;
  }, [setSelectionState]);

  useEffect(() => {
    selectionStartRef.current = selectionStart;
  }, [selectionStart]);

  useEffect(() => {
    setSelectionState((previous) =>
      transitionGridSelectionMachine(previous, {
        type: "row.select",
        rowIds: selectedRowIds,
      }),
    );
  }, [selectedRowIds, selectedRowIdsKey, setSelectionState]);

  useEffect(() => {
    const handleMouseUp = (event: MouseEvent) => {
      rowSelectionDragRef.current = false;
      rowSelectionAnchorRef.current = null;

      const pointerSelection = pointerSelectionRef.current;

      pointerSelectionRef.current = null;

      if (!pointerSelection) {
        return;
      }

      if (pointerSelection.cellSelectionMode) {
        return;
      }

      const endTarget = document.elementFromPoint(event.clientX, event.clientY);
      const endCell =
        endTarget instanceof Element
          ? endTarget.closest<HTMLElement>(
              "td[data-grid-row-index][data-grid-column-id]",
            )
          : null;

      const endRowIndex = Number(endCell?.dataset.gridRowIndex);
      const endColumnId = endCell?.dataset.gridColumnId;
      const endColumnIndex =
        endColumnId != null ? columnIndexById.get(endColumnId) : undefined;
      const endCoordinate =
        Number.isInteger(endRowIndex) &&
        endColumnId != null &&
        endColumnIndex != null
          ? {
              rowIndex: endRowIndex,
              columnId: endColumnId,
              columnIndex: endColumnIndex,
            }
          : null;

      if (
        endCoordinate &&
        !isSameCoordinate(pointerSelection.anchor, endCoordinate)
      ) {
        clearNativeTextSelection();
        setCellSelection(pointerSelection.base, endCoordinate);
        return;
      }

      if (hasNativeTextSelection()) {
        return;
      }
    };

    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [columnIndexById, setCellSelection]);

  useEffect(() => {
    const hasCellSelection = selectionRange !== null && rows.length > 0;
    const hasRowSelectionForCopy = hasRowSelection;
    const hasFocusedCellForCopy = focusedCellCopyTarget !== null;

    if (
      !hasCellSelection &&
      !hasRowSelectionForCopy &&
      !hasFocusedCellForCopy
    ) {
      return;
    }

    const handleCopy = (event: ClipboardEvent) => {
      if (
        isEditableElement(document.activeElement) ||
        isEditableElement(event.target) ||
        hasNativeTextSelection()
      ) {
        return;
      }

      const text = hasRowSelection
        ? getSelectedRowClipboardText()
        : hasCellSelection
          ? getSelectedClipboardText()
          : getFocusedCellClipboardText();

      if (!text) {
        return;
      }

      event.preventDefault();
      event.clipboardData?.setData("text/plain", text);
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (!onPasteSelection) {
        return;
      }

      if (!selectionRange) {
        return;
      }

      if (
        isEditableElement(document.activeElement) ||
        isEditableElement(event.target) ||
        hasNativeTextSelection()
      ) {
        return;
      }

      const plainText = event.clipboardData?.getData("text/plain");

      if (!plainText) {
        return;
      }

      const matrix = parseClipboardMatrix(plainText);
      const changes = buildPasteChanges({
        canWrite: ({ columnId, rowIndex }) => {
          const row = rows[rowIndex];

          if (!row) {
            return false;
          }

          if (!canWriteToCell) {
            return true;
          }

          return canWriteToCell({ columnId, row });
        },
        columnIds: selectableColumnIds,
        matrix,
        range: selectionRange,
        rowCount: rows.length,
      });

      if (changes.length === 0) {
        return;
      }

      event.preventDefault();
      void Promise.resolve(onPasteSelection(changes)).catch((error) => {
        console.error("Failed to paste selection:", error);
      });
    };

    window.addEventListener("copy", handleCopy);
    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("paste", handlePaste);
    };
  }, [
    canWriteToCell,
    focusedCellCopyTarget,
    getFocusedCellClipboardText,
    getSelectedClipboardText,
    getSelectedRowClipboardText,
    hasRowSelection,
    onPasteSelection,
    rows,
    selectableColumnIds,
    selectionRange,
  ]);

  const setRowSelection = useCallback(
    (
      updater:
        | RowSelectionState
        | ((previous: RowSelectionState) => RowSelectionState),
    ) => {
      const nextSelection =
        typeof updater === "function" ? updater(rowSelectionState) : updater;

      onRowSelectionChange(nextSelection);
      setSelectionState((previous) =>
        transitionGridSelectionMachine(previous, {
          type: "row.select",
          rowIds: rowSelectionStateToIds(nextSelection),
        }),
      );
    },
    [onRowSelectionChange, rowSelectionState, setSelectionState],
  );

  const resetRowSelectionInteractionState = useCallback(() => {
    rowSelectionAnchorRef.current = null;
    rowSelectionDragRef.current = false;
  }, []);

  const resetSelectionInteractionState = useCallback(() => {
    setSelectionState((previous) =>
      transitionGridSelectionMachine(previous, {
        type: "reset",
      }),
    );
    pointerSelectionRef.current = null;
    resetRowSelectionInteractionState();
  }, [resetRowSelectionInteractionState, setSelectionState]);

  const clearRowSelectionMode = useCallback(() => {
    setRowSelection({});
    resetRowSelectionInteractionState();
  }, [resetRowSelectionInteractionState, setRowSelection]);

  const clearAllSelections = useCallback(() => {
    setSelectionState((previous) =>
      transitionGridSelectionMachine(previous, {
        type: "escape",
      }),
    );
    pointerSelectionRef.current = null;
    resetRowSelectionInteractionState();

    if (hasRowSelection) {
      onRowSelectionChange({});
    }
  }, [
    hasRowSelection,
    onRowSelectionChange,
    resetRowSelectionInteractionState,
    setSelectionState,
  ]);

  const selectSingleRowMode = useCallback(
    (args: { rowId: string; rowIndex: number; drag: boolean }) => {
      const { drag, rowId, rowIndex } = args;
      clearNativeTextSelection();
      clearCellSelectionState();
      rowSelectionDragRef.current = drag;
      rowSelectionAnchorRef.current = rowIndex;
      setRowSelection({ [rowId]: true });
    },
    [clearCellSelectionState, setRowSelection],
  );

  useEffect(() => {
    if (previousSelectionScopeKeyRef.current === selectionScopeKey) {
      return;
    }

    previousSelectionScopeKeyRef.current = selectionScopeKey;
    resetSelectionInteractionState();

    if (hasRowSelection) {
      setRowSelection({});
    }
  }, [
    hasRowSelection,
    resetSelectionInteractionState,
    selectionScopeKey,
    setRowSelection,
  ]);

  useEffect(() => {
    if (!hasAnySelection(selectionState) && !hasRowSelection) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(document.activeElement)) {
        return;
      }

      if (event.key === "Escape") {
        clearAllSelections();
        event.preventDefault();
        return;
      }

      if (!event.shiftKey) {
        return;
      }

      if (!selectionStart || !selectionEnd) {
        return;
      }

      const { columnDelta, rowDelta } = getArrowSelectionDelta(event.key);

      if (columnDelta === 0 && rowDelta === 0) {
        return;
      }

      event.preventDefault();

      const nextRowIndex = clamp(
        selectionEnd.rowIndex + rowDelta,
        0,
        Math.max(0, rows.length - 1),
      );
      const nextColumnIndex = clamp(
        selectionEnd.columnIndex + columnDelta,
        0,
        Math.max(0, selectableColumnIds.length - 1),
      );
      const nextColumnId = selectableColumnIds[nextColumnIndex];

      if (!nextColumnId) {
        return;
      }

      onFocusedCellChange?.({
        columnId: nextColumnId,
        rowIndex: nextRowIndex + focusRowIndexOffset,
      });
      setCellSelection(selectionStart, {
        rowIndex: nextRowIndex,
        columnId: nextColumnId,
        columnIndex: nextColumnIndex,
      });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    clearAllSelections,
    focusRowIndexOffset,
    hasRowSelection,
    onFocusedCellChange,
    selectionState,
    rows.length,
    selectableColumnIds,
    selectionEnd,
    selectionRange,
    selectionStart,
    setCellSelection,
  ]);

  useEffect(() => {
    resetSelectionInteractionState();
  }, [
    paginationState.pageIndex,
    paginationState.pageSize,
    resetSelectionInteractionState,
    selectableColumnsKey,
  ]);

  useEffect(() => {
    if (focusScrollContainerKey == null) {
      return;
    }

    const scrollContainer = tableRef.current?.parentElement;

    if (!(scrollContainer instanceof HTMLDivElement)) {
      return;
    }

    scrollContainer.focus({
      preventScroll: true,
    });
  }, [focusScrollContainerKey]);

  useEffect(() => {
    if (!focusedCell) {
      autoScrolledFocusedCellRef.current = null;
      return;
    }

    if (focusedCellsAreEqual(autoScrolledFocusedCellRef.current, focusedCell)) {
      return;
    }

    const tableElement = tableRef.current;
    const scrollContainer = tableElement?.parentElement;

    if (!(scrollContainer instanceof HTMLDivElement)) {
      return;
    }

    const focusedColumn = table.getColumn(focusedCell.columnId);

    if (!focusedColumn) {
      return;
    }

    let nextScrollLeft: number | null = null;

    if (focusedColumn.getIsPinned() === false && centerViewportWidth > 0) {
      const centerColumns = table.getCenterVisibleLeafColumns();
      const currentCenterScrollLeft = Math.max(0, scrollContainer.scrollLeft);
      const nextCenterScrollLeft = getFocusedCellScrollLeft({
        columnIds: centerColumns.map((column) => column.id),
        columnWidths: centerColumns.map((column) => column.getSize()),
        currentScrollLeft: currentCenterScrollLeft,
        focusedColumnId: focusedCell.columnId,
        viewportWidth: centerViewportWidth,
      });
      nextScrollLeft = Math.max(0, nextCenterScrollLeft);

      if (Math.abs(nextScrollLeft - scrollContainer.scrollLeft) >= 1) {
        scrollContainer.scrollLeft = nextScrollLeft;
        scrollContainer.dispatchEvent(new Event("scroll"));
      }
    }

    const focusedCellElement = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>(
        `td[data-grid-visual-row-index="${focusedCell.rowIndex}"][data-grid-column-id]`,
      ),
    ).find(
      (cellElement) =>
        cellElement.dataset.gridColumnId === focusedCell.columnId,
    );

    if (!focusedCellElement) {
      return;
    }

    focusedCellElement.scrollIntoView(FOCUSED_CELL_SCROLL_OPTIONS);

    if (
      nextScrollLeft != null &&
      Math.abs(nextScrollLeft - scrollContainer.scrollLeft) >= 1
    ) {
      scrollContainer.scrollLeft = nextScrollLeft;
      scrollContainer.dispatchEvent(new Event("scroll"));
    }

    autoScrolledFocusedCellRef.current = focusedCell;
  }, [
    centerViewport.scrollLeft,
    centerViewportWidth,
    focusedCell,
    leftPinnedWidth,
    rightPinnedWidth,
    table,
  ]);

  useEffect(() => {
    const tableElement = tableRef.current;
    const scrollContainer = tableElement?.parentElement;

    if (!scrollContainer) {
      return;
    }

    let animationFrameId: number | null = null;

    const updateViewport = () => {
      animationFrameId = null;

      const nextScrollLeft = scrollContainer.scrollLeft;
      const nextWidth = scrollContainer.clientWidth;

      setCenterViewport((current) => {
        if (
          current.scrollLeft === nextScrollLeft &&
          current.width === nextWidth
        ) {
          return current;
        }

        return {
          scrollLeft: nextScrollLeft,
          width: nextWidth,
        };
      });
    };

    const scheduleViewportUpdate = () => {
      if (animationFrameId !== null) {
        return;
      }

      if (typeof window.requestAnimationFrame !== "function") {
        updateViewport();
        return;
      }

      animationFrameId = window.requestAnimationFrame(updateViewport);
    };

    scheduleViewportUpdate();
    scrollContainer.addEventListener("scroll", scheduleViewportUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleViewportUpdate);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleViewportUpdate);
      resizeObserver.observe(scrollContainer);
    }

    return () => {
      if (
        animationFrameId !== null &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(animationFrameId);
      }

      scrollContainer.removeEventListener("scroll", scheduleViewportUpdate);
      window.removeEventListener("resize", scheduleViewportUpdate);
      resizeObserver?.disconnect();
    };
  }, [columnDefinitionIdentityKey]);

  useEffect(() => {
    const tableElement = tableRef.current;
    const scrollContainer = tableElement?.parentElement;

    if (!scrollContainer || !infiniteScrollEnabled || !hasMoreInfiniteRows) {
      return;
    }

    const handleInfiniteScroll = () => {
      if (isFetching || isProcessing) {
        return;
      }

      const thresholdPx = getInfiniteScrollThresholdPx(
        scrollContainer.clientHeight,
      );
      const distanceFromBottom =
        scrollContainer.scrollHeight -
        (scrollContainer.scrollTop + scrollContainer.clientHeight);

      if (distanceFromBottom > thresholdPx) {
        return;
      }

      onLoadMoreRows?.();
    };

    scrollContainer.addEventListener("scroll", handleInfiniteScroll, {
      passive: true,
    });
    handleInfiniteScroll();

    return () => {
      scrollContainer.removeEventListener("scroll", handleInfiniteScroll);
    };
  }, [
    hasMoreInfiniteRows,
    infiniteScrollEnabled,
    isFetching,
    isProcessing,
    onLoadMoreRows,
  ]);

  const toCellCoordinate = useCallback(
    (rowIndex: number, columnId: string): GridCellCoordinate | null => {
      const columnIndex = columnIndexById.get(columnId);

      if (columnIndex == null) {
        return null;
      }

      return { columnId, columnIndex, rowIndex };
    },
    [columnIndexById],
  );

  const selectRowsInRange = useCallback(
    (fromRowIndex: number, toRowIndex: number) => {
      const start = Math.min(fromRowIndex, toRowIndex);
      const end = Math.max(fromRowIndex, toRowIndex);
      const nextSelection: RowSelectionState = {};
      const rowModel = table.getRowModel().rows;

      for (let index = start; index <= end; index++) {
        const row = rowModel[index];

        if (!row) {
          continue;
        }

        nextSelection[row.id] = true;
      }

      setRowSelection(nextSelection);
    },
    [setRowSelection, table],
  );

  const selectAllRows = useCallback(() => {
    const nextSelection: RowSelectionState = {};

    for (const row of table.getRowModel().rows) {
      nextSelection[row.id] = true;
    }

    clearNativeTextSelection();
    resetSelectionInteractionState();
    setRowSelection(nextSelection);
  }, [resetSelectionInteractionState, setRowSelection, table]);

  const handleSelectAllRowsMouseDown = useCallback(
    (event: ReactMouseEvent<unknown>): void => {
      if (event.button !== 0) {
        return;
      }

      if (isGridInteractionSuppressionActive()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const visibleRows = table.getRowModel().rows;
      const allRowsSelected =
        visibleRows.length > 0 &&
        visibleRows.every((row) => rowSelectionState[row.id] === true);

      if (allRowsSelected) {
        clearRowSelectionMode();
        return;
      }

      selectAllRows();
    },
    [clearRowSelectionMode, rowSelectionState, selectAllRows, table],
  );

  const handleRowSelectionMouseDown = useCallback(
    (
      event: ReactMouseEvent<unknown>,
      rowIndex: number,
      rowId: string,
    ): void => {
      const isPrimaryButton = event.button === 0;
      const isSecondaryButton = event.button === 2;

      if (!isPrimaryButton && !isSecondaryButton) {
        return;
      }

      if (isGridInteractionSuppressionActive()) {
        return;
      }

      if (isSecondaryButton) {
        event.stopPropagation();
        clearCellSelectionState();

        if (rowSelectionState[rowId] === true) {
          rowSelectionDragRef.current = false;
          rowSelectionAnchorRef.current = rowIndex;
          return;
        }

        selectSingleRowMode({ rowId, rowIndex, drag: false });
        return;
      }

      if (isPrimaryButton) {
        event.preventDefault();
      }
      event.stopPropagation();

      if (event.shiftKey) {
        clearNativeTextSelection();
        clearCellSelectionState();
        const nextSelection = { ...rowSelectionState };

        if (nextSelection[rowId] === true) {
          delete nextSelection[rowId];
        } else {
          nextSelection[rowId] = true;
        }

        setRowSelection(nextSelection);
        rowSelectionDragRef.current = false;
        rowSelectionAnchorRef.current = rowIndex;
        return;
      }

      selectSingleRowMode({ rowId, rowIndex, drag: isPrimaryButton });
    },
    [
      clearCellSelectionState,
      rowSelectionState,
      selectSingleRowMode,
      setRowSelection,
    ],
  );

  const handleRowSelectionMouseEnter = useCallback(
    (rowIndex: number): void => {
      if (!rowSelectionDragRef.current) {
        return;
      }

      const anchorRowIndex = rowSelectionAnchorRef.current;

      if (anchorRowIndex == null) {
        return;
      }

      selectRowsInRange(anchorRowIndex, rowIndex);
    },
    [selectRowsInRange],
  );

  const handleRowSelectionContextMenu = useCallback(
    (
      event: ReactMouseEvent<unknown>,
      rowIndex: number,
      rowId: string,
    ): void => {
      event.stopPropagation();
      clearCellSelectionState();

      if (rowSelectionState[rowId] === true) {
        rowSelectionDragRef.current = false;
        rowSelectionAnchorRef.current = rowIndex;
        return;
      }

      selectSingleRowMode({ rowId, rowIndex, drag: false });
    },
    [clearCellSelectionState, rowSelectionState, selectSingleRowMode],
  );

  function handleCellMouseDown(
    event: ReactMouseEvent<unknown>,
    rowIndex: number,
    columnId: string,
  ) {
    if (event.button !== 0) {
      return;
    }

    if (isGridInteractionSuppressionActive()) {
      return;
    }

    if (hasRowSelection) {
      clearRowSelectionMode();
    }

    const coordinate = toCellCoordinate(rowIndex, columnId);

    if (!coordinate) {
      return;
    }

    if (event.shiftKey && selectionStartRef.current) {
      clearNativeTextSelection();
      setCellSelection(selectionStartRef.current, coordinate);
      pointerSelectionRef.current = {
        anchor: coordinate,
        base: selectionStartRef.current,
        cellSelectionMode: true,
      };
      return;
    }

    pointerSelectionRef.current = {
      anchor: coordinate,
      base: coordinate,
      cellSelectionMode: false,
    };
  }

  const updateSelectionFromPointer = useCallback(
    (rowIndex: number, columnId: string) => {
      const pointerSelection = pointerSelectionRef.current;

      if (!pointerSelection) {
        return;
      }

      const coordinate = toCellCoordinate(rowIndex, columnId);

      if (!coordinate) {
        return;
      }

      if (!pointerSelection.cellSelectionMode) {
        if (isSameCoordinate(pointerSelection.anchor, coordinate)) {
          return;
        }

        pointerSelection.cellSelectionMode = true;
        clearNativeTextSelection();
        setCellSelection(pointerSelection.base, coordinate);
        return;
      }

      setCellSelection(pointerSelection.base, coordinate);
    },
    [setCellSelection, toCellCoordinate],
  );

  const toCellCoordinateFromTarget = useCallback(
    (target: Element | null): GridCellCoordinate | null => {
      if (!(target instanceof Element)) {
        return null;
      }

      const cell = target.closest<HTMLElement>(
        "td[data-grid-row-index][data-grid-column-id]",
      );

      if (!cell) {
        return null;
      }

      const rowIndex = Number(cell.dataset.gridRowIndex);
      const columnId = cell.dataset.gridColumnId;

      if (!Number.isInteger(rowIndex) || !columnId) {
        return null;
      }

      return toCellCoordinate(rowIndex, columnId);
    },
    [toCellCoordinate],
  );

  function handleCellMouseEnter(rowIndex: number, columnId: string) {
    updateSelectionFromPointer(rowIndex, columnId);
  }

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if ((event.buttons & 1) !== 1) {
        return;
      }

      if (!pointerSelectionRef.current && !rowSelectionDragRef.current) {
        return;
      }

      const target = document.elementFromPoint(event.clientX, event.clientY);
      const coordinate = toCellCoordinateFromTarget(target);

      if (!coordinate) {
        return;
      }

      if (rowSelectionDragRef.current) {
        handleRowSelectionMouseEnter(coordinate.rowIndex);
      }

      if (!pointerSelectionRef.current) {
        return;
      }

      updateSelectionFromPointer(coordinate.rowIndex, coordinate.columnId);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [
    handleRowSelectionMouseEnter,
    toCellCoordinateFromTarget,
    updateSelectionFromPointer,
  ]);

  function renderHeaderCell(
    header: ReactTableHeaderModel<Record<string, unknown>, unknown>,
  ): ReactNode {
    if (typeof header.column.columnDef.header !== "function") {
      return null;
    }

    const headerPinningStyles = getColumnPinningStyles(header.column, "header");
    const headerAnimation =
      layoutAnimationState?.deltas[`header:${header.column.id}`];
    const headerStyle = {
      ...headerPinningStyles.style,
      ...(headerAnimation
        ? {
            "--ps-pinning-translate-x":
              layoutAnimationState.phase === "from"
                ? `${headerAnimation.x}px`
                : "0px",
            "--ps-pinning-translate-y":
              layoutAnimationState.phase === "from"
                ? `${headerAnimation.y}px`
                : "0px",
          }
        : null),
    } as CSSProperties;
    type Header = ComponentType<Omit<CellProps, "children" | "ref">>;
    const Header = header.column.columnDef.header(
      header.getContext(),
    ) as Header;

    return (
      <Header
        key={header.id}
        {...headerPinningStyles}
        className={cn(
          headerPinningStyles.className,
          header.column.id === ROW_SELECTOR_COLUMN_ID && "cursor-pointer",
        )}
        data-pinning-animating={
          headerAnimation ? layoutAnimationState.phase : undefined
        }
        data-grid-header-id={header.id}
        data-grid-header-column-id={header.column.id}
        style={headerStyle}
        onMouseDown={(event) => {
          if (header.column.id !== ROW_SELECTOR_COLUMN_ID) {
            return;
          }

          handleSelectAllRowsMouseDown(event);
        }}
      />
    );
  }

  function renderGridCell(args: {
    cell: ReactTableCellModel<Record<string, unknown>, unknown>;
    row: ReactTableRowModel<Record<string, unknown>>;
    rowIndex: number;
  }): ReactNode {
    const { cell, row, rowIndex } = args;

    if (typeof cell.column.columnDef.cell !== "function") {
      return null;
    }

    type Cell = ComponentType<Omit<CellProps, "children" | "ref">>;
    const Cell = cell.column.columnDef.cell(cell.getContext()) as Cell;
    const pinningStyles = getColumnPinningStyles(cell.column, "cell");
    const cellAnimation =
      layoutAnimationState?.deltas[`cell:${rowIndex}:${cell.column.id}`];
    const cellStyle = {
      ...pinningStyles.style,
      ...(cellAnimation
        ? {
            "--ps-pinning-translate-x":
              layoutAnimationState.phase === "from"
                ? `${cellAnimation.x}px`
                : "0px",
            "--ps-pinning-translate-y":
              layoutAnimationState.phase === "from"
                ? `${cellAnimation.y}px`
                : "0px",
          }
        : null),
    } as CSSProperties;
    const isRowSelectorCell = cell.column.id === ROW_SELECTOR_COLUMN_ID;
    const isRowSelected = row.getIsSelected();
    const columnIndex = columnIndexById.get(cell.column.id);
    const visualRowIndex = rowIndex + focusRowIndexOffset;
    const isSelected =
      selectionRange != null &&
      columnIndex != null &&
      isCellInRange({
        columnIndex,
        range: selectionRange,
        rowIndex,
      });
    const isFocused =
      focusedCell?.rowIndex === visualRowIndex &&
      focusedCell.columnId === cell.column.id;

    return (
      <Cell
        key={cell.id}
        {...pinningStyles}
        className={cn(
          pinningStyles.className,
          isRowSelectorCell &&
            "group-odd:bg-table-cell-odd group-even:bg-table-cell-even",
          isRowSelected &&
            "group-odd:!bg-table-row-selected-odd group-even:!bg-table-row-selected-even",
          isSelected && "!bg-primary/15 ring-1 ring-inset ring-primary/30",
          isFocused &&
            "relative z-0 before:pointer-events-none before:absolute before:inset-0 before:border before:border-sky-300 before:content-['']",
        )}
        data-grid-column-id={cell.column.id}
        data-grid-row-index={rowIndex}
        data-grid-visual-row-index={visualRowIndex}
        data-grid-cell-context-target="true"
        data-pinning-animating={
          cellAnimation ? layoutAnimationState.phase : undefined
        }
        data-focused={isFocused || undefined}
        data-row-select-cell={isRowSelectorCell || undefined}
        data-selected={isSelected || undefined}
        style={cellStyle}
        withContextMenu={false}
        onMouseDown={(event) => {
          if (!isRowSelectorCell) {
            onFocusedCellChange?.({
              columnId: cell.column.id,
              rowIndex: visualRowIndex,
            });
          }

          return isRowSelectorCell
            ? handleRowSelectionMouseDown(event, rowIndex, row.id)
            : handleCellMouseDown(event, rowIndex, cell.column.id);
        }}
        onMouseEnter={() =>
          isRowSelectorCell
            ? handleRowSelectionMouseEnter(rowIndex)
            : handleCellMouseEnter(rowIndex, cell.column.id)
        }
        onContextMenu={(event) => {
          if (!isRowSelectorCell) {
            return;
          }

          handleRowSelectionContextMenu(event, rowIndex, row.id);
        }}
        onClick={(event) => {
          if (isRowSelectorCell || event.shiftKey) {
            return;
          }

          if (isSelected) {
            return;
          }

          clearCellSelectionState();
        }}
      />
    );
  }

  const getContextMenuCopyText = useCallback((): string => {
    if (!contextMenuTarget) {
      return "";
    }

    const { columnId, rowIndex } = contextMenuTarget;
    const row = table.getRowModel().rows[rowIndex];

    if (!row) {
      return "";
    }

    const isRowSelectorCell = columnId === ROW_SELECTOR_COLUMN_ID;
    const isRowSelected = row.getIsSelected();
    const columnIndex = columnIndexById.get(columnId);
    const isSelected =
      selectionRange != null &&
      columnIndex != null &&
      isCellInRange({
        columnIndex,
        range: selectionRange,
        rowIndex,
      });

    if (isRowSelectorCell) {
      if (hasRowSelection && isRowSelected) {
        return getSelectedRowClipboardText();
      }

      return getRowClipboardText(rowIndex);
    }

    if (hasRowSelection && isRowSelected) {
      return getSelectedRowClipboardText();
    }

    if (isSelected) {
      const selectedText = getSelectedClipboardText();
      if (selectedText) {
        return selectedText;
      }
    }

    if (columnIndex == null) {
      return "";
    }

    return getSingleCellClipboardText(rowIndex, columnIndex);
  }, [
    columnIndexById,
    contextMenuTarget,
    getRowClipboardText,
    getSelectedClipboardText,
    getSelectedRowClipboardText,
    getSingleCellClipboardText,
    hasRowSelection,
    selectionRange,
    table,
  ]);

  const handleGridContextMenuCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      const cell = target?.closest<HTMLElement>(
        "td[data-grid-row-index][data-grid-column-id][data-grid-cell-context-target='true']",
      );

      if (!cell) {
        setContextMenuTarget(null);
        return;
      }

      const rowIndex = Number(cell.dataset.gridRowIndex);
      const columnId = cell.dataset.gridColumnId;

      if (!Number.isInteger(rowIndex) || !columnId) {
        setContextMenuTarget(null);
        return;
      }

      setContextMenuTarget({ columnId, rowIndex });
    },
    [],
  );

  const handleContextMenuCopyAction = useCallback(() => {
    setGridInteractionSuppressionWindow();
    const copyText = getContextMenuCopyText();

    if (!copyText && copyText !== "") {
      return;
    }

    void navigator.clipboard.writeText(copyText).catch((error) => {
      console.error("Failed to copy to clipboard:", error);
    });
  }, [getContextMenuCopyText]);

  return (
    <>
      <div
        data-studio="content"
        className="flex-1 w-0 h-0 min-h-0 min-w-full flex flex-col relative bg-background/50"
      >
        <div>
          {displayLoader && (
            <DataGridLoadingBar className="absolute -top-px left-0 right-0" />
          )}
        </div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="flex min-h-0 flex-1 flex-col"
              onContextMenuCapture={handleGridContextMenuCapture}
            >
              <DndContext
                collisionDetection={closestCenter}
                sensors={sensors}
                onDragCancel={handleDragCancel}
                onDragEnd={handleDragEnd}
                onDragMove={handleDragMove}
                onDragOver={handleDragOver}
                onDragStart={handleDragStart}
              >
                <Table
                  containerProps={{
                    "aria-label": "Table grid",
                    className:
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 overscroll-x-contain",
                    "data-grid-scroll-container": "true",
                    style: {
                      containerType: "inline-size",
                    },
                    tabIndex: 0,
                  }}
                  ref={tableRef}
                  className="table-fixed border-separate border-spacing-0 box-border bg-background/50"
                  style={{
                    minWidth: "100%",
                    width: gridTableWidth,
                  }}
                >
                  <TableHeader>
                    {getBeforeHeaderRows?.(table)}
                    {table.getHeaderGroups().map((headerGroup) => {
                      const leftHeaders = headerGroup.headers.filter(
                        (header) => header.column.getIsPinned() === "left",
                      );
                      const centerHeaders = headerGroup.headers.filter(
                        (header) => header.column.getIsPinned() === false,
                      );
                      const rightHeaders = headerGroup.headers.filter(
                        (header) => header.column.getIsPinned() === "right",
                      );
                      const visibleCenterHeaders =
                        getVirtualizedCenterSlice(centerHeaders);
                      const sortableLeftHeaderIds = leftHeaders
                        .filter(
                          (header) =>
                            header.column.id !== ROW_SELECTOR_COLUMN_ID,
                        )
                        .map((header) => header.id);
                      const sortableCenterHeaderIds = visibleCenterHeaders.map(
                        (header) => header.id,
                      );
                      const sortableRightHeaderIds = rightHeaders.map(
                        (header) => header.id,
                      );

                      return (
                        <TableRow key={headerGroup.id}>
                          <SortableContext
                            items={sortableLeftHeaderIds}
                            strategy={horizontalListSortingStrategy}
                          >
                            {leftHeaders.map(renderHeaderCell)}
                          </SortableContext>
                          {centerColumnWindow.hiddenStartWidth > 0 &&
                            centerHeaders.length > 0 && (
                              <TableHead
                                key={`${headerGroup.id}-virtual-start`}
                                aria-hidden="true"
                                className="p-0 border-r border-b border-table-border bg-table-head pointer-events-none"
                                style={{
                                  minWidth: `${centerColumnWindow.hiddenStartWidth}px`,
                                  width: `${centerColumnWindow.hiddenStartWidth}px`,
                                }}
                              />
                            )}
                          <SortableContext
                            items={sortableCenterHeaderIds}
                            strategy={horizontalListSortingStrategy}
                          >
                            {visibleCenterHeaders.map(renderHeaderCell)}
                          </SortableContext>
                          {centerColumnWindow.hiddenEndWidth > 0 &&
                            centerHeaders.length > 0 && (
                              <TableHead
                                key={`${headerGroup.id}-virtual-end`}
                                aria-hidden="true"
                                className="p-0 border-r border-b border-table-border bg-table-head pointer-events-none"
                                style={{
                                  minWidth: `${centerColumnWindow.hiddenEndWidth}px`,
                                  width: `${centerColumnWindow.hiddenEndWidth}px`,
                                }}
                              />
                            )}
                          <SortableContext
                            items={sortableRightHeaderIds}
                            strategy={horizontalListSortingStrategy}
                          >
                            {rightHeaders.map(renderHeaderCell)}
                          </SortableContext>
                        </TableRow>
                      );
                    })}
                  </TableHeader>
                  <TableBody>
                    {getBeforeRows?.(table)}
                    {table.getRowModel().rows?.length ? (
                      table.getRowModel().rows.map((row, rowIndex) => {
                        const leftCells = row.getLeftVisibleCells();
                        const centerCells = row.getCenterVisibleCells();
                        const rightCells = row.getRightVisibleCells();
                        const visibleCenterCells =
                          getVirtualizedCenterSlice(centerCells);

                        return (
                          <TableRow
                            key={row.id}
                            data-row-selected={row.getIsSelected() || undefined}
                            className={cn(
                              "bg-table-row group",
                              "odd:bg-table-cell-odd even:bg-table-cell-even/50",
                            )}
                          >
                            {leftCells.map((cell) =>
                              renderGridCell({ cell, row, rowIndex }),
                            )}
                            {centerColumnWindow.hiddenStartWidth > 0 &&
                              centerCells.length > 0 && (
                                <TableCell
                                  key={`${row.id}-virtual-start`}
                                  aria-hidden="true"
                                  className="relative z-0 p-0 border-r border-b border-table-border pointer-events-none group-odd:!bg-table-cell-odd group-even:!bg-table-cell-even"
                                  style={{
                                    minWidth: `${centerColumnWindow.hiddenStartWidth}px`,
                                    width: `${centerColumnWindow.hiddenStartWidth}px`,
                                  }}
                                />
                              )}
                            {visibleCenterCells.map((cell) =>
                              renderGridCell({ cell, row, rowIndex }),
                            )}
                            {centerColumnWindow.hiddenEndWidth > 0 &&
                              centerCells.length > 0 && (
                                <TableCell
                                  key={`${row.id}-virtual-end`}
                                  aria-hidden="true"
                                  className="relative z-0 p-0 border-r border-b border-table-border pointer-events-none group-odd:!bg-table-cell-odd group-even:!bg-table-cell-even"
                                  style={{
                                    minWidth: `${centerColumnWindow.hiddenEndWidth}px`,
                                    width: `${centerColumnWindow.hiddenEndWidth}px`,
                                  }}
                                />
                              )}
                            {rightCells.map((cell) =>
                              renderGridCell({ cell, row, rowIndex }),
                            )}
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={columnDefs.length}
                          className="h-24 text-left p-(--studio-cell-spacing)"
                        >
                          {isFetching && (
                            <div className="flex flex-col gap-2">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-4/5" />
                              <Skeleton className="h-4 w-2/3" />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <DragOverlay dropAnimation={null}>
                  {activeColumnDragState ? (
                    <div
                      className="pointer-events-none flex h-10 items-center border border-table-border bg-background px-2 font-mono text-xs text-foreground/90 shadow-md"
                      style={{
                        minWidth: `${activeColumnDragState.width}px`,
                        width: `${activeColumnDragState.width}px`,
                      }}
                    >
                      <span className="truncate">
                        {activeColumnDragState.columnId}
                      </span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              disabled={contextMenuTarget === null}
              onPointerDown={() => setGridInteractionSuppressionWindow()}
              onSelect={(event) => {
                if (contextMenuTarget === null) {
                  event.preventDefault();
                  return;
                }

                handleContextMenuCopyAction();
              }}
            >
              Copy
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {pageCount == null ? null : (
          <DataGridPagination
            controlsDisabled={areRowsInViewActionsLocked}
            infiniteScrollEnabled={infiniteScrollEnabled}
            onBlockedInteraction={onBlockedRowsInViewAction}
            onInfiniteScrollEnabledChange={onInfiniteScrollEnabledChange}
            table={table}
            variant="numeric"
          />
        )}

        <AnimatePresence mode="wait">
          {table.getRowModel().rows?.length === 0 &&
            !isFetching &&
            !isProcessing && (
              <motion.div
                className="flex items-center justify-center absolute -inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex flex-col gap-1 text-center">
                  <div className="text-sm text-muted-foreground">
                    No results found
                  </div>
                  <div className="text-xs text-muted-foreground">
                    It doesn&apos;t look like you have any data in this table.
                  </div>
                </div>
              </motion.div>
            )}
        </AnimatePresence>
      </div>
    </>
  );
}

function toSortingState(from: SortOrderItem[] | undefined): SortingState {
  return (
    from?.map((item) => ({
      id: item.column,
      desc: item.direction === "desc",
    })) || []
  );
}

function toSortOrderItems(from: SortingState): SortOrderItem[] {
  return from.map((item) => ({
    column: item.id,
    direction: item.desc ? "desc" : "asc",
  }));
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  return target.isContentEditable;
}

function hasNativeTextSelection(): boolean {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }

  return selection.toString().trim().length > 0;
}

function clearNativeTextSelection(): void {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return;
  }

  selection.removeAllRanges();
}

function isSameCoordinate(
  left: GridCellCoordinate,
  right: GridCellCoordinate,
): boolean {
  return (
    left.rowIndex === right.rowIndex && left.columnIndex === right.columnIndex
  );
}

function getArrowSelectionDelta(key: string): {
  rowDelta: number;
  columnDelta: number;
} {
  switch (key) {
    case "ArrowUp":
      return { rowDelta: -1, columnDelta: 0 };
    case "ArrowDown":
      return { rowDelta: 1, columnDelta: 0 };
    case "ArrowLeft":
      return { rowDelta: 0, columnDelta: -1 };
    case "ArrowRight":
      return { rowDelta: 0, columnDelta: 1 };
    default:
      return { rowDelta: 0, columnDelta: 0 };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
