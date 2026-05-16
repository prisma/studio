import "vitest-canvas-mock";

import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Adapter, AdapterError } from "@/data";
import type { StudioLlmRequest } from "@/data/llm";

import { SqlView } from "./SqlView";

type StudioMock = ReturnType<typeof createStudioMock>;
const useStudioMock = vi.fn<() => StudioMock>();
const useNavigationMock = vi.fn();
const setPinnedColumnIdsMock = vi.fn();
let mockEditorCursorHead = 0;
let mockEditorDocLength = 0;
let mockEditorDocText = "";
let mockCodeMirrorOnChange: ((value: string) => void) | undefined;
let mockCodeMirrorExtensions: unknown[] = [];
const mockEditorDispatch = vi.fn((transaction: unknown) => {
  if (
    typeof transaction === "object" &&
    transaction !== null &&
    "selection" in transaction
  ) {
    const selection = (
      transaction as {
        selection?: { anchor?: number; head?: number };
      }
    ).selection;

    if (typeof selection?.head === "number") {
      mockEditorCursorHead = selection.head;
    } else if (typeof selection?.anchor === "number") {
      mockEditorCursorHead = selection.anchor;
    }
  }
});
const mockEditorFocus = vi.fn();

vi.mock("../../context", () => ({
  useStudio: () => useStudioMock(),
  useOptionalStudio: () => undefined,
}));

vi.mock("../../../hooks/use-column-pinning", () => ({
  useColumnPinning: () => ({
    pinnedColumnIds: [],
    setPinnedColumnIds: (columnIds: string[]) => {
      setPinnedColumnIdsMock(columnIds);
    },
  }),
}));

vi.mock("../../../hooks/use-introspection", () => ({
  useIntrospection: () => ({
    data: {
      filterOperators: [],
      query: { parameters: [], sql: "select 1" },
      schemas: {
        public: {
          name: "public",
          tables: {
            organizations: {
              columns: {
                id: {
                  datatype: {
                    group: "numeric",
                    isArray: false,
                    isNative: true,
                    name: "int4",
                    options: [],
                    schema: "pg_catalog",
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
                  schema: "public",
                  table: "organizations",
                },
              },
              name: "organizations",
              schema: "public",
            },
          },
        },
      },
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
    extensions?: unknown[];
    onCreateEditor?: (view: {
      dispatch: (transaction: unknown) => void;
      focus: () => void;
      state: {
        doc: { length: number; toString: () => string };
        selection: { main: { head: number } };
      };
    }) => void;
    onChange?: (value: string) => void;
    value?: string;
  }) => {
    mockCodeMirrorOnChange = props.onChange;
    mockCodeMirrorExtensions = props.extensions ?? [];
    mockEditorDocLength = (props.value ?? "").length;
    mockEditorDocText = props.value ?? "";
    props.onCreateEditor?.({
      dispatch: mockEditorDispatch,
      focus: mockEditorFocus,
      state: {
        doc: {
          get length() {
            return mockEditorDocLength;
          },
          toString() {
            return mockEditorDocText;
          },
        },
        selection: {
          main: {
            get head() {
              return mockEditorCursorHead;
            },
          },
        },
      },
    });

    return (
      <textarea
        aria-label={props["aria-label"] ?? "SQL editor"}
        onChange={(event) => {
          mockEditorDocText = event.currentTarget.value;
          mockEditorDocLength = event.currentTarget.value.length;
          props.onChange?.(event.currentTarget.value);
        }}
        value={props.value ?? ""}
      />
    );
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createAdapterMock(args?: { raw?: Adapter["raw"] }): {
  adapter: Adapter;
  rawSpy: ReturnType<typeof vi.fn<Adapter["raw"]>>;
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

  const rawSpy = vi.fn<Adapter["raw"]>(raw);

  return {
    adapter: {
      defaultSchema: "public",
      delete: vi.fn(),
      insert: vi.fn(),
      introspect: vi.fn(),
      query: vi.fn(),
      raw: rawSpy,
      update: vi.fn(),
    } as unknown as Adapter,
    rawSpy,
  };
}

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return {
    promise,
    resolve(value: T) {
      resolve?.(value);
    },
  };
}

function createStudioMock(adapter: Adapter): {
  adapter: Adapter;
  getOrCreateRowsCollection: ReturnType<typeof vi.fn>;
  hasAiSql: boolean;
  hasCustomTheme: boolean;
  isDarkMode: boolean;
  isNavigationOpen: boolean;
  llm: ((request: StudioLlmRequest) => Promise<string>) | undefined;
  onEvent: ReturnType<typeof vi.fn>;
  operationEvents: [];
  queryClient: { clear: ReturnType<typeof vi.fn> };
  requestLlm: ReturnType<
    typeof vi.fn<
      (request: { prompt: string; task: string }) => Promise<string>
    >
  >;
  sqlEditorStateCollection: {
    delete: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    has: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  tableQueryMetaCollection: { get: ReturnType<typeof vi.fn> };
  tableUiStateCollection: { get: ReturnType<typeof vi.fn> };
  toggleNavigation: ReturnType<typeof vi.fn>;
  uiLocalStateCollection: {
    delete: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    has: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
} {
  const sqlEditorRows = new Map<
    string,
    { aiPromptHistory?: string[]; id: string; queryText?: string }
  >();
  const sqlEditorStateCollection = {
    delete: vi.fn(),
    get: vi.fn((id: string) => sqlEditorRows.get(id)),
    has: vi.fn((id: string) => sqlEditorRows.has(id)),
    insert: vi.fn(
      (item: { aiPromptHistory?: string[]; id: string; queryText?: string }) => {
      sqlEditorRows.set(item.id, item);
      },
    ),
    update: vi.fn(
      (
        id: string,
        updater: (draft: {
          aiPromptHistory?: string[];
          id: string;
          queryText?: string;
        }) => void,
      ) => {
        const existing = sqlEditorRows.get(id);
        if (!existing) {
          return;
        }

        const draft = { ...existing };
        updater(draft);
        sqlEditorRows.set(id, draft);
      },
    ),
  };
  let llm: ((request: StudioLlmRequest) => Promise<string>) | undefined;

  const studio = {
    adapter,
    get llm() {
      return llm;
    },
    set llm(value: ((request: StudioLlmRequest) => Promise<string>) | undefined) {
      llm = value;
    },
    getOrCreateRowsCollection: vi.fn(),
    get hasAiSql() {
      return typeof llm === "function";
    },
    hasCustomTheme: false,
    isDarkMode: false,
    isNavigationOpen: true,
    onEvent: vi.fn(),
    operationEvents: [] as [],
    queryClient: { clear: vi.fn() },
    requestLlm: vi.fn(async (request: { prompt: string; task: string }) => {
      if (typeof llm === "function") {
        return await llm(request as StudioLlmRequest);
      }

      throw new Error("Studio AI is not configured.");
    }),
    tableQueryMetaCollection: { get: vi.fn() },
    tableUiStateCollection: { get: vi.fn() },
    toggleNavigation: vi.fn(),
    sqlEditorStateCollection,
    uiLocalStateCollection: {
      delete: vi.fn(),
      get: vi.fn(),
      has: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
  };

  return studio;
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  if (!setter) {
    throw new Error("Input value setter is unavailable");
  }

  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function dispatchInputKey(
  element: HTMLInputElement,
  key: string,
  args?: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      key,
      ...args,
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

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  window.localStorage.clear();
  mockEditorCursorHead = 0;
  mockEditorDocLength = 0;
  mockEditorDocText = "";
  mockCodeMirrorOnChange = undefined;
  mockCodeMirrorExtensions = [];
});

beforeEach(() => {
  useNavigationMock.mockReturnValue({
    schemaParam: "public",
  });
});

describe("SqlView", () => {
  it("hides SQL AI controls and visualization affordances without llm", async () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton) {
      throw new Error("SQL view run control not rendered");
    }

    expect(
      harness.container.querySelector('input[aria-label="Generate SQL with AI"]'),
    ).toBeNull();
    expect(
      [...harness.container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Generate SQL"),
      ),
    ).toBeUndefined();

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return (
        harness.container.textContent?.includes("1 row(s) returned in") ?? false
      );
    });

    expect(
      harness.container.querySelector('[data-testid="sql-result-visualization-action"]'),
    ).toBeNull();
    expect(
      harness.container.querySelector('[data-testid="sql-result-visualization-row"]'),
    ).toBeNull();

    harness.cleanup();
  });

  it("generates SQL, focuses the editor, and waits for a manual run", async () => {
    const { adapter, rawSpy } = createAdapterMock();
    const studio = createStudioMock(adapter);
    const llmMock = vi.fn<(request: StudioLlmRequest) => Promise<string>>(
      async () =>
        JSON.stringify({
          rationale: "Matched the organizations table.",
          sql: "select * from public.organizations limit 5;",
          shouldGenerateVisualization: false,
        }),
    );
    studio.llm = llmMock;
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const promptInput = harness.container.querySelector<HTMLInputElement>(
      'input[aria-label="Generate SQL with AI"]',
    );
    const generateButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Generate SQL"),
    );
    const editor = harness.container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="SQL editor"]',
    );

    if (!promptInput || !generateButton || !editor) {
      throw new Error("Expected SQL generation controls and editor");
    }

    act(() => {
      setInputValue(promptInput, "show me organizations");
    });

    mockEditorDispatch.mockClear();
    mockEditorFocus.mockClear();

    act(() => {
      generateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return editor.value === "select * from public.organizations limit 5;";
    });

    expect(llmMock).toHaveBeenCalledTimes(1);
    expect(rawSpy).not.toHaveBeenCalled();
    expect(harness.container.textContent).toContain(
      "Matched the organizations table.",
    );
    expect(harness.container.textContent).not.toContain("1 row(s) returned");
    expect(
      harness.container.querySelector('[data-testid="sql-result-summary"]'),
    ).toBeNull();
    expect(mockEditorFocus).toHaveBeenCalled();
    expect(mockEditorDispatch).toHaveBeenCalledWith({
      selection: {
        anchor: "select * from public.organizations limit 5;".length,
        head: "select * from public.organizations limit 5;".length,
      },
    });

    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton) {
      throw new Error("Expected Run SQL button");
    }

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return harness.container.textContent?.includes("1 row(s) returned") ?? false;
    });

    expect(rawSpy).toHaveBeenCalledWith(
      { sql: "select * from public.organizations limit 5" },
      expect.any(Object),
    );
    expect(llmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"shouldGenerateVisualization":true'),
        task: "sql-generation",
      }),
    );
    const summary = harness.container.querySelector(
      '[data-testid="sql-result-summary"]',
    );
    const visualizeAction = harness.container.querySelector(
      '[data-testid="sql-result-visualization-action"]',
    );

    expect(summary?.textContent).toContain("1 row(s) returned in");
    expect(visualizeAction?.textContent).toContain("Visualize data with AI");

    harness.cleanup();
  });

  it("auto-generates a chart after the user runs AI-generated SQL marked as graph-worthy", async () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    const llmMock = vi
      .fn<(request: StudioLlmRequest) => Promise<string>>()
      .mockResolvedValueOnce(
        JSON.stringify({
          rationale: "This should chart well by count.",
          sql: "select * from public.organizations limit 5;",
          shouldGenerateVisualization: true,
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          config: {
            data: {
              datasets: [
                {
                  data: [1],
                  label: "Rows",
                },
              ],
              labels: ["organizations"],
            },
            options: {
              responsive: false,
            },
            type: "bar",
          },
        }),
      );
    studio.llm = llmMock;
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const promptInput = harness.container.querySelector<HTMLInputElement>(
      'input[aria-label="Generate SQL with AI"]',
    );
    const generateButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Generate SQL"),
    );

    if (!promptInput || !generateButton) {
      throw new Error("Expected SQL generation controls");
    }

    act(() => {
      setInputValue(promptInput, "show me organizations");
    });

    act(() => {
      generateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return (
        harness.container.querySelector<HTMLTextAreaElement>(
          'textarea[aria-label="SQL editor"]',
        )?.value === "select * from public.organizations limit 5;"
      );
    });

    expect(llmMock).toHaveBeenCalledTimes(1);
    expect(
      harness.container.querySelector('[data-testid="sql-result-summary"]'),
    ).toBeNull();
    expect(
      harness.container.querySelector(
        '[data-testid="sql-result-visualization-chart"]',
      ),
    ).toBeNull();

    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton) {
      throw new Error("Expected Run SQL button");
    }

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return (
        (harness.container.textContent?.includes("1 row(s) returned") ?? false) &&
        harness.container.querySelector(
          '[data-testid="sql-result-visualization-chart"]',
        ) != null
      );
    });

    expect(llmMock).toHaveBeenCalledTimes(2);
    expect(llmMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompt: expect.stringContaining("Chart.js"),
        task: "sql-visualization",
      }),
    );
    expect(llmMock.mock.calls[1]?.[0].prompt).toContain("SQL: select 1 as one");
    expect(llmMock.mock.calls[1]?.[0].prompt).toContain(
      "AI query request: show me organizations",
    );
    expect(llmMock.mock.calls[1]?.[0].prompt).toContain(
      JSON.stringify([{ one: 1 }]),
    );
    expect(
      harness.container.querySelector('[data-testid="sql-result-visualization-action"]'),
    ).toBeNull();

    harness.cleanup();
  });

  it("surfaces query errors only after the user manually runs AI-generated SQL", async () => {
    const badSql = "select typeof(json_col) from public.organizations limit 5;";
    const raw: Adapter["raw"] = async (details) => {
      const error = new Error(
        "function typeof(json) does not exist",
      ) as AdapterError;
      error.query = { parameters: [], sql: details.sql };
      return [error];
    };
    const { adapter, rawSpy } = createAdapterMock({ raw });
    const studio = createStudioMock(adapter);
    const llmMock = vi.fn<(request: StudioLlmRequest) => Promise<string>>()
      .mockResolvedValue(
        JSON.stringify({
          rationale: "Tried a typeof helper.",
          sql: badSql,
        }),
      );
    studio.llm = llmMock;
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const promptInput = harness.container.querySelector<HTMLInputElement>(
      'input[aria-label="Generate SQL with AI"]',
    );
    const generateButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Generate SQL"),
    );
    const editor = harness.container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="SQL editor"]',
    );

    if (!promptInput || !generateButton || !editor) {
      throw new Error("Expected SQL generation controls and editor");
    }

    act(() => {
      setInputValue(promptInput, "aggregate the data types table in a fun way");
    });

    act(() => {
      generateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return editor.value === badSql;
    });

    expect(rawSpy).not.toHaveBeenCalled();

    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton) {
      throw new Error("Expected Run SQL button");
    }

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return (
        harness.container.textContent?.includes(
          "function typeof(json) does not exist",
        ) ?? false
      );
    });

    expect(llmMock).toHaveBeenCalledTimes(1);
    expect(rawSpy).toHaveBeenCalledTimes(1);
    expect(rawSpy).toHaveBeenCalledWith(
      { sql: "select typeof(json_col) from public.organizations limit 5" },
      expect.any(Object),
    );
    expect(harness.container.textContent).toContain(
      "Tried a typeof helper.",
    );

    harness.cleanup();
  });

  it("persists generated AI SQL prompts in the local SQL editor collection", async () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    studio.llm = vi.fn(async () =>
      JSON.stringify({
        rationale: "Matched the organizations table.",
        sql: "select * from public.organizations limit 5;",
        shouldGenerateVisualization: false,
      }),
    );
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const promptInput = harness.container.querySelector<HTMLInputElement>(
      'input[aria-label="Generate SQL with AI"]',
    );
    const generateButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Generate SQL"),
    );

    if (!promptInput || !generateButton) {
      throw new Error("Expected SQL generation controls");
    }

    act(() => {
      setInputValue(promptInput, "show me organizations");
    });

    act(() => {
      generateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      const promptHistoryRow = (
        studio.sqlEditorStateCollection.get as (id: string) => {
          aiPromptHistory?: string[];
          id: string;
          queryText?: string;
        } | undefined
      )("sql-editor:ai-prompt-history");

      return (
        !generateButton.disabled &&
        JSON.stringify(promptHistoryRow?.aiPromptHistory) ===
          JSON.stringify(["show me organizations"])
      );
    });

    act(() => {
      setInputValue(promptInput, "show me team members");
    });

    act(() => {
      generateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return !generateButton.disabled;
    });

    expect(
      (
        studio.sqlEditorStateCollection.get as (id: string) => {
          aiPromptHistory?: string[];
          id: string;
          queryText?: string;
        } | undefined
      )("sql-editor:ai-prompt-history"),
    ).toEqual({
      aiPromptHistory: ["show me team members", "show me organizations"],
      id: "sql-editor:ai-prompt-history",
    });

    harness.cleanup();
  });

  it("cycles AI prompt history as placeholder text and materializes it on keypress or click", async () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    studio.llm = vi.fn(async () =>
      JSON.stringify({
        rationale: "Matched the organizations table.",
        sql: "select * from public.organizations limit 5;",
        shouldGenerateVisualization: false,
      }),
    );
    window.localStorage.setItem(
      "prisma-studio-sql-editor-state-v1",
      JSON.stringify({
        "s:sql-editor:ai-prompt-history": {
          data: {
            aiPromptHistory: ["show me team members", "show me organizations"],
            id: "sql-editor:ai-prompt-history",
          },
          versionKey: "test-version",
        },
      }),
    );
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const promptInput = harness.container.querySelector<HTMLInputElement>(
      'input[aria-label="Generate SQL with AI"]',
    );

    if (!promptInput) {
      throw new Error("Expected AI SQL input");
    }

    act(() => {
      promptInput.focus();
      dispatchInputKey(promptInput, "ArrowUp");
    });

    expect(promptInput.value).toBe("");
    expect(promptInput.placeholder).toBe("show me team members");

    act(() => {
      dispatchInputKey(promptInput, "ArrowUp");
    });

    expect(promptInput.value).toBe("");
    expect(promptInput.placeholder).toBe("show me organizations");

    act(() => {
      dispatchInputKey(promptInput, "ArrowDown");
    });

    expect(promptInput.value).toBe("");
    expect(promptInput.placeholder).toBe("show me team members");

    act(() => {
      dispatchInputKey(promptInput, "Enter");
    });

    expect(promptInput.value).toBe("show me team members");
    expect(promptInput.placeholder).toBe("Generate SQL with AI ...");

    act(() => {
      setInputValue(promptInput, "");
      dispatchInputKey(promptInput, "ArrowUp");
    });

    expect(promptInput.value).toBe("");
    expect(promptInput.placeholder).toBe("show me team members");

    act(() => {
      promptInput.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(promptInput.value).toBe("show me team members");
    expect(promptInput.placeholder).toBe("Generate SQL with AI ...");

    harness.cleanup();
  });

  it("renders AI SQL generation errors inline", async () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    studio.llm = vi.fn(async () => {
      throw new Error("AI SQL generation exploded.");
    });
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const promptInput = harness.container.querySelector<HTMLInputElement>(
      'input[aria-label="Generate SQL with AI"]',
    );
    const generateButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Generate SQL"),
    );

    if (!promptInput || !generateButton) {
      throw new Error("Expected SQL generation controls");
    }

    act(() => {
      setInputValue(promptInput, "show me organizations");
    });

    act(() => {
      generateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return (
        harness.container.textContent?.includes("AI SQL generation exploded.") ??
        false
      );
    });

    harness.cleanup();
  });

  it("renders an in-grid graph action and swaps it for a chart after generation", async () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    const llmMock = vi.fn<(request: StudioLlmRequest) => Promise<string>>(
      async () =>
        JSON.stringify({
          config: {
            data: {
              datasets: [
                {
                  data: [1],
                  label: "Rows",
                },
              ],
              labels: ["organizations"],
            },
            options: {
              responsive: false,
            },
            type: "bar",
          },
        }),
    );
    studio.llm = llmMock;
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton) {
      throw new Error("SQL view controls not rendered");
    }

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return (
        harness.container.textContent?.includes("1 row(s) returned") ?? false
      );
    });

    const summary = harness.container.querySelector<HTMLElement>(
      '[data-testid="sql-result-summary"]',
    );
    const visualizeAction = harness.container.querySelector<HTMLElement>(
      '[data-testid="sql-result-visualization-action"]',
    );

    if (!summary || !visualizeAction) {
      throw new Error("Expected visualization action in SQL result summary");
    }

    expect(
      harness.container.querySelector('[data-testid="sql-result-visualization-row"]'),
    ).toBeNull();
    expect(summary.textContent).toContain("1 row(s) returned in");
    expect(harness.container.textContent?.includes("AI visualization")).toBe(
      false,
    );
    expect(
      harness.container.textContent?.includes(
        "Generate a Chart.js view from the current SQL result set.",
      ),
    ).toBe(false);
    expect(visualizeAction.textContent).toContain("Visualize data with AI");
    expect(visualizeAction.className.includes("border")).toBe(false);

    act(() => {
      visualizeAction.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    await waitFor(() => {
      return (
        harness.container.querySelector(
          '[data-testid="sql-result-visualization-chart"]',
        ) != null
      );
    });

    const firstVisualizationPrompt = llmMock.mock.calls.at(0)?.[0].prompt ?? "";
    const visualizationBand = harness.container.querySelector<HTMLElement>(
      '[data-testid="sql-result-visualization-band"]',
    );
    const chart = harness.container.querySelector<HTMLElement>(
      '[data-testid="sql-result-visualization-chart"]',
    );

    expect(llmMock).toHaveBeenCalledTimes(1);
    expect(firstVisualizationPrompt).toContain("Chart.js");
    expect(firstVisualizationPrompt).toContain("SQL: select 1 as one");
    expect(firstVisualizationPrompt).toContain(JSON.stringify([{ one: 1 }]));
    expect(visualizationBand?.className).toContain("sticky");
    expect(visualizationBand?.className).toContain("w-[100cqw]");
    expect(visualizationBand?.className).toContain("bg-white");
    expect(visualizationBand?.className).toContain("border-b");
    expect(chart?.className).toContain("mx-auto");
    expect(chart?.className).toContain(
      "w-[clamp(300px,calc(100cqw-2rem),1200px)]",
    );
    expect(chart?.className).toContain("min-w-[300px]");
    expect(chart?.className).toContain("max-w-[1200px]");
    expect(firstVisualizationPrompt).not.toContain("AI query request:");
    expect(
      harness.container.querySelector('[data-testid="sql-result-visualization-action"]'),
    ).toBeNull();

    harness.cleanup();
  });

  it("resets the generated chart when another query starts running", async () => {
    const secondQueryDeferred = createDeferred<
      [null, { query: { parameters: never[]; sql: string }; rowCount: number; rows: { one: number }[] }]
    >();
    let rawCallCount = 0;
    const raw: Adapter["raw"] = async (details) => {
      rawCallCount += 1;

      if (rawCallCount === 1) {
        return [
          null,
          {
            query: { parameters: [], sql: details.sql },
            rowCount: 1,
            rows: [{ one: 1 }],
          },
        ];
      }

      return await secondQueryDeferred.promise;
    };
    const { adapter } = createAdapterMock({ raw });
    const studio = createStudioMock(adapter);
    studio.llm = vi.fn(async () =>
      JSON.stringify({
        config: {
          data: {
            datasets: [
              {
                data: [1],
                label: "Rows",
              },
            ],
            labels: ["organizations"],
          },
          options: {
            responsive: false,
          },
          type: "pie",
        },
      }),
    );
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton) {
      throw new Error("SQL view controls not rendered");
    }

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return (
        harness.container.textContent?.includes("1 row(s) returned") ?? false
      );
    });

    const visualizeAction = harness.container.querySelector<HTMLElement>(
      '[data-testid="sql-result-visualization-action"]',
    );

    if (!visualizeAction) {
      throw new Error("Expected visualization action");
    }

    act(() => {
      visualizeAction.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    await waitFor(() => {
      return (
        harness.container.querySelector(
          '[data-testid="sql-result-visualization-chart"]',
        ) != null
      );
    });

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return (
        [...harness.container.querySelectorAll("button")].some((button) =>
          button.textContent?.includes("Cancel"),
        ) &&
        harness.container.querySelector(
          '[data-testid="sql-result-visualization-chart"]',
        ) == null &&
        (harness.container
          .querySelector('[data-testid="sql-result-visualization-action"]')
          ?.textContent?.includes("Visualize data with AI") ??
          false)
      );
    });

    await act(async () => {
      secondQueryDeferred.resolve([
        null,
        {
          query: { parameters: [], sql: "select * from" },
          rowCount: 1,
          rows: [{ one: 2 }],
        },
      ]);
      await Promise.resolve();
    });

    harness.cleanup();
  });

  it("executes SQL and renders rows in read-only DataGrid mode", async () => {
    const { adapter, rawSpy } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();

    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton) {
      throw new Error("SQL view controls not rendered");
    }

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      return (
        harness.container.textContent?.includes("1 row(s) returned") ?? false
      );
    });

    expect(rawSpy).toHaveBeenCalledWith(
      { sql: "select * from" },
      expect.any(Object),
    );
    const [firstRawCallArgs] = rawSpy.mock.calls;
    expect(firstRawCallArgs?.[1]?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(harness.container.textContent).not.toContain("History");
    expect(
      harness.container.querySelector('button[aria-label="Pin column"]'),
    ).toBeTruthy();
    expect(
      harness.container.querySelector('button[aria-label="Sort ascending"]'),
    ).toBeNull();
    expect(harness.container.querySelector('input[type="number"]')).toBeNull();
    expect(
      harness.container.querySelector(
        '[data-testid="sql-result-grid-container"]',
      )?.className,
    ).toContain("min-h-0");
    expect(studio.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "studio_operation_success",
      }),
    );

    harness.cleanup();
  });

  it("focuses the SQL editor and places cursor at end on mount", () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();

    expect(mockEditorFocus).toHaveBeenCalledTimes(1);
    expect(mockEditorDispatch).toHaveBeenCalledWith({
      selection: {
        anchor: "select * from ".length,
        head: "select * from ".length,
      },
    });

    harness.cleanup();
  });

  it("enables line wrapping in the SQL editor", () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();

    expect(mockCodeMirrorExtensions).toContain(EditorView.lineWrapping);

    harness.cleanup();
  });

  it("keeps the SQL editor in a bounded scroll region for long scripts", () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();

    const scrollRegion = harness.container.querySelector(
      '[data-testid="sql-editor-scroll-container"]',
    );
    expect(scrollRegion).toBeTruthy();
    expect(scrollRegion?.className).toContain("min-h-0");
    expect(scrollRegion?.className).toContain("overflow-hidden");

    harness.cleanup();
  });

  it("supports cancelling a running query", async () => {
    const raw: Adapter["raw"] = async (_details, options) => {
      return await new Promise((resolve) => {
        options.abortSignal.addEventListener("abort", () => {
          const error = new Error("aborted") as AdapterError;
          error.name = "AbortError";
          resolve([error]);
        });
      });
    };
    const { adapter } = createAdapterMock({ raw });
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();

    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton) {
      throw new Error("SQL view run control not rendered");
    }

    act(() => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    let cancelButton: HTMLButtonElement | undefined;
    await waitFor(() => {
      cancelButton = [...harness.container.querySelectorAll("button")].find(
        (candidate): candidate is HTMLButtonElement =>
          candidate.textContent?.includes("Cancel") ?? false,
      );
      return Boolean(cancelButton && !cancelButton.disabled);
    });

    if (!cancelButton) {
      throw new Error("Cancel control not rendered");
    }
    const readyCancelButton = cancelButton;

    act(() => {
      readyCancelButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    await waitFor(() => {
      return (
        harness.container.textContent?.includes("Query cancelled.") ?? false
      );
    });
    expect(studio.onEvent).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("runs the statement that contains the cursor when multiple statements are present", async () => {
    const { adapter, rawSpy } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    const runButton = [...harness.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Run SQL"),
    );

    if (!runButton || !mockCodeMirrorOnChange) {
      throw new Error("SQL editor controls not rendered");
    }

    const sql = "select 1 as one;\nselect 2 as two;";
    mockEditorCursorHead = sql.lastIndexOf("2");

    act(() => {
      mockCodeMirrorOnChange?.(sql);
    });

    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await waitFor(() => rawSpy.mock.calls.length > 0);

    expect(rawSpy).toHaveBeenCalledWith(
      { sql: "select 2 as two" },
      expect.any(Object),
    );

    harness.cleanup();
  });

  it("persists SQL editor draft text in TanStack local-storage collection", async () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const firstRender = renderSqlView();
    const editorInFirstRender =
      firstRender.container.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="SQL editor"]',
      );

    if (!editorInFirstRender || !mockCodeMirrorOnChange) {
      throw new Error("SQL editor not rendered");
    }

    expect(editorInFirstRender.value).toBe("select * from ");

    act(() => {
      mockCodeMirrorOnChange?.("select * from public.team_members;");
    });

    await waitFor(() => {
      return (
        studio.sqlEditorStateCollection.insert.mock.calls.length > 0 ||
        studio.sqlEditorStateCollection.update.mock.calls.length > 0
      );
    });

    firstRender.cleanup();

    const secondRender = renderSqlView();
    const editorInSecondRender =
      secondRender.container.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="SQL editor"]',
      );

    if (!editorInSecondRender) {
      throw new Error("SQL editor not rendered on second mount");
    }

    expect(editorInSecondRender.value).toBe(
      "select * from public.team_members;",
    );

    secondRender.cleanup();
  });

  it("flushes pending SQL editor draft on unmount before debounce delay", () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const firstRender = renderSqlView();

    if (!mockCodeMirrorOnChange) {
      throw new Error("SQL editor not rendered");
    }

    act(() => {
      mockCodeMirrorOnChange?.("select * from public.organizations;");
    });

    firstRender.cleanup();

    const secondRender = renderSqlView();
    const editorInSecondRender =
      secondRender.container.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="SQL editor"]',
      );

    if (!editorInSecondRender) {
      throw new Error("SQL editor not rendered on second mount");
    }

    expect(editorInSecondRender.value).toBe(
      "select * from public.organizations;",
    );
    expect(
      studio.sqlEditorStateCollection.insert.mock.calls.length +
        studio.sqlEditorStateCollection.update.mock.calls.length,
    ).toBeGreaterThan(0);

    secondRender.cleanup();
  });

  it("persists latest CodeMirror document text on unmount even before state sync", () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const firstRender = renderSqlView();
    mockEditorDocText = "select * from public.incidents;";
    mockEditorDocLength = mockEditorDocText.length;

    firstRender.cleanup();

    const secondRender = renderSqlView();
    const editorInSecondRender =
      secondRender.container.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="SQL editor"]',
      );

    if (!editorInSecondRender) {
      throw new Error("SQL editor not rendered on second mount");
    }

    expect(editorInSecondRender.value).toBe("select * from public.incidents;");
    expect(
      studio.sqlEditorStateCollection.insert.mock.calls.length +
        studio.sqlEditorStateCollection.update.mock.calls.length,
    ).toBeGreaterThan(0);

    secondRender.cleanup();
  });

  it("does not persist the default SQL when the editor is untouched", () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);

    const harness = renderSqlView();
    harness.cleanup();

    expect(studio.sqlEditorStateCollection.insert).not.toHaveBeenCalled();
    expect(studio.sqlEditorStateCollection.update).not.toHaveBeenCalled();
  });

  it("hydrates SQL editor draft from localStorage when collection row is not immediately available", () => {
    const { adapter } = createAdapterMock();
    const studio = createStudioMock(adapter);
    useStudioMock.mockReturnValue(studio);
    window.localStorage.setItem(
      "prisma-studio-sql-editor-state-v1",
      JSON.stringify({
        "s:sql-editor:draft": {
          data: {
            id: "sql-editor:draft",
            queryText: "select * from public.organizations limit 7;",
          },
          versionKey: "test-version",
        },
      }),
    );

    const harness = renderSqlView();
    const editor = harness.container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="SQL editor"]',
    );

    if (!editor) {
      throw new Error("SQL editor not rendered");
    }

    expect(editor.value).toBe("select * from public.organizations limit 7;");

    harness.cleanup();
  });
});
