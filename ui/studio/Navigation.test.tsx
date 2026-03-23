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
  viewParam: "table" | "schema" | "console";
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

const useNavigationMock = vi.fn<() => NavigationMockValue>();
const useIntrospectionMock = vi.fn<() => IntrospectionMockValue>();
const uiStateValues = new Map<string, unknown>();

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
  useStudio: () => ({
    isDarkMode,
  }),
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
  element.value = value;
  element.dispatchEvent(
    new Event("input", {
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

describe("Navigation", () => {
  beforeEach(() => {
    isDarkMode = false;
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
      refetch: vi.fn(() => Promise.resolve()),
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
    const tablesBlock = container.querySelector("[data-search-open]");
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
    const tablesBlock = container.querySelector("[data-search-open]");
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

  it("uses transform-only animation classes for the table search wrapper", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Navigation />);
    });

    const wrapper = container.querySelector(
      "[data-table-search-input-wrapper]",
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
    const tablesBlock = container.querySelector("[data-search-open]");
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
      container
        .querySelector("[data-search-open]")
        ?.getAttribute("data-search-open"),
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
      container
        .querySelector("[data-search-open]")
        ?.getAttribute("data-search-open"),
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
});
