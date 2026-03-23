import { DatabaseSync } from "node:sqlite";

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
import { createNodeSQLiteExecutor } from "../node-sqlite";
import { asQuery, type Query } from "../query";
import type { BigIntString } from "../type-utils";
import { mockIntrospect } from "./adapter";
import {
  getDeleteQuery,
  getInsertQuery,
  getSelectQuery,
  getUpdateQuery,
  mockSelectQuery,
} from "./dml";

describe("sqlite-core/dml", () => {
  let database: DatabaseSync;
  let executor: Executor;
  let introspection: ReturnType<typeof mockIntrospect>;
  let table: Table;

  function createSearchTypesTable(): Table {
    return {
      columns: {
        id: {
          datatype: {
            affinity: "INTEGER",
            group: "numeric",
            isArray: false,
            isNative: true,
            name: "integer",
            options: [],
            schema: "main",
          },
          defaultValue: null,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: true,
          isComputed: false,
          isRequired: false,
          name: "id",
          nullable: false,
          pkPosition: 1,
          schema: "main",
          table: "search_types",
        },
        name: {
          datatype: {
            affinity: "TEXT",
            group: "string",
            isArray: false,
            isNative: true,
            name: "text",
            options: [],
            schema: "main",
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
          schema: "main",
          table: "search_types",
        },
        title: {
          datatype: {
            affinity: "TEXT",
            group: "string",
            isArray: false,
            isNative: true,
            name: "text",
            options: [],
            schema: "main",
          },
          defaultValue: null,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: false,
          name: "title",
          nullable: true,
          pkPosition: null,
          schema: "main",
          table: "search_types",
        },
        state: {
          datatype: {
            affinity: "TEXT",
            group: "enum",
            isArray: false,
            isNative: false,
            name: "state",
            options: ["new", "triaged", "closed"],
            schema: "main",
          },
          defaultValue: null,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: false,
          name: "state",
          nullable: true,
          pkPosition: null,
          schema: "main",
          table: "search_types",
        },
        score: {
          datatype: {
            affinity: "INTEGER",
            group: "numeric",
            isArray: false,
            isNative: true,
            name: "integer",
            options: [],
            schema: "main",
          },
          defaultValue: null,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: false,
          name: "score",
          nullable: true,
          pkPosition: null,
          schema: "main",
          table: "search_types",
        },
        joined_at: {
          datatype: {
            format: "YYYY-MM-DD HH:mm:ss.SSS",
            group: "datetime",
            isArray: false,
            isNative: true,
            name: "text",
            options: [],
            schema: "main",
          },
          defaultValue: null,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: false,
          name: "joined_at",
          nullable: true,
          pkPosition: null,
          schema: "main",
          table: "search_types",
        },
        starts_at: {
          datatype: {
            format: "HH:mm:ss.SSS",
            group: "time",
            isArray: false,
            isNative: true,
            name: "text",
            options: [],
            schema: "main",
          },
          defaultValue: null,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: false,
          name: "starts_at",
          nullable: true,
          pkPosition: null,
          schema: "main",
          table: "search_types",
        },
        profile: {
          datatype: {
            affinity: "TEXT",
            group: "json",
            isArray: false,
            isNative: true,
            name: "json",
            options: [],
            schema: "main",
          },
          defaultValue: null,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: false,
          name: "profile",
          nullable: true,
          pkPosition: null,
          schema: "main",
          table: "search_types",
        },
        payload_blob: {
          datatype: {
            affinity: "BLOB",
            group: "raw",
            isArray: false,
            isNative: true,
            name: "blob",
            options: [],
            schema: "main",
          },
          defaultValue: null,
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: false,
          name: "payload_blob",
          nullable: true,
          pkPosition: null,
          schema: "main",
          table: "search_types",
        },
      },
      name: "search_types",
      schema: "main",
    };
  }

  beforeAll(() => {
    const now = new Date("2025-01-27T00:56:12.345+02:00");

    vi.useFakeTimers({ now });
    database = new DatabaseSync(":memory:");
    executor = createNodeSQLiteExecutor(database);
    introspection = mockIntrospect();
    table = introspection.schemas.main.tables.users;

    const getTimestamp = (date: Date) =>
      `'${date.toISOString().replace("T", " ").replace("Z", "")}'`;

    database.exec(`
        create table "animals" ("id" integer primary key, "name" text);
        insert into "animals" DEFAULT VALUES;
        create table "users" (
          "id" integer primary key,
          "created_at" timestamp default ${getTimestamp(now)},
          "deleted_at" timestamp,
          "role" varchar,
          "name" varchar,
          "name_role" text GENERATED ALWAYS AS (printf('%s_%s', "name", "role")) VIRTUAL
        );
        insert into "users" default values;
        insert into "users" ("created_at") values (${new Array(9)
          .fill(null)
          .map((_, index) =>
            getTimestamp(new Date(now.getTime() - index * 60 * 60 * 1_000)),
          )
          .join("), (")});
        create table "composite_pk" (
          "id" text,
          "name" text,
          "created_at" timestamp default ${getTimestamp(now)},
          primary key ("id", "name")
        );
        insert into "composite_pk" ("id", "name") values ('c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b', 'test1'), ('f3d9e2c0-7b3a-4e6f-8c6d-9e2a1b3c4d5e', 'test2'), (null, 'test3');
        create table "search_types" (
          "id" integer primary key,
          "name" text,
          "title" text,
          "state" text,
          "score" integer,
          "joined_at" text,
          "starts_at" text,
          "profile" text,
          "payload_blob" blob
        );
        insert into "search_types" (
          "name",
          "title",
          "state",
          "score",
          "joined_at",
          "starts_at",
          "profile",
          "payload_blob"
        ) values
          (
            'Tristan Ops',
            'Staff Engineer',
            'triaged',
            42,
            '2025-01-27T10:56:12.000Z',
            '10:56:12',
            '{"role":"triager"}',
            x'747269'
          ),
          (
            'Sam Rivera',
            'Developer',
            'new',
            7,
            '2025-01-28T08:00:00.000Z',
            '08:00:00',
            '{"role":"dev"}',
            x'73616d'
          );
    `);
  });

  afterAll(() => {
    database.close();
  });

  describe("getSelectQuery", () => {
    it("builds and executes full-table search predicates for sqlite", async () => {
      const searchTypesTable = createSearchTypesTable();
      const query = getSelectQuery({
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
        table: searchTypesTable,
      });

      expect(query.sql).toContain('lower(cast("name" as text)) like ?');
      expect(query.sql).toContain('lower(cast("title" as text)) like ?');
      expect(query.sql).toContain('lower(cast("state" as text)) like ?');
      expect(query.sql).not.toContain(
        'lower(cast("payload_blob" as text)) like ?',
      );

      const [error, rows] = await executor.execute(query);

      expect(error).toBeNull();
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Tristan Ops",
          }),
        ]),
      );
    });

    it("supports typed full-table search predicates in sqlite", async () => {
      const searchTypesTable = createSearchTypesTable();
      const cases = [
        { term: "42", expectedName: "Tristan Ops" },
        { term: "2025-01-27", expectedName: "Tristan Ops" },
        { term: "2025-01-27T10", expectedName: "Tristan Ops" },
        { term: "2025-01-27 10:56", expectedName: "Tristan Ops" },
        { term: "10:56:12", expectedName: "Tristan Ops" },
        { term: "08", expectedName: "Sam Rivera" },
      ];

      for (const testCase of cases) {
        const query = getSelectQuery({
          filter: {
            after: "and",
            filters: [],
            id: "root",
            kind: "FilterGroup",
          },
          fullTableSearchTerm: testCase.term,
          pageIndex: 0,
          pageSize: 25,
          sortOrder: [],
          table: searchTypesTable,
        });

        const [error, rows] = await executor.execute(query);

        expect(error).toBeNull();
        expect(rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: testCase.expectedName,
            }),
          ]),
        );
      }
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
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "users" where true) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "users" inner join "__ps_agg__" on true where true limit ? offset 0",
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

    it("should return a query object that can be executed against a SQLite-compatible database", async () => {
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
            "created_at": "2025-01-26 22:56:12.345",
            "deleted_at": null,
            "id": 1,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 22:56:12.345",
            "deleted_at": null,
            "id": 2,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 21:56:12.345",
            "deleted_at": null,
            "id": 3,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 20:56:12.345",
            "deleted_at": null,
            "id": 4,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 19:56:12.345",
            "deleted_at": null,
            "id": 5,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 18:56:12.345",
            "deleted_at": null,
            "id": 6,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 17:56:12.345",
            "deleted_at": null,
            "id": 7,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 16:56:12.345",
            "deleted_at": null,
            "id": 8,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 15:56:12.345",
            "deleted_at": null,
            "id": 9,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 14:56:12.345",
            "deleted_at": null,
            "id": 10,
            "name": null,
            "name_role": "_",
            "role": null,
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
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "users" where true) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "users" inner join "__ps_agg__" on true where true limit ? offset 2",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 21:56:12.345",
            "deleted_at": null,
            "id": 3,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 20:56:12.345",
            "deleted_at": null,
            "id": 4,
            "name": null,
            "name_role": "_",
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
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "users" where true) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "users" inner join "__ps_agg__" on true where true order by "created_at" desc, "id" asc limit ? offset 0",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 22:56:12.345",
            "deleted_at": null,
            "id": 1,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 22:56:12.345",
            "deleted_at": null,
            "id": 2,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 21:56:12.345",
            "deleted_at": null,
            "id": 3,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": "2025-01-26 20:56:12.345",
            "deleted_at": null,
            "id": 4,
            "name": null,
            "name_role": "_",
            "role": null,
          },
        ]
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
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "users" where ("role" = ? and "deleted_at" is null)) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "users" inner join "__ps_agg__" on true where ("role" = ? and "deleted_at" is null) limit ? offset 0",
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
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "users" where ("role" = ? or "role" = ?)) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "users" inner join "__ps_agg__" on true where ("role" = ? or "role" = ?) limit ? offset 0",
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
          "sql": "with "__ps_agg__" as (select cast(coalesce(count(*), 0) as text) as "__ps_count__" from "users" where (("role" = ? or ("role" = ? and "role" = ?) or "role" = ?) and "deleted_at" is null)) select "__ps_agg__"."__ps_count__", "id", "created_at", "deleted_at", "role", "name", "name_role" from "users" inner join "__ps_agg__" on true where (("role" = ? or ("role" = ? and "role" = ?) or "role" = ?) and "deleted_at" is null) limit ? offset 0",
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
          ],
          "sql": "insert into "users" ("created_at") values (?) returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(cast((julianday('now') - 2440587.5) * 86400000.0 as integer) as text) as "__ps_inserted_at__"",
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

    it("should return a query object that can be executed against a SQLite-compatible database", async () => {
      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(
        results?.map((result) => {
          const { __ps_inserted_at__, ...rest } = result;

          expect(__ps_inserted_at__).toMatch(/^\d{13}$/);

          return rest;
        }),
      ).toMatchInlineSnapshot(`
        [
          {
            "created_at": null,
            "deleted_at": null,
            "id": 11,
            "name": null,
            "name_role": "_",
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
            null,
            "John Doe",
          ],
          "sql": "insert into "users" ("id", "name") values (?, null), (null, ?) returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(cast((julianday('now') - 2440587.5) * 86400000.0 as integer) as text) as "__ps_inserted_at__"",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(
        results?.map((result) => {
          const { __ps_inserted_at__, ...rest } = result;

          expect(__ps_inserted_at__).toMatch(/^\d{13}$/);

          return rest;
        }),
      ).toMatchInlineSnapshot(`
        [
          {
            "created_at": "2025-01-26 22:56:12.345",
            "deleted_at": null,
            "id": 12,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "created_at": "2025-01-26 22:56:12.345",
            "deleted_at": null,
            "id": 13,
            "name": "John Doe",
            "name_role": "John Doe_",
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
          ],
          "sql": "update "users" set "deleted_at" = ? where "id" = ? returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(cast((julianday('now') - 2440587.5) * 86400000.0 as integer) as text) as "__ps_updated_at__"",
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

    it("should return a query object that can be executed against a SQLite-compatible database", async () => {
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

      const { __ps_count__, __ps_updated_at__, ...userWithoutCount } = user!;

      expect(
        results?.map((result) => {
          const { __ps_updated_at__, ...rest } = result;

          expect(__ps_updated_at__).toMatch(/^\d{13}$/);

          return rest;
        }),
      ).toStrictEqual([
        {
          ...userWithoutCount,
          deleted_at: "2025-01-26T21:56:12.345Z",
        },
      ]);
    });
  });

  describe("getDeleteQuery", () => {
    let rows: Record<string, unknown>[];
    let query: ReturnType<typeof getDeleteQuery>;

    beforeAll(async () => {
      const insertQuery = asQuery<Record<string, unknown>>({
        parameters: ["2025-01-26 21:56:12.345", "2025-01-26 21:56:12.346"],
        sql: `
          insert into "users" ("created_at")
          values (?), (?)
          returning "id", "created_at", "deleted_at", "role", "name"`,
        transformations: undefined,
      });

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
          ],
          "sql": "delete from "users" where "id" in (?, ?) returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(cast((julianday('now') - 2440587.5) * 86400000.0 as integer) as text) as "__ps_deleted_at__"",
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
      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(
        results?.map((item) => {
          expect(item.__ps_deleted_at__).toMatch(/^\d{13}$/);

          return { ...item, __ps_deleted_at__: Date.now().toString() };
        }),
      ).toMatchInlineSnapshot(`
        [
          {
            "__ps_deleted_at__": "1737932172345",
            "created_at": "2025-01-26 21:56:12.345",
            "deleted_at": null,
            "id": 14,
            "name": null,
            "name_role": "_",
            "role": null,
          },
          {
            "__ps_deleted_at__": "1737932172345",
            "created_at": "2025-01-26 21:56:12.346",
            "deleted_at": null,
            "id": 15,
            "name": null,
            "name_role": "_",
            "role": null,
          },
        ]
      `);
    });

    it("should return a query object: simple primary key, single row", () => {
      const query = getDeleteQuery({ rows: rows.slice(0, 1), table });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            14,
          ],
          "sql": "delete from "users" where "id" = ? returning "id", "created_at", "deleted_at", "role", "name", "name_role", cast(cast((julianday('now') - 2440587.5) * 86400000.0 as integer) as text) as "__ps_deleted_at__"",
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
        table: introspection.schemas.main.tables.composite_pk,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b",
            "test1",
          ],
          "sql": "delete from "composite_pk" where ("id", "name") = (?, ?) returning "id", "name", "created_at", cast(cast((julianday('now') - 2440587.5) * 86400000.0 as integer) as text) as "__ps_deleted_at__"",
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
        table: introspection.schemas.main.tables.composite_pk,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b",
            "test1",
            "f3d9e2c0-7b3a-4e6f-8c6d-9e2a1b3c4d5e",
            "test2",
          ],
          "sql": "delete from "composite_pk" where ("id", "name") in ((?, ?), (?, ?)) returning "id", "name", "created_at", cast(cast((julianday('now') - 2440587.5) * 86400000.0 as integer) as text) as "__ps_deleted_at__"",
          "transformations": undefined,
        }
      `);
    });
  });
});
