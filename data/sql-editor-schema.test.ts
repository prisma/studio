import { describe, expect, it } from "vitest";

import type { AdapterIntrospectResult } from "./adapter";
import {
  createSqlEditorNamespace,
  createSqlEditorSchemaFromIntrospection,
  createSqlEditorSchemaVersion,
} from "./sql-editor-schema";

function createIntrospection(): AdapterIntrospectResult {
  return {
    filterOperators: [],
    query: { parameters: [], sql: "select 1" },
    schemas: {
      public: {
        name: "public",
        tables: {
          users: {
            columns: {
              name: {
                datatype: {
                  group: "string",
                  isArray: false,
                  isNative: true,
                  name: "text",
                  options: [],
                  schema: "pg_catalog",
                },
                defaultValue: null,
                fkColumn: null,
                fkSchema: null,
                fkTable: null,
                isAutoincrement: false,
                isComputed: false,
                isRequired: false,
                name: "name",
                nullable: false,
                pkPosition: null,
                schema: "public",
                table: "users",
              },
              id: {
                datatype: {
                  group: "numeric",
                  isArray: false,
                  isNative: true,
                  name: "int4",
                  options: [],
                  schema: "pg_catalog",
                },
                defaultValue: null,
                fkColumn: null,
                fkSchema: null,
                fkTable: null,
                isAutoincrement: true,
                isComputed: false,
                isRequired: false,
                name: "id",
                nullable: false,
                pkPosition: 1,
                schema: "public",
                table: "users",
              },
            },
            name: "users",
            schema: "public",
          },
        },
      },
      zoo: {
        name: "zoo",
        tables: {
          animals: {
            columns: {
              species: {
                datatype: {
                  group: "string",
                  isArray: false,
                  isNative: true,
                  name: "text",
                  options: [],
                  schema: "pg_catalog",
                },
                defaultValue: null,
                fkColumn: null,
                fkSchema: null,
                fkTable: null,
                isAutoincrement: false,
                isComputed: false,
                isRequired: false,
                name: "species",
                nullable: false,
                pkPosition: null,
                schema: "zoo",
                table: "animals",
              },
            },
            name: "animals",
            schema: "zoo",
          },
        },
      },
    },
    timezone: "UTC",
  };
}

describe("data/sql-editor-schema", () => {
  it("builds a namespace map used by SQL editor autocomplete", () => {
    const introspection = createIntrospection();

    expect(createSqlEditorNamespace(introspection)).toEqual({
      public: {
        users: ["id", "name"],
      },
      zoo: {
        animals: ["species"],
      },
    });
  });

  it("creates a stable schema version regardless of object key order", () => {
    const first = createSqlEditorNamespace(createIntrospection());
    const second = {
      zoo: {
        animals: ["species"],
      },
      public: {
        users: ["name", "id"],
      },
    };

    expect(createSqlEditorSchemaVersion(first)).toBe(
      createSqlEditorSchemaVersion(second),
    );
  });

  it("returns dialect + default schema metadata", () => {
    const result = createSqlEditorSchemaFromIntrospection({
      defaultSchema: "public",
      dialect: "postgresql",
      introspection: createIntrospection(),
    });

    expect(result).toMatchObject({
      defaultSchema: "public",
      dialect: "postgresql",
      namespace: {
        public: {
          users: ["id", "name"],
        },
        zoo: {
          animals: ["species"],
        },
      },
    });
    expect(result.version.startsWith("schema-")).toBe(true);
  });
});
