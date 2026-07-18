import { describe, expect, it, vi } from "vitest";

import type { SequenceExecutor } from "../executor";
import type { Query, QueryResult } from "../query";
import { createMySQLAdapter } from "./adapter";
import {
  detectMySQLServerFlavor,
  getMariaDBTablesQuery,
  getServerVersionQuery,
  getTablesQuery,
  groupMariaDBTablesQueryResult,
  mockTablesQuery,
  normalizeTablesQueryResult,
} from "./introspection";

type MariaDBTablesRow = QueryResult<typeof getMariaDBTablesQuery>[number];

function toMariaDBTablesRows(
  tables: ReturnType<typeof mockTablesQuery> = mockTablesQuery(),
): MariaDBTablesRow[] {
  return tables.flatMap((table) =>
    table.columns.map((column) => ({
      column_autoincrement: column.autoincrement,
      column_computed: column.computed,
      column_datatype: column.datatype,
      column_default: column.default,
      column_fk_column: column.fk_column,
      column_fk_table: column.fk_table,
      column_name: column.name,
      column_nullable: column.nullable,
      column_pk: column.pk,
      column_position: column.position,
      name: table.name,
      schema: table.schema,
      type: table.type,
    })),
  );
}

describe("mysql-core MariaDB introspection compatibility", () => {
  describe("detectMySQLServerFlavor", () => {
    it("detects MariaDB from a plain MariaDB version string", () => {
      expect(detectMySQLServerFlavor("10.4.34-MariaDB")).toBe("mariadb");
    });

    it("detects MariaDB from a distribution-suffixed version string", () => {
      expect(
        detectMySQLServerFlavor("10.11.6-MariaDB-1:10.11.6+maria~ubu2204"),
      ).toBe("mariadb");
    });

    it("detects MariaDB from a replication-prefixed version string", () => {
      expect(detectMySQLServerFlavor("5.5.5-10.5.23-MariaDB-log")).toBe(
        "mariadb",
      );
    });

    it("detects MySQL from a MySQL version string", () => {
      expect(detectMySQLServerFlavor("8.0.40")).toBe("mysql");
      expect(detectMySQLServerFlavor("8.0.40-vitess")).toBe("mysql");
    });

    it("falls back to MySQL when the version is missing", () => {
      expect(detectMySQLServerFlavor(undefined)).toBe("mysql");
      expect(detectMySQLServerFlavor(null)).toBe("mysql");
      expect(detectMySQLServerFlavor("")).toBe("mysql");
    });
  });

  describe("getServerVersionQuery", () => {
    it("selects the server version", () => {
      expect(getServerVersionQuery()).toMatchInlineSnapshot(`
        {
          "parameters": [],
          "sql": "select version() as \`version\`",
          "transformations": undefined,
        }
      `);
    });
  });

  describe("getMariaDBTablesQuery", () => {
    it("uses no JSON functions and no aggregation", () => {
      const query = getMariaDBTablesQuery();
      const sql = query.sql.toLowerCase();

      // json_arrayagg only exists on MariaDB >= 10.5 (#1511) and
      // cast(... as json) is invalid syntax on MariaDB (#1367).
      expect(sql).not.toContain("json_arrayagg");
      expect(sql).not.toContain("as json)");
      expect(sql).not.toContain("json_object");
      // string aggregation is silently truncated at group_concat_max_len,
      // so the MariaDB query must not aggregate at all.
      expect(sql).not.toContain("group_concat");
      expect(sql).not.toContain("group by");
    });

    it("returns one row per column ordered by table and position", () => {
      const query = getMariaDBTablesQuery();

      expect(query.sql).toContain("`c`.`name` as `column_name`");
      expect(query.sql).toContain(
        "order by `t`.`TABLE_SCHEMA`, `t`.`TABLE_NAME`, `t`.`TABLE_TYPE`, `c`.`position`",
      );
    });

    it("compiles to a stable query", () => {
      expect(getMariaDBTablesQuery()).toMatchInlineSnapshot(`
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
          "sql": "with \`cols\` as (select \`c\`.\`COLUMN_DEFAULT\` as \`default\`, \`c\`.\`COLUMN_NAME\` as \`name\`, \`c\`.\`COLUMN_TYPE\` as \`datatype\`, \`c\`.\`ORDINAL_POSITION\` as \`position\`, \`c\`.\`TABLE_NAME\`, \`kcu\`.\`REFERENCED_TABLE_NAME\` as \`fk_table\`, \`kcu\`.\`REFERENCED_COLUMN_NAME\` as \`fk_column\`, \`pk_kcu\`.\`ORDINAL_POSITION\` as \`pk\`, \`c\`.\`EXTRA\` = ? as \`autoincrement\`, \`c\`.\`EXTRA\` in (?, ?, ?) as \`computed\`, \`c\`.\`IS_NULLABLE\` = ? as \`nullable\` from \`information_schema\`.\`columns\` as \`c\` left join \`information_schema\`.\`KEY_COLUMN_USAGE\` as \`kcu\` on \`kcu\`.\`TABLE_SCHEMA\` = database() and \`kcu\`.\`TABLE_NAME\` = \`c\`.\`TABLE_NAME\` and \`kcu\`.\`COLUMN_NAME\` = \`c\`.\`COLUMN_NAME\` and \`kcu\`.\`POSITION_IN_UNIQUE_CONSTRAINT\` is not null left join \`information_schema\`.\`KEY_COLUMN_USAGE\` as \`pk_kcu\` on \`pk_kcu\`.\`TABLE_SCHEMA\` = database() and \`pk_kcu\`.\`TABLE_NAME\` = \`c\`.\`TABLE_NAME\` and \`pk_kcu\`.\`COLUMN_NAME\` = \`c\`.\`COLUMN_NAME\` and \`pk_kcu\`.\`CONSTRAINT_NAME\` = ? where \`c\`.\`TABLE_SCHEMA\` = database()) select database() as \`schema\`, \`t\`.\`TABLE_NAME\` as \`name\`, \`t\`.\`TABLE_TYPE\` as \`type\`, \`c\`.\`autoincrement\` as \`column_autoincrement\`, \`c\`.\`computed\` as \`column_computed\`, \`c\`.\`datatype\` as \`column_datatype\`, \`c\`.\`default\` as \`column_default\`, \`c\`.\`fk_column\` as \`column_fk_column\`, \`c\`.\`fk_table\` as \`column_fk_table\`, \`c\`.\`name\` as \`column_name\`, \`c\`.\`nullable\` as \`column_nullable\`, \`c\`.\`pk\` as \`column_pk\`, \`c\`.\`position\` as \`column_position\` from \`information_schema\`.\`tables\` as \`t\` inner join \`cols\` as \`c\` on \`c\`.\`TABLE_NAME\` = \`t\`.\`TABLE_NAME\` where \`t\`.\`TABLE_SCHEMA\` = database() and \`t\`.\`TABLE_TYPE\` in (?, ?) order by \`t\`.\`TABLE_SCHEMA\`, \`t\`.\`TABLE_NAME\`, \`t\`.\`TABLE_TYPE\`, \`c\`.\`position\`",
          "transformations": undefined,
        }
      `);
    });

    it("keeps the MySQL tables query on json_arrayagg", () => {
      const query = getTablesQuery();

      expect(query.sql).toContain("json_arrayagg(json_object(");
      expect(query.sql).not.toContain("group_concat");
      expect(query.parameters).toEqual(getMariaDBTablesQuery().parameters);
    });
  });

  describe("groupMariaDBTablesQueryResult", () => {
    it("groups one-row-per-column results into the aggregated shape", () => {
      expect(groupMariaDBTablesQueryResult(toMariaDBTablesRows())).toEqual(
        mockTablesQuery(),
      );
    });

    it("returns no tables for no rows", () => {
      expect(groupMariaDBTablesQueryResult([])).toEqual([]);
    });

    it("keeps identically named tables in different schemas apart", () => {
      const rows = toMariaDBTablesRows();
      const otherSchemaRows = rows.map((row) => ({
        ...row,
        schema: "other",
      }));

      const grouped = groupMariaDBTablesQueryResult([
        ...rows,
        ...otherSchemaRows,
      ]);

      expect(grouped).toHaveLength(mockTablesQuery().length * 2);
    });

    it("is not size-limited, unlike server-side string aggregation", () => {
      // group_concat_max_len defaults to 1MB on MariaDB; build metadata well
      // beyond that to prove client-side grouping cannot truncate columns.
      const columnCount = 3000;
      const longDefault = "x".repeat(512);
      const rows: MariaDBTablesRow[] = Array.from(
        { length: columnCount },
        (_, index) => ({
          column_autoincrement: 0,
          column_computed: 0,
          column_datatype: "varchar(1024)",
          column_default: longDefault,
          column_fk_column: null,
          column_fk_table: null,
          column_name: `column_${index}`,
          column_nullable: 1,
          column_pk: null,
          column_position: index + 1,
          name: "wide_table",
          schema: "studio",
          type: "BASE TABLE",
        }),
      );

      expect(JSON.stringify(rows).length).toBeGreaterThan(1024 * 1024);

      const [table] = groupMariaDBTablesQueryResult(rows);

      expect(table?.columns).toHaveLength(columnCount);
      expect(table?.columns.at(0)?.name).toBe("column_0");
      expect(table?.columns.at(-1)?.name).toBe(`column_${columnCount - 1}`);
      expect(table?.columns.at(-1)?.default).toBe(longDefault);
    });
  });

  describe("normalizeTablesQueryResult", () => {
    it("keeps already-parsed columns as-is", () => {
      const tables = mockTablesQuery();

      expect(normalizeTablesQueryResult(tables)).toEqual(tables);
    });

    it("parses string-aggregated columns payloads", () => {
      const tables = mockTablesQuery();
      const stringified = tables.map((table) => ({
        ...table,
        columns: JSON.stringify(table.columns),
      }));

      expect(normalizeTablesQueryResult(stringified as never)).toEqual(tables);
    });

    it("throws a descriptive error for invalid columns payloads", () => {
      const [table] = mockTablesQuery();

      expect(() =>
        normalizeTablesQueryResult([
          { ...table, columns: "{ not json" as never },
        ]),
      ).toThrowError(/animals/);

      expect(() =>
        normalizeTablesQueryResult([
          { ...table, columns: '{"not":"an array"}' as never },
        ]),
      ).toThrowError(/animals/);
    });
  });

  describe("createMySQLAdapter introspect", () => {
    function createRecordingExecutor(args: {
      version?: string;
      versionError?: Error;
    }): { executor: SequenceExecutor; queries: Query<unknown>[] } {
      const queries: Query<unknown>[] = [];

      const execute: SequenceExecutor["execute"] = (query) => {
        queries.push(query);

        const sql = query.sql.toLowerCase();

        if (sql.includes("version()")) {
          if (args.versionError) {
            return Promise.resolve([args.versionError]);
          }

          return Promise.resolve([null, [{ version: args.version }] as never]);
        }

        if (sql.includes("timezone")) {
          return Promise.resolve([null, [{ timezone: "UTC" }] as never]);
        }

        if (sql.includes("column_autoincrement")) {
          // MariaDB-flavored tables query - one row per column.
          return Promise.resolve([null, toMariaDBTablesRows() as never]);
        }

        return Promise.resolve([null, mockTablesQuery() as never]);
      };

      return {
        executor: {
          execute,
          executeSequence: vi.fn() as SequenceExecutor["executeSequence"],
        },
        queries,
      };
    }

    it("uses the MariaDB-compatible tables query against MariaDB", async () => {
      const { executor, queries } = createRecordingExecutor({
        version: "10.4.34-MariaDB",
      });
      const adapter = createMySQLAdapter({ executor });

      const [error, result] = await adapter.introspect({});

      expect(error).toBeNull();
      expect(result?.schemas["studio"]?.tables["animals"]).toBeDefined();
      expect(
        result?.schemas["studio"]?.tables["animals"]?.columns["id"]
          ?.isAutoincrement,
      ).toBe(true);

      const tablesQuery = queries.find((query) =>
        query.sql.includes("information_schema"),
      );

      expect(tablesQuery?.sql).not.toContain("json_arrayagg");
      expect(tablesQuery?.sql).not.toContain("group_concat");
      expect(tablesQuery?.sql).toContain("`column_autoincrement`");
    });

    it("keeps the MySQL tables query against MySQL", async () => {
      const { executor, queries } = createRecordingExecutor({
        version: "8.0.40",
      });
      const adapter = createMySQLAdapter({ executor });

      const [error, result] = await adapter.introspect({});

      expect(error).toBeNull();
      expect(result?.schemas["studio"]?.tables["animals"]).toBeDefined();

      const tablesQuery = queries.find((query) =>
        query.sql.includes("information_schema"),
      );

      expect(tablesQuery?.sql).toContain("json_arrayagg(json_object(");
      expect(tablesQuery?.sql).not.toContain("group_concat");
    });

    it("falls back to the MySQL tables query when version detection fails", async () => {
      const { executor, queries } = createRecordingExecutor({
        versionError: new Error("version() unavailable"),
      });
      const adapter = createMySQLAdapter({ executor });

      const [error, result] = await adapter.introspect({});

      expect(error).toBeNull();
      expect(result?.schemas["studio"]?.tables["animals"]).toBeDefined();

      const tablesQuery = queries.find((query) =>
        query.sql.includes("information_schema"),
      );

      expect(tablesQuery?.sql).toContain("json_arrayagg(json_object(");
    });

    it("detects the server flavor once per adapter", async () => {
      const { executor, queries } = createRecordingExecutor({
        version: "10.11.6-MariaDB",
      });
      const adapter = createMySQLAdapter({ executor });

      await adapter.introspect({});
      await adapter.introspect({});

      const versionQueries = queries.filter((query) =>
        query.sql.toLowerCase().includes("version()"),
      );

      expect(versionQueries).toHaveLength(1);
    });

    it("parses string-aggregated columns on MySQL transports", async () => {
      const { executor } = createRecordingExecutor({ version: "8.0.40" });
      const stringifyingExecutor: SequenceExecutor = {
        ...executor,
        execute: async (query, options) => {
          const [error, rows] = await executor.execute(query, options);

          if (error) {
            return [error];
          }

          if (!query.sql.includes("information_schema")) {
            return [null, rows as never];
          }

          return [
            null,
            (rows as unknown as ReturnType<typeof mockTablesQuery>).map(
              (table) => ({
                ...table,
                columns: JSON.stringify(table.columns),
              }),
            ) as never,
          ];
        },
      };
      const adapter = createMySQLAdapter({ executor: stringifyingExecutor });

      const [error, result] = await adapter.introspect({});

      expect(error).toBeNull();
      expect(
        Object.keys(
          result?.schemas["studio"]?.tables["animals"]?.columns ?? {},
        ),
      ).toContain("id");
    });
  });
});
