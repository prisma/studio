import { describe, expect, it } from "vitest";

import type { Column, Table } from "@/data";

import { getBackRelationColumns } from "./back-relation-columns";

describe("getBackRelationColumns", () => {
  it("derives inferred inbound foreign-key relations for the active table", () => {
    const organizationsTable = createTable({
      columns: {
        id: createTextColumn({
          name: "id",
          pkPosition: 1,
          table: "organizations",
        }),
      },
      name: "organizations",
    });
    const teamMembersTable = createTable({
      columns: {
        id: createTextColumn({
          name: "id",
          pkPosition: 1,
          table: "team_members",
        }),
        organization_id: createTextColumn({
          fkColumn: "id",
          fkSchema: "public",
          fkTable: "organizations",
          name: "organization_id",
          table: "team_members",
        }),
      },
      name: "team_members",
    });

    expect(
      getBackRelationColumns({
        introspection: {
          filterOperators: [],
          query: {
            parameters: [],
            sql: "",
          },
          schemas: {
            public: {
              name: "public",
              tables: {
                organizations: organizationsTable,
                team_members: teamMembersTable,
              },
            },
          },
          timezone: "UTC",
        },
        table: organizationsTable,
      }),
    ).toEqual([
      {
        currentColumnName: "id",
        kind: "back-relation",
        name: "team_members",
        sourceColumn: "organization_id",
        sourceSchema: "public",
        sourceTable: "team_members",
      },
    ]);
  });

  it("disambiguates multiple inbound relations from the same source table", () => {
    const table = createTable({
      columns: {
        id: createTextColumn({
          name: "id",
          pkPosition: 1,
          table: "users",
        }),
      },
      name: "users",
    });

    expect(
      getBackRelationColumns({
        introspection: {
          filterOperators: [],
          query: {
            parameters: [],
            sql: "",
          },
          schemas: {
            public: {
              name: "public",
              tables: {
                audit_logs: {
                  columns: {
                    actor_id: createTextColumn({
                      fkColumn: "id",
                      fkSchema: "public",
                      fkTable: "users",
                      name: "actor_id",
                      table: "audit_logs",
                    }),
                    reviewer_id: createTextColumn({
                      fkColumn: "id",
                      fkSchema: "public",
                      fkTable: "users",
                      name: "reviewer_id",
                      table: "audit_logs",
                    }),
                  },
                  name: "audit_logs",
                  schema: "public",
                },
                users: table,
              },
            },
          },
          timezone: "UTC",
        },
        table,
      }).map((column) => column.name),
    ).toEqual(["audit_logs_actor_id", "audit_logs_reviewer_id"]);
  });
});

function createTable(args: {
  columns: Record<string, Column>;
  name: string;
  schema?: string;
}): Table {
  return {
    columns: args.columns,
    name: args.name,
    schema: args.schema ?? "public",
  };
}

function createTextColumn(args: {
  fkColumn?: string | null;
  fkSchema?: string | null;
  fkTable?: string | null;
  name: string;
  pkPosition?: number | null;
  schema?: string;
  table: string;
}): Column {
  return {
    datatype: {
      group: "string",
      isArray: false,
      isNative: true,
      name: "text",
      options: [],
      schema: "pg_catalog",
    },
    defaultValue: null,
    fkColumn: args.fkColumn ?? null,
    fkSchema: args.fkSchema ?? null,
    fkTable: args.fkTable ?? null,
    isAutoincrement: false,
    isComputed: false,
    isRequired: false,
    name: args.name,
    nullable: false,
    pkPosition: args.pkPosition ?? null,
    schema: args.schema ?? "public",
    table: args.table,
  };
}
