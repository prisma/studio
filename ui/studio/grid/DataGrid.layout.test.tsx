import type {
  AccessorKeyColumnDefBase,
  RowSelectionState,
} from "@tanstack/react-table";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataGrid } from "./DataGrid";
import { createReadOnlyColumns, type GridRow } from "./test-utils";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function renderGrid(rows: GridRow[]) {
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
            columnIds: ["long_text", "short_text"],
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
        rows={rows}
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

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    table,
  };
}

describe("DataGrid layout", () => {
  it("pins the table width to the computed column sizes so long content cannot widen columns", () => {
    const { cleanup, table } = renderGrid([
      {
        __ps_rowid: "row_1",
        long_text: "x".repeat(2_000),
        short_text: "Acme Labs",
      },
    ]);

    expect(table.style.width).toBe("435px");
    expect(table.style.minWidth).toBe("100%");

    cleanup();
  });
});
