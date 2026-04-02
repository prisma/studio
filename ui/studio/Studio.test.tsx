import { act, type HTMLAttributes, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Adapter } from "../../data/adapter";
import { Studio } from "./Studio";

type NavigationMockValue = {
  metadata: {
    activeTable: undefined;
  };
  viewParam: "table" | "stream";
};

type IntrospectionMockValue = {
  data: {
    schemas: Record<string, { name: string; tables: Record<string, unknown> }>;
  };
  errorState: {
    adapterSource: string;
    message: string;
    operation: "introspect";
    query: { parameters: unknown[]; sql: string };
    queryPreview: string | null;
  };
  hasResolvedIntrospection: boolean;
  isRefetching: boolean;
  refetch: () => Promise<unknown>;
};

type StudioMockValue = {
  hasDatabase: boolean;
  isNavigationOpen: boolean;
  streamsUrl?: string;
};

const { refetchMock, useIntrospectionMock, useNavigationMock, useStudioMock } =
  vi.hoisted(() => ({
    refetchMock: vi.fn(() => Promise.resolve()),
    useIntrospectionMock: vi.fn<() => IntrospectionMockValue>(),
    useNavigationMock: vi.fn<() => NavigationMockValue>(),
    useStudioMock: vi.fn<() => StudioMockValue>(),
  }));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      ...props
    }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("../hooks/use-introspection", () => ({
  useIntrospection: useIntrospectionMock,
}));

vi.mock("../hooks/use-navigation", () => ({
  useNavigation: useNavigationMock,
}));

vi.mock("./CommandPalette", () => ({
  StudioCommandPaletteProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("./context", () => ({
  StudioContextProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useStudio: () => useStudioMock(),
}));

vi.mock("./Navigation", () => ({
  Navigation: () => <div>Navigation</div>,
}));

vi.mock("./views/console/ConsoleView", () => ({
  ConsoleView: () => <div>Console view</div>,
}));

vi.mock("./views/schema/SchemaView", () => ({
  SchemaView: () => <div>Schema view</div>,
}));

vi.mock("./views/sql/SqlView", () => ({
  SqlView: () => <div>SQL view</div>,
}));

vi.mock("./views/stream/StreamView", () => ({
  StreamView: () => <div>Stream view</div>,
}));

vi.mock("./views/table/ActiveTableView", () => ({
  ActiveTableView: () => <div>Active table view</div>,
}));

vi.mock("./views/View", () => ({
  BasicView: () => <div>Basic view</div>,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Studio", () => {
  beforeEach(() => {
    refetchMock.mockClear();
    useStudioMock.mockReturnValue({
      hasDatabase: true,
      isNavigationOpen: true,
      streamsUrl: "/api/streams",
    });
    useNavigationMock.mockReturnValue({
      metadata: {
        activeTable: undefined,
      },
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
      isRefetching: false,
      refetch: refetchMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("renders an introspection recovery panel for table view startup failures", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Studio
          adapter={
            {
              delete: vi.fn(),
              introspect: vi.fn(),
              insert: vi.fn(),
              query: vi.fn(),
              raw: vi.fn(),
              update: vi.fn(),
            } as unknown as Adapter
          }
        />,
      );
    });

    expect(container.textContent).toContain("Could not load schema metadata");
    expect(container.textContent).toContain("Retry");
    expect(container.textContent).not.toContain("Active table view");

    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Retry",
    );

    expect(retryButton).not.toBeUndefined();

    act(() => {
      retryButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(refetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the stream view when navigation is on a selected stream", () => {
    useNavigationMock.mockReturnValue({
      metadata: {
        activeTable: undefined,
      },
      viewParam: "stream",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Studio
          adapter={
            {
              delete: vi.fn(),
              introspect: vi.fn(),
              insert: vi.fn(),
              query: vi.fn(),
              raw: vi.fn(),
              update: vi.fn(),
            } as unknown as Adapter
          }
        />,
      );
    });

    expect(container.textContent).toContain("Stream view");
    expect(container.textContent).not.toContain(
      "Could not load schema metadata",
    );
    expect(
      container.querySelector('[data-testid="studio-root"]')?.className,
    ).toContain("overflow-hidden");
    expect(
      container.querySelector('[data-testid="studio-shell"]')?.className,
    ).toContain("h-full");
    expect(
      container.querySelector('[data-testid="studio-shell"]')?.className,
    ).toContain("overflow-hidden");
    expect(
      container.querySelector('[data-testid="studio-main-pane"]')?.className,
    ).toContain("self-stretch");
    expect(
      container.querySelector('[data-testid="studio-main-pane"]')?.className,
    ).not.toContain("self-start");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders a database-unavailable placeholder for database views when the session has no database", () => {
    useStudioMock.mockReturnValue({
      hasDatabase: false,
      isNavigationOpen: true,
      streamsUrl: "/api/streams",
    });
    useNavigationMock.mockReturnValue({
      metadata: {
        activeTable: undefined,
      },
      viewParam: "table",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Studio
          adapter={
            {
              delete: vi.fn(),
              introspect: vi.fn(),
              insert: vi.fn(),
              query: vi.fn(),
              raw: vi.fn(),
              update: vi.fn(),
            } as unknown as Adapter
          }
          hasDatabase={false}
        />,
      );
    });

    expect(container.textContent).toContain(
      "This Studio session was started without a database URL.",
    );
    expect(container.textContent).not.toContain("Active table view");
    expect(container.textContent).not.toContain(
      "Could not load schema metadata",
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
