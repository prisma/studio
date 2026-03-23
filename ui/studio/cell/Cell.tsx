import {
  type CSSProperties,
  DetailedHTMLProps,
  forwardRef,
  type PropsWithChildren,
} from "react";

import { TableCell } from "../../components/ui/table";
import { cn } from "../../lib/utils";
import { DataGridCellContextMenu } from "../grid/DataGridCellContextMenu";

export interface CellProps
  extends
    PropsWithChildren,
    DetailedHTMLProps<React.HTMLAttributes<unknown>, unknown> {
  [key: `data-${string}`]: boolean | number | string | undefined;
  className?: string;
  contentClassName?: string;
  contextMenuCopyText?: string | (() => string);
  style?: CSSProperties;
  withContextMenu?: boolean;
}

const defaultCellContentClassName = cn(
  "relative z-10 block h-(--studio-cell-height) w-full px-(--studio-cell-spacing)",
  "truncate text-xs font-mono text-foreground",
  "leading-(--studio-cell-height)",
  "group-data-[select=true]:p-0",
);

export const stagedCellClassName = cn(
  "ps-staged-cell relative z-0",
  "before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-staged-cell-background before:content-['']",
  "after:pointer-events-none after:absolute after:inset-0 after:z-20 after:border after:border-amber-300 after:content-['']",
);

export const focusedCellClassName = cn(
  "relative z-0",
  "before:pointer-events-none before:absolute before:inset-0 before:z-20 before:border before:border-sky-300 before:content-['']",
);

export const focusedStagedCellClassName = cn(
  "ps-staged-cell relative z-0",
  "before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-staged-cell-background before:content-['']",
  "after:pointer-events-none after:absolute after:inset-0 after:z-20 after:border after:border-sky-300 after:content-['']",
);

export const Cell = forwardRef((props: CellProps, ref) => {
  const {
    children,
    className,
    contentClassName,
    contextMenuCopyText,
    style,
    withContextMenu = true,
    ...forwardedProps
  } = props;

  const cellContent = withContextMenu ? (
    <DataGridCellContextMenu copyText={contextMenuCopyText}>
      {children}
    </DataGridCellContextMenu>
  ) : (
    children
  );

  return (
    <TableCell
      {...forwardedProps}
      className={cn(
        "p-0 border-r border-b border-table-border group",
        // TODO: Keeping this temporarily; might need it later depending on input types
        // "data-[focus=true]:ring-2 data-[focus=true]:ring-indigo-400 data-[focus=true]:ring-inset",
        "cursor-pointer",
        className,
      )}
      ref={ref as never}
      style={style}
    >
      <div
        data-studio-cell-content
        className={cn(defaultCellContentClassName, contentClassName)}
      >
        {cellContent}
      </div>
    </TableCell>
  );
});

Cell.displayName = "Cell";
