import type { SqlBool } from "kysely";
import { createPool, type Pool } from "mysql2/promise";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import type { Executor } from "../executor";
import { createMySQL2Executor } from "../mysql2";
import { asQuery, type Query } from "../query";
import { getTablesQuery, getTimezoneQuery } from "./introspection";

describe("mysql-core/introspection", () => {
  let executor: Executor;
  let pool: Pool;

  beforeAll(async () => {
    // we connect to vitess instead of regular mysql because vitess is more restrictive.
    // pool = createPool("mysql://root:root@localhost:3306/studio");
    pool = createPool("mysql://root@localhost:15306/studio");
    executor = createMySQL2Executor(pool);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS animals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uuid BINARY(16) DEFAULT (UUID_TO_BIN(UUID())),
        name VARCHAR(255),
        id_name TEXT GENERATED ALWAYS AS (CONCAT(HEX(uuid), '-', name)) STORED
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT,
        created_at TIMESTAMP,
        role ENUM('admin', 'maintainer', 'member') NOT NULL,
        animal_id INT,
        CONSTRAINT fk_animal FOREIGN KEY (animal_id) REFERENCES animals(id),
        CONSTRAINT pk_users PRIMARY KEY (id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS composite_pk (
        id CHAR(36) DEFAULT (UUID()),
        name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, name(100))
      )
    `);
  });

  afterAll(async () => {
    await pool.query("DROP TABLE IF EXISTS composite_pk");
    await pool.query("DROP TABLE IF EXISTS users");
    await pool.query("DROP TABLE IF EXISTS animals");
    await pool.end();
  });

  describe("getTablesQuery", () => {
    it("should return a query object", () => {
      const query = getTablesQuery();

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "auto_increment",
            "on update CURRENT_TIMESTAMP",
            "STORED GENERATED",
            "VIRTUAL GENERATED",
            "YES",
            "PRIMARY",
            "BASE TABLE",
            "VIEW",
          ],
          "sql": "with \`cols\` as (select \`c\`.\`COLUMN_DEFAULT\` as \`default\`, \`c\`.\`COLUMN_NAME\` as \`name\`, \`c\`.\`COLUMN_TYPE\` as \`datatype\`, \`c\`.\`ORDINAL_POSITION\` as \`position\`, \`c\`.\`TABLE_NAME\`, \`kcu\`.\`REFERENCED_TABLE_NAME\` as \`fk_table\`, \`kcu\`.\`REFERENCED_COLUMN_NAME\` as \`fk_column\`, \`pk_kcu\`.\`ORDINAL_POSITION\` as \`pk\`, \`c\`.\`EXTRA\` = ? as \`autoincrement\`, \`c\`.\`EXTRA\` in (?, ?, ?) as \`computed\`, \`c\`.\`IS_NULLABLE\` = ? as \`nullable\` from \`information_schema\`.\`columns\` as \`c\` left join \`information_schema\`.\`KEY_COLUMN_USAGE\` as \`kcu\` on \`kcu\`.\`TABLE_SCHEMA\` = database() and \`kcu\`.\`TABLE_NAME\` = \`c\`.\`TABLE_NAME\` and \`kcu\`.\`COLUMN_NAME\` = \`c\`.\`COLUMN_NAME\` and \`kcu\`.\`POSITION_IN_UNIQUE_CONSTRAINT\` is not null left join \`information_schema\`.\`KEY_COLUMN_USAGE\` as \`pk_kcu\` on \`pk_kcu\`.\`TABLE_SCHEMA\` = database() and \`pk_kcu\`.\`TABLE_NAME\` = \`c\`.\`TABLE_NAME\` and \`pk_kcu\`.\`COLUMN_NAME\` = \`c\`.\`COLUMN_NAME\` and \`pk_kcu\`.\`CONSTRAINT_NAME\` = ? where \`c\`.\`TABLE_SCHEMA\` = database()) select database() as \`schema\`, \`t\`.\`TABLE_NAME\` as \`name\`, \`t\`.\`TABLE_TYPE\` as \`type\`, json_arrayagg(json_object('autoincrement', \`c\`.\`autoincrement\`, 'computed', \`c\`.\`computed\`, 'datatype', \`c\`.\`datatype\`, 'default', \`c\`.\`default\`, 'fk_column', \`c\`.\`fk_column\`, 'fk_table', \`c\`.\`fk_table\`, 'name', \`c\`.\`name\`, 'position', \`c\`.\`position\`, 'pk', \`c\`.\`pk\`, 'nullable', \`c\`.\`nullable\`)) as \`columns\` from \`information_schema\`.\`tables\` as \`t\` inner join \`cols\` as \`c\` on \`c\`.\`TABLE_NAME\` = \`t\`.\`TABLE_NAME\` where \`t\`.\`TABLE_SCHEMA\` = database() and \`t\`.\`TABLE_TYPE\` in (?, ?) group by database(), \`t\`.\`TABLE_NAME\`, \`t\`.\`TABLE_TYPE\` order by \`t\`.\`TABLE_SCHEMA\`, \`t\`.\`TABLE_NAME\`, \`t\`.\`TABLE_TYPE\`",
          "transformations": undefined,
        }
      `);
    });

    it("should return a query object with inlined parameters, when noParameters: true", () => {
      const query = getTablesQuery({ noParameters: true });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [],
          "sql": "with \`cols\` as (select \`c\`.\`COLUMN_DEFAULT\` as \`default\`, \`c\`.\`COLUMN_NAME\` as \`name\`, \`c\`.\`COLUMN_TYPE\` as \`datatype\`, \`c\`.\`ORDINAL_POSITION\` as \`position\`, \`c\`.\`TABLE_NAME\`, \`kcu\`.\`REFERENCED_TABLE_NAME\` as \`fk_table\`, \`kcu\`.\`REFERENCED_COLUMN_NAME\` as \`fk_column\`, \`pk_kcu\`.\`ORDINAL_POSITION\` as \`pk\`, \`c\`.\`EXTRA\` = 'auto_increment' as \`autoincrement\`, \`c\`.\`EXTRA\` in ('on update CURRENT_TIMESTAMP', 'STORED GENERATED', 'VIRTUAL GENERATED') as \`computed\`, \`c\`.\`IS_NULLABLE\` = 'YES' as \`nullable\` from \`information_schema\`.\`columns\` as \`c\` left join \`information_schema\`.\`KEY_COLUMN_USAGE\` as \`kcu\` on \`kcu\`.\`TABLE_SCHEMA\` = database() and \`kcu\`.\`TABLE_NAME\` = \`c\`.\`TABLE_NAME\` and \`kcu\`.\`COLUMN_NAME\` = \`c\`.\`COLUMN_NAME\` and \`kcu\`.\`POSITION_IN_UNIQUE_CONSTRAINT\` is not null left join \`information_schema\`.\`KEY_COLUMN_USAGE\` as \`pk_kcu\` on \`pk_kcu\`.\`TABLE_SCHEMA\` = database() and \`pk_kcu\`.\`TABLE_NAME\` = \`c\`.\`TABLE_NAME\` and \`pk_kcu\`.\`COLUMN_NAME\` = \`c\`.\`COLUMN_NAME\` and \`pk_kcu\`.\`CONSTRAINT_NAME\` = 'PRIMARY' where \`c\`.\`TABLE_SCHEMA\` = database()) select database() as \`schema\`, \`t\`.\`TABLE_NAME\` as \`name\`, \`t\`.\`TABLE_TYPE\` as \`type\`, json_arrayagg(json_object('autoincrement', \`c\`.\`autoincrement\`, 'computed', \`c\`.\`computed\`, 'datatype', \`c\`.\`datatype\`, 'default', \`c\`.\`default\`, 'fk_column', \`c\`.\`fk_column\`, 'fk_table', \`c\`.\`fk_table\`, 'name', \`c\`.\`name\`, 'position', \`c\`.\`position\`, 'pk', \`c\`.\`pk\`, 'nullable', \`c\`.\`nullable\`)) as \`columns\` from \`information_schema\`.\`tables\` as \`t\` inner join \`cols\` as \`c\` on \`c\`.\`TABLE_NAME\` = \`t\`.\`TABLE_NAME\` where \`t\`.\`TABLE_SCHEMA\` = database() and \`t\`.\`TABLE_TYPE\` in ('BASE TABLE', 'VIEW') group by database(), \`t\`.\`TABLE_NAME\`, \`t\`.\`TABLE_TYPE\` order by \`t\`.\`TABLE_SCHEMA\`, \`t\`.\`TABLE_NAME\`, \`t\`.\`TABLE_TYPE\`",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information about the query result", () => {
      const query = getTablesQuery();

      expectTypeOf(query).toEqualTypeOf<
        Query<{
          schema: string;
          name: string;
          type: "BASE TABLE" | "VIEW";
          columns: {
            name: string;
            datatype: string;
            default: string | null;
            position: number;
            fk_table: string | null;
            fk_column: string | null;
            autoincrement: SqlBool;
            computed: SqlBool;
            pk: number | null;
            nullable: SqlBool;
          }[];
        }>
      >();
    });

    it("should return a query object that can be executed against a MySQL-compatible database", async () => {
      const query = getTablesQuery();

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(
        results?.map((result) => ({
          ...result,
          columns: result.columns.sort((a, b) => a.position - b.position),
        })),
      ).toMatchInlineSnapshot(`
          [
            {
              "columns": [
                {
                  "autoincrement": 1,
                  "computed": 0,
                  "datatype": "int",
                  "default": null,
                  "fk_column": null,
                  "fk_table": null,
                  "name": "id",
                  "nullable": 0,
                  "pk": 1,
                  "position": 1,
                },
                {
                  "autoincrement": 0,
                  "computed": 0,
                  "datatype": "binary(16)",
                  "default": "uuid_to_bin(uuid())",
                  "fk_column": null,
                  "fk_table": null,
                  "name": "uuid",
                  "nullable": 1,
                  "pk": null,
                  "position": 2,
                },
                {
                  "autoincrement": 0,
                  "computed": 0,
                  "datatype": "varchar(255)",
                  "default": null,
                  "fk_column": null,
                  "fk_table": null,
                  "name": "name",
                  "nullable": 1,
                  "pk": null,
                  "position": 3,
                },
                {
                  "autoincrement": 0,
                  "computed": 1,
                  "datatype": "text",
                  "default": null,
                  "fk_column": null,
                  "fk_table": null,
                  "name": "id_name",
                  "nullable": 1,
                  "pk": null,
                  "position": 4,
                },
              ],
              "name": "animals",
              "schema": "vt_studio_0",
              "type": "BASE TABLE",
            },
            {
              "columns": [
                {
                  "autoincrement": 0,
                  "computed": 0,
                  "datatype": "char(36)",
                  "default": "uuid()",
                  "fk_column": null,
                  "fk_table": null,
                  "name": "id",
                  "nullable": 0,
                  "pk": 1,
                  "position": 1,
                },
                {
                  "autoincrement": 0,
                  "computed": 0,
                  "datatype": "text",
                  "default": null,
                  "fk_column": null,
                  "fk_table": null,
                  "name": "name",
                  "nullable": 0,
                  "pk": 2,
                  "position": 2,
                },
                {
                  "autoincrement": 0,
                  "computed": 0,
                  "datatype": "timestamp",
                  "default": "CURRENT_TIMESTAMP",
                  "fk_column": null,
                  "fk_table": null,
                  "name": "created_at",
                  "nullable": 1,
                  "pk": null,
                  "position": 3,
                },
              ],
              "name": "composite_pk",
              "schema": "vt_studio_0",
              "type": "BASE TABLE",
            },
            {
              "columns": [
                {
                  "autoincrement": 1,
                  "computed": 0,
                  "datatype": "int",
                  "default": null,
                  "fk_column": null,
                  "fk_table": null,
                  "name": "id",
                  "nullable": 0,
                  "pk": 1,
                  "position": 1,
                },
                {
                  "autoincrement": 0,
                  "computed": 0,
                  "datatype": "timestamp",
                  "default": null,
                  "fk_column": null,
                  "fk_table": null,
                  "name": "created_at",
                  "nullable": 1,
                  "pk": null,
                  "position": 2,
                },
                {
                  "autoincrement": 0,
                  "computed": 0,
                  "datatype": "enum('admin','maintainer','member')",
                  "default": null,
                  "fk_column": null,
                  "fk_table": null,
                  "name": "role",
                  "nullable": 0,
                  "pk": null,
                  "position": 3,
                },
                {
                  "autoincrement": 0,
                  "computed": 0,
                  "datatype": "int",
                  "default": null,
                  "fk_column": "id",
                  "fk_table": "animals",
                  "name": "animal_id",
                  "nullable": 1,
                  "pk": null,
                  "position": 4,
                },
              ],
              "name": "users",
              "schema": "vt_studio_0",
              "type": "BASE TABLE",
            },
          ]
        `);
    });
  });

  describe("getTimezoneQuery", () => {
    afterAll(async () => {
      await executor.execute(asQuery<never>("set time_zone = 'SYSTEM'"));
    });

    it("should return a query object", () => {
      const query = getTimezoneQuery();

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "SYSTEM",
          ],
          "sql": "select case when @@session.time_zone = ? then @@system_time_zone else @@session.time_zone end as \`timezone\`",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information about the query result", () => {
      const query = getTimezoneQuery();

      expectTypeOf(query).toEqualTypeOf<Query<{ timezone: string }>>();
    });

    // Note: Using offset-based timezones instead of named timezones (like 'UTC', 'America/New_York')
    // because PlanetScale/Vitess doesn't support named timezones as it doesn't have timezone tables loaded.
    it.each(["+00:00", "-05:00"])(
      "should return a query object that can be executed against a MySQL-compatible database (%s)",
      async (timezone) => {
        await executor.execute(asQuery<never>(`set time_zone = '${timezone}'`));

        const query = getTimezoneQuery();

        const [error, results] = await executor.execute(query);

        expect(error).toBeNull();
        expect(results).toStrictEqual([{ timezone }]);
      },
    );
  });
});
