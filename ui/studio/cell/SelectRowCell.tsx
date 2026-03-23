import { Row } from "@tanstack/react-table";

import { CheckboxTable } from "@/ui/components/ui/checkbox-table";

export interface SelectRowCellProps {
  row: Row<Record<string, unknown>>;
  readonly: boolean;
}

export function SelectRowCell(props: SelectRowCellProps) {
  const { row, readonly } = props;

  return (
    <CheckboxTable
      checked={row.getIsSelected()}
      disabled={!row.getCanSelect() || readonly}
      onCheckedChange={row.getToggleSelectedHandler()}
      className="w-full h-full rounded-none border-none"
    />
  );
}
