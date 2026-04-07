import {
  createCollection,
  localOnlyCollectionOptions,
} from "@tanstack/react-db";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioLocalUiState } from "../studio/context";
import { useUiState } from "./use-ui-state";

const useOptionalStudioMock = vi.fn<
  () =>
    | {
        uiLocalStateCollection: ReturnType<typeof createUiCollection>;
      }
    | undefined
>();

vi.mock("../studio/context", () => {
  return {
    useOptionalStudio: () => useOptionalStudioMock(),
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createUiCollection() {
  return createCollection(
    localOnlyCollectionOptions<StudioLocalUiState>({
      id: "use-ui-state-context-test",
      getKey(item) {
        return item.id;
      },
      initialData: [],
    }),
  );
}

describe("useUiState with Studio context collection", () => {
  let uiCollection: ReturnType<typeof createUiCollection>;

  beforeEach(() => {
    uiCollection = createUiCollection();
    useOptionalStudioMock.mockReturnValue({
      uiLocalStateCollection: uiCollection,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("reads and writes through the injected Studio ui collection", () => {
    const key = "context-backed-state";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let latestState: ReturnType<typeof useUiState<string>> | undefined;

    function Harness() {
      latestState = useUiState<string>(key, "alpha");
      return null;
    }

    act(() => {
      root.render(<Harness />);
    });

    expect(latestState?.[0]).toBe("alpha");
    expect(uiCollection.get(key)?.value).toBe("alpha");

    act(() => {
      latestState?.[1]("beta");
    });

    expect(latestState?.[0]).toBe("beta");
    expect(uiCollection.get(key)?.value).toBe("beta");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not mutate the shared ui collection for cleanup-on-unmount state", () => {
    const key = "context-cleanup-state";
    const insertSpy = vi.spyOn(uiCollection, "insert");
    const updateSpy = vi.spyOn(uiCollection, "update");
    const deleteSpy = vi.spyOn(uiCollection, "delete");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let latestState: ReturnType<typeof useUiState<string>> | undefined;

    function Harness() {
      latestState = useUiState<string>(key, "alpha", {
        cleanupOnUnmount: true,
      });
      return null;
    }

    act(() => {
      root.render(<Harness />);
    });

    act(() => {
      latestState?.[1]("beta");
    });

    expect(latestState?.[0]).toBe("beta");
    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();

    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(uiCollection.has(key)).toBe(false);
  });

  it("passes a cloneable plain value into object updaters", () => {
    const key = "context-object-state";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let latestState:
      | ReturnType<typeof useUiState<Record<string, Array<"avg" | "p95">>>>
      | undefined;

    function Harness() {
      latestState = useUiState<Record<string, Array<"avg" | "p95">>>(key, {});
      return null;
    }

    act(() => {
      root.render(<Harness />);
    });

    expect(() => {
      act(() => {
        latestState?.[1]((currentValue) => currentValue);
      });
    }).not.toThrow();

    expect(() => {
      act(() => {
        latestState?.[1]((currentValue) => ({
          ...currentValue,
          "series-1": ["avg"],
        }));
      });
    }).not.toThrow();

    expect(latestState?.[0]).toEqual({
      "series-1": ["avg"],
    });
    expect(uiCollection.get(key)?.value).toEqual({
      "series-1": ["avg"],
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
