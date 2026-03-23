import {
  createCollection,
  localOnlyCollectionOptions,
} from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  Adapter,
  AdapterIntrospectResult,
  AdapterQueryDetails,
  AdapterUpdateManyDetails,
  Column,
  FilterGroup,
  SortOrderItem,
  Table,
} from "../../data/adapter";
import type { TableQueryMetaState } from "../studio/context";
import { useActiveTableRowsCollection } from "./use-active-table-rows-collection";

const useStudioMock = vi.fn();
const useNavigationMock = vi.fn();

vi.mock("../studio/context", () => ({
  useStudio: () => useStudioMock(),
}));

vi.mock("./use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createColumn(params: {
  name: string;
  pkPosition: number | null;
}): Column {
  const { name, pkPosition } = params;

  return {
    datatype: {
      group: "string",
      isArray: false,
      isNative: true,
      name: "text",
      options: [],
      schema: "public",
    },
    defaultValue: null,
    fkColumn: null,
    fkSchema: null,
    fkTable: null,
    isAutoincrement: false,
    isComputed: false,
    isRequired: pkPosition != null,
    name,
    nullable: pkPosition == null,
    pkPosition,
    schema: "public",
    table: "users",
  };
}

function createActiveTable(): Table {
  return {
    columns: {
      id: createColumn({ name: "id", pkPosition: 1 }),
      name: createColumn({ name: "name", pkPosition: null }),
    },
    name: "users",
    schema: "public",
  };
}

function createAdapterMock(options?: {
  queryImplementation?: (details: AdapterQueryDetails) => Promise<
    [
      null,
      {
        filteredRowCount: number;
        query: { parameters: unknown[]; sql: string };
        rows: Record<string, unknown>[];
      },
    ]
  >;
}): Adapter {
  const introspection: AdapterIntrospectResult = {
    schemas: {},
    timezone: "UTC",
    filterOperators: ["="],
    query: {
      parameters: [],
      sql: "",
    },
  };

  return {
    delete: vi.fn(async () => {
      return [
        null,
        {
          rows: [],
          query: {
            parameters: [],
            sql: "delete",
          },
        },
      ];
    }),
    defaultSchema: "public",
    insert: vi.fn(async () => {
      return [
        null,
        {
          rows: [],
          query: {
            parameters: [],
            sql: "insert",
          },
        },
      ];
    }),
    introspect: vi.fn(async () => {
      return [null, introspection];
    }),
    query: vi.fn(
      options?.queryImplementation ??
        (async () => {
          return [
            null,
            {
              filteredRowCount: 2,
              query: {
                parameters: [],
                sql: "query",
              },
              rows: [
                { id: "u1", name: "Alice" },
                { id: "u2", name: "Bob" },
              ],
            },
          ];
        }),
    ),
    update: vi.fn(async (details) => {
      return [
        null,
        {
          query: {
            parameters: [],
            sql: "update",
          },
          row: {
            ...details.row,
            ...details.changes,
            __ps_updated_at__: new Date().toISOString(),
          },
        },
      ];
    }),
    updateMany: vi.fn(async (details: AdapterUpdateManyDetails) => {
      return [
        null,
        {
          queries: details.updates.map(() => ({
            parameters: [],
            sql: "update-many",
          })),
          rows: details.updates.map((update: AdapterUpdateManyDetails["updates"][number]) => ({
            ...update.row,
            ...update.changes,
            __ps_updated_at__: new Date().toISOString(),
          })),
        },
      ];
    }),
  } as unknown as Adapter;
}

type QueryImplementation = NonNullable<
  Parameters<typeof createAdapterMock>[0]
>["queryImplementation"];

function createRowsCollectionCache() {
  const cache = new Map<string, unknown>();

  return {
    getOrCreateRowsCollection<T>(key: string, factory: () => T): T {
      const existing = cache.get(key) as T | undefined;

      if (existing != null) {
        return existing;
      }

      const created = factory();
      cache.set(key, created);

      return created;
    },
  };
}

function createTableQueryMetaCollection() {
  return createCollection(
    localOnlyCollectionOptions<TableQueryMetaState>({
      id: "test-table-query-meta",
      getKey(item) {
        return item.id;
      },
      initialData: [],
    }),
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const timeoutMs = 2000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (assertion()) {
      return;
    }

    await flush();
  }

  throw new Error("Timed out waiting for hook state");
}

function renderHookHarness(args?: {
  filter?: FilterGroup;
  pageIndex?: number;
  pageSize?: number;
  sortOrder?: SortOrderItem[];
  queryImplementation?: QueryImplementation;
  withoutUpdateMany?: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const adapter = createAdapterMock({
    queryImplementation: args?.queryImplementation,
  });

  if (args?.withoutUpdateMany) {
    delete (adapter as Partial<Adapter>).updateMany;
  }
  const activeTable = createActiveTable();
  const tableQueryMetaCollection = createTableQueryMetaCollection();
  const queryClient = new QueryClient();
  const { getOrCreateRowsCollection } = createRowsCollectionCache();
  const onEvent = vi.fn();

  useStudioMock.mockReturnValue({
    adapter,
    getOrCreateRowsCollection,
    onEvent,
    queryClient,
    tableQueryMetaCollection,
  });
  useNavigationMock.mockReturnValue({
    metadata: {
      activeTable,
    },
  });

  let latestState: ReturnType<typeof useActiveTableRowsCollection> | undefined;
  let currentArgs = {
    filter: args?.filter ?? {
      after: "and" as const,
      filters: [],
      id: "root",
      kind: "FilterGroup" as const,
    },
    pageIndex: args?.pageIndex ?? 0,
    pageSize: args?.pageSize ?? 25,
    sortOrder: args?.sortOrder ?? [],
  };

  function Harness() {
    latestState = useActiveTableRowsCollection({
      filter: currentArgs.filter,
      pageIndex: currentArgs.pageIndex,
      pageSize: currentArgs.pageSize,
      sortOrder: currentArgs.sortOrder,
    });

    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  function cleanup() {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
  }

  return {
    activeTable,
    adapter,
    cleanup,
    getLatestState() {
      return latestState;
    },
    onEvent,
    rerender(nextArgs: Partial<typeof currentArgs>) {
      currentArgs = {
        ...currentArgs,
        ...nextArgs,
      };

      act(() => {
        root.render(<Harness />);
      });
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useActiveTableRowsCollection", () => {
  it("preserves adapter row order rather than sorting by row key", async () => {
    const { cleanup, getLatestState } = renderHookHarness({
      queryImplementation: async () => {
        return [
          null,
          {
            filteredRowCount: 2,
            query: {
              parameters: [],
              sql: "query-desc",
            },
            rows: [
              { id: "u2", name: "Bob" },
              { id: "u1", name: "Alice" },
            ],
          },
        ];
      },
    });

    await waitFor(() => (getLatestState()?.rows.length ?? 0) === 2);

    expect(getLatestState()?.rows.map((row) => row.id)).toEqual(["u2", "u1"]);

    cleanup();
  });

  it("loads rows and filtered row count through query collection", async () => {
    const { adapter, cleanup, getLatestState } = renderHookHarness();

    await waitFor(() => (getLatestState()?.rows.length ?? 0) === 2);
    await waitFor(() => getLatestState()?.filteredRowCount === 2);

    expect(adapter.query).toHaveBeenCalledWith(
      {
        filter: {
          after: "and",
          filters: [],
          id: "root",
          kind: "FilterGroup",
        },
        fullTableSearchTerm: undefined,
        pageIndex: 0,
        pageSize: 25,
        sortOrder: [],
        table: createActiveTable(),
      },
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
    const loadedState = getLatestState();

    expect(loadedState?.filteredRowCount).toBe(2);
    expect(loadedState?.rows).toEqual([
      expect.objectContaining({
        __ps_rowid: expect.any(String),
        id: "u1",
        name: "Alice",
      }),
      expect.objectContaining({
        __ps_rowid: expect.any(String),
        id: "u2",
        name: "Bob",
      }),
    ]);

    cleanup();
  });

  it("persists row updates through adapter.update via collection mutations", async () => {
    const { adapter, cleanup, getLatestState } = renderHookHarness();

    await waitFor(() => (getLatestState()?.rows.length ?? 0) === 2);

    const state = getLatestState();

    if (!state?.collection) {
      throw new Error("Rows collection was not created");
    }

    const collection = state.collection;

    if (!collection) {
      throw new Error("Rows collection was not created");
    }

    const rowId = String([...collection.keys()][0] ?? "");

    await act(async () => {
      const tx = collection.update(rowId, (draft) => {
        draft.name = "Alice Updated";
      });

      await tx.isPersisted.promise;
    });

    expect(adapter.update).toHaveBeenCalledTimes(1);
    expect(adapter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { name: "Alice Updated" },
        table: createActiveTable(),
      }),
      {},
    );

    cleanup();
  });

  it("persists multi-row updates through adapter.updateMany via one collection transaction", async () => {
    const { adapter, cleanup, getLatestState } = renderHookHarness();

    await waitFor(() => (getLatestState()?.rows.length ?? 0) === 2);

    const state = getLatestState();

    if (!state?.collection) {
      throw new Error("Rows collection was not created");
    }

    const collection = state.collection;
    const rowIds = [...collection.keys()].map(String);

    await act(async () => {
      const tx = collection.update(rowIds, (drafts) => {
        drafts[0]!.name = "Alice Updated";
        drafts[1]!.name = "Bob Updated";
      });

      await tx.isPersisted.promise;
    });

    expect((adapter as Adapter & { updateMany: ReturnType<typeof vi.fn> }).updateMany).toHaveBeenCalledTimes(1);
    expect((adapter as Adapter & { updateMany: ReturnType<typeof vi.fn> }).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        table: createActiveTable(),
        updates: [
          expect.objectContaining({
            changes: { name: "Alice Updated" },
          }),
          expect.objectContaining({
            changes: { name: "Bob Updated" },
          }),
        ],
      }),
      {},
    );
    expect(adapter.update).not.toHaveBeenCalled();

    cleanup();
  });

  it("falls back to adapter.update for multi-row updates when updateMany is unavailable", async () => {
    const { adapter, cleanup, getLatestState } = renderHookHarness({
      withoutUpdateMany: true,
    });

    await waitFor(() => (getLatestState()?.rows.length ?? 0) === 2);

    const state = getLatestState();

    if (!state?.collection) {
      throw new Error("Rows collection was not created");
    }

    const collection = state.collection;
    const rowIds = [...collection.keys()].map(String);

    await act(async () => {
      const tx = collection.update(rowIds, (drafts) => {
        drafts[0]!.name = "Alice Updated";
        drafts[1]!.name = "Bob Updated";
      });

      await tx.isPersisted.promise;
    });

    expect(adapter.update).toHaveBeenCalledTimes(2);
    expect(adapter.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        changes: { name: "Alice Updated" },
        table: createActiveTable(),
      }),
      {},
    );
    expect(adapter.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        changes: { name: "Bob Updated" },
        table: createActiveTable(),
      }),
      {},
    );

    cleanup();
  });

  it("clears isFetching after refetch completes even when rows are unchanged", async () => {
    let queryCalls = 0;
    let releaseRefetch: (() => void) | undefined;

    const queryImplementation: QueryImplementation = async () => {
      queryCalls += 1;

      if (queryCalls === 1) {
        return [
          null,
          {
            filteredRowCount: 2,
            query: { parameters: [], sql: "query-initial" },
            rows: [
              { id: "u1", name: "Alice" },
              { id: "u2", name: "Bob" },
            ],
          },
        ];
      }

      await new Promise<void>((resolve) => {
        releaseRefetch = resolve;
      });

      return [
        null,
        {
          filteredRowCount: 2,
          query: { parameters: [], sql: "query-refetch" },
          rows: [
            { id: "u1", name: "Alice" },
            { id: "u2", name: "Bob" },
          ],
        },
      ];
    };

    const { cleanup, getLatestState } = renderHookHarness({
      queryImplementation,
    });

    await waitFor(() => (getLatestState()?.rows.length ?? 0) === 2);
    expect(getLatestState()?.isFetching).toBe(false);

    const refetchPromise = getLatestState()?.refetch();

    await waitFor(() => queryCalls === 2);

    releaseRefetch?.();
    await refetchPromise;

    await waitFor(() => getLatestState()?.isFetching === false);

    cleanup();
  });

  it("preserves filtered row count while a different page is loading", async () => {
    let queryCalls = 0;
    let releaseSecondPage: (() => void) | undefined;

    const { cleanup, getLatestState, rerender } = renderHookHarness({
      queryImplementation: async (details) => {
        queryCalls += 1;

        if (details.pageIndex === 0) {
          return [
            null,
            {
              filteredRowCount: 52,
              query: { parameters: [], sql: "query-page-0" },
              rows: [
                { id: "u1", name: "Alice" },
                { id: "u2", name: "Bob" },
              ],
            },
          ];
        }

        await new Promise<void>((resolve) => {
          releaseSecondPage = resolve;
        });

        return [
          null,
          {
            filteredRowCount: 52,
            query: { parameters: [], sql: "query-page-1" },
            rows: [
              { id: "u26", name: "Carol" },
              { id: "u27", name: "Dave" },
            ],
          },
        ];
      },
    });

    await waitFor(() => getLatestState()?.filteredRowCount === 52);
    expect(getLatestState()?.isFetching).toBe(false);

    rerender({ pageIndex: 1 });

    await waitFor(() => queryCalls === 2);
    expect(getLatestState()?.isFetching).toBe(true);
    expect(getLatestState()?.filteredRowCount).toBe(52);

    releaseSecondPage?.();

    await waitFor(() => getLatestState()?.isFetching === false);
    expect(getLatestState()?.filteredRowCount).toBe(52);

    cleanup();
  });
});
