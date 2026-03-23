import { Cell } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";

import type { AdapterIntrospectResult, Column, FilterGroup } from "@/data";
import { Button } from "@/ui/components/ui/button";
import type { useNavigation } from "@/ui/hooks/use-navigation";

import uuid from "../../lib/short-uuid";

export function Link(props: {
  cell: Cell<Record<string, unknown>, unknown>;
  column: Column;
  createUrl: ReturnType<typeof useNavigation>["createUrl"];
  introspection: AdapterIntrospectResult;
}) {
  const { cell, column, createUrl, introspection } = props;
  const { fkSchema, fkTable, fkColumn } = column;

  return (
    <RelationLink
      createUrl={createUrl}
      filterColumn={fkColumn}
      filterValue={cell.getValue()}
      introspection={introspection}
      targetSchema={fkSchema}
      targetTable={fkTable}
    />
  );
}

export function RelationLink(props: {
  createUrl: ReturnType<typeof useNavigation>["createUrl"];
  filterColumn: string | null | undefined;
  filterValue: unknown;
  introspection: AdapterIntrospectResult;
  targetSchema: string | null | undefined;
  targetTable: string | null | undefined;
}) {
  const {
    createUrl,
    filterColumn,
    filterValue,
    introspection,
    targetSchema,
    targetTable,
  } = props;

  if (targetSchema == null || targetTable == null || filterColumn == null) {
    return null;
  }

  const table = introspection.schemas[targetSchema]?.tables[targetTable];

  if (!table) {
    return null;
  }

  if (filterValue == null) {
    return null;
  }

  return (
    <Button
      aria-label={`Open ${table.name}`}
      className="shrink-0"
      onMouseDown={(e) => e.stopPropagation()}
      size={"xs"}
      variant={"outline"}
      onClick={(e) => e.stopPropagation()}
      asChild
    >
      <a
        href={createUrl({
          schemaParam: targetSchema,
          tableParam: table.name,
          filterParam: JSON.stringify({
            kind: "FilterGroup",
            id: uuid.generate(),
            after: "and",
            filters: [
              {
                kind: "ColumnFilter",
                id: uuid.generate(),
                column: filterColumn,
                operator: "=",
                value: filterValue,
                after: "and",
              },
            ],
          } satisfies FilterGroup),
        })}
        // consider this:
        // rel="noopener noreferrer"
        // target="_blank"
      >
        <ArrowRight size={12} />
      </a>
    </Button>
  );
}
