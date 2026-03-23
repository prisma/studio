import { Column } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import { cn } from "@/ui/lib/utils";

export function getColumnPinningStyles(
  column: Column<Record<string, unknown>>,
  kind: "header" | "cell",
) {
  const isPinned = column.getIsPinned();
  const isLeftPinned = isPinned === "left";
  const isRightPinned = isPinned === "right";
  const isPinnedHeader = kind === "header" && (isLeftPinned || isRightPinned);
  const isPinnedCell = kind === "cell" && (isLeftPinned || isRightPinned);
  const headerLayerClass = kind === "header" ? "z-10" : undefined;
  const cellHoverClass =
    kind === "cell"
      ? isPinnedCell
        ? "group-hover:!bg-muted"
        : "group-hover:bg-muted"
      : undefined;
  const regularCellLayerClass =
    kind === "cell" && !isPinned ? "relative z-0" : undefined;
  const pinnedCellLayerClass = isPinnedCell
    ? column.id === "__ps_select"
      ? "z-30"
      : "z-20"
    : undefined;
  const pinnedHeaderLayerClass = isPinnedHeader
    ? column.id === "__ps_select"
      ? "z-40"
      : "z-30"
    : undefined;

  return {
    className: cn(
      cellHoverClass,
      kind === "cell" &&
        isPinned &&
        "group-odd:!bg-table-cell-odd group-even:!bg-table-cell-even",
      kind === "header" && "select-none touch-none sticky top-0 bg-table-head",
      "group border-r border-b border-table-border",
      "overflow-hidden whitespace-nowrap text-ellipsis",
      "data-[pinning-animating=from]:transition-none data-[pinning-animating=true]:transition-transform data-[pinning-animating=true]:duration-[1000ms] data-[pinning-animating=true]:ease-out data-[pinning-animating=true]:will-change-transform motion-reduce:transition-none",
      headerLayerClass,
      regularCellLayerClass,
      isPinned && "sticky",
      pinnedHeaderLayerClass,
      pinnedCellLayerClass,
      column.id === "__ps_select" && "p-0",
    ),
    style: {
      minWidth: `${column.getSize()}px`,
      transform:
        "translate3d(var(--ps-pinning-translate-x, 0px), var(--ps-pinning-translate-y, 0px), 0)",
      width: `${column.getSize()}px`,
      left: isLeftPinned ? `${column.getStart("left")}px` : undefined,
      right: isRightPinned ? `${column.getAfter("right")}px` : undefined,
    } as CSSProperties,
  };
}
