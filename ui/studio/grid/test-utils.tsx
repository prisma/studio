import type { ColumnDef } from "@tanstack/react-table";
import { act } from "react";
import { type Mock, vi } from "vitest";

import { CheckboxTable } from "../../components/ui/checkbox-table";
import { TableHead } from "../../components/ui/table";
import { Cell, type CellProps } from "../cell/Cell";

export type GridRow = Record<string, unknown>;
export type GridColumnDef = ColumnDef<GridRow>;

export const defaultRows: GridRow[] = [
  {
    __ps_rowid: "row_1",
    id: "org_acme",
    name: "Acme Labs",
  },
  {
    __ps_rowid: "row_2",
    id: "org_northwind",
    name: "Northwind Retail",
  },
  {
    __ps_rowid: "row_3",
    id: "org_globex",
    name: "Globex Corp",
  },
];

export function createReadOnlyColumns(args?: {
  includeRowSelector?: boolean;
  columnIds?: string[];
}): GridColumnDef[] {
  const columnIds = args?.columnIds ?? ["id", "name"];
  const concreteColumns: GridColumnDef[] = columnIds.map((columnId) => ({
    id: columnId,
    accessorKey: columnId,
    header({ header }) {
      return (props: Omit<CellProps, "children" | "ref">) => (
        <TableHead {...props}>{header.id}</TableHead>
      );
    },
    cell({ cell }) {
      return (props: Omit<CellProps, "children" | "ref">) => (
        <Cell {...props}>{String(cell.getValue() ?? "")}</Cell>
      );
    },
  }));

  if (!args?.includeRowSelector) {
    return concreteColumns;
  }

  const selectorColumn: GridColumnDef = {
    id: "__ps_select",
    accessorKey: "__ps_select",
    enablePinning: true,
    enableResizing: false,
    enableSorting: false,
    size: 35,
    minSize: 35,
    header({ table }) {
      return (props: Omit<CellProps, "children" | "ref">) => (
        <TableHead {...props} aria-label="Row selection spacer">
          <div className="flex items-center justify-center h-full w-full">
            <CheckboxTable
              checked={table.getIsAllRowsSelected()}
              className="pointer-events-none h-4 w-4"
            />
          </div>
        </TableHead>
      );
    },
    cell({ row }) {
      return (props: Omit<CellProps, "children" | "ref">) => (
        <Cell data-select="true" {...props}>
          <div className="flex items-center justify-center h-full w-full">
            <CheckboxTable
              checked={row.getIsSelected()}
              className="pointer-events-none h-4 w-4"
            />
          </div>
        </Cell>
      );
    },
  };

  return [selectorColumn, ...concreteColumns];
}

export function createSelection(args: {
  isCollapsed: boolean;
  text?: string;
}): { removeAllRanges: Mock } {
  const removeAllRanges = vi.fn();

  const selection = {
    isCollapsed: args.isCollapsed,
    rangeCount: args.isCollapsed ? 0 : 1,
    removeAllRanges,
    toString: () => args.text ?? "",
  } as unknown as Selection;

  vi.spyOn(window, "getSelection").mockReturnValue(selection);

  return { removeAllRanges };
}

export function dispatchMouse(
  target: EventTarget,
  type: string,
  init?: MouseEventInit,
) {
  act(() => {
    (target as HTMLElement | Window).dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
}

export function dispatchKeyboard(key: string, init?: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
}

export function dispatchCopyEvent(): {
  copyEvent: ClipboardEvent;
  setData: Mock;
} {
  const setData = vi.fn();
  const copyEvent = new Event("copy", {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;

  Object.defineProperty(copyEvent, "clipboardData", {
    configurable: true,
    value: {
      setData,
    },
  });

  act(() => {
    window.dispatchEvent(copyEvent);
  });

  return { copyEvent, setData };
}

export function mockClipboardWriteText(): Mock {
  const writeText = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText,
    },
  });

  return writeText;
}
