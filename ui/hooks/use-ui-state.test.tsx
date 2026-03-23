import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useUiState } from "./use-ui-state";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHarness(args: {
  key: string;
  initialValue: string;
  cleanupOnUnmount?: boolean;
}) {
  const { cleanupOnUnmount = false, initialValue, key } = args;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latestState: ReturnType<typeof useUiState<string>> | undefined;

  function Harness() {
    latestState = useUiState<string>(key, initialValue, {
      cleanupOnUnmount,
    });
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
    getLatestState() {
      return latestState;
    },
  };
}

function renderDuplicateCleanupHarness(key: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    useUiState<string>(key, "alpha", { cleanupOnUnmount: true });
    useUiState<string>(key, "alpha", { cleanupOnUnmount: true });
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
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useUiState", () => {
  it("stores and updates values in the shared ui state collection", () => {
    const harness = renderHarness({
      key: "test-ui-state:update",
      initialValue: "alpha",
    });

    expect(harness.getLatestState()?.[0]).toBe("alpha");

    act(() => {
      harness.getLatestState()?.[1]("beta");
    });

    expect(harness.getLatestState()?.[0]).toBe("beta");

    harness.cleanup();
  });

  it("cleans up keyed state on unmount when cleanupOnUnmount is enabled", () => {
    const key = "test-ui-state:cleanup";
    const firstHarness = renderHarness({
      key,
      initialValue: "before",
      cleanupOnUnmount: true,
    });

    act(() => {
      firstHarness.getLatestState()?.[1]("after");
    });
    expect(firstHarness.getLatestState()?.[0]).toBe("after");
    firstHarness.cleanup();

    const secondHarness = renderHarness({
      key,
      initialValue: "before",
      cleanupOnUnmount: true,
    });
    expect(secondHarness.getLatestState()?.[0]).toBe("before");
    secondHarness.cleanup();
  });

  it("does not throw if multiple cleanup handlers target the same key", () => {
    const harness = renderDuplicateCleanupHarness(
      "test-ui-state:duplicate-key",
    );

    expect(() => {
      harness.cleanup();
    }).not.toThrow();
  });
});
