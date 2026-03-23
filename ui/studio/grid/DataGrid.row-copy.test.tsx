import type {
  AccessorKeyColumnDefBase,
  RowSelectionState,
} from "@tanstack/react-table";
import type { MouseEvent, ReactNode } from "react";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => (
    <div data-mock-context-menu>{children}</div>
  ),
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuItem: ({
    children,
    onClick,
    onSelect,
    ...props
  }: {
    children: ReactNode;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
    onSelect?: (event: Event) => void;
  }) => (
    <button
      {...props}
      onClick={(event) => {
        onClick?.(event);
        onSelect?.(new Event("select"));
      }}
      type="button"
    >
      {children}
    </button>
  ),
  ContextMenuTrigger: ({
    asChild: _asChild,
    children,
    ...props
  }: {
    asChild?: boolean;
    children: ReactNode;
  }) => <div {...props}>{children}</div>,
}));

import { DataGrid } from "./DataGrid";
import {
  createReadOnlyColumns,
  createSelection,
  defaultRows as rows,
  dispatchMouse,
  type GridRow,
  mockClipboardWriteText,
} from "./test-utils";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderGrid(args?: { rows?: GridRow[] }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const columnDefs = createReadOnlyColumns({
    includeRowSelector: true,
  }) as AccessorKeyColumnDefBase<Record<string, unknown>>[];

  const root = createRoot(container);

  function GridHarness() {
    const [rowSelectionState, setRowSelectionState] =
      useState<RowSelectionState>({});

    return (
      <div
        data-selected-row-count={
          Object.values(rowSelectionState).filter(Boolean).length
        }
      >
        <DataGrid
          columnDefs={columnDefs}
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
    getCell,
    getSelectedRowCount,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete document.body.dataset.studioSuppressCellOpenUntil;
});

describe("DataGrid row copy behavior", () => {
  it("copies the full row when using Copy from first-column spacer cell", () => {
    createSelection({ isCollapsed: true });
    const writeText = mockClipboardWriteText();
    const { cleanup, getCell, getSelectedRowCount } = renderGrid();

    dispatchMouse(getCell(1, "__ps_select"), "mousedown", { button: 2 });
    dispatchMouse(getCell(1, "__ps_select"), "contextmenu", { button: 2 });

    expect(getSelectedRowCount()).toBe(1);

    const copyButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Copy",
    );

    if (!(copyButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find row-selector copy button");
    }

    act(() => {
      copyButton.click();
    });

    expect(writeText).toHaveBeenCalledWith("org_northwind\tNorthwind Retail");
    expect(getSelectedRowCount()).toBe(1);

    cleanup();
  });

  it("copies all selected rows when copying from any selected row cell", () => {
    createSelection({ isCollapsed: true });
    const writeText = mockClipboardWriteText();
    const { cleanup, getCell, getSelectedRowCount } = renderGrid();

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");

    dispatchMouse(getCell(2, "__ps_select"), "mousedown", {
      button: 0,
      shiftKey: true,
    });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(2);

    dispatchMouse(getCell(0, "name"), "contextmenu", { button: 2 });

    const copyButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Copy",
    );

    if (!(copyButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find selected-row cell copy button");
    }

    act(() => {
      copyButton.click();
    });

    expect(writeText).toHaveBeenCalledWith(
      "org_acme\tAcme Labs\norg_globex\tGlobex Corp",
    );
    expect(getSelectedRowCount()).toBe(2);

    cleanup();
  });

  it("copies all selected rows when using Copy from a selected first-column spacer cell", () => {
    createSelection({ isCollapsed: true });
    const writeText = mockClipboardWriteText();
    const { cleanup, getCell, getSelectedRowCount } = renderGrid();

    dispatchMouse(getCell(0, "__ps_select"), "mousedown", { button: 0 });
    dispatchMouse(window, "mouseup");
    dispatchMouse(getCell(2, "__ps_select"), "mousedown", {
      button: 0,
      shiftKey: true,
    });
    dispatchMouse(window, "mouseup");

    expect(getSelectedRowCount()).toBe(2);

    dispatchMouse(getCell(0, "__ps_select"), "contextmenu", { button: 2 });

    const copyButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Copy",
    );

    if (!(copyButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find selected-row selector copy button");
    }

    act(() => {
      copyButton.click();
    });

    expect(writeText).toHaveBeenCalledWith(
      "org_acme\tAcme Labs\norg_globex\tGlobex Corp",
    );
    expect(getSelectedRowCount()).toBe(2);

    cleanup();
  });
});
