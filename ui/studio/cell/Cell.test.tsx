import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { Cell, focusedStagedCellClassName, stagedCellClassName } from "./Cell";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Cell", () => {
  it("renders default cell content with a semantic foreground color", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <table>
          <tbody>
            <tr>
              <Cell withContextMenu={false}>Acme Labs</Cell>
            </tr>
          </tbody>
        </table>,
      );
    });

    const content = container.querySelector("[data-studio-cell-content]");

    expect(content?.className).toContain("text-foreground");
    expect(content?.textContent).toBe("Acme Labs");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("uses semantic staged-cell overlay classes instead of a fixed amber fill", () => {
    expect(stagedCellClassName).toContain("before:bg-staged-cell-background");
    expect(stagedCellClassName).toContain("after:border-amber-300");
    expect(stagedCellClassName).not.toContain("before:bg-amber-50/80");

    expect(focusedStagedCellClassName).toContain(
      "before:bg-staged-cell-background",
    );
    expect(focusedStagedCellClassName).toContain("after:border-sky-300");
    expect(focusedStagedCellClassName).not.toContain("before:bg-amber-50/80");
  });
});
