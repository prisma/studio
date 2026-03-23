import {
  MySQL,
  PostgreSQL,
  type SQLDialect,
  SQLite,
  type SQLNamespace,
} from "@codemirror/lang-sql";

import type { SqlEditorDialect } from "../../../../data/adapter";

export function getCodeMirrorDialect(
  dialect: SqlEditorDialect | undefined,
): SQLDialect {
  if (dialect === "mysql") {
    return MySQL;
  }

  if (dialect === "sqlite") {
    return SQLite;
  }

  return PostgreSQL;
}

export function toCodeMirrorSqlNamespace(
  namespace: Record<string, Record<string, string[]>>,
): SQLNamespace {
  const schemas: Record<string, SQLNamespace> = {};
  const sortedSchemaNames = Object.keys(namespace).sort((left, right) =>
    left.localeCompare(right),
  );

  for (const schemaName of sortedSchemaNames) {
    const tables = namespace[schemaName] ?? {};
    const normalizedTables: Record<string, SQLNamespace> = {};
    const sortedTableNames = Object.keys(tables).sort((left, right) =>
      left.localeCompare(right),
    );

    for (const tableName of sortedTableNames) {
      normalizedTables[tableName] = [...(tables[tableName] ?? [])].sort(
        (left, right) => left.localeCompare(right),
      );
    }

    schemas[schemaName] = normalizedTables;
  }

  return schemas;
}
