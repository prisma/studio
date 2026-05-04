import { describe, expect, it } from "vitest";

import {
  analyzeDemoQueryInsight,
  appendStudioSystemQuerySuffix,
  createQueryInsightsLogEvent,
  getQueryInsightsQueryVisibility,
  isStudioSystemQuery,
  parseSqlTableNames,
  QUERY_INSIGHTS_LOG_STREAM_NAME,
  STUDIO_SYSTEM_QUERY_SUFFIX,
} from "./query-insights";

describe("ppg-dev Query Insights helpers", () => {
  it("tags and detects Studio system queries", () => {
    const tagged = appendStudioSystemQuerySuffix({
      meta: { visibility: "studio-system" },
      parameters: [],
      sql: "select * from pg_catalog.pg_class",
    });

    expect(tagged.sql).toBe(
      `select * from pg_catalog.pg_class ${STUDIO_SYSTEM_QUERY_SUFFIX}`,
    );
    expect(isStudioSystemQuery(tagged)).toBe(true);
    expect(getQueryInsightsQueryVisibility(tagged)).toBe("studio-system");
    expect(
      isStudioSystemQuery({
        meta: { visibility: "user" },
        parameters: [],
        sql: "select * from users",
      }),
    ).toBe(false);
  });

  it("extracts complete table names from common SQL statements", () => {
    expect(
      parseSqlTableNames(
        'select * from organizations join "team_members" on true',
      ),
    ).toEqual(["organizations", "team_members"]);
    expect(
      parseSqlTableNames("update public.incidents set severity = 2"),
    ).toEqual(["public.incidents"]);
    expect(parseSqlTableNames("select * from pg_catalog.pg_class")).toEqual([]);
  });

  it("builds prisma-log query events for user and Studio system queries", () => {
    const event = createQueryInsightsLogEvent({
      durationMs: 12.5,
      query: {
        parameters: [],
        sql: "select * from organizations limit 3",
      },
      rows: [{ id: 1 }, { id: 2 }],
      ts: 1_700_000_000_000,
    });

    expect(QUERY_INSIGHTS_LOG_STREAM_NAME).toBe("prisma-log");
    expect(event).toMatchObject({
      count: 1,
      durationMs: 12.5,
      rowsReturned: 2,
      sql: "select * from organizations limit 3",
      tables: ["organizations"],
      ts: 1_700_000_000_000,
      type: "query",
      visibility: "user",
    });
    const systemEvent = createQueryInsightsLogEvent({
      durationMs: 1,
      query: appendStudioSystemQuerySuffix({
        meta: { visibility: "studio-system" },
        parameters: [],
        sql: "select * from pg_catalog.pg_class",
      }),
      rows: [],
      ts: 1_700_000_000_001,
    });

    expect(systemEvent).toMatchObject({
      sql: "select * from pg_catalog.pg_class",
      type: "query",
      visibility: "studio-system",
    });
    expect(
      createQueryInsightsLogEvent({
        durationMs: 1,
        query: {
          parameters: [],
          sql: "   ",
        },
        rows: [],
      }),
    ).toBeNull();
  });

  it("returns deterministic demo analysis for broad select queries", () => {
    const result = analyzeDemoQueryInsight({
      queryStats: {
        count: 1,
        duration: 125,
        reads: 0,
        rowsReturned: 150,
      },
      rawQuery: "select * from users",
    });

    expect(result.isOptimal).toBe(false);
    expect(result.recommendations.join(" ")).toContain("LIMIT");
    expect(result.improvedSql).toContain("LIMIT 50");
  });
});
