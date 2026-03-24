import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import type { Table } from "../adapter";
import type { Executor } from "../executor";
import { createPGLiteExecutor } from "../pglite";
import type { Query } from "../query";
import type { BigIntString } from "../type-utils";
import { mockIntrospect } from "./adapter";
import {
  getDeleteQuery,
  getInsertQuery,
  getSelectQuery,
  getUpdateQuery,
  mockSelectQuery,
} from "./dml";

describe("postgres-core/dml", () => {
  let executor: Executor;
  let introspection: ReturnType<typeof mockIntrospect>;
  let pglite: PGlite;
  let table: Table;

  beforeAll(async () => {
    vi.useFakeTimers({
      now: new Date("2025-01-27T00:56:12.345+02:00"),
    });
    pglite = new PGlite();
    executor = createPGLiteExecutor(pglite);
    introspection = mockIntrospect();
    table = introspection.schemas.public.tables.users;

    await pglite.exec(`
        create schema "zoo";
        create table "zoo"."animals" ("id" serial primary key, "name" text);
        insert into "zoo"."animals" DEFAULT VALUES;
        create table "public"."users" (
          "id" serial primary key,
          "created_at" timestamp default now(),
          "deleted_at" timestamp,
          "role" varchar,
          "name" varchar,
          "name_role" text GENERATED ALWAYS AS (("name" || ' - ' || "role")) STORED
        );
        insert into "public"."users" DEFAULT VALUES;
        insert into "public"."users" ("created_at")
        select now() - interval '1 hour' * generate_series(0, 8);
        create table "public"."composite_pk" (
          "id" uuid default gen_random_uuid(),
          "name" text,
          "created_at" timestamp default now(),
          primary key ("id", "name")
        );
        insert into "public"."composite_pk" ("id", "name") values ('c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b', 'test1'), ('f3d9e2c0-7b3a-4e6f-8c6d-9e2a1b3c4d5e', 'test2'), (default, 'test3');
        create type "public"."search_state" as enum ('new', 'triaged', 'closed');
        create table "public"."search_types" (
          "id" text primary key,
          "str_col" text,
          "dt_col" timestamp,
          "bool_col" boolean,
          "enum_col" "public"."search_state",
          "time_col" time,
          "raw_col" bytea,
          "num_col" integer,
          "json_col" jsonb,
          "arr_col" text[]
        );
        insert into "public"."search_types" (
          "id",
          "str_col",
          "dt_col",
          "bool_col",
          "enum_col",
          "time_col",
          "raw_col",
          "num_col",
          "json_col",
          "arr_col"
        ) values (
          'row_tr',
          'triage target',
          '2025-01-27 10:56:12.345',
          true,
          'triaged',
          '10:56:12',
          '\\\\x7472',
          42,
          '{"status":"triaged"}',
          array['triage','ops']
        );
        create type "public"."studio_role" as enum ('ADMIN', 'MANAGE', 'VISIT');
        create table "public"."enum_array_users" (
          "id" serial primary key,
          "roles" "public"."studio_role"[] not null default array['VISIT']::"public"."studio_role"[]
        );
        insert into "public"."enum_array_users" ("roles")
        values (array['ADMIN', 'VISIT']::"public"."studio_role"[]);
    `);
  });

  afterAll(async () => {
    await pglite.close();
  });

  function createSearchTypesTable(): Table {
    return {
      columns: {
        id: {
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
          isRequired: true,
          name: "id",
          nullable: false,
          pkPosition: 1,
          schema: "public",
          table: "search_types",
        },
        str_col: {
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
          name: "str_col",
          nullable: true,
          pkPosition: null,
          schema: "public",
          table: "search_types",
        },
        dt_col: {
          datatype: {
            format: "yyyy-MM-dd HH:mm:ss.SSS",
            group: "datetime",
            isArray: false,
            isNative: true,
            name: "timestamp",
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
          name: "dt_col",
          nullable: true,
          pkPosition: null,
          schema: "public",
          table: "search_types",
        },
        bool_col: {
          datatype: {
            group: "boolean",
            isArray: false,
            isNative: true,
            name: "bool",
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
          name: "bool_col",
          nullable: true,
          pkPosition: null,
          schema: "public",
          table: "search_types",
        },
        enum_col: {
          datatype: {
            group: "enum",
            isArray: false,
            isNative: false,
            name: "search_state",
            options: ["new", "triaged", "closed"],
            schema: "public",
          },
          defaultValue: null,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: false,
          name: "enum_col",
          nullable: true,
          pkPosition: null,
          schema: "public",
          table: "search_types",
        },
        time_col: {
          datatype: {
            format: "HH:mm:ss.SSS",
            group: "time",
            isArray: false,
            isNative: true,
            name: "time",
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
          name: "time_col",
          nullable: true,
          pkPosition: null,
          schema: "public",
          table: "search_types",
        },
        raw_col: {
          datatype: {
            group: "raw",
            isArray: false,
            isNative: true,
            name: "bytea",
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
          name: "raw_col",
          nullable: true,
          pkPosition: null,
          schema: "public",
          table: "search_types",
        },
        num_col: {
          datatype: {
            group: "numeric",
            isArray: false,
            isNative: true,
            name: "int4",
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
          name: "num_col",
          nullable: true,
          pkPosition: null,
          schema: "public",
          table: "search_types",
        },
        json_col: {
          datatype: {
            group: "json",
            isArray: false,
            isNative: true,
            name: "jsonb",
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
          name: "json_col",
          nullable: true,
          pkPosition: null,
          schema: "public",
          table: "search_types",
        },
        arr_col: {
          datatype: {
            group: "string",
            isArray: true,
            isNative: true,
            name: "text[]",
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
          name: "arr_col",
          nullable: true,
          pkPosition: null,
          schema: "public",
          table: "search_types",
        },
      },
      name: "search_types",
      schema: "public",
    };
  }

  function createEnumArrayUsersTable(): Table {
    return {
      columns: {
        id: {
          datatype: {
            group: "numeric",
            isArray: false,
            isNative: true,
            name: "int4",
            options: [],
            schema: "pg_catalog",
          },
          defaultValue: "nextval('enum_array_users_id_seq'::regclass)",
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: true,
          isComputed: false,
          isRequired: true,
          name: "id",
          nullable: false,
          pkPosition: 1,
          schema: "public",
          table: "enum_array_users",
        },
        roles: {
          datatype: {
            group: "enum",
            isArray: true,
            isNative: false,
            name: "studio_role[]",
            options: ["ADMIN", "MANAGE", "VISIT"],
            schema: "public",
          },
          defaultValue: `ARRAY['VISIT'::"public"."studio_role"]`,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: true,
          name: "roles",
          nullable: false,
          pkPosition: null,
          schema: "public",
          table: "enum_array_users",
        },
      },
      name: "enum_array_users",
      schema: "public",
    };
  }

  describe("getSelectQuery", () => {
    it("supports ilike search filters for mixed scalar, enum, json, raw, and array columns", async () => {
      const table = createSearchTypesTable();
      const query = getSelectQuery({
        filter: {
          after: "and",
          filters: [
            {
              after: "or",
              column: "id",
              id: "f-id",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
            {
              after: "or",
              column: "str_col",
              id: "f-str",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
            {
              after: "or",
              column: "dt_col",
              id: "f-dt",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
            {
              after: "or",
              column: "bool_col",
              id: "f-bool",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
            {
              after: "or",
              column: "enum_col",
              id: "f-enum",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
            {
              after: "or",
              column: "time_col",
              id: "f-time",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
            {
              after: "or",
              column: "raw_col",
              id: "f-raw",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
            {
              after: "or",
              column: "num_col",
              id: "f-num",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
            {
              after: "or",
              column: "json_col",
              id: "f-json",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
            {
              after: "and",
              column: "arr_col",
              id: "f-arr",
              kind: "ColumnFilter",
              operator: "ilike",
              value: "%tr%",
            },
          ],
          id: "search-root",
          kind: "FilterGroup",
        },
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table,
      });

      const [error, rows] = await executor.execute(query);

      expect(error).toBeNull();
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "row_tr",
          }),
        ]),
      );
    });

    it("should return a query object", () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            25,
          ],
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "public"."users" where true) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "public"."users" inner join "__ps_agg__" on true where true limit $1 offset 0",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information with `ctid`", () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table,
      });

      expectTypeOf(query).toEqualTypeOf<
        Query<{ [x: string]: unknown; __ps_count__: BigIntString }>
      >();
    });

    it("should return a query object that can be executed against a PostgreSQL-compatible database", async () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table,
      });

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T22:56:12.345Z,
            "deleted_at": null,
            "id": 1,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T22:56:12.345Z,
            "deleted_at": null,
            "id": 2,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T21:56:12.345Z,
            "deleted_at": null,
            "id": 3,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T20:56:12.345Z,
            "deleted_at": null,
            "id": 4,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T19:56:12.345Z,
            "deleted_at": null,
            "id": 5,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T18:56:12.345Z,
            "deleted_at": null,
            "id": 6,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T17:56:12.345Z,
            "deleted_at": null,
            "id": 7,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T16:56:12.345Z,
            "deleted_at": null,
            "id": 8,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T15:56:12.345Z,
            "deleted_at": null,
            "id": 9,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T14:56:12.345Z,
            "deleted_at": null,
            "id": 10,
            "name": null,
            "name_role": null,
            "role": null,
          },
        ]
      `);
    });

    it("should enable querying tables in non-public schemas", async () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table: {
          columns: {
            id: {
              datatype: {
                group: "raw",
                isArray: false,
                isNative: true,
                name: "int4",
                options: [],
                schema: "pg_catalog",
              },
              defaultValue: null,
              isAutoincrement: false,
              isComputed: false,
              isRequired: true,
              name: "id",
              nullable: false,
              pkPosition: 1,
              schema: "zoo",
              table: "animals",
              fkColumn: null,
              fkSchema: null,
              fkTable: null,
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
              isAutoincrement: false,
              isComputed: false,
              isRequired: false,
              name: "name",
              nullable: true,
              pkPosition: null,
              schema: "zoo",
              table: "animals",
              fkColumn: null,
              fkSchema: null,
              fkTable: null,
            },
          },
          schema: "zoo",
          name: "animals",
        },
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            25,
          ],
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "zoo"."animals" where true) select "__ps_agg__"."__ps_count__", "id", "name" from "zoo"."animals" inner join "__ps_agg__" on true where true limit $1 offset 0",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_count__": "1",
            "id": 1,
            "name": null,
          },
        ]
      `);
    });

    it("should return a query object that translates pagination details correctly", async () => {
      const query = getSelectQuery({
        pageIndex: 1,
        pageSize: 2,
        sortOrder: [],
        table,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            2,
          ],
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "public"."users" where true) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "public"."users" inner join "__ps_agg__" on true where true limit $1 offset 2",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T21:56:12.345Z,
            "deleted_at": null,
            "id": 3,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T20:56:12.345Z,
            "deleted_at": null,
            "id": 4,
            "name": null,
            "name_role": null,
            "role": null,
          },
        ]
      `);
    });

    it("should return a query object that translates sort order details correctly", async () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 4,
        sortOrder: [
          { column: "created_at", direction: "desc" },
          { column: "id", direction: "asc" },
        ],
        table,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            4,
          ],
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "public"."users" where true) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "public"."users" inner join "__ps_agg__" on true where true order by "created_at" desc, cast("id" as numeric) asc limit $1 offset 0",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T22:56:12.345Z,
            "deleted_at": null,
            "id": 1,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T22:56:12.345Z,
            "deleted_at": null,
            "id": 2,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T21:56:12.345Z,
            "deleted_at": null,
            "id": 3,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T20:56:12.345Z,
            "deleted_at": null,
            "id": 4,
            "name": null,
            "name_role": null,
            "role": null,
          },
        ]
      `);
    });

    it("orders numeric columns with numeric casting", () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 4,
        sortOrder: [{ column: "id", direction: "asc" }],
        table,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            4,
          ],
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "public"."users" where true) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "public"."users" inner join "__ps_agg__" on true where true order by cast("id" as numeric) asc limit $1 offset 0",
          "transformations": undefined,
        }
      `);
    });

    it("should return a query object that applies a single filter group with AND condition", async () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 10,
        sortOrder: [],
        table,
        filter: {
          kind: "FilterGroup",
          filters: [
            {
              kind: "ColumnFilter",
              column: "role",
              operator: "=",
              value: "admin",
              after: "and",
              id: "",
            },
            {
              kind: "ColumnFilter",
              column: "deleted_at",
              operator: "is",
              value: null,
              after: "or",
              id: "",
            },
          ],
          id: "",
          after: "or",
        },
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "admin",
            "admin",
            10,
          ],
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "public"."users" where ("role" = $1 and "deleted_at" is null)) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "public"."users" inner join "__ps_agg__" on true where ("role" = $2 and "deleted_at" is null) limit $3 offset 0",
          "transformations": undefined,
        }
      `);

      const [error] = await executor.execute(query);

      expect(error).toBeNull();
    });

    it("should return a query object that applies a single filter group with OR condition", async () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 10,
        sortOrder: [],
        table,
        filter: {
          kind: "FilterGroup",
          filters: [
            {
              kind: "ColumnFilter",
              column: "role",
              operator: "=",
              value: "admin",
              after: "or",
              id: "",
            },
            {
              kind: "ColumnFilter",
              column: "role",
              operator: "=",
              value: "user",
              after: "and",
              id: "",
            },
          ],
          id: "",
          after: "and",
        },
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "admin",
            "user",
            "admin",
            "user",
            10,
          ],
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "public"."users" where ("role" = $1 or "role" = $2)) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "public"."users" inner join "__ps_agg__" on true where ("role" = $3 or "role" = $4) limit $5 offset 0",
          "transformations": undefined,
        }
      `);

      const [error] = await executor.execute(query);

      expect(error).toBeNull();
    });

    it("should return a query object that applies a raw SQL filter clause", async () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 10,
        sortOrder: [],
        table,
        filter: {
          kind: "FilterGroup",
          filters: [
            {
              kind: "SqlFilter",
              sql: `WHERE "deleted_at" is null`,
              after: "and",
              id: "",
            },
          ],
          id: "",
          after: "and",
        },
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            10,
          ],
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "public"."users" where ("deleted_at" is null)) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "public"."users" inner join "__ps_agg__" on true where ("deleted_at" is null) limit $1 offset 0",
          "transformations": undefined,
        }
      `);

      const [error] = await executor.execute(query);

      expect(error).toBeNull();
    });

    it("should return a query object that applies nested filter groups", async () => {
      const query = getSelectQuery({
        pageIndex: 0,
        pageSize: 10,
        sortOrder: [],
        table,
        filter: {
          kind: "FilterGroup",
          filters: [
            {
              kind: "FilterGroup",
              filters: [
                {
                  kind: "ColumnFilter",
                  column: "role",
                  operator: "=",
                  value: "1",
                  after: "or",
                  id: "",
                },
                {
                  kind: "ColumnFilter",
                  column: "role",
                  operator: "=",
                  value: "2",
                  after: "and",
                  id: "",
                },
                {
                  kind: "ColumnFilter",
                  column: "role",
                  operator: "=",
                  value: "3",
                  after: "or",
                  id: "",
                },
                {
                  kind: "ColumnFilter",
                  column: "role",
                  operator: "=",
                  value: "4",
                  after: "or",
                  id: "",
                },
              ],
              id: "",
              after: "and",
            },
            {
              kind: "ColumnFilter",
              column: "deleted_at",
              operator: "is",
              value: null,
              after: "and",
              id: "",
            },
          ],
          id: "",
          after: "and",
        },
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "1",
            "2",
            "3",
            "4",
            "1",
            "2",
            "3",
            "4",
            10,
          ],
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "public"."users" where (("role" = $1 or ("role" = $2 and "role" = $3) or "role" = $4) and "deleted_at" is null)) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "public"."users" inner join "__ps_agg__" on true where (("role" = $5 or ("role" = $6 and "role" = $7) or "role" = $8) and "deleted_at" is null) limit $9 offset 0",
          "transformations": undefined,
        }
      `);

      const [error] = await executor.execute(query);

      expect(error).toBeNull();
    });
  });

  describe("getInsertQuery", () => {
    let query: ReturnType<typeof getInsertQuery>;

    beforeAll(() => {
      query = getInsertQuery({
        table,
        rows: [{ created_at: new Date("2025-01-26T21:56:12.345Z") }],
      });
    });

    it("should return a query object", () => {
      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            2025-01-26T21:56:12.345Z,
            1000,
          ],
          "sql": "insert into "public"."users" ("created_at") values ($1) returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(floor(extract(epoch from now()) * $2) as text) as "__ps_inserted_at__"",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds basic type information", () => {
      expectTypeOf(query).toEqualTypeOf<
        Query<{ [x: string]: unknown } & { __ps_inserted_at__: BigIntString }>
      >();
    });

    it("should return a query object that can be executed against a PostgreSQL-compatible database", async () => {
      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_inserted_at__": "1737932172345",
            "created_at": 2025-01-26T21:56:12.345Z,
            "deleted_at": null,
            "id": 11,
            "name": null,
            "name_role": null,
            "role": null,
          },
        ]
      `);
    });

    it("should handle empty rows gracefully", async () => {
      const query = getInsertQuery({
        table,
        rows: [{}, { name: "John Doe" }],
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "John Doe",
            1000,
          ],
          "sql": "insert into "public"."users" ("id", "name") values (default, default), (default, $1) returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(floor(extract(epoch from now()) * $2) as text) as "__ps_inserted_at__"",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_inserted_at__": "1737932172345",
            "created_at": 2025-01-26T22:56:12.345Z,
            "deleted_at": null,
            "id": 12,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_inserted_at__": "1737932172345",
            "created_at": 2025-01-26T22:56:12.345Z,
            "deleted_at": null,
            "id": 13,
            "name": "John Doe",
            "name_role": null,
            "role": null,
          },
        ]
      `);
    });
  });

  describe("getUpdateQuery", () => {
    let query: ReturnType<typeof getUpdateQuery>;

    beforeAll(() => {
      query = getUpdateQuery({
        changes: { deleted_at: "2025-01-26T21:56:12.345Z" } satisfies Partial<
          Record<keyof ReturnType<typeof mockSelectQuery>[0], unknown>
        >,
        row: mockSelectQuery()[0],
        table,
      });
    });

    it("should return a query object", () => {
      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "2025-01-26T21:56:12.345Z",
            1,
            1000,
          ],
          "sql": "update "public"."users" set "deleted_at" = $1 where "id" = $2 returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(floor(extract(epoch from now()) * $3) as text) as "__ps_updated_at__"",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information with `ctid`", () => {
      expectTypeOf(query).toEqualTypeOf<
        Query<{ [x: string]: unknown; __ps_updated_at__: BigIntString }>
      >();
    });

    it("should return a query object that can be executed against a PostgreSQL-compatible database", async () => {
      const [, users] = await executor.execute(
        getSelectQuery({ pageIndex: 0, pageSize: 1, sortOrder: [], table }),
      );

      const [user] = users!;

      const query = getUpdateQuery({
        changes: { deleted_at: "2025-01-26T21:56:12.345Z" } satisfies Partial<
          Record<keyof ReturnType<typeof mockSelectQuery>[0], unknown>
        >,
        row: user!,
        table,
      });

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();

      const { __ps_count__, ...userWithoutCount } = user!;

      expect(results).toStrictEqual([
        {
          ...userWithoutCount,
          deleted_at: new Date("2025-01-26T21:56:12.345Z"),
          __ps_updated_at__: "1737932172345",
        },
      ]);
    });

    it("casts PostgreSQL enum arrays with the array suffix outside the quoted user-defined type name", async () => {
      const table = createEnumArrayUsersTable();
      const query = getUpdateQuery({
        changes: { roles: "{ADMIN,MANAGE}" },
        row: { id: 1 },
        table,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "{ADMIN,MANAGE}",
            1,
            1000,
          ],
          "sql": "update "public"."enum_array_users" set "roles" = cast($1 as "public"."studio_role"[]) where "id" = $2 returning "id", "roles", cast(floor(extract(epoch from now()) * $3) as text) as "__ps_updated_at__"",
          "transformations": undefined,
        }
      `);

      const [error] = await executor.execute(query);

      expect(error).toBeNull();

      const persisted = await pglite.query<{ roles: string }>(`
        select "roles"::text as "roles"
        from "public"."enum_array_users"
        where "id" = 1
      `);

      expect(persisted.rows).toEqual([{ roles: "{ADMIN,MANAGE}" }]);
    });
  });

  describe("getDeleteQuery", () => {
    let query: ReturnType<typeof getDeleteQuery>;
    let rows: Record<string, unknown>[];

    beforeAll(async () => {
      const insertQuery = {
        parameters: [
          new Date("2025-01-26T21:56:12.345Z"),
          new Date("2025-01-26T21:56:12.346Z"),
        ],
        sql: `
          insert into "public"."users" ("created_at")
          values ($1), ($2)
          returning "id", "created_at", "deleted_at", "role", "name"`,
        transformations: undefined,
      } as Query<Record<string, unknown>>;

      const [, rowsToDelete] = await executor.execute(insertQuery);

      rows = rowsToDelete!;

      query = getDeleteQuery({ rows, table });
    });

    it("should return a query object: simple primary key, multiple rows", () => {
      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            14,
            15,
            1000,
          ],
          "sql": "delete from "public"."users" where "id" in ($1, $2) returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(floor(extract(epoch from now()) * $3) as text) as "__ps_deleted_at__"",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information", () => {
      expectTypeOf(query).toEqualTypeOf<
        Query<{ [x: string]: unknown; __ps_deleted_at__: BigIntString }>
      >();
    });

    it("should delete the row from the database", async () => {
      const [error] = await executor.execute(query);

      expect(error).toBeNull();
    });

    it("should return a query object: simple primary key, single row", () => {
      const query = getDeleteQuery({ rows: rows.slice(0, 1), table });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            14,
            1000,
          ],
          "sql": "delete from "public"."users" where "id" = $1 returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(floor(extract(epoch from now()) * $2) as text) as "__ps_deleted_at__"",
          "transformations": undefined,
        }
      `);
    });

    it("should return a query object: composite primary key, single row", () => {
      const query = getDeleteQuery({
        rows: [
          {
            id: "c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b",
            name: "test1",
            created_at: new Date("2025-01-26T21:56:12.345Z"),
          },
        ],
        table: introspection.schemas.public.tables.composite_pk,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b",
            "test1",
            1000,
          ],
          "sql": "delete from "public"."composite_pk" where ("id", "name") = ($1, $2) returning "id", "name", "created_at", cast(floor(extract(epoch from now()) * $3) as text) as "__ps_deleted_at__"",
          "transformations": undefined,
        }
      `);
    });

    it("should return a query object: composite primary key, multiple rows", () => {
      const query = getDeleteQuery({
        rows: [
          {
            id: "c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b",
            name: "test1",
            created_at: new Date("2025-01-26T21:56:12.345Z"),
          },
          {
            id: "f3d9e2c0-7b3a-4e6f-8c6d-9e2a1b3c4d5e",
            name: "test2",
            created_at: new Date("2025-01-26T21:56:12.345Z"),
          },
        ],
        table: introspection.schemas.public.tables.composite_pk,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b",
            "test1",
            "f3d9e2c0-7b3a-4e6f-8c6d-9e2a1b3c4d5e",
            "test2",
            1000,
          ],
          "sql": "delete from "public"."composite_pk" where ("id", "name") in (($1, $2), ($3, $4)) returning "id", "name", "created_at", cast(floor(extract(epoch from now()) * $5) as text) as "__ps_deleted_at__"",
          "transformations": undefined,
        }
      `);
    });
  });
});
