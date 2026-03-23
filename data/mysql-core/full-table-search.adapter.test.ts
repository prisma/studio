import { describe, expect, it } from "vitest";

import type { Table } from "../adapter";
import { AbortError, type SequenceExecutor } from "../executor";
import { FULL_TABLE_SEARCH_TIMEOUT_MESSAGE } from "../full-table-search";
import { createMySQLAdapter } from "./adapter";

function createNeverAbortedSignal(): AbortSignal {
  const controller = new AbortController();
  return controller.signal;
}

function createSearchTable(): Table {
  return {
    columns: {
      id: {
        datatype: {
          group: "numeric",
          isArray: false,
          isNative: true,
          name: "int",
          options: [],
          schema: "studio",
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
        schema: "studio",
        table: "users",
      },
      name: {
        datatype: {
          group: "string",
          isArray: false,
          isNative: true,
          name: "text",
          options: [],
          schema: "studio",
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
        schema: "studio",
        table: "users",
      },
    },
    name: "users",
    schema: "studio",
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
}): SequenceExecutor {
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
    executeSequence() {
      return Promise.resolve([
        [new Error("executeSequence is not used in this test")],
      ] as never);
    },
  };
}

describe("mysql-core/full-table-search adapter guardrails", () => {
  it("returns a timeout error when full-table search exceeds 5 seconds", async () => {
    const adapter = createMySQLAdapter({
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
    const adapter = createMySQLAdapter({
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
