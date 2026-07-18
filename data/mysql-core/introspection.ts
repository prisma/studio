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

/**
 * The flavor of the connected MySQL-compatible server.
 *
 * MariaDB requires a different tables query ({@link getMariaDBTablesQuery}):
 * `json_arrayagg` only exists on MariaDB >= 10.5 and `cast(... as json)` is
 * invalid syntax there because JSON is an alias for LONGTEXT.
 */
export type MySQLServerFlavor = "mariadb" | "mysql";

/**
 * Detects the server flavor from a `select version()` result.
 *
 * MariaDB reports versions like `10.4.34-MariaDB`,
 * `10.11.6-MariaDB-1:10.11.6+maria~ubu2204` or, behind replication-compatible
 * setups, `5.5.5-10.5.23-MariaDB-log`. Anything else is treated as MySQL.
 */
export function detectMySQLServerFlavor(
  version: string | null | undefined,
): MySQLServerFlavor {
  return typeof version === "string" &&
    version.toLowerCase().includes("mariadb")
    ? "mariadb"
    : "mysql";
}

export function getServerVersionQuery(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const builder = getMySQLBuilder(requirements);

  return compile(builder.selectNoFrom(sql<string>`version()`.as("version")));
}

export function mockServerVersionQuery() {
  return [{ version: "8.0.40" }] as const satisfies QueryResult<
    typeof getServerVersionQuery
  >;
}

function getColumnsQuery(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const database = sql<string>`database()`;

  const builder = getMySQLBuilder<Database>(requirements);

  return builder
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
}

export function getTablesQuery(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const database = sql<string>`database()`;

  const columnsQuery = getColumnsQuery(requirements);

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

/**
 * MariaDB-compatible variant of {@link getTablesQuery}.
 *
 * MariaDB has no `json_arrayagg` before 10.5 (#1511) and no JSON cast type at
 * all (#1367), and any server-side string aggregation (`group_concat`,
 * MariaDB's own `json_arrayagg`) silently truncates at the session's
 * `group_concat_max_len`. This query therefore avoids aggregation entirely: it
 * returns one row per column, and {@link groupMariaDBTablesQueryResult} groups
 * the rows into the {@link getTablesQuery} result shape on the client.
 */
export function getMariaDBTablesQuery(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const database = sql<string>`database()`;

  return compile(
    getMySQLBuilder<Database>(requirements)
      .with("cols", () => getColumnsQuery(requirements))
      .selectFrom("information_schema.tables as t")
      .innerJoin("cols as c", (jb) =>
        jb.onRef("c.TABLE_NAME", "=", "t.TABLE_NAME"),
      )
      .where("t.TABLE_SCHEMA", "=", database)
      .where("t.TABLE_TYPE", "in", ["BASE TABLE", "VIEW"])
      .select([
        database.as("schema"),
        "t.TABLE_NAME as name",
        "t.TABLE_TYPE as type",
        "c.autoincrement as column_autoincrement",
        "c.computed as column_computed",
        "c.datatype as column_datatype",
        "c.default as column_default",
        "c.fk_column as column_fk_column",
        "c.fk_table as column_fk_table",
        "c.name as column_name",
        "c.nullable as column_nullable",
        "c.pk as column_pk",
        "c.position as column_position",
      ])
      .$narrowType<{ type: "BASE TABLE" | "VIEW" }>()
      .orderBy("t.TABLE_SCHEMA")
      .orderBy("t.TABLE_NAME")
      .orderBy("t.TABLE_TYPE")
      .orderBy("c.position"),
  );
}

/**
 * Groups the one-row-per-column result of {@link getMariaDBTablesQuery} into
 * the aggregated {@link getTablesQuery} result shape.
 */
export function groupMariaDBTablesQueryResult(
  rows: QueryResult<typeof getMariaDBTablesQuery>,
): QueryResult<typeof getTablesQuery> {
  const tables = new Map<string, QueryResult<typeof getTablesQuery>[number]>();

  for (const row of rows) {
    const key = JSON.stringify([row.schema, row.name, row.type]);

    let table = tables.get(key);

    if (!table) {
      table = {
        columns: [],
        name: row.name,
        schema: row.schema,
        type: row.type,
      };
      tables.set(key, table);
    }

    table.columns.push({
      autoincrement: row.column_autoincrement,
      computed: row.column_computed,
      datatype: row.column_datatype,
      default: row.column_default,
      fk_column: row.column_fk_column,
      fk_table: row.column_fk_table,
      name: row.column_name,
      nullable: row.column_nullable,
      pk: row.column_pk,
      position: row.column_position,
    });
  }

  return [...tables.values()];
}

/**
 * Normalizes the `columns` payload of a tables query result.
 *
 * Some transports return `json_arrayagg` results as strings instead of parsed
 * arrays. This parses those string payloads so downstream consumers always
 * receive arrays.
 */
export function normalizeTablesQueryResult(
  tables: QueryResult<typeof getTablesQuery>,
): QueryResult<typeof getTablesQuery> {
  return tables.map((table) => {
    const { columns } = table;

    if (typeof columns !== "string") {
      return table;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(columns);
    } catch (error: unknown) {
      throw new Error(
        `Failed to parse introspected columns for table "${table.name}".`,
        { cause: error },
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        `Expected introspected columns for table "${table.name}" to be an array.`,
      );
    }

    return { ...table, columns: parsed };
  });
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
