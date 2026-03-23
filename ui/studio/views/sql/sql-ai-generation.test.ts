import { describe, expect, it, vi } from "vitest";

import type { AdapterIntrospectResult } from "@/data";

import {
  buildAiSqlGenerationPrompt,
  buildAiSqlGenerationContext,
  resolveAiSqlGeneration,
} from "./sql-ai-generation";

function createIntrospectionFixture(): AdapterIntrospectResult {
  return {
    filterOperators: [],
    query: { parameters: [], sql: "select 1" },
    timezone: "UTC",
    schemas: {
      public: {
        name: "public",
        tables: {
          organizations: {
            columns: {
              id: {
                datatype: {
                  group: "string",
                  isArray: false,
                  isNative: true,
                  name: "uuid",
                  options: [],
                  schema: "pg_catalog",
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
                table: "organizations",
              },
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
                nullable: true,
                pkPosition: null,
                schema: "public",
                table: "organizations",
              },
            },
            name: "organizations",
            schema: "public",
          },
          incidents: {
            columns: {},
            name: "incidents",
            schema: "public",
          },
        },
      },
    },
  };
}

describe("sql-ai-generation", () => {
  it("bounds SQL generation schema context before prompting the model", () => {
    const context = buildAiSqlGenerationContext({
      activeSchema: "public",
      dialect: "postgresql",
      introspection: createIntrospectionFixture(),
      maxColumnsPerTable: 1,
      maxTables: 1,
    });

    expect(context.tables).toHaveLength(1);
    expect(context.tables[0]?.columns).toHaveLength(1);
  });

  it("includes the concrete database engine in the SQL generation prompt", () => {
    const prompt = buildAiSqlGenerationPrompt({
      context: buildAiSqlGenerationContext({
        activeSchema: "public",
        dialect: "postgresql",
        introspection: createIntrospectionFixture(),
      }),
      now: new Date("2026-03-18T00:00:00.000Z"),
      request: "show me organizations",
    });

    expect(prompt).toContain("Database engine: PostgreSQL");
    expect(prompt).toContain("Use only functions, operators, and casts supported by PostgreSQL.");
    expect(prompt).toContain('"shouldGenerateVisualization":true');
    expect(prompt).toContain("Decide whether the resulting dataset would make an interesting chart.");
  });

  it("retries once when the AI response is not valid JSON and then returns parsed SQL", async () => {
    const aiGenerateSql = vi
      .fn<(prompt: string) => Promise<string>>()
      .mockResolvedValueOnce("select * from public.organizations;")
      .mockResolvedValueOnce(
        JSON.stringify({
          rationale: "Matched the organizations table.",
          sql: "select * from public.organizations limit 5;",
          shouldGenerateVisualization: true,
        }),
      );

    const result = await resolveAiSqlGeneration({
      activeSchema: "public",
      requestAiSqlGeneration: aiGenerateSql,
      dialect: "postgresql",
      introspection: createIntrospectionFixture(),
      request: "show me organizations",
    });

    expect(aiGenerateSql).toHaveBeenCalledTimes(2);
    expect(result.didRetry).toBe(true);
    expect(result.sql).toBe("select * from public.organizations limit 5;");
    expect(result.rationale).toBe("Matched the organizations table.");
    expect(result.shouldGenerateVisualization).toBe(true);
  });

  it("accepts JSON wrapped in markdown fences without requiring a retry", async () => {
    const aiGenerateSql = vi
      .fn<(prompt: string) => Promise<string>>()
      .mockResolvedValue(
        [
          "```json",
          JSON.stringify({
            rationale: "Matched the organizations table.",
            sql: "select * from public.organizations limit 5;",
            shouldGenerateVisualization: false,
          }),
          "```",
        ].join("\n"),
      );

    const result = await resolveAiSqlGeneration({
      activeSchema: "public",
      requestAiSqlGeneration: aiGenerateSql,
      dialect: "postgresql",
      introspection: createIntrospectionFixture(),
      request: "show me organizations",
    });

    expect(aiGenerateSql).toHaveBeenCalledTimes(1);
    expect(result.didRetry).toBe(false);
    expect(result.sql).toBe("select * from public.organizations limit 5;");
    expect(result.rationale).toBe("Matched the organizations table.");
    expect(result.shouldGenerateVisualization).toBe(false);
  });

  it("returns visualization intent with the generated SQL without executing it", async () => {
    const aiGenerateSql = vi
      .fn<(prompt: string) => Promise<string>>()
      .mockResolvedValue(
        JSON.stringify({
          rationale: "Counts by organization chart well.",
          sql: "select id, name from public.organizations limit 5;",
          shouldGenerateVisualization: true,
        }),
      );

    const result = await resolveAiSqlGeneration({
      activeSchema: "public",
      requestAiSqlGeneration: aiGenerateSql,
      dialect: "postgresql",
      introspection: createIntrospectionFixture(),
      request: "show me organizations",
    });

    expect(aiGenerateSql).toHaveBeenCalledTimes(1);
    expect(result.sql).toBe("select id, name from public.organizations limit 5;");
    expect(result.rationale).toBe("Counts by organization chart well.");
    expect(result.shouldGenerateVisualization).toBe(true);
  });
});
