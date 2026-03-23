import type { ColumnPinningState } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import {
  getColumnPinningZone,
  resolveDirectionalColumnDragTarget,
  resolveColumnDragDropTarget,
  resolveColumnDragReorder,
} from "./DataGrid";

const BASE_COLUMN_ORDER = [
  "__ps_select",
  "id",
  "bigint_col",
  "bit_col",
  "box_col",
];

const BASE_COLUMN_PINNING: ColumnPinningState = {
  left: ["__ps_select", "id", "bigint_col"],
  right: [],
};

describe("column drag reorder", () => {
  it("classifies pinning zones from current pinning state", () => {
    expect(getColumnPinningZone("id", BASE_COLUMN_PINNING)).toBe("left");
    expect(getColumnPinningZone("bit_col", BASE_COLUMN_PINNING)).toBe(
      "center",
    );
    expect(
      getColumnPinningZone("right_col", {
        ...BASE_COLUMN_PINNING,
        right: ["right_col"],
      }),
    ).toBe("right");
  });

  it("reorders pinned columns within the left-pinned zone", () => {
    const result = resolveColumnDragReorder({
      activeId: "bigint_col",
      columnOrder: BASE_COLUMN_ORDER,
      columnPinning: BASE_COLUMN_PINNING,
      overId: "id",
    });

    expect(result.didReorder).toBe(true);
    expect(result.nextColumnOrder).toEqual([
      "__ps_select",
      "bigint_col",
      "id",
      "bit_col",
      "box_col",
    ]);
    expect(result.nextColumnPinning.left).toEqual([
      "__ps_select",
      "bigint_col",
      "id",
    ]);
  });

  it("reorders pinned columns by pinning order even when columnOrder is stale", () => {
    const result = resolveColumnDragReorder({
      activeId: "id",
      columnOrder: BASE_COLUMN_ORDER,
      columnPinning: {
        left: ["__ps_select", "bigint_col", "id"],
        right: [],
      },
      overId: "bigint_col",
    });

    expect(result.didReorder).toBe(true);
    expect(result.nextColumnPinning.left).toEqual([
      "__ps_select",
      "id",
      "bigint_col",
    ]);
  });

  it("does not reorder when dragging a pinned column over an unpinned column", () => {
    const result = resolveColumnDragReorder({
      activeId: "id",
      columnOrder: BASE_COLUMN_ORDER,
      columnPinning: BASE_COLUMN_PINNING,
      overId: "bit_col",
    });

    expect(result.didReorder).toBe(false);
    expect(result.nextColumnOrder).toEqual(BASE_COLUMN_ORDER);
    expect(result.nextColumnPinning).toEqual(BASE_COLUMN_PINNING);
  });

  it("does not reorder when dragging an unpinned column over a pinned column", () => {
    const result = resolveColumnDragReorder({
      activeId: "bit_col",
      columnOrder: BASE_COLUMN_ORDER,
      columnPinning: BASE_COLUMN_PINNING,
      overId: "id",
    });

    expect(result.didReorder).toBe(false);
    expect(result.nextColumnOrder).toEqual(BASE_COLUMN_ORDER);
    expect(result.nextColumnPinning).toEqual(BASE_COLUMN_PINNING);
  });

  it("reorders unpinned columns within center zone without changing pinning state", () => {
    const result = resolveColumnDragReorder({
      activeId: "box_col",
      columnOrder: BASE_COLUMN_ORDER,
      columnPinning: BASE_COLUMN_PINNING,
      overId: "bit_col",
    });

    expect(result.didReorder).toBe(true);
    expect(result.nextColumnOrder).toEqual([
      "__ps_select",
      "id",
      "bigint_col",
      "box_col",
      "bit_col",
    ]);
    expect(result.nextColumnPinning).toEqual(BASE_COLUMN_PINNING);
  });

  it("falls back to the last compatible over id when drag end has no over target", () => {
    const result = resolveColumnDragDropTarget({
      activeId: "bigint_col",
      columnPinning: BASE_COLUMN_PINNING,
      lastCompatibleOverId: "id",
      overId: null,
    });

    expect(result.compatibleOverId).toBeNull();
    expect(result.nextLastCompatibleOverId).toBe("id");
    expect(result.resolvedDropTargetId).toBe("id");
  });

  it("does not fall back when the drag end target is explicitly incompatible", () => {
    const result = resolveColumnDragDropTarget({
      activeId: "id",
      columnPinning: BASE_COLUMN_PINNING,
      lastCompatibleOverId: "bigint_col",
      overId: "bit_col",
    });

    expect(result.compatibleOverId).toBeNull();
    expect(result.nextLastCompatibleOverId).toBeNull();
    expect(result.resolvedDropTargetId).toBeNull();
  });

  it("derives a directional fallback target in the pinned zone when delta is significant", () => {
    expect(
      resolveDirectionalColumnDragTarget({
        activeId: "id",
        columnOrder: BASE_COLUMN_ORDER,
        columnPinning: BASE_COLUMN_PINNING,
        deltaX: 42,
      }),
    ).toBe("bigint_col");
    expect(
      resolveDirectionalColumnDragTarget({
        activeId: "bigint_col",
        columnOrder: BASE_COLUMN_ORDER,
        columnPinning: BASE_COLUMN_PINNING,
        deltaX: -42,
      }),
    ).toBe("id");
  });

  it("does not derive directional fallback for tiny drags", () => {
    expect(
      resolveDirectionalColumnDragTarget({
        activeId: "id",
        columnOrder: BASE_COLUMN_ORDER,
        columnPinning: BASE_COLUMN_PINNING,
        deltaX: 4,
      }),
    ).toBeNull();
  });
});
