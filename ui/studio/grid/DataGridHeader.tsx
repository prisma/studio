import { type Header } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Pin } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { Column } from "@/data";

import { cn } from "../../lib/utils";
import { DataGridHeaderCell } from "./DataGridHeaderCell";

export interface HeaderProps<TData> {
  column: Column;
  header: Header<TData, unknown>;
  className?: string;
  isSortDisabled?: boolean;
  onBlockedSortInteraction?: () => void;
}

export function DataGridHeader<TData>(props: HeaderProps<TData>) {
  const {
    column,
    header,
    className,
    isSortDisabled = false,
    onBlockedSortInteraction,
  } = props;
  const isPinned = header.column.getIsPinned() !== false;
  const sortedState = header.column.getIsSorted();
  const isSorted = sortedState !== false;
  const shouldKeepControlsVisible = isPinned || isSorted;
  const controlsClassName = shouldKeepControlsVisible
    ? "opacity-100 pointer-events-auto"
    : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto";

  const isSortAsc = sortedState === "asc";
  const isSortDesc = sortedState === "desc";

  function handlePinToggle() {
    header.column.pin(isPinned ? false : "left");
  }

  function handleSortToggle() {
    if (isSortDisabled) {
      onBlockedSortInteraction?.();
      return;
    }

    if (!header.column.getCanSort()) {
      return;
    }

    if (sortedState === false) {
      header.column.toggleSorting(false);
      return;
    }

    if (sortedState === "asc") {
      header.column.toggleSorting(true);
      return;
    }

    header.column.clearSorting();
  }

  function handleSortMouseDown(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (!isSortDisabled) {
      return;
    }

    event.preventDefault();
    onBlockedSortInteraction?.();
  }

  return (
    <div
      className={cn(
        "group relative flex h-full w-full items-center justify-between min-w-0 px-2",
        className,
      )}
    >
      <div className="flex items-center justify-between w-full min-w-0 pr-2">
        <div className="flex items-center gap-2 overflow-hidden text-ellipsis font-mono text-xs">
          {header.isPlaceholder ? null : (
            <span className="flex min-w-0">
              <span className="min-w-0 overflow-hidden text-ellipsis text-foreground/90">
                <DataGridHeaderCell column={column} />
              </span>
            </span>
          )}
        </div>
      </div>
      <span
        data-testid="column-header-controls"
        data-active={shouldKeepControlsVisible || undefined}
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 z-10 inline-flex items-center gap-0.5 rounded-full border border-table-border bg-background/95 px-1 py-0.5 shadow-sm transition-opacity duration-150",
          controlsClassName,
        )}
      >
        {header.column.getCanPin() && header.column.id !== "__ps_select" && (
          <button
            type="button"
            aria-label={isPinned ? "Unpin column" : "Pin column"}
            onClick={(event) => {
              event.stopPropagation();
              handlePinToggle();
            }}
            onMouseDown={(event) => event.stopPropagation()}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full transition-colors",
              isPinned
                ? "text-foreground"
                : "text-foreground-neutral-weak hover:text-foreground-neutral",
            )}
          >
            <Pin size={12} />
          </button>
        )}
        {header.column.getCanSort() && (
          <button
            type="button"
            aria-disabled={isSortDisabled || undefined}
            aria-label={
              isSortAsc
                ? "Sort descending"
                : isSortDesc
                  ? "Clear sorting"
                  : "Sort ascending"
            }
            onClick={(event) => {
              event.stopPropagation();
              handleSortToggle();
            }}
            onMouseDown={handleSortMouseDown}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full transition-colors",
              isSortDisabled && "opacity-60",
              isSorted
                ? "text-foreground"
                : "text-foreground-neutral-weak hover:text-foreground-neutral",
            )}
          >
            {isSortDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
          </button>
        )}
      </span>
      {header.column.getCanResize() && (
        <button
          type="button"
          tabIndex={0}
          onMouseDown={(e) => {
            e.stopPropagation();
            header.getResizeHandler()(e);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            header.getResizeHandler()(e);
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              header.getResizeHandler()(e);
            }
          }}
          className={cn(
            "absolute inset-y-0 -right-2 z-20 block w-4 cursor-col-resize before:absolute before:inset-y-0 before:left-2 before:w-px before:bg-transparent hover:before:bg-table-border focus-visible:outline-none focus-visible:before:bg-table-border",
          )}
          aria-label="Resize column"
        />
      )}
    </div>
  );
}
