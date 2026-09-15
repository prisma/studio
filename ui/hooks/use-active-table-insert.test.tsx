import {
  createCollection,
  localOnlyCollectionOptions,
} from "@tanstack/react-db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  Adapter,
  AdapterQueryDetails,
  Column,
  Table,
} from "../../data/adapter";
import type { TableQueryMetaState } from "../studio/context";
import { useActiveTableInsert } from "./use-active-table-insert";
import { useActiveTableQueryCollection } from "./use-active-table-query";

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

const TOTAL_ROW_COUNT = 2;

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

function createAdapterMock(): Adapter {
  return {
    defaultSchema: "public",
    insert: vi.fn(async () => {
      return [
        null,
        {
          rows: [],
          query: { parameters: [], sql: "insert" },
        },
      ];
    }),
    query: vi.fn(async (details: AdapterQueryDetails) => {
      const start = details.pageIndex * details.pageSize;
      const end = Math.min(TOTAL_ROW_COUNT, start + details.pageSize);
      const rows = Array.from({ length: Math.max(0, end - start) }, (_, i) => ({
        id: `u${start + i + 1}`,
        name: `User ${start + i + 1}`,
      }));

      return [
        null,
        {
          filteredRowCount: TOTAL_ROW_COUNT,
          query: { parameters: [], sql: "query" },
          rows,
        },
      ];
    }),
  } as unknown as Adapter;
}

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

function createTableQueryExecutionStateCache() {
  const cache = new Map<
    string,
    { activeController: AbortController | null; latestRequestId: number }
  >();

  return {
    getOrCreateTableQueryExecutionState(key: string) {
      const existing = cache.get(key);

      if (existing != null) {
        return existing;
      }

      const created = { activeController: null, latestRequestId: 0 };
      cache.set(key, created);

      return created;
    },
  };
}

function createTableQueryMetaCollection() {
  return createCollection(
    localOnlyCollectionOptions<TableQueryMetaState>({
      id: "test-insert-table-query-meta",
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

const emptyFilter = {
  after: "and" as const,
  filters: [],
  id: "root",
  kind: "FilterGroup" as const,
};

function renderHookHarness(queryProps: {
  pageIndex: number;
  pageSize: number;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const adapter = createAdapterMock();
  const activeTable = createActiveTable();
  const tableQueryMetaCollection = createTableQueryMetaCollection();
  const queryClient = new QueryClient();
  const { getOrCreateRowsCollection } = createRowsCollectionCache();
  const { getOrCreateTableQueryExecutionState } =
    createTableQueryExecutionStateCache();
  const onEvent = vi.fn();

  useStudioMock.mockReturnValue({
    adapter,
    getOrCreateTableQueryExecutionState,
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

  const fullQueryProps = {
    filter: emptyFilter,
    pageIndex: queryProps.pageIndex,
    pageSize: queryProps.pageSize,
    sortOrder: [],
  };

  let latestInsert: ReturnType<typeof useActiveTableInsert> | undefined;

  function Harness() {
    // Ensure the rows collection / active table resolve the same way the view
    // does, so the insert hook has a non-null active table.
    useActiveTableQueryCollection(fullQueryProps);
    latestInsert = useActiveTableInsert(fullQueryProps);

    return null;
  }

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });

  function cleanup() {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
  }

  return {
    adapter,
    cleanup,
    getInsert() {
      return latestInsert;
    },
    onEvent,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useActiveTableInsert", () => {
  it("self-heals introspection on a Postgres type-mismatch insert error (SQLSTATE 42804)", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const { adapter, cleanup, getInsert, onEvent } = renderHookHarness({
      pageIndex: 0,
      pageSize: 25,
    });

    await waitFor(() => getInsert() != null);

    const typeMismatchError = new Error(
      "column is of type varchar but expression is of type boolean",
    ) as Error & { code?: string; query?: unknown };
    typeMismatchError.code = "42804";
    typeMismatchError.query = { parameters: [], sql: "insert" };

    (adapter.insert as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      typeMismatchError,
    ]);

    const insert = getInsert();

    if (!insert) {
      throw new Error("insert hook was not rendered");
    }

    let caught: unknown;

    await act(async () => {
      try {
        await insert.mutateAsync([{ name: "Drifted" }]);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBe(typeMismatchError);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["introspection"] }),
    );
    expect(
      onEvent.mock.calls.some((call: unknown[]) => {
        const event = call[0] as {
          name: string;
          payload: { operation: string };
        };
        return (
          event.name === "studio_operation_error" &&
          event.payload.operation === "insert"
        );
      }),
    ).toBe(true);

    invalidateSpy.mockRestore();
    cleanup();
  });

  it("does not self-heal introspection on a non-type-mismatch insert error", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const { adapter, cleanup, getInsert } = renderHookHarness({
      pageIndex: 0,
      pageSize: 25,
    });

    await waitFor(() => getInsert() != null);

    const uniqueViolation = new Error("duplicate key value") as Error & {
      code?: string;
      query?: unknown;
    };
    uniqueViolation.code = "23505";
    uniqueViolation.query = { parameters: [], sql: "insert" };

    (adapter.insert as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      uniqueViolation,
    ]);

    const insert = getInsert();

    if (!insert) {
      throw new Error("insert hook was not rendered");
    }

    let caught: unknown;

    await act(async () => {
      try {
        await insert.mutateAsync([{ name: "Dupe" }]);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBe(uniqueViolation);
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["introspection"] }),
    );

    invalidateSpy.mockRestore();
    cleanup();
  });
});
