import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { CardHeader } from "./card";
import { DialogFooter, DialogHeader } from "./dialog";
import { SheetFooter, SheetHeader } from "./sheet";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("layout primitives", () => {
  it("use gap-based stack spacing classes", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <>
          <CardHeader data-testid="card-header" />
          <DialogHeader data-testid="dialog-header" />
          <DialogFooter data-testid="dialog-footer" />
          <SheetHeader data-testid="sheet-header" />
          <SheetFooter data-testid="sheet-footer" />
        </>,
      );
    });

    const cardHeader = container.querySelector('[data-testid="card-header"]');
    const dialogHeader = container.querySelector(
      '[data-testid="dialog-header"]',
    );
    const dialogFooter = container.querySelector(
      '[data-testid="dialog-footer"]',
    );
    const sheetHeader = container.querySelector('[data-testid="sheet-header"]');
    const sheetFooter = container.querySelector('[data-testid="sheet-footer"]');

    expect(cardHeader?.className).toContain("gap-1.5");
    expect(cardHeader?.className).not.toContain("space-y-");
    expect(dialogHeader?.className).toContain("gap-1.5");
    expect(dialogHeader?.className).not.toContain("space-y-");
    expect(dialogFooter?.className).toContain("gap-2");
    expect(dialogFooter?.className).not.toContain("space-x-");
    expect(sheetHeader?.className).toContain("gap-2");
    expect(sheetHeader?.className).not.toContain("space-y-");
    expect(sheetFooter?.className).toContain("gap-2");
    expect(sheetFooter?.className).not.toContain("space-x-");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
