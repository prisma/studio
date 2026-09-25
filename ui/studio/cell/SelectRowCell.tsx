import { Row } from "@tanstack/react-table";

import { CheckboxTable } from "@/ui/components/ui/checkbox-table";

export interface SelectRowCellProps {
  row: Row<Record<string, unknown>>;
}

export function SelectRowCell(props: SelectRowCellProps) {
  const { row } = props;

  return (
    <div className="flex items-center justify-center h-full w-full">
      <CheckboxTable
        checked={row.getIsSelected()}
        className="pointer-events-none h-4 w-4"
      />
    </div>
  );
}
