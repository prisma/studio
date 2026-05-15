import { Search } from "lucide-react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type CommandPaletteContextAction,
  StudioCommandPaletteProvider,
  useRegisterCommandPaletteActions,
} from "./CommandPalette";
import { Navigation } from "./Navigation";
import { createActiveTableCommandPaletteActions } from "./views/table/active-table-command-actions";

interface NavigationMockValue {
  createUrl: (values: Record<string, string>) => string;
  metadata: {
    activeTable: { name: string; schema: string };
    isFetching: boolean;
  };
  schemaParam: string;
  setSchemaParam: () => Promise<URLSearchParams>;
  setTableParam: () => Promise<URLSearchParams>;
  viewParam: "console" | "query-insights" | "schema" | "sql" | "table";
}

interface IntrospectionMockValue {
  data: {
    schemas: Record<string, { name: string; tables: Record<string, unknown> }>;
  };
  isFetching: boolean;
}

const useNavigationMock = vi.fn<() => NavigationMockValue>();
const useIntrospectionMock = vi.fn<() => IntrospectionMockValue>();
const toggleNavigationMock = vi.fn();
const setThemeModeMock = vi.fn();
let isNavigationOpen = true;
let isDarkMode = false;
let hasDatabase = true;
let queryInsightsTransport: unknown;
let themeMode: "dark" | "light" | "system" = "system";
const uiStateStore = new Map<string, unknown>();
const uiStateListeners = new Map<string, Set<() => void>>();
/* eslint-disable @typescript-eslint/unbound-method */
const originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView =
  HTMLElement.prototype.scrollIntoView;
/* eslint-enable @typescript-eslint/unbound-method */

function emitUiState(key: string) {
  uiStateListeners.get(key)?.forEach((listener) => {
    listener();
  });
}

vi.mock("../hooks/use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

vi.mock("../hooks/use-introspection", () => ({
  useIntrospection: () => useIntrospectionMock(),
}));

vi.mock("../hooks/use-navigation-table-list", () => ({
  useNavigationTableList: ({
    schema,
    searchTerm,
  }: {
    schema: string;
    searchTerm: string;
  }) => {
    const allTables = [
      "accounts",
      "audit_logs",
      "feature_flags",
      "incidents",
      "orders",
      "organizations",
      "users",
    ].map((table) => ({
      id: `${schema}.${table}`,
      qualifiedName: `${schema}.${table}`,
      schema,
      table,
    }));
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return {
      isSearchActive: normalizedSearch.length > 0,
      tables: allTables.filter((table) =>
        normalizedSearch.length === 0
          ? true
          : table.table.toLowerCase().includes(normalizedSearch),
      ),
    };
  },
}));

vi.mock("../hooks/use-streams", () => ({
  useStreams: () => ({
    hasStreamsServer: false,
    isError: false,
    isLoading: false,
    streams: [],
  }),
}));

vi.mock("../hooks/use-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useUiState: <T,>(key: string, initialValue: T) => {
      if (!uiStateStore.has(key)) {
        uiStateStore.set(key, structuredClone(initialValue));
      }

      const subscribe = (listener: () => void) => {
        const listeners = uiStateListeners.get(key) ?? new Set<() => void>();
        listeners.add(listener);
        uiStateListeners.set(key, listeners);

        return () => {
          listeners.delete(listener);
        };
      };
      const getSnapshot = () =>
        (uiStateStore.get(key) ?? structuredClone(initialValue)) as T;
      const value = React.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getSnapshot,
      );

      const setValue = (updater: T | ((previous: T) => T)) => {
        const previous = getSnapshot();
        const nextValue =
          typeof updater === "function"
            ? (updater as (previous: T) => T)(previous)
            : updater;

        uiStateStore.set(key, structuredClone(nextValue));
        emitUiState(key);
      };
      const resetValue = () => {
        uiStateStore.set(key, structuredClone(initialValue));
        emitUiState(key);
      };

      return [value, setValue, resetValue] as const;
    },
  };
});

vi.mock("./context", () => ({
  useStudio: () => ({
    hasDatabase,
    isDarkMode,
    isNavigationOpen,
    queryInsights: queryInsightsTransport,
    setThemeMode: setThemeModeMock,
    themeMode,
    toggleNavigation: toggleNavigationMock,
  }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function keyDown(key: string, options?: KeyboardEventInit) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
      ...options,
    }),
  );
}

function inputText(element: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.bind(element);

  valueSetter?.(value);
  element.dispatchEvent(
    new Event("input", {
      bubbles: true,
      cancelable: true,
    }),
  );
  element.dispatchEvent(
    new Event("change", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

function getCommandItems(root: ParentNode = document.body) {
  return Array.from(root.querySelectorAll<HTMLElement>("[cmdk-item]"));
}

function getCommandItemByText(text: string, root: ParentNode = document.body) {
  return getCommandItems(root).find((item) =>
    item.textContent?.trim().includes(text),
  );
}

function getActiveCommandItem(root: ParentNode = document.body) {
  return root.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');
}

function getSwitchByLabel(label: string, root: ParentNode = document.body) {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="switch"]')).find(
    (element) => element.getAttribute("aria-label") === label,
  );
}

function getButtonByLabel(label: string, root: ParentNode = document.body) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) =>
      button.getAttribute("aria-label") === label ||
      button.textContent?.trim() === label,
  );
}

function TestActionRegistration(props: {
  actions: CommandPaletteContextAction[];
}) {
  useRegisterCommandPaletteActions(props.actions);

  return null;
}

function RenderCountActionRegistration(props: {
  actions: CommandPaletteContextAction[];
  onRender: () => void;
}) {
  props.onRender();
  useRegisterCommandPaletteActions(props.actions);

  return null;
}

describe("Studio command palette", () => {
  beforeEach(() => {
    useNavigationMock.mockReturnValue({
      createUrl(values: Record<string, string>) {
        return `#${Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}`;
      },
      schemaParam: "public",
      metadata: {
        activeTable: { name: "organizations", schema: "public" },
        isFetching: false,
      },
      setSchemaParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      setTableParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      viewParam: "table",
    });
    useIntrospectionMock.mockReturnValue({
      data: {
        schemas: {
          public: {
            name: "public",
            tables: {
              accounts: { columns: {}, name: "accounts", schema: "public" },
              audit_logs: {
                columns: {},
                name: "audit_logs",
                schema: "public",
              },
              feature_flags: {
                columns: {},
                name: "feature_flags",
                schema: "public",
              },
              incidents: { columns: {}, name: "incidents", schema: "public" },
              orders: { columns: {}, name: "orders", schema: "public" },
              organizations: {
                columns: {},
                name: "organizations",
                schema: "public",
              },
              users: { columns: {}, name: "users", schema: "public" },
            },
          },
        },
      },
      isFetching: false,
    });
    isNavigationOpen = true;
    isDarkMode = false;
    hasDatabase = true;
    queryInsightsTransport = undefined;
    themeMode = "system";
    setThemeModeMock.mockReset();
    toggleNavigationMock.mockReset();
    uiStateStore.clear();
    uiStateListeners.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    window.location.hash = "";
    isNavigationOpen = true;
    isDarkMode = false;
    hasDatabase = true;
    queryInsightsTransport = undefined;
    themeMode = "system";
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    uiStateStore.clear();
    uiStateListeners.clear();
  });

  it("opens on cmd+k, focuses the input, and shows the default table and navigation sections", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { metaKey: true });
    });

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );

    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(document.body.textContent).toContain("Suggested");
    expect(document.body.textContent).toContain("Tables");
    expect(document.body.textContent).toContain("Appearance");
    expect(document.body.textContent).toContain("Navigation");
    expect(document.body.textContent).toContain("accounts");
    expect(document.body.textContent).toContain("audit_logs");
    expect(document.body.textContent).toContain("feature_flags");
    expect(document.body.textContent).toContain("4 more...");
    expect(document.body.textContent).not.toContain("incidents");
    expect(document.body.textContent).toContain("Visualizer");
    expect(document.body.textContent).toContain("Console");
    expect(document.body.textContent).not.toContain("Query Insights");
    expect(document.body.textContent).toContain("SQL");
    expect(document.body.textContent).toContain("Studio theme");
    expect(document.body.textContent).toContain("Light");
    expect(document.body.textContent).toContain("Dark");
    expect(document.body.textContent).toContain("Match system theme");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows Query Insights in navigation commands only when configured", () => {
    queryInsightsTransport = {};
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StudioCommandPaletteProvider />);
    });

    act(() => {
      keyDown("k", { metaKey: true });
    });

    const item = getCommandItemByText("Query Insights");

    expect(item).toBeDefined();

    act(() => {
      item?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(window.location.hash).toBe("#viewParam=query-insights");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the popup inside the Studio scope and keeps it centered", () => {
    const studioRoot = document.createElement("div");
    studioRoot.className = "ps";
    document.body.appendChild(studioRoot);
    const root = createRoot(studioRoot);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const dialog = studioRoot.querySelector<HTMLElement>('[role="dialog"]');
    const commandRoot = studioRoot.querySelector<HTMLElement>("[cmdk-root]");
    const firstCommandItem = getCommandItemByText("Search rows", studioRoot);

    expect(dialog).not.toBeNull();
    expect(commandRoot).not.toBeNull();
    expect(dialog?.className).toContain("top-[50%]");
    expect(dialog?.className).toContain("translate-y-[-50%]");
    expect(dialog?.className).toContain("font-sans");
    expect(dialog?.className).toContain("rounded-xl");
    expect(firstCommandItem?.className).toContain("font-sans");
    expect(firstCommandItem?.className).toContain("min-h-9");
    expect(firstCommandItem?.className).toContain("rounded-xl");

    act(() => {
      root.unmount();
    });
    studioRoot.remove();
  });

  it("filters commands, keeps the AI filter action matchable, and limits tables to the top three matches", () => {
    const filterWithAiSpy = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "filter-ai",
                label: (query) => `Filter with AI: ${query.trim()}`,
                onSelect: filterWithAiSpy,
                shouldShow: (query) => query.trim().length > 0,
              },
              {
                icon: Search,
                id: "search",
                keywords: ["search"],
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );

    if (!input) {
      throw new Error("Expected command palette input");
    }

    act(() => {
      inputText(input, "top 5 users called Karl");
    });

    const aiAction = getCommandItemByText(
      "Filter with AI: top 5 users called Karl",
    );

    expect(aiAction).not.toBeNull();

    act(() => {
      inputText(input, "or");
    });

    expect(document.body.textContent).toContain("organizations");
    expect(document.body.textContent).toContain("orders");
    expect(document.body.textContent).not.toContain("accounts");

    const filteredTableButtons = getCommandItems()
      .map((item) => item.textContent?.trim() ?? "")
      .filter((label) => ["organizations", "orders"].includes(label));

    expect(filteredTableButtons).toHaveLength(2);

    act(() => {
      inputText(input, "top 5 users called Karl");
    });

    const actionableAiButton = getCommandItemByText(
      "Filter with AI: top 5 users called Karl",
    );

    if (!(actionableAiButton instanceof HTMLElement)) {
      throw new Error("Expected AI filter action button");
    }

    act(() => {
      actionableAiButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(filterWithAiSpy).toHaveBeenCalledWith("top 5 users called Karl");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("switches Studio into dark mode without closing the command palette", () => {
    isDarkMode = false;
    themeMode = "light";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );

    if (!input) {
      throw new Error("Expected command palette input");
    }

    const darkModeButton = getButtonByLabel("Dark mode");

    if (!(darkModeButton instanceof HTMLElement)) {
      throw new Error("Expected dark mode button");
    }

    act(() => {
      darkModeButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(setThemeModeMock).toHaveBeenCalledWith("dark");
    expect(
      document.querySelector('input[aria-label="Search commands"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows match-system as a switch and disables manual theme buttons while it is on", () => {
    isDarkMode = false;
    themeMode = "system";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const matchSystemSwitch = getSwitchByLabel("Match system theme");
    const lightModeButton = getButtonByLabel("Light mode");
    const darkModeButton = getButtonByLabel("Dark mode");

    expect(matchSystemSwitch?.getAttribute("aria-checked")).toBe("true");
    expect(lightModeButton?.getAttribute("disabled")).toBe("");
    expect(darkModeButton?.getAttribute("disabled")).toBe("");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("toggles match-system mode on without closing the command palette", () => {
    isDarkMode = true;
    themeMode = "dark";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const matchSystemSwitch = getSwitchByLabel("Match system theme");

    if (!(matchSystemSwitch instanceof HTMLElement)) {
      throw new Error("Expected match system switch");
    }

    act(() => {
      matchSystemSwitch.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(setThemeModeMock).toHaveBeenCalledWith("system");
    expect(
      document.querySelector('input[aria-label="Search commands"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("toggles match-system mode with keyboard enter without closing the command palette", () => {
    isDarkMode = true;
    themeMode = "dark";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );

    if (!input) {
      throw new Error("Expected command palette input");
    }

    act(() => {
      inputText(input, "match system");
    });

    expect(getActiveCommandItem()?.textContent).toContain("Match system theme");

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });

    expect(setThemeModeMock).toHaveBeenCalledWith("system");
    expect(
      document.querySelector('input[aria-label="Search commands"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("turns off match-system mode into the current effective theme", () => {
    isDarkMode = true;
    themeMode = "system";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const matchSystemSwitch = getSwitchByLabel("Match system theme");

    if (!(matchSystemSwitch instanceof HTMLElement)) {
      throw new Error("Expected match system switch");
    }

    act(() => {
      matchSystemSwitch.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(setThemeModeMock).toHaveBeenCalledWith("dark");
    expect(
      document.querySelector('input[aria-label="Search commands"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("toggles Studio theme with keyboard enter without closing the command palette", () => {
    isDarkMode = false;
    themeMode = "light";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );

    if (!input) {
      throw new Error("Expected command palette input");
    }

    act(() => {
      inputText(input, "studio theme");
    });

    expect(getActiveCommandItem()?.textContent).toContain("Studio theme");

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });

    expect(setThemeModeMock).toHaveBeenCalledWith("dark");
    expect(
      document.querySelector('input[aria-label="Search commands"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders appearance rows without the extra bordered card styling", () => {
    themeMode = "light";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const matchSystemItem = getCommandItemByText("Match system theme");
    const studioThemeItem = getCommandItemByText("Studio theme");

    expect(matchSystemItem?.className).not.toContain("border-border/60");
    expect(studioThemeItem?.className).not.toContain("border-border/60");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("hands off extra-table browsing to the existing sidebar table search", () => {
    const studioRoot = document.createElement("div");
    studioRoot.className = "ps";
    document.body.appendChild(studioRoot);
    const root = createRoot(studioRoot);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <Navigation />
          <TestActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const paletteInput = studioRoot.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );

    if (!paletteInput) {
      throw new Error("Expected command palette input");
    }

    act(() => {
      inputText(paletteInput, "s");
    });

    const moreTablesButton = getCommandItemByText("4 more...", studioRoot);

    if (!(moreTablesButton instanceof HTMLElement)) {
      throw new Error("Expected extra tables button");
    }

    act(() => {
      moreTablesButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    const tablesBlock = studioRoot.querySelector("[data-search-open]");
    const sidebarSearchInput = studioRoot.querySelector<HTMLInputElement>(
      'input[aria-label="Search tables"]',
    );

    expect(
      studioRoot.querySelector('input[aria-label="Search commands"]'),
    ).toBeNull();
    expect(tablesBlock?.getAttribute("data-search-open")).toBe("true");
    expect(sidebarSearchInput?.value).toBe("s");
    expect(document.activeElement).toBe(sidebarSearchInput);
    expect(studioRoot.textContent).toContain("users");
    expect(studioRoot.textContent).not.toContain("Search rows");

    act(() => {
      root.unmount();
    });
    studioRoot.remove();
  });

  it("treats command-name prefixes as focus actions and free text as direct search/filter payloads", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={createActiveTableCommandPaletteActions({
              canGoToNextPage: true,
              canGoToPreviousPage: true,
              hasAiFilter: true,
              hasStagedChanges: false,
              isInsertingDisabled: false,
              onDiscardStagedChanges: vi.fn(),
              onFocusFilterWithAi: vi.fn(),
              onFocusSearch: vi.fn(),
              onGoToNextPage: vi.fn(),
              onGoToPreviousPage: vi.fn(),
              onInsertRow: vi.fn(),
              onRefresh: vi.fn(),
              onRunFilterWithAi: vi.fn(),
              onRunSearch: vi.fn(),
              onSaveStagedChanges: vi.fn(),
              saveStagedChangesLabel: "Save 1 row",
            })}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );

    if (!input) {
      throw new Error("Expected command palette input");
    }

    act(() => {
      inputText(input, "fi");
    });

    expect(document.body.textContent).toContain("Filter with AI");
    expect(document.body.textContent).not.toContain("Search rows");
    expect(document.body.textContent).not.toContain("Filter with AI: fi");

    act(() => {
      inputText(input, "Karl");
    });

    expect(document.body.textContent).toContain("Search rows: Karl");
    expect(document.body.textContent).toContain("Filter with AI: Karl");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows staged save and discard actions when staged edits exist", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={createActiveTableCommandPaletteActions({
              canGoToNextPage: true,
              canGoToPreviousPage: true,
              hasAiFilter: true,
              hasStagedChanges: true,
              isInsertingDisabled: false,
              onDiscardStagedChanges: vi.fn(),
              onFocusFilterWithAi: vi.fn(),
              onFocusSearch: vi.fn(),
              onGoToNextPage: vi.fn(),
              onGoToPreviousPage: vi.fn(),
              onInsertRow: vi.fn(),
              onRefresh: vi.fn(),
              onRunFilterWithAi: vi.fn(),
              onRunSearch: vi.fn(),
              onSaveStagedChanges: vi.fn(),
              saveStagedChangesLabel: "Save 2 rows",
            })}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    expect(document.body.textContent).toContain("Save 2 rows");
    expect(document.body.textContent).toContain("Discard edits");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("supports arrow-key navigation immediately after opening", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={createActiveTableCommandPaletteActions({
              canGoToNextPage: true,
              canGoToPreviousPage: true,
              hasAiFilter: true,
              hasStagedChanges: false,
              isInsertingDisabled: false,
              onDiscardStagedChanges: vi.fn(),
              onFocusFilterWithAi: vi.fn(),
              onFocusSearch: vi.fn(),
              onGoToNextPage: vi.fn(),
              onGoToPreviousPage: vi.fn(),
              onInsertRow: vi.fn(),
              onRefresh: vi.fn(),
              onRunFilterWithAi: vi.fn(),
              onRunSearch: vi.fn(),
              onSaveStagedChanges: vi.fn(),
              saveStagedChangesLabel: "Save 1 row",
            })}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );

    if (!input) {
      throw new Error("Expected command palette input");
    }

    expect(getActiveCommandItem()?.textContent).toContain("Search rows");

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "ArrowDown",
        }),
      );
    });

    expect(getActiveCommandItem()?.textContent).toContain("Filter with AI");

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "ArrowUp",
        }),
      );
    });

    expect(getActiveCommandItem()?.textContent).toContain("Search rows");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("scrolls the active command into view when keyboard navigation reaches hidden items", () => {
    const scrollCalls: Array<{
      options: ScrollIntoViewOptions | undefined;
      text: string;
    }> = [];
    HTMLElement.prototype.scrollIntoView = vi.fn(function (
      this: HTMLElement,
      options?: ScrollIntoViewOptions,
    ) {
      scrollCalls.push({
        options,
        text: this.textContent?.trim() ?? "",
      });
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={createActiveTableCommandPaletteActions({
              canGoToNextPage: true,
              canGoToPreviousPage: true,
              hasAiFilter: true,
              hasStagedChanges: false,
              isInsertingDisabled: false,
              onDiscardStagedChanges: vi.fn(),
              onFocusFilterWithAi: vi.fn(),
              onFocusSearch: vi.fn(),
              onGoToNextPage: vi.fn(),
              onGoToPreviousPage: vi.fn(),
              onInsertRow: vi.fn(),
              onRefresh: vi.fn(),
              onRunFilterWithAi: vi.fn(),
              onRunSearch: vi.fn(),
              onSaveStagedChanges: vi.fn(),
              saveStagedChangesLabel: "Save 1 row",
            })}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );

    if (!input) {
      throw new Error("Expected command palette input");
    }

    for (let index = 0; index < 20; index += 1) {
      if (getActiveCommandItem()?.textContent?.includes("Visualizer")) {
        break;
      }

      act(() => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "ArrowDown",
          }),
        );
      });
    }

    expect(getActiveCommandItem()?.textContent).toContain("Visualizer");
    expect(scrollCalls).toContainEqual(
      expect.objectContaining({
        options: {
          block: "nearest",
        },
        text: "Visualizer",
      }),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("updates registered actions when the current screen state changes", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                disabled: true,
                icon: Search,
                id: "next-page",
                label: "Next page",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    let nextPageButton = getCommandItemByText("Next page");

    if (!(nextPageButton instanceof HTMLElement)) {
      throw new Error("Expected next page button");
    }

    expect(nextPageButton.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <TestActionRegistration
            actions={[
              {
                disabled: false,
                icon: Search,
                id: "next-page",
                label: "Next page",
                onSelect: vi.fn(),
              },
            ]}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    nextPageButton = getCommandItemByText("Next page");

    if (!(nextPageButton instanceof HTMLElement)) {
      throw new Error("Expected next page button after update");
    }

    expect(nextPageButton.getAttribute("aria-disabled")).not.toBe("true");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not rerender registered screens when the palette open state changes", () => {
    const onRender = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioCommandPaletteProvider>
          <RenderCountActionRegistration
            actions={[
              {
                icon: Search,
                id: "search",
                label: "Search rows",
                onSelect: vi.fn(),
              },
            ]}
            onRender={onRender}
          />
        </StudioCommandPaletteProvider>,
      );
    });

    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      keyDown("k", { ctrlKey: true });
    });

    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
