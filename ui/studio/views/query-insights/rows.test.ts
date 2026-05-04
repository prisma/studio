import { describe, expect, it } from "vitest";

import {
  buildQueryInsightsDisplayRows,
  filterQueryInsightsByTable,
  getAvailableQueryInsightTables,
  upsertQueryInsights,
  upsertQueryInsightsPauseBuffer,
} from "./rows";
import type { QueryInsightsQuery, QueryInsightsStreamQuery } from "./types";

function streamQuery(
  overrides: Partial<QueryInsightsStreamQuery> & { sql: string },
): QueryInsightsStreamQuery {
  return {
    count: 1,
    durationMs: 25,
    groupKey: null,
    maxDurationMs: null,
    minDurationMs: null,
    prismaQueryInfo: null,
    queryId: null,
    reads: 0,
    rowsReturned: 1,
    tables: ["users"],
    ts: 1_700_000_000_000,
    ...overrides,
  };
}

describe("Query Insights row helpers", () => {
  it("upserts rows by query identity and caps by last-seen recency", () => {
    const { next } = upsertQueryInsights(
      new Map(),
      [
        streamQuery({ sql: "select * from users", ts: 1 }),
        streamQuery({ sql: "select * from posts", ts: 2 }),
        streamQuery({ sql: "select * from comments", ts: 3 }),
      ],
      2,
    );

    expect(Array.from(next.keys())).toEqual([
      "select * from comments",
      "select * from posts",
    ]);

    const updated = upsertQueryInsights(
      next,
      [
        streamQuery({
          count: 4,
          durationMs: 99,
          reads: 12,
          sql: "select * from posts",
          ts: 4,
        }),
      ],
      2,
    ).next;

    expect(updated.get("select * from posts")).toMatchObject({
      count: 5,
      duration: 84.2,
      reads: 12,
      rowsReturned: 2,
    });
  });

  it("groups Prisma operations by group key and sorts aggregate rows", () => {
    const queries: QueryInsightsQuery[] = [
      {
        count: 2,
        duration: 50,
        groupKey: "User.findMany:{}",
        id: "a",
        lastSeen: 20,
        prismaQueryInfo: {
          action: "findMany",
          isRaw: false,
          model: "User",
        },
        query: "select * from users",
        reads: 10,
        rowsReturned: 2,
        tables: ["users"],
      },
      {
        count: 1,
        duration: 300,
        groupKey: "User.findMany:{}",
        id: "b",
        lastSeen: 30,
        prismaQueryInfo: {
          action: "findMany",
          isRaw: false,
          model: "User",
        },
        query: "select * from posts",
        reads: 90,
        rowsReturned: 5,
        tables: ["posts"],
      },
      {
        count: 9,
        duration: 10,
        id: "c",
        lastSeen: 10,
        query: "select * from audits",
        reads: 1,
        rowsReturned: 9,
        tables: ["audits"],
      },
    ];

    const rows = buildQueryInsightsDisplayRows(queries, {
      direction: "desc",
      field: "reads",
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.type).toBe("group");
    expect(rows[0]?.type === "group" ? rows[0].group.totalReads : 0).toBe(100);
    expect(rows[0]?.type === "group" ? rows[0].group.totalCount : 0).toBe(3);
    expect(rows[0]?.type === "group" ? rows[0].group.tables : []).toEqual([
      "posts",
      "users",
    ]);
    expect(rows[1]?.type).toBe("standalone");
  });

  it("filters table names and caps paused buffers", () => {
    const queries: QueryInsightsQuery[] = [
      {
        count: 1,
        duration: 10,
        id: "users",
        lastSeen: 1,
        query: "select * from users",
        reads: 0,
        rowsReturned: 1,
        tables: ["users"],
      },
      {
        count: 1,
        duration: 10,
        id: "posts",
        lastSeen: 2,
        query: "select * from posts",
        reads: 0,
        rowsReturned: 1,
        tables: ["posts"],
      },
    ];

    expect(getAvailableQueryInsightTables(queries)).toEqual(["posts", "users"]);
    expect(
      filterQueryInsightsByTable(queries, "posts").map((q) => q.id),
    ).toEqual(["posts"]);

    const buffer = upsertQueryInsightsPauseBuffer(
      new Map(),
      [
        streamQuery({ sql: "a", ts: 1 }),
        streamQuery({ sql: "b", ts: 2 }),
        streamQuery({ sql: "c", ts: 3 }),
      ],
      2,
    );

    expect(Array.from(buffer.keys())).toEqual(["c", "b"]);
  });
});
