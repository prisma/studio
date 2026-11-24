import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Navigation } from "./Navigation";
import {
  SERVICE_LOCATIONS_UI_STATE_KEY,
  TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY,
} from "./navigation-ui-state";

let isDarkMode = false;

interface NavigationMockValue {
  createUrl: (values: Record<string, string>) => string;
  metadata: {
    activeTable: { name: string; schema: string };
    isFetching: boolean;
  };
  schemaParam: string;
  setSchemaParam: () => Promise<URLSearchParams>;
  setTableParam: () => Promise<URLSearchParams>;
  searchParam?: string;
  streamParam: string | null;
  temporalSectionParam?: string | null;
  temporalRunParam?: string | null;
  temporalWfParam?: string | null;
  viewParam:
    "table" | "schema" | "queries" | "console" | "sql" | "stream" | "temporal";
}

interface IntrospectionMockValue {
  data: {
    schemas: Record<string, { name: string; tables: Record<string, unknown> }>;
  };
  errorState?: {
    adapterSource: string;
    message: string;
    operation: "introspect";
    query: { parameters: unknown[]; sql: string } | undefined;
    queryPreview: string | null;
  } | null;
  hasResolvedIntrospection?: boolean;
  isFetching: boolean;
  isRefetching?: boolean;
  refetch?: () => Promise<unknown>;
}

interface StreamsMockValue {
  hasStreamsServer: boolean;
  isError: boolean;
  isLoading: boolean;
  refetch?: () => Promise<unknown>;
  streams: Array<{
    createdAt: string;
    epoch: number;
    expiresAt: string | null;
    name: string;
    nextOffset: string;
    sealedThrough: string;
    uploadedThrough: string;
  }>;
}

interface StudioMockValue {
  adapter: { capabilities: { sqlDialect: "mysql" | "postgresql" | "sqlite" } };
  hasDatabase: boolean;
  isDarkMode: boolean;
  hasQueryInsights: boolean;
  navigationWidth: number;
  setNavigationWidth: (width: number) => void;
  temporalUrl?: string;
}

interface TemporalWorkflowsMockValue {
  data?: {
    countsByStatus: Record<string, number>;
    executions: Array<{
      runId: string;
      startTime: string;
      status: string;
      workflowId: string;
      workflowType: string;
    }>;
  };
}

const postgresAdapter = {
  capabilities: { sqlDialect: "postgresql" as const },
};
const useTemporalWorkflowsMock = vi.fn<() => TemporalWorkflowsMockValue>(
  () => ({}),
);
const useNavigationMock = vi.fn<() => NavigationMockValue>();
const useIntrospectionMock = vi.fn<() => IntrospectionMockValue>();
const useStreamsMock = vi.fn<() => StreamsMockValue>();
const useHasMigrationHistoryMock = vi.fn<() => boolean>(() => false);
const useStudioMock = vi.fn<() => StudioMockValue>();
const uiStateValues = new Map<string, unknown>();
const setNavigationWidthMock = vi.fn<(width: number) => void>();
const refetchIntrospectionMock = vi.fn<() => Promise<unknown>>();
const refetchStreamsMock = vi.fn<() => Promise<unknown>>();

vi.mock("../hooks/use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

vi.mock("../hooks/use-introspection", () => ({
  useIntrospection: () => useIntrospectionMock(),
}));

vi.mock("../hooks/use-migrations", () => ({
  useHasMigrationHistory: () => useHasMigrationHistoryMock(),
}));

vi.mock("../hooks/use-streams", () => ({
  useStreams: () => useStreamsMock(),
}));

vi.mock("../hooks/use-temporal", () => ({
  useTemporalAttention: () => ({}),
  useTemporalCapabilities: () => ({
    data: { supportsAdminApi: true, supportsSchedules: true },
  }),
  useTemporalNamespaces: () => ({ data: [{ name: "default" }] }),
  useTemporalWorkflows: () => useTemporalWorkflowsMock(),
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
      {
        id: "public.all_data_types",
        qualifiedName: "public.all_data_types",
        schema: "public",
        table: "all_data_types",
      },
      {
        id: "public.feature_flags",
        qualifiedName: "public.feature_flags",
        schema: "public",
        table: "feature_flags",
      },
      {
        id: "public.incidents",
        qualifiedName: "public.incidents",
        schema: "public",
        table: "incidents",
      },
      {
        id: "public.organizations",
        qualifiedName: "public.organizations",
        schema: "public",
        table: "organizations",
      },
      {
        id: "public.team_members",
        qualifiedName: "public.team_members",
        schema: "public",
        table: "team_members",
      },
    ];
    const term = searchTerm.trim().toLowerCase();
    const tables = allTables
      .filter((table) => table.schema === schema)
      .filter((table) => {
        if (term.length === 0) {
          return true;
        }

        return (
          table.table.toLowerCase().includes(term) ||
          table.qualifiedName.toLowerCase().includes(term)
        );
      });

    return {
      isSearchActive: term.length > 0,
      tables,
    };
  },
}));

const openCommandPaletteMock = vi.fn<() => void>();

vi.mock("./CommandPalette", () => ({
  useCommandPalette: () => ({ open: openCommandPaletteMock }),
}));

vi.mock("./context", () => ({
  MAX_NAVIGATION_WIDTH: 520,
  MIN_NAVIGATION_WIDTH: 192,
  useStudio: () => useStudioMock(),
}));

vi.mock("../hooks/use-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useUiState: <T,>(key: string, initialValue: T) => {
      const [value, setValue] = React.useState<T>(() => {
        if (!uiStateValues.has(key)) {
          uiStateValues.set(key, initialValue);
        }

        return (uiStateValues.get(key) as T | undefined) ?? initialValue;
      });

      const setSharedValue = (updater: T | ((previous: T) => T)) => {
        setValue((previous) => {
          const nextValue =
            typeof updater === "function"
              ? (updater as (previous: T) => T)(previous)
              : updater;
          uiStateValues.set(key, nextValue);
          return nextValue;
        });
      };

      const resetValue = () => {
        uiStateValues.set(key, initialValue);
        setValue(initialValue);
      };

      return [value, setSharedValue, resetValue] as const;
    },
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function click(element: Element) {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

function blur(element: Element) {
  element.dispatchEvent(
    new FocusEvent("blur", {
      bubbles: true,
      cancelable: true,
    }),
  );
  element.dispatchEvent(
    new FocusEvent("focusout", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

function inputText(element: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(element, value);
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

function keyDown(element: Element, key: string) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function pointerEvent(type: string, options: { clientX: number }) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX,
  });
}

function mockNavigation(overrides: Partial<NavigationMockValue> = {}) {
  useNavigationMock.mockReturnValue({
    createUrl(values: Record<string, string>) {
      return `#${Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("&")}`;
    },
    metadata: {
      activeTable: { name: "organizations", schema: "public" },
      isFetching: false,
    },
    schemaParam: "public",
    setSchemaParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
    setTableParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
    streamParam: null,
    viewParam: "table",
    ...overrides,
  });
}

function mockStudio(overrides: Partial<StudioMockValue> = {}) {
  useStudioMock.mockImplementation(() => ({
    adapter: postgresAdapter,
    hasDatabase: true,
    hasQueryInsights: false,
    isDarkMode,
    navigationWidth: 192,
    setNavigationWidth: setNavigationWidthMock,
    ...overrides,
  }));
}

function renderNavigation() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Navigation />);
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function getServiceLinks(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLAnchorElement>(
      'nav[aria-label="Data services"] a',
    ),
  );
}

function getSearchBlock(
  container: HTMLElement,
  blockKey: "streams" | "tables",
) {
  return container.querySelector<HTMLElement>(
    `[data-testid="navigation-search-block-${blockKey}"]`,
  );
}

describe("Navigation", () => {
  beforeEach(() => {
    isDarkMode = false;
    openCommandPaletteMock.mockReset();
    useHasMigrationHistoryMock.mockReturnValue(false);
    useTemporalWorkflowsMock.mockReturnValue({});
    setNavigationWidthMock.mockReset();
    refetchIntrospectionMock.mockReset();
    refetchStreamsMock.mockReset();
    refetchIntrospectionMock.mockResolvedValue(undefined);
    refetchStreamsMock.mockResolvedValue(undefined);
    useStudioMock.mockImplementation(() => ({
      adapter: postgresAdapter,
      hasDatabase: true,
      hasQueryInsights: false,
      isDarkMode,
      navigationWidth: 192,
      setNavigationWidth: setNavigationWidthMock,
    }));
    useNavigationMock.mockReturnValue({
      createUrl(values: Record<string, string>) {
        return `#${Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}`;
      },
      metadata: {
        activeTable: { name: "organizations", schema: "public" },
        isFetching: false,
      },
      schemaParam: "public",
      setSchemaParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      setTableParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      streamParam: null,
      viewParam: "table",
    });

    useIntrospectionMock.mockReturnValue({
      data: {
        schemas: {
          public: {
            name: "public",
            tables: {
              all_data_types: {
                columns: {},
                name: "all_data_types",
                schema: "public",
              },
              feature_flags: {
                columns: {},
                name: "feature_flags",
                schema: "public",
              },
              incidents: { columns: {}, name: "incidents", schema: "public" },
              organizations: {
                columns: {},
                name: "organizations",
                schema: "public",
              },
              team_members: {
                columns: {},
                name: "team_members",
                schema: "public",
              },
            },
          },
        },
      },
      errorState: null,
      hasResolvedIntrospection: true,
      isFetching: false,
      isRefetching: false,
      refetch: refetchIntrospectionMock,
    });
    useStreamsMock.mockReturnValue({
      hasStreamsServer: true,
      isError: false,
      isLoading: false,
      refetch: refetchStreamsMock,
      streams: [
        {
          createdAt: "2026-03-09T10:00:00.000Z",
          epoch: 0,
          expiresAt: null,
          name: "audit-log",
          nextOffset: "0",
          sealedThrough: "0",
          uploadedThrough: "0",
        },
        {
          createdAt: "2026-03-09T10:00:00.000Z",
          epoch: 0,
          expiresAt: null,
          name: "prisma-wal",
          nextOffset: "0",
          sealedThrough: "0",
          uploadedThrough: "0",
        },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    uiStateValues.clear();
    document.body.innerHTML = "";
    window.location.hash = "";
  });

  it("hints at the command palette at the bottom of the sidebar", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const sidebar = container.querySelector(
      '[data-testid="studio-navigation"]',
    );
    const hint = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open command menu"]',
    );

    // Last thing in the sidebar, pinned while the lists scroll.
    expect(hint).not.toBeNull();
    expect(sidebar?.lastElementChild?.contains(hint)).toBe(true);
    expect(sidebar?.lastElementChild?.className).toContain("sticky");
    expect(hint?.textContent).toContain("Commands");
    expect(hint?.querySelector("kbd")?.textContent).toMatch(/(⌘|Ctrl) ?K/);

    act(() => {
      hint!.click();
    });
    expect(openCommandPaletteMock).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("scrolls only the object list, so the scope picker and views stay on screen", () => {
    const { container, unmount } = renderNavigation();

    const tableList = container.querySelector('nav[aria-label="Tables"]');
    expect(tableList?.className).toContain("overflow-y-auto");

    const schemaPicker = container.querySelector('[role="combobox"]');
    const views = container.querySelector('nav[aria-label="Postgres views"]');
    expect(schemaPicker).not.toBeNull();
    expect(views).not.toBeNull();
    expect(tableList?.contains(schemaPicker)).toBe(false);
    expect(tableList?.contains(views)).toBe(false);
    expect(views?.className).not.toContain("overflow-y-auto");

    // Headings sit outside the scrolling list, so none of them needs to stick.
    expect(container.querySelectorAll(".sticky.top-0")).toHaveLength(0);

    unmount();
  });

  it("scrolls the list, not the sidebar, to show the open table", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const top =
          this.getAttribute("data-item-key") === "public.organizations"
            ? 300
            : 100;
        const height = this.getAttribute("aria-label") === "Tables" ? 100 : 30;

        return new DOMRect(0, top, 160, height);
      },
    );

    const { container, unmount } = renderNavigation();
    const tableList = container.querySelector('nav[aria-label="Tables"]');
    const sidebar = container.querySelector(
      '[data-testid="studio-navigation"]',
    );

    expect(tableList?.scrollTop).toBe(130);
    expect(sidebar?.scrollTop).toBe(0);

    unmount();
    vi.restoreAllMocks();
  });

  it("uses the white Prisma wordmark when Studio is dark", () => {
    const lightContainer = document.createElement("div");
    document.body.appendChild(lightContainer);
    const lightRoot = createRoot(lightContainer);

    act(() => {
      lightRoot.render(<Navigation />);
    });

    const lightLogo = lightContainer.querySelector<HTMLImageElement>(
      'img[data-testid="studio-logo"]',
    );

    expect(lightLogo).not.toBeNull();

    act(() => {
      lightRoot.unmount();
    });
    lightContainer.remove();

    isDarkMode = true;
    const darkContainer = document.createElement("div");
    document.body.appendChild(darkContainer);
    const darkRoot = createRoot(darkContainer);

    act(() => {
      darkRoot.render(<Navigation />);
    });

    const logo = darkContainer.querySelector<HTMLImageElement>(
      'img[data-testid="studio-logo"]',
    );

    expect(logo).not.toBeNull();
    // prisma.io/brand: the all-white lockup is the dark-background variant.
    expect(logo?.getAttribute("src")).not.toBe(lightLogo?.getAttribute("src"));
    expect(decodeURIComponent(logo?.getAttribute("src") ?? "")).not.toMatch(
      /#04D5E7/i,
    );

    act(() => {
      darkRoot.unmount();
    });
    darkContainer.remove();
  });

  it("follows the Eclipse type roles: label-style group headings, one body size per list", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const headings = [...container.querySelectorAll("h2")];
    expect(headings.map((heading) => heading.textContent)).toContain("Tables");
    for (const heading of headings) {
      for (const utility of [
        "font-mono",
        "text-2xs",
        "uppercase",
        "tracking-loose",
        "text-muted-foreground",
      ]) {
        expect(heading.className).toContain(utility);
      }
    }

    const links = [...container.querySelectorAll<HTMLAnchorElement>("a")];
    const tableLink = links.find(
      (link) => link.textContent?.trim() === "all_data_types",
    );
    const viewLink = links.find(
      (link) => link.textContent?.trim() === "Console",
    );
    expect(tableLink?.className).toContain("text-sm");
    expect(viewLink?.className).toContain("text-sm");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders table navigation hitboxes on the actual links", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const tableLink = [
      ...container.querySelectorAll<HTMLAnchorElement>("a"),
    ].find((link) => link.textContent?.trim() === "all_data_types");

    expect(tableLink).not.toBeUndefined();
    expect(tableLink?.getAttribute("data-sidebar")).toBe("menu-button");
    expect(tableLink?.parentElement?.tagName).toBe("NAV");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("hides schema and table navigation when the session has no database", () => {
    useStudioMock.mockImplementation(() => ({
      adapter: postgresAdapter,
      hasDatabase: false,
      hasQueryInsights: false,
      isDarkMode,
      navigationWidth: 192,
      setNavigationWidth: setNavigationWidthMock,
    }));
    useNavigationMock.mockReturnValue({
      createUrl(values: Record<string, string>) {
        return `#${Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}`;
      },
      metadata: {
        activeTable: { name: "organizations", schema: "public" },
        isFetching: false,
      },
      schemaParam: "public",
      setSchemaParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      setTableParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      streamParam: null,
      viewParam: "stream",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    expect(container.textContent).not.toContain("Tables");
    expect(container.textContent).not.toContain("Visualizer");
    expect(container.textContent).not.toContain("Queries");
    expect(container.textContent).not.toContain("Console");
    expect(container.textContent).not.toContain("SQL");
    expect(container.querySelector('button[aria-label="Schema"]')).toBeNull();
    expect(
      container.querySelector('button[aria-label="Search tables"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Streams");
    expect(container.textContent).toContain("audit-log");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows Queries directly under Visualizer only when query insights are configured", () => {
    const withoutQueriesContainer = document.createElement("div");
    document.body.appendChild(withoutQueriesContainer);
    const withoutQueriesRoot = createRoot(withoutQueriesContainer);

    act(() => {
      withoutQueriesRoot.render(<Navigation />);
    });

    expect(withoutQueriesContainer.textContent).toContain("Visualizer");
    expect(withoutQueriesContainer.textContent).not.toContain("Queries");

    act(() => {
      withoutQueriesRoot.unmount();
    });
    withoutQueriesContainer.remove();

    useStudioMock.mockImplementation(() => ({
      adapter: postgresAdapter,
      hasDatabase: true,
      hasQueryInsights: true,
      isDarkMode,
      navigationWidth: 192,
      setNavigationWidth: setNavigationWidthMock,
    }));
    useNavigationMock.mockReturnValue({
      createUrl(values: Record<string, string>) {
        return `#${Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}`;
      },
      metadata: {
        activeTable: { name: "organizations", schema: "public" },
        isFetching: false,
      },
      schemaParam: "public",
      setSchemaParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      setTableParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      streamParam: null,
      viewParam: "queries",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const studioLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        'nav[aria-label="Postgres views"] a',
      ),
    ).map((link) => link.textContent?.trim());

    expect(studioLinks.slice(0, 2)).toEqual(["Visualizer", "Queries"]);

    const queriesLink = Array.from(container.querySelectorAll("a")).find(
      (link) => link.textContent?.trim() === "Queries",
    );

    expect(queriesLink?.getAttribute("href")).toBe(
      "#schemaParam=public&viewParam=queries",
    );
    expect(queriesLink?.getAttribute("data-active")).toBe("true");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows Migrations only when the ledger holds applied migrations", () => {
    // useHasMigrationHistory resolves false for a missing prisma_contract
    // schema, a missing ledger table, or an empty ledger — all three hide
    // the item (mock default from beforeEach).
    const withoutHistoryContainer = document.createElement("div");
    document.body.appendChild(withoutHistoryContainer);
    const withoutHistoryRoot = createRoot(withoutHistoryContainer);

    act(() => {
      withoutHistoryRoot.render(<Navigation />);
    });

    expect(withoutHistoryContainer.textContent).not.toContain("Migrations");

    act(() => {
      withoutHistoryRoot.unmount();
    });
    withoutHistoryContainer.remove();

    useHasMigrationHistoryMock.mockReturnValue(true);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const migrationsLink = container.querySelector(
      '[data-testid="navigation-migrations-item"]',
    );

    expect(migrationsLink).not.toBeNull();
    expect(migrationsLink?.getAttribute("href")).toBe(
      "#schemaParam=public&viewParam=migrations",
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("preserves selected schema when navigating between Studio views", () => {
    useStudioMock.mockImplementation(() => ({
      adapter: postgresAdapter,
      hasDatabase: true,
      hasQueryInsights: true,
      isDarkMode,
      navigationWidth: 192,
      setNavigationWidth: setNavigationWidthMock,
    }));
    useNavigationMock.mockReturnValue({
      createUrl(values: Record<string, string>) {
        return `#${Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}`;
      },
      metadata: {
        activeTable: { name: "order_items", schema: "test_app" },
        isFetching: false,
      },
      schemaParam: "test_app",
      setSchemaParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      setTableParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      streamParam: null,
      viewParam: "sql",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const studioLinksByText = new Map(
      Array.from(
        container.querySelectorAll<HTMLAnchorElement>(
          'nav[aria-label="Postgres views"] a',
        ),
      ).map((link) => [link.textContent?.trim(), link.getAttribute("href")]),
    );

    expect(studioLinksByText.get("Visualizer")).toBe(
      "#schemaParam=test_app&viewParam=schema",
    );
    expect(studioLinksByText.get("Queries")).toBe(
      "#schemaParam=test_app&viewParam=queries",
    );
    expect(studioLinksByText.get("Console")).toBe(
      "#schemaParam=test_app&viewParam=console",
    );
    expect(studioLinksByText.get("SQL")).toBe(
      "#schemaParam=test_app&viewParam=sql",
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("closes table search on blur when the search input is empty", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const searchIcon = container.querySelector(
      'button[aria-label="Search tables"]',
    );
    const tablesBlock = getSearchBlock(container, "tables");
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search tables"]',
    );

    expect(searchIcon).not.toBeNull();
    expect(tablesBlock?.getAttribute("data-search-open")).toBe("false");
    expect(searchInput).not.toBeNull();
    if (!searchIcon || !searchInput || !tablesBlock) {
      throw new Error("Expected search controls to be rendered");
    }

    act(() => {
      click(searchIcon);
    });

    expect(tablesBlock.getAttribute("data-search-open")).toBe("true");

    act(() => {
      blur(searchInput);
    });

    expect(tablesBlock.getAttribute("data-search-open")).toBe("false");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows an actionable introspection recovery state instead of an empty-table message on startup failure", () => {
    const retryIntrospection = vi.fn(() => Promise.resolve());
    useNavigationMock.mockReturnValue({
      createUrl(values: Record<string, string>) {
        return `#${Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}`;
      },
      metadata: {
        activeTable: { name: "organizations", schema: "public" },
        isFetching: false,
      },
      schemaParam: "missing",
      setSchemaParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      setTableParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      streamParam: null,
      viewParam: "table",
    });
    useIntrospectionMock.mockReturnValue({
      data: {
        schemas: {
          public: {
            name: "public",
            tables: {},
          },
        },
      },
      errorState: {
        adapterSource: "postgresql",
        message: "forced introspection failure",
        operation: "introspect",
        query: {
          parameters: [],
          sql: 'select "ns"."nspname" as "schema"',
        },
        queryPreview: 'select "ns"."nspname" as "schema"',
      },
      hasResolvedIntrospection: false,
      isFetching: false,
      isRefetching: false,
      refetch: retryIntrospection,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    expect(container.textContent).toContain("Schema metadata unavailable");
    expect(container.textContent).not.toContain("No tables found");

    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Retry",
    );

    expect(retryButton).not.toBeUndefined();

    act(() => {
      retryButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(retryIntrospection).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps table search open on blur when the search input has a value", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const searchIcon = container.querySelector(
      'button[aria-label="Search tables"]',
    );
    const tablesBlock = getSearchBlock(container, "tables");
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search tables"]',
    );

    expect(searchIcon).not.toBeNull();
    expect(tablesBlock).not.toBeNull();
    expect(searchInput).not.toBeNull();
    if (!searchIcon || !searchInput || !tablesBlock) {
      throw new Error("Expected search controls to be rendered");
    }

    act(() => {
      click(searchIcon);
    });

    expect(tablesBlock.getAttribute("data-search-open")).toBe("true");

    act(() => {
      inputText(searchInput, "inc");
    });

    expect(tablesBlock.getAttribute("data-search-open")).toBe("true");

    act(() => {
      blur(searchInput);
    });

    expect(tablesBlock.getAttribute("data-search-open")).toBe("true");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows no service switcher when one service is connected", () => {
    useStreamsMock.mockReturnValue({
      hasStreamsServer: false,
      isError: false,
      isLoading: false,
      streams: [],
    });

    const { container, unmount } = renderNavigation();

    expect(
      container.querySelector('nav[aria-label="Data services"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Tables");

    unmount();
  });

  it("lists every connected service in the switcher and marks the open one", () => {
    mockStudio({ temporalUrl: "/api/temporal" });

    const { container, unmount } = renderNavigation();
    const serviceLinks = getServiceLinks(container);

    expect(serviceLinks.map((link) => link.textContent)).toEqual([
      "Postgres",
      "Streams",
      "Temporal",
    ]);
    expect(
      serviceLinks.map((link) => link.getAttribute("aria-current")),
    ).toEqual(["page", null, null]);

    unmount();
  });

  it("names the database service after the connected engine", () => {
    mockStudio({ adapter: { capabilities: { sqlDialect: "mysql" } } });

    const { container, unmount } = renderNavigation();

    expect(getServiceLinks(container)[0]?.textContent).toBe("MySQL");

    unmount();
  });

  it("shows only the open service's scope, views, and objects", () => {
    mockStudio({ temporalUrl: "/api/temporal" });

    const database = renderNavigation();

    expect(
      database.container.querySelector('nav[aria-label="Tables"]'),
    ).not.toBeNull();
    expect(database.container.textContent).toContain("Visualizer");
    expect(database.container.textContent).not.toContain("audit-log");
    expect(database.container.textContent).not.toContain("Schedules");
    database.unmount();

    mockNavigation({ streamParam: "prisma-wal", viewParam: "stream" });
    const streams = renderNavigation();

    expect(
      streams.container.querySelector('nav[aria-label="Streams"]')?.textContent,
    ).toContain("audit-log");
    expect(
      streams.container.querySelector('nav[aria-label="Tables"]'),
    ).toBeNull();
    expect(streams.container.textContent).not.toContain("Visualizer");
    expect(
      streams.container.querySelector('button[aria-label="Schema"]'),
    ).toBeNull();
    expect(
      getServiceLinks(streams.container).map((link) =>
        link.getAttribute("aria-current"),
      ),
    ).toEqual([null, "page", null]);
    streams.unmount();

    mockNavigation({ viewParam: "temporal" });
    const temporal = renderNavigation();

    expect(temporal.container.textContent).toContain("Schedules");
    expect(temporal.container.textContent).toContain("Recent Runs");
    expect(
      temporal.container.querySelector('nav[aria-label="Tables"]'),
    ).toBeNull();
    expect(temporal.container.textContent).not.toContain("audit-log");
    temporal.unmount();
  });

  it("links each service to its last location, or to its start page", () => {
    mockStudio({ temporalUrl: "/api/temporal" });
    uiStateValues.set(SERVICE_LOCATIONS_UI_STATE_KEY, {
      temporal: "#temporalWf=ord-8490&view=temporal",
    });

    const { container, unmount } = renderNavigation();

    expect(
      getServiceLinks(container).map((link) => link.getAttribute("href")),
    ).toEqual([
      "#schemaParam=public&viewParam=table",
      "#streamParam=audit-log&viewParam=stream",
      "#temporalWf=ord-8490&view=temporal",
    ]);

    unmount();
  });

  it("marks failed workflows on the Temporal service while another service is open", () => {
    mockStudio({ temporalUrl: "/api/temporal" });
    useTemporalWorkflowsMock.mockReturnValue({
      data: { countsByStatus: { Failed: 2 }, executions: [] },
    });

    const database = renderNavigation();
    const temporalLink = getServiceLinks(database.container)[2];

    expect(temporalLink?.textContent).toBe("Temporal2 failed executions");
    expect(temporalLink?.getAttribute("title")).toBe(
      "Temporal: 2 failed executions",
    );
    database.unmount();

    mockNavigation({ viewParam: "temporal" });
    const temporal = renderNavigation();

    expect(getServiceLinks(temporal.container)[2]?.textContent).toBe(
      "Temporal",
    );
    temporal.unmount();
  });

  it("links Temporal views, saved views, and recent runs with full URLs", () => {
    mockStudio({ temporalUrl: "/api/temporal" });
    mockNavigation({ viewParam: "temporal" });
    useTemporalWorkflowsMock.mockReturnValue({
      data: {
        countsByStatus: { Failed: 1 },
        executions: [
          {
            runId: "run-1",
            startTime: "2026-11-22T10:00:00.000Z",
            status: "Failed",
            workflowId: "ord-8488",
            workflowType: "ChargeOrder",
          },
        ],
      },
    });

    const { container, unmount } = renderNavigation();
    const hrefByText = (text: string) =>
      Array.from(container.querySelectorAll("a"))
        .find((link) => link.textContent?.includes(text))
        ?.getAttribute("href");

    expect(hrefByText("Schedules")).toBe(
      "#temporalNsParam=default&viewParam=temporal&temporalSectionParam=schedules",
    );
    expect(hrefByText("Failed")).toBe(
      '#temporalNsParam=default&viewParam=temporal&searchParam=ExecutionStatus = "Failed"&temporalSectionParam=workflows',
    );
    expect(hrefByText("ord-8488")).toBe(
      "#temporalNsParam=default&viewParam=temporal&temporalRunParam=run-1&temporalSectionParam=workflows&temporalWfParam=ord-8488",
    );
    expect(
      container
        .querySelector('[data-testid="navigation-temporal-workflows"]')
        ?.getAttribute("data-active"),
    ).toBe("true");
    const temporalNavLabels = Array.from(
      container.querySelectorAll('[data-testid="navigation-temporal-block"] a'),
    ).map((link) => link.textContent ?? "");
    expect(temporalNavLabels[0]).toBe("Workflow Types");
    expect(temporalNavLabels[1]).toBe("Workflow IDs");
    expect(temporalNavLabels[2]).toContain("Executions");
    expect(hrefByText("Workflow IDs")).toBe(
      "#temporalNsParam=default&viewParam=temporal&temporalSectionParam=workflow",
    );

    unmount();
  });

  it("lists recent runs newest first, whatever order the server returns", () => {
    mockStudio({ temporalUrl: "/api/temporal" });
    mockNavigation({ viewParam: "temporal" });
    useTemporalWorkflowsMock.mockReturnValue({
      data: {
        countsByStatus: {},
        executions: ["10:01", "10:03", "10:02"].map((time) => ({
          runId: `run-${time}`,
          startTime: `2026-11-22T${time}:00.000Z`,
          status: "Running",
          workflowId: `order-${time}`,
          workflowType: "orderFulfillment",
        })),
      },
    });

    const { container, unmount } = renderNavigation();
    const recentRuns = Array.from(
      container.querySelectorAll('nav[aria-label="Recent runs"] a'),
    ).map((link) => link.textContent);

    expect(recentRuns).toEqual([
      "order-10:03Running",
      "order-10:02Running",
      "order-10:01Running",
    ]);

    unmount();
  });

  it("marks the open saved view or recent run instead of Workflows", () => {
    mockStudio({ temporalUrl: "/api/temporal" });
    useTemporalWorkflowsMock.mockReturnValue({
      data: {
        countsByStatus: {},
        executions: [
          {
            runId: "run-1",
            startTime: "2026-11-22T10:00:00.000Z",
            status: "Completed",
            workflowId: "ord-8490",
            workflowType: "ChargeOrder",
          },
        ],
      },
    });
    const activeLabels = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('[data-active="true"]')).map(
        (link) => link.textContent,
      );

    mockNavigation({
      searchParam: 'ExecutionStatus = "Running"',
      viewParam: "temporal",
    });
    const savedView = renderNavigation();

    expect(activeLabels(savedView.container)).toEqual(["Running"]);
    savedView.unmount();

    mockNavigation({ temporalWfParam: "ord-8490", viewParam: "temporal" });
    const recentRun = renderNavigation();

    expect(activeLabels(recentRun.container)).toEqual(["ord-8490Completed"]);
    recentRun.unmount();
  });

  it("marks Workflow IDs for the list and for the page of one Workflow ID", () => {
    mockStudio({ temporalUrl: "/api/temporal" });
    useTemporalWorkflowsMock.mockReturnValue({
      data: {
        countsByStatus: {},
        executions: [
          {
            runId: "run-1",
            startTime: "2026-11-22T10:00:00.000Z",
            status: "Completed",
            workflowId: "ord-8490",
            workflowType: "ChargeOrder",
          },
        ],
      },
    });
    const activeLabels = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('[data-active="true"]')).map(
        (link) => link.textContent,
      );

    mockNavigation({ temporalSectionParam: "workflow", viewParam: "temporal" });
    const list = renderNavigation();

    expect(activeLabels(list.container)).toEqual(["Workflow IDs"]);
    list.unmount();

    mockNavigation({
      temporalSectionParam: "workflow",
      temporalWfParam: "ord-8490",
      viewParam: "temporal",
    });
    const workflowId = renderNavigation();

    expect(activeLabels(workflowId.container)).toEqual(["Workflow IDs"]);
    workflowId.unmount();
  });

  it("lists a Workflow ID once in recent runs and marks only the run that is open", () => {
    mockStudio({ temporalUrl: "/api/temporal" });
    mockNavigation({
      temporalRunParam: "run-10:02",
      temporalWfParam: "report-eu",
      viewParam: "temporal",
    });
    useTemporalWorkflowsMock.mockReturnValue({
      data: {
        countsByStatus: {},
        executions: ["10:01", "10:03", "10:02"].map((time) => ({
          runId: `run-${time}`,
          startTime: `2026-11-22T${time}:00.000Z`,
          status: time === "10:03" ? "Running" : "Completed",
          workflowId: "report-eu",
          workflowType: "nightlyReport",
        })),
      },
    });

    const { container, unmount } = renderNavigation();
    const recentRuns = Array.from(
      container.querySelectorAll('nav[aria-label="Recent runs"] a'),
    );

    expect(recentRuns.map((link) => link.textContent)).toEqual([
      "report-euRunning",
    ]);
    // The open run is an older one, so the row of the newest run is not marked.
    expect(
      container.querySelectorAll(
        'nav[aria-label="Recent runs"] [data-active="true"]',
      ),
    ).toHaveLength(0);
    expect(
      container
        .querySelector('[data-testid="navigation-temporal-workflows"]')
        ?.getAttribute("data-active"),
    ).toBe("true");

    unmount();
  });

  it("hides the Streams section when Studio has no streams server configured", () => {
    useStreamsMock.mockReturnValue({
      hasStreamsServer: false,
      isError: false,
      isLoading: false,
      refetch: refetchStreamsMock,
      streams: [],
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const headings = [...container.querySelectorAll("h2")].map((heading) =>
      heading.textContent?.trim(),
    );

    expect(headings).toContain("Tables");
    expect(headings).not.toContain("Streams");
    expect(container.querySelector('nav[aria-label="Streams"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders stream links that route into the stream view and mark the active stream", () => {
    useNavigationMock.mockReturnValue({
      createUrl(values: Record<string, string>) {
        return `#${Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}`;
      },
      metadata: {
        activeTable: { name: "organizations", schema: "public" },
        isFetching: false,
      },
      schemaParam: "public",
      setSchemaParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      setTableParam: vi.fn(() => Promise.resolve(new URLSearchParams())),
      streamParam: "prisma-wal",
      viewParam: "stream",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const streamLink = Array.from(container.querySelectorAll("a")).find(
      (link) => link.textContent?.trim() === "prisma-wal",
    );

    expect(streamLink).toBeInstanceOf(HTMLAnchorElement);
    expect(streamLink?.getAttribute("href")).toBe(
      "#streamParam=prisma-wal&viewParam=stream",
    );
    expect(streamLink?.getAttribute("data-active")).toBe("true");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("supports the same inline search flow for streams as for tables", () => {
    mockNavigation({ viewParam: "stream" });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const searchIcon = container.querySelector(
      'button[aria-label="Search streams"]',
    );
    const streamsBlock = getSearchBlock(container, "streams");
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search streams"]',
    );

    expect(searchIcon).not.toBeNull();
    expect(streamsBlock?.getAttribute("data-search-open")).toBe("false");
    expect(searchInput).not.toBeNull();
    if (!searchIcon || !searchInput || !streamsBlock) {
      throw new Error("Expected stream search controls to be rendered");
    }

    act(() => {
      click(searchIcon);
      inputText(searchInput, "prisma");
    });

    expect(streamsBlock.getAttribute("data-search-open")).toBe("true");
    const visibleStreamLinks = Array.from(
      streamsBlock.querySelectorAll("a"),
      (link) => link.textContent?.trim() ?? "",
    );
    expect(visibleStreamLinks).toContain("prisma-wal");
    expect(visibleStreamLinks).not.toContain("audit-log");

    act(() => {
      keyDown(searchInput, "Enter");
    });

    expect(window.location.hash).toBe(
      "#streamParam=prisma-wal&viewParam=stream",
    );
    expect(streamsBlock.getAttribute("data-search-open")).toBe("false");
    expect(document.activeElement).not.toBe(searchInput);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("refreshes table metadata from the header action without opening search", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const refreshButton = container.querySelector(
      'button[aria-label="Refresh tables"]',
    );

    expect(refreshButton).not.toBeNull();
    if (!refreshButton) {
      throw new Error("Expected table refresh button to be rendered");
    }

    act(() => {
      click(refreshButton);
    });

    expect(refetchIntrospectionMock).toHaveBeenCalledTimes(1);
    expect(
      getSearchBlock(container, "tables")?.getAttribute("data-search-open"),
    ).toBe("false");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("refreshes streams from the header action without opening search", () => {
    mockNavigation({ viewParam: "stream" });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const refreshButton = container.querySelector(
      'button[aria-label="Refresh streams"]',
    );

    expect(refreshButton).not.toBeNull();
    if (!refreshButton) {
      throw new Error("Expected stream refresh button to be rendered");
    }

    act(() => {
      click(refreshButton);
    });

    expect(refetchStreamsMock).toHaveBeenCalledTimes(1);
    expect(
      getSearchBlock(container, "streams")?.getAttribute("data-search-open"),
    ).toBe("false");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("uses transform-only animation classes for the table search wrapper", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const wrapper = container.querySelector(
      '[data-testid="navigation-search-input-wrapper-tables"]',
    );

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("transition-[opacity,transform]");
    expect(wrapper?.className).not.toContain(
      "transition-[opacity,width,transform]",
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("closes and blurs table search on Escape", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const searchIcon = container.querySelector(
      'button[aria-label="Search tables"]',
    );
    const tablesBlock = getSearchBlock(container, "tables");
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search tables"]',
    );

    expect(searchIcon).not.toBeNull();
    expect(tablesBlock).not.toBeNull();
    expect(searchInput).not.toBeNull();
    if (!searchIcon || !searchInput || !tablesBlock) {
      throw new Error("Expected search controls to be rendered");
    }

    act(() => {
      click(searchIcon);
    });
    expect(tablesBlock.getAttribute("data-search-open")).toBe("true");

    act(() => {
      searchInput.focus();
      keyDown(searchInput, "Escape");
    });

    expect(tablesBlock.getAttribute("data-search-open")).toBe("false");
    expect(document.activeElement).not.toBe(searchInput);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("supports arrow-key selection and Enter navigation in table search", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const searchIcon = container.querySelector(
      'button[aria-label="Search tables"]',
    );
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search tables"]',
    );

    expect(searchIcon).not.toBeNull();
    expect(searchInput).not.toBeNull();
    if (!searchIcon || !searchInput) {
      throw new Error("Expected search controls to be rendered");
    }

    act(() => {
      click(searchIcon);
      inputText(searchInput, "a");
    });

    act(() => {
      keyDown(searchInput, "ArrowDown");
    });

    let highlightedTable = container.querySelector(
      '[data-search-highlighted="true"]',
    );
    expect(highlightedTable?.textContent).toContain("team_members");

    act(() => {
      keyDown(searchInput, "ArrowUp");
    });

    highlightedTable = container.querySelector(
      '[data-search-highlighted="true"]',
    );
    expect(highlightedTable?.textContent).toContain("organizations");

    act(() => {
      keyDown(searchInput, "ArrowDown");
    });

    act(() => {
      keyDown(searchInput, "Enter");
    });

    expect(window.location.hash).toBe(
      "#schemaParam=public&tableParam=team_members&viewParam=table",
    );
    expect(
      getSearchBlock(container, "tables")?.getAttribute("data-search-open"),
    ).toBe("false");
    expect(document.activeElement).not.toBe(searchInput);
    expect(uiStateValues.get(TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY)).toEqual({
      requestId: 1,
      tableId: "public.team_members",
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("closes table search and requests grid focus on mouse selection", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const searchIcon = container.querySelector(
      'button[aria-label="Search tables"]',
    );
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search tables"]',
    );

    expect(searchIcon).not.toBeNull();
    expect(searchInput).not.toBeNull();
    if (!searchIcon || !searchInput) {
      throw new Error("Expected search controls to be rendered");
    }

    act(() => {
      click(searchIcon);
      inputText(searchInput, "team");
    });

    const teamMembersLink = Array.from(container.querySelectorAll("a")).find(
      (link) => link.textContent?.trim() === "team_members",
    );

    if (!(teamMembersLink instanceof HTMLAnchorElement)) {
      throw new Error("Expected team_members link to be rendered");
    }

    act(() => {
      click(teamMembersLink);
    });

    expect(window.location.hash).toBe(
      "#schemaParam=public&tableParam=team_members&viewParam=table",
    );
    expect(
      getSearchBlock(container, "tables")?.getAttribute("data-search-open"),
    ).toBe("false");
    expect(document.activeElement).not.toBe(searchInput);
    expect(uiStateValues.get(TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY)).toEqual({
      requestId: 1,
      tableId: "public.team_members",
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("lets the user resize the navigation width by dragging the edge", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const navigation = container.querySelector<HTMLElement>(
      '[data-testid="studio-navigation"]',
    );
    const resizeHandle = container.querySelector<HTMLElement>(
      '[data-testid="navigation-resize-handle"]',
    );

    expect(navigation?.style.width).toBe("192px");
    expect(resizeHandle).not.toBeNull();
    expect(resizeHandle?.childElementCount).toBe(0);

    act(() => {
      resizeHandle?.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 192 }),
      );
    });

    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 320 }));
    });

    expect(navigation?.style.width).toBe("320px");

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 320 }));
    });

    expect(setNavigationWidthMock).toHaveBeenCalledWith(320);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
