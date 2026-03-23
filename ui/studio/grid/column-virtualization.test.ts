import { describe, expect, it } from "vitest";

import { computeColumnVirtualizationWindow } from "./column-virtualization";

describe("computeColumnVirtualizationWindow", () => {
  it("returns an empty disabled window when there are no columns", () => {
    expect(
      computeColumnVirtualizationWindow({
        columnWidths: [],
        minColumnCount: 2,
        overscanPx: 100,
        scrollLeft: 0,
        viewportWidth: 500,
      }),
    ).toEqual({
      enabled: false,
      startIndex: 0,
      endIndex: -1,
      hiddenStartCount: 0,
      hiddenEndCount: 0,
      hiddenStartWidth: 0,
      hiddenEndWidth: 0,
    });
  });

  it("disables virtualization when the viewport width is unavailable", () => {
    expect(
      computeColumnVirtualizationWindow({
        columnWidths: [120, 160, 240],
        minColumnCount: 2,
        overscanPx: 100,
        scrollLeft: 150,
        viewportWidth: 0,
      }),
    ).toEqual({
      enabled: false,
      startIndex: 0,
      endIndex: 2,
      hiddenStartCount: 0,
      hiddenEndCount: 0,
      hiddenStartWidth: 0,
      hiddenEndWidth: 0,
    });
  });

  it("disables virtualization below the minimum column threshold", () => {
    expect(
      computeColumnVirtualizationWindow({
        columnWidths: [100, 100, 100],
        minColumnCount: 4,
        overscanPx: 100,
        scrollLeft: 50,
        viewportWidth: 200,
      }),
    ).toEqual({
      enabled: false,
      startIndex: 0,
      endIndex: 2,
      hiddenStartCount: 0,
      hiddenEndCount: 0,
      hiddenStartWidth: 0,
      hiddenEndWidth: 0,
    });
  });

  it("virtualizes center columns and preserves hidden start/end widths", () => {
    expect(
      computeColumnVirtualizationWindow({
        columnWidths: [100, 100, 100, 100, 100],
        minColumnCount: 2,
        overscanPx: 0,
        scrollLeft: 110,
        viewportWidth: 150,
      }),
    ).toEqual({
      enabled: true,
      startIndex: 1,
      endIndex: 2,
      hiddenStartCount: 1,
      hiddenEndCount: 2,
      hiddenStartWidth: 100,
      hiddenEndWidth: 200,
    });
  });

  it("expands the visible range with overscan", () => {
    expect(
      computeColumnVirtualizationWindow({
        columnWidths: [100, 100, 100, 100, 100],
        minColumnCount: 2,
        overscanPx: 100,
        scrollLeft: 110,
        viewportWidth: 150,
      }),
    ).toEqual({
      enabled: true,
      startIndex: 0,
      endIndex: 3,
      hiddenStartCount: 0,
      hiddenEndCount: 1,
      hiddenStartWidth: 0,
      hiddenEndWidth: 100,
    });
  });

  it("falls back to full window when overscan causes all columns to be visible", () => {
    expect(
      computeColumnVirtualizationWindow({
        columnWidths: [100, 100, 100, 100],
        minColumnCount: 2,
        overscanPx: 200,
        scrollLeft: 60,
        viewportWidth: 120,
      }),
    ).toEqual({
      enabled: false,
      startIndex: 0,
      endIndex: 3,
      hiddenStartCount: 0,
      hiddenEndCount: 0,
      hiddenStartWidth: 0,
      hiddenEndWidth: 0,
    });
  });

  it("clamps negative scroll and overscan values", () => {
    expect(
      computeColumnVirtualizationWindow({
        columnWidths: [80, 80, 80, 80],
        minColumnCount: 2,
        overscanPx: -50,
        scrollLeft: -25,
        viewportWidth: 120,
      }),
    ).toEqual({
      enabled: true,
      startIndex: 0,
      endIndex: 1,
      hiddenStartCount: 0,
      hiddenEndCount: 2,
      hiddenStartWidth: 0,
      hiddenEndWidth: 160,
    });
  });

  it("supports scrolling beyond total width without throwing", () => {
    expect(
      computeColumnVirtualizationWindow({
        columnWidths: [80, 120, 150],
        minColumnCount: 2,
        overscanPx: 0,
        scrollLeft: 2000,
        viewportWidth: 200,
      }),
    ).toEqual({
      enabled: true,
      startIndex: 2,
      endIndex: 2,
      hiddenStartCount: 2,
      hiddenEndCount: 0,
      hiddenStartWidth: 200,
      hiddenEndWidth: 0,
    });
  });

  it("treats invalid widths as zero-width columns", () => {
    expect(
      computeColumnVirtualizationWindow({
        columnWidths: [100, Number.NaN, Number.POSITIVE_INFINITY, 100],
        minColumnCount: 2,
        overscanPx: 0,
        scrollLeft: 10,
        viewportWidth: 80,
      }),
    ).toEqual({
      enabled: true,
      startIndex: 0,
      endIndex: 0,
      hiddenStartCount: 0,
      hiddenEndCount: 3,
      hiddenStartWidth: 0,
      hiddenEndWidth: 100,
    });
  });
});
