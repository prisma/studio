import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  PopoverCell,
  PopoverCellContent,
  PopoverCellTrigger,
} from "./popover-cell";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  delete document.body.dataset.studioSuppressCellOpenUntil;
});

describe("PopoverCell", () => {
  it("opens on regular primary click", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <PopoverCell>
          <PopoverCellTrigger>open</PopoverCellTrigger>
          <PopoverCellContent>
            <div data-testid="popover-content">content</div>
          </PopoverCellContent>
        </PopoverCell>,
      );
    });

    const trigger = container.querySelector("button");

    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error("Could not find popover trigger");
    }

    act(() => {
      trigger.click();
    });

    await flushMicrotasks();

    expect(
      document.querySelector('[data-testid="popover-content"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("does not open when copy-action suppression window is active", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    document.body.dataset.studioSuppressCellOpenUntil = String(
      Date.now() + 5000,
    );

    act(() => {
      root.render(
        <PopoverCell>
          <PopoverCellTrigger>open</PopoverCellTrigger>
          <PopoverCellContent>
            <div data-testid="popover-content">content</div>
          </PopoverCellContent>
        </PopoverCell>,
      );
    });

    const trigger = container.querySelector("button");

    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error("Could not find popover trigger");
    }

    act(() => {
      trigger.click();
    });

    await flushMicrotasks();

    expect(
      document.querySelector('[data-testid="popover-content"]'),
    ).toBeNull();

    delete document.body.dataset.studioSuppressCellOpenUntil;

    act(() => {
      root.unmount();
    });
  });
});
