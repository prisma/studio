import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePagination } from "./use-pagination";

interface NavigationMockState {
  pageIndexParam: string;
  pageSizeParam: string;
  setPageIndexParam: (value: string | null) => Promise<URLSearchParams>;
  setPageSizeParam: (value: string | null) => Promise<URLSearchParams>;
}

interface StudioMockState {
  isInfiniteScrollEnabled: boolean;
  setInfiniteScrollEnabled: (enabled: boolean) => void;
  setTablePageSize: (pageSize: number) => void;
  tablePageSize: number;
}

const useNavigationMock = vi.fn<() => NavigationMockState>();
const useStudioMock = vi.fn<() => StudioMockState>();

vi.mock("./use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

vi.mock("../studio/context", () => ({
  useStudio: () => useStudioMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latestState: ReturnType<typeof usePagination> | undefined;

  function Harness() {
    latestState = usePagination();
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

async function flushMicrotasks(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("usePagination", () => {
  it("derives page index from navigation state and page size from Studio preferences", () => {
    useNavigationMock.mockReturnValue({
      pageIndexParam: "7",
      pageSizeParam: "25",
      setPageIndexParam: vi.fn(),
      setPageSizeParam: vi.fn(),
    });
    useStudioMock.mockReturnValue({
      isInfiniteScrollEnabled: true,
      setInfiniteScrollEnabled: vi.fn(),
      setTablePageSize: vi.fn(),
      tablePageSize: 50,
    });

    const harness = renderHarness();

    expect(harness.getLatestState()?.paginationState).toEqual({
      pageIndex: 7,
      pageSize: 50,
    });
    expect(harness.getLatestState()?.isInfiniteScrollEnabled).toBe(true);

    harness.cleanup();
  });

  it("writes page index to navigation and page size to Studio preferences", async () => {
    const setPageIndexParam = vi.fn().mockResolvedValue(new URLSearchParams());
    const setPageSizeParam = vi.fn().mockResolvedValue(new URLSearchParams());
    const setTablePageSize = vi.fn();

    useNavigationMock.mockReturnValue({
      pageIndexParam: "0",
      pageSizeParam: "25",
      setPageIndexParam,
      setPageSizeParam,
    });
    useStudioMock.mockReturnValue({
      isInfiniteScrollEnabled: false,
      setInfiniteScrollEnabled: vi.fn(),
      setTablePageSize,
      tablePageSize: 25,
    });

    const harness = renderHarness();

    await act(async () => {
      harness.getLatestState()?.setPaginationState({
        pageIndex: 3,
        pageSize: 100,
      });
      await flushMicrotasks();
    });

    expect(setPageIndexParam).toHaveBeenCalledWith("3");
    expect(setPageSizeParam).toHaveBeenCalledWith("100");
    expect(setTablePageSize).toHaveBeenCalledWith(100);

    harness.cleanup();
  });

  it("delegates infinite-scroll preference changes through Studio state", () => {
    const setInfiniteScrollEnabled = vi.fn();

    useNavigationMock.mockReturnValue({
      pageIndexParam: "0",
      pageSizeParam: "25",
      setPageIndexParam: vi.fn(),
      setPageSizeParam: vi.fn(),
    });
    useStudioMock.mockReturnValue({
      isInfiniteScrollEnabled: false,
      setInfiniteScrollEnabled,
      setTablePageSize: vi.fn(),
      tablePageSize: 25,
    });

    const harness = renderHarness();

    act(() => {
      harness.getLatestState()?.setInfiniteScrollEnabled(true);
    });

    expect(setInfiniteScrollEnabled).toHaveBeenCalledWith(true);

    harness.cleanup();
  });
});
