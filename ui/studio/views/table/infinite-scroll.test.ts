import { describe, expect, it } from "vitest";

import {
  getNextInfinitePageRowTarget,
  INFINITE_SCROLL_BATCH_SIZE,
  resolveVisibleTableWindow,
} from "./infinite-scroll";

describe("getNextInfinitePageRowTarget", () => {
  it("blocks another request while the prior infinite-scroll target is still missing rows", () => {
    expect(
      getNextInfinitePageRowTarget({
        hasMoreInfiniteRows: true,
        isInfiniteScrollEnabled: true,
        loadedInfinitePageCount: 2,
        loadedRowCount: 25,
        pendingRowTarget: 50,
      }),
    ).toBeNull();
  });

  it("advances by the fixed 25-row batch size once the prior target is already visible", () => {
    expect(
      getNextInfinitePageRowTarget({
        hasMoreInfiniteRows: true,
        isInfiniteScrollEnabled: true,
        loadedInfinitePageCount: 2,
        loadedRowCount: 50,
        pendingRowTarget: 50,
      }),
    ).toBe(INFINITE_SCROLL_BATCH_SIZE * 3);
  });

  it("returns null when infinite scroll is off or fully loaded", () => {
    expect(
      getNextInfinitePageRowTarget({
        hasMoreInfiniteRows: false,
        isInfiniteScrollEnabled: true,
        loadedInfinitePageCount: 1,
        loadedRowCount: 10,
        pendingRowTarget: null,
      }),
    ).toBeNull();
    expect(
      getNextInfinitePageRowTarget({
        hasMoreInfiniteRows: true,
        isInfiniteScrollEnabled: false,
        loadedInfinitePageCount: 1,
        loadedRowCount: 10,
        pendingRowTarget: null,
      }),
    ).toBeNull();
  });
});

describe("resolveVisibleTableWindow", () => {
  const previousWindowProps = { pageIndex: 0, pageSize: 25 };
  const grownWindowProps = { pageIndex: 0, pageSize: 50 };
  const previousWindowData = {
    rows: Array.from({ length: 25 }, (_, i) => ({ id: i + 1 })),
  };
  const grownWindowData = {
    rows: Array.from({ length: 50 }, (_, i) => ({ id: i + 1 })),
  };
  const resetKey = "public.users::25";

  it("keeps rows and mutation scope pinned to the settled window while the grown window is fetching", () => {
    // Saving or deleting mid-transition must target the collection that
    // still holds the visible rows, not the empty grown collection.
    const window = resolveVisibleTableWindow({
      activeData: { rows: [] },
      activeQueryProps: grownWindowProps,
      isFetching: true,
      isInfiniteScrollEnabled: true,
      resetKey,
      stableWindow: {
        data: previousWindowData,
        key: resetKey,
        queryProps: previousWindowProps,
      },
    });

    expect(window.data).toBe(previousWindowData);
    expect(window.queryProps).toBe(previousWindowProps);
  });

  it("swaps rows and mutation scope to the grown window together once its data arrives", () => {
    const window = resolveVisibleTableWindow({
      activeData: grownWindowData,
      activeQueryProps: grownWindowProps,
      isFetching: false,
      isInfiniteScrollEnabled: true,
      resetKey,
      stableWindow: {
        data: previousWindowData,
        key: resetKey,
        queryProps: previousWindowProps,
      },
    });

    expect(window.data).toBe(grownWindowData);
    expect(window.queryProps).toBe(grownWindowProps);
  });

  it("ignores a stable window from a different reset key", () => {
    const window = resolveVisibleTableWindow({
      activeData: { rows: [] },
      activeQueryProps: grownWindowProps,
      isFetching: true,
      isInfiniteScrollEnabled: true,
      resetKey,
      stableWindow: {
        data: previousWindowData,
        key: "public.users::sorted",
        queryProps: previousWindowProps,
      },
    });

    expect(window.data).toEqual({ rows: [] });
    expect(window.queryProps).toBe(grownWindowProps);
  });

  it("always uses the active window when infinite scroll is disabled", () => {
    const window = resolveVisibleTableWindow({
      activeData: previousWindowData,
      activeQueryProps: previousWindowProps,
      isFetching: true,
      isInfiniteScrollEnabled: false,
      resetKey,
      stableWindow: {
        data: grownWindowData,
        key: resetKey,
        queryProps: grownWindowProps,
      },
    });

    expect(window.data).toBe(previousWindowData);
    expect(window.queryProps).toBe(previousWindowProps);
  });
});
