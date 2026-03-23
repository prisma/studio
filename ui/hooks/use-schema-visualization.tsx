import { useMemo } from "react";

import { useIntrospection } from "./use-introspection";
import { useNavigation } from "./use-navigation";

// Types matching the schema visualizer's expected format
export type Field = {
  name: string;
  type: string;
  isPrimary?: boolean;
  isRequired?: boolean;
  isNullable?: boolean;
  isForeignKey?: boolean;
  foreignKeyTo?: { table: string; column: string };
};

export type Table = {
  name: string;
  fields: Field[];
};

export type Relationship = {
  from: string;
  to: string;
  type: string;
};

export type SchemaVisualizationData = {
  tables: Table[];
  relationships: Relationship[];
};

const NO_TABLES_NODE: Table = {
  name: "No Tables Found",
  fields: [{ name: "message", type: "info", isRequired: true }],
};

export function useSchemaVisualization(): SchemaVisualizationData {
  const { data: introspection, isFetching } = useIntrospection();
  const {
    metadata: { activeSchema },
  } = useNavigation();

  return useMemo(() => {
    if (isFetching || !introspection || !activeSchema) {
      return { tables: [NO_TABLES_NODE], relationships: [] };
    }

    const currentSchemaData = introspection.schemas[activeSchema.name];

    if (
      !currentSchemaData ||
      Object.keys(currentSchemaData.tables).length === 0
    ) {
      return { tables: [NO_TABLES_NODE], relationships: [] };
    }

    const tables: Table[] = [];
    const tableMap: Record<string, Table> = {};

    Object.values(currentSchemaData.tables).forEach((table) => {
      const fields: Field[] = [];

      Object.values(table.columns).forEach((column) => {
        const fieldData: Field = {
          name: column.name,
          type: column.datatype.name,
          isPrimary: column.pkPosition != null,
          isRequired: !column.nullable,
          isNullable: column.nullable,
          isForeignKey: !!column.fkTable, // True if fkTable is present
        };
        if (column.fkTable && column.fkColumn) {
          fieldData.foreignKeyTo = {
            table: column.fkTable,
            column: column.fkColumn,
          };
        }
        fields.push(fieldData);
      });

      const tableObject: Table = {
        name: table.name,
        fields,
      };

      tables.push(tableObject);
      tableMap[table.name] = tableObject;
    });

    const relationships: Relationship[] = [];

    tables.forEach((sourceTable) => {
      const originalTableData = currentSchemaData.tables[sourceTable.name];
      if (originalTableData) {
        Object.values(originalTableData.columns).forEach((column) => {
          if (column.fkTable && column.fkColumn) {
            // Determine if the FK column in the sourceTable is also part of its own Primary Key
            const isOneToOne = column.pkPosition != null; // If the FK column itself is a PK component

            relationships.push({
              from: column.fkTable, // The table being referenced (potentially 1 side)
              to: sourceTable.name, // The table with the foreign key (N side or 1 side if FK is PK)
              type: isOneToOne ? "1:1" : "1:n",
            });
          }
        });
      }
    });

    return { tables, relationships };
  }, [introspection, isFetching, activeSchema]);
}
