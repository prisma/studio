import type {
  AdapterIntrospectResult,
  AdapterSqlSchemaResult,
  SqlEditorDialect,
} from "./adapter";

export function createSqlEditorSchemaFromIntrospection(args: {
  defaultSchema?: string;
  dialect: SqlEditorDialect;
  introspection: AdapterIntrospectResult;
}): AdapterSqlSchemaResult {
  const { defaultSchema, dialect, introspection } = args;
  const namespace = createSqlEditorNamespace(introspection);
  const version = createSqlEditorSchemaVersion(namespace);

  return {
    defaultSchema,
    dialect,
    namespace,
    version,
  };
}

export function createSqlEditorNamespace(
  introspection: AdapterIntrospectResult,
): Record<string, Record<string, string[]>> {
  const namespace: Record<string, Record<string, string[]>> = {};

  for (const [schemaName, schema] of Object.entries(introspection.schemas)) {
    const tables: Record<string, string[]> = {};

    for (const [tableName, table] of Object.entries(schema.tables)) {
      tables[tableName] = Object.keys(table.columns).sort((left, right) =>
        left.localeCompare(right),
      );
    }

    namespace[schemaName] = tables;
  }

  return namespace;
}

export function createSqlEditorSchemaVersion(
  namespace: Record<string, Record<string, string[]>>,
): string {
  const flattenedEntries: string[] = [];
  const sortedSchemaNames = Object.keys(namespace).sort((left, right) =>
    left.localeCompare(right),
  );

  for (const schemaName of sortedSchemaNames) {
    const tables = namespace[schemaName] ?? {};
    const sortedTableNames = Object.keys(tables).sort((left, right) =>
      left.localeCompare(right),
    );

    for (const tableName of sortedTableNames) {
      const columns = [...(tables[tableName] ?? [])].sort((left, right) =>
        left.localeCompare(right),
      );
      flattenedEntries.push(`${schemaName}.${tableName}:${columns.join(",")}`);
    }
  }

  return `schema-${hashText(flattenedEntries.join("|")).toString(36)}`;
}

function hashText(value: string): number {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    hash = (hash * 33) ^ charCode;
  }

  return hash >>> 0;
}
