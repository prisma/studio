export interface GridFocusedCell {
  columnId: string;
  rowIndex: number;
}

export type GridFocusedCellDirection = "down" | "left" | "right" | "up";

export function getInitialFocusedCell(args: {
  columnIds: string[];
  rowCount: number;
}): GridFocusedCell | null {
  const { columnIds, rowCount } = args;
  const firstColumnId = columnIds[0];

  if (!firstColumnId || rowCount <= 0) {
    return null;
  }

  return {
    columnId: firstColumnId,
    rowIndex: 0,
  };
}

export function clampFocusedCell(args: {
  columnIds: string[];
  focusedCell: GridFocusedCell | null;
  rowCount: number;
}): GridFocusedCell | null {
  const { columnIds, focusedCell, rowCount } = args;

  if (rowCount <= 0 || columnIds.length === 0) {
    return null;
  }

  if (!focusedCell) {
    return getInitialFocusedCell(args);
  }

  const columnId = columnIds.includes(focusedCell.columnId)
    ? focusedCell.columnId
    : columnIds[0];

  if (!columnId) {
    return null;
  }

  return {
    columnId,
    rowIndex: clamp(focusedCell.rowIndex, 0, rowCount - 1),
  };
}

export function moveFocusedCell(args: {
  columnIds: string[];
  direction: GridFocusedCellDirection;
  focusedCell: GridFocusedCell | null;
  rowCount: number;
}): GridFocusedCell | null {
  const clampedCell = clampFocusedCell(args);

  if (!clampedCell) {
    return null;
  }

  const columnIndex = args.columnIds.indexOf(clampedCell.columnId);

  if (columnIndex === -1) {
    return clampedCell;
  }

  switch (args.direction) {
    case "up":
      return {
        ...clampedCell,
        rowIndex: clamp(clampedCell.rowIndex - 1, 0, args.rowCount - 1),
      };
    case "down":
      return {
        ...clampedCell,
        rowIndex: clamp(clampedCell.rowIndex + 1, 0, args.rowCount - 1),
      };
    case "left":
      return {
        ...clampedCell,
        columnId:
          args.columnIds[clamp(columnIndex - 1, 0, args.columnIds.length - 1)]!,
      };
    case "right":
      return {
        ...clampedCell,
        columnId:
          args.columnIds[clamp(columnIndex + 1, 0, args.columnIds.length - 1)]!,
      };
  }
}

export function getFocusedCellScrollLeft(args: {
  columnIds: string[];
  columnWidths: number[];
  currentScrollLeft: number;
  focusedColumnId: string;
  viewportWidth: number;
}): number {
  const {
    columnIds,
    columnWidths,
    currentScrollLeft,
    focusedColumnId,
    viewportWidth,
  } = args;
  const sanitizedScrollLeft = Math.max(0, currentScrollLeft);
  const sanitizedViewportWidth = Math.max(0, viewportWidth);
  const columnIndex = columnIds.indexOf(focusedColumnId);

  if (columnIndex === -1 || sanitizedViewportWidth <= 0) {
    return sanitizedScrollLeft;
  }

  let columnStart = 0;

  for (let index = 0; index < columnIndex; index += 1) {
    columnStart += Math.max(0, columnWidths[index] ?? 0);
  }

  const columnWidth = Math.max(0, columnWidths[columnIndex] ?? 0);
  const columnEnd = columnStart + columnWidth;
  const visibleStart = sanitizedScrollLeft;
  const visibleEnd = visibleStart + sanitizedViewportWidth;

  if (columnStart < visibleStart) {
    return columnStart;
  }

  if (columnEnd > visibleEnd) {
    return Math.max(0, columnEnd - sanitizedViewportWidth);
  }

  return sanitizedScrollLeft;
}

export function focusedCellsAreEqual(
  left: GridFocusedCell | null,
  right: GridFocusedCell | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.columnId === right.columnId && left.rowIndex === right.rowIndex;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
