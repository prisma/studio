import { describe, expect, it } from "vitest";

import type { Table } from "../adapter";
import { AbortError, type Executor } from "../executor";
import { FULL_TABLE_SEARCH_TIMEOUT_MESSAGE } from "../full-table-search";
import { createSQLiteAdapter } from "./adapter";

function createNeverAbortedSignal(): AbortSignal {
  const controller = new AbortController();
  return controller.signal;
}

function createSearchTable(): Table {
  return {
    columns: {
      id: {
        datatype: {
          affinity: "INTEGER",
          group: "numeric",
          isArray: false,
          isNative: true,
          name: "integer",
          options: [],
          schema: "main",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: true,
        isComputed: false,
        isRequired: false,
        name: "id",
        nullable: false,
        pkPosition: 1,
        schema: "main",
        table: "users",
      },
      name: {
        datatype: {
          affinity: "TEXT",
          group: "string",
          isArray: false,
          isNative: true,
          name: "text",
          options: [],
          schema: "main",
        },
        defaultValue: null,
        fkColumn: null,
        fkSchema: null,
        fkTable: null,
        isAutoincrement: false,
        isComputed: false,
        isRequired: false,
        name: "name",
        nullable: true,
        pkPosition: null,
        schema: "main",
        table: "users",
      },
    },
    name: "users",
    schema: "main",
  };
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }

    const timeout = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new AbortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createDelayedExecutor(args: {
  delayMs: number;
  delayFirstOnly?: boolean;
}): Executor {
  const { delayFirstOnly = false, delayMs } = args;
  let callCount = 0;

  return {
    async execute(_query, options) {
      callCount += 1;

      if (!delayFirstOnly || callCount === 1) {
        try {
          await sleepWithAbort(delayMs, options?.abortSignal);
        } catch (error: unknown) {
          return [error as Error];
        }
      }

      return [
        null,
        [{ __ps_count__: "1", id: 1, name: "Sam Rivera" }] as never,
      ];
    },
  };
}

describe("sqlite-core/full-table-search adapter guardrails", () => {
  it("returns a timeout error when full-table search exceeds 5 seconds", async () => {
    const adapter = createSQLiteAdapter({
      executor: createDelayedExecutor({
        delayMs: 6_000,
      }),
    });

    const [error] = await adapter.query(
      {
        filter: {
          after: "and",
          filters: [],
          id: "root",
          kind: "FilterGroup",
        },
        fullTableSearchTerm: "sam",
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table: createSearchTable(),
      },
      { abortSignal: createNeverAbortedSignal() },
    );

    expect(error?.message).toBe(FULL_TABLE_SEARCH_TIMEOUT_MESSAGE);
  }, 20_000);

  it("keeps only one active full-table search query at a time", async () => {
    const adapter = createSQLiteAdapter({
      executor: createDelayedExecutor({
        delayFirstOnly: true,
        delayMs: 20_000,
      }),
    });

    const firstSearch = adapter.query(
      {
        filter: {
          after: "and",
          filters: [],
          id: "root",
          kind: "FilterGroup",
        },
        fullTableSearchTerm: "tristan",
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table: createSearchTable(),
      },
      { abortSignal: createNeverAbortedSignal() },
    );

    await sleepWithAbort(100);

    const secondSearch = adapter.query(
      {
        filter: {
          after: "and",
          filters: [],
          id: "root",
          kind: "FilterGroup",
        },
        fullTableSearchTerm: "sam",
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table: createSearchTable(),
      },
      { abortSignal: createNeverAbortedSignal() },
    );

    const [[firstError], [secondError, secondResult]] = await Promise.all([
      firstSearch,
      secondSearch,
    ]);

    expect(firstError).toBeDefined();
    expect(firstError?.name).toBe("AbortError");
    expect(secondError).toBeNull();
    expect(secondResult?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Sam Rivera",
        }),
      ]),
    );
  });
});
