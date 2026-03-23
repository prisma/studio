import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Header, useReactTable } from "@tanstack/react-table";
import {
  type ComponentPropsWithoutRef,
  CSSProperties,
  PropsWithChildren,
} from "react";

import { TableHead } from "@/ui/components/ui/table";
import { cn } from "@/ui/lib/utils";

type DraggableHeaderCellProps = PropsWithChildren<{
  className?: string;
  header: Header<Record<string, unknown>, unknown>;
  style?: CSSProperties;
  table: ReturnType<typeof useReactTable<Record<string, unknown>>>;
}> &
  Omit<ComponentPropsWithoutRef<typeof TableHead>, "className" | "style">;

export const DataGridDraggableHeaderCell = (
  props: DraggableHeaderCellProps,
) => {
  const {
    children,
    className,
    header,
    style: commonStyle,
    table,
    ...tableHeadProps
  } = props;

  const {
    attributes,
    listeners,
    transform,
    transition,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: header.id,
  });

  const shouldPreviewReorder = Boolean(
    (
      table.options.meta as
        | { isColumnReorderPreviewEnabled?: boolean }
        | undefined
    )?.isColumnReorderPreviewEnabled,
  );
  const shouldSuppressReorderTransform = !isDragging && !shouldPreviewReorder;

  const dragTransform = shouldSuppressReorderTransform
    ? undefined
    : CSS.Translate.toString(transform);
  const style = {
    ...commonStyle,
    cursor: "grab",
    touchAction: "none",
    transform:
      [commonStyle?.transform, dragTransform].filter(Boolean).join(" ") ||
      undefined,
    transition: shouldSuppressReorderTransform ? undefined : transition,
  } as CSSProperties;

  const dragClass = cn(className, "p-0", isDragging && "z-50! opacity-0");

  return (
    <TableHead
      ref={setNodeRef}
      {...tableHeadProps}
      {...attributes}
      {...listeners}
      style={style}
      className={dragClass}
    >
      <div className="h-full min-w-0 w-full">{children}</div>
    </TableHead>
  );
};
