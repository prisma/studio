import { describe, expect, it } from "vitest";

import {
  clampFocusedCell,
  focusedCellsAreEqual,
  getFocusedCellScrollLeft,
  getInitialFocusedCell,
  moveFocusedCell,
} from "./focused-cell";

describe("focused-cell helpers", () => {
  it("returns the top-left content cell as the initial focus", () => {
    expect(
      getInitialFocusedCell({
        columnIds: ["id", "email", "created_at"],
        rowCount: 3,
      }),
    ).toEqual({
      columnId: "id",
      rowIndex: 0,
    });
  });

  it("returns null when the grid has no focusable cells", () => {
    expect(
      getInitialFocusedCell({
        columnIds: [],
        rowCount: 3,
      }),
    ).toBeNull();
    expect(
      getInitialFocusedCell({
        columnIds: ["id"],
        rowCount: 0,
      }),
    ).toBeNull();
  });

  it("clamps focused cells to the nearest visible row and column", () => {
    expect(
      clampFocusedCell({
        columnIds: ["id", "email"],
        focusedCell: {
          columnId: "missing",
          rowIndex: 9,
        },
        rowCount: 2,
      }),
    ).toEqual({
      columnId: "id",
      rowIndex: 1,
    });
  });

  it("moves focus one cell at a time and clamps at the edges", () => {
    const columnIds = ["id", "email", "created_at"];
    const rowCount = 2;

    expect(
      moveFocusedCell({
        columnIds,
        direction: "right",
        focusedCell: {
          columnId: "id",
          rowIndex: 0,
        },
        rowCount,
      }),
    ).toEqual({
      columnId: "email",
      rowIndex: 0,
    });

    expect(
      moveFocusedCell({
        columnIds,
        direction: "down",
        focusedCell: {
          columnId: "created_at",
          rowIndex: 1,
        },
        rowCount,
      }),
    ).toEqual({
      columnId: "created_at",
      rowIndex: 1,
    });
  });

  it("compares focused cells by coordinate", () => {
    expect(
      focusedCellsAreEqual(
        { columnId: "id", rowIndex: 0 },
        { columnId: "id", rowIndex: 0 },
      ),
    ).toBe(true);
    expect(
      focusedCellsAreEqual(
        { columnId: "id", rowIndex: 0 },
        { columnId: "email", rowIndex: 0 },
      ),
    ).toBe(false);
  });

  it("returns the scroll offset needed to keep the focused column in view", () => {
    expect(
      getFocusedCellScrollLeft({
        columnIds: ["id", "email", "created_at"],
        columnWidths: [120, 180, 220],
        currentScrollLeft: 0,
        focusedColumnId: "created_at",
        viewportWidth: 240,
      }),
    ).toBe(280);

    expect(
      getFocusedCellScrollLeft({
        columnIds: ["id", "email", "created_at"],
        columnWidths: [120, 180, 220],
        currentScrollLeft: 280,
        focusedColumnId: "id",
        viewportWidth: 240,
      }),
    ).toBe(0);

    expect(
      getFocusedCellScrollLeft({
        columnIds: ["id", "email", "created_at"],
        columnWidths: [120, 180, 220],
        currentScrollLeft: 120,
        focusedColumnId: "email",
        viewportWidth: 240,
      }),
    ).toBe(120);
  });
});
