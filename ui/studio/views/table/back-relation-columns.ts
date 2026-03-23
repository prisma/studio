import type { AdapterIntrospectResult, Table } from "@/data";

export interface BackRelationColumnMeta {
  currentColumnName: string;
  kind: "back-relation";
  name: string;
  sourceColumn: string;
  sourceSchema: string;
  sourceTable: string;
}

export function getBackRelationColumns(args: {
  introspection: AdapterIntrospectResult | undefined;
  table: Table | undefined;
}): BackRelationColumnMeta[] {
  const { introspection, table } = args;

  if (!introspection || !table) {
    return [];
  }

  const candidates = Object.values(introspection.schemas).flatMap((schema) =>
    Object.values(schema.tables).flatMap((sourceTable) =>
      Object.values(sourceTable.columns).flatMap((column) => {
        if (
          !column.fkColumn ||
          !column.fkTable ||
          (column.fkSchema != null && column.fkSchema !== table.schema) ||
          column.fkTable !== table.name
        ) {
          return [];
        }

        if (!(column.fkColumn in table.columns)) {
          return [];
        }

        return {
          currentColumnName: column.fkColumn,
          sourceColumn: column.name,
          sourceSchema: sourceTable.schema,
          sourceTable: sourceTable.name,
        };
      }),
    ),
  );

  const countsBySourceTable = new Map<string, number>();
  const countsByDisplayName = new Map<string, number>();

  candidates.forEach((candidate) => {
    const sourceTableKey = `${candidate.sourceSchema}.${candidate.sourceTable}`;
    countsBySourceTable.set(
      sourceTableKey,
      (countsBySourceTable.get(sourceTableKey) ?? 0) + 1,
    );
    countsByDisplayName.set(
      candidate.sourceTable,
      (countsByDisplayName.get(candidate.sourceTable) ?? 0) + 1,
    );
  });

  return candidates
    .map((candidate) => {
      const sourceTableKey = `${candidate.sourceSchema}.${candidate.sourceTable}`;
      const hasDuplicateTableName =
        (countsByDisplayName.get(candidate.sourceTable) ?? 0) > 1;
      const hasDuplicateSourceTable =
        (countsBySourceTable.get(sourceTableKey) ?? 0) > 1;

      let name = candidate.sourceTable;

      if (hasDuplicateTableName || hasDuplicateSourceTable) {
        name = `${candidate.sourceTable}_${candidate.sourceColumn}`;
      }

      return {
        ...candidate,
        kind: "back-relation" as const,
        name,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function isBackRelationColumnMeta(
  value: unknown,
): value is BackRelationColumnMeta {
  return (
    typeof value === "object" &&
    value != null &&
    "kind" in value &&
    value.kind === "back-relation" &&
    "name" in value &&
    typeof value.name === "string" &&
    "currentColumnName" in value &&
    typeof value.currentColumnName === "string" &&
    "sourceColumn" in value &&
    typeof value.sourceColumn === "string" &&
    "sourceSchema" in value &&
    typeof value.sourceSchema === "string" &&
    "sourceTable" in value &&
    typeof value.sourceTable === "string"
  );
}
