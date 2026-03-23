import { describe, expect, it, vi } from "vitest";

import type {
  AdapterSqlLintDetails,
  AdapterSqlLintOptions,
  AdapterSqlLintResult,
} from "../../../../data/adapter";
import type { Either } from "../../../../data/type-utils";
import { createSqlLintSource } from "./sql-lint-source";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createView(sql: string) {
  return {
    state: {
      doc: {
        length: sql.length,
        toString() {
          return sql;
        },
      },
    },
  } as const;
}

type LintSqlRunner = (
  details: AdapterSqlLintDetails,
  options: AdapterSqlLintOptions,
) => Promise<Either<Error, AdapterSqlLintResult>>;

describe("sql-lint-source", () => {
  it("skips linting for empty SQL input", async () => {
    const lintSql = vi
      .fn<LintSqlRunner>()
      .mockResolvedValue([null, { diagnostics: [] }]);
    const { source } = createSqlLintSource({ lintSql });

    expect(await source(createView("   ") as never)).toEqual([]);
    expect(lintSql).not.toHaveBeenCalled();
  });

  it("clamps diagnostics to editor bounds", async () => {
    const lintSql = vi.fn<LintSqlRunner>().mockResolvedValue([
      null,
      {
        diagnostics: [
          {
            from: 999,
            message: "oops",
            severity: "error",
            to: 1000,
          },
        ],
      },
    ]);
    const { source } = createSqlLintSource({ lintSql });

    expect(await source(createView("select 1") as never)).toEqual([
      {
        from: 7,
        message: "oops",
        severity: "error",
        to: 8,
      },
    ]);
  });

  it("keeps only one active lint request and drops stale responses", async () => {
    const first = createDeferred<[null, { diagnostics: [] }]>();
    const second = createDeferred<[null, { diagnostics: [] }]>();
    const lintSql = vi
      .fn<LintSqlRunner>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { source } = createSqlLintSource({
      lintSql,
      schemaVersion: "schema-v1",
    });

    const firstPromise = source(createView("select * from users") as never);
    const secondPromise = source(
      createView("select * from organizations") as never,
    );

    const firstCall = lintSql.mock.calls[0];
    const secondCall = lintSql.mock.calls[1];

    if (!firstCall?.[1]?.abortSignal || !secondCall?.[1]?.abortSignal) {
      throw new Error("Expected lintSql to receive abort signals");
    }

    const firstCallAbortSignal = firstCall[1].abortSignal;
    const secondCallAbortSignal = secondCall[1].abortSignal;
    expect(firstCallAbortSignal.aborted).toBe(true);
    expect(secondCallAbortSignal.aborted).toBe(false);

    first.resolve([null, { diagnostics: [] }]);
    second.resolve([null, { diagnostics: [] }]);

    await expect(firstPromise).resolves.toEqual([]);
    await expect(secondPromise).resolves.toEqual([]);
  });

  it("converts lint transport errors into warning diagnostics", async () => {
    const lintSql = vi
      .fn<LintSqlRunner>()
      .mockResolvedValue([new Error("lint unavailable")]);
    const { source } = createSqlLintSource({ lintSql });

    await expect(source(createView("select 1") as never)).resolves.toEqual([
      {
        from: 0,
        message: "lint unavailable",
        severity: "warning",
        source: "studio",
        to: 1,
      },
    ]);
  });
});
