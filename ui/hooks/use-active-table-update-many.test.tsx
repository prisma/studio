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
import { useActiveTableQueryCollection } from "./use-active-table-query";
import { useActiveTableUpdateMany } from "./use-active-table-update-many";

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

const TOTAL_ROW_COUNT = 60;

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
          query: {
            parameters: [],
            sql: "query",
          },
          rows,
        },
      ];
    }),
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
          },
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

      const created = {
        activeController: null,
        latestRequestId: 0,
      };
      cache.set(key, created);

      return created;
    },
  };
}

function createTableQueryMetaCollection() {
  return createCollection(
    localOnlyCollectionOptions<TableQueryMetaState>({
      id: "test-update-many-table-query-meta",
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

  useStudioMock.mockReturnValue({
    adapter,
    getOrCreateTableQueryExecutionState,
    getOrCreateRowsCollection,
    onEvent: vi.fn(),
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

  let latestCollectionState:
    | ReturnType<typeof useActiveTableQueryCollection>
    | undefined;
  let latestUpdateMany: ReturnType<typeof useActiveTableUpdateMany> | undefined;

  function Harness() {
    // Same query props the view uses for display: the collection scope holding
    // the visible rows.
    latestCollectionState = useActiveTableQueryCollection(fullQueryProps);
    latestUpdateMany = useActiveTableUpdateMany(fullQueryProps);

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
    getCollectionState() {
      return latestCollectionState;
    },
    getUpdateMany() {
      return latestUpdateMany;
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useActiveTableUpdateMany", () => {
  it("persists edits to rows loaded beyond the first infinite-scroll batch", async () => {
    // Infinite scroll queries pageIndex 0 with a grown pageSize window
    // (2 batches of 25 here). Rows 26..50 are not part of the paginated
    // first page, which previously made saving their edits fail silently.
    const { adapter, cleanup, getCollectionState, getUpdateMany } =
      renderHookHarness({
        pageIndex: 0,
        pageSize: 50,
      });

    await waitFor(() => (getCollectionState()?.rows.length ?? 0) === 50);

    const targetRow = getCollectionState()?.rows[30];

    if (!targetRow) {
      throw new Error("Expected a row beyond the first 25-row batch");
    }

    const updateMany = getUpdateMany();

    if (!updateMany) {
      throw new Error("updateMany hook was not rendered");
    }

    await act(async () => {
      await updateMany.mutateAsync({
        updates: [
          {
            changes: { name: "Renamed via infinite scroll" },
            row: targetRow,
          },
        ],
      });
    });

    expect(adapter.update).toHaveBeenCalledTimes(1);
    expect(adapter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { name: "Renamed via infinite scroll" },
        row: expect.objectContaining({ id: targetRow.id }),
      }),
      {},
    );

    cleanup();
  });
});
