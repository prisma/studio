export interface ColumnVirtualizationWindow {
  enabled: boolean;
  startIndex: number;
  endIndex: number;
  hiddenStartCount: number;
  hiddenEndCount: number;
  hiddenStartWidth: number;
  hiddenEndWidth: number;
}

export interface ComputeColumnVirtualizationWindowArgs {
  columnWidths: number[];
  minColumnCount: number;
  overscanPx: number;
  scrollLeft: number;
  viewportWidth: number;
}

export function computeColumnVirtualizationWindow(
  args: ComputeColumnVirtualizationWindowArgs,
): ColumnVirtualizationWindow {
  const {
    columnWidths,
    minColumnCount,
    overscanPx,
    scrollLeft,
    viewportWidth,
  } = args;
  const columnCount = columnWidths.length;

  if (columnCount === 0) {
    return {
      enabled: false,
      startIndex: 0,
      endIndex: -1,
      hiddenStartCount: 0,
      hiddenEndCount: 0,
      hiddenStartWidth: 0,
      hiddenEndWidth: 0,
    };
  }

  const sanitizedViewportWidth = Number.isFinite(viewportWidth)
    ? viewportWidth
    : 0;
  const sanitizedScrollLeft = Number.isFinite(scrollLeft)
    ? Math.max(0, scrollLeft)
    : 0;
  const sanitizedOverscan = Number.isFinite(overscanPx)
    ? Math.max(0, overscanPx)
    : 0;

  if (sanitizedViewportWidth <= 0 || columnCount < minColumnCount) {
    return fullWindow(columnWidths);
  }

  const startOffsets = new Array<number>(columnCount);
  const endOffsets = new Array<number>(columnCount);
  let runningOffset = 0;

  for (let index = 0; index < columnCount; index++) {
    const width = sanitizeColumnWidth(columnWidths[index]);
    startOffsets[index] = runningOffset;
    runningOffset += width;
    endOffsets[index] = runningOffset;
  }

  const windowStart = Math.max(0, sanitizedScrollLeft - sanitizedOverscan);
  const windowEnd = Math.max(
    windowStart,
    sanitizedScrollLeft + sanitizedViewportWidth + sanitizedOverscan,
  );

  let startIndex = 0;
  while (startIndex < columnCount && endOffsets[startIndex]! <= windowStart) {
    startIndex++;
  }

  if (startIndex >= columnCount) {
    startIndex = columnCount - 1;
  }

  let endIndex = startIndex;
  while (
    endIndex < columnCount - 1 &&
    startOffsets[endIndex + 1]! < windowEnd
  ) {
    endIndex++;
  }

  if (startIndex === 0 && endIndex === columnCount - 1) {
    return fullWindow(columnWidths);
  }

  const hiddenStartCount = startIndex;
  const hiddenEndCount = Math.max(0, columnCount - 1 - endIndex);
  const hiddenStartWidth = startOffsets[startIndex] ?? 0;
  const hiddenEndWidth =
    runningOffset - (endOffsets[endIndex] ?? runningOffset);

  return {
    enabled: true,
    startIndex,
    endIndex,
    hiddenStartCount,
    hiddenEndCount,
    hiddenStartWidth,
    hiddenEndWidth,
  };
}

function fullWindow(columnWidths: number[]): ColumnVirtualizationWindow {
  return {
    enabled: false,
    startIndex: 0,
    endIndex: columnWidths.length - 1,
    hiddenStartCount: 0,
    hiddenEndCount: 0,
    hiddenStartWidth: 0,
    hiddenEndWidth: 0,
  };
}

function sanitizeColumnWidth(width: number | undefined): number {
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return 0;
  }

  return Math.max(0, width);
}
