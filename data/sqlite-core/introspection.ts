/**
 * SQLite introspection queries to be used by the SQLite adapter's introspect method.
 * @module sqlite-core/introspection
 *
 * References:
 * https://sqlite.org/pragma.html
 * https://sqlite.org/schematab.html
 */

import { expressionBuilder, type NotNull } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";

import { type BuilderRequirements, compile, type QueryResult } from "../query";
import { getSQLiteBuilder } from "./builder";

interface Database {
  /** the main system table */
  sqlite_schema: {
    /** object name */
    name: string;
    /** page number in root index when object is a table. */
    rootpage: number;
    /** sql statement that can recreate the object. null when internal index object. */
    sql: string | null;
    /** related table/view name when object is an index/trigger. */
    tbl_name: string;
    /** object type */
    type: "index" | "table" | "trigger" | "view";
  };
}

/**
 * The shape of each row returned by `pragma_table_list(tableName?)`.
 */
interface PragmaTableList {
  /** object name */
  name: string;
  /** schema name */
  schema: "main" | "temp";
  /** object type */
  type: "shadow" | "table" | "view" | "virtual";
}

/**
 * The shape of each row returned by `pragma_table_xinfo(tableName)`.
 */
interface PragmaTableXInfo {
  /** "rank within current result set" */
  cid: number;
  /** default value */
  dflt_value: string | null;
  /** 0 - normal, 1 - hidden, 2-3 - dynamic/stored generated */
  hidden: 0 | 1 | 2 | 3;
  /** column name */
  name: string;
  /** whether the column can be null */
  notnull: 0 | 1;
  /** 0 if not part of the primary key, otherwise the 1-based ordinal number of the column in the primary key */
  pk: number;
  /** data type */
  type: string;
}

/**
 * The shape of each row returned by `pragma_foreign_key_list(tableName)`.
 */
interface PragmaForeignKeyList {
  /** column name */
  from: string;
  /** ordinal number of column within the foreign key */
  seq: number;
  /** foreign table name */
  table: string;
  /** column name in the foreign table */
  to: string;
}

export function getTablesQuery(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  return compile(
    getSQLiteBuilder<Database>(requirements)
      .selectFrom(
        expressionBuilder()
          .fn<PragmaTableList>("pragma_table_list", [])
          .as("tl"),
      )
      .leftJoin("sqlite_schema as ss", (jb) =>
        jb.onRef("ss.type", "=", "tl.type").onRef("ss.name", "=", "tl.name"),
      )
      .where("tl.type", "in", ["table", "view"])
      // exclude temporary tables/views
      .where("tl.schema", "=", "main")
      // exclude system tables/views
      .where("tl.name", "not like", "sqlite_%")
      .select(["tl.name", "ss.sql"])
      // since we're excluding system tables, `ss.sql` should never be null here.
      .$narrowType<{ sql: NotNull }>()
      .select((eb) => [
        jsonArrayFrom(
          eb
            .selectFrom(
              eb
                .fn<PragmaTableXInfo>("pragma_table_xinfo", ["tl.name"])
                .as("txi"),
            )
            .leftJoin(
              eb
                .fn<PragmaForeignKeyList>("pragma_foreign_key_list", [
                  "tl.name",
                ])
                .as("fkl"),
              "fkl.from",
              "txi.name",
            )
            // exclude hidden columns
            .where("txi.hidden", "!=", 1)
            .select([
              "txi.dflt_value as default",
              "txi.name",
              "txi.pk",
              "txi.type as datatype",
              "fkl.table as fk_table",
              "fkl.to as fk_column",
            ])
            .select((eb) => [
              eb("txi.hidden", "in", [2, 3]).as("computed"),
              eb("txi.notnull", "=", 0).as("nullable"),
            ]),
        ).as("columns"),
      ]),
    { transformations: { columns: "json-parse" } },
  );
}

/**
 * For testing purposes.
 */
export function mockTablesQuery() {
  return [
    {
      name: "animals",
      sql: "CREATE TABLE animals (id INTEGER PRIMARY KEY, name TEXT);",
      columns: [
        {
          name: "id",
          datatype: "INTEGER",
          default: null,
          pk: 1,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
        {
          name: "name",
          datatype: "TEXT",
          default: null,
          pk: 0,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
      ],
    },
    {
      name: "users",
      sql: "CREATE TABLE users (id UUID PRIMARY KEY, created_at TIMESTAMP, deleted_at TIMESTAMP, role varchar, name varchar, name_role text);",
      columns: [
        {
          name: "id",
          datatype: "INTEGER",
          default: null,
          pk: 1,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
        {
          name: "created_at",
          datatype: "TIMESTAMP",
          default: "1970-01-01 00:00:00.000",
          pk: 0,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
        {
          name: "deleted_at",
          datatype: "TIMESTAMP",
          default: null,
          pk: 0,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
        {
          name: "role",
          datatype: "varchar",
          default: null,
          pk: 0,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
        {
          name: "name",
          datatype: "varchar",
          default: null,
          pk: 0,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
        {
          name: "name_role",
          datatype: "text",
          default: null,
          pk: 0,
          computed: 1,
          nullable: 0,
          fk_table: null,
          fk_column: null,
        },
      ],
    },
    {
      name: "composite_pk",
      sql: "CREATE TABLE composite_pk (id UUID, name TEXT, created_at timestamp, PRIMARY KEY (id, name));",
      columns: [
        {
          name: "id",
          datatype: "text",
          default: null,
          pk: 1,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
        {
          name: "name",
          datatype: "TEXT",
          default: null,
          pk: 2,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
        {
          name: "created_at",
          datatype: "timestamp",
          default: "1970-01-01 00:00:00.000",
          pk: 0,
          computed: 0,
          nullable: 1,
          fk_table: null,
          fk_column: null,
        },
      ],
    },
  ] as const satisfies QueryResult<typeof getTablesQuery>;
}
