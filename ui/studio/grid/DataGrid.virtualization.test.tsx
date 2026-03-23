import type {
  AccessorKeyColumnDefBase,
  RowSelectionState,
} from "@tanstack/react-table";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { computeColumnVirtualizationWindow } from "./column-virtualization";
import { DataGrid } from "./DataGrid";
import { createReadOnlyColumns, defaultRows } from "./test-utils";

vi.mock("./column-virtualization", () => ({
  computeColumnVirtualizationWindow: vi.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface RenderGridResult {
  cleanup: () => void;
  container: HTMLDivElement;
  scrollContainer: HTMLDivElement;
}

function renderGrid(args?: { columnIds?: string[] }): RenderGridResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function GridHarness() {
    const [rowSelectionState, setRowSelectionState] =
      useState<RowSelectionState>({});

    return (
      <DataGrid
        columnDefs={
          createReadOnlyColumns({
            includeRowSelector: true,
            columnIds: args?.columnIds ?? ["id", "name", "title"],
          }) as AccessorKeyColumnDefBase<Record<string, unknown>>[]
        }
        isFetching={false}
        isProcessing={false}
        onPaginationChange={vi.fn()}
        onRowSelectionChange={(updater) => {
          setRowSelectionState((previous) => {
            return typeof updater === "function" ? updater(previous) : updater;
          });
        }}
        pageCount={1}
        paginationState={{ pageIndex: 0, pageSize: 20 }}
        rows={defaultRows.map((row) => ({
          ...row,
          title: `${String(row.name)} title`,
        }))}
        rowSelectionState={rowSelectionState}
      />
    );
  }

  act(() => {
    root.render(<GridHarness />);
  });

  const table = container.querySelector("table");
  if (!(table instanceof HTMLTableElement)) {
    throw new Error("Could not find table element");
  }

  const scrollContainer = table.parentElement;
  if (!(scrollContainer instanceof HTMLDivElement)) {
    throw new Error("Could not find table scroll container");
  }

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    container,
    scrollContainer,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("DataGrid column virtualization", () => {
  it("renders only the virtualized center-column window and spacer cells", () => {
    vi.mocked(computeColumnVirtualizationWindow).mockReturnValue({
      enabled: true,
      startIndex: 1,
      endIndex: 1,
      hiddenStartCount: 1,
      hiddenEndCount: 1,
      hiddenStartWidth: 200,
      hiddenEndWidth: 300,
    });

    const { cleanup, container } = renderGrid();

    expect(
      container.querySelector('td[data-grid-column-id="__ps_select"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('td[data-grid-column-id="name"]'),
    ).not.toBeNull();
    expect(container.querySelector('td[data-grid-column-id="id"]')).toBeNull();
    expect(
      container.querySelector('td[data-grid-column-id="title"]'),
    ).toBeNull();

    expect(
      container.querySelectorAll("tbody td[aria-hidden='true']"),
    ).toHaveLength(defaultRows.length * 2);
    expect(
      container.querySelectorAll("thead th[aria-hidden='true']"),
    ).toHaveLength(2);

    for (const spacerCell of container.querySelectorAll(
      "tbody td[aria-hidden='true']",
    )) {
      expect(spacerCell.className).toContain("relative");
      expect(spacerCell.className).toContain("z-0");
      expect(spacerCell.className).toContain("group-odd:!bg-table-cell-odd");
      expect(spacerCell.className).toContain("group-even:!bg-table-cell-even");
    }

    cleanup();
  });

  it("renders all center columns when virtualization is disabled", () => {
    vi.mocked(computeColumnVirtualizationWindow).mockReturnValue({
      enabled: false,
      startIndex: 0,
      endIndex: 2,
      hiddenStartCount: 0,
      hiddenEndCount: 0,
      hiddenStartWidth: 0,
      hiddenEndWidth: 0,
    });

    const { cleanup, container } = renderGrid();

    expect(
      container.querySelector('td[data-grid-column-id="id"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('td[data-grid-column-id="name"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('td[data-grid-column-id="title"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll("td[aria-hidden='true']")).toHaveLength(
      0,
    );
    expect(container.querySelectorAll("th[aria-hidden='true']")).toHaveLength(
      0,
    );

    cleanup();
  });

  it("passes column widths and virtualization constants into the window computation", () => {
    vi.mocked(computeColumnVirtualizationWindow).mockReturnValue({
      enabled: false,
      startIndex: 0,
      endIndex: 19,
      hiddenStartCount: 0,
      hiddenEndCount: 0,
      hiddenStartWidth: 0,
      hiddenEndWidth: 0,
    });

    const { cleanup } = renderGrid({
      columnIds: Array.from({ length: 20 }, (_, index) => `col_${index}`),
    });

    expect(computeColumnVirtualizationWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        columnWidths: Array(20).fill(200),
        minColumnCount: 16,
        overscanPx: 320,
        scrollLeft: 0,
        viewportWidth: 0,
      }),
    );

    cleanup();
  });
});
