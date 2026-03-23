import { Table } from "@tanstack/react-table";

import { CheckboxTable } from "@/ui/components/ui/checkbox-table";

export interface SelectHeaderCellProps {
  table: Table<Record<string, unknown>>;
  readonly: boolean;
}

export function SelectHeaderCell(props: SelectHeaderCellProps) {
  const { table, readonly } = props;

  return (
    <CheckboxTable
      checked={table.getIsAllRowsSelected()}
      onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
      disabled={readonly}
      className="w-full h-full rounded-none border-none"
    />
  );
}
