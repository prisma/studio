import { describe, expect, it } from "vitest";

import type { Table } from "../adapter";
import { getSelectQuery } from "./dml";

function createSearchTypesTable(): Table {
  return {
    columns: {
      id: {
        datatype: {
          group: "numeric",
          isArray: false,
          isNative: true,
          name: "int",
          options: [],
          schema: "studio",
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
        schema: "studio",
        table: "search_types",
      },
      name: {
        datatype: {
          group: "string",
          isArray: false,
          isNative: true,
          name: "text",
          options: [],
          schema: "studio",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: false,
        name: "name",
        nullable: true,
        pkPosition: null,
        schema: "studio",
        table: "search_types",
      },
      title: {
        datatype: {
          group: "string",
          isArray: false,
          isNative: true,
          name: "text",
          options: [],
          schema: "studio",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: false,
        name: "title",
        nullable: true,
        pkPosition: null,
        schema: "studio",
        table: "search_types",
      },
      state: {
        datatype: {
          group: "enum",
          isArray: false,
          isNative: true,
          name: "enum",
          options: ["new", "triaged", "closed"],
          schema: "studio",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: false,
        name: "state",
        nullable: true,
        pkPosition: null,
        schema: "studio",
        table: "search_types",
      },
      score: {
        datatype: {
          group: "numeric",
          isArray: false,
          isNative: true,
          name: "int",
          options: [],
          schema: "studio",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: false,
        name: "score",
        nullable: true,
        pkPosition: null,
        schema: "studio",
        table: "search_types",
      },
      joined_at: {
        datatype: {
          format: "YYYY-MM-DD HH:mm:ss.SSS",
          group: "datetime",
          isArray: false,
          isNative: true,
          name: "datetime",
          options: [],
          schema: "studio",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: false,
        name: "joined_at",
        nullable: true,
        pkPosition: null,
        schema: "studio",
        table: "search_types",
      },
      starts_at: {
        datatype: {
          format: "HH:mm:ss.SSS",
          group: "time",
          isArray: false,
          isNative: true,
          name: "time",
          options: [],
          schema: "studio",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: false,
        name: "starts_at",
        nullable: true,
        pkPosition: null,
        schema: "studio",
        table: "search_types",
      },
      payload_blob: {
        datatype: {
          group: "string",
          isArray: false,
          isNative: true,
          name: "longblob",
          options: [],
          schema: "studio",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: false,
        name: "payload_blob",
        nullable: true,
        pkPosition: null,
        schema: "studio",
        table: "search_types",
      },
      uuid_bin: {
        datatype: {
          group: "string",
          isArray: false,
          isNative: true,
          name: "binary",
          options: [],
          schema: "studio",
        },
        defaultValue: "uuid_to_bin(uuid())",
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: false,
        name: "uuid_bin",
        nullable: true,
        pkPosition: null,
        schema: "studio",
        table: "search_types",
      },
    },
    name: "search_types",
    schema: "studio",
  };
}

describe("mysql-core/full-table-search dml", () => {
  it("builds case-insensitive text predicates and skips binary/blob columns", () => {
    const query = getSelectQuery({
      filter: {
        after: "and",
        filters: [],
        id: "root",
        kind: "FilterGroup",
      },
      fullTableSearchTerm: "tri",
      pageIndex: 0,
      pageSize: 25,
      sortOrder: [],
      table: createSearchTypesTable(),
    });

    expect(query.sql).toContain("lower(cast(`name` as char)) like ?");
    expect(query.sql).toContain("lower(cast(`title` as char)) like ?");
    expect(query.sql).toContain("lower(cast(`state` as char)) like ?");
    expect(query.sql).toContain("MAX_EXECUTION_TIME(5000)");
    expect(query.sql).toContain("SET_VAR(lock_wait_timeout=1)");
    expect(query.sql).not.toContain(
      "lower(cast(`payload_blob` as char)) like ?",
    );
    expect(query.sql).not.toContain("lower(cast(`uuid_bin` as char)) like ?");
  });

  it("builds typed numeric/date/time predicates", () => {
    const numericQuery = getSelectQuery({
      filter: {
        after: "and",
        filters: [],
        id: "root",
        kind: "FilterGroup",
      },
      fullTableSearchTerm: "42",
      pageIndex: 0,
      pageSize: 25,
      sortOrder: [],
      table: createSearchTypesTable(),
    });
    const dateQuery = getSelectQuery({
      filter: {
        after: "and",
        filters: [],
        id: "root",
        kind: "FilterGroup",
      },
      fullTableSearchTerm: "2025-01-27",
      pageIndex: 0,
      pageSize: 25,
      sortOrder: [],
      table: createSearchTypesTable(),
    });
    const timeQuery = getSelectQuery({
      filter: {
        after: "and",
        filters: [],
        id: "root",
        kind: "FilterGroup",
      },
      fullTableSearchTerm: "10:56:12",
      pageIndex: 0,
      pageSize: 25,
      sortOrder: [],
      table: createSearchTypesTable(),
    });

    expect(numericQuery.sql).toContain("cast(`score` as decimal)");
    expect(dateQuery.sql).toContain("`joined_at` >= ?");
    expect(dateQuery.sql).toContain("`joined_at` < ?");
    expect(timeQuery.sql).toContain("`starts_at` = ?");
  });
});
