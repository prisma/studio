import type { RowSelectionState } from "@tanstack/react-table";

import {
  type GridCellCoordinate,
  type GridSelectionRange,
  normalizeSelectionRange,
} from "./cell-selection";

export type GridSelectionMachineState =
  | {
      mode: "none";
    }
  | {
      mode: "cell";
      start: GridCellCoordinate;
      end: GridCellCoordinate;
    }
  | {
      mode: "row";
      rowIds: string[];
    };

export const GRID_SELECTION_MACHINE_INITIAL_STATE: GridSelectionMachineState = {
  mode: "none",
};

export type GridSelectionMachineEvent =
  | {
      type: "cell.select";
      start: GridCellCoordinate;
      end: GridCellCoordinate;
    }
  | {
      type: "cell.clear";
    }
  | {
      type: "row.select";
      rowIds: string[];
    }
  | {
      type: "row.clear";
    }
  | {
      type: "escape";
    }
  | {
      type: "reset";
    };

function assertNever(value: never): never {
  throw new Error(`Unhandled selection event: ${JSON.stringify(value)}`);
}

function normalizeRowIds(rowIds: string[]): string[] {
  return Array.from(
    new Set(
      rowIds
        .filter((rowId): rowId is string => typeof rowId === "string")
        .map((rowId) => rowId.trim())
        .filter((rowId) => rowId.length > 0),
    ),
  );
}

function cloneCoordinate(coordinate: GridCellCoordinate): GridCellCoordinate {
  return {
    rowIndex: coordinate.rowIndex,
    columnId: coordinate.columnId,
    columnIndex: coordinate.columnIndex,
  };
}

function cloneState(
  state: GridSelectionMachineState,
): GridSelectionMachineState {
  if (state.mode === "none") {
    return GRID_SELECTION_MACHINE_INITIAL_STATE;
  }

  if (state.mode === "row") {
    return {
      mode: "row",
      rowIds: [...state.rowIds],
    };
  }

  return {
    mode: "cell",
    start: cloneCoordinate(state.start),
    end: cloneCoordinate(state.end),
  };
}

export function transitionGridSelectionMachine(
  state: GridSelectionMachineState,
  event: GridSelectionMachineEvent,
): GridSelectionMachineState {
  switch (event.type) {
    case "cell.select":
      return {
        mode: "cell",
        start: cloneCoordinate(event.start),
        end: cloneCoordinate(event.end),
      };
    case "cell.clear":
      return state.mode === "cell"
        ? GRID_SELECTION_MACHINE_INITIAL_STATE
        : cloneState(state);
    case "row.select": {
      const rowIds = normalizeRowIds(event.rowIds);

      if (rowIds.length === 0) {
        return GRID_SELECTION_MACHINE_INITIAL_STATE;
      }

      return {
        mode: "row",
        rowIds,
      };
    }
    case "row.clear":
      return state.mode === "row"
        ? GRID_SELECTION_MACHINE_INITIAL_STATE
        : cloneState(state);
    case "escape":
    case "reset":
      return GRID_SELECTION_MACHINE_INITIAL_STATE;
    default:
      return assertNever(event);
  }
}

export function getCellSelectionRange(
  state: GridSelectionMachineState,
): GridSelectionRange | null {
  if (state.mode !== "cell") {
    return null;
  }

  return normalizeSelectionRange({
    start: state.start,
    end: state.end,
  });
}

export function getCellSelectionAnchor(
  state: GridSelectionMachineState,
): GridCellCoordinate | null {
  return state.mode === "cell" ? state.start : null;
}

export function getCellSelectionFocus(
  state: GridSelectionMachineState,
): GridCellCoordinate | null {
  return state.mode === "cell" ? state.end : null;
}

export function getSelectedRowIds(state: GridSelectionMachineState): string[] {
  return state.mode === "row" ? state.rowIds : [];
}

export function hasRowSelectionMode(state: GridSelectionMachineState): boolean {
  return state.mode === "row" && state.rowIds.length > 0;
}

export function hasAnySelection(state: GridSelectionMachineState): boolean {
  return state.mode !== "none";
}

export function rowSelectionStateToIds(
  rowSelectionState: RowSelectionState,
): string[] {
  return Object.entries(rowSelectionState)
    .filter(([, isSelected]) => isSelected === true)
    .map(([rowId]) => rowId)
    .sort();
}

export function rowIdsToRowSelectionState(rowIds: string[]): RowSelectionState {
  const nextSelection: RowSelectionState = {};

  for (const rowId of normalizeRowIds(rowIds)) {
    nextSelection[rowId] = true;
  }

  return nextSelection;
}
