import { describe, expect, it } from "vitest";

import {
  createChartTicksFromQueries,
  safeDecodeChartTickEvent,
  safeDecodePrismaLogDataEvent,
  safeDecodeQueriesEvent,
} from "./codecs";

describe("Query Insights stream codecs", () => {
  it("decodes query and chart events with Prisma metadata", () => {
    const queries = safeDecodeQueriesEvent(
      JSON.stringify([
        {
          count: 2,
          durationMs: 12.5,
          groupKey: "User.findMany:{}",
          maxDurationMs: 20,
          minDurationMs: 10,
          prismaQueryInfo: {
            action: "findMany",
            isRaw: false,
            model: "User",
            payload: { select: { id: true } },
          },
          queryId: "query-1",
          reads: 8,
          rowsReturned: 2,
          sql: "select id from users",
          tables: ["users"],
          ts: 1_700_000_000_000,
          visibility: "user",
        },
      ]),
    );
    const chartTick = safeDecodeChartTickEvent(
      JSON.stringify({
        avgDurationMs: 12.5,
        queryCount: 2,
        ts: 1_700_000_000_000,
      }),
    );

    expect(queries.success).toBe(true);
    expect(queries.data?.[0]).toMatchObject({
      count: 2,
      prismaQueryInfo: {
        action: "findMany",
        model: "User",
      },
      queryId: "query-1",
      visibility: "user",
    });
    expect(chartTick).toEqual({
      data: {
        avgDurationMs: 12.5,
        queryCount: 2,
        ts: 1_700_000_000_000,
      },
      success: true,
    });
  });

  it("rejects malformed events without throwing", () => {
    const decoded = safeDecodeQueriesEvent(
      JSON.stringify([{ count: 0, sql: "select 1" }]),
    );

    expect(decoded.success).toBe(false);
    expect(decoded.error?.message).toContain("durationMs");
  });

  it("decodes prisma-log stream data events and derives bucketed chart ticks", () => {
    const decoded = safeDecodePrismaLogDataEvent(
      JSON.stringify([
        {
          count: 1,
          durationMs: 20,
          groupKey: null,
          maxDurationMs: 20,
          minDurationMs: 20,
          prismaQueryInfo: null,
          queryId: null,
          reads: 0,
          rowsReturned: 3,
          sql: "select * from organizations",
          tables: ["organizations"],
          ts: 1_700_000_000_100,
          type: "query",
          visibility: "studio-system",
        },
        {
          count: 2,
          durationMs: 10,
          groupKey: null,
          maxDurationMs: 10,
          minDurationMs: 10,
          prismaQueryInfo: null,
          queryId: null,
          reads: 0,
          rowsReturned: 6,
          sql: "select * from organizations",
          tables: ["organizations"],
          ts: 1_700_000_000_700,
          type: "query",
        },
        {
          count: 1,
          durationMs: 30,
          groupKey: null,
          maxDurationMs: 30,
          minDurationMs: 30,
          prismaQueryInfo: null,
          queryId: null,
          reads: 0,
          rowsReturned: 1,
          sql: "select * from all_data_types",
          tables: ["all_data_types"],
          ts: 1_700_000_001_300,
          type: "query",
        },
        {
          type: "heartbeat",
        },
      ]),
    );

    expect(decoded.success).toBe(true);
    expect(decoded.data).toHaveLength(3);
    expect(decoded.data?.[0]?.visibility).toBe("studio-system");
    expect(createChartTicksFromQueries(decoded.data ?? [])).toEqual([
      {
        avgDurationMs: 40 / 3,
        queryCount: 3,
        ts: 1_700_000_000_000,
      },
      {
        avgDurationMs: 30,
        queryCount: 1,
        ts: 1_700_000_001_000,
      },
    ]);
  });
});
