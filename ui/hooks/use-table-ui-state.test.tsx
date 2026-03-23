import {
  createCollection,
  localOnlyCollectionOptions,
} from "@tanstack/react-db";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Table } from "../../data/adapter";
import type { TableUiState } from "../studio/context";
import { useTableUiState } from "./use-table-ui-state";

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

function createTable(): Table {
  return {
    columns: {},
    name: "users",
    schema: "public",
  };
}

function createTableUiStateCollection() {
  return createCollection(
    localOnlyCollectionOptions<TableUiState>({
      id: "test-table-ui-state",
      getKey(item) {
        return item.id;
      },
      initialData: [],
    }),
  );
}

function renderHarness(defaults?: Parameters<typeof useTableUiState>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latestState: ReturnType<typeof useTableUiState> | undefined;

  function Harness() {
    latestState = useTableUiState(defaults);
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  function cleanup() {
    act(() => {
      root.unmount();
    });
    container.remove();
  }

  return {
    cleanup,
    getLatestState() {
      return latestState;
    },
  };
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

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useTableUiState", () => {
  it("initializes table UI state for active table and applies updates", async () => {
    const tableUiStateCollection = createTableUiStateCollection();

    useStudioMock.mockReturnValue({
      tableUiStateCollection,
    });
    useNavigationMock.mockReturnValue({
      metadata: {
        activeTable: createTable(),
      },
    });

    const { cleanup, getLatestState } = renderHarness({
      editingFilter: {
        after: "and",
        filters: [],
        id: "default-filter",
        kind: "FilterGroup",
      },
      stagedRows: [{ id: "staged-1" }],
      stagedUpdates: [
        {
          changes: { name: "Alice Updated" },
          row: { __ps_rowid: "row-1", id: "u1", name: "Alice" },
          rowId: "row-1",
        },
      ],
    });

    const initial = getLatestState();

    expect(initial?.scopeKey).toBe("public.users");
    expect(tableUiStateCollection.get("public.users")).toEqual(
      expect.objectContaining({
        id: "public.users",
        stagedRows: [{ id: "staged-1" }],
        stagedUpdates: [
          {
            changes: { name: "Alice Updated" },
            row: { __ps_rowid: "row-1", id: "u1", name: "Alice" },
            rowId: "row-1",
          },
        ],
      }),
    );

    act(() => {
      initial?.updateTableUiState((draft) => {
        draft.stagedRows = [{ id: "staged-2" }];
        draft.stagedUpdates = [
          {
            changes: { name: "Alice Draft" },
            row: { __ps_rowid: "row-2", id: "u2", name: "Alice" },
            rowId: "row-2",
          },
        ];
      });
    });

    expect(tableUiStateCollection.get("public.users")?.stagedRows).toEqual([
      { id: "staged-2" },
    ]);
    expect(tableUiStateCollection.get("public.users")?.stagedUpdates).toEqual([
      {
        changes: { name: "Alice Draft" },
        row: { __ps_rowid: "row-2", id: "u2", name: "Alice" },
        rowId: "row-2",
      },
    ]);
    await waitFor(() => {
      const state = getLatestState()?.tableUiState;
      return (
        JSON.stringify(state?.stagedRows) === '[{"id":"staged-2"}]' &&
        JSON.stringify(state?.stagedUpdates) ===
          '[{"changes":{"name":"Alice Draft"},"row":{"__ps_rowid":"row-2","id":"u2","name":"Alice"},"rowId":"row-2"}]'
      );
    });
    expect(getLatestState()?.tableUiState?.stagedRows).toEqual([
      { id: "staged-2" },
    ]);
    expect(getLatestState()?.tableUiState?.stagedUpdates).toEqual([
      {
        changes: { name: "Alice Draft" },
        row: { __ps_rowid: "row-2", id: "u2", name: "Alice" },
        rowId: "row-2",
      },
    ]);

    cleanup();
  });
});
