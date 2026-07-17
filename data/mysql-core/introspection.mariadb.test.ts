import { describe, expect, it, vi } from "vitest";

import type { SequenceExecutor } from "../executor";
import type { Query } from "../query";
import { createMySQLAdapter } from "./adapter";
import {
  detectMySQLServerFlavor,
  getServerVersionQuery,
  getTablesQuery,
  mockTablesQuery,
  normalizeTablesQueryResult,
} from "./introspection";

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

  describe("getTablesQuery", () => {
    it("uses json_arrayagg for MySQL", () => {
      const query = getTablesQuery(undefined, "mysql");

      expect(query.sql).toContain("json_arrayagg(json_object(");
      expect(query.sql).not.toContain("group_concat");
    });

    it("uses json_arrayagg for the default flavor", () => {
      expect(getTablesQuery().sql).toContain("json_arrayagg(json_object(");
    });

    it("avoids json_arrayagg and json casts for MariaDB", () => {
      const query = getTablesQuery(undefined, "mariadb");

      // json_arrayagg only exists on MariaDB >= 10.5 (#1511) and
      // cast(... as json) is invalid syntax on MariaDB (#1367).
      expect(query.sql).not.toContain("json_arrayagg");
      expect(query.sql.toLowerCase()).not.toContain("as json)");
      expect(query.sql).toContain(
        "coalesce(concat('[', group_concat(json_object(",
      );
      expect(query.sql).toContain("separator ','), ']'), '[]')");
    });

    it("keeps everything but the columns aggregation identical across flavors", () => {
      const mysqlQuery = getTablesQuery(undefined, "mysql");
      const mariadbQuery = getTablesQuery(undefined, "mariadb");

      expect(mariadbQuery.parameters).toEqual(mysqlQuery.parameters);
      expect(mariadbQuery.sql).toBe(
        mysqlQuery.sql.replace(
          /json_arrayagg\((.*)\) as `columns`/,
          "coalesce(concat('[', group_concat($1 separator ','), ']'), '[]') as `columns`",
        ),
      );
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
      stringifyColumns?: boolean;
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

        const tables = mockTablesQuery();

        return Promise.resolve([
          null,
          (args.stringifyColumns
            ? tables.map((table) => ({
                ...table,
                columns: JSON.stringify(table.columns),
              }))
            : tables) as never,
        ]);
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
        stringifyColumns: true,
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
      expect(tablesQuery?.sql).toContain("group_concat(json_object(");
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
        stringifyColumns: true,
      });
      const adapter = createMySQLAdapter({ executor });

      await adapter.introspect({});
      await adapter.introspect({});

      const versionQueries = queries.filter((query) =>
        query.sql.toLowerCase().includes("version()"),
      );

      expect(versionQueries).toHaveLength(1);
    });

    it("parses string-aggregated columns even on MySQL transports", async () => {
      const { executor } = createRecordingExecutor({
        version: "8.0.40",
        stringifyColumns: true,
      });
      const adapter = createMySQLAdapter({ executor });

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
