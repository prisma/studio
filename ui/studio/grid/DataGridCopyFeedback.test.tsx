import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  DataGridCopyFeedback,
  getCopyFeedbackLabel,
  type GridCopyFeedback,
} from "./DataGridCopyFeedback";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderFeedback(feedback: GridCopyFeedback | null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const gridRef = createRef<HTMLDivElement>();

  act(() => {
    root.render(
      <div ref={gridRef}>
        <table>
          <tbody>
            <tr>
              <td data-grid-column-id="email" data-grid-row-index="0">
                ada@example.com
              </td>
            </tr>
          </tbody>
        </table>
        <DataGridCopyFeedback containerRef={gridRef} feedback={feedback} />
      </div>,
    );
  });

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("DataGridCopyFeedback", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("labels single and multi-cell copies from the selection size", () => {
    expect(getCopyFeedbackLabel(1)).toBe("Copied");
    expect(getCopyFeedbackLabel(4)).toBe("Copied 4 cells");
  });

  it("hides the cue when the grid scrolls, so it never sits on another row", () => {
    const { container, cleanup } = renderFeedback({
      cellSelector: 'td[data-grid-row-index="0"][data-grid-column-id="email"]',
      key: 4,
      label: "Copied",
      ok: true,
    });

    expect(container.querySelector("[data-copy-feedback]")).not.toBeNull();

    act(() => {
      container.querySelector("table")!.dispatchEvent(new Event("scroll"));
    });

    expect(container.querySelector("[data-copy-feedback]")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Copied",
    );

    cleanup();
  });

  it("shows a confirmation inside the copied cell and announces it", () => {
    const { container, cleanup } = renderFeedback({
      cellSelector: 'td[data-grid-row-index="0"][data-grid-column-id="email"]',
      key: 1,
      label: "Copied",
      ok: true,
    });

    const cue = container.querySelector('[data-copy-feedback="ok"]');
    expect(cue?.textContent).toContain("Copied");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Copied",
    );

    cleanup();
  });

  it("shows a failure cue when the clipboard write fails", () => {
    const { container, cleanup } = renderFeedback({
      cellSelector: 'td[data-grid-row-index="0"][data-grid-column-id="email"]',
      key: 2,
      label: "Couldn't copy",
      ok: false,
    });

    expect(
      container.querySelector('[data-copy-feedback="error"]')?.textContent,
    ).toContain("Couldn't copy");

    cleanup();
  });

  it("only announces when the copied cell is not on screen", () => {
    const { container, cleanup } = renderFeedback({
      cellSelector: null,
      key: 3,
      label: "Copied 3 cells",
      ok: true,
    });

    expect(container.querySelector("[data-copy-feedback]")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Copied 3 cells",
    );

    cleanup();
  });
});
