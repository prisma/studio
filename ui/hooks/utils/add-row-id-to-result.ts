import { Table } from "@/data";
import { inferFilterObject } from "@/data/query";

function getRowId(row: Record<string, unknown>, table: Table) {
  // FIXME: this doesn't work for tables without a primary key and causes a runtime error.
  const id = {
    filter: inferFilterObject(row, table.columns),
    table: `${table.schema}.${table.name}`,
  };

  return JSON.stringify(id);
}

function addRowIdToRow(args: {
  row: Record<string, unknown>;
  table: Table;
  orderIndex?: number;
}) {
  const { row, table, orderIndex } = args;

  return {
    ...row,
    __ps_rowid: getRowId(row, table),
    ...(orderIndex == null ? {} : { __ps_order: orderIndex }),
  };
}

type AdapterResult = {
  row?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
};

export function addRowIdToResult<T extends AdapterResult>(
  result: T,
  table: Table,
) {
  const { row, rows } = result;

  if (row !== undefined) {
    return {
      ...result,
      row: addRowIdToRow({ row, table }),
    };
  }

  if (rows !== undefined) {
    return {
      ...result,
      rows: rows.map((currentRow, orderIndex) =>
        addRowIdToRow({ row: currentRow, table, orderIndex }),
      ),
    };
  }

  return result;
}
