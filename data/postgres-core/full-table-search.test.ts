import { describe, expect, it } from "vitest";

import type { Column, Table } from "../adapter";
import {
  buildFullTableSearchPlan,
  FULL_TABLE_SEARCH_MIN_QUERY_LENGTH,
} from "./full-table-search";

function createColumn(args: {
  name: string;
  group: Column["datatype"]["group"];
  typeName: string;
  isArray?: boolean;
  isNative?: boolean;
  options?: string[];
}): Column {
  const {
    group,
    isArray = false,
    isNative = true,
    name,
    options = [],
    typeName,
  } = args;

  return {
    datatype: {
      group,
      isArray,
      isNative,
      name: typeName,
      options,
      schema: isNative ? "pg_catalog" : "public",
    },
    defaultValue: null,
    fkColumn: null,
    fkSchema: null,
    fkTable: null,
    isAutoincrement: false,
    isComputed: false,
    isRequired: false,
    name,
    nullable: true,
    pkPosition: null,
    schema: "public",
    table: "search_types",
  };
}

function createTable(): Table {
  return {
    columns: {
      id: createColumn({
        group: "raw",
        name: "id",
        typeName: "uuid",
      }),
      name: createColumn({
        group: "string",
        name: "name",
        typeName: "text",
      }),
      title: createColumn({
        group: "string",
        name: "title",
        typeName: "text",
      }),
      state: createColumn({
        group: "enum",
        isNative: false,
        name: "state",
        options: ["new", "triaged", "closed"],
        typeName: "search_state",
      }),
      is_oncall: createColumn({
        group: "boolean",
        name: "is_oncall",
        typeName: "bool",
      }),
      joined_at: createColumn({
        group: "datetime",
        name: "joined_at",
        typeName: "timestamp",
      }),
      starts_at: createColumn({
        group: "time",
        name: "starts_at",
        typeName: "time",
      }),
      level: createColumn({
        group: "numeric",
        name: "level",
        typeName: "int4",
      }),
      profile: createColumn({
        group: "json",
        name: "profile",
        typeName: "jsonb",
      }),
      bytes: createColumn({
        group: "raw",
        name: "bytes",
        typeName: "bytea",
      }),
      skills: createColumn({
        group: "string",
        isArray: true,
        name: "skills",
        typeName: "text[]",
      }),
    },
    name: "search_types",
    schema: "public",
  };
}

describe("postgres-core/full-table-search", () => {
  it("ignores text search when term is shorter than the minimum length", () => {
    const plan = buildFullTableSearchPlan({
      searchTerm: "a",
      table: createTable(),
    });

    expect(FULL_TABLE_SEARCH_MIN_QUERY_LENGTH).toBe(2);
    expect(plan.predicates).toEqual([]);
  });

  it("builds ilike predicates for all postgres column types via text rendering", () => {
    const plan = buildFullTableSearchPlan({
      searchTerm: "tri",
      table: createTable(),
    });

    const textLikeColumns = plan.predicates.flatMap((predicate) =>
      predicate.kind === "text-like" ? [predicate.column] : [],
    );

    expect(textLikeColumns).toEqual([
      "name",
      "title",
      "state",
      "id",
      "is_oncall",
      "joined_at",
      "starts_at",
      "level",
      "profile",
      "bytes",
      "skills",
    ]);
  });

  it("adds typed equality predicates when the term can be parsed", () => {
    const boolPlan = buildFullTableSearchPlan({
      searchTerm: "true",
      table: createTable(),
    });
    const numericPlan = buildFullTableSearchPlan({
      searchTerm: "42",
      table: createTable(),
    });
    const uuidPlan = buildFullTableSearchPlan({
      searchTerm: "5b6a6d4e-8df9-4af9-8f64-c9e8db47f348",
      table: createTable(),
    });
    const datePlan = buildFullTableSearchPlan({
      searchTerm: "2025-01-27",
      table: createTable(),
    });
    const yearPlan = buildFullTableSearchPlan({
      searchTerm: "2025",
      table: createTable(),
    });
    const yearMonthPlan = buildFullTableSearchPlan({
      searchTerm: "2025-01",
      table: createTable(),
    });
    const dateHourPlan = buildFullTableSearchPlan({
      searchTerm: "2025-01-27T10",
      table: createTable(),
    });
    const dateMinutePlan = buildFullTableSearchPlan({
      searchTerm: "2025-01-27 10:56",
      table: createTable(),
    });
    const dateSecondPlan = buildFullTableSearchPlan({
      searchTerm: "2025-01-27T10:56:12Z",
      table: createTable(),
    });
    const dateMillisecondPlan = buildFullTableSearchPlan({
      searchTerm: "2025-01-27T10:56:12.3Z",
      table: createTable(),
    });
    const timePlan = buildFullTableSearchPlan({
      searchTerm: "10:56:12",
      table: createTable(),
    });
    const hourTimePlan = buildFullTableSearchPlan({
      searchTerm: "10",
      table: createTable(),
    });
    const hourMinuteTimePlan = buildFullTableSearchPlan({
      searchTerm: "10:56",
      table: createTable(),
    });

    expect(boolPlan.predicates).toContainEqual({
      column: "is_oncall",
      kind: "boolean-equals",
      value: true,
    });
    expect(numericPlan.predicates).toContainEqual({
      column: "level",
      kind: "numeric-equals",
      value: "42",
    });
    expect(uuidPlan.predicates).toContainEqual({
      column: "id",
      kind: "uuid-equals",
      value: "5b6a6d4e-8df9-4af9-8f64-c9e8db47f348",
    });
    expect(datePlan.predicates).toContainEqual({
      column: "joined_at",
      endExclusive: "2025-01-28T00:00:00.000Z",
      kind: "datetime-day-range",
      startInclusive: "2025-01-27T00:00:00.000Z",
    });
    expect(yearPlan.predicates).toContainEqual({
      column: "joined_at",
      endExclusive: "2026-01-01T00:00:00.000Z",
      kind: "datetime-day-range",
      startInclusive: "2025-01-01T00:00:00.000Z",
    });
    expect(yearMonthPlan.predicates).toContainEqual({
      column: "joined_at",
      endExclusive: "2025-02-01T00:00:00.000Z",
      kind: "datetime-day-range",
      startInclusive: "2025-01-01T00:00:00.000Z",
    });
    expect(dateHourPlan.predicates).toContainEqual({
      column: "joined_at",
      endExclusive: "2025-01-27T11:00:00.000Z",
      kind: "datetime-day-range",
      startInclusive: "2025-01-27T10:00:00.000Z",
    });
    expect(dateMinutePlan.predicates).toContainEqual({
      column: "joined_at",
      endExclusive: "2025-01-27T10:57:00.000Z",
      kind: "datetime-day-range",
      startInclusive: "2025-01-27T10:56:00.000Z",
    });
    expect(dateSecondPlan.predicates).toContainEqual({
      column: "joined_at",
      endExclusive: "2025-01-27T10:56:13.000Z",
      kind: "datetime-day-range",
      startInclusive: "2025-01-27T10:56:12.000Z",
    });
    expect(dateMillisecondPlan.predicates).toContainEqual({
      column: "joined_at",
      endExclusive: "2025-01-27T10:56:12.301Z",
      kind: "datetime-day-range",
      startInclusive: "2025-01-27T10:56:12.300Z",
    });
    expect(timePlan.predicates).toContainEqual({
      column: "starts_at",
      kind: "time-equals",
      value: "10:56:12",
    });
    expect(hourTimePlan.predicates).toContainEqual({
      column: "starts_at",
      kind: "time-equals",
      value: "10:00:00",
    });
    expect(hourMinuteTimePlan.predicates).toContainEqual({
      column: "starts_at",
      kind: "time-equals",
      value: "10:56:00",
    });
  });
});
