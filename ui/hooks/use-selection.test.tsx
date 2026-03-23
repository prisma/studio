import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSelection } from "./use-selection";

interface PaginationHookValue {
  paginationState: {
    pageIndex: number;
    pageSize: number;
  };
}

interface ActiveTableDeleteHookValue {
  mutate: (
    rows: Record<string, unknown>[],
    options: { onSuccess?: () => void },
  ) => void;
}

interface TableUiStateHookValue {
  scopeKey: string;
  tableUiState: {
    editingFilter: {
      after: string;
      filters: unknown[];
      id: string;
      kind: string;
    };
    id: string;
    rowSelectionState: Record<string, boolean>;
    stagedRows: Record<string, unknown>[];
  };
  updateTableUiState: (
    updater: (draft: TableUiStateHookValue["tableUiState"]) => void,
  ) => void;
}

const usePaginationMock = vi.fn<() => PaginationHookValue>();
const useActiveTableDeleteMock = vi.fn<() => ActiveTableDeleteHookValue>();
const useTableUiStateMock = vi.fn<() => TableUiStateHookValue>();

vi.mock("./use-pagination", () => ({
  usePagination: (): PaginationHookValue => usePaginationMock(),
}));

vi.mock("./use-active-table-delete", () => ({
  useActiveTableDelete: (): ActiveTableDeleteHookValue =>
    useActiveTableDeleteMock(),
}));

vi.mock("./use-table-ui-state", () => ({
  useTableUiState: (): TableUiStateHookValue => useTableUiStateMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHarness(data: { rows: Record<string, unknown>[] }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latestState: ReturnType<typeof useSelection> | undefined;

  function Harness() {
    latestState = useSelection(data);
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  function rerender() {
    act(() => {
      root.render(<Harness />);
    });
  }

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
    rerender,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useSelection", () => {
  it("clears persisted row selection when pagination page changes", () => {
    const rows = [
      { __ps_rowid: "row-1", id: "u1" },
      { __ps_rowid: "row-2", id: "u2" },
    ];
    let pageIndex = 0;
    let tableUiState = {
      editingFilter: {
        after: "and",
        filters: [],
        id: "root",
        kind: "FilterGroup",
      },
      id: "public.users",
      rowSelectionState: { "row-1": true },
      stagedRows: [],
    };
    const updateTableUiState = vi.fn(
      (updater: (draft: typeof tableUiState) => void) => {
        const draft = structuredClone(tableUiState);
        updater(draft);
        tableUiState = draft;
      },
    );

    usePaginationMock.mockImplementation(() => ({
      paginationState: { pageIndex, pageSize: 25 },
    }));
    useActiveTableDeleteMock.mockReturnValue({ mutate: vi.fn() });
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState,
      updateTableUiState,
    }));

    const { cleanup, rerender } = renderHarness({ rows });

    expect(tableUiState.rowSelectionState).toEqual({ "row-1": true });

    pageIndex = 1;
    rerender();

    expect(tableUiState.rowSelectionState).toEqual({});

    cleanup();
  });

  it("clears persisted row selection when page size changes", () => {
    const rows = [
      { __ps_rowid: "row-1", id: "u1" },
      { __ps_rowid: "row-2", id: "u2" },
    ];
    let pageSize = 25;
    let tableUiState = {
      editingFilter: {
        after: "and",
        filters: [],
        id: "root",
        kind: "FilterGroup",
      },
      id: "public.users",
      rowSelectionState: { "row-2": true },
      stagedRows: [],
    };
    const updateTableUiState = vi.fn(
      (updater: (draft: typeof tableUiState) => void) => {
        const draft = structuredClone(tableUiState);
        updater(draft);
        tableUiState = draft;
      },
    );

    usePaginationMock.mockImplementation(() => ({
      paginationState: { pageIndex: 0, pageSize },
    }));
    useActiveTableDeleteMock.mockReturnValue({ mutate: vi.fn() });
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState,
      updateTableUiState,
    }));

    const { cleanup, rerender } = renderHarness({ rows });

    expect(tableUiState.rowSelectionState).toEqual({ "row-2": true });

    pageSize = 50;
    rerender();

    expect(tableUiState.rowSelectionState).toEqual({});

    cleanup();
  });

  it("deletes selected rows and clears selection after success", () => {
    const rows = [
      { __ps_rowid: "row-1", id: "u1" },
      { __ps_rowid: "row-2", id: "u2" },
    ];
    let tableUiState = {
      editingFilter: {
        after: "and",
        filters: [],
        id: "root",
        kind: "FilterGroup",
      },
      id: "public.users",
      rowSelectionState: { "row-2": true },
      stagedRows: [],
    };
    const updateTableUiState = vi.fn(
      (updater: (draft: typeof tableUiState) => void) => {
        const draft = structuredClone(tableUiState);
        updater(draft);
        tableUiState = draft;
      },
    );
    const mutate = vi.fn(
      (
        selectedRows: Record<string, unknown>[],
        options: { onSuccess?: () => void },
      ) => {
        expect(selectedRows).toEqual([{ __ps_rowid: "row-2", id: "u2" }]);
        options.onSuccess?.();
      },
    );

    usePaginationMock.mockReturnValue({
      paginationState: { pageIndex: 0, pageSize: 25 },
    });
    useActiveTableDeleteMock.mockReturnValue({ mutate });
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState,
      updateTableUiState,
    }));

    const harness = renderHarness({ rows });
    const latestState = harness.getLatestState();

    act(() => {
      latestState?.deleteSelection();
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(tableUiState.rowSelectionState).toEqual({});

    harness.cleanup();
  });
});
