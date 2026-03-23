import {
  type CSSProperties,
  DetailedHTMLProps,
  type PropsWithChildren,
} from "react";

import { TableCell, TableHead } from "../../components/ui/table";
import { cn } from "../../lib/utils";

export interface SelectCellProps
  extends
    PropsWithChildren,
    DetailedHTMLProps<React.HTMLAttributes<unknown>, unknown> {
  className?: string;
  style?: CSSProperties;
  isHeader?: boolean;
}

export function SelectCell(props: SelectCellProps) {
  const {
    children,
    className,
    ref,
    style,
    isHeader = false,
    ...forwardedProps
  } = props;

  const selectClasses = cn(
    "flex items-center justify-center p-0 border-r border-b border-table-border w-full px-(--studio-cell-spacing) leading-(--studio-cell-height) h-(--studio-cell-height)",
  );

  return (
    <>
      {isHeader ? (
        <TableHead
          {...forwardedProps}
          className={cn(
            selectClasses,
            "h-10 bg-table-head z-30 sticky top-0 left-0 p-0",
            className,
          )}
          ref={ref as never}
        >
          {children}
        </TableHead>
      ) : (
        <TableCell
          {...forwardedProps}
          className={cn(selectClasses, "z-10 h-[39px] p-0", className)}
          ref={ref as never}
          style={style}
        >
          {children}
        </TableCell>
      )}
    </>
  );
}
