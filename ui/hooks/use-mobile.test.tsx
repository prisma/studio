import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIsMobile } from "./use-mobile";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latestIsMobile = false;

  function Harness() {
    latestIsMobile = useIsMobile();
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    getIsMobile() {
      return latestIsMobile;
    },
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const timeoutMs = 2000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (assertion()) {
      return;
    }

    await flush();
  }

  throw new Error("Timed out waiting for condition");
}

describe("useIsMobile", () => {
  const listeners = new Set<() => void>();

  beforeEach(() => {
    listeners.clear();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 600,
      writable: true,
    });

    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: (_event: string, callback: () => void) => {
          listeners.add(callback);
        },
        matches: true,
        media: "(max-width: 767px)",
        removeEventListener: (_event: string, callback: () => void) => {
          listeners.delete(callback);
        },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("tracks viewport width updates through shared ui state", async () => {
    const harness = renderHarness();

    await waitFor(() => harness.getIsMobile() === true);
    expect(harness.getIsMobile()).toBe(true);

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
      writable: true,
    });
    act(() => {
      for (const listener of listeners) {
        listener();
      }
    });

    await waitFor(() => harness.getIsMobile() === false);
    expect(harness.getIsMobile()).toBe(false);

    harness.cleanup();
  });
});
