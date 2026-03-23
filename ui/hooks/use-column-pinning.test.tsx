import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parsePinnedColumns,
  serializePinnedColumns,
  useColumnPinning,
} from "./use-column-pinning";

interface NavigationMockState {
  pinParam: string | null;
  setPinParam: (value: string | null) => Promise<URLSearchParams>;
}

const useNavigationMock = vi.fn<() => NavigationMockState>();

vi.mock("./use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestState: ReturnType<typeof useColumnPinning> | undefined;

  function Harness() {
    latestState = useColumnPinning();
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

async function flushMicrotasks(count = 2) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useColumnPinning", () => {
  it("parses and normalizes pinned-column URL values", () => {
    expect(parsePinnedColumns(null)).toEqual([]);
    expect(parsePinnedColumns("")).toEqual([]);
    expect(parsePinnedColumns("id,bigint_col")).toEqual(["id", "bigint_col"]);
    expect(parsePinnedColumns(" id , bigint_col , id , , ")).toEqual([
      "id",
      "bigint_col",
    ]);
  });

  it("serializes pinned columns and removes duplicates", () => {
    expect(serializePinnedColumns([])).toBeNull();
    expect(serializePinnedColumns(["id", "bigint_col"])).toBe(
      "id,bigint_col",
    );
    expect(serializePinnedColumns(["id", "bigint_col", "id", ""])).toBe(
      "id,bigint_col",
    );
  });

  it("reads pinned columns from URL state and writes updates back", async () => {
    const setPinParam = vi.fn().mockResolvedValue(new URLSearchParams());

    useNavigationMock.mockReturnValue({
      pinParam: "id,bigint_col",
      setPinParam,
    });

    const harness = renderHarness();
    expect(harness.getLatestState()?.pinnedColumnIds).toEqual([
      "id",
      "bigint_col",
    ]);

    await act(async () => {
      harness.getLatestState()?.setPinnedColumnIds(["id", "bit_col"]);
      await flushMicrotasks();
    });

    expect(setPinParam).toHaveBeenCalledWith("id,bit_col");
    harness.cleanup();
  });

  it("does not write URL state when pinned columns are unchanged", async () => {
    const setPinParam = vi.fn().mockResolvedValue(new URLSearchParams());

    useNavigationMock.mockReturnValue({
      pinParam: "id,bigint_col",
      setPinParam,
    });

    const harness = renderHarness();

    await act(async () => {
      harness.getLatestState()?.setPinnedColumnIds(["id", "bigint_col"]);
      await flushMicrotasks();
    });

    expect(setPinParam).not.toHaveBeenCalled();
    harness.cleanup();
  });
});

