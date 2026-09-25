import { Table } from "@tanstack/react-table";

import { CheckboxTable } from "@/ui/components/ui/checkbox-table";

export interface SelectHeaderCellProps {
  table: Table<Record<string, unknown>>;
}

export function SelectHeaderCell(props: SelectHeaderCellProps) {
  const { table } = props;

  return (
    <div className="flex items-center justify-center h-full w-full">
      <CheckboxTable
        checked={
          table.getIsAllRowsSelected()
            ? true
            : table.getIsSomeRowsSelected()
              ? "indeterminate"
              : false
        }
        className="pointer-events-none h-4 w-4"
      />
    </div>
  );
}
