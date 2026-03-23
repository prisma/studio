import { describe, expect, it } from "vitest";

import {
  getNextInfinitePageRowTarget,
  INFINITE_SCROLL_BATCH_SIZE,
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
