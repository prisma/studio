import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import type { Table } from "../../data/adapter";
import {
  buildAiFilterPrompt,
  createEditingFilterFromAiResponse,
  parseAiFilterResponseToEditingFilter,
  resolveAiFiltering,
} from "./ai-filtering";

function createTable(): Table {
  return {
    columns: {
      calls: {
        datatype: {
          group: "numeric",
          isArray: false,
          isNative: true,
          name: "int8",
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
        name: "calls",
        nullable: false,
        pkPosition: null,
        schema: "public",
        table: "pg_stat_statements",
      },
      created_at: {
        datatype: {
          group: "datetime",
          isArray: false,
          isNative: true,
          name: "timestamptz",
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
        name: "created_at",
        nullable: true,
        pkPosition: null,
        schema: "public",
        table: "pg_stat_statements",
      },
      email: {
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
        name: "email",
        nullable: true,
        pkPosition: null,
        schema: "public",
        table: "pg_stat_statements",
      },
    },
    name: "pg_stat_statements",
    schema: "public",
  };
}

describe("ai filtering", () => {
  it("builds a prompt that includes the current timestamp, per-column operator rules, and the JSON return contract", () => {
    const prompt = buildAiFilterPrompt({
      filterOperators: ["=", "ilike", ">"],
      now: new Date("2026-03-09T08:15:30.000Z"),
      request:
        "show only rows where email contains prisma and calls is above 3",
      table: createTable(),
      timeZone: "UTC",
    });

    expect(prompt).toContain("Table: public.pg_stat_statements");
    expect(prompt).toContain(
      "- email: text (group: string; supported operators: =, ilike)",
    );
    expect(prompt).toContain(
      "- calls: int8 (group: numeric; supported operators: =, >)",
    );
    expect(prompt).toContain("Allowed operators: =, ilike, >");
    expect(prompt).toContain(
      "Current local date and time: 2026-03-09 08:15:30 (timezone: UTC)",
    );
    expect(prompt).toContain(
      "Current UTC date and time: 2026-03-09T08:15:30.000Z",
    );
    expect(prompt).toContain(
      'Return this exact top-level shape: {"filters":[...]}',
    );
    expect(prompt).toContain(
      'Operators "is" and "is not" are only valid for null checks and MUST use value null.',
    );
    expect(prompt).toContain(
      'Each filter item must be either {"kind":"column","column":"column_name","operator":"=","value":"value"} or {"kind":"sql","sql":"raw SQL WHERE clause"}.',
    );
    expect(prompt).toContain(
      'Use kind "sql" only as a fallback when the user\'s request cannot be fully expressed with the predefined column filters above.',
    );
    expect(prompt).toContain(
      "Comparison operators >, >=, <, and <= are only valid for numeric, date/time, and time columns.",
    );
    expect(prompt).toContain(
      "Text-search operators like, not like, ilike, and not ilike are only valid for text-like columns, enum columns, and text-like arrays.",
    );
    expect(prompt).toContain(
      "Resolve relative date phrases like today, yesterday, this month, and last year against the current timestamp above.",
    );
    expect(prompt).toContain(
      "User request: show only rows where email contains prisma and calls is above 3",
    );
  });

  it("parses fenced JSON responses into editing filters with coerced values", () => {
    const editingFilter = createEditingFilterFromAiResponse({
      filterOperators: ["=", "ilike", ">"],
      responseText: `\`\`\`json
{"filters":[{"kind":"column","column":"email","operator":"ilike","value":"%prisma%"},{"kind":"column","column":"calls","operator":">","value":3}]}
\`\`\``,
      table: createTable(),
    });

    expect(editingFilter.filters).toHaveLength(2);
    expect(editingFilter.filters[0]).toEqual(
      expect.objectContaining({
        column: "email",
        operator: "ilike",
        value: "%prisma%",
      }),
    );
    expect(editingFilter.filters[1]).toEqual(
      expect.objectContaining({
        column: "calls",
        operator: ">",
        value: 3,
      }),
    );
  });

  it("parses SQL fallback responses into SQL editing filters", () => {
    const editingFilter = createEditingFilterFromAiResponse({
      responseText:
        '{"filters":[{"kind":"sql","sql":"WHERE extract(year from created_at) = 2025"}]}',
      table: createTable(),
    });

    expect(editingFilter.filters).toEqual([
      expect.objectContaining({
        kind: "SqlFilter",
        sql: "WHERE extract(year from created_at) = 2025",
      }),
    ]);
  });

  it("preserves syntactically invalid AI filters so the UI can show them and retry", () => {
    const result = parseAiFilterResponseToEditingFilter({
      filterOperators: ["=", "is", "ilike"],
      responseText:
        '{"filters":[{"column":"email","operator":"ilike","value":"%prisma%"},{"column":"calls","operator":"is","value":3}]}',
      table: createTable(),
    });

    expect(result.filterGroup.filters).toHaveLength(2);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "invalid-filter-syntax",
        column: "calls",
        operator: "is",
        value: "3",
      }),
    ]);
    expect(result.filterGroup.filters[1]).toEqual(
      expect.objectContaining({
        column: "calls",
        draftValue: "3",
        operator: "is",
        value: "3",
      }),
    );
  });

  it("retries once with the original request, previous response, and validation issues when AI returns invalid filters", async () => {
    const aiFilter = vi
      .fn<(input: string) => Promise<string>>()
      .mockResolvedValueOnce(
        '{"filters":[{"kind":"column","column":"created_at","operator":"is","value":"2025-01-01T00:00:00.000Z"}]}',
      )
      .mockResolvedValueOnce(
        '{"filters":[{"kind":"column","column":"created_at","operator":">=","value":"2025-01-01T00:00:00.000Z"}]}',
      );

    const result = await resolveAiFiltering({
      aiFilter,
      filterOperators: ["=", ">=", "is"],
      now: new Date("2026-03-09T08:15:30.000Z"),
      request: "created last year",
      table: createTable(),
      timeZone: "UTC",
    });

    expect(aiFilter).toHaveBeenCalledTimes(2);
    expect(aiFilter.mock.calls[1]?.[0]).toContain(
      "Original user request: created last year",
    );
    expect(aiFilter.mock.calls[1]?.[0]).toContain(
      'Previous response: {"filters":[{"kind":"column","column":"created_at","operator":"is","value":"2025-01-01T00:00:00.000Z"}]}',
    );
    expect(aiFilter.mock.calls[1]?.[0]).toContain(
      '"is" only supports null checks. Use value "null".',
    );
    expect(result.didRetry).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.filterGroup.filters).toEqual([
      expect.objectContaining({
        aiSource: {
          query: "created last year",
        },
        column: "created_at",
        operator: ">=",
        value: "2025-01-01T00:00:00.000Z",
      }),
    ]);
  });

  it("stops after one retry and returns the invalid filters for warning-pill rendering", async () => {
    const aiFilter = vi
      .fn<(input: string) => Promise<string>>()
      .mockResolvedValue(
        '{"filters":[{"kind":"column","column":"calls","operator":"is","value":3}]}',
      );

    const result = await resolveAiFiltering({
      aiFilter,
      filterOperators: ["=", "is"],
      request: "calls is 3",
      table: createTable(),
    });

    expect(aiFilter).toHaveBeenCalledTimes(2);
    expect(result.didRetry).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "invalid-filter-syntax",
        column: "calls",
        operator: "is",
        value: "3",
      }),
    ]);
    expect(result.filterGroup.filters).toEqual([
      expect.objectContaining({
        aiSource: {
          query: "calls is 3",
        },
        column: "calls",
        draftValue: "3",
        operator: "is",
      }),
    ]);
  });

  it("throws when the AI response does not contain any valid filters", () => {
    expect(() =>
      createEditingFilterFromAiResponse({
        filterOperators: ["="],
        responseText:
          '{"filters":[{"column":"missing","operator":"=","value":"abba"}]}',
        table: createTable(),
      }),
    ).toThrow("Use one of the listed columns.");
  });
});
