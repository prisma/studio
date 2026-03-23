import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Adapter } from "@/data";

import type { DataGridProps } from "../../grid/DataGrid";
import { SqlView } from "./SqlView";

type StudioMock = ReturnType<typeof createStudioMock>;
const useStudioMock = vi.fn<() => StudioMock>();
const setPinnedColumnIdsMock = vi.fn();
const stablePinnedColumnIds: string[] = [];
const stableSetPinnedColumnIds = (columnIds: string[]) => {
  setPinnedColumnIdsMock(columnIds);
};
let mockCodeMirrorOnChange: ((value: string) => void) | undefined;
let mockDataGridRenderCount = 0;
let latestDataGridProps: DataGridProps | null = null;
const useNavigationMock = vi.fn();

vi.mock("../../context", () => ({
  useStudio: () => useStudioMock(),
  useOptionalStudio: () => undefined,
}));

vi.mock("../../../hooks/use-column-pinning", () => ({
  useColumnPinning: () => ({
    pinnedColumnIds: stablePinnedColumnIds,
    setPinnedColumnIds: stableSetPinnedColumnIds,
  }),
}));

vi.mock("../../../hooks/use-introspection", () => ({
  useIntrospection: () => ({
    data: {
      filterOperators: [],
      query: { parameters: [], sql: "select 1" },
      schemas: {},
      timezone: "UTC",
    },
  }),
}));

vi.mock("../../../hooks/use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: (props: {
    "aria-label"?: string;
    onChange?: (value: string) => void;
    value?: string;
  }) => {
    mockCodeMirrorOnChange = props.onChange;

    return (
      <textarea
        aria-label={props["aria-label"] ?? "SQL editor"}
        onChange={(event) => {
          props.onChange?.(event.currentTarget.value);
        }}
        value={props.value ?? ""}
      />
    );
  },
}));

vi.mock("../../grid/DataGrid", () => ({
  DataGrid: (props: DataGridProps) => {
    mockDataGridRenderCount += 1;
    latestDataGridProps = props;

    return (
      <div data-testid="sql-result-grid-mock">
        <button aria-label="Pin column" type="button" />
        <span>{props.rows.length} row(s)</span>
      </div>
    );
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createAdapterMock(args?: { raw?: Adapter["raw"] }): {
  adapter: Adapter;
} {
  const raw: Adapter["raw"] =
    args?.raw ??
    (() => {
      return Promise.resolve([
        null,
        {
          query: { parameters: [], sql: "select 1 as one" },
          rowCount: 1,
          rows: [{ one: 1 }],
        },
      ]);
    });

  return {
    adapter: {
      defaultSchema: "public",
      delete: vi.fn(),
      insert: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn(),
      raw: vi.fn<Adapter["raw"]>(raw),
      update: vi.fn(),
    } as unknown as Adapter,
  };
}

function createStudioMock(adapter: Adapter) {
  return {
    adapter,
    getOrCreateRowsCollection: vi.fn(),
    hasAiSql: false,
    hasCustomTheme: false,
    isDarkMode: false,
    isNavigationOpen: true,
    onEvent: vi.fn(),
    operationEvents: [],
    queryClient: { clear: vi.fn() },
    requestLlm: vi.fn(async () => {
      throw new Error("Studio AI is not configured.");
    }),
    sqlEditorStateCollection: {
      delete: vi.fn(),
      get: vi.fn(),
      has: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
    tableQueryMetaCollection: { get: vi.fn() },
    tableUiStateCollection: { get: vi.fn() },
    toggleNavigation: vi.fn(),
    uiLocalStateCollection: {
      delete: vi.fn(),
      get: vi.fn(),
      has: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
  };
}

function renderSqlView() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<SqlView />);
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    container,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const timeoutMs = 3000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (assertion()) {
      return;
    }

    await flush();
  }

  throw new Error("Timed out waiting for SQL view state");
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  mockCodeMirrorOnChange = undefined;
  mockDataGridRenderCount = 0;
  latestDataGridProps = null;
});

beforeEach(() => {
  useNavigationMock.mockReturnValue({
    schemaParam: "public",
  });
});

describe("SqlView result rendering", () => {
  it("does not rerender the result grid when editing SQL after loading a large result", async () => {
    const largeRows = Array.from({ length: 5000 }, (_value, index) => ({
      n: index + 1,
    }));
    const { adapter } = createAdapterMock({
      raw: () => {
        return Promise.resolve([
          null,
          {
            query: {
              parameters: [],
              sql: "select * from generate_series(1, 5000) as n",
            },
            rowCount: largeRows.length,
            rows: largeRows,
          },
        ]);
      },
    });
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton || !mockCodeMirrorOnChange) {
      throw new Error("SQL view controls not rendered");
    }

    act(() => {
      mockCodeMirrorOnChange?.("select * from generate_series(1, 5000) as n;");
    });

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => latestDataGridProps?.rows.length === largeRows.length);

    const renderCountAfterQuery = mockDataGridRenderCount;

    act(() => {
      mockCodeMirrorOnChange?.(
        "select * from generate_series(1, 5000) as n where n > 10;",
      );
    });

    await flush();

    expect(renderCountAfterQuery).toBeGreaterThan(0);
    expect(mockDataGridRenderCount).toBe(renderCountAfterQuery);
    expect(latestDataGridProps?.rows).toHaveLength(largeRows.length);

    harness.cleanup();
  });
});
