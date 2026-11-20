import { describe, expect, it } from "vitest";

import {
  buildClipboardText,
  buildPasteChanges,
  getRangeCellCount,
  normalizeSelectionRange,
  parseClipboardMatrix,
} from "./cell-selection";

describe("cell-selection", () => {
  it("counts only the cells a range still covers after rows or columns shrink", () => {
    const range = { columnEnd: 1, columnStart: 0, rowEnd: 2, rowStart: 0 };

    expect(getRangeCellCount({ columnCount: 2, range, rowCount: 3 })).toBe(6);
    // The selection outlived a refresh that left two rows: four cells are copied.
    expect(getRangeCellCount({ columnCount: 2, range, rowCount: 2 })).toBe(4);
    expect(getRangeCellCount({ columnCount: 1, range, rowCount: 3 })).toBe(3);
    expect(getRangeCellCount({ columnCount: 2, range, rowCount: 0 })).toBe(0);
  });

  it("normalizes reversed ranges", () => {
    const range = normalizeSelectionRange({
      start: { columnId: "name", columnIndex: 2, rowIndex: 4 },
      end: { columnId: "id", columnIndex: 0, rowIndex: 1 },
    });

    expect(range).toEqual({
      rowStart: 1,
      rowEnd: 4,
      columnStart: 0,
      columnEnd: 2,
    });
  });

  it("builds clipboard text for selected range", () => {
    const text = buildClipboardText({
      range: {
        rowStart: 0,
        rowEnd: 1,
        columnStart: 0,
        columnEnd: 1,
      },
      rows: [
        { id: 1, name: "Ada", status: "active" },
        { id: 2, name: "Lin", status: "disabled" },
      ],
      columnIds: ["id", "name", "status"],
    });

    expect(text).toBe("1\tAda\n2\tLin");
  });

  it("parses clipboard matrix", () => {
    expect(parseClipboardMatrix("a\tb\n1\t2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("maps paste matrix onto target range", () => {
    const changes = buildPasteChanges({
      range: {
        rowStart: 1,
        rowEnd: 2,
        columnStart: 0,
        columnEnd: 1,
      },
      matrix: [
        ["a", "b"],
        ["c", "d"],
      ],
      rowCount: 4,
      columnIds: ["id", "name", "status"],
    });

    expect(changes).toEqual([
      { rowIndex: 1, columnId: "id", value: "a" },
      { rowIndex: 1, columnId: "name", value: "b" },
      { rowIndex: 2, columnId: "id", value: "c" },
      { rowIndex: 2, columnId: "name", value: "d" },
    ]);
  });

  it("fills entire selection with a single pasted value", () => {
    const changes = buildPasteChanges({
      range: {
        rowStart: 1,
        rowEnd: 2,
        columnStart: 0,
        columnEnd: 1,
      },
      matrix: [["x"]],
      rowCount: 4,
      columnIds: ["id", "name", "status"],
      canWrite: ({ columnId }) => columnId !== "id",
    });

    expect(changes).toEqual([
      { rowIndex: 1, columnId: "name", value: "x" },
      { rowIndex: 2, columnId: "name", value: "x" },
    ]);
  });
});
