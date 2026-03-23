import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataGridCellContextMenu } from "./DataGridCellContextMenu";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushDom() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete document.body.dataset.studioSuppressCellOpenUntil;
});

describe("DataGridCellContextMenu integration", () => {
  it("closes context menu after clicking Copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridCellContextMenu copyText={"org_acme\tAcme Labs"}>
          org_acme
        </DataGridCellContextMenu>,
      );
    });

    const trigger = container.querySelector(
      "[data-studio-context-menu-trigger]",
    );

    if (!(trigger instanceof HTMLElement)) {
      throw new Error("Context-menu trigger not found");
    }

    act(() => {
      trigger.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });

    await flushDom();

    const copyItem = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.trim().toLowerCase() === "copy",
    );

    if (!(copyItem instanceof HTMLElement)) {
      throw new Error("Copy menu item not found");
    }

    act(() => {
      copyItem.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
      const suppressUntil = Number(
        document.body.dataset.studioSuppressCellOpenUntil ?? "0",
      );
      expect(suppressUntil).toBeGreaterThan(Date.now());
      copyItem.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    await flushDom();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("org_acme\tAcme Labs");
    expect(document.querySelector('[role="menuitem"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
