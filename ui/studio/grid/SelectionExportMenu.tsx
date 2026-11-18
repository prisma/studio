import type { RowSelectionState } from "@tanstack/react-table";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { cn } from "../../lib/utils";
import type { GridSelectionRange } from "./cell-selection";
import {
  buildCellSelectionExportTable,
  buildRowSelectionExportTable,
  buildSelectionExportFilename,
  downloadSelectionExport,
  type SelectionExportFormat,
  type SelectionExportTable,
  serializeSelectionExport,
} from "./selection-export";

interface SelectionExportMenuProps {
  cellSelectionRange: GridSelectionRange | null;
  columnIds: string[];
  filenameBase: string;
  rows: Record<string, unknown>[];
  rowSelectionState: RowSelectionState;
}

/**
 * Renders the `copy as` menu for the current grid selection. Any view that
 * renders the shared `DataGrid` can mount it, so cell ranges and row
 * selections export the same way everywhere.
 */
export function SelectionExportMenu(props: SelectionExportMenuProps) {
  const {
    cellSelectionRange,
    columnIds,
    filenameBase,
    rowSelectionState,
    rows,
  } = props;
  const [isOpen, setOpen] = useState(false);
  const [includeColumnHeader, setIncludeColumnHeader] = useState(true);
  const selectedRowCount =
    Object.values(rowSelectionState).filter(Boolean).length;

  if (cellSelectionRange == null && selectedRowCount === 0) {
    return null;
  }

  function buildSelectionExportTable(): SelectionExportTable | null {
    if (cellSelectionRange) {
      return buildCellSelectionExportTable({
        columnIds,
        range: cellSelectionRange,
        rows,
      });
    }

    if (selectedRowCount > 0) {
      return buildRowSelectionExportTable({
        columnIds,
        rowSelectionState,
        rows,
      });
    }

    return null;
  }

  function buildSerializedSelectionExport(
    format: SelectionExportFormat,
  ): string {
    const table = buildSelectionExportTable();

    if (!table) {
      return "";
    }

    return serializeSelectionExport({
      table,
      format,
      includeColumnHeader,
    });
  }

  function handleCopySelectionExport(format: SelectionExportFormat) {
    const content = buildSerializedSelectionExport(format);

    setOpen(false);

    if (!content || typeof navigator.clipboard?.writeText !== "function") {
      return;
    }

    void navigator.clipboard.writeText(content).catch((error) => {
      console.error("Failed to copy selection export:", error);
    });
  }

  function handleSaveSelectionExport(format: SelectionExportFormat) {
    const content = buildSerializedSelectionExport(format);

    setOpen(false);

    if (!content) {
      return;
    }

    downloadSelectionExport({
      content,
      filename: buildSelectionExportFilename({
        base: filenameBase,
        format,
      }),
      format,
    });
  }

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open);

        if (open) {
          setIncludeColumnHeader(true);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          aria-expanded={isOpen}
          aria-label="Copy selection as"
          variant="outline"
          className={cn(
            "h-9 shrink-0 gap-1.5 px-3 font-sans",
            isOpen && "bg-accent text-accent-foreground",
          )}
        >
          <span>copy as</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        className="w-[220px] max-w-[calc(100vw-2rem)] overflow-hidden p-1 font-sans"
      >
        <DropdownMenuCheckboxItem
          checked={includeColumnHeader}
          className="rounded-lg font-sans text-sm font-medium"
          onCheckedChange={(checked) =>
            setIncludeColumnHeader(checked === true)
          }
          onSelect={(event) => {
            event.preventDefault();
          }}
        >
          include column header
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <div className="p-0.5">
          {[
            {
              action: () => handleCopySelectionExport("markdown"),
              label: "copy markdown",
            },
            {
              action: () => handleCopySelectionExport("csv"),
              label: "copy csv",
            },
            {
              action: () => handleSaveSelectionExport("markdown"),
              label: "save markdown",
            },
            {
              action: () => handleSaveSelectionExport("csv"),
              label: "save csv",
            },
          ].map((item) => (
            <DropdownMenuItem
              key={item.label}
              className="rounded-lg font-sans text-sm font-medium"
              onSelect={item.action}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
