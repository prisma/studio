import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Adapter } from "../adapter";
import { createMySQL2Executor } from "../mysql2";
import { createMySQLAdapter } from "./adapter";

describe("mysql-core/adapter", () => {
  let adapter: Adapter;
  let pool: Pool;

  beforeAll(async () => {
    // we connect to vitess instead of regular mysql because vitess is more restrictive.
    // pool = createPool("mysql://root:root@localhost:3306/studio");
    pool = createPool("mysql://root@localhost:15306/studio");
    const executor = createMySQL2Executor(pool);
    adapter = createMySQLAdapter({ executor });

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
        id INT AUTO_INCREMENT PRIMARY KEY,
        created_at TIMESTAMP,
        role ENUM('admin', 'maintainer', 'member') NOT NULL,
        animal_id INT,
        CONSTRAINT fk_animal FOREIGN KEY (animal_id) REFERENCES animals(id)
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

  describe("introspect", () => {
    it("should introspect the database correctly", async () => {
      const result = await adapter.introspect({});

      expect(result).toMatchInlineSnapshot(`
        [
          null,
          {
            "filterOperators": [
              "=",
              "!=",
              ">",
              ">=",
              "<",
              "<=",
              "is",
              "is not",
              "like",
              "not like",
            ],
            "query": {
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
            },
            "schemas": {
              "vt_studio_0": {
                "name": "vt_studio_0",
                "tables": {
                  "animals": {
                    "columns": {
                      "id": {
                        "datatype": {
                          "group": "numeric",
                          "isArray": false,
                          "isNative": true,
                          "name": "int",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": true,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "id",
                        "nullable": false,
                        "pkPosition": 1,
                        "schema": "vt_studio_0",
                        "table": "animals",
                      },
                      "id_name": {
                        "datatype": {
                          "group": "string",
                          "isArray": false,
                          "isNative": true,
                          "name": "text",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": true,
                        "isRequired": false,
                        "name": "id_name",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "vt_studio_0",
                        "table": "animals",
                      },
                      "name": {
                        "datatype": {
                          "group": "string",
                          "isArray": false,
                          "isNative": true,
                          "name": "varchar",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "name",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "vt_studio_0",
                        "table": "animals",
                      },
                      "uuid": {
                        "datatype": {
                          "group": "string",
                          "isArray": false,
                          "isNative": true,
                          "name": "binary",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": "uuid_to_bin(uuid())",
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "uuid",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "vt_studio_0",
                        "table": "animals",
                      },
                    },
                    "name": "animals",
                    "schema": "vt_studio_0",
                  },
                  "composite_pk": {
                    "columns": {
                      "created_at": {
                        "datatype": {
                          "format": "YYYY-MM-DD HH:mm:ss.SSS",
                          "group": "datetime",
                          "isArray": false,
                          "isNative": true,
                          "name": "timestamp",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": "CURRENT_TIMESTAMP",
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "created_at",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "vt_studio_0",
                        "table": "composite_pk",
                      },
                      "id": {
                        "datatype": {
                          "group": "string",
                          "isArray": false,
                          "isNative": true,
                          "name": "char",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": "uuid()",
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "id",
                        "nullable": false,
                        "pkPosition": 1,
                        "schema": "vt_studio_0",
                        "table": "composite_pk",
                      },
                      "name": {
                        "datatype": {
                          "group": "string",
                          "isArray": false,
                          "isNative": true,
                          "name": "text",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": true,
                        "name": "name",
                        "nullable": false,
                        "pkPosition": 2,
                        "schema": "vt_studio_0",
                        "table": "composite_pk",
                      },
                    },
                    "name": "composite_pk",
                    "schema": "vt_studio_0",
                  },
                  "users": {
                    "columns": {
                      "animal_id": {
                        "datatype": {
                          "group": "numeric",
                          "isArray": false,
                          "isNative": true,
                          "name": "int",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": null,
                        "fkColumn": "id",
                        "fkSchema": "vt_studio_0",
                        "fkTable": "animals",
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "animal_id",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "vt_studio_0",
                        "table": "users",
                      },
                      "created_at": {
                        "datatype": {
                          "format": "YYYY-MM-DD HH:mm:ss.SSS",
                          "group": "datetime",
                          "isArray": false,
                          "isNative": true,
                          "name": "timestamp",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "created_at",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "vt_studio_0",
                        "table": "users",
                      },
                      "id": {
                        "datatype": {
                          "group": "numeric",
                          "isArray": false,
                          "isNative": true,
                          "name": "int",
                          "options": [],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": true,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "id",
                        "nullable": false,
                        "pkPosition": 1,
                        "schema": "vt_studio_0",
                        "table": "users",
                      },
                      "role": {
                        "datatype": {
                          "group": "enum",
                          "isArray": false,
                          "isNative": true,
                          "name": "enum",
                          "options": [
                            "admin",
                            "maintainer",
                            "member",
                          ],
                          "schema": "vt_studio_0",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": "vt_studio_0",
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": true,
                        "name": "role",
                        "nullable": false,
                        "pkPosition": null,
                        "schema": "vt_studio_0",
                        "table": "users",
                      },
                    },
                    "name": "users",
                    "schema": "vt_studio_0",
                  },
                },
              },
            },
            "timezone": "UTC",
          },
        ]
      `);
    });
  });
});
