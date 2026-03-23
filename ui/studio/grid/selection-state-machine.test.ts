import { describe, expect, it } from "vitest";

import type { GridCellCoordinate } from "./cell-selection";
import {
  getCellSelectionAnchor,
  getCellSelectionFocus,
  getCellSelectionRange,
  getSelectedRowIds,
  GRID_SELECTION_MACHINE_INITIAL_STATE,
  hasAnySelection,
  hasRowSelectionMode,
  rowIdsToRowSelectionState,
  rowSelectionStateToIds,
  transitionGridSelectionMachine,
} from "./selection-state-machine";

function createCoordinate(args: {
  rowIndex: number;
  columnIndex: number;
  columnId: string;
}): GridCellCoordinate {
  return args;
}

describe("selection-state-machine", () => {
  it("starts in a typed none state", () => {
    expect(GRID_SELECTION_MACHINE_INITIAL_STATE).toEqual({ mode: "none" });
    expect(hasAnySelection(GRID_SELECTION_MACHINE_INITIAL_STATE)).toBe(false);
    expect(
      getCellSelectionRange(GRID_SELECTION_MACHINE_INITIAL_STATE),
    ).toBeNull();
    expect(getSelectedRowIds(GRID_SELECTION_MACHINE_INITIAL_STATE)).toEqual([]);
  });

  it("enters cell mode from a cell.select transition", () => {
    const start = createCoordinate({
      rowIndex: 0,
      columnIndex: 2,
      columnId: "organization_id",
    });
    const end = createCoordinate({
      rowIndex: 1,
      columnIndex: 4,
      columnId: "status",
    });

    const state = transitionGridSelectionMachine(
      GRID_SELECTION_MACHINE_INITIAL_STATE,
      {
        type: "cell.select",
        start,
        end,
      },
    );

    expect(state).toEqual({
      mode: "cell",
      start,
      end,
    });
    expect(getCellSelectionAnchor(state)).toEqual(start);
    expect(getCellSelectionFocus(state)).toEqual(end);
    expect(getCellSelectionRange(state)).toEqual({
      rowStart: 0,
      rowEnd: 1,
      columnStart: 2,
      columnEnd: 4,
    });
  });

  it("normalizes cell ranges regardless of drag direction", () => {
    const state = transitionGridSelectionMachine(
      GRID_SELECTION_MACHINE_INITIAL_STATE,
      {
        type: "cell.select",
        start: createCoordinate({
          rowIndex: 4,
          columnIndex: 6,
          columnId: "tier",
        }),
        end: createCoordinate({
          rowIndex: 2,
          columnIndex: 1,
          columnId: "id",
        }),
      },
    );

    expect(getCellSelectionRange(state)).toEqual({
      rowStart: 2,
      rowEnd: 4,
      columnStart: 1,
      columnEnd: 6,
    });
  });

  it("moves from cell mode to row mode and clears the cell selection", () => {
    const cellState = transitionGridSelectionMachine(
      GRID_SELECTION_MACHINE_INITIAL_STATE,
      {
        type: "cell.select",
        start: createCoordinate({
          rowIndex: 0,
          columnIndex: 0,
          columnId: "id",
        }),
        end: createCoordinate({
          rowIndex: 0,
          columnIndex: 1,
          columnId: "name",
        }),
      },
    );

    const rowState = transitionGridSelectionMachine(cellState, {
      type: "row.select",
      rowIds: ["row_1"],
    });

    expect(rowState).toEqual({
      mode: "row",
      rowIds: ["row_1"],
    });
    expect(getCellSelectionRange(rowState)).toBeNull();
    expect(hasRowSelectionMode(rowState)).toBe(true);
  });

  it("resets all selections on escape from cell mode", () => {
    const state = transitionGridSelectionMachine(
      GRID_SELECTION_MACHINE_INITIAL_STATE,
      {
        type: "cell.select",
        start: createCoordinate({
          rowIndex: 1,
          columnIndex: 1,
          columnId: "name",
        }),
        end: createCoordinate({
          rowIndex: 1,
          columnIndex: 2,
          columnId: "status",
        }),
      },
    );

    const escaped = transitionGridSelectionMachine(state, { type: "escape" });
    expect(escaped).toEqual(GRID_SELECTION_MACHINE_INITIAL_STATE);
  });

  it("resets all selections on escape from row mode", () => {
    const state = transitionGridSelectionMachine(
      GRID_SELECTION_MACHINE_INITIAL_STATE,
      {
        type: "row.select",
        rowIds: ["row_1", "row_2"],
      },
    );

    const escaped = transitionGridSelectionMachine(state, { type: "escape" });
    expect(escaped).toEqual(GRID_SELECTION_MACHINE_INITIAL_STATE);
  });

  it("keeps row mode when clearing cell selection and keeps cell mode when clearing row selection", () => {
    const rowState = transitionGridSelectionMachine(
      GRID_SELECTION_MACHINE_INITIAL_STATE,
      {
        type: "row.select",
        rowIds: ["row_1"],
      },
    );
    expect(
      transitionGridSelectionMachine(rowState, { type: "cell.clear" }),
    ).toEqual(rowState);

    const cellState = transitionGridSelectionMachine(
      GRID_SELECTION_MACHINE_INITIAL_STATE,
      {
        type: "cell.select",
        start: createCoordinate({
          rowIndex: 0,
          columnIndex: 0,
          columnId: "id",
        }),
        end: createCoordinate({
          rowIndex: 0,
          columnIndex: 0,
          columnId: "id",
        }),
      },
    );
    expect(
      transitionGridSelectionMachine(cellState, { type: "row.clear" }),
    ).toEqual(cellState);
  });

  it("normalizes and deduplicates row ids in row mode", () => {
    const state = transitionGridSelectionMachine(
      GRID_SELECTION_MACHINE_INITIAL_STATE,
      {
        type: "row.select",
        rowIds: [" row_1 ", "row_2", "row_1", "", "   "],
      },
    );

    expect(state).toEqual({
      mode: "row",
      rowIds: ["row_1", "row_2"],
    });
  });

  it("returns none when selecting rows with an empty row id list", () => {
    const state = transitionGridSelectionMachine(
      GRID_SELECTION_MACHINE_INITIAL_STATE,
      {
        type: "row.select",
        rowIds: [],
      },
    );

    expect(state).toEqual(GRID_SELECTION_MACHINE_INITIAL_STATE);
  });

  it("converts row ids to row selection state and back", () => {
    const rowIds = ["row_b", "row_a", "row_b"];
    const rowSelectionState = rowIdsToRowSelectionState(rowIds);

    expect(rowSelectionState).toEqual({
      row_b: true,
      row_a: true,
    });

    expect(rowSelectionStateToIds(rowSelectionState)).toEqual([
      "row_a",
      "row_b",
    ]);
  });
});
