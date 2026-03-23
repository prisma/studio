import type {
  AccessorKeyColumnDefBase,
  RowSelectionState,
} from "@tanstack/react-table";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TableHead } from "../../components/ui/table";
import { Cell, type CellProps } from "../cell/Cell";
import { DataGrid } from "./DataGrid";
import {
  createReadOnlyColumns,
  createSelection,
  defaultRows as rows,
  dispatchCopyEvent,
  dispatchKeyboard,
  dispatchMouse,
  type GridColumnDef,
  type GridRow,
} from "./test-utils";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createEditableColumns(): GridColumnDef[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header({ header }) {
        return (props: Omit<CellProps, "children" | "ref">) => (
          <TableHead {...props}>{header.id}</TableHead>
        );
      },
      cell({ cell }) {
        return function EditableCell(
          props: Omit<CellProps, "children" | "ref">,
        ) {
          const [isEditorOpen, setIsEditorOpen] = useState(false);

          return (
            <Cell {...props} onClick={() => setIsEditorOpen(true)}>
              {isEditorOpen ? (
                <span
                  data-editor-open={`editor-${cell.row.index}-${cell.column.id}`}
                >
                  editor-open
                </span>
              ) : (
                String(cell.getValue() ?? "")
              )}
            </Cell>
          );
        };
      },
    },
  ];
}

function renderGrid(args?: {
  columnDefs?: GridColumnDef[];
  focusScrollContainerKey?: number;
  focusedCell?: {
    columnId: string;
    rowIndex: number;
  } | null;
  hasMoreInfiniteRows?: boolean;
  infiniteScrollEnabled?: boolean;
  manageFocusedCell?: boolean;
  onInfiniteScrollEnabledChange?: (enabled: boolean) => void;
  onFocusedCellChange?: (
    focusedCell: {
      columnId: string;
      rowIndex: number;
    } | null,
  ) => void;
  onLoadMoreRows?: () => void;
  pageCount?: number;
  rows?: GridRow[];
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const root = createRoot(container);
  let setFocusedCell:
    | ((
        next: {
          columnId: string;
          rowIndex: number;
        } | null,
      ) => void)
    | undefined;

  function GridHarness() {
    const [rowSelectionState, setRowSelectionState] =
      useState<RowSelectionState>({});
    const [focusedCell, setFocusedCellState] = useState(
      args?.focusedCell ?? null,
    );
    const manageFocusedCell = args?.manageFocusedCell === true;

    setFocusedCell = setFocusedCellState;

    return (
      <div
        data-selected-row-count={
          Object.values(rowSelectionState).filter(Boolean).length
        }
      >
        <DataGrid
          columnDefs={
            (args?.columnDefs ??
              createReadOnlyColumns()) as AccessorKeyColumnDefBase<
              Record<string, unknown>
            >[]
          }
          focusScrollContainerKey={args?.focusScrollContainerKey}
          focusedCell={manageFocusedCell ? focusedCell : args?.focusedCell}
          isFetching={false}
          hasMoreInfiniteRows={args?.hasMoreInfiniteRows}
          infiniteScrollEnabled={args?.infiniteScrollEnabled}
          isProcessing={false}
          onFocusedCellChange={
            manageFocusedCell
              ? (nextFocusedCell) => {
                  setFocusedCellState(nextFocusedCell);
                  args?.onFocusedCellChange?.(nextFocusedCell);
                }
              : args?.onFocusedCellChange
          }
          onInfiniteScrollEnabledChange={args?.onInfiniteScrollEnabledChange}
          onLoadMoreRows={args?.onLoadMoreRows}
          onPaginationChange={vi.fn()}
          onRowSelectionChange={(updater) => {
            setRowSelectionState((previous) => {
              return typeof updater === "function"
                ? updater(previous)
                : updater;
            });
          }}
          pageCount={args?.pageCount ?? 1}
          paginationState={{ pageIndex: 0, pageSize: 20 }}
          rows={args?.rows ?? rows}
          rowSelectionState={rowSelectionState}
        />
      </div>
    );
  }

  act(() => {
    root.render(<GridHarness />);
  });

  function getCell(rowIndex: number, columnId: string): HTMLTableCellElement {
    const selector = `td[data-grid-row-index="${rowIndex}"][data-grid-column-id="${columnId}"]`;
    const cell = container.querySelector(selector);

    if (!(cell instanceof HTMLTableCellElement)) {
      throw new Error(`Could not find cell: ${selector}`);
    }

    return cell;
  }

  function getSelectedRowCount(): number {
    const host = container.querySelector("[data-selected-row-count]");

    if (!(host instanceof HTMLElement)) {
      throw new Error("Could not locate row selection host");
    }

    return Number(host.dataset.selectedRowCount ?? "0");
  }

  function cleanup() {
    act(() => {
      root.unmount();
    });
    container.remove();
  }

  return {
    cleanup,
    container,
    getCell,
    getSelectedRowCount,
    setFocusedCell: (
      nextFocusedCell: {
        columnId: string;
        rowIndex: number;
      } | null,
    ) => {
      act(() => {
        if (!setFocusedCell) {
          throw new Error("Could not update focused cell");
        }

        setFocusedCell(nextFocusedCell);
      });
    },
  };
}

function renderGridWithSelectionScope(args?: {
  columnDefs?: GridColumnDef[];
  rows?: GridRow[];
  scopeConfigs?: Record<
    string,
    {
      columnDefs?: GridColumnDef[];
      rows?: GridRow[];
    }
  >;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let setSelectionScopeKey: ((nextKey: string) => void) | undefined;

  function GridHarness() {
    const [rowSelectionState, setRowSelectionState] =
      useState<RowSelectionState>({});
    const [selectionScopeKey, setSelectionScopeKeyState] = useState("table_a");
    const scopeConfig = args?.scopeConfigs?.[selectionScopeKey];

    setSelectionScopeKey = setSelectionScopeKeyState;

    return (
      <div
        data-selected-row-count={
          Object.values(rowSelectionState).filter(Boolean).length
        }
      >
        <DataGrid
          columnDefs={
            (scopeConfig?.columnDefs ??
              args?.columnDefs ??
              createReadOnlyColumns()) as AccessorKeyColumnDefBase<
              Record<string, unknown>
            >[]
          }
          isFetching={false}
          isProcessing={false}
          onPaginationChange={vi.fn()}
          onRowSelectionChange={(updater) => {
            setRowSelectionState((previous) => {
              return typeof updater === "function"
                ? updater(previous)
                : updater;
            });
          }}
          pageCount={1}
          paginationState={{ pageIndex: 0, pageSize: 20 }}
          rows={scopeConfig?.rows ?? args?.rows ?? rows}
          rowSelectionState={rowSelectionState}
          selectionScopeKey={selectionScopeKey}
        />
      </div>
    );
  }

  act(() => {
    root.render(<GridHarness />);
  });

  function getCell(rowIndex: number, columnId: string): HTMLTableCellElement {
    const selector = `td[data-grid-row-index="${rowIndex}"][data-grid-column-id="${columnId}"]`;
    const cell = container.querySelector(selector);

    if (!(cell instanceof HTMLTableCellElement)) {
      throw new Error(`Could not find cell: ${selector}`);
    }

    return cell;
  }

  function getSelectedRowCount(): number {
    const host = container.querySelector("[data-selected-row-count]");

    if (!(host instanceof HTMLElement)) {
      throw new Error("Could not locate row selection host");
    }

    return Number(host.dataset.selectedRowCount ?? "0");
  }

  function switchSelectionScope(nextKey: string) {
    act(() => {
      if (!setSelectionScopeKey) {
        throw new Error("Could not update selection scope key");
      }

      setSelectionScopeKey(nextKey);
    });
  }

  function cleanup() {
    act(() => {
      root.unmount();
    });
    container.remove();
  }

  return {
    cleanup,
    container,
    getCell,
    getSelectedRowCount,
    switchSelectionScope,
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete document.body.dataset.studioSuppressCellOpenUntil;
});

describe("DataGrid interactions", () => {
  it("keeps native text selection when selecting within a single cell", () => {
    createSelection({ isCollapsed: false, text: "acm" });

    const { cleanup, getCell, container } = renderGrid();
    const cell = getCell(0, "id");

    dispatchMouse(cell, "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      0,
    );

    cleanup();
  });

  it("switches from text-selection mode to cell-selection mode when dragging into another cell", () => {
    const { removeAllRanges } = createSelection({
      isCollapsed: false,
      text: "org_acme",
    });

    const { cleanup, getCell, container } = renderGrid();
    const firstCell = getCell(0, "id");
    const secondCell = getCell(0, "name");

    dispatchMouse(firstCell, "mousedown", { button: 0 });
    dispatchMouse(secondCell, "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(removeAllRanges).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    cleanup();
  });

  it("still opens editable cell content on click", async () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container } = renderGrid({
      columnDefs: createEditableColumns(),
      rows: [{ __ps_rowid: "row_1", name: "Acme Labs" }],
    });

    const cell = getCell(0, "name");

    dispatchMouse(cell, "mousedown", { button: 0 });
    dispatchMouse(cell, "mouseup", { button: 0 });
    dispatchMouse(cell, "click", { button: 0 });

    await flushMicrotasks();

    expect(
      container.querySelector('span[data-editor-open="editor-0-name"]'),
    ).not.toBeNull();

    cleanup();
  });

  it("keeps the active cell selection stable when opening the context menu", async () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container } = renderGrid();
    const firstCell = getCell(0, "id");
    const secondCell = getCell(0, "name");

    dispatchMouse(firstCell, "mousedown", { button: 0 });
    dispatchMouse(secondCell, "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    dispatchMouse(firstCell, "contextmenu", { button: 2 });
    await flushMicrotasks();

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    cleanup();
  });

  it("clears selected cells when clicking outside the selected range", async () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container } = renderGrid();
    const firstCell = getCell(0, "id");
    const secondCell = getCell(0, "name");

    dispatchMouse(firstCell, "mousedown", { button: 0 });
    dispatchMouse(secondCell, "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    const outsideCell = getCell(1, "id");

    dispatchMouse(outsideCell, "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");
    dispatchMouse(outsideCell, "click", { button: 0 });
    await flushMicrotasks();

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      0,
    );

    cleanup();
  });

  it("expands and contracts cell selection with Shift+Arrow keys", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container } = renderGrid();
    const firstCell = getCell(0, "id");
    const secondCell = getCell(0, "name");

    dispatchMouse(firstCell, "mousedown", { button: 0 });
    dispatchMouse(secondCell, "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    dispatchKeyboard("ArrowDown", { shiftKey: true });

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      4,
    );

    dispatchKeyboard("ArrowLeft", { shiftKey: true });

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    cleanup();
  });

  it("moves the focused cell with Shift+Arrow selection expansion", () => {
    createSelection({ isCollapsed: true });
    const onFocusedCellChange = vi.fn();

    const { cleanup, getCell } = renderGrid({
      columnDefs: createReadOnlyColumns({
        columnIds: ["id", "created_at", "name"],
      }),
      focusedCell: {
        columnId: "created_at",
        rowIndex: 0,
      },
      onFocusedCellChange,
    });
    const firstCell = getCell(0, "id");
    const secondCell = getCell(0, "created_at");

    dispatchMouse(firstCell, "mousedown", { button: 0 });
    dispatchMouse(secondCell, "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    onFocusedCellChange.mockClear();
    dispatchKeyboard("ArrowRight", { shiftKey: true });

    expect(onFocusedCellChange).toHaveBeenLastCalledWith({
      columnId: "name",
      rowIndex: 0,
    });

    cleanup();
  });

  it("does not auto-scroll the focused cell back into view after a manual grid scroll", async () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 120;
      },
    });

    let cleanupGrid: (() => void) | null = null;

    try {
      const { cleanup, container } = renderGrid({
        columnDefs: createReadOnlyColumns({
          columnIds: ["id", "name", "email"],
        }),
        focusedCell: {
          columnId: "id",
          rowIndex: 0,
        },
        rows: [
          {
            __ps_rowid: "row_1",
            email: "alice@example.com",
            id: "org_acme",
            name: "Acme Labs",
          },
        ],
      });
      cleanupGrid = cleanup;

      const scrollContainer = container.querySelector(
        '[data-grid-scroll-container="true"]',
      );

      if (!(scrollContainer instanceof HTMLDivElement)) {
        throw new Error("Could not find table scroll container");
      }

      await flushMicrotasks();

      act(() => {
        scrollContainer.scrollLeft = 200;
        scrollContainer.dispatchEvent(new Event("scroll"));
      });

      await flushMicrotasks();

      expect(scrollContainer.scrollLeft).toBe(200);
    } finally {
      cleanupGrid?.();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();

      if (clientWidthDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "clientWidth",
          clientWidthDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
      }
    }
  });

  it("keeps leftward focused-cell scrolling aligned after the pinned selector gutter", async () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );
    const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 320;
      },
    });

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: function mockScrollIntoView(this: HTMLElement) {
        const scrollContainer = this.closest("table")?.parentElement;

        if (scrollContainer instanceof HTMLDivElement) {
          // Simulate the browser aligning the cell to the raw container edge.
          scrollContainer.scrollLeft = 0;
        }
      },
    });

    let cleanupGrid: (() => void) | null = null;

    try {
      const { cleanup, container, setFocusedCell } = renderGrid({
        columnDefs: createReadOnlyColumns({
          columnIds: ["id", "name", "email"],
          includeRowSelector: true,
        }),
        focusedCell: {
          columnId: "email",
          rowIndex: 0,
        },
        manageFocusedCell: true,
        rows: [
          {
            __ps_rowid: "row_1",
            email: "alice@example.com",
            id: "org_acme",
            name: "Acme Labs",
          },
        ],
      });
      cleanupGrid = cleanup;

      const scrollContainer = container.querySelector(
        '[data-grid-scroll-container="true"]',
      );

      if (!(scrollContainer instanceof HTMLDivElement)) {
        throw new Error("Could not find table scroll container");
      }

      await flushMicrotasks();

      act(() => {
        scrollContainer.scrollLeft = 235;
        scrollContainer.dispatchEvent(new Event("scroll"));
      });
      await flushMicrotasks();

      setFocusedCell({
        columnId: "id",
        rowIndex: 0,
      });
      await flushMicrotasks();

      expect(scrollContainer.scrollLeft).toBe(0);
    } finally {
      cleanupGrid?.();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();

      if (clientWidthDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "clientWidth",
          clientWidthDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
      }

      if (scrollIntoViewDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollIntoView",
          scrollIntoViewDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    }
  });

  it("loads more rows when infinite scroll reaches the bottom threshold", async () => {
    const onLoadMoreRows = vi.fn();
    const { cleanup, container } = renderGrid({
      hasMoreInfiniteRows: true,
      infiniteScrollEnabled: true,
      onLoadMoreRows,
      pageCount: 10,
    });

    const scrollContainer = container.querySelector(
      '[data-grid-scroll-container="true"]',
    );

    if (!(scrollContainer instanceof HTMLDivElement)) {
      throw new Error("Could not find table scroll container");
    }

    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    onLoadMoreRows.mockClear();

    act(() => {
      scrollContainer.scrollTop = 560;
      scrollContainer.dispatchEvent(new Event("scroll"));
    });

    await flushMicrotasks();

    expect(onLoadMoreRows).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("loads more rows immediately when the first infinite-scroll page does not overflow", async () => {
    const onLoadMoreRows = vi.fn();
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );

    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        if (
          this instanceof HTMLElement &&
          this.dataset.gridScrollContainer === "true"
        ) {
          return 1000;
        }

        const value: unknown = clientHeightDescriptor?.get?.call(this);

        return typeof value === "number" ? value : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        if (
          this instanceof HTMLElement &&
          this.dataset.gridScrollContainer === "true"
        ) {
          return 1000;
        }

        const value: unknown = scrollHeightDescriptor?.get?.call(this);

        return typeof value === "number" ? value : 0;
      },
    });

    try {
      const { cleanup } = renderGrid({
        hasMoreInfiniteRows: true,
        infiniteScrollEnabled: true,
        onLoadMoreRows,
        pageCount: 10,
      });

      await flushMicrotasks();

      expect(onLoadMoreRows).toHaveBeenCalledTimes(1);

      cleanup();
    } finally {
      if (clientHeightDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "clientHeight",
          clientHeightDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
      }

      if (scrollHeightDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollHeight",
          scrollHeightDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
      }
    }
  });

  it("clears selected cells with Escape when not editing", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container } = renderGrid();
    const firstCell = getCell(0, "id");
    const secondCell = getCell(0, "name");

    dispatchMouse(firstCell, "mousedown", { button: 0 });
    dispatchMouse(secondCell, "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    dispatchKeyboard("Escape");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      0,
    );

    cleanup();
  });

  it("deselects selected cells when switching into row-selection mode", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });
    const firstCell = getCell(0, "id");
    const secondCell = getCell(0, "name");

    dispatchMouse(firstCell, "mousedown", { button: 0 });
    dispatchMouse(secondCell, "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );
    expect(getSelectedRowCount()).toBe(0);

    dispatchMouse(getCell(1, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      0,
    );
    expect(getSelectedRowCount()).toBe(1);

    cleanup();
  });

  it("does not clear selected cells with Escape while an editor input is focused", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container } = renderGrid();
    const firstCell = getCell(0, "id");
    const secondCell = getCell(0, "name");

    dispatchMouse(firstCell, "mousedown", { button: 0 });
    dispatchMouse(secondCell, "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    const editorInput = document.createElement("input");
    document.body.appendChild(editorInput);
    editorInput.focus();

    dispatchKeyboard("Escape");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    editorInput.remove();
    cleanup();
  });

  it("selects full rows by dragging the first-column spacer cell", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    const firstRowSelector = getCell(0, "__ps_select");
    dispatchMouse(firstRowSelector, "mousedown", { button: 0 });
    dispatchMouse(getCell(2, "__ps_select"), "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(3);
    expect(
      container.querySelectorAll('tr[data-row-selected="true"]'),
    ).toHaveLength(3);
    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      0,
    );

    cleanup();
  });

  it("selects all rows when clicking the top-left spacer header cell", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, container, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    const spacerHeader = container.querySelector(
      'th[aria-label="Row selection spacer"]',
    );

    if (!(spacerHeader instanceof HTMLElement)) {
      throw new Error("Could not find row selection spacer header");
    }

    dispatchMouse(spacerHeader, "mousedown", { button: 0 });

    expect(getSelectedRowCount()).toBe(rows.length);
    expect(
      container.querySelectorAll('tr[data-row-selected="true"]'),
    ).toHaveLength(rows.length);

    cleanup();
  });

  it("toggles all-row selection off when clicking the top-left spacer header while all rows are selected", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, container, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    const spacerHeader = container.querySelector(
      'th[aria-label="Row selection spacer"]',
    );

    if (!(spacerHeader instanceof HTMLElement)) {
      throw new Error("Could not find row selection spacer header");
    }

    dispatchMouse(spacerHeader, "mousedown", { button: 0 });
    expect(getSelectedRowCount()).toBe(rows.length);

    const rerenderedSpacerHeader = container.querySelector(
      'th[aria-label="Row selection spacer"]',
    );

    if (!(rerenderedSpacerHeader instanceof HTMLElement)) {
      throw new Error(
        "Could not find row selection spacer header after select",
      );
    }

    dispatchMouse(rerenderedSpacerHeader, "mousedown", { button: 0 });
    expect(getSelectedRowCount()).toBe(0);
    expect(
      container.querySelectorAll('tr[data-row-selected="true"]'),
    ).toHaveLength(0);

    cleanup();
  });

  it("supports non-adjacent row selection via Shift+click on first-column spacer cells", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    const firstRowSelector = getCell(0, "__ps_select");
    dispatchMouse(firstRowSelector, "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    dispatchMouse(getCell(2, "__ps_select"), "mousedown", {
      button: 0,
      shiftKey: true,
    });
    dispatchMouse(window, "mouseup");

    const firstRowElement = getCell(0, "__ps_select").closest("tr");
    const secondRowElement = getCell(1, "__ps_select").closest("tr");
    const thirdRowElement = getCell(2, "__ps_select").closest("tr");

    expect(getSelectedRowCount()).toBe(2);
    expect(firstRowElement?.dataset.rowSelected).toBe("true");
    expect(secondRowElement?.dataset.rowSelected).toBeUndefined();
    expect(thirdRowElement?.dataset.rowSelected).toBe("true");

    cleanup();
  });

  it("supports Shift+click deselection of an already-selected row", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(1);

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", {
      button: 0,
      shiftKey: true,
    });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(0);
    expect(getCell(0, "__ps_select").closest("tr")?.dataset.rowSelected).toBe(
      undefined,
    );

    cleanup();
  });

  it("exits row-selection mode and starts cell selection when dragging a data cell", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(1);

    dispatchMouse(getCell(0, "id"), "mousedown", { button: 0 });
    dispatchMouse(getCell(0, "name"), "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(0);
    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    cleanup();
  });

  it("clears row selection with Escape in row-selection mode", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(1);
    expect(
      container.querySelectorAll('tr[data-row-selected="true"]'),
    ).toHaveLength(1);

    dispatchKeyboard("Escape");

    expect(getSelectedRowCount()).toBe(0);
    expect(
      container.querySelectorAll('tr[data-row-selected="true"]'),
    ).toHaveLength(0);

    cleanup();
  });

  it("selects the row immediately when right-clicking the first-column spacer cell", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    dispatchMouse(getCell(1, "__ps_select"), "mousedown", { button: 2 });

    const firstRowElement = getCell(0, "__ps_select").closest("tr");
    const secondRowElement = getCell(1, "__ps_select").closest("tr");

    expect(getSelectedRowCount()).toBe(1);
    expect(firstRowElement?.dataset.rowSelected).toBeUndefined();
    expect(secondRowElement?.dataset.rowSelected).toBe("true");

    cleanup();
  });

  it("keeps existing multi-row selection when right-clicking a selected first-column spacer cell", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");
    dispatchMouse(getCell(2, "__ps_select"), "mousedown", {
      button: 0,
      shiftKey: true,
    });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(2);

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 2 });

    expect(getSelectedRowCount()).toBe(2);
    expect(getCell(0, "__ps_select").closest("tr")?.dataset.rowSelected).toBe(
      "true",
    );
    expect(getCell(2, "__ps_select").closest("tr")?.dataset.rowSelected).toBe(
      "true",
    );

    cleanup();
  });

  it("copies all selected rows on keyboard copy in row-selection mode", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");
    dispatchMouse(getCell(2, "__ps_select"), "mousedown", {
      button: 0,
      shiftKey: true,
    });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(2);

    const { copyEvent, setData } = dispatchCopyEvent();

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      "org_acme\tAcme Labs\norg_globex\tGlobex Corp",
    );

    cleanup();
  });

  it("keeps the last row bottom border styling enabled", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, container } = renderGrid();
    const dataRows = container.querySelectorAll("tbody tr");
    const lastRow = dataRows[dataRows.length - 1];

    if (!(lastRow instanceof HTMLTableRowElement)) {
      throw new Error("Could not find last data row");
    }

    expect(lastRow.className).not.toContain("[&:last-of-type_td]:border-b-0");

    cleanup();
  });

  it("ignores row and cell pointer interactions during copy-action suppression window", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, getCell, container, getSelectedRowCount } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(1);

    document.body.dataset.studioSuppressCellOpenUntil = String(
      Date.now() + 5000,
    );

    dispatchMouse(getCell(1, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(getCell(0, "id"), "mousedown", { button: 0 });
    dispatchMouse(getCell(0, "name"), "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(1);
    expect(
      container.querySelectorAll('tr[data-row-selected="true"]'),
    ).toHaveLength(1);
    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      0,
    );

    cleanup();
  });

  it("keeps row-selector cells opaque while horizontally scrolling", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, container, getCell } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    const spacerHeader = container.querySelector(
      'th[aria-label="Row selection spacer"]',
    );

    if (!(spacerHeader instanceof HTMLElement)) {
      throw new Error("Could not find row selection spacer header");
    }

    expect(spacerHeader.className).toContain("cursor-pointer");

    const rowSelectorCell = getCell(0, "__ps_select");
    const className = rowSelectorCell.className;

    expect(className).toContain("group-odd:bg-table-cell-odd");
    expect(className).toContain("group-even:bg-table-cell-even");
    expect(className).toContain("z-30");

    dispatchMouse(getCell(1, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(getCell(1, "__ps_select").className).toContain(
      "group-even:!bg-table-row-selected-even",
    );
    expect(getCell(1, "id").className).toContain(
      "group-even:!bg-table-row-selected-even",
    );

    cleanup();
  });

  it("resets row and cell selection state when selection scope key changes", () => {
    createSelection({ isCollapsed: true });

    const {
      cleanup,
      container,
      getCell,
      getSelectedRowCount,
      switchSelectionScope,
    } = renderGridWithSelectionScope({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");
    expect(getSelectedRowCount()).toBe(1);

    dispatchMouse(getCell(0, "id"), "mousedown", { button: 0 });
    dispatchMouse(getCell(0, "name"), "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");
    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      2,
    );

    switchSelectionScope("table_b");

    expect(getSelectedRowCount()).toBe(0);
    expect(
      container.querySelectorAll('tr[data-row-selected="true"]'),
    ).toHaveLength(0);
    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      0,
    );

    cleanup();
  });

  it("keeps selection and row-copy behavior working for FK-like columns after switching tables", () => {
    createSelection({ isCollapsed: true });

    const {
      cleanup,
      container,
      getCell,
      getSelectedRowCount,
      switchSelectionScope,
    } = renderGridWithSelectionScope({
      scopeConfigs: {
        table_a: {
          columnDefs: createReadOnlyColumns({
            includeRowSelector: true,
            columnIds: ["id", "name"],
          }),
          rows: [{ __ps_rowid: "row_a", id: "org_acme", name: "Acme Labs" }],
        },
        table_b: {
          columnDefs: createReadOnlyColumns({
            includeRowSelector: true,
            columnIds: [
              "id",
              "description",
              "organization_id",
              "owner_id",
              "status",
            ],
          }),
          rows: [
            {
              __ps_rowid: "incident_1",
              id: "inc_1",
              description: "Investigate outage",
              organization_id: "org_acme",
              owner_id: "usr_jane",
              status: "open",
            },
          ],
        },
      },
    });

    switchSelectionScope("table_b");

    dispatchMouse(getCell(0, "organization_id"), "mousedown", { button: 0 });
    dispatchMouse(getCell(0, "status"), "mouseover", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(container.querySelectorAll('td[data-selected="true"]')).toHaveLength(
      3,
    );

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(1);

    const { copyEvent, setData } = dispatchCopyEvent();

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      "inc_1\tInvestigate outage\torg_acme\tusr_jane\topen",
    );

    cleanup();
  });

  it("focuses the grid scroll container when a focus request is provided", () => {
    const { cleanup, container } = renderGrid({
      focusScrollContainerKey: 1,
    });
    const scrollContainer = container.querySelector(
      '[data-grid-scroll-container="true"]',
    );

    if (!(scrollContainer instanceof HTMLDivElement)) {
      throw new Error("Could not find grid scroll container");
    }

    expect(scrollContainer.getAttribute("tabindex")).toBe("0");
    expect(scrollContainer.getAttribute("aria-label")).toBe("Table grid");
    expect(document.activeElement).toBe(scrollContainer);

    cleanup();
  });
});
