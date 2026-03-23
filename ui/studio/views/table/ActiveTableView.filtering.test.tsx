import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdapterSqlLintDetails,
  AdapterSqlLintDiagnostic,
  AdapterSqlLintOptions,
  AdapterSqlLintResult,
  FilterGroup,
  FilterOperator,
} from "../../../../data/adapter";
import type { StudioLlmRequest } from "../../../../data/llm";
import type { Either } from "../../../../data/type-utils";
import type { UseActiveTableQueryProps } from "../../../hooks/use-active-table-query";
import type { GridSelectionMachineState } from "../../grid/selection-state-machine";
import { ActiveTableView } from "./ActiveTableView";

interface NavigationMockValue {
  createUrl: (values: Record<string, string>) => string;
  metadata: {
    activeTable: {
      columns: Record<string, unknown>;
      name: string;
      schema: string;
    };
  };
  searchParam: string;
  setPageIndexParam: () => Promise<URLSearchParams>;
  setSearchParam: () => Promise<URLSearchParams>;
}

interface IntrospectionMockValue {
  data: {
    filterOperators: FilterOperator[];
    query: { parameters: unknown[]; sql: string };
    schemas: Record<
      string,
      {
        name: string;
        tables: Record<
          string,
          {
            columns: Record<string, unknown>;
            name: string;
            schema: string;
          }
        >;
      }
    >;
    timezone: string;
  };
  refetch: () => void;
}

interface ActiveTableQueryMockValue {
  data: {
    filteredRowCount: number;
    rows: Record<string, unknown>[];
  };
  isFetching: boolean;
  refetch: () => void;
}

interface SelectionMockValue {
  deleteSelection: () => void;
  isSelecting: boolean;
  rowSelectionState: Record<string, boolean>;
  setRowSelectionState: () => void;
}

interface TableUiStateMockValue {
  tableUiState: {
    editingFilter: {
      after: "and" | "or";
      filters: unknown[];
      id: string;
      kind: "FilterGroup";
    };
    id: string;
    rowSelectionState: Record<string, boolean>;
    stagedRows: Record<string, unknown>[];
    stagedUpdates: Array<{
      changes: Record<string, unknown>;
      row: Record<string, unknown>;
      rowId: string;
    }>;
  };
  updateTableUiState: (
    updater: (draft: TableUiStateMockValue["tableUiState"]) => void,
  ) => void;
}

const useNavigationMock = vi.fn<() => NavigationMockValue>();
const useIntrospectionMock = vi.fn<() => IntrospectionMockValue>();
const useActiveTableQueryMock =
  vi.fn<(props: UseActiveTableQueryProps) => ActiveTableQueryMockValue>();
const useSelectionMock = vi.fn<() => SelectionMockValue>();
const useTableUiStateMock = vi.fn<() => TableUiStateMockValue>();
const useRegisterCommandPaletteActionsMock =
  vi.fn<(actions: Array<{ id: string }>) => void>();
const applyEditingFilterSpy = vi.fn();
const llmMock = vi.fn<(request: StudioLlmRequest) => Promise<string>>();
let studioLlm: ((request: StudioLlmRequest) => Promise<string>) | undefined;
let studioSupportsFullTableSearch = false;
let navigationSearchParam = "";
const setPageIndexParamMock = vi.fn(() =>
  Promise.resolve(new URLSearchParams()),
);
const setSearchParamMock = vi.fn(() => Promise.resolve(new URLSearchParams()));
const setPaginationStateMock = vi.fn();
const setInfiniteScrollEnabledMock = vi.fn();
const setSortingStateMock = vi.fn();
const sqlLintMock =
  vi.fn<
    (
      details: AdapterSqlLintDetails,
      options: AdapterSqlLintOptions,
    ) => Promise<Either<Error, AdapterSqlLintResult>>
  >();
let studioSqlLint:
  | ((
      details: AdapterSqlLintDetails,
      options: AdapterSqlLintOptions,
    ) => Promise<Either<Error, AdapterSqlLintResult>>)
  | undefined;
let gridSelectionState: GridSelectionMachineState = {
  mode: "none",
};
let gridColumnOrderState: string[] = [];
let gridColumnPinningState = {
  left: ["__ps_select"],
  right: [],
};
let isInfiniteScrollEnabled = false;
let paginationStateValue = { pageIndex: 0, pageSize: 25 };
let localUiStateStore = new Map<string, unknown>();
let stableUiStateKeyCounter = 0;
const insertMutateMock = vi.fn();
const updateMutateMock = vi.fn();
const updateMutateAsyncMock = vi.fn();
const updateManyMutateMock = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useIsMutating: () => 0,
  };
});

vi.mock("../../context", () => ({
  useStudio: () => ({
    adapter: {
      capabilities: {
        fullTableSearch: studioSupportsFullTableSearch,
        sqlDialect: "postgresql",
        sqlEditorLint: true,
      },
      sqlLint: studioSqlLint,
    },
    hasAiFilter: typeof studioLlm === "function",
    requestLlm: async (request: { prompt: string; task: string }) => {
      if (
        request.task === "table-filter" &&
        typeof studioLlm === "function"
      ) {
        return await studioLlm(request as StudioLlmRequest);
      }

      throw new Error("Studio AI is not configured.");
    },
  }),
  useOptionalStudio: () => undefined,
}));

vi.mock("../../../hooks/use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

vi.mock("../../../hooks/use-introspection", () => ({
  useIntrospection: () => useIntrospectionMock(),
}));

vi.mock("../../../hooks/use-active-table-query", () => ({
  useActiveTableQuery: (props: Parameters<typeof useActiveTableQueryMock>[0]) =>
    useActiveTableQueryMock(props),
}));

vi.mock("../../../hooks/use-selection", () => ({
  useSelection: () => useSelectionMock(),
}));

vi.mock("../../../hooks/use-column-pinning", () => ({
  useColumnPinning: () => ({
    pinnedColumnIds: [],
    setPinnedColumnIds: vi.fn(),
  }),
}));

vi.mock("../../../hooks/use-pagination", () => ({
  usePagination: () => ({
    isInfiniteScrollEnabled,
    paginationState: paginationStateValue,
    setInfiniteScrollEnabled: setInfiniteScrollEnabledMock,
    setPaginationState: setPaginationStateMock,
  }),
}));

vi.mock("../../../hooks/use-sorting", () => ({
  useSorting: () => ({
    setSortingState: setSortingStateMock,
    sortingState: [],
  }),
}));

vi.mock("../../../hooks/use-table-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useTableUiState: () => {
      const initialValue = useTableUiStateMock();
      const [tableUiState, setTableUiState] = React.useState(
        structuredClone(initialValue.tableUiState),
      );

      return {
        tableUiState,
        updateTableUiState: (
          updater: (draft: TableUiStateMockValue["tableUiState"]) => void,
        ) => {
          initialValue.updateTableUiState(updater);
          setTableUiState((previous) => {
            const next = structuredClone(previous);
            updater(next);
            return next;
          });
        },
      };
    },
  };
});

vi.mock("../../../hooks/use-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  function cloneValue<T>(value: T): T {
    if (typeof value !== "object" || value == null) {
      return value;
    }

    return structuredClone(value);
  }

  function isSpecialKey(key: string | undefined) {
    return (
      key?.endsWith(":selection-state") ||
      key?.endsWith(":column-order") ||
      key?.endsWith(":column-pinning")
    );
  }

  function storeSpecialValue<T>(key: string | undefined, value: T) {
    if (key?.endsWith(":selection-state")) {
      gridSelectionState = cloneValue(value) as GridSelectionMachineState;
      return;
    }

    if (key?.endsWith(":column-order")) {
      gridColumnOrderState = cloneValue(value) as string[];
      return;
    }

    if (key?.endsWith(":column-pinning")) {
      gridColumnPinningState = cloneValue(
        value,
      ) as typeof gridColumnPinningState;
    }
  }

  function getStoredValue<T>(key: string | undefined, initialValue: T): T {
    if (key?.endsWith(":selection-state")) {
      return cloneValue(gridSelectionState) as T;
    }

    if (key?.endsWith(":column-order")) {
      return cloneValue(gridColumnOrderState) as T;
    }

    if (key?.endsWith(":column-pinning")) {
      return cloneValue(gridColumnPinningState) as T;
    }

    if (!key) {
      return cloneValue(initialValue);
    }

    if (!localUiStateStore.has(key)) {
      localUiStateStore.set(key, cloneValue(initialValue));
    }

    return cloneValue(
      (localUiStateStore.get(key) as T | undefined) ?? initialValue,
    );
  }

  return {
    useStableUiStateKey(prefix: string) {
      const keyRef = React.useRef<string | null>(null);

      if (!keyRef.current) {
        stableUiStateKeyCounter += 1;
        keyRef.current = `${prefix}:${stableUiStateKeyCounter}`;
      }

      return keyRef.current;
    },
    useUiState<T>(key: string | undefined, initialValue: T) {
      const initialValueRef = React.useRef(cloneValue(initialValue));
      const [value, setValue] = React.useState<T>(() =>
        getStoredValue(key, initialValueRef.current),
      );

      React.useEffect(() => {
        initialValueRef.current = cloneValue(initialValue);
      });

      React.useEffect(() => {
        setValue(getStoredValue(key, initialValueRef.current));
      }, [key]);

      const setStoredValue = React.useCallback(
        (updater: T | ((previous: T) => T)) => {
          setValue((previous) => {
            const nextValue =
              typeof updater === "function"
                ? (updater as (previous: T) => T)(previous)
                : updater;

            if (key) {
              if (isSpecialKey(key)) {
                storeSpecialValue(key, nextValue);
              } else {
                localUiStateStore.set(key, cloneValue(nextValue));
              }
            }

            return cloneValue(nextValue);
          });
        },
        [key],
      );

      const resetValue = React.useCallback(() => {
        const nextValue = getStoredValue(key, initialValueRef.current);

        if (key) {
          if (isSpecialKey(key)) {
            storeSpecialValue(key, initialValueRef.current);
          } else {
            localUiStateStore.set(key, cloneValue(initialValueRef.current));
          }
        }

        setValue(nextValue);
      }, [key]);

      return [value, setStoredValue, resetValue] as const;
    },
  };
});

vi.mock("../../../hooks/use-active-table-insert", () => ({
  useActiveTableInsert: () => ({
    mutate: insertMutateMock,
  }),
}));

vi.mock("../../../hooks/use-active-table-update", () => ({
  useActiveTableUpdate: () => ({
    mutate: updateMutateMock,
    mutateAsync: updateMutateAsyncMock,
  }),
}));

vi.mock("../../../hooks/use-active-table-update-many", () => ({
  useActiveTableUpdateMany: () => ({
    mutate: updateManyMutateMock,
  }),
}));

vi.mock("../../../hooks/use-is-inserting", () => ({
  useIsInserting: () => 0,
}));

vi.mock("../../../hooks/use-filtering", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const filterUtils = await vi.importActual<
    typeof import("../../../hooks/filter-utils")
  >("../../../hooks/filter-utils");

  return {
    useFiltering: (columns?: Record<string, unknown>) => {
      const [editingFilter, setEditingFilter] = React.useState(
        filterUtils.createEditingFilterFromApplied(filterUtils.defaultFilter),
      );
      const [appliedFilter, setAppliedFilterState] = React.useState(
        filterUtils.defaultFilter,
      );

      function applyEditingFilter(filter = editingFilter) {
        const nextAppliedFilter = filterUtils.createAppliedFilterFromEditing(
          filter,
          columns as Parameters<
            typeof filterUtils.createAppliedFilterFromEditing
          >[1],
        );

        applyEditingFilterSpy(nextAppliedFilter);
        setAppliedFilterState(nextAppliedFilter);
      }

      return {
        appliedFilter,
        applyEditingFilter,
        editingFilter,
        setAppliedFilter: (filter: FilterGroup) => {
          setAppliedFilterState(filter);
        },
        setEditingFilter,
        totalEditingFilters: filterUtils.countFiltersRecursive(editingFilter),
      };
    },
  };
});

vi.mock("../../grid/DataGrid", async () => {
  const { getCoreRowModel, useReactTable } = await vi.importActual<
    typeof import("@tanstack/react-table")
  >("@tanstack/react-table");

  return {
    DataGrid: (props: {
      areRowsInViewActionsLocked?: boolean;
      columnDefs: Array<{ accessorKey?: string; id?: string }>;
      focusRowIndexOffset?: number;
      focusedCell?: { columnId: string; rowIndex: number } | null;
      getBeforeHeaderRows?: (table: unknown) => ReactNode;
      getBeforeRows?: (table: unknown) => ReactNode;
      onBlockedRowsInViewAction?: () => void;
      onFocusedCellChange?: (
        focusedCell: {
          columnId: string;
          rowIndex: number;
        } | null,
      ) => void;
      onLoadMoreRows?: () => void;
      onPaginationChange?: (
        updater:
          | { pageIndex: number; pageSize: number }
          | ((previous: { pageIndex: number; pageSize: number }) => {
              pageIndex: number;
              pageSize: number;
            }),
      ) => void;
      onSortingChange?: (
        next: Array<{ column: string; direction: string }>,
      ) => void;
      paginationState?: { pageIndex: number; pageSize: number };
      rows?: Record<string, unknown>[];
    }) => {
      const table = useReactTable({
        columns: props.columnDefs as never,
        data: props.rows ?? [],
        getCoreRowModel: getCoreRowModel(),
        getRowId: (row: Record<string, unknown>, index: number) =>
          String(row.__ps_rowid ?? `row-${index}`),
      });

      return (
        <>
          <table data-testid="mock-grid">
            <thead data-testid="mock-grid-head">
              {props.getBeforeHeaderRows?.(table)}
              <tr data-testid="column-header-row">
                {table.getVisibleLeafColumns().map((column) => {
                  const accessorKey = (
                    column.columnDef as { accessorKey?: string }
                  ).accessorKey;

                  return (
                    <th key={String(column.id ?? accessorKey ?? "")}>
                      {String(column.id ?? accessorKey ?? "")}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {props.getBeforeRows?.(table)}
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} data-grid-row-index={row.index}>
                  {row.getVisibleCells().map((cell) => {
                    if (typeof cell.column.columnDef.cell !== "function") {
                      return null;
                    }

                    const GridCell = cell.column.columnDef.cell(
                      cell.getContext(),
                    ) as (props: Record<string, unknown>) => React.ReactElement;

                    return (
                      <GridCell
                        key={cell.id}
                        className={
                          props.focusedCell?.columnId === cell.column.id &&
                          props.focusedCell.rowIndex ===
                            row.index + (props.focusRowIndexOffset ?? 0)
                            ? "before:pointer-events-none before:absolute before:inset-0 before:border before:border-sky-300 before:content-['']"
                            : undefined
                        }
                        data-grid-column-id={cell.column.id}
                        data-grid-visual-row-index={
                          row.index + (props.focusRowIndexOffset ?? 0)
                        }
                        data-focused={
                          props.focusedCell?.columnId === cell.column.id &&
                          props.focusedCell.rowIndex ===
                            row.index + (props.focusRowIndexOffset ?? 0)
                            ? "true"
                            : undefined
                        }
                        data-grid-row-index={row.index}
                        onMouseDown={() =>
                          props.onFocusedCellChange?.({
                            columnId: cell.column.id,
                            rowIndex:
                              row.index + (props.focusRowIndexOffset ?? 0),
                          })
                        }
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <button
            aria-label="Sort ascending"
            aria-disabled={props.areRowsInViewActionsLocked || undefined}
            type="button"
            onClick={() => {
              if (props.areRowsInViewActionsLocked) {
                props.onBlockedRowsInViewAction?.();
                return;
              }

              props.onSortingChange?.([{ column: "email", direction: "asc" }]);
            }}
          >
            Sort ascending
          </button>
          <button
            aria-label="Go to next page"
            aria-disabled={props.areRowsInViewActionsLocked || undefined}
            type="button"
            onClick={() => {
              if (props.areRowsInViewActionsLocked) {
                props.onBlockedRowsInViewAction?.();
                return;
              }

              props.onPaginationChange?.((previous) => ({
                ...previous,
                pageIndex: previous.pageIndex + 1,
              }));
            }}
          >
            Go to next page
          </button>
          <button
            aria-label="Load more rows"
            type="button"
            onClick={() => props.onLoadMoreRows?.()}
          >
            Load more rows
          </button>
        </>
      );
    },
  };
});

vi.mock("../../CommandPalette", () => ({
  useRegisterCommandPaletteActions: (actions: Array<{ id: string }>) => {
    useRegisterCommandPaletteActionsMock(actions);
  },
}));

vi.mock("./StagedRows", () => ({
  StagedRows: (props: {
    focusedCell?: { columnId: string; rowIndex: number } | null;
    onFocusedCellChange?: (
      focusedCell: {
        columnId: string;
        rowIndex: number;
      } | null,
    ) => void;
    stagedRows: Record<string, unknown>[];
    table: {
      getVisibleLeafColumns: () => Array<{ id: string }>;
    };
  }) => {
    const columns = props.table
      .getVisibleLeafColumns()
      .filter((column) => column.id !== "__ps_select");

    return props.stagedRows.map((row, rowIndex) => (
      <tr key={`staged-${rowIndex}`} data-staged-row="true">
        {columns.map((column) => {
          const isFocused =
            props.focusedCell?.rowIndex === rowIndex &&
            props.focusedCell.columnId === column.id;

          return (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <td
              key={column.id}
              className={
                isFocused
                  ? "before:pointer-events-none before:absolute before:inset-0 before:border before:border-sky-300 before:content-['']"
                  : undefined
              }
              data-focused={isFocused || undefined}
              data-grid-column-id={column.id}
              data-grid-visual-row-index={rowIndex}
              data-staged-row-index={rowIndex}
              onMouseDown={() =>
                props.onFocusedCellChange?.({
                  columnId: column.id,
                  rowIndex,
                })
              }
            >
              {String(row[column.id] ?? "")}
            </td>
          );
        })}
      </tr>
    ));
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createColumn(args: {
  datatypeName: string;
  group: "datetime" | "numeric" | "string";
  fkColumn?: string | null;
  fkSchema?: string | null;
  fkTable?: string | null;
  isAutoincrement?: boolean;
  isComputed?: boolean;
  isRequired?: boolean;
  name: string;
  pkPosition?: number | null;
  schema?: string;
  table?: string;
}) {
  return {
    datatype: {
      format: args.datatypeName,
      group: args.group,
      isArray: false,
      isNative: true,
      name: args.datatypeName,
      options: [],
      schema: "pg_catalog",
    },
    defaultValue: null,
    fkColumn: args.fkColumn ?? null,
    fkSchema: args.fkSchema ?? null,
    fkTable: args.fkTable ?? null,
    isAutoincrement: args.isAutoincrement ?? false,
    isComputed: args.isComputed ?? false,
    isRequired: args.isRequired ?? false,
    name: args.name,
    nullable: true,
    pkPosition: args.pkPosition ?? null,
    schema: args.schema ?? "public",
    table: args.table ?? "users",
  };
}

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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function findButtonByText(text: string) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent?.trim() === text);
}

function findMenuItemByText(text: string) {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"]',
    ),
  ).find((item) => item.textContent?.trim() === text);
}

function findMenuCheckboxByText(text: string) {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'),
  ).find((item) => item.textContent?.trim() === text);
}

function dispatchPointerClick(element: Element | null | undefined) {
  if (!element) {
    return;
  }

  const PointerEventConstructor = window.PointerEvent ?? MouseEvent;

  act(() => {
    element.dispatchEvent(
      new PointerEventConstructor("pointerdown", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
  });
}

function queryConfirmationDialog() {
  return (
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="alertdialog"], [role="dialog"]',
      ),
    ).find((element) => element.className.includes("max-w-[280px]")) ?? null
  );
}

function expectConfirmationFocusRing(button: HTMLButtonElement | undefined) {
  expect(button?.className).toContain("focus:ring-2");
  expect(button?.className).toContain("focus:ring-ring");
  expect(button?.className).toContain("focus:ring-offset-2");
  expect(button?.className).toContain("focus:ring-offset-background");
}

function getOpenEditorInput(): HTMLInputElement | HTMLTextAreaElement {
  const input = document.body.querySelector(
    "input.cell-input-leading, input.cell-input-base, textarea.cell-input-base",
  );

  if (
    !(input instanceof HTMLInputElement) &&
    !(input instanceof HTMLTextAreaElement)
  ) {
    throw new Error("Could not find the active editor input");
  }

  return input;
}

function setEditorValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  );

  descriptor?.set?.call(input, value);
  input.dispatchEvent(
    new Event("input", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

function dispatchKeyboard(key: string, init?: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
        ...init,
      }),
    );
  });
}

function renderView() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const render = () =>
    act(() => {
      root.render(<ActiveTableView />);
    });

  render();

  return {
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    container,
    getGridCell(columnId: string, rowIndex: number) {
      const cell = container.querySelector<HTMLElement>(
        `[data-grid-column-id="${columnId}"][data-grid-row-index="${rowIndex}"]`,
      );

      if (!(cell instanceof HTMLElement)) {
        throw new Error(`Could not find grid cell ${rowIndex}:${columnId}`);
      }

      return cell;
    },
    getVisualCell(columnId: string, rowIndex: number) {
      const cell = container.querySelector<HTMLElement>(
        `[data-grid-column-id="${columnId}"][data-grid-visual-row-index="${rowIndex}"]`,
      );

      if (!(cell instanceof HTMLElement)) {
        throw new Error(
          `Could not find visual grid cell ${rowIndex}:${columnId}`,
        );
      }

      return cell;
    },
    rerender() {
      render();
    },
  };
}

function getFocusedCellState() {
  return localUiStateStore.get("datagrid:public.users:focused-cell") as
    | { columnId: string; rowIndex: number }
    | null
    | undefined;
}

beforeEach(() => {
  const activeTable = {
    columns: {
      created_at: {
        ...createColumn({
          datatypeName: "timestamptz",
          group: "datetime",
          name: "created_at",
        }),
        datatype: {
          format: "YYYY-MM-DD HH:mm:ss.SSSZZ",
          group: "datetime",
          isArray: false,
          isNative: true,
          name: "timestamptz",
          options: [],
          schema: "pg_catalog",
        },
      },
      email: createColumn({
        datatypeName: "character varying(64)",
        group: "string",
        name: "email",
      }),
      id: createColumn({
        datatypeName: "uuid",
        group: "string",
        name: "id",
        pkPosition: 1,
      }),
    },
    name: "users",
    schema: "public",
  };

  useNavigationMock.mockImplementation(() => ({
    createUrl: vi.fn(() => "#"),
    metadata: {
      activeTable,
    },
    searchParam: navigationSearchParam,
    setPageIndexParam: setPageIndexParamMock,
    setSearchParam: setSearchParamMock,
  }));
  useIntrospectionMock.mockReturnValue({
    data: {
      filterOperators: [
        "=",
        "!=",
        ">",
        ">=",
        "<",
        "<=",
        "is",
        "is not",
        "like",
        "not like",
        "ilike",
        "not ilike",
      ],
      query: {
        parameters: [],
        sql: "",
      },
      schemas: {
        public: {
          name: "public",
          tables: {
            users: activeTable,
          },
        },
      },
      timezone: "UTC",
    },
    refetch: vi.fn(),
  });
  useActiveTableQueryMock.mockReturnValue({
    data: {
      filteredRowCount: 1,
      rows: [],
    },
    isFetching: false,
    refetch: vi.fn(),
  });
  useSelectionMock.mockReturnValue({
    deleteSelection: vi.fn(),
    isSelecting: false,
    rowSelectionState: {},
    setRowSelectionState: vi.fn(),
  });
  useTableUiStateMock.mockReturnValue({
    tableUiState: {
      editingFilter: {
        after: "and",
        filters: [],
        id: "table-ui-filter",
        kind: "FilterGroup",
      },
      id: "public.users",
      rowSelectionState: {},
      stagedRows: [],
      stagedUpdates: [],
    },
    updateTableUiState: vi.fn(),
  });
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  }) as typeof requestAnimationFrame;
  studioSupportsFullTableSearch = false;
  studioSqlLint = undefined;
  localUiStateStore = new Map<string, unknown>();
  gridSelectionState = {
    mode: "none",
  };
  gridColumnOrderState = [];
  gridColumnPinningState = {
    left: ["__ps_select"],
    right: [],
  };
  isInfiniteScrollEnabled = false;
  paginationStateValue = { pageIndex: 0, pageSize: 25 };
  stableUiStateKeyCounter = 0;
  navigationSearchParam = "";
  insertMutateMock.mockReset();
  updateMutateMock.mockReset();
  updateMutateAsyncMock.mockReset();
  updateManyMutateMock.mockReset();
  setInfiniteScrollEnabledMock.mockReset();
  setPaginationStateMock.mockReset();
  setSortingStateMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  studioLlm = undefined;
  studioSqlLint = undefined;
  localUiStateStore = new Map<string, unknown>();
  gridSelectionState = {
    mode: "none",
  };
  gridColumnOrderState = [];
  gridColumnPinningState = {
    left: ["__ps_select"],
    right: [],
  };
  isInfiniteScrollEnabled = false;
  paginationStateValue = { pageIndex: 0, pageSize: 25 };
  stableUiStateKeyCounter = 0;
  navigationSearchParam = "";
  updateManyMutateMock.mockReset();
  setInfiniteScrollEnabledMock.mockReset();
  setPaginationStateMock.mockReset();
  setSortingStateMock.mockReset();
});

describe("ActiveTableView filtering", () => {
  it("adds inferred back-relation columns at the end with filtered navigation links", async () => {
    const createUrlMock = vi.fn((values: Record<string, string>) => {
      return `#${new URLSearchParams(values).toString()}`;
    });
    const organizationsTable = {
      columns: {
        id: createColumn({
          datatypeName: "text",
          group: "string",
          name: "id",
          pkPosition: 1,
          table: "organizations",
        }),
        name: createColumn({
          datatypeName: "text",
          group: "string",
          name: "name",
          table: "organizations",
        }),
      },
      name: "organizations",
      schema: "public",
    };
    const teamMembersTable = {
      columns: {
        id: createColumn({
          datatypeName: "text",
          group: "string",
          name: "id",
          pkPosition: 1,
          table: "team_members",
        }),
        organization_id: createColumn({
          datatypeName: "text",
          fkColumn: "id",
          fkSchema: "public",
          fkTable: "organizations",
          group: "string",
          name: "organization_id",
          table: "team_members",
        }),
        name: createColumn({
          datatypeName: "text",
          group: "string",
          name: "name",
          table: "team_members",
        }),
      },
      name: "team_members",
      schema: "public",
    };

    useNavigationMock.mockReturnValue({
      createUrl: createUrlMock,
      metadata: {
        activeTable: organizationsTable,
      },
      searchParam: "",
      setPageIndexParam: setPageIndexParamMock,
      setSearchParam: setSearchParamMock,
    });
    useIntrospectionMock.mockReturnValue({
      data: {
        filterOperators: [
          "=",
          "!=",
          ">",
          ">=",
          "<",
          "<=",
          "is",
          "is not",
          "like",
          "not like",
          "ilike",
          "not ilike",
        ],
        query: {
          parameters: [],
          sql: "",
        },
        schemas: {
          public: {
            name: "public",
            tables: {
              organizations: organizationsTable,
              team_members: teamMembersTable,
            },
          },
        },
        timezone: "UTC",
      },
      refetch: vi.fn(),
    });
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "org-1",
            id: "org_acme",
            name: "Acme Labs",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();
    await flush();

    try {
      const headerLabels = Array.from(
        view.container.querySelectorAll<HTMLTableCellElement>(
          '[data-testid="column-header-row"] th',
        ),
      ).map((header) => header.textContent?.trim());

      expect(headerLabels).toContain("team_members");
      expect(headerLabels.at(-1)).toBe("team_members");

      const backRelationCell = view.getGridCell("team_members", 0);
      expect(backRelationCell.querySelector("input, textarea")).toBeNull();
      expect(
        backRelationCell
          .querySelector("[data-studio-cell-content] > div")
          ?.className.includes("h-full"),
      ).toBe(true);

      const relationLink = backRelationCell.querySelector("a");

      expect(relationLink).not.toBeNull();
      const createUrlArgs = createUrlMock.mock.calls.at(-1)?.[0];

      expect(createUrlArgs).toMatchObject({
        schemaParam: "public",
        tableParam: "team_members",
      });
      expect(relationLink?.getAttribute("href")).toBe(
        createUrlMock.mock.results.at(-1)?.value,
      );

      const filter = JSON.parse(createUrlArgs?.filterParam ?? "{}") as
        | FilterGroup
        | Record<string, unknown>;

      expect(filter).toMatchObject({
        after: "and",
        kind: "FilterGroup",
      });
      expect((filter as FilterGroup).filters).toEqual([
        expect.objectContaining({
          after: "and",
          column: "organization_id",
          kind: "ColumnFilter",
          operator: "=",
          value: "org_acme",
        }),
      ]);

      act(() => {
        backRelationCell.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      expect(document.body.querySelector(".cell-input-base")).toBeNull();
    } finally {
      view.cleanup();
    }
  });

  it("asks for confirmation before deleting the selected rows", async () => {
    const deleteSelection = vi.fn();
    useSelectionMock.mockReturnValue({
      deleteSelection,
      isSelecting: true,
      rowSelectionState: {
        "row-1": true,
        "row-2": true,
      },
      setRowSelectionState: vi.fn(),
    });

    const view = renderView();
    const deleteTrigger = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === "Delete 2 rows");

    expect(deleteTrigger).toBeDefined();
    expect(document.body.textContent).not.toContain(
      "Do you want to delete 2 rows?",
    );

    act(() => {
      deleteTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await flush();

    expect(deleteSelection).not.toHaveBeenCalled();
    const dialog = queryConfirmationDialog();

    expect(dialog).not.toBeNull();
    expect(dialog?.className).toContain("font-sans");
    expect(dialog?.className).toContain("max-w-[280px]");
    expect(dialog?.className).toContain("gap-2.5");
    expect(dialog?.className).toContain("p-3");

    const prompt = dialog?.querySelector("p");

    expect(prompt?.textContent?.trim()).toBe("Do you want to delete 2 rows?");

    const dialogButtons = Array.from(
      dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );

    expect(dialogButtons).toHaveLength(2);
    expect(dialogButtons[0]?.textContent?.trim()).toBe("delete");
    expect(dialogButtons[1]?.textContent?.trim()).toBe("keep");
    expectConfirmationFocusRing(dialogButtons[0]);
    expect(
      dialog?.querySelector('[aria-label="Close"], [aria-label="close"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(dialogButtons[0]);

    act(() => {
      dialogButtons[0]?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "ArrowRight",
        }),
      );
    });

    expect(document.activeElement).toBe(dialogButtons[1]);

    act(() => {
      dialogButtons[1]?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });

    await flush();

    expect(deleteSelection).not.toHaveBeenCalled();
    expect(queryConfirmationDialog()).toBeNull();
    act(() => {
      deleteTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await flush();

    const reopenedDialog = queryConfirmationDialog();
    const reopenedButtons = Array.from(
      reopenedDialog?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );

    expect(reopenedButtons).toHaveLength(2);
    expect(document.activeElement).toBe(reopenedButtons[0]);

    act(() => {
      reopenedButtons[0]?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });

    expect(deleteSelection).toHaveBeenCalledTimes(1);

    view.cleanup();
  });

  it("focuses the top-left content cell on open and moves focus with arrow keys", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 2,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
          {
            __ps_rowid: "row-2",
            created_at: "2026-03-12T00:00:00.000Z",
            email: "bob@example.com",
            id: "user_2",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();
    await flush();

    expect(view.getGridCell("id", 0).dataset.focused).toBe("true");
    expect(getFocusedCellState()).toEqual({
      columnId: "id",
      rowIndex: 0,
    });

    dispatchKeyboard("ArrowRight");
    await flush();

    expect(view.getGridCell("created_at", 0).dataset.focused).toBe("true");
    expect(getFocusedCellState()).toEqual({
      columnId: "created_at",
      rowIndex: 0,
    });

    dispatchKeyboard("ArrowDown");
    await flush();

    expect(view.getGridCell("created_at", 1).dataset.focused).toBe("true");
    expect(getFocusedCellState()).toEqual({
      columnId: "created_at",
      rowIndex: 1,
    });

    view.cleanup();
  });

  it("throttles repeated focused-cell arrow navigation", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 4,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
          {
            __ps_rowid: "row-2",
            created_at: "2026-03-12T00:00:00.000Z",
            email: "bob@example.com",
            id: "user_2",
          },
          {
            __ps_rowid: "row-3",
            created_at: "2026-03-13T00:00:00.000Z",
            email: "carol@example.com",
            id: "user_3",
          },
          {
            __ps_rowid: "row-4",
            created_at: "2026-03-14T00:00:00.000Z",
            email: "dave@example.com",
            id: "user_4",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const dateNowSpy = vi.spyOn(Date, "now");
    let now = 1_000;
    dateNowSpy.mockImplementation(() => now);

    const view = renderView();
    await flush();

    try {
      dispatchKeyboard("ArrowDown");
      await flush();

      expect(view.getGridCell("id", 1).dataset.focused).toBe("true");

      dispatchKeyboard("ArrowDown", { repeat: true });
      await flush();

      expect(view.getGridCell("id", 1).dataset.focused).toBe("true");

      now += 49;
      dispatchKeyboard("ArrowDown", { repeat: true });
      await flush();

      expect(view.getGridCell("id", 1).dataset.focused).toBe("true");

      now += 1;
      dispatchKeyboard("ArrowDown", { repeat: true });
      await flush();

      expect(view.getGridCell("id", 2).dataset.focused).toBe("true");
    } finally {
      dateNowSpy.mockRestore();
      view.cleanup();
    }
  });

  it("opens the focused cell with Enter", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();
    await flush();

    dispatchKeyboard("ArrowRight");
    await flush();
    dispatchKeyboard("ArrowRight");
    await flush();
    dispatchKeyboard("Enter");
    await flush();

    expect(getOpenEditorInput().value).toBe("alice@example.com");

    view.cleanup();
  });

  it("starts cell selection from the focused cell with Shift+Arrow", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 2,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
          {
            __ps_rowid: "row-2",
            created_at: "2026-03-12T00:00:00.000Z",
            email: "bob@example.com",
            id: "user_2",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();
    await flush();

    dispatchKeyboard("ArrowRight", { shiftKey: true });
    await flush();

    expect(gridSelectionState).toEqual({
      end: {
        columnId: "created_at",
        columnIndex: 1,
        rowIndex: 0,
      },
      mode: "cell",
      start: {
        columnId: "id",
        columnIndex: 0,
        rowIndex: 0,
      },
    });
    expect(view.getGridCell("created_at", 0).dataset.focused).toBe("true");

    view.cleanup();
  });

  it("keeps focus at the same screen position when rows change and clamps to the nearest row", async () => {
    let activeRows = [
      {
        __ps_rowid: "row-1",
        created_at: "2026-03-11T00:00:00.000Z",
        email: "alice@example.com",
        id: "user_1",
      },
      {
        __ps_rowid: "row-2",
        created_at: "2026-03-12T00:00:00.000Z",
        email: "bob@example.com",
        id: "user_2",
      },
      {
        __ps_rowid: "row-3",
        created_at: "2026-03-13T00:00:00.000Z",
        email: "carol@example.com",
        id: "user_3",
      },
    ];

    useActiveTableQueryMock.mockImplementation(() => ({
      data: {
        filteredRowCount: activeRows.length,
        rows: activeRows,
      },
      isFetching: false,
      refetch: vi.fn(),
    }));

    const view = renderView();
    await flush();

    dispatchKeyboard("ArrowDown");
    dispatchKeyboard("ArrowDown");
    await flush();

    expect(view.getGridCell("id", 2).dataset.focused).toBe("true");

    activeRows = [
      {
        __ps_rowid: "row-4",
        created_at: "2026-03-14T00:00:00.000Z",
        email: "delta@example.com",
        id: "user_4",
      },
      {
        __ps_rowid: "row-5",
        created_at: "2026-03-15T00:00:00.000Z",
        email: "echo@example.com",
        id: "user_5",
      },
      {
        __ps_rowid: "row-6",
        created_at: "2026-03-16T00:00:00.000Z",
        email: "foxtrot@example.com",
        id: "user_6",
      },
    ];
    view.rerender();
    await flush();

    expect(view.getGridCell("id", 2).dataset.focused).toBe("true");
    expect(view.getGridCell("id", 2).textContent).toContain("user_6");

    activeRows = [
      {
        __ps_rowid: "row-7",
        created_at: "2026-03-17T00:00:00.000Z",
        email: "golf@example.com",
        id: "user_7",
      },
    ];
    view.rerender();
    await flush();

    expect(view.getGridCell("id", 0).dataset.focused).toBe("true");
    expect(getFocusedCellState()).toEqual({
      columnId: "id",
      rowIndex: 0,
    });

    view.cleanup();
  });

  it("focuses the first cell in a newly inserted staged row", async () => {
    const view = renderView();

    const insertRowButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Insert row"));

    expect(insertRowButton).toBeDefined();

    act(() => {
      insertRowButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await flush();

    expect(view.getVisualCell("id", 0).dataset.focused).toBe("true");
    expect(getFocusedCellState()).toEqual({
      columnId: "id",
      rowIndex: 0,
    });

    view.cleanup();
  });

  it("stages persisted cell edits, keeps only cancel inside the editor, and keeps the focused staged hover tint visible", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();

    try {
      act(() => {
        view.getGridCell("email", 0).dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      expect(document.body.textContent).not.toContain("Save changes");
      expect(document.body.textContent).toContain("Cancel changes");

      const input = getOpenEditorInput();

      act(() => {
        setEditorValue(input, "alice+draft@example.com");
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        );
      });
      await flush();

      expect(updateMutateMock).not.toHaveBeenCalled();
      expect(findButtonByText("Save 1 row")).toBeDefined();
      expect(view.getGridCell("email", 0).textContent).toContain(
        "alice+draft@example.com",
      );
      expect(view.getGridCell("email", 0).className).not.toContain(
        "after:border-amber-300",
      );
      expect(view.getGridCell("email", 0).className).toContain(
        "after:border-sky-300",
      );
      expect(view.getGridCell("email", 0).className).toContain(
        "after:absolute",
      );
      expect(view.getGridCell("email", 0).className).toContain(
        "before:bg-staged-cell-background",
      );
      expect(view.getGridCell("email", 0).className).toContain(
        "ps-staged-cell",
      );
      expect(view.getGridCell("email", 0).dataset.focused).toBe("true");
    } finally {
      view.cleanup();
    }
  });

  it("closes the editor on Enter, stages the cell, and keeps focus for keyboard navigation", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();

    try {
      act(() => {
        view.getGridCell("email", 0).dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      const input = getOpenEditorInput();

      act(() => {
        setEditorValue(input, "alice+enter@example.com");
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        );
      });
      await flush();

      expect(document.body.textContent).not.toContain("Cancel changes");
      expect(document.activeElement?.tagName).not.toBe("INPUT");
      expect(findButtonByText("Save 1 row")).toBeDefined();
      expect(view.getGridCell("email", 0).dataset.focused).toBe("true");
      expect(view.getGridCell("email", 0).className).toContain(
        "ps-staged-cell",
      );

      dispatchKeyboard("ArrowLeft");
      await flush();

      expect(view.getGridCell("created_at", 0).dataset.focused).toBe("true");
      expect(view.getGridCell("email", 0).className).toContain(
        "before:bg-staged-cell-background",
      );
      expect(view.getGridCell("email", 0).className).toContain(
        "ps-staged-cell",
      );
      expect(view.getGridCell("email", 0).className).toContain(
        "after:border-amber-300",
      );

      dispatchKeyboard("Enter");
      await flush();

      expect(getOpenEditorInput().value).toBe("2026-03-11T00:00:00.000Z");
    } finally {
      view.cleanup();
    }
  });

  it("stages persisted cell edits when clicking outside the editor", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();

    try {
      act(() => {
        view.getGridCell("email", 0).dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      const input = getOpenEditorInput();

      act(() => {
        setEditorValue(input, "alice+outside@example.com");
      });
      await flush();

      act(() => {
        const outsideCell = view.getGridCell("id", 0);

        outsideCell.dispatchEvent(
          typeof PointerEvent === "function"
            ? new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
              })
            : new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
              }),
        );
        outsideCell.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();
      await flush();

      expect(updateMutateMock).not.toHaveBeenCalled();
      expect(findButtonByText("Save 1 row")).toBeDefined();
      expect(view.getGridCell("email", 0).textContent).toContain(
        "alice+outside@example.com",
      );
      expect(document.body.textContent).not.toContain("Cancel changes");
      expect(view.getGridCell("email", 0).dataset.focused).toBe("true");
    } finally {
      view.cleanup();
    }
  });

  it("returns focus to the edited cell when editing is cancelled", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();

    try {
      act(() => {
        view.getGridCell("email", 0).dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      const input = getOpenEditorInput();

      act(() => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Escape",
          }),
        );
      });
      await flush();

      expect(document.body.textContent).not.toContain("Cancel changes");
      expect(view.getGridCell("email", 0).dataset.focused).toBe("true");
      expect(findButtonByText("Save 1 row")).toBeUndefined();
    } finally {
      view.cleanup();
    }
  });

  it("tabs staged edits to the next editable cell and wraps to the next row", async () => {
    const activeTable = {
      columns: {
        email: createColumn({
          datatypeName: "character varying(64)",
          group: "string",
          name: "email",
        }),
        id: createColumn({
          datatypeName: "uuid",
          group: "string",
          name: "id",
          pkPosition: 1,
        }),
        name: createColumn({
          datatypeName: "character varying(64)",
          group: "string",
          name: "name",
        }),
      },
      name: "users",
      schema: "public",
    };

    useNavigationMock.mockReturnValue({
      createUrl: vi.fn(() => "#"),
      metadata: {
        activeTable,
      },
      searchParam: "",
      setPageIndexParam: setPageIndexParamMock,
      setSearchParam: setSearchParamMock,
    });
    useIntrospectionMock.mockReturnValue({
      data: {
        filterOperators: [
          "=",
          "!=",
          ">",
          ">=",
          "<",
          "<=",
          "is",
          "is not",
          "like",
          "not like",
          "ilike",
          "not ilike",
        ],
        query: {
          parameters: [],
          sql: "",
        },
        schemas: {
          public: {
            name: "public",
            tables: {
              users: activeTable,
            },
          },
        },
        timezone: "UTC",
      },
      refetch: vi.fn(),
    });
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 2,
        rows: [
          {
            __ps_rowid: "row-1",
            email: "alice@example.com",
            id: "user_1",
            name: "Alice",
          },
          {
            __ps_rowid: "row-2",
            email: "bob@example.com",
            id: "user_2",
            name: "Bob",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();

    try {
      act(() => {
        view.getGridCell("name", 0).dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      const input = getOpenEditorInput();

      act(() => {
        setEditorValue(input, "Alice Draft");
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Tab",
          }),
        );
      });
      await flush();

      const nextInput = getOpenEditorInput();

      expect(updateMutateMock).not.toHaveBeenCalled();
      expect(findButtonByText("Save 1 row")).toBeDefined();
      expect(nextInput.value).toBe("user_2");
    } finally {
      view.cleanup();
    }
  });

  it("moves staged editing to an adjacent cell with Cmd/Ctrl+Arrow", async () => {
    const activeTable = {
      columns: {
        email: createColumn({
          datatypeName: "character varying(64)",
          group: "string",
          name: "email",
        }),
        id: createColumn({
          datatypeName: "uuid",
          group: "string",
          name: "id",
          pkPosition: 1,
        }),
        name: createColumn({
          datatypeName: "character varying(64)",
          group: "string",
          name: "name",
        }),
      },
      name: "users",
      schema: "public",
    };

    useNavigationMock.mockReturnValue({
      createUrl: vi.fn(() => "#"),
      metadata: {
        activeTable,
      },
      searchParam: "",
      setPageIndexParam: setPageIndexParamMock,
      setSearchParam: setSearchParamMock,
    });
    useIntrospectionMock.mockReturnValue({
      data: {
        filterOperators: [
          "=",
          "!=",
          ">",
          ">=",
          "<",
          "<=",
          "is",
          "is not",
          "like",
          "not like",
          "ilike",
          "not ilike",
        ],
        query: {
          parameters: [],
          sql: "",
        },
        schemas: {
          public: {
            name: "public",
            tables: {
              users: activeTable,
            },
          },
        },
        timezone: "UTC",
      },
      refetch: vi.fn(),
    });
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "row-1",
            email: "alice@example.com",
            id: "user_1",
            name: "Alice",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();

    try {
      act(() => {
        view.getGridCell("email", 0).dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      const input = getOpenEditorInput();

      act(() => {
        setEditorValue(input, "alice+draft@example.com");
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "ArrowLeft",
            metaKey: true,
          }),
        );
      });
      await flush();

      const adjacentInput = getOpenEditorInput();

      expect(updateMutateMock).not.toHaveBeenCalled();
      expect(findButtonByText("Save 1 row")).toBeDefined();
      expect(adjacentInput.value).toBe("user_1");
    } finally {
      view.cleanup();
    }
  });

  it("locks row-set-changing controls while edits are staged and wiggles discard edits with a visible animation class", async () => {
    studioSupportsFullTableSearch = true;
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 2,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-01-01T10:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
          {
            __ps_rowid: "row-2",
            created_at: "2026-01-02T10:00:00.000Z",
            email: "bob@example.com",
            id: "user_2",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();

    try {
      act(() => {
        view.getGridCell("email", 0).dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      const input = getOpenEditorInput();

      act(() => {
        setEditorValue(input, "alice+draft@example.com");
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        );
      });
      await flush();

      const discardButton = findButtonByText("Discard edits");
      const addFilterButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Add filter"]',
      );
      const globalSearchButton =
        view.container.querySelector<HTMLButtonElement>(
          'button[aria-label="Global search"]',
        );
      const sortButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Sort ascending"]',
      );
      const nextPageButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Go to next page"]',
      );
      const rowSearchShell = view.container.querySelector<HTMLElement>(
        "[data-row-search-open]",
      );

      expect(discardButton).toBeDefined();
      expect(addFilterButton?.getAttribute("aria-disabled")).toBe("true");
      expect(globalSearchButton?.getAttribute("aria-disabled")).toBe("true");
      expect(sortButton?.getAttribute("aria-disabled")).toBe("true");
      expect(nextPageButton?.getAttribute("aria-disabled")).toBe("true");
      expect(rowSearchShell?.dataset.rowSearchOpen).toBe("false");
      expect(
        document.querySelector('input[aria-label="Select column to filter"]'),
      ).toBeNull();
      expect(setSortingStateMock).not.toHaveBeenCalled();
      expect(setPaginationStateMock).not.toHaveBeenCalled();

      act(() => {
        addFilterButton?.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      const firstWiggleAnimation = discardButton?.getAttribute(
        "data-wiggle-animation",
      );

      expect(firstWiggleAnimation).toBeTruthy();
      expect(discardButton?.className).toMatch(/animate-\[ps-discard-wiggle-/);
      expect(
        document.querySelector('input[aria-label="Select column to filter"]'),
      ).toBeNull();

      act(() => {
        globalSearchButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      expect(rowSearchShell?.dataset.rowSearchOpen).toBe("false");

      act(() => {
        sortButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      const secondWiggleAnimation = discardButton?.getAttribute(
        "data-wiggle-animation",
      );

      expect(setSortingStateMock).not.toHaveBeenCalled();
      expect(secondWiggleAnimation).toBeTruthy();
      expect(secondWiggleAnimation).not.toBe(firstWiggleAnimation);

      act(() => {
        nextPageButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      const thirdWiggleAnimation = discardButton?.getAttribute(
        "data-wiggle-animation",
      );

      expect(setPaginationStateMock).not.toHaveBeenCalled();
      expect(thirdWiggleAnimation).toBeTruthy();
      expect(thirdWiggleAnimation).not.toBe(secondWiggleAnimation);
    } finally {
      view.cleanup();
    }
  });

  it("confirms before discarding staged edits", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-01-01T10:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });
    useTableUiStateMock.mockReturnValue({
      tableUiState: {
        editingFilter: {
          after: "and",
          filters: [],
          id: "table-ui-filter",
          kind: "FilterGroup",
        },
        id: "public.users",
        rowSelectionState: {},
        stagedRows: [],
        stagedUpdates: [
          {
            changes: {
              created_at: "2026-01-03T10:00:00.000Z",
              email: "alice+draft@example.com",
            },
            row: {
              __ps_rowid: "row-1",
              created_at: "2026-01-01T10:00:00.000Z",
              email: "alice@example.com",
              id: "user_1",
            },
            rowId: "row-1",
          },
        ],
      },
      updateTableUiState: vi.fn(),
    });

    const view = renderView();

    try {
      const discardButton = findButtonByText("Discard edits");

      expect(discardButton).toBeDefined();
      expect(findButtonByText("Save 1 row")).toBeDefined();
      expect(view.getGridCell("email", 0).textContent).toContain(
        "alice+draft@example.com",
      );

      act(() => {
        discardButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      const dialog = queryConfirmationDialog();
      const dialogButtons = Array.from(
        dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      );

      expect(dialog).not.toBeNull();
      expect(dialog?.querySelector("p")?.textContent?.trim()).toBe(
        "Discard edits to 2 cells?",
      );
      expect(dialog?.className).toContain("border-border");
      expect(dialog?.className).toContain("bg-card");
      expect(dialog?.className).toContain("text-card-foreground");
      expect(dialog?.className).toContain("shadow-2xl");
      expect(dialogButtons).toHaveLength(2);
      expect(dialogButtons[0]?.textContent?.trim()).toBe("yes, discard");
      expect(dialogButtons[1]?.textContent?.trim()).toBe("no, keep editing");
      expect(dialogButtons[0]?.className).toContain("bg-destructive");
      expect(dialogButtons[0]?.className).toContain(
        "text-destructive-foreground",
      );
      expect(dialogButtons[1]?.className).toContain("bg-secondary");
      expect(dialogButtons[1]?.className).toContain("text-secondary-foreground");
      expectConfirmationFocusRing(dialogButtons[0]);
      expect(document.activeElement).toBe(dialogButtons[0]);

      act(() => {
        dialogButtons[0]?.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "ArrowRight",
          }),
        );
      });

      expect(document.activeElement).toBe(dialogButtons[1]);

      act(() => {
        dialogButtons[1]?.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        );
      });
      await flush();

      expect(findButtonByText("Save 1 row")).toBeDefined();
      expect(queryConfirmationDialog()).toBeNull();

      act(() => {
        discardButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      const reopenedDialog = queryConfirmationDialog();
      const reopenedButtons = Array.from(
        reopenedDialog?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      );

      expect(reopenedButtons).toHaveLength(2);
      expect(document.activeElement).toBe(reopenedButtons[0]);

      act(() => {
        reopenedButtons[0]?.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        );
      });
      await flush();

      expect(findButtonByText("Save 1 row")).toBeUndefined();
      expect(findButtonByText("Discard edits")).toBeUndefined();
      expect(view.getGridCell("email", 0).textContent).toContain(
        "alice@example.com",
      );
    } finally {
      view.cleanup();
    }
  });

  it("grows the query window from page zero when infinite scroll loads more rows", async () => {
    isInfiniteScrollEnabled = true;
    paginationStateValue = { pageIndex: 0, pageSize: 10 };
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 120,
        rows: [],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();

    try {
      expect(useActiveTableQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pageIndex: 0,
          pageSize: 25,
        }),
      );

      const loadMoreButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Load more rows"]',
      );

      act(() => {
        loadMoreButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      expect(useActiveTableQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pageIndex: 0,
          pageSize: 50,
        }),
      );
    } finally {
      view.cleanup();
    }
  });

  it("keeps previously loaded rows visible while the next infinite-scroll window is fetching", async () => {
    isInfiniteScrollEnabled = true;
    const firstWindowRows = Array.from({ length: 25 }, (_, index) => ({
      __ps_rowid: `row-${index + 1}`,
      created_at: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      email: `user-${index + 1}@example.com`,
      id: `user-${index + 1}`,
    }));
    const secondWindowRows = Array.from({ length: 50 }, (_, index) => ({
      __ps_rowid: `row-${index + 1}`,
      created_at: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      email: `user-${index + 1}@example.com`,
      id: `user-${index + 1}`,
    }));
    let secondWindowResolved = false;

    useActiveTableQueryMock.mockImplementation((props) => {
      if (props.pageSize === 25) {
        return {
          data: {
            filteredRowCount: 120,
            rows: firstWindowRows,
          },
          isFetching: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: {
          filteredRowCount: 120,
          rows: secondWindowResolved ? secondWindowRows : [],
        },
        isFetching: !secondWindowResolved,
        refetch: vi.fn(),
      };
    });

    const view = renderView();

    try {
      await flush();

      expect(view.container.querySelectorAll("tbody tr")).toHaveLength(25);

      const loadMoreButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Load more rows"]',
      );

      act(() => {
        loadMoreButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      expect(useActiveTableQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pageIndex: 0,
          pageSize: 50,
        }),
      );
      expect(view.container.querySelectorAll("tbody tr")).toHaveLength(25);

      secondWindowResolved = true;
      view.rerender();
      await flush();

      expect(view.container.querySelectorAll("tbody tr")).toHaveLength(50);
    } finally {
      view.cleanup();
    }
  });

  it("resets the infinite-scroll query window when the visible row set changes", async () => {
    isInfiniteScrollEnabled = true;
    studioSupportsFullTableSearch = true;
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 120,
        rows: [],
      },
      isFetching: false,
      refetch: vi.fn(),
    });

    const view = renderView();

    try {
      const loadMoreButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Load more rows"]',
      );

      act(() => {
        loadMoreButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      expect(useActiveTableQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pageIndex: 0,
          pageSize: 50,
          searchTerm: "",
        }),
      );

      navigationSearchParam = "alice";
      view.rerender();
      await flush();

      expect(useActiveTableQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pageIndex: 0,
          pageSize: 25,
          searchTerm: "alice",
        }),
      );
    } finally {
      view.cleanup();
    }
  });

  it("confirms before saving staged edits", async () => {
    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-01-01T10:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });
    useTableUiStateMock.mockReturnValue({
      tableUiState: {
        editingFilter: {
          after: "and",
          filters: [],
          id: "table-ui-filter",
          kind: "FilterGroup",
        },
        id: "public.users",
        rowSelectionState: {},
        stagedRows: [],
        stagedUpdates: [
          {
            changes: {
              email: "alice+draft@example.com",
            },
            row: {
              __ps_rowid: "row-1",
              created_at: "2026-01-01T10:00:00.000Z",
              email: "alice@example.com",
              id: "user_1",
            },
            rowId: "row-1",
          },
        ],
      },
      updateTableUiState: vi.fn(),
    });

    const view = renderView();

    try {
      const saveButton = findButtonByText("Save 1 row");

      expect(saveButton).toBeDefined();

      act(() => {
        saveButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      const dialog = queryConfirmationDialog();
      const dialogButtons = Array.from(
        dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      );

      expect(dialog).not.toBeNull();
      expect(dialog?.querySelector("p")?.textContent?.trim()).toBe(
        "Commit 1 updated row to the database?",
      );
      expect(dialog?.className).toContain("border-border");
      expect(dialog?.className).toContain("bg-card");
      expect(dialog?.className).toContain("text-card-foreground");
      expect(dialog?.className).toContain("shadow-2xl");
      expect(dialogButtons).toHaveLength(2);
      expect(dialogButtons[0]?.textContent?.trim()).toBe("yes, write to db");
      expect(dialogButtons[1]?.textContent?.trim()).toBe("no, keep editing");
      expect(dialogButtons[0]?.className).toContain("bg-primary");
      expect(dialogButtons[0]?.className).toContain("text-primary-foreground");
      expect(dialogButtons[1]?.className).toContain("bg-secondary");
      expect(dialogButtons[1]?.className).toContain("text-secondary-foreground");
      expectConfirmationFocusRing(dialogButtons[0]);
      expect(document.activeElement).toBe(dialogButtons[0]);

      act(() => {
        dialogButtons[0]?.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "ArrowRight",
          }),
        );
      });

      expect(document.activeElement).toBe(dialogButtons[1]);

      act(() => {
        dialogButtons[1]?.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        );
      });
      await flush();

      expect(updateManyMutateMock).not.toHaveBeenCalled();
      expect(findButtonByText("Save 1 row")).toBeDefined();
      expect(queryConfirmationDialog()).toBeNull();

      act(() => {
        saveButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      const reopenedDialog = queryConfirmationDialog();
      const reopenedButtons = Array.from(
        reopenedDialog?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      );

      expect(reopenedButtons).toHaveLength(2);
      expect(document.activeElement).toBe(reopenedButtons[0]);

      act(() => {
        reopenedButtons[0]?.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        );
      });
      await flush();

      expect(updateManyMutateMock).toHaveBeenCalledTimes(1);
      expect(updateManyMutateMock).toHaveBeenCalledWith(
        {
          updates: [
            {
              changes: {
                email: "alice+draft@example.com",
              },
              row: {
                __ps_rowid: "row-1",
                created_at: "2026-01-01T10:00:00.000Z",
                email: "alice@example.com",
                id: "user_1",
              },
            },
          ],
        },
        expect.any(Object),
      );
      expect(
        (
          updateManyMutateMock.mock.calls[0]?.[1] as
            | { onSuccess?: unknown }
            | undefined
        )?.onSuccess,
      ).toBeTypeOf("function");
      expect(queryConfirmationDialog()).toBeNull();
    } finally {
      view.cleanup();
    }
  });

  it("only shows copy-as actions while rows or cells are selected", () => {
    const view = renderView();
    const copyAsTrigger = findButtonByText("copy as");

    expect(copyAsTrigger).toBeUndefined();

    view.cleanup();
  });

  it("shows copy-as actions for cell selections and copies csv with headers by default", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 2,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
          {
            __ps_rowid: "row-2",
            created_at: "2026-03-12T00:00:00.000Z",
            email: "bob@example.com",
            id: "user_2",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });
    gridSelectionState = {
      mode: "cell",
      start: {
        columnId: "id",
        columnIndex: 0,
        rowIndex: 0,
      },
      end: {
        columnId: "email",
        columnIndex: 1,
        rowIndex: 1,
      },
    };
    gridColumnOrderState = ["id", "email", "created_at"];

    const view = renderView();
    const copyAsTrigger = findButtonByText("copy as");

    expect(copyAsTrigger).toBeDefined();
    expect(copyAsTrigger?.className).toContain("font-sans");

    dispatchPointerClick(copyAsTrigger);
    await flush();

    expect(document.body.textContent).toContain("include column header");
    expect(document.body.textContent).toContain("copy markdown");
    expect(document.body.textContent).toContain("copy csv");
    expect(document.body.textContent).toContain("save markdown");
    expect(document.body.textContent).toContain("save csv");

    const checkedCheckbox = findMenuCheckboxByText("include column header");

    expect(checkedCheckbox).not.toBeNull();
    expect(checkedCheckbox?.getAttribute("aria-checked")).toBe("true");
    expect(checkedCheckbox?.className).toContain("font-sans");

    const copyCsvButton = findMenuItemByText("copy csv");

    expect(copyCsvButton).toBeDefined();

    dispatchPointerClick(copyCsvButton);

    expect(writeText).toHaveBeenCalledWith(
      "id,email\nuser_1,alice@example.com\nuser_2,bob@example.com",
    );

    view.cleanup();
  });

  it("saves markdown for all selected rows when header inclusion is turned off", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:selection-export");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 2,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
          {
            __ps_rowid: "row-2",
            created_at: "2026-03-12T00:00:00.000Z",
            email: "bob@example.com",
            id: "user_2",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });
    useSelectionMock.mockReturnValue({
      deleteSelection: vi.fn(),
      isSelecting: true,
      rowSelectionState: {
        "row-1": true,
        "row-2": true,
      },
      setRowSelectionState: vi.fn(),
    });
    gridColumnOrderState = ["id", "email", "created_at"];

    const view = renderView();
    const copyAsTrigger = findButtonByText("copy as");

    expect(copyAsTrigger).toBeDefined();

    dispatchPointerClick(copyAsTrigger);
    await flush();

    const includeHeaderButton = findMenuCheckboxByText("include column header");

    expect(includeHeaderButton).not.toBeNull();

    dispatchPointerClick(includeHeaderButton);
    await flush();

    expect(
      findMenuCheckboxByText("include column header")?.getAttribute(
        "aria-checked",
      ),
    ).toBe("false");

    const saveMarkdownButton = findMenuItemByText("save markdown");

    expect(saveMarkdownButton).toBeDefined();

    dispatchPointerClick(saveMarkdownButton);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:selection-export");

    const blobArg = createObjectURL.mock.calls[0]?.[0];

    if (!(blobArg instanceof Blob)) {
      throw new Error("Expected selection export download to use a Blob");
    }

    expect(await blobArg.text()).toBe(
      "| user_1 | alice@example.com | 2026-03-11T00:00:00.000Z |\n| user_2 | bob@example.com | 2026-03-12T00:00:00.000Z |",
    );
    expect(blobArg.type).toBe("text/markdown;charset=utf-8");

    view.cleanup();
  });

  it("uses the grid column pinning and order for cell selection exports", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    useActiveTableQueryMock.mockReturnValue({
      data: {
        filteredRowCount: 1,
        rows: [
          {
            __ps_rowid: "row-1",
            created_at: "2026-03-11T00:00:00.000Z",
            email: "alice@example.com",
            id: "user_1",
          },
        ],
      },
      isFetching: false,
      refetch: vi.fn(),
    });
    gridSelectionState = {
      mode: "cell",
      start: {
        columnId: "email",
        columnIndex: 0,
        rowIndex: 0,
      },
      end: {
        columnId: "created_at",
        columnIndex: 1,
        rowIndex: 0,
      },
    };
    gridColumnOrderState = ["created_at", "id", "email"];
    gridColumnPinningState = {
      left: ["__ps_select", "email"],
      right: [],
    };

    const view = renderView();
    const copyAsTrigger = findButtonByText("copy as");

    expect(copyAsTrigger).toBeDefined();

    dispatchPointerClick(copyAsTrigger);
    await flush();

    const copyCsvButton = findMenuItemByText("copy csv");

    expect(copyCsvButton).toBeDefined();

    dispatchPointerClick(copyCsvButton);

    expect(writeText).toHaveBeenCalledWith(
      "email,created_at\nalice@example.com,2026-03-11T00:00:00.000Z",
    );

    view.cleanup();
  });

  it("registers the expected table command palette actions", () => {
    const view = renderView();
    const lastRegistration = useRegisterCommandPaletteActionsMock.mock.calls.at(
      -1,
    ) as [Array<{ id: string }>] | undefined;
    const actionIds = lastRegistration?.[0].map((action) => action.id) ?? [];

    expect(actionIds).toEqual([
      "table.search.focus",
      "table.search.execute",
      "table.filter-with-ai.focus",
      "table.filter-with-ai.execute",
      "table.insert-row",
      "table.refresh",
      "table.next-page",
      "table.previous-page",
    ]);

    view.cleanup();
  });

  it("registers staged save and discard command palette actions and opens the existing dialogs", async () => {
    useTableUiStateMock.mockReturnValue({
      tableUiState: {
        editingFilter: {
          after: "and",
          filters: [],
          id: "table-ui-filter",
          kind: "FilterGroup",
        },
        id: "public.users",
        rowSelectionState: {},
        stagedRows: [],
        stagedUpdates: [
          {
            changes: {
              email: "alice+draft@example.com",
            },
            row: {
              __ps_rowid: "row-1",
              created_at: "2026-01-01T10:00:00.000Z",
              email: "alice@example.com",
              id: "user_1",
            },
            rowId: "row-1",
          },
        ],
      },
      updateTableUiState: vi.fn(),
    });

    const view = renderView();
    const lastRegistration = useRegisterCommandPaletteActionsMock.mock.calls.at(
      -1,
    ) as
      | [
          Array<{
            id: string;
            label: string | ((query: string) => string);
            onSelect: (query: string) => void | Promise<void>;
          }>,
        ]
      | undefined;
    const registeredActions = lastRegistration?.[0] ?? [];
    const actionIds = registeredActions.map((action) => action.id);
    const saveAction = registeredActions.find(
      (action) => action.id === "table.save-staged-changes",
    );
    const discardAction = registeredActions.find(
      (action) => action.id === "table.discard-staged-changes",
    );

    expect(actionIds).toEqual([
      "table.search.focus",
      "table.search.execute",
      "table.filter-with-ai.focus",
      "table.filter-with-ai.execute",
      "table.save-staged-changes",
      "table.discard-staged-changes",
      "table.insert-row",
      "table.refresh",
      "table.next-page",
      "table.previous-page",
    ]);
    expect(saveAction?.label).toBe("Save 1 row");
    expect(discardAction?.label).toBe("Discard edits");

    if (!saveAction || !discardAction) {
      throw new Error("Could not find the registered staged edit actions");
    }

    await act(async () => {
      await saveAction.onSelect("");
    });
    await flush();

    expect(document.body.textContent).toContain(
      "Commit 1 updated row to the database?",
    );
    expect(document.body.textContent).toContain("yes, write to db");

    act(() => {
      findButtonByText("no, keep editing")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await flush();

    await act(async () => {
      await discardAction.onSelect("");
    });
    await flush();

    expect(document.body.textContent).toContain("Discard edits to 1 cell?");
    expect(document.body.textContent).toContain("yes, discard");

    view.cleanup();
  });

  it("opens the toolbar row search from the focus command and applies direct search payloads", async () => {
    studioSupportsFullTableSearch = true;
    const view = renderView();
    const lastRegistration = useRegisterCommandPaletteActionsMock.mock.calls.at(
      -1,
    ) as
      | [
          Array<{
            id: string;
            onSelect: (query: string) => void | Promise<void>;
          }>,
        ]
      | undefined;
    const searchFocusAction = lastRegistration?.[0].find(
      (action) => action.id === "table.search.focus",
    );
    const searchExecuteAction = lastRegistration?.[0].find(
      (action) => action.id === "table.search.execute",
    );

    if (!searchFocusAction || !searchExecuteAction) {
      throw new Error("Could not find the registered search actions");
    }

    await act(async () => {
      await searchFocusAction.onSelect("se");
    });
    await flush();

    const searchInput = view.container.querySelector<HTMLInputElement>(
      'input[aria-label="Global search"]',
    );

    expect(searchInput).not.toBeNull();
    expect(document.activeElement).toBe(searchInput);

    await act(async () => {
      await searchExecuteAction.onSelect("search rows karl");
    });
    await flush();

    expect(searchInput?.value).toBe("karl");
    expect(setSearchParamMock).toHaveBeenCalledWith("karl");
    expect(setPageIndexParamMock).toHaveBeenCalledWith("0");

    view.cleanup();
  });

  it("focuses the AI filter input from the command palette focus action", async () => {
    studioLlm = llmMock;
    const view = renderView();
    const lastRegistration = useRegisterCommandPaletteActionsMock.mock.calls.at(
      -1,
    ) as
      | [
          Array<{
            id: string;
            onSelect: (query: string) => void | Promise<void>;
          }>,
        ]
      | undefined;
    const aiFocusAction = lastRegistration?.[0].find(
      (action) => action.id === "table.filter-with-ai.focus",
    );

    if (!aiFocusAction) {
      throw new Error("Could not find the registered AI focus action");
    }

    await act(async () => {
      await aiFocusAction.onSelect("fi");
    });
    await flush();

    const aiInput = view.container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter with AI"]',
    );
    const aiFilterControl = view.container.querySelector(
      '[data-testid="table-ai-filter-control"]',
    );

    expect(document.activeElement).toBe(aiInput);
    expect(aiFilterControl?.className).toContain("flex-1");

    view.cleanup();
  });

  it("only renders the AI filter input when Studio is configured with an llm function", () => {
    const view = renderView();

    expect(
      view.container.querySelector('input[aria-label="Filter with AI"]'),
    ).toBeNull();
    expect(
      view.container.querySelector('[data-testid="table-filter-combo-shell"]'),
    ).toBeNull();
    expect(
      view.container.querySelector('button[aria-label="Add filter"]'),
    ).not.toBeNull();

    view.cleanup();
  });

  it("expands the AI filter input, sends table metadata to the configured llm function, and applies the returned filters", async () => {
    studioLlm = llmMock;
    llmMock.mockResolvedValue(
      '{"filters":[{"column":"email","operator":"ilike","value":"%abba%"}]}',
    );
    const view = renderView();
    const { container } = view;
    const aiFilterControl = container.querySelector(
      '[data-testid="table-ai-filter-control"]',
    );
    const aiFilterShell = container.querySelector(
      '[data-testid="table-filter-combo-shell"]',
    );
    const headerEndControls = container.querySelector(
      '[data-testid="studio-header-end-controls"]',
    );
    const aiInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter with AI"]',
    );
    const insertRowButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Insert row"));
    const filterChevron = container.querySelector(
      '[data-testid="table-filter-menu-chevron"]',
    );

    if (
      !(aiFilterControl instanceof HTMLDivElement) ||
      !(aiFilterShell instanceof HTMLDivElement) ||
      !(aiInput instanceof HTMLInputElement) ||
      !(headerEndControls instanceof HTMLDivElement) ||
      !(insertRowButton instanceof HTMLButtonElement)
    ) {
      throw new Error("Could not find the AI filter control");
    }

    expect(aiFilterShell.className).toContain("overflow-hidden");
    expect(aiFilterShell.className).toContain("border");
    expect(aiInput.className).toContain("border-0");
    expect(insertRowButton.className).toContain("h-9");
    expect(headerEndControls.className).toContain("pl-2");
    expect(headerEndControls.querySelectorAll("button")).toHaveLength(1);
    expect(filterChevron).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Apply AI filter"]'),
    ).toBeNull();

    act(() => {
      aiInput.focus();
    });
    await flush();

    expect(aiFilterControl.className).toContain("flex-1");

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(aiInput, "email contains abba");
      aiInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    expect(
      container.querySelector('button[aria-label="Apply AI filter"]'),
    ).not.toBeNull();

    act(() => {
      aiInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });
    await flush();

    expect(llmMock).toHaveBeenCalledTimes(1);
    expect(llmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Table: public.users"),
        task: "table-filter",
      }),
    );
    expect(llmMock.mock.calls[0]?.[0].prompt).toContain(
      "- email: character varying(64) (group: string; supported operators: =, !=, is, is not, like, not like, ilike, not ilike)",
    );
    expect(llmMock.mock.calls[0]?.[0].prompt).toContain(
      "Allowed operators: =, !=, >, >=, <, <=, is, is not, like, not like, ilike, not ilike",
    );
    expect(llmMock.mock.calls[0]?.[0].prompt).toContain(
      'Return this exact top-level shape: {"filters":[...]}',
    );
    expect(llmMock.mock.calls[0]?.[0].prompt).toContain(
      'Each filter item must be either {"kind":"column","column":"column_name","operator":"=","value":"value"} or {"kind":"sql","sql":"raw SQL WHERE clause"}.',
    );
    expect(llmMock.mock.calls[0]?.[0].prompt).toContain(
      "User request: email contains abba",
    );
    expect(llmMock.mock.calls[0]?.[0].prompt).toContain(
      'Use kind "sql" only as a fallback when the user\'s request cannot be fully expressed with the predefined column filters above.',
    );

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            column: "email",
            operator: "ilike",
            value: "%abba%",
          }),
        ],
      }),
    );
    expect(container.textContent).toContain("email");
    expect(container.textContent).toContain("%abba%");
    const aiGeneratedPill = container.querySelector(
      '[data-filter-origin="ai"]',
    );

    expect(aiGeneratedPill).not.toBeNull();
    expect(aiGeneratedPill?.getAttribute("data-filter-ai-query")).toBe(
      "email contains abba",
    );

    view.cleanup();
  });

  it("retries invalid AI filters once and leaves a yellow warning pill when the retry is still invalid", async () => {
    studioLlm = llmMock;
    llmMock
      .mockResolvedValueOnce(
        '{"filters":[{"column":"email","operator":"is","value":"abba"}]}',
      )
      .mockResolvedValueOnce(
        '{"filters":[{"column":"email","operator":"is","value":"abba"}]}',
      );
    const view = renderView();
    const { container } = view;
    const aiInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter with AI"]',
    );

    if (!(aiInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the AI filter input");
    }

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(aiInput, "email is abba");
      aiInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
      aiInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });
    await flush();
    await flush();

    expect(llmMock).toHaveBeenCalledTimes(2);
    expect(llmMock.mock.calls[1]?.[0].prompt).toContain(
      "Original user request: email is abba",
    );
    expect(llmMock.mock.calls[1]?.[0].prompt).toContain(
      'Previous response: {"filters":[{"column":"email","operator":"is","value":"abba"}]}',
    );
    expect(llmMock.mock.calls[1]?.[0].prompt).toContain(
      '"is" only supports null checks. Use value "null".',
    );
    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [],
      }),
    );

    const invalidPill = container.querySelector(
      '[data-filter-syntax-state="invalid"]',
    );

    expect(invalidPill).not.toBeNull();
    expect(invalidPill?.className).toContain("border-amber-400");
    expect(container.textContent).toContain("email");
    expect(container.textContent).toContain("abba");
    expect(invalidPill?.getAttribute("data-filter-origin")).toBe("ai");
    expect(invalidPill?.getAttribute("data-filter-ai-query")).toBe(
      "email is abba",
    );

    expect(invalidPill?.getAttribute("title")).toBeNull();
    expect(invalidPill?.getAttribute("data-filter-syntax-message")).toContain(
      '"is" only supports null checks. Use value "null".',
    );

    view.cleanup();
  });

  it("applies AI SQL fallback filters when the response uses the SQL filter kind", async () => {
    studioLlm = llmMock;
    llmMock.mockResolvedValue(
      '{"filters":[{"kind":"sql","sql":"WHERE extract(year from created_at) = 2025"}]}',
    );
    const view = renderView();
    const { container } = view;
    const aiInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter with AI"]',
    );

    if (!(aiInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the AI filter input");
    }

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(aiInput, "created in 2025 with extract year");
      aiInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
      aiInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });
    await flush();
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            kind: "SqlFilter",
            sql: "WHERE extract(year from created_at) = 2025",
          }),
        ],
      }),
    );
    expect(container.textContent).toContain("SQL");
    expect(container.textContent).toContain(
      "extract(year from created_at) = 2025",
    );

    view.cleanup();
  });

  it("saves an invalid manual filter as a warning pill and keeps it out of the applied URL filter", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    expect(addFilterButton.className).toContain("text-foreground");

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const emailColumnButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("email"));

    if (!(emailColumnButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the email filter option");
    }

    act(() => {
      emailColumnButton.click();
    });
    await flush();
    await flush();

    const isOperatorButton = Array.from(
      document.querySelectorAll("button"),
    ).find(
      (button) =>
        button.textContent?.includes("Is") &&
        button.textContent?.includes("IS") &&
        !button.textContent?.includes("not"),
    );

    if (!(isOperatorButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the is operator option");
    }

    act(() => {
      isOperatorButton.click();
    });
    await flush();

    const valueInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Filter value for email"]',
    );

    if (!(valueInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the filter value input");
    }

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(valueInput, "abba");
      valueInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    const applyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Apply filter"]',
    );

    if (!(applyButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the apply filter button");
    }

    act(() => {
      applyButton.click();
    });
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [],
      }),
    );

    const invalidPill = container.querySelector(
      '[data-filter-syntax-state="invalid"]',
    );

    expect(invalidPill).not.toBeNull();
    expect(invalidPill?.className).toContain("border-amber-400");
    expect(
      document.querySelector('input[aria-label="Filter value for email"]'),
    ).toBeNull();
    expect(container.textContent).toContain("abba");

    expect(invalidPill?.getAttribute("title")).toBeNull();
    expect(invalidPill?.getAttribute("data-filter-syntax-message")).toContain(
      '"is" only supports null checks. Use value "null".',
    );

    view.cleanup();
  });

  it("adds inline filter pills, focuses the value input after choosing an operator, applies on enter, and removes filters", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const emailColumnButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("email"));

    if (!(emailColumnButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the email filter option");
    }

    act(() => {
      emailColumnButton.click();
    });
    await flush();
    await flush();

    const filterRow = container.querySelector(
      '[data-testid="table-filter-row"]',
    );
    const filterPillList = container.querySelector(
      '[data-testid="table-filter-pill-list"]',
    );
    const columnHeaderRow = container.querySelector(
      '[data-testid="column-header-row"]',
    );
    const mockGridHead = container.querySelector(
      '[data-testid="mock-grid-head"]',
    );
    const mockGrid = container.querySelector('[data-testid="mock-grid"]');

    expect(filterRow).not.toBeNull();
    expect(filterPillList?.className).toContain("flex-wrap");
    expect(mockGridHead?.contains(filterRow)).toBe(false);
    expect(mockGrid?.previousElementSibling).toBe(filterRow);
    expect(columnHeaderRow?.previousElementSibling).not.toBe(filterRow);
    expect(filterRow?.textContent).toContain("email");
    expect(
      document.querySelector('input[aria-label="Select operator"]'),
    ).not.toBeNull();
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Greater than"),
      ),
    ).toBe(false);

    const equalOperatorButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Equal"));

    if (!(equalOperatorButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the equal operator option");
    }

    act(() => {
      equalOperatorButton.click();
    });
    await flush();

    const valueInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Filter value for email"]',
    );

    if (!(valueInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the filter value input");
    }

    expect(document.activeElement).toBe(valueInput);

    const setInputValue = (value: string) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(valueInput, value);
    };

    act(() => {
      setInputValue("abba");
      valueInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
      valueInput.dispatchEvent(
        new Event("change", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    act(() => {
      valueInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            column: "email",
            operator: "=",
            value: "abba",
          }),
        ],
      }),
    );

    const removeFilterButton = container.querySelector(
      'button[aria-label="Remove filter"]',
    );

    if (!(removeFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the remove filter button");
    }

    act(() => {
      removeFilterButton.click();
    });
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [],
      }),
    );
    expect(
      container.querySelector('[data-testid="table-filter-row"]'),
    ).toBeNull();

    view.cleanup();
  });

  it("adds inline SQL filter pills, applies the clause on enter, and removes them", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const sqlOptionButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("SQL WHERE clause"));

    if (!(sqlOptionButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the SQL filter option");
    }

    act(() => {
      sqlOptionButton.click();
    });
    await flush();

    const sqlInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="SQL WHERE clause"]',
    );

    if (!(sqlInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the SQL filter input");
    }

    expect(document.activeElement).toBe(sqlInput);

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(sqlInput, "WHERE lower(email) like '%abba%'");
      sqlInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
      sqlInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            kind: "SqlFilter",
            sql: "WHERE lower(email) like '%abba%'",
          }),
        ],
      }),
    );
    expect(container.textContent).toContain("SQL");
    expect(container.textContent).toContain("WHERE lower(email) like '%abba%'");

    const removeFilterButton = container.querySelector(
      'button[aria-label="Remove SQL filter"]',
    );

    if (!(removeFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the remove SQL filter button");
    }

    act(() => {
      removeFilterButton.click();
    });
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [],
      }),
    );

    view.cleanup();
  });

  it("applies SQL filters immediately, then marks them invalid without mutating the applied state when async lint fails", async () => {
    const deferredLint = createDeferred<Either<Error, AdapterSqlLintResult>>();
    sqlLintMock.mockReturnValueOnce(deferredLint.promise);
    studioSqlLint = sqlLintMock;
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const sqlOptionButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("SQL WHERE clause"));

    if (!(sqlOptionButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the SQL filter option");
    }

    act(() => {
      sqlOptionButton.click();
    });
    await flush();

    const sqlInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="SQL WHERE clause"]',
    );

    if (!(sqlInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the SQL filter input");
    }

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(sqlInput, "WHERE lower(email) like ('%abba%'");
      sqlInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
      sqlInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            kind: "SqlFilter",
            sql: "WHERE lower(email) like ('%abba%'",
          }),
        ],
      }),
    );
    const sqlLintCall = sqlLintMock.mock.calls[0];

    if (!sqlLintCall) {
      throw new Error("Expected SQL lint to be called");
    }

    const [sqlLintDetails, sqlLintOptions] = sqlLintCall;

    expect(sqlLintDetails.schemaVersion).toMatch(/^schema-/);
    expect(sqlLintDetails.sql).toContain(
      'select * from "public"."users" where',
    );
    expect(sqlLintOptions.abortSignal).toBeInstanceOf(AbortSignal);
    expect(
      container.querySelector('[data-filter-syntax-state="invalid"]'),
    ).toBeNull();

    deferredLint.resolve([
      null,
      {
        diagnostics: [
          {
            from: 57,
            message: "syntax error at end of input",
            severity: "error",
            to: 57,
          } satisfies AdapterSqlLintDiagnostic,
        ],
        schemaVersion: "schema-v1",
      },
    ]);
    await flush();
    await flush();
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenCalledTimes(1);
    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            kind: "SqlFilter",
            sql: "WHERE lower(email) like ('%abba%'",
          }),
        ],
      }),
    );

    const invalidPill = container.querySelector(
      '[data-filter-syntax-state="invalid"]',
    );

    expect(invalidPill).not.toBeNull();
    expect(invalidPill?.getAttribute("title")).toBeNull();
    expect(invalidPill?.getAttribute("data-filter-syntax-message")).toContain(
      "syntax error at end of input. Near: WHERE lower(email) like ('%abba%'",
    );

    view.cleanup();
  });

  it("only shows filter conditions that are valid for the selected column type", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    const filterButton = addFilterButton;

    async function openOperatorMenuForColumn(columnName: string) {
      act(() => {
        filterButton.click();
      });
      await flush();

      const columnButton = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.includes(columnName),
      );

      if (!(columnButton instanceof HTMLButtonElement)) {
        throw new Error(`Could not find the ${columnName} filter option`);
      }

      act(() => {
        columnButton.click();
      });
      await flush();
      await flush();
    }

    async function dismissDraftFilter() {
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Escape",
          }),
        );
      });
      await flush();
    }

    await openOperatorMenuForColumn("email");
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Like"),
      ),
    ).toBe(true);
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Greater than"),
      ),
    ).toBe(false);
    await dismissDraftFilter();

    await openOperatorMenuForColumn("created_at");
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Greater than"),
      ),
    ).toBe(true);
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Like"),
      ),
    ).toBe(false);
    await dismissDraftFilter();

    await openOperatorMenuForColumn("id");
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Equal"),
      ),
    ).toBe(true);
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Like"),
      ),
    ).toBe(false);
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Greater than"),
      ),
    ).toBe(false);

    view.cleanup();
  });

  it("uses explicit pill control sizing and resets so embedded host button styles do not distort filters", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const emailColumnButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("email"));

    if (!(emailColumnButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the email filter option");
    }

    act(() => {
      emailColumnButton.click();
    });
    await flush();
    await flush();

    const equalOperatorButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Equal"));

    if (!(equalOperatorButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the equal operator option");
    }

    act(() => {
      equalOperatorButton.click();
    });
    await flush();

    const operatorButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Choose operator for email"]',
    );
    const valueInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Filter value for email"]',
    );

    if (
      !(operatorButton instanceof HTMLButtonElement) ||
      !(valueInput instanceof HTMLInputElement)
    ) {
      throw new Error("Could not find the inline email filter controls");
    }

    const outerPill = operatorButton.parentElement;
    const columnSegment = operatorButton.previousElementSibling;

    expect(outerPill?.className).toContain("font-sans");
    expect(outerPill?.className).toContain("text-xs");
    expect(outerPill?.className).toContain("leading-none");
    expect(outerPill?.className).toContain("text-foreground");
    expect(columnSegment?.className).toContain("h-6");
    expect(columnSegment?.className).toContain("text-foreground");
    expect(operatorButton.className).toContain("h-6");
    expect(operatorButton.className).toContain("appearance-none");
    expect(operatorButton.className).toContain("bg-transparent");
    expect(operatorButton.className).toContain("font-sans");
    expect(operatorButton.className).toContain("leading-none");
    expect(operatorButton.className).toContain("text-foreground/80");
    expect(valueInput.className).toContain("h-6");
    expect(valueInput.className).toContain("min-h-0");
    expect(valueInput.className).toContain("bg-transparent");
    expect(valueInput.className).toContain("font-sans");
    expect(valueInput.className).toContain("leading-none");
    expect(valueInput.className).toContain("text-foreground");

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(valueInput, "abba");
      valueInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
      valueInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });
    await flush();

    const valueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("abba"),
    );
    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove filter"]',
    );

    if (
      !(valueButton instanceof HTMLButtonElement) ||
      !(removeButton instanceof HTMLButtonElement)
    ) {
      throw new Error("Could not find the applied filter controls");
    }

    expect(valueButton.className).toContain("h-6");
    expect(valueButton.className).toContain("appearance-none");
    expect(valueButton.className).toContain("bg-transparent");
    expect(valueButton.className).toContain("font-sans");
    expect(valueButton.className).toContain("leading-none");
    expect(valueButton.className).toContain("text-foreground");
    expect(removeButton.className).toContain("h-6");
    expect(removeButton.className).toContain("appearance-none");
    expect(removeButton.className).toContain("bg-transparent");
    expect(removeButton.className).toContain("font-sans");
    expect(removeButton.className).toContain("leading-none");

    view.cleanup();
  });

  it("shows readable datatype names in the column picker instead of format masks", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const createdAtColumnButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("created_at"));

    if (!(createdAtColumnButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the created_at filter option");
    }

    expect(createdAtColumnButton.textContent).toContain("timestamptz");
    expect(createdAtColumnButton.textContent).not.toContain("YYYY-MM-DD");

    const pickerSearchInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Select column to filter"]',
    );

    if (!(pickerSearchInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the column picker search input");
    }

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(pickerSearchInput, "timestamptz");
      pickerSearchInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("created_at"),
      ),
    ).toBe(true);

    view.cleanup();
  });

  it("applies existing pill edits when clicking outside it", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const emailColumnButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("email"));

    if (!(emailColumnButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the email filter option");
    }

    act(() => {
      emailColumnButton.click();
    });
    await flush();
    await flush();

    const equalOperatorButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Equal"));

    if (!(equalOperatorButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the equal operator option");
    }

    act(() => {
      equalOperatorButton.click();
    });
    await flush();

    const valueInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Filter value for email"]',
    );

    if (!(valueInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the filter value input");
    }

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(valueInput, "abba");
      valueInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    act(() => {
      valueInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            column: "email",
            operator: "=",
            value: "abba",
          }),
        ],
      }),
    );
    expect(
      container.querySelector('button[aria-label="Remove filter"]'),
    ).not.toBeNull();

    const valueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("abba"),
    );

    if (!(valueButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the applied value button");
    }

    act(() => {
      valueButton.click();
    });
    await flush();

    const editedValueInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Filter value for email"]',
    );

    if (!(editedValueInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the edited filter value input");
    }

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(editedValueInput, "baba");
      editedValueInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            column: "email",
            operator: "=",
            value: "baba",
          }),
        ],
      }),
    );
    expect(
      document.querySelector('input[aria-label="Filter value for email"]'),
    ).toBeNull();

    view.cleanup();
  });

  it("removes a new draft pill when pressing escape", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const emailColumnButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("email"));

    if (!(emailColumnButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the email filter option");
    }

    act(() => {
      emailColumnButton.click();
    });
    await flush();
    await flush();

    expect(
      container.querySelector('[data-testid="table-filter-row"]'),
    ).not.toBeNull();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      );
    });
    await flush();

    expect(
      container.querySelector('[data-testid="table-filter-row"]'),
    ).toBeNull();
    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [],
      }),
    );

    view.cleanup();
  });

  it("removes a new draft pill when clicking outside it", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const emailColumnButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("email"));

    if (!(emailColumnButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the email filter option");
    }

    act(() => {
      emailColumnButton.click();
    });
    await flush();
    await flush();

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    expect(
      container.querySelector('[data-testid="table-filter-row"]'),
    ).toBeNull();
    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [],
      }),
    );

    view.cleanup();
  });

  it("applies existing pill edits and closes editing when pressing escape", async () => {
    const view = renderView();
    const { container } = view;
    const addFilterButton = container.querySelector(
      'button[aria-label="Add filter"]',
    );

    if (!(addFilterButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the add filter button");
    }

    act(() => {
      addFilterButton.click();
    });
    await flush();

    const emailColumnButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("email"));

    if (!(emailColumnButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the email filter option");
    }

    act(() => {
      emailColumnButton.click();
    });
    await flush();
    await flush();

    const equalOperatorButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Equal"));

    if (!(equalOperatorButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the equal operator option");
    }

    act(() => {
      equalOperatorButton.click();
    });
    await flush();

    const initialValueInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Filter value for email"]',
    );

    if (!(initialValueInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the initial filter value input");
    }

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(initialValueInput, "abba");
      initialValueInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
      initialValueInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });
    await flush();

    const valueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("abba"),
    );

    if (!(valueButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find the value button");
    }

    act(() => {
      valueButton.click();
    });
    await flush();

    const editedValueInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Filter value for email"]',
    );

    if (!(editedValueInput instanceof HTMLInputElement)) {
      throw new Error("Could not find the edited filter value input");
    }

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(editedValueInput, "baba");
      editedValueInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      );
    });
    await flush();

    expect(applyEditingFilterSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            column: "email",
            operator: "=",
            value: "baba",
          }),
        ],
      }),
    );
    expect(
      document.querySelector('input[aria-label="Filter value for email"]'),
    ).toBeNull();
    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("baba"),
      ),
    ).toBe(true);

    view.cleanup();
  });
});
