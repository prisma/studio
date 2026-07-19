import type {
  AccessorKeyColumnDefBase,
  RowSelectionState,
} from "@tanstack/react-table";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataGrid } from "./DataGrid";
import { createReadOnlyColumns, type GridRow } from "./test-utils";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  const localStorage = createLocalStorageMock();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorage,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function createLocalStorageMock(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
}

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

  it("keeps the table wrapper as a plain overflow scroller for wide-grid horizontal scrolling", () => {
    const { cleanup, table } = renderGrid([
      {
        __ps_rowid: "row_1",
        long_text: "wide",
        short_text: "Acme Labs",
      },
    ]);
    const scrollContainer = table.parentElement;

    expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
    expect(scrollContainer?.className).toContain("overflow-auto");
    expect(scrollContainer?.className).toContain("min-w-0");
    expect(scrollContainer?.className).not.toContain("flex");

    cleanup();
  });
});
