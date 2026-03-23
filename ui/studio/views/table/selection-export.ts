import type { RowSelectionState } from "@tanstack/react-table";

import type { GridSelectionRange } from "../../grid/cell-selection";

export type SelectionExportFormat = "csv" | "markdown";

export interface SelectionExportTable {
  columnIds: string[];
  rows: string[][];
}

export function buildCellSelectionExportTable(args: {
  range: GridSelectionRange;
  rows: Record<string, unknown>[];
  columnIds: string[];
}): SelectionExportTable {
  const { columnIds, range, rows } = args;
  const selectedColumnIds: string[] = [];
  const selectedRows: string[][] = [];

  for (
    let columnIndex = range.columnStart;
    columnIndex <= range.columnEnd;
    columnIndex++
  ) {
    const columnId = columnIds[columnIndex];

    if (!columnId) {
      continue;
    }

    selectedColumnIds.push(columnId);
  }

  if (selectedColumnIds.length === 0) {
    return {
      columnIds: [],
      rows: [],
    };
  }

  for (let rowIndex = range.rowStart; rowIndex <= range.rowEnd; rowIndex++) {
    const row = rows[rowIndex];

    if (!row) {
      continue;
    }

    selectedRows.push(
      selectedColumnIds.map((columnId) =>
        stringifySelectionExportValue(row[columnId]),
      ),
    );
  }

  return {
    columnIds: selectedColumnIds,
    rows: selectedRows,
  };
}

export function buildRowSelectionExportTable(args: {
  rows: Record<string, unknown>[];
  rowSelectionState: RowSelectionState;
  columnIds: string[];
}): SelectionExportTable {
  const { columnIds, rowSelectionState, rows } = args;

  if (columnIds.length === 0) {
    return {
      columnIds: [],
      rows: [],
    };
  }

  const selectedRows = rows
    .filter((row) => {
      const rowId = row.__ps_rowid;

      return typeof rowId === "string" && rowSelectionState[rowId] === true;
    })
    .map((row) =>
      columnIds.map((columnId) => stringifySelectionExportValue(row[columnId])),
    );

  return {
    columnIds: [...columnIds],
    rows: selectedRows,
  };
}

export function serializeSelectionExport(args: {
  table: SelectionExportTable;
  format: SelectionExportFormat;
  includeColumnHeader: boolean;
}): string {
  const { format, includeColumnHeader, table } = args;

  if (table.columnIds.length === 0) {
    return "";
  }

  if (format === "csv") {
    return serializeSelectionExportCsv({ includeColumnHeader, table });
  }

  return serializeSelectionExportMarkdown({ includeColumnHeader, table });
}

export function buildSelectionExportFilename(args: {
  schema: string;
  table: string;
  format: SelectionExportFormat;
}): string {
  const extension = args.format === "csv" ? "csv" : "md";

  return `${args.schema}-${args.table}-selection.${extension}`;
}

export function downloadSelectionExport(args: {
  content: string;
  filename: string;
  format: SelectionExportFormat;
}) {
  const { content, filename, format } = args;

  const blob = new Blob([content], {
    type:
      format === "csv"
        ? "text/csv;charset=utf-8"
        : "text/markdown;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function serializeSelectionExportCsv(args: {
  table: SelectionExportTable;
  includeColumnHeader: boolean;
}): string {
  const { includeColumnHeader, table } = args;
  const lines: string[] = [];

  if (includeColumnHeader) {
    lines.push(serializeCsvRow(table.columnIds));
  }

  for (const row of table.rows) {
    lines.push(serializeCsvRow(row));
  }

  return lines.join("\n");
}

function serializeCsvRow(values: string[]): string {
  return values.map(escapeCsvValue).join(",");
}

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function serializeSelectionExportMarkdown(args: {
  table: SelectionExportTable;
  includeColumnHeader: boolean;
}): string {
  const { includeColumnHeader, table } = args;
  const lines: string[] = [];

  if (includeColumnHeader) {
    lines.push(serializeMarkdownRow(table.columnIds));
    lines.push(`| ${table.columnIds.map(() => "---").join(" | ")} |`);
  }

  for (const row of table.rows) {
    lines.push(serializeMarkdownRow(row));
  }

  return lines.join("\n");
}

function serializeMarkdownRow(values: string[]): string {
  return `| ${values.map(escapeMarkdownValue).join(" | ")} |`;
}

function escapeMarkdownValue(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r\n", "<br />")
    .replaceAll("\n", "<br />")
    .replaceAll("\r", "<br />");
}

function stringifySelectionExportValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}
