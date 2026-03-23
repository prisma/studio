import { createPool, type OkPacketParams, type Pool } from "mysql2/promise";
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
import { createMySQL2Executor } from "../mysql2";
import type { Query } from "../query";
import type { BigIntString } from "../type-utils";
import { mockIntrospect } from "./adapter";
import {
  getDeleteQuery,
  getInsertQuery,
  getInsertRefetchQuery,
  getSelectQuery,
  getUpdateQuery,
  getUpdateRefetchQuery,
  mockSelectQuery,
} from "./dml";

describe("mysql-core/dml", () => {
  let executor: Executor;
  let introspection: ReturnType<typeof mockIntrospect>;
  let pool: Pool;
  let table: Table;

  function createSearchTypesTable(): Table {
    return {
      columns: {
        id: {
          datatype: {
            group: "numeric",
            isArray: false,
            isNative: true,
            name: "int",
            options: [],
            schema: "studio",
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
          schema: "studio",
          table: "search_types",
        },
        name: {
          datatype: {
            group: "string",
            isArray: false,
            isNative: true,
            name: "text",
            options: [],
            schema: "studio",
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
          schema: "studio",
          table: "search_types",
        },
        title: {
          datatype: {
            group: "string",
            isArray: false,
            isNative: true,
            name: "text",
            options: [],
            schema: "studio",
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
          schema: "studio",
          table: "search_types",
        },
        state: {
          datatype: {
            group: "enum",
            isArray: false,
            isNative: true,
            name: "enum",
            options: ["new", "triaged", "closed"],
            schema: "studio",
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
          schema: "studio",
          table: "search_types",
        },
        score: {
          datatype: {
            group: "numeric",
            isArray: false,
            isNative: true,
            name: "int",
            options: [],
            schema: "studio",
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
          schema: "studio",
          table: "search_types",
        },
        joined_at: {
          datatype: {
            format: "YYYY-MM-DD HH:mm:ss.SSS",
            group: "datetime",
            isArray: false,
            isNative: true,
            name: "datetime",
            options: [],
            schema: "studio",
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
          schema: "studio",
          table: "search_types",
        },
        starts_at: {
          datatype: {
            format: "HH:mm:ss.SSS",
            group: "time",
            isArray: false,
            isNative: true,
            name: "time",
            options: [],
            schema: "studio",
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
          schema: "studio",
          table: "search_types",
        },
        profile: {
          datatype: {
            group: "json",
            isArray: false,
            isNative: true,
            name: "json",
            options: [],
            schema: "studio",
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
          schema: "studio",
          table: "search_types",
        },
        payload_blob: {
          datatype: {
            group: "string",
            isArray: false,
            isNative: true,
            name: "longblob",
            options: [],
            schema: "studio",
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
          schema: "studio",
          table: "search_types",
        },
        uuid_bin: {
          datatype: {
            group: "string",
            isArray: false,
            isNative: true,
            name: "binary",
            options: [],
            schema: "studio",
          },
          defaultValue: "uuid_to_bin(uuid())",
          fkColumn: null,
          fkSchema: null,
          fkTable: null,
          isAutoincrement: false,
          isComputed: false,
          isRequired: false,
          name: "uuid_bin",
          nullable: true,
          pkPosition: null,
          schema: "studio",
          table: "search_types",
        },
      },
      name: "search_types",
      schema: "studio",
    };
  }

  beforeAll(async () => {
    const baseTimestamp = new Date("2025-01-27T00:00:00.000Z");

    vi.useFakeTimers({
      now: baseTimestamp,
    });

    // we connect to vitess instead of regular mysql because vitess is more restrictive.
    // pool = createPool("mysql://root:root@localhost:3306/studio");
    pool = createPool("mysql://root@localhost:15306/studio");
    executor = createMySQL2Executor(pool);
    introspection = mockIntrospect();
    table = introspection.schemas.studio.tables.users;

    await pool.query(`
      create table if not exists \`animals\` (
        \`id\` int primary key auto_increment,
        name text
      )
    `);
    await pool.query(
      `insert into \`animals\` (\`id\`, \`name\`) values (default, default)`,
    );
    await pool.query(`
      create table if not exists \`users\` (
        \`id\` int primary key auto_increment,
        \`created_at\` timestamp,
        \`deleted_at\` timestamp,
        \`role\` text,
        \`name\` text,
        \`name_role\` text generated always as (concat(\`name\`, '_', \`role\`)) stored
      )
    `);

    // Insert rows with explicit stable timestamps
    await pool.query(
      `insert into \`users\` (\`id\`, \`created_at\`) values (1, '2025-01-27 00:00:00')`,
    );
    await pool.query(`
      insert into \`users\` (\`created_at\`) values
        ('2025-01-27 00:00:00'),
        ('2025-01-26 23:00:00'),
        ('2025-01-26 22:00:00'),
        ('2025-01-26 21:00:00'),
        ('2025-01-26 20:00:00'),
        ('2025-01-26 19:00:00'),
        ('2025-01-26 18:00:00'),
        ('2025-01-26 17:00:00'),
        ('2025-01-26 16:00:00')
    `);
    await pool.query(`
      create table if not exists \`composite_pk\` (
        \`id\` char(36) default (uuid()),
        \`name\` text,
        \`created_at\` timestamp default current_timestamp,
        primary key (\`id\`, \`name\`(255))
      )
    `);
    await pool.query(`
      insert into \`composite_pk\` (\`id\`, \`name\`) 
      values
        ('c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b', 'test1'),
        ('f3d9e2c0-7b3a-4e6f-8c6d-9e2a1b3c4d5e', 'test2'),
        (default, 'test3')
    `);
    await pool.query(`
      create table if not exists \`search_types\` (
        \`id\` int primary key auto_increment,
        \`name\` text,
        \`title\` text,
        \`state\` enum('new', 'triaged', 'closed'),
        \`score\` int,
        \`joined_at\` datetime,
        \`starts_at\` time,
        \`profile\` json,
        \`payload_blob\` longblob,
        \`uuid_bin\` binary(16) default (uuid_to_bin(uuid()))
      )
    `);
    await pool.query(`
      insert into \`search_types\` (
        \`name\`,
        \`title\`,
        \`state\`,
        \`score\`,
        \`joined_at\`,
        \`starts_at\`,
        \`profile\`,
        \`payload_blob\`,
        \`uuid_bin\`
      ) values
      (
        'Tristan Ops',
        'Staff Engineer',
        'triaged',
        42,
        '2025-01-27 10:56:12',
        '10:56:12',
        json_object('role', 'triager'),
        x'747269',
        uuid_to_bin('5b6a6d4e-8df9-4af9-8f64-c9e8db47f348')
      ),
      (
        'Sam Rivera',
        'Developer',
        'new',
        7,
        '2025-01-28 08:00:00',
        '08:00:00',
        json_object('role', 'dev'),
        x'73616d',
        uuid_to_bin('f48ecf1b-34ed-46f5-8364-88674f11db79')
      )
    `);
  });

  afterAll(async () => {
    await pool.query("drop table if exists `search_types`");
    await pool.query("drop table if exists `composite_pk`");
    await pool.query("drop table if exists `users`");
    await pool.query("drop table if exists `animals`");
    await pool.end();
  });

  describe("getSelectQuery", () => {
    it("builds and executes full-table search predicates for mysql", async () => {
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

      expect(query.sql).toContain("lower(cast(`name` as char)) like ?");
      expect(query.sql).toContain("lower(cast(`title` as char)) like ?");
      expect(query.sql).toContain("lower(cast(`state` as char)) like ?");
      expect(query.sql).toContain("MAX_EXECUTION_TIME(5000)");
      expect(query.sql).toContain("SET_VAR(lock_wait_timeout=1)");
      expect(query.sql).not.toContain(
        "lower(cast(`payload_blob` as char)) like ?",
      );
      expect(query.sql).not.toContain("lower(cast(`uuid_bin` as char)) like ?");

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

    it("supports typed full-table search predicates in mysql", async () => {
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
          "sql": "with \`__ps_agg__\` as (select cast(coalesce(count(*), 0) as char) as \`__ps_count__\` from \`users\` where true) select \`__ps_agg__\`.\`__ps_count__\`, \`id\`, \`created_at\`, \`deleted_at\`, \`role\`, \`name\`, \`name_role\` from \`users\` inner join \`__ps_agg__\` on true where true limit ? offset 0",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information", () => {
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

    it("should return a query object that can be executed against a MySQL-compatible database", async () => {
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
            "created_at": 2025-01-27T00:00:00.000Z,
            "deleted_at": null,
            "id": 1,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-27T00:00:00.000Z,
            "deleted_at": null,
            "id": 2,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T23:00:00.000Z,
            "deleted_at": null,
            "id": 3,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T22:00:00.000Z,
            "deleted_at": null,
            "id": 4,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T21:00:00.000Z,
            "deleted_at": null,
            "id": 5,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T20:00:00.000Z,
            "deleted_at": null,
            "id": 6,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T19:00:00.000Z,
            "deleted_at": null,
            "id": 7,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T18:00:00.000Z,
            "deleted_at": null,
            "id": 8,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T17:00:00.000Z,
            "deleted_at": null,
            "id": 9,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T16:00:00.000Z,
            "deleted_at": null,
            "id": 10,
            "name": null,
            "name_role": null,
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
          "sql": "with \`__ps_agg__\` as (select cast(coalesce(count(*), 0) as char) as \`__ps_count__\` from \`users\` where true) select \`__ps_agg__\`.\`__ps_count__\`, \`id\`, \`created_at\`, \`deleted_at\`, \`role\`, \`name\`, \`name_role\` from \`users\` inner join \`__ps_agg__\` on true where true limit ? offset 2",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T23:00:00.000Z,
            "deleted_at": null,
            "id": 3,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T22:00:00.000Z,
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
          "sql": "with \`__ps_agg__\` as (select cast(coalesce(count(*), 0) as char) as \`__ps_count__\` from \`users\` where true) select \`__ps_agg__\`.\`__ps_count__\`, \`id\`, \`created_at\`, \`deleted_at\`, \`role\`, \`name\`, \`name_role\` from \`users\` inner join \`__ps_agg__\` on true where true order by \`created_at\` desc, \`id\` asc limit ? offset 0",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "__ps_count__": "10",
            "created_at": 2025-01-27T00:00:00.000Z,
            "deleted_at": null,
            "id": 1,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-27T00:00:00.000Z,
            "deleted_at": null,
            "id": 2,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T23:00:00.000Z,
            "deleted_at": null,
            "id": 3,
            "name": null,
            "name_role": null,
            "role": null,
          },
          {
            "__ps_count__": "10",
            "created_at": 2025-01-26T22:00:00.000Z,
            "deleted_at": null,
            "id": 4,
            "name": null,
            "name_role": null,
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
          "sql": "with \`__ps_agg__\` as (select cast(coalesce(count(*), 0) as char) as \`__ps_count__\` from \`users\` where (\`role\` = ? and \`deleted_at\` is null)) select \`__ps_agg__\`.\`__ps_count__\`, \`id\`, \`created_at\`, \`deleted_at\`, \`role\`, \`name\`, \`name_role\` from \`users\` inner join \`__ps_agg__\` on true where (\`role\` = ? and \`deleted_at\` is null) limit ? offset 0",
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
          "sql": "with \`__ps_agg__\` as (select cast(coalesce(count(*), 0) as char) as \`__ps_count__\` from \`users\` where (\`role\` = ? or \`role\` = ?)) select \`__ps_agg__\`.\`__ps_count__\`, \`id\`, \`created_at\`, \`deleted_at\`, \`role\`, \`name\`, \`name_role\` from \`users\` inner join \`__ps_agg__\` on true where (\`role\` = ? or \`role\` = ?) limit ? offset 0",
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
          "sql": "with \`__ps_agg__\` as (select cast(coalesce(count(*), 0) as char) as \`__ps_count__\` from \`users\` where ((\`role\` = ? or (\`role\` = ? and \`role\` = ?) or \`role\` = ?) and \`deleted_at\` is null)) select \`__ps_agg__\`.\`__ps_count__\`, \`id\`, \`created_at\`, \`deleted_at\`, \`role\`, \`name\`, \`name_role\` from \`users\` inner join \`__ps_agg__\` on true where ((\`role\` = ? or (\`role\` = ? and \`role\` = ?) or \`role\` = ?) and \`deleted_at\` is null) limit ? offset 0",
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
          "sql": "insert into \`users\` (\`created_at\`) values (?)",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds basic type information", () => {
      expectTypeOf(query).toEqualTypeOf<Query<OkPacketParams>>();
    });

    it("should return a query object that can be executed against a MySQL-compatible database", async () => {
      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          ResultSetHeader {
            "affectedRows": 1,
            "changedRows": 0,
            "fieldCount": 0,
            "info": "",
            "insertId": 11,
            "serverStatus": 2,
            "warningStatus": 0,
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
          ],
          "sql": "insert into \`users\` (\`id\`, \`name\`) values (default, default), (default, ?)",
          "transformations": undefined,
        }
      `);

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          ResultSetHeader {
            "affectedRows": 2,
            "changedRows": 0,
            "fieldCount": 0,
            "info": "",
            "insertId": 12,
            "serverStatus": 2,
            "warningStatus": 0,
          },
        ]
      `);
    });
  });

  describe("getInsertRefetchQuery", () => {
    let query: ReturnType<typeof getInsertRefetchQuery>;

    beforeAll(() => {
      query = getInsertRefetchQuery({
        table,
        criteria: [{ id: 1 }],
      });
    });

    it("should return a query object", () => {
      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            1,
          ],
          "sql": "select \`id\`, \`created_at\`, \`deleted_at\`, \`role\`, \`name\`, \`name_role\`, cast(unix_timestamp(now(3)) * 1000 as unsigned) as \`__ps_inserted_at__\` from \`users\` where \`id\` = ?",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information", () => {
      expectTypeOf(query).toEqualTypeOf<
        Query<{ [x: string]: unknown; __ps_inserted_at__: number | string }>
      >();
    });

    it("should return a query object that can be executed against a MySQL-compatible database", async () => {
      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(
        results?.map((result) => {
          const { __ps_inserted_at__, ...rest } = result;

          expect(`${__ps_inserted_at__}`).toMatch(/^\d{13}$/);

          return rest;
        }),
      ).toMatchInlineSnapshot(`
        [
          {
            "created_at": 2025-01-27T00:00:00.000Z,
            "deleted_at": null,
            "id": 1,
            "name": null,
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
        changes: {
          deleted_at: new Date("2025-01-26T21:56:12.345Z"),
        } satisfies Partial<
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
            2025-01-26T21:56:12.345Z,
            1,
          ],
          "sql": "update \`studio\`.\`users\` set \`deleted_at\` = ? where \`id\` = ?",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information", () => {
      expectTypeOf(query).toEqualTypeOf<Query<OkPacketParams>>();
    });

    it("should return a query object that can be executed against a MySQL-compatible database", async () => {
      const [, users] = await executor.execute(
        getSelectQuery({ pageIndex: 0, pageSize: 1, sortOrder: [], table }),
      );

      const [user] = users!;

      const query = getUpdateQuery({
        changes: { deleted_at: "2025-01-26 21:56:12.345" } satisfies Partial<
          Record<keyof ReturnType<typeof mockSelectQuery>[0], unknown>
        >,
        row: user!,
        table,
      });

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          ResultSetHeader {
            "affectedRows": 1,
            "changedRows": 0,
            "fieldCount": 0,
            "info": "",
            "insertId": 0,
            "serverStatus": 2,
            "warningStatus": 0,
          },
        ]
      `);
    });
  });

  describe("getUpdateRefetchQuery", () => {
    let query: ReturnType<typeof getUpdateRefetchQuery>;

    beforeAll(() => {
      query = getUpdateRefetchQuery({
        changes: {
          deleted_at: new Date("2025-01-26T21:56:12.345Z"),
        } satisfies Partial<
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
            1,
          ],
          "sql": "select \`id\`, \`created_at\`, \`deleted_at\`, \`role\`, \`name\`, \`name_role\`, cast(unix_timestamp(now(3)) * 1000 as unsigned) as \`__ps_updated_at__\` from \`users\` where \`id\` = ?",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information", () => {
      expectTypeOf(query).toEqualTypeOf<
        Query<{ [x: string]: unknown; __ps_updated_at__: number | string }>
      >();
    });

    it("should return a query object that can be executed against a MySQL-compatible database", async () => {
      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(
        results?.map((result) => {
          const { __ps_updated_at__, ...rest } = result;

          expect(`${__ps_updated_at__}`).toMatch(/^\d{13}$/);

          return rest;
        }),
      ).toMatchInlineSnapshot(`
        [
          {
            "created_at": 2025-01-27T00:00:00.000Z,
            "deleted_at": 2025-01-26T21:56:12.000Z,
            "id": 1,
            "name": null,
            "name_role": null,
            "role": null,
          },
        ]
      `);
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
          insert into \`users\` (\`created_at\`)
          VALUES (?), (?)`,
        transformations: undefined,
      } as Query<OkPacketParams>;

      await executor.execute(insertQuery);

      // Fetch the inserted rows
      const [, allRows] = await executor.execute(
        getSelectQuery({
          pageIndex: 0,
          pageSize: 100,
          sortOrder: [{ column: "id", direction: "desc" }],
          table,
        }),
      );

      rows = allRows!.slice(0, 2);

      query = getDeleteQuery({ rows, table });
    });

    it("should return a query object: simple primary key, multiple rows", () => {
      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            15,
            14,
          ],
          "sql": "delete from \`users\` where \`id\` in (?, ?)",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information", () => {
      expectTypeOf(query).toEqualTypeOf<Query<OkPacketParams>>();
    });

    it("should delete the row from the database", async () => {
      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          ResultSetHeader {
            "affectedRows": 2,
            "changedRows": 0,
            "fieldCount": 0,
            "info": "",
            "insertId": 0,
            "serverStatus": 2,
            "warningStatus": 0,
          },
        ]
      `);
    });

    it("should return a query object: simple primary key, single row", () => {
      const query = getDeleteQuery({ rows: rows.slice(0, 1), table });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            15,
          ],
          "sql": "delete from \`users\` where \`id\` = ?",
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
        table: introspection.schemas.studio.tables.composite_pk,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b",
            "test1",
          ],
          "sql": "delete from \`composite_pk\` where (\`id\`, \`name\`) = (?, ?)",
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
        table: introspection.schemas.studio.tables.composite_pk,
      });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "c7a7b8a0-5b5f-4f7e-8c7c-3e6e6b0d8a1b",
            "test1",
            "f3d9e2c0-7b3a-4e6f-8c6d-9e2a1b3c4d5e",
            "test2",
          ],
          "sql": "delete from \`composite_pk\` where (\`id\`, \`name\`) in ((?, ?), (?, ?))",
          "transformations": undefined,
        }
      `);
    });
  });
});
