import type { ColumnSizingState } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import {
  clampColumnSizingState,
  DEFAULT_GRID_COLUMN_MAX_SIZE,
  DEFAULT_GRID_COLUMN_MIN_SIZE,
  DEFAULT_GRID_COLUMN_SIZE,
  resolveColumnSizingStateUpdate,
} from "./column-sizing";

describe("column sizing", () => {
  it("uses a bounded default width range for grid columns", () => {
    expect(DEFAULT_GRID_COLUMN_SIZE).toBe(200);
    expect(DEFAULT_GRID_COLUMN_MIN_SIZE).toBe(50);
    expect(DEFAULT_GRID_COLUMN_MAX_SIZE).toBe(400);
  });

  it("clamps persisted column widths into the supported range", () => {
    const nextState = clampColumnSizingState({
      id: 640,
      name: 24,
      tier: 280,
    });

    expect(nextState).toEqual({
      id: 400,
      name: 50,
      tier: 280,
    });
  });

  it("reuses the original object when all widths are already valid", () => {
    const state: ColumnSizingState = {
      id: 200,
      name: 260,
    };

    expect(clampColumnSizingState(state)).toBe(state);
  });

  it("clamps updater-based sizing changes before storing them", () => {
    const nextState = resolveColumnSizingStateUpdate(
      { id: 200 },
      (previous) => ({
        ...previous,
        id: 900,
      }),
    );

    expect(nextState).toEqual({ id: 400 });
  });
});
