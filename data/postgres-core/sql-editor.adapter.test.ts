import { describe, expect, it, vi } from "vitest";

import type { AdapterSqlLintResult } from "../adapter";
import type { Executor } from "../executor";
import { createPostgresAdapter } from "./adapter";
import { mockTablesQuery, mockTimezoneQuery } from "./introspection";

function createExecutor(): Executor {
  const execute: Executor["execute"] = (query) => {
    if (
      query.sql.includes(`from "pg_catalog"."pg_class"`) &&
      query.sql.includes(`"pg_catalog"."pg_namespace"`)
    ) {
      return Promise.resolve([null, mockTablesQuery() as never]);
    }

    if (query.sql.toLowerCase().includes("current_setting('timezone')")) {
      return Promise.resolve([null, mockTimezoneQuery() as never]);
    }

    if (query.sql.startsWith("EXPLAIN ")) {
      return Promise.resolve([null, [] as never]);
    }

    return Promise.resolve([new Error("Unexpected query")]);
  };

  return {
    execute,
  };
}

describe("postgres-core/adapter sql-editor support", () => {
  it("builds SQL editor schema from introspection metadata", async () => {
    const executor = createExecutor();
    const adapter = createPostgresAdapter({ executor });

    const [error, schemaResult] = await adapter.sqlSchema!({}, {});

    expect(error).toBeNull();
    expect(schemaResult).toBeDefined();
    if (!schemaResult) {
      throw new Error("SQL schema result was not returned");
    }

    expect(schemaResult.defaultSchema).toBe("public");
    expect(schemaResult.dialect).toBe("postgresql");
    expect(schemaResult.namespace.public).toBeDefined();
    expect(schemaResult.namespace.public).toHaveProperty("composite_pk");
    expect(schemaResult.namespace.public).toHaveProperty("users");
    expect(schemaResult.version).toMatch(/^schema-/);
  });

  it("always reports sql lint capability for postgres adapters", () => {
    const adapter = createPostgresAdapter({
      executor: createExecutor(),
    });

    expect(adapter.capabilities?.sqlEditorLint).toBe(true);
  });

  it("delegates sql lint to executor lintSql when available", async () => {
    const lintResult: AdapterSqlLintResult = {
      diagnostics: [
        {
          from: 0,
          message: "bad syntax",
          severity: "error",
          to: 1,
        },
      ],
    };
    const lintSql = vi.fn().mockResolvedValue([null, lintResult]);
    const executorWithLint = {
      ...createExecutor(),
      lintSql,
    } as Executor & {
      lintSql: typeof lintSql;
    };
    const adapter = createPostgresAdapter({
      executor: executorWithLint,
    });
    const abortController = new AbortController();

    const [error, result] = await adapter.sqlLint!(
      { sql: "select * from" },
      { abortSignal: abortController.signal },
    );

    expect(error).toBeNull();
    expect(result).toEqual(lintResult);
    expect(lintSql).toHaveBeenCalledWith(
      { sql: "select * from" },
      { abortSignal: abortController.signal },
    );
  });

  it("falls back to EXPLAIN linting when executor has no lintSql method", async () => {
    const adapter = createPostgresAdapter({
      executor: createExecutor(),
    });

    const [error, result] = await adapter.sqlLint!(
      { sql: "select 1" },
      { abortSignal: new AbortController().signal },
    );

    expect(error).toBeNull();
    expect(result).toEqual({
      diagnostics: [],
      schemaVersion: undefined,
    });
  });

  it("falls back to EXPLAIN linting when lint procedure is unsupported", async () => {
    const lintSql = vi.fn().mockResolvedValue([new Error("Invalid procedure")]);
    const execute = vi.fn((query: { sql: string }) => {
      if (query.sql.includes("all_data_typesfail")) {
        return Promise.resolve([
          new Error('relation "public.all_data_typesfail" does not exist'),
        ]);
      }

      return Promise.resolve([null, []]);
    });
    const sql = "select 1;\nselect * from public.all_data_typesfail";
    const missingRelationFrom = sql.indexOf("public.all_data_typesfail");
    const missingRelationTo =
      missingRelationFrom + "public.all_data_typesfail".length;
    const adapter = createPostgresAdapter({
      executor: {
        execute,
        lintSql,
      } as unknown as Executor & { lintSql: typeof lintSql },
    });

    const [error, result] = await adapter.sqlLint!(
      { sql },
      { abortSignal: new AbortController().signal },
    );

    expect(error).toBeNull();
    expect(result?.diagnostics).toEqual([
      {
        code: undefined,
        from: missingRelationFrom,
        message: 'relation "public.all_data_typesfail" does not exist',
        severity: "error",
        source: "postgres",
        to: missingRelationTo,
      },
    ]);
    expect(lintSql).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("falls back to EXPLAIN linting when lint procedure returns unexpected server error", async () => {
    const lintSql = vi
      .fn()
      .mockResolvedValue([new Error("Unexpected Server Error")]);
    const execute = vi.fn((query: { sql: string }) => {
      if (query.sql.includes("all_data_typesfail")) {
        return Promise.resolve([
          new Error('relation "public.all_data_typesfail" does not exist'),
        ]);
      }

      return Promise.resolve([null, []]);
    });
    const sql = "select 1;\nselect * from public.all_data_typesfail";
    const missingRelationFrom = sql.indexOf("public.all_data_typesfail");
    const missingRelationTo =
      missingRelationFrom + "public.all_data_typesfail".length;
    const adapter = createPostgresAdapter({
      executor: {
        execute,
        lintSql,
      } as unknown as Executor & { lintSql: typeof lintSql },
    });

    const [error, result] = await adapter.sqlLint!(
      { sql },
      { abortSignal: new AbortController().signal },
    );
    const [secondError] = await adapter.sqlLint!(
      { sql },
      { abortSignal: new AbortController().signal },
    );

    expect(error).toBeNull();
    expect(secondError).toBeNull();
    expect(result?.diagnostics).toEqual([
      {
        code: undefined,
        from: missingRelationFrom,
        message: 'relation "public.all_data_typesfail" does not exist',
        severity: "error",
        source: "postgres",
        to: missingRelationTo,
      },
    ]);
    expect(lintSql).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
