import type { Header } from "@tanstack/react-table";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataGridDraggableHeaderCell } from "./DataGridDraggableHeaderCell";

const sortableState = {
  attributes: {},
  isDragging: false,
  listeners: {},
  setNodeRef: vi.fn(),
  transform: null,
  transition: null,
};

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => sortableState,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  sortableState.attributes = {};
  sortableState.isDragging = false;
  sortableState.listeners = {};
  sortableState.setNodeRef = vi.fn();
  sortableState.transform = null;
  sortableState.transition = null;
  document.body.innerHTML = "";
});

describe("DataGridDraggableHeaderCell", () => {
  it("keeps the header wrapper full-height and shrinkable", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <table>
          <thead>
            <tr>
              <DataGridDraggableHeaderCell
                header={
                  { id: "id" } as Header<Record<string, unknown>, unknown>
                }
                table={{ options: { meta: {} } } as never}
              >
                <span>Header</span>
              </DataGridDraggableHeaderCell>
            </tr>
          </thead>
        </table>,
      );
    });

    const wrapper = container.querySelector("th > div");

    expect(wrapper?.className).toContain("h-full");
    expect(wrapper?.className).toContain("min-w-0");
    expect(wrapper?.className).toContain("w-full");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("forwards header data attributes and preserves provided transform styles", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <table>
          <thead>
            <tr>
              <DataGridDraggableHeaderCell
                data-grid-header-column-id="id"
                data-grid-header-id="header_id"
                header={
                  { id: "id" } as Header<Record<string, unknown>, unknown>
                }
                style={{
                  transform:
                    "translate3d(var(--ps-pinning-translate-x, 0px), var(--ps-pinning-translate-y, 0px), 0)",
                }}
                table={{ options: { meta: {} } } as never}
              >
                <span>Header</span>
              </DataGridDraggableHeaderCell>
            </tr>
          </thead>
        </table>,
      );
    });

    const header = container.querySelector("th");

    expect(header?.getAttribute("data-grid-header-column-id")).toBe("id");
    expect(header?.getAttribute("data-grid-header-id")).toBe("header_id");
    expect(header?.getAttribute("style")).toContain(
      "translate3d(var(--ps-pinning-translate-x, 0px), var(--ps-pinning-translate-y, 0px), 0)",
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
