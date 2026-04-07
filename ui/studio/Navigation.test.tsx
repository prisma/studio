import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Navigation } from "./Navigation";
import { TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY } from "./navigation-ui-state";

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
  streamParam: string | null;
  viewParam: "table" | "schema" | "console" | "sql" | "stream";
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
  hasDatabase: boolean;
  isDarkMode: boolean;
  navigationWidth: number;
  setNavigationWidth: (width: number) => void;
}

const useNavigationMock = vi.fn<() => NavigationMockValue>();
const useIntrospectionMock = vi.fn<() => IntrospectionMockValue>();
const useStreamsMock = vi.fn<() => StreamsMockValue>();
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

vi.mock("../hooks/use-streams", () => ({
  useStreams: () => useStreamsMock(),
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
    setNavigationWidthMock.mockReset();
    refetchIntrospectionMock.mockReset();
    refetchStreamsMock.mockReset();
    refetchIntrospectionMock.mockResolvedValue(undefined);
    refetchStreamsMock.mockResolvedValue(undefined);
    useStudioMock.mockImplementation(() => ({
      hasDatabase: true,
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

  it("uses the dark-mode Prisma logo asset when Studio is dark", () => {
    const lightContainer = document.createElement("div");
    document.body.appendChild(lightContainer);
    const lightRoot = createRoot(lightContainer);

    act(() => {
      lightRoot.render(<Navigation />);
    });

    const lightLogo = lightContainer.querySelector<HTMLImageElement>(
      'img[alt="Prisma Logo"]',
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
      'img[alt="Prisma Logo"]',
    );

    expect(logo).not.toBeNull();
    expect(logo?.getAttribute("src")).not.toBe(lightLogo?.getAttribute("src"));
    expect(decodeURIComponent(logo?.getAttribute("src") ?? "")).toContain(
      "fill='white'",
    );

    act(() => {
      darkRoot.unmount();
    });
    darkContainer.remove();
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
      hasDatabase: false,
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

  it("renders a Streams section beneath the Tables list", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const headings = [...container.querySelectorAll("h2")].map((heading) =>
      heading.textContent?.trim(),
    );

    expect(headings.indexOf("Tables")).toBeGreaterThan(-1);
    expect(headings.indexOf("Streams")).toBeGreaterThan(
      headings.indexOf("Tables"),
    );

    const streamsNav = container.querySelector('nav[aria-label="Streams"]');

    expect(streamsNav).not.toBeNull();
    expect(streamsNav?.textContent).toContain("audit-log");
    expect(streamsNav?.textContent).toContain("prisma-wal");

    act(() => {
      root.unmount();
    });
    container.remove();
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
