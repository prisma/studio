import { describe, expect, it } from "vitest";

import type { Table } from "../../data/adapter";
import { resolveFullTableSearchTerm } from "./use-active-table-query";

function createTable(): Table {
  return {
    columns: {
      id: {
        datatype: {
          group: "string",
          isArray: false,
          isNative: true,
          name: "text",
          options: [],
          schema: "public",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: true,
        name: "id",
        nullable: false,
        pkPosition: 1,
        schema: "public",
        table: "users",
      },
    },
    name: "users",
    schema: "public",
  };
}

describe("resolveFullTableSearchTerm", () => {
  it("returns undefined when scope is table", () => {
    const result = resolveFullTableSearchTerm({
      activeTable: createTable(),
      searchScope: "table",
      searchTerm: "acme",
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when search term is empty", () => {
    const result = resolveFullTableSearchTerm({
      activeTable: createTable(),
      searchScope: "row",
      searchTerm: "   ",
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when no table is active", () => {
    const result = resolveFullTableSearchTerm({
      activeTable: undefined,
      searchScope: "row",
      searchTerm: "acme",
    });

    expect(result).toBeUndefined();
  });

  it("returns the trimmed term when row scope is active", () => {
    const result = resolveFullTableSearchTerm({
      activeTable: createTable(),
      searchScope: "row",
      searchTerm: " acme ",
    });

    expect(result).toBe("acme");
  });
});
