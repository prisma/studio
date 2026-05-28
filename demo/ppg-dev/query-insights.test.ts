import { describe, expect, it } from "vitest";

import { asQuery } from "../../data/query";
import { createDemoQueryInsightsStore } from "./query-insights";

describe("createDemoQueryInsightsStore", () => {
  it("aggregates successful BFF query executions into query-insights snapshots", () => {
    let now = 1_779_963_000_000;
    const store = createDemoQueryInsightsStore({
      now: () => now,
    });

    store.record({
      durationMs: 12,
      query: asQuery("select * from public.users where id = $1"),
      result: [{ id: "user-1" }],
    });
    now += 100;
    store.record({
      durationMs: 24,
      query: asQuery("select * from public.users where id = $1"),
      result: [{ id: "user-2" }, { id: "user-3" }],
    });

    const snapshot = store.getSnapshot({ limit: 10 });

    expect(snapshot.queries).toEqual([
      expect.objectContaining({
        count: 2,
        duration: 18,
        lastSeen: 1_779_963_000_100,
        query: "select * from public.users where id = $1",
        reads: 3,
        rowsReturned: 3,
        tables: ["public.users"],
      }),
    ]);
  });

  it("skips Studio metadata and lint queries so the demo surface stays focused", () => {
    const store = createDemoQueryInsightsStore({
      now: () => 1_779_963_000_000,
    });

    store.record({
      durationMs: 3,
      query: asQuery("select * from information_schema.tables"),
      result: [{ table_name: "users" }],
    });
    store.record({
      durationMs: 3,
      query: asQuery("EXPLAIN select * from users"),
      result: [],
    });
    store.record({
      durationMs: 3,
      query: asQuery("select current_setting('timezone') as \"timezone\""),
      result: [{ timezone: "UTC" }],
    });

    expect(store.getSnapshot({}).queries).toEqual([]);
  });

  it("extracts real tables from Studio grid queries without including CTE names", () => {
    const store = createDemoQueryInsightsStore({
      now: () => 1_779_963_000_000,
    });

    store.record({
      durationMs: 3,
      query: asQuery(
        'with "__ps_agg__" as (select count(*) from "public"."organizations") select "__ps_agg__".count, "id" from "public"."organizations" inner join "__ps_agg__" on true limit $1',
      ),
      result: [{ id: "org_acme" }],
    });

    expect(store.getSnapshot({}).queries[0]).toEqual(
      expect.objectContaining({
        tables: ["public.organizations"],
      }),
    );
  });
});
