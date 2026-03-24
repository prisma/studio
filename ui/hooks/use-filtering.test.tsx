import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FilterGroup, Table } from "../../data/adapter";
import type { EditingFilterGroup } from "./filter-utils";
import { defaultFilter } from "./filter-utils";
import { useFiltering } from "./use-filtering";

interface NavigationMockValue {
  filterParam: string;
  setFilterParam: (value: string) => void;
}

interface TableUiStateMockValue {
  scopeKey: string;
  tableUiState: {
    editingFilter: EditingFilterGroup;
    id: string;
    rowSelectionState: Record<string, boolean>;
    stagedRows: Record<string, unknown>[];
  };
  updateTableUiState: (
    updater: (draft: TableUiStateMockValue["tableUiState"]) => void,
  ) => void;
}

const useNavigationMock = vi.fn<() => NavigationMockValue>();
const useTableUiStateMock = vi.fn<() => TableUiStateMockValue>();

vi.mock("./use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

vi.mock("./use-table-ui-state", () => ({
  useTableUiState: () => useTableUiStateMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeFilter(id: string, column = "name"): FilterGroup {
  return {
    after: "and",
    filters: [
      {
        after: "and",
        column,
        id: `${id}-column`,
        kind: "ColumnFilter",
        operator: "=",
        value: id,
      },
    ],
    id,
    kind: "FilterGroup",
  };
}

const testColumns = {
  email: {
    datatype: {
      group: "string",
      isArray: false,
      isNative: true,
      name: "text",
      options: [],
      schema: "pg_catalog",
    },
    defaultValue: null,
    fkColumn: null,
    fkSchema: null,
    fkTable: null,
    isAutoincrement: false,
    isComputed: false,
    isRequired: false,
    name: "email",
    nullable: true,
    pkPosition: null,
    schema: "public",
    table: "users",
  },
  name: {
    datatype: {
      group: "string",
      isArray: false,
      isNative: true,
      name: "text",
      options: [],
      schema: "pg_catalog",
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
    schema: "public",
    table: "users",
  },
} satisfies Table["columns"];

function renderHarness(columns?: Table["columns"]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latestState: ReturnType<typeof useFiltering> | undefined;

  function Harness() {
    latestState = useFiltering(columns);
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
    cleanup: () => cleanup(),
    getLatestState: () => latestState,
    rerender: () => rerender(),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

async function flushMicrotasks(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
}

describe("useFiltering", () => {
  it("writes editing filter changes into table UI state", () => {
    const appliedFilter = makeFilter("applied");
    let tableUiState = {
      editingFilter: appliedFilter,
      id: "public.users",
      rowSelectionState: {},
      stagedRows: [],
    };
    const setFilterParam = vi.fn();
    const updateTableUiState = vi.fn(
      (updater: (draft: typeof tableUiState) => void) => {
        const draft = structuredClone(tableUiState);
        updater(draft);
        tableUiState = draft;
      },
    );

    useNavigationMock.mockReturnValue({
      filterParam: JSON.stringify(appliedFilter),
      setFilterParam,
    });
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState,
      updateTableUiState,
    }));

    const { cleanup, getLatestState, rerender } = renderHarness(testColumns);
    const nextFilter = makeFilter("next");

    const latestState = getLatestState();

    act(() => {
      latestState?.setEditingFilter(nextFilter);
    });

    expect(updateTableUiState).toHaveBeenCalled();
    expect(tableUiState.editingFilter).toEqual(nextFilter);

    rerender();

    expect(tableUiState.editingFilter).toEqual(nextFilter);

    act(() => {
      latestState?.setAppliedFilter(nextFilter);
    });

    expect(setFilterParam).toHaveBeenCalledWith(JSON.stringify(nextFilter));

    cleanup();
  });

  it("synchronizes editing filter when URL-applied filter changes", () => {
    const firstAppliedFilter = makeFilter("applied-1");
    const secondAppliedFilter = makeFilter("applied-2");
    let currentFilterParam = JSON.stringify(firstAppliedFilter);
    let tableUiState = {
      editingFilter: makeFilter("editing-initial"),
      id: "public.users",
      rowSelectionState: {},
      stagedRows: [],
    };
    const updateTableUiState = vi.fn(
      (updater: (draft: typeof tableUiState) => void) => {
        const draft = structuredClone(tableUiState);
        updater(draft);
        tableUiState = draft;
      },
    );

    useNavigationMock.mockImplementation(() => ({
      filterParam: currentFilterParam,
      setFilterParam: vi.fn(),
    }));
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState,
      updateTableUiState,
    }));

    const { cleanup, rerender } = renderHarness(testColumns);

    expect(tableUiState.editingFilter).toEqual(makeFilter("editing-initial"));

    currentFilterParam = JSON.stringify(secondAppliedFilter);
    rerender();

    expect(tableUiState.editingFilter).toEqual(secondAppliedFilter);

    cleanup();
  });

  it("preserves AI query metadata when the applied filter resynchronizes back into editing state", () => {
    const appliedFilterWithStableId = makeFilter("applied-ai");
    let currentFilterParam = JSON.stringify(defaultFilter);
    let tableUiState = {
      editingFilter: structuredClone({
        ...appliedFilterWithStableId,
        filters: [
          {
            ...structuredClone(appliedFilterWithStableId.filters[0]!),
            aiSource: {
              query: "email contains abba",
            },
          },
        ],
      }),
      id: "public.users",
      rowSelectionState: {},
      stagedRows: [],
    };
    const updateTableUiState = vi.fn(
      (updater: (draft: typeof tableUiState) => void) => {
        const draft = structuredClone(tableUiState);
        updater(draft);
        tableUiState = draft;
      },
    );

    useNavigationMock.mockImplementation(() => ({
      filterParam: currentFilterParam,
      setFilterParam: vi.fn(),
    }));
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState,
      updateTableUiState,
    }));

    const { cleanup, rerender } = renderHarness(testColumns);

    currentFilterParam = JSON.stringify(appliedFilterWithStableId);
    rerender();

    expect(tableUiState.editingFilter.filters[0]).toEqual(
      expect.objectContaining({
        aiSource: {
          query: "email contains abba",
        },
      }),
    );

    cleanup();
  });

  it("serializes only complete editing filters into the URL state", () => {
    const appliedFilter = makeFilter("applied");
    const incompleteEditingFilter: EditingFilterGroup = {
      after: "and",
      filters: [
        {
          after: "and",
          column: "email",
          id: "email-filter",
          kind: "ColumnFilter",
          operator: "",
          value: "",
        },
        {
          after: "and",
          column: "name",
          id: "name-filter",
          kind: "ColumnFilter",
          operator: "=",
          value: "abba",
        },
      ],
      id: "editing",
      kind: "FilterGroup",
    };
    const setFilterParam = vi.fn();

    useNavigationMock.mockReturnValue({
      filterParam: JSON.stringify(appliedFilter),
      setFilterParam,
    });
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState: {
        editingFilter: incompleteEditingFilter,
        id: "public.users",
        rowSelectionState: {},
        stagedRows: [],
      },
      updateTableUiState: vi.fn(),
    }));

    const { cleanup, getLatestState } = renderHarness(testColumns);

    const latestState = getLatestState();

    act(() => {
      latestState?.applyEditingFilter();
    });

    expect(setFilterParam).toHaveBeenCalledWith(
      JSON.stringify({
        after: "and",
        filters: [
          {
            after: "and",
            column: "name",
            id: "name-filter",
            kind: "ColumnFilter",
            operator: "=",
            value: "abba",
          },
        ],
        id: "editing",
        kind: "FilterGroup",
      } satisfies FilterGroup),
    );

    cleanup();
  });

  it("serializes valid SQL filters into the URL state and omits invalid SQL drafts", () => {
    const appliedFilter = makeFilter("applied");
    const sqlEditingFilter: EditingFilterGroup = {
      after: "and",
      filters: [
        {
          after: "and",
          id: "sql-valid",
          kind: "SqlFilter",
          sql: "WHERE lower(name) like '%abba%'",
        },
        {
          after: "and",
          id: "sql-invalid",
          kind: "SqlFilter",
          sql: "WHERE",
        },
      ],
      id: "editing",
      kind: "FilterGroup",
    };
    const setFilterParam = vi.fn();

    useNavigationMock.mockReturnValue({
      filterParam: JSON.stringify(appliedFilter),
      setFilterParam,
    });
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState: {
        editingFilter: sqlEditingFilter,
        id: "public.users",
        rowSelectionState: {},
        stagedRows: [],
      },
      updateTableUiState: vi.fn(),
    }));

    const { cleanup, getLatestState } = renderHarness(testColumns);

    act(() => {
      getLatestState()?.applyEditingFilter();
    });

    expect(setFilterParam).toHaveBeenCalledWith(
      JSON.stringify({
        after: "and",
        filters: [
          {
            after: "and",
            id: "sql-valid",
            kind: "SqlFilter",
            sql: "WHERE lower(name) like '%abba%'",
          },
        ],
        id: "editing",
        kind: "FilterGroup",
      } satisfies FilterGroup),
    );

    cleanup();
  });

  it("keeps the latest applied filter when an earlier URL write resolves later", async () => {
    const firstFilter = makeFilter("first");
    const secondFilter = makeFilter("second");
    let currentFilterParam = JSON.stringify(defaultFilter);
    let tableUiState = {
      editingFilter: firstFilter,
      id: "public.users",
      rowSelectionState: {},
      stagedRows: [],
    };
    let releaseFirstFilterWrite: (() => void) | undefined;
    let filterWriteCallCount = 0;
    const setFilterParam = vi.fn((value: string) => {
      filterWriteCallCount += 1;
      const apply = () => {
        currentFilterParam = value;
        return new URLSearchParams();
      };

      if (filterWriteCallCount === 1) {
        return new Promise<URLSearchParams>((resolve) => {
          releaseFirstFilterWrite = () => resolve(apply());
        });
      }

      return Promise.resolve().then(apply);
    });

    useNavigationMock.mockImplementation(() => ({
      filterParam: currentFilterParam,
      setFilterParam,
    }));
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState,
      updateTableUiState: vi.fn(
        (updater: (draft: typeof tableUiState) => void) => {
          const draft = structuredClone(tableUiState);
          updater(draft);
          tableUiState = draft;
        },
      ),
    }));

    const { cleanup, getLatestState } = renderHarness(testColumns);

    await act(async () => {
      getLatestState()?.setAppliedFilter(firstFilter);
      await flushMicrotasks();
      getLatestState()?.setAppliedFilter(secondFilter);
      await flushMicrotasks();
    });

    releaseFirstFilterWrite?.();

    await act(async () => {
      await flushMicrotasks(5);
    });

    expect(currentFilterParam).toBe(JSON.stringify(secondFilter));

    cleanup();
  });

  it("resynchronizes editing filters when the table scope changes even if the URL filter stays the same", () => {
    const staleUsersFilter = makeFilter("users-stale");
    const defaultEditingFilter = structuredClone(defaultFilter);
    let currentScopeKey = "public.users";
    let currentFilterParam = JSON.stringify(staleUsersFilter);
    const tableUiStates: Record<string, TableUiStateMockValue["tableUiState"]> =
      {
        "public.team_members": {
          editingFilter: structuredClone(defaultEditingFilter),
          id: "public.team_members",
          rowSelectionState: {},
          stagedRows: [],
        },
        "public.users": {
          editingFilter: staleUsersFilter,
          id: "public.users",
          rowSelectionState: {},
          stagedRows: [],
        },
      };
    const updateTableUiState = vi.fn(
      (updater: (draft: TableUiStateMockValue["tableUiState"]) => void) => {
        const draft = structuredClone(tableUiStates[currentScopeKey]!);
        updater(draft);
        tableUiStates[currentScopeKey] = draft;
      },
    );

    useNavigationMock.mockImplementation(() => ({
      filterParam: currentFilterParam,
      setFilterParam: vi.fn(),
    }));
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: currentScopeKey,
      tableUiState: tableUiStates[currentScopeKey]!,
      updateTableUiState,
    }));

    const { cleanup, getLatestState, rerender } = renderHarness(testColumns);

    expect(getLatestState()?.editingFilter).toEqual(staleUsersFilter);

    currentScopeKey = "public.team_members";
    currentFilterParam = JSON.stringify(defaultFilter);
    rerender();

    expect(tableUiStates["public.team_members"]?.editingFilter).toEqual(
      defaultFilter,
    );

    currentScopeKey = "public.users";
    rerender();

    expect(tableUiStates["public.users"]?.editingFilter).toEqual(defaultFilter);
    rerender();
    expect(getLatestState()?.editingFilter).toEqual(defaultFilter);

    cleanup();
  });

  it("keeps syntactically invalid saved filters out of the URL state when columns are provided", () => {
    const appliedFilter = makeFilter("applied");
    const invalidEditingFilter: EditingFilterGroup = {
      after: "and",
      filters: [
        {
          after: "and",
          column: "email",
          draftValue: "abba",
          id: "email-filter",
          kind: "ColumnFilter",
          operator: "is",
          value: "abba",
        },
      ],
      id: "editing",
      kind: "FilterGroup",
    };
    const setFilterParam = vi.fn();

    useNavigationMock.mockReturnValue({
      filterParam: JSON.stringify(appliedFilter),
      setFilterParam,
    });
    useTableUiStateMock.mockImplementation(() => ({
      scopeKey: "public.users",
      tableUiState: {
        editingFilter: invalidEditingFilter,
        id: "public.users",
        rowSelectionState: {},
        stagedRows: [],
      },
      updateTableUiState: vi.fn(),
    }));

    const { cleanup, getLatestState } = renderHarness(testColumns);

    act(() => {
      getLatestState()?.applyEditingFilter();
    });

    expect(setFilterParam).toHaveBeenCalledWith(
      JSON.stringify({
        after: "and",
        filters: [],
        id: "editing",
        kind: "FilterGroup",
      } satisfies FilterGroup),
    );

    cleanup();
  });
});
