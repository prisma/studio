import { type InferResult, sql } from "kysely";
import { jsonBuildObject } from "kysely/helpers/mysql";

import { type BuilderRequirements, compile, type QueryResult } from "../query";
import { getMySQLBuilder } from "./builder";

interface Database {
  /** https://dev.mysql.com/doc/refman/8.4/en/information-schema-key-column-usage-table.html */
  "information_schema.KEY_COLUMN_USAGE": {
    COLUMN_NAME: string;
    CONSTRAINT_NAME: string;
    ORDINAL_POSITION: number;
    /** null - when unique or primary key constraint. 1-n - when foreign key constraint */
    POSITION_IN_UNIQUE_CONSTRAINT: number | null;
    REFERENCED_COLUMN_NAME: string;
    REFERENCED_TABLE_NAME: string;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
  };
  /** https://dev.mysql.com/doc/refman/8.4/en/information-schema-columns-table.html */
  "information_schema.columns": {
    /** The default value for the column. This is NULL if the column has an explicit default of NULL, or if the column definition includes no DEFAULT clause. */
    COLUMN_DEFAULT: string | null;
    COLUMN_NAME: string;
    /** Contains the type name and possibly other information such as the precision or length. */
    COLUMN_TYPE: string;
    /** Extra information about the column. Possible values are */
    EXTRA:
      | ""
      | "auto_increment"
      | "on update CURRENT_TIMESTAMP"
      | "STORED GENERATED"
      | "VIRTUAL GENERATED"
      | "DEFAULT GENERATED";
    IS_NULLABLE: "YES" | "NO";
    /** The position of the column within the table. ORDINAL_POSITION is necessary because you might want to say ORDER BY ORDINAL_POSITION. Unlike SHOW COLUMNS, SELECT from the COLUMNS table does not have automatic ordering. */
    ORDINAL_POSITION: number;
    TABLE_NAME: string;
    TABLE_SCHEMA: string;
  };
  /** https://dev.mysql.com/doc/refman/8.4/en/information-schema-tables-table.html */
  "information_schema.tables": {
    TABLE_NAME: string;
    /** The name of the schema (database) to which the table belongs. */
    TABLE_SCHEMA: string;
    /** BASE TABLE for a table, VIEW for a view, or SYSTEM VIEW for an INFORMATION_SCHEMA table. */
    TABLE_TYPE: "BASE TABLE" | "VIEW" | "SYSTEM VIEW";
  };
}

export function getTablesQuery(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const database = sql<string>`database()`;

  const builder = getMySQLBuilder<Database>(requirements);

  const columnsQuery = builder
    .selectFrom("information_schema.columns as c")
    .leftJoin("information_schema.KEY_COLUMN_USAGE as kcu", (jb) =>
      jb
        .on("kcu.TABLE_SCHEMA", "=", database)
        .onRef("kcu.TABLE_NAME", "=", "c.TABLE_NAME")
        .onRef("kcu.COLUMN_NAME", "=", "c.COLUMN_NAME")
        // only get foreign key constraints
        .on("kcu.POSITION_IN_UNIQUE_CONSTRAINT", "is not", null),
    )
    .leftJoin("information_schema.KEY_COLUMN_USAGE as pk_kcu", (jb) =>
      jb
        .on("pk_kcu.TABLE_SCHEMA", "=", database)
        .onRef("pk_kcu.TABLE_NAME", "=", "c.TABLE_NAME")
        .onRef("pk_kcu.COLUMN_NAME", "=", "c.COLUMN_NAME")
        // only get primary key constraint - guaranteed to be "PRIMARY" even if a name was given during creation
        .on("pk_kcu.CONSTRAINT_NAME", "=", "PRIMARY"),
    )
    .where("c.TABLE_SCHEMA", "=", database)
    .select([
      "c.COLUMN_DEFAULT as default",
      "c.COLUMN_NAME as name",
      "c.COLUMN_TYPE as datatype",
      "c.ORDINAL_POSITION as position",
      "c.TABLE_NAME",
      "kcu.REFERENCED_TABLE_NAME as fk_table",
      "kcu.REFERENCED_COLUMN_NAME as fk_column",
      "pk_kcu.ORDINAL_POSITION as pk",
    ])
    .select((eb) => [
      eb("c.EXTRA", "=", "auto_increment").as("autoincrement"),
      eb("c.EXTRA", "in", [
        "on update CURRENT_TIMESTAMP",
        "STORED GENERATED",
        "VIRTUAL GENERATED",
      ]).as("computed"),
      eb("c.IS_NULLABLE", "=", "YES").as("nullable"),
    ]);

  return compile(
    getMySQLBuilder<Database>(requirements)
      .with("cols", () => columnsQuery)
      .selectFrom("information_schema.tables as t")
      .innerJoin("cols as c", (jb) =>
        jb.onRef("c.TABLE_NAME", "=", "t.TABLE_NAME"),
      )
      .where("t.TABLE_SCHEMA", "=", database)
      .where("t.TABLE_TYPE", "in", ["BASE TABLE", "VIEW"])
      .groupBy([database, "t.TABLE_NAME", "t.TABLE_TYPE"])
      .select([
        database.as("schema"),
        "t.TABLE_NAME as name",
        "t.TABLE_TYPE as type",
      ])
      .$narrowType<{ type: "BASE TABLE" | "VIEW" }>()
      .select((eb) =>
        eb
          .fn<Omit<InferResult<typeof columnsQuery>[number], "TABLE_NAME">[]>(
            "json_arrayagg",
            [
              jsonBuildObject({
                autoincrement: eb.ref("c.autoincrement"),
                computed: eb.ref("c.computed"),
                datatype: eb.ref("c.datatype"),
                default: eb.ref("c.default"),
                fk_column: eb.ref("c.fk_column"),
                fk_table: eb.ref("c.fk_table"),
                name: eb.ref("c.name"),
                position: eb.ref("c.position"),
                pk: eb.ref("c.pk"),
                nullable: eb.ref("c.nullable"),
              }),
            ],
          )
          .as("columns"),
      )
      .orderBy("t.TABLE_SCHEMA")
      .orderBy("t.TABLE_NAME")
      .orderBy("t.TABLE_TYPE"),
  );
}

export function mockTablesQuery() {
  return [
    {
      columns: [
        {
          autoincrement: 1,
          computed: 0,
          datatype: "int",
          default: null,
          fk_column: null,
          fk_table: null,
          name: "id",
          nullable: 0,
          pk: 1,
          position: 1,
        },
        {
          autoincrement: 0,
          computed: 0,
          datatype: "binary(16)",
          default: "uuid_to_bin(uuid())",
          fk_column: null,
          fk_table: null,
          name: "uuid",
          nullable: 1,
          pk: null,
          position: 2,
        },
        {
          autoincrement: 0,
          computed: 0,
          datatype: "varchar(255)",
          default: null,
          fk_column: null,
          fk_table: null,
          name: "name",
          nullable: 1,
          pk: null,
          position: 3,
        },
        {
          autoincrement: 0,
          computed: 1,
          datatype: "text",
          default: null,
          fk_column: null,
          fk_table: null,
          name: "id_name",
          nullable: 1,
          pk: null,
          position: 4,
        },
      ],
      name: "animals",
      schema: "studio",
      type: "BASE TABLE",
    },
    {
      columns: [
        {
          autoincrement: 0,
          computed: 0,
          datatype: "char(36)",
          default: "uuid()",
          fk_column: null,
          fk_table: null,
          name: "id",
          nullable: 0,
          pk: 1,
          position: 1,
        },
        {
          autoincrement: 0,
          computed: 0,
          datatype: "text",
          default: null,
          fk_column: null,
          fk_table: null,
          name: "name",
          nullable: 0,
          pk: 2,
          position: 2,
        },
        {
          autoincrement: 0,
          computed: 0,
          datatype: "timestamp",
          default: "CURRENT_TIMESTAMP",
          fk_column: null,
          fk_table: null,
          name: "created_at",
          nullable: 1,
          pk: null,
          position: 3,
        },
      ],
      name: "composite_pk",
      schema: "studio",
      type: "BASE TABLE",
    },
    {
      columns: [
        {
          autoincrement: 1,
          computed: 0,
          datatype: "int",
          default: null,
          fk_column: null,
          fk_table: null,
          name: "id",
          nullable: 0,
          pk: 1,
          position: 1,
        },
        {
          autoincrement: 0,
          computed: 0,
          datatype: "timestamp",
          default: "current_timestamp",
          fk_column: null,
          fk_table: null,
          name: "created_at",
          nullable: 1,
          pk: null,
          position: 2,
        },
        {
          autoincrement: 0,
          computed: 0,
          datatype: "timestamp",
          default: null,
          fk_column: null,
          fk_table: null,
          name: "deleted_at",
          nullable: 1,
          pk: null,
          position: 3,
        },
        {
          autoincrement: 0,
          computed: 0,
          datatype: "text",
          default: null,
          fk_column: null,
          fk_table: null,
          name: "role",
          nullable: 1,
          pk: null,
          position: 4,
        },
        {
          autoincrement: 0,
          computed: 0,
          datatype: "text",
          default: null,
          fk_column: null,
          fk_table: null,
          name: "name",
          nullable: 1,
          pk: null,
          position: 5,
        },
        {
          autoincrement: 0,
          computed: 1,
          datatype: "text",
          default: null,
          fk_column: null,
          fk_table: null,
          name: "name_role",
          nullable: 1,
          pk: null,
          position: 6,
        },
      ],
      name: "users",
      schema: "studio",
      type: "BASE TABLE",
    },
  ] as const satisfies QueryResult<typeof getTablesQuery>;
}

export function getTimezoneQuery(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const builder = getMySQLBuilder(requirements);

  const sessionTz = sql<"SYSTEM" | (string & {})>`@@session.time_zone`;

  return compile(
    builder
      .selectNoFrom(
        builder
          .case()
          .when(sessionTz, "=", "SYSTEM")
          .then(sql<string>`@@system_time_zone`)
          .else(sessionTz)
          .end()
          .as("timezone"),
      )
      .$narrowType<{ timezone: string }>(),
  );
}

export function mockTimezoneQuery() {
  return [{ timezone: "UTC" }] as const satisfies QueryResult<
    typeof getTimezoneQuery
  >;
}
