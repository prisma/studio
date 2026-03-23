import { Cell } from "@tanstack/react-table";
import { isObjectType } from "remeda";

import type { Column } from "../../../data/adapter";
import {
  DEFAULT_ARRAY_DISPLAY,
  DEFAULT_BOOLEAN,
  DEFAULT_JSON,
  DEFAULT_NUMERIC,
  getDate0,
} from "../../../data/defaults";
import { DefaultValueCell } from "./DefaultValueCell";
import { HighlightSearchMatch } from "./highlight-search-match";
import { StringCell } from "./StringCell";

export interface GetCellProps {
  cell: Cell<Record<string, unknown>, unknown>;
  column: Column;
  searchTerm?: string;
}

export function getCell(props: GetCellProps) {
  const { cell, column, searchTerm } = props;
  const { datatype, defaultValue, fkColumn, nullable } = column;
  const { format, group, isArray } = datatype;

  const value = cell.getValue();

  if (value === undefined) {
    if (defaultValue != null) {
      return <DefaultValueCell defaultValue={defaultValue} />;
    }

    if (nullable) {
      return <NullCell />;
    }

    // we don't attempt to input anything for foreign keys, as it'll probably fail
    // due to referential integrity checks!
    if (fkColumn) {
      return null;
    }

    if (isArray) {
      return (
        <span className="text-muted-foreground">{DEFAULT_ARRAY_DISPLAY}</span>
      );
    }

    if (group === "string") {
      return <EmptyStringCell />;
    }

    if (group === "numeric") {
      return <span className="text-muted-foreground">{DEFAULT_NUMERIC}</span>;
    }

    if ((group === "datetime" || group === "time") && format) {
      return <span className="text-muted-foreground">{getDate0(format)}</span>;
    }

    if (group === "boolean") {
      return (
        <span className="text-muted-foreground">{String(DEFAULT_BOOLEAN)}</span>
      );
    }

    if (group === "json") {
      return <span className="text-muted-foreground">{DEFAULT_JSON}</span>;
    }

    return null;
  }

  if (value === null) {
    return <NullCell />;
  }

  if (isArray && value === DEFAULT_JSON) {
    return (
      <HighlightSearchMatch
        searchTerm={searchTerm}
        text={DEFAULT_ARRAY_DISPLAY}
      />
    );
  }

  if (isArray || group === "json") {
    return (
      <HighlightSearchMatch
        searchTerm={searchTerm}
        text={
          isObjectType(value) ? JSON.stringify(value, null, 2) : String(value)
        }
      />
    );
  }

  if (group === "string") {
    if (value === "") {
      return <EmptyStringCell />;
    }

    return <StringCell searchTerm={searchTerm} value={String(value)} />;
  }

  if (group === "boolean") {
    return (
      <HighlightSearchMatch
        searchTerm={searchTerm}
        text={String(Boolean(value))}
      />
    );
  }

  if (group === "raw") {
    return (
      <HighlightSearchMatch
        searchTerm={searchTerm}
        text={
          isObjectType(value) ? JSON.stringify(value, null, 2) : String(value)
        }
      />
    );
  }

  group satisfies "datetime" | "enum" | "numeric" | "time";

  return <HighlightSearchMatch searchTerm={searchTerm} text={String(value)} />;
}

function NullCell() {
  return <code className="text-muted-foreground/60">NULL</code>;
}

function EmptyStringCell() {
  return (
    <span className="italic text-muted-foreground select-none">
      (empty string)
    </span>
  );
}
