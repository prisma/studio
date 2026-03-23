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
  dispatchMouse,
  type GridColumnDef,
  type GridRow,
} from "./test-utils";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createPinnableColumns() {
  return [
    {
      accessorKey: "id",
      id: "id",
      header({ header }) {
        return (props: Omit<CellProps, "children" | "ref">) => (
          <TableHead {...props}>
            <button
              data-testid="pin-id-column"
              type="button"
              onClick={() => header.column.pin("left")}
            >
              Pin id
            </button>
          </TableHead>
        );
      },
      cell({ cell }) {
        return (props: Omit<CellProps, "children" | "ref">) => (
          <Cell {...props}>{String(cell.getValue() ?? "")}</Cell>
        );
      },
    },
    {
      accessorKey: "name",
      id: "name",
      header({ header }) {
        return (props: Omit<CellProps, "children" | "ref">) => (
          <TableHead {...props}>
            <button
              data-testid="unpin-name-column"
              type="button"
              onClick={() => header.column.pin(false)}
            >
              Unpin name
            </button>
            <span>{header.id}</span>
          </TableHead>
        );
      },
      cell({ cell }) {
        return (props: Omit<CellProps, "children" | "ref">) => (
          <Cell {...props}>{String(cell.getValue() ?? "")}</Cell>
        );
      },
    },
  ] satisfies GridColumnDef[];
}

function createWidePinnableColumns(columnCount = 20) {
  return Array.from({ length: columnCount }, (_, index) => {
    const id = `col_${index}`;

    return {
      accessorKey: id,
      id,
      header({ header }) {
        return (props: Omit<CellProps, "children" | "ref">) => (
          <TableHead {...props}>
            <button
              data-testid={`pin-${header.id}`}
              type="button"
              onClick={() => header.column.pin("left")}
            >
              Pin {header.id}
            </button>
            <span>{header.id}</span>
          </TableHead>
        );
      },
      cell({ cell }) {
        return (props: Omit<CellProps, "children" | "ref">) => (
          <Cell {...props}>{String(cell.getValue() ?? "")}</Cell>
        );
      },
    } satisfies GridColumnDef;
  });
}

function renderGrid(args?: {
  columnDefs?: GridColumnDef[];
  onPinnedColumnIdsChange?: (columnIds: string[]) => void;
  pinnedColumnIds?: string[];
  rows?: GridRow[];
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function GridHarness() {
    const [rowSelectionState, setRowSelectionState] =
      useState<RowSelectionState>({});

    return (
      <DataGrid
        columnDefs={
          (args?.columnDefs ??
            createPinnableColumns()) as AccessorKeyColumnDefBase<
            Record<string, unknown>
          >[]
        }
        isFetching={false}
        isProcessing={false}
        onPinnedColumnIdsChange={args?.onPinnedColumnIdsChange}
        onPaginationChange={vi.fn()}
        onRowSelectionChange={(updater) => {
          setRowSelectionState((previous) => {
            return typeof updater === "function" ? updater(previous) : updater;
          });
        }}
        pageCount={1}
        paginationState={{ pageIndex: 0, pageSize: 20 }}
        pinnedColumnIds={args?.pinnedColumnIds}
        rows={
          args?.rows ?? [
            { __ps_rowid: "row_1", id: "org_acme", name: "Acme Labs" },
            { __ps_rowid: "row_2", id: "org_globex", name: "Globex Corp" },
          ]
        }
        rowSelectionState={rowSelectionState}
      />
    );
  }

  act(() => {
    root.render(<GridHarness />);
  });

  function cleanup() {
    act(() => {
      root.unmount();
    });
    container.remove();
  }

  function getCell(rowIndex: number, columnId: string): HTMLTableCellElement {
    const selector = `td[data-grid-row-index="${rowIndex}"][data-grid-column-id="${columnId}"]`;
    const cell = container.querySelector(selector);

    if (!(cell instanceof HTMLTableCellElement)) {
      throw new Error(`Could not find cell: ${selector}`);
    }

    return cell;
  }

  return {
    cleanup,
    container,
    getCell,
  };
}

function createRect(args: {
  height?: number;
  left: number;
  top?: number;
  width?: number;
}): DOMRect {
  const { height = 32, left, top = 0, width = 120 } = args;

  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON() {
      return {};
    },
    top,
    width,
    x: left,
    y: top,
  } as DOMRect;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete document.body.dataset.studioSuppressCellOpenUntil;
});

describe("DataGrid pinning", () => {
  it("keeps a pinned column sticky after subsequent rerenders", () => {
    createSelection({ isCollapsed: true });

    const { cleanup, container, getCell } = renderGrid();
    const pinButton = container.querySelector('[data-testid="pin-id-column"]');

    if (!(pinButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find pin button");
    }

    const idCell = getCell(0, "id");
    expect(idCell.className).not.toContain("sticky");

    act(() => {
      pinButton.click();
    });

    const pinnedCellClassName = getCell(0, "id").className;
    expect(pinnedCellClassName).toContain("sticky");
    expect(pinnedCellClassName).toContain("z-20");
    expect(pinnedCellClassName).toContain("group-odd:!bg-table-cell-odd");
    expect(pinnedCellClassName).toContain("group-even:!bg-table-cell-even");
    expect(pinnedCellClassName).toContain("group-hover:!bg-muted");
    expect(getCell(0, "name").className).toContain("z-0");

    act(() => {
      dispatchMouse(getCell(0, "id"), "mousedown", { button: 0 });
      dispatchMouse(getCell(0, "name"), "mouseover", { button: 0 });
      dispatchMouse(window, "mouseup");
    });

    expect(getCell(0, "id").className).toContain("sticky");

    cleanup();
  });

  it("applies URL-driven pinned columns and reports pin updates", () => {
    createSelection({ isCollapsed: true });
    const onPinnedColumnIdsChange = vi.fn();
    const { cleanup, container, getCell } = renderGrid({
      onPinnedColumnIdsChange,
      pinnedColumnIds: ["id", "name"],
    });

    expect(getCell(0, "id").className).toContain("sticky");
    expect(getCell(0, "name").className).toContain("sticky");

    const unpinNameButton = container.querySelector(
      '[data-testid="unpin-name-column"]',
    );

    if (!(unpinNameButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find unpin name button");
    }

    act(() => {
      unpinNameButton.click();
    });

    expect(onPinnedColumnIdsChange).toHaveBeenLastCalledWith(["id"]);
    cleanup();
  });

  it("keeps sticky header layering for unpinned columns while reserving higher layer for pinned headers", () => {
    createSelection({ isCollapsed: true });
    const { cleanup, container } = renderGrid();

    const idHeader = container.querySelector(
      'th[data-grid-header-column-id="id"]',
    );
    const nameHeader = container.querySelector(
      'th[data-grid-header-column-id="name"]',
    );
    const pinIdButton = container.querySelector(
      '[data-testid="pin-id-column"]',
    );

    if (!(idHeader instanceof HTMLTableCellElement)) {
      throw new Error("Could not find id header");
    }
    if (!(nameHeader instanceof HTMLTableCellElement)) {
      throw new Error("Could not find name header");
    }
    if (!(pinIdButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find pin id button");
    }

    expect(idHeader.className).toContain("z-10");
    expect(nameHeader.className).toContain("z-10");
    expect(idHeader.className).not.toContain("z-30");

    act(() => {
      pinIdButton.click();
    });

    const pinnedIdHeader = container.querySelector(
      'th[data-grid-header-column-id="id"]',
    );

    if (!(pinnedIdHeader instanceof HTMLTableCellElement)) {
      throw new Error("Could not find pinned id header");
    }

    expect(pinnedIdHeader.className).toContain("z-30");
    cleanup();
  });

  it("keeps the row selection spacer header above pinned row selector cells", () => {
    createSelection({ isCollapsed: true });
    const { cleanup, container } = renderGrid({
      columnDefs: createReadOnlyColumns({ includeRowSelector: true }),
    });

    const spacerHeader = container.querySelector(
      'th[aria-label="Row selection spacer"]',
    );
    const selectorCell = container.querySelector("td[data-row-select-cell]");

    if (!(spacerHeader instanceof HTMLTableCellElement)) {
      throw new Error("Could not find row selection spacer header");
    }
    if (!(selectorCell instanceof HTMLTableCellElement)) {
      throw new Error("Could not find row selection cell");
    }

    expect(spacerHeader.className).toContain("z-40");
    expect(selectorCell.className).toContain("z-30");
    cleanup();
  });

  it("animates headers and visible cells with CSS transforms when pinning changes", () => {
    createSelection({ isCollapsed: true });
    vi.useFakeTimers();
    const requestAnimationFrameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        requestAnimationFrameCallbacks.push(callback);
        return requestAnimationFrameCallbacks.length;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const columnId =
          this.dataset.gridHeaderColumnId ?? this.dataset.gridColumnId;
        const isPinnedHeader =
          this.tagName === "TH" && this.style.left === "0px";
        const isSticky =
          this.tagName === "TH"
            ? isPinnedHeader
            : this.className.includes("sticky");

        if (columnId === "id") {
          return createRect({
            left: isSticky ? 24 : 140,
            top:
              this.tagName === "TD"
                ? Number(this.dataset.gridRowIndex ?? 0) * 32 + 32
                : 0,
          });
        }

        if (columnId === "name") {
          return createRect({
            left: 260,
            top:
              this.tagName === "TD"
                ? Number(this.dataset.gridRowIndex ?? 0) * 32 + 32
                : 0,
          });
        }

        return createRect({ left: 0 });
      });

    try {
      const { cleanup, container, getCell } = renderGrid();
      requestAnimationFrameCallbacks.length = 0;
      const pinButton = container.querySelector(
        '[data-testid="pin-id-column"]',
      );

      if (!(pinButton instanceof HTMLButtonElement)) {
        throw new Error("Could not find pin id button");
      }

      act(() => {
        pinButton.click();
      });

      const pinnedHeader = container.querySelector(
        'th[data-grid-header-column-id="id"]',
      );
      const pinnedCell = getCell(0, "id");

      if (!(pinnedHeader instanceof HTMLTableCellElement)) {
        throw new Error("Could not find pinned id header");
      }

      expect(pinnedHeader.dataset.pinningAnimating).toBe("from");
      expect(
        pinnedHeader.style.getPropertyValue("--ps-pinning-translate-x"),
      ).toBe("116px");
      expect(pinnedCell.dataset.pinningAnimating).toBe("from");
      expect(
        pinnedCell.style.getPropertyValue("--ps-pinning-translate-x"),
      ).toBe("116px");
      expect(requestAnimationFrameCallbacks).toHaveLength(1);

      act(() => {
        requestAnimationFrameCallbacks.shift()?.(16);
      });

      const heldHeader = container.querySelector(
        'th[data-grid-header-column-id="id"]',
      );
      const heldCell = getCell(0, "id");

      if (!(heldHeader instanceof HTMLTableCellElement)) {
        throw new Error("Could not find held id header");
      }

      expect(heldHeader.dataset.pinningAnimating).toBe("from");
      expect(
        heldHeader.style.getPropertyValue("--ps-pinning-translate-x"),
      ).toBe("116px");
      expect(heldCell.dataset.pinningAnimating).toBe("from");
      expect(heldCell.style.getPropertyValue("--ps-pinning-translate-x")).toBe(
        "116px",
      );
      expect(requestAnimationFrameCallbacks).toHaveLength(1);

      act(() => {
        requestAnimationFrameCallbacks.shift()?.(32);
      });

      const animatedHeader = container.querySelector(
        'th[data-grid-header-column-id="id"]',
      );
      const animatedCell = getCell(0, "id");

      if (!(animatedHeader instanceof HTMLTableCellElement)) {
        throw new Error("Could not find animated id header");
      }

      expect(animatedHeader.dataset.pinningAnimating).toBe("true");
      expect(
        animatedHeader.style.getPropertyValue("--ps-pinning-translate-x"),
      ).toBe("0px");
      expect(animatedCell.dataset.pinningAnimating).toBe("true");
      expect(
        animatedCell.style.getPropertyValue("--ps-pinning-translate-x"),
      ).toBe("0px");

      act(() => {
        vi.runAllTimers();
      });

      const settledHeader = container.querySelector(
        'th[data-grid-header-column-id="id"]',
      );
      const settledCell = getCell(0, "id");

      if (!(settledHeader instanceof HTMLTableCellElement)) {
        throw new Error("Could not find settled id header");
      }

      expect(settledHeader.dataset.pinningAnimating).toBeUndefined();
      expect(
        settledHeader.style.getPropertyValue("--ps-pinning-translate-x"),
      ).toBe("");
      expect(settledCell.dataset.pinningAnimating).toBeUndefined();
      expect(
        settledCell.style.getPropertyValue("--ps-pinning-translate-x"),
      ).toBe("");

      cleanup();
    } finally {
      getBoundingClientRectSpy.mockRestore();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps the first unpinned column visible after pinning three columns", () => {
    createSelection({ isCollapsed: true });

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
        return 1000;
      },
    });

    let cleanupGrid: (() => void) | null = null;

    try {
      const wideRows: GridRow[] = [
        {
          __ps_rowid: "row_1",
          ...Object.fromEntries(
            Array.from({ length: 20 }, (_, index) => [
              `col_${index}`,
              `r1c${index}`,
            ]),
          ),
        },
      ];

      const { cleanup, container } = renderGrid({
        columnDefs: createWidePinnableColumns(),
        rows: wideRows,
      });
      cleanupGrid = cleanup;

      const pinColumnIds = ["col_0", "col_1", "col_2"];

      for (const columnId of pinColumnIds) {
        const pinButton = container.querySelector(
          `[data-testid="pin-${columnId}"]`,
        );

        if (!(pinButton instanceof HTMLButtonElement)) {
          throw new Error(`Could not find pin button for ${columnId}`);
        }

        act(() => {
          pinButton.click();
        });
      }

      const table = container.querySelector("table");
      if (!(table instanceof HTMLTableElement)) {
        throw new Error("Could not find table element");
      }

      const scrollContainer = table.parentElement;
      if (!(scrollContainer instanceof HTMLDivElement)) {
        throw new Error("Could not find table scroll container");
      }

      act(() => {
        scrollContainer.scrollLeft = 0;
        scrollContainer.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("resize"));
      });

      const firstRow = container.querySelector("tbody tr");
      if (!(firstRow instanceof HTMLTableRowElement)) {
        throw new Error("Could not find first row");
      }

      const cells = Array.from(firstRow.querySelectorAll("td"));
      const firstUnpinnedCell = cells[3];

      if (!(firstUnpinnedCell instanceof HTMLTableCellElement)) {
        throw new Error("Could not find first unpinned cell");
      }

      expect(firstUnpinnedCell.getAttribute("aria-hidden")).not.toBe("true");
      expect(firstUnpinnedCell.dataset.gridColumnId).toBe("col_3");
      expect(firstUnpinnedCell.textContent).toContain("r1c3");
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
});
