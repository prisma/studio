import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterAll, describe, expect, it } from "vitest";

import type { Executor } from "../executor";
import { createNodeSQLiteExecutor } from "../node-sqlite";
import { createSQLiteAdapter } from "./adapter";
import { getDatabaseNameQuery } from "./introspection";

describe("sqlite-core database name", () => {
  const directory = mkdtempSync(join(tmpdir(), "studio-database-name-"));
  const databases: DatabaseSync[] = [];

  function openDatabase(fileName: string) {
    const database = new DatabaseSync(
      fileName === ":memory:" ? fileName : join(directory, fileName),
    );
    database.exec("create table if not exists notes (id integer primary key)");
    databases.push(database);

    return database;
  }

  afterAll(() => {
    for (const database of databases) {
      database.close();
    }

    rmSync(directory, { force: true, recursive: true });
  });

  it("reports the file name, never the full path", async () => {
    const adapter = createSQLiteAdapter({
      executor: createNodeSQLiteExecutor(openDatabase("dev.db")),
    });

    const [error, introspection] = await adapter.introspect({});

    expect(error).toBeNull();
    expect(introspection?.databaseName).toBe("dev.db");
    expect(JSON.stringify(introspection)).not.toContain(directory);
  });

  it("reports a different name for a different database file", async () => {
    const [, first] = await createSQLiteAdapter({
      executor: createNodeSQLiteExecutor(openDatabase("staging.db")),
    }).introspect({});
    const [, second] = await createSQLiteAdapter({
      executor: createNodeSQLiteExecutor(openDatabase("production.db")),
    }).introspect({});

    expect(first?.databaseName).toBe("staging.db");
    expect(second?.databaseName).toBe("production.db");
  });

  it("reports no name for an in-memory database", async () => {
    const adapter = createSQLiteAdapter({
      executor: createNodeSQLiteExecutor(openDatabase(":memory:")),
    });

    const [error, introspection] = await adapter.introspect({});

    expect(error).toBeNull();
    expect(introspection).not.toHaveProperty("databaseName");
  });

  it("reduces Windows paths to the file name in SQL", () => {
    const database = openDatabase(":memory:");
    const { sql } = getDatabaseNameQuery();
    // Swap the pragma for a fixed Windows path to exercise the expression.
    const windowsSql = sql
      .replace(
        /from pragma_database_list\(\) as "dl"/,
        `from (select 'main' as "name", 'C:\\Users\\me\\My Project\\dev.db' as "file") as "dl"`,
      )
      .replace("?", "'main'");

    expect(database.prepare(windowsSql).all()).toEqual([
      { databaseName: "dev.db" },
    ]);
  });

  it("still introspects when the host blocks the database-name pragma", async () => {
    const database = openDatabase("blocked.db");
    const realExecutor = createNodeSQLiteExecutor(database);
    const { sql: databaseNameSql } = getDatabaseNameQuery();
    const executor: Executor = {
      ...realExecutor,
      execute(query, options) {
        if (query.sql === databaseNameSql) {
          return Promise.resolve([new Error("not authorized")]);
        }

        return realExecutor.execute(query, options);
      },
    };

    const [error, introspection] = await createSQLiteAdapter({
      executor,
    }).introspect({});

    expect(error).toBeNull();
    expect(introspection?.schemas.main?.tables.notes).toBeDefined();
    expect(introspection).not.toHaveProperty("databaseName");
  });
});
