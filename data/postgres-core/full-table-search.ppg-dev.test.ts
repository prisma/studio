import { startPrismaDevServer } from "@prisma/dev";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Adapter, Table } from "../adapter";
import { AbortError, type Executor } from "../executor";
import { createPostgresJSExecutor } from "../postgresjs";
import { createPostgresAdapter } from "./adapter";
import { FULL_TABLE_SEARCH_TIMEOUT_MESSAGE } from "./full-table-search";

type PrismaDevServer = Awaited<ReturnType<typeof startPrismaDevServer>>;

function createNeverAbortedSignal(): AbortSignal {
  const controller = new AbortController();
  return controller.signal;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }

    const timeout = setTimeout(resolve, ms);

    function onAbort() {
      clearTimeout(timeout);
      reject(new AbortError());
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createDelayedExecutor(args: {
  base: Executor;
  delayMs: number;
  delayFirstOnly?: boolean;
}): Executor {
  const { base, delayFirstOnly = false, delayMs } = args;
  let callCount = 0;

  return {
    async execute(query, options) {
      callCount += 1;

      if (!delayFirstOnly || callCount === 1) {
        try {
          await sleepWithAbort(delayMs, options?.abortSignal);
        } catch (error: unknown) {
          return [error as Error];
        }
      }

      return await base.execute(query, options);
    },
  };
}

describe("postgres-core/full-table-search (ppg-dev)", () => {
  let prismaDevServer: PrismaDevServer;
  let postgresClient: Sql;
  let table: Table;

  beforeAll(async () => {
    prismaDevServer = await startPrismaDevServer({
      name: `studio-full-table-search-${process.pid}`,
    });

    postgresClient = postgres(prismaDevServer.database.connectionString, {
      max: 1,
    });

    const setupExecutor = createPostgresJSExecutor(postgresClient);

    await setupExecutor.execute({
      parameters: [],
      sql: `
        create type "public"."member_state" as enum ('new', 'triaged', 'closed');
        create table "public"."team_members" (
          "id" uuid primary key,
          "organization_id" text not null,
          "name" text not null,
          "title" text not null,
          "skills" text[] not null,
          "is_oncall" boolean not null,
          "joined_at" timestamp not null,
          "starts_at" time not null,
          "profile" jsonb not null,
          "state" "public"."member_state" not null,
          "inet_value" inet,
          "cidr_value" cidr,
          "mac_value" macaddr,
          "mac8_value" macaddr8,
          "bit_value" bit(8),
          "varbit_value" varbit,
          "xml_value" xml,
          "tsvector_value" tsvector,
          "tsquery_value" tsquery,
          "pg_lsn_value" pg_lsn,
          "oid_value" oid,
          "regclass_value" regclass,
          "int4range_value" int4range,
          "int4multirange_value" int4multirange,
          "point_value" point,
          "line_value" line,
          "lseg_value" lseg,
          "box_value" box,
          "path_value" path,
          "polygon_value" polygon,
          "circle_value" circle,
          "bytes_value" bytea,
          "jsonpath_value" jsonpath
        );
        insert into "public"."team_members" (
          "id",
          "organization_id",
          "name",
          "title",
          "skills",
          "is_oncall",
          "joined_at",
          "starts_at",
          "profile",
          "state",
          "inet_value",
          "cidr_value",
          "mac_value",
          "mac8_value",
          "bit_value",
          "varbit_value",
          "xml_value",
          "tsvector_value",
          "tsquery_value",
          "pg_lsn_value",
          "oid_value",
          "regclass_value",
          "int4range_value",
          "int4multirange_value",
          "point_value",
          "line_value",
          "lseg_value",
          "box_value",
          "path_value",
          "polygon_value",
          "circle_value",
          "bytes_value",
          "jsonpath_value"
        ) values
          (
            '5b6a6d4e-8df9-4af9-8f64-c9e8db47f348',
            'org_triage',
            'Tristan Ops',
            'Staff Engineer',
            array['triage', 'postgres'],
            true,
            '2025-01-27 10:56:12',
            '10:56:12',
            '{"role":"triager"}',
            'triaged',
            '192.168.10.42',
            '10.42.0.0/16',
            '08:00:2b:01:02:03',
            '08:00:2b:01:02:03:04:05',
            B'10101010',
            B'101010',
            '<member><tag>triage</tag></member>',
            to_tsvector('english', 'triage responder'),
            to_tsquery('english', 'triage'),
            '0/16B6C50',
            42::oid,
            'public.team_members'::regclass,
            '[10,20)'::int4range,
            '{[10,20),[30,40)}'::int4multirange,
            point(1, 2),
            '{1,-1,0}'::line,
            '[(0,0),(1,1)]'::lseg,
            '((0,0),(1,1))'::box,
            '[(0,0),(1,1),(2,0)]'::path,
            '((0,0),(1,0),(1,1),(0,1))'::polygon,
            '<(0,0),2>'::circle,
            '\\\\x747269616765',
            '$.member.tag'
          ),
          (
            'f48ecf1b-34ed-46f5-8364-88674f11db79',
            'org_general',
            'Sam Rivera',
            'Developer',
            array['typescript', 'react'],
            false,
            '2025-01-28 11:30:00',
            '11:30:00',
            '{"role":"dev"}',
            'new',
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          );
      `,
    });

    const adapter = createPostgresAdapter({
      executor: setupExecutor,
    });
    const [introspectionError, introspection] = await adapter.introspect({});

    if (introspectionError) {
      throw introspectionError;
    }

    const introspectedTable = introspection.schemas.public?.tables.team_members;
    if (!introspectedTable) {
      throw new Error("Expected team_members table in introspection result");
    }

    table = introspectedTable;
  }, 120_000);

  afterAll(async () => {
    await postgresClient.end({ timeout: 5 });
    await prismaDevServer.close();
  });

  it("executes full-table search without type-operator errors on arrays/json", async () => {
    const adapter: Adapter = createPostgresAdapter({
      executor: createPostgresJSExecutor(postgresClient),
    });

    const [error, result] = await adapter.query(
      {
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
        table,
      },
      { abortSignal: createNeverAbortedSignal() },
    );

    expect(error).toBeNull();
    expect(result?.query.sql).toContain(
      "set_config('statement_timeout', '5000ms', true)",
    );
    expect(result?.query.sql).toContain(
      "set_config('lock_timeout', '100ms', true)",
    );
    expect(result?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Tristan Ops",
        }),
      ]),
    );
  });

  it("supports built-in postgres type families via text-rendered predicates", async () => {
    const adapter: Adapter = createPostgresAdapter({
      executor: createPostgresJSExecutor(postgresClient),
    });
    const terms = [
      "192.168.10.42",
      "10.42.0.0/16",
      "08:00:2b:01:02:03:04:05",
      "10101010",
      "0/16B6C50",
      "team_members",
      "[10,20)",
      "triage",
    ];

    for (const term of terms) {
      const [error, result] = await adapter.query(
        {
          filter: {
            after: "and",
            filters: [],
            id: "root",
            kind: "FilterGroup",
          },
          fullTableSearchTerm: term,
          pageIndex: 0,
          pageSize: 25,
          sortOrder: [],
          table,
        },
        { abortSignal: createNeverAbortedSignal() },
      );

      expect(error).toBeNull();
      const hasMatch =
        result?.rows.some((row) => row.name === "Tristan Ops") ?? false;
      if (!hasMatch) {
        throw new Error(`search term "${term}" should match Tristan Ops`);
      }
    }
  });

  it("supports partial datetime terms with optional T/Z and space separator", async () => {
    const adapter: Adapter = createPostgresAdapter({
      executor: createPostgresJSExecutor(postgresClient),
    });
    const terms = ["2025-01-27T10", "2025-01-27 10:56", "2025-01-27T10:56Z"];

    for (const term of terms) {
      const [error, result] = await adapter.query(
        {
          filter: {
            after: "and",
            filters: [],
            id: "root",
            kind: "FilterGroup",
          },
          fullTableSearchTerm: term,
          pageIndex: 0,
          pageSize: 25,
          sortOrder: [],
          table,
        },
        { abortSignal: createNeverAbortedSignal() },
      );

      expect(error).toBeNull();
      expect(result?.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Tristan Ops",
          }),
        ]),
      );
    }
  });

  it("returns a user-facing timeout error when search exceeds 5 seconds", async () => {
    const baseExecutor = createPostgresJSExecutor(postgresClient);
    const delayedExecutor = createDelayedExecutor({
      base: baseExecutor,
      delayMs: 6_000,
    });
    const adapter: Adapter = createPostgresAdapter({
      executor: delayedExecutor,
    });

    const [error] = await adapter.query(
      {
        filter: {
          after: "and",
          filters: [],
          id: "root",
          kind: "FilterGroup",
        },
        fullTableSearchTerm: "tristan",
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table,
      },
      { abortSignal: createNeverAbortedSignal() },
    );

    expect(error).toBeDefined();
    expect(error?.message).toBe(FULL_TABLE_SEARCH_TIMEOUT_MESSAGE);
  }, 20_000);

  it("allows only one active full-table search query at a time", async () => {
    const baseExecutor = createPostgresJSExecutor(postgresClient);
    const delayedFirstExecutor = createDelayedExecutor({
      base: baseExecutor,
      delayFirstOnly: true,
      delayMs: 20_000,
    });
    const adapter: Adapter = createPostgresAdapter({
      executor: delayedFirstExecutor,
    });

    const firstSearch = adapter.query(
      {
        filter: {
          after: "and",
          filters: [],
          id: "root",
          kind: "FilterGroup",
        },
        fullTableSearchTerm: "tristan",
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table,
      },
      { abortSignal: createNeverAbortedSignal() },
    );

    await sleepWithAbort(100);

    const secondSearch = adapter.query(
      {
        filter: {
          after: "and",
          filters: [],
          id: "root",
          kind: "FilterGroup",
        },
        fullTableSearchTerm: "sam",
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table,
      },
      { abortSignal: createNeverAbortedSignal() },
    );

    const [[firstError], [secondError, secondResult]] = await Promise.all([
      firstSearch,
      secondSearch,
    ]);

    expect(firstError).toBeDefined();
    expect(firstError?.name).toBe("AbortError");
    expect(secondError).toBeNull();
    expect(secondResult?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Sam Rivera",
        }),
      ]),
    );
  });
});
