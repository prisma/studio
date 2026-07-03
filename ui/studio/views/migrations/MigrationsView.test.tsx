import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioMigration } from "../../../hooks/use-migrations";
import { MigrationsView } from "./MigrationsView";

const { useMigrationsMock, useNavigationMock, setMigrationParamMock } =
  vi.hoisted(() => ({
    useMigrationsMock: vi.fn(),
    useNavigationMock: vi.fn(),
    setMigrationParamMock: vi.fn(() => Promise.resolve(new URLSearchParams())),
  }));

vi.mock("../../../hooks/use-migrations", () => ({
  useMigrations: useMigrationsMock,
}));

vi.mock("../../../hooks/use-navigation", () => ({
  useNavigation: useNavigationMock,
}));

vi.mock("../../StudioHeader", () => ({
  StudioHeader: ({ children }: { children?: ReactNode }) => (
    <div data-testid="studio-header">{children}</div>
  ),
}));

vi.mock("reactflow", () => ({
  __esModule: true,
  default: ({ children }: { children?: ReactNode }) => (
    <div data-testid="diff-canvas">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
}));

vi.mock("./diff-layout", async () => {
  const actual =
    await vi.importActual<typeof import("./diff-layout")>("./diff-layout");

  return {
    ...actual,
    layoutMigrationDiffNodes: (nodes: unknown[]) => Promise.resolve(nodes),
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function contract(models: Record<string, Record<string, unknown>>): unknown {
  const domainModels: Record<string, unknown> = {};

  for (const [name, fields] of Object.entries(models)) {
    domainModels[name] = {
      fields: Object.fromEntries(
        Object.entries(fields).map(([fieldName]) => [
          fieldName,
          { nullable: false, type: { kind: "scalar", codecId: "pg/text@1" } },
        ]),
      ),
      relations: {},
      storage: {
        fields: Object.fromEntries(
          Object.entries(fields).map(([fieldName]) => [
            fieldName,
            { column: fieldName },
          ]),
        ),
        namespaceId: "public",
        table: name.toLowerCase(),
      },
    };
  }

  return {
    domain: { namespaces: { public: { models: domainModels } } },
    storage: { namespaces: {} },
  };
}

function migration(overrides: Partial<StudioMigration>): StudioMigration {
  return {
    id: 1,
    space: "app",
    name: "20260702T2236_init_users",
    displayName: "init users",
    hash: "sha256:mig1",
    fromHash: null,
    toHash: "sha256:c1",
    appliedAt: new Date("2026-07-02T22:36:00Z"),
    operations: [
      {
        id: "op.create",
        label: 'Create table "user"',
        operationClass: "additive",
        statements: ['CREATE TABLE "user" ()'],
      },
    ],
    contractBefore: null,
    contractAfter: contract({ User: { id: {}, email: {} } }),
    isDestructive: false,
    ...overrides,
  };
}

function renderView() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<MigrationsView />);
  });

  return {
    container,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("MigrationsView", () => {
  beforeEach(() => {
    useNavigationMock.mockReturnValue({
      migrationParam: null,
      setMigrationParam: setMigrationParamMock,
    });
    useMigrationsMock.mockReturnValue({
      hasPrismaNextMigrations: true,
      isLoading: false,
      isError: false,
      migrations: [
        migration({
          id: 2,
          name: "20260702T2237_add_projects",
          displayName: "add projects",
          fromHash: "sha256:c1",
          toHash: "sha256:c2",
          contractBefore: contract({ User: { id: {}, email: {} } }),
          contractAfter: contract({
            User: { id: {}, email: {} },
            Project: { id: {}, name: {} },
          }),
        }),
        migration({ id: 1 }),
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("lists every migration newest first with the latest selected", () => {
    const { container, cleanup } = renderView();

    const items = Array.from(
      container.querySelectorAll('[data-testid^="migration-list-item-"]'),
    );

    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("data-testid")).toBe("migration-list-item-2");
    expect(
      container.querySelector('[data-testid="migration-title"]')?.textContent,
    ).toBe("add projects");

    cleanup();
  });

  it("selects a migration through the URL state", () => {
    const { container, cleanup } = renderView();

    const olderItem = container.querySelector(
      '[data-testid="migration-list-item-1"]',
    );

    act(() => {
      olderItem?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(setMigrationParamMock).toHaveBeenCalledWith("1");

    cleanup();
  });

  it("renders the diff for the migration selected via URL state", () => {
    useNavigationMock.mockReturnValue({
      migrationParam: "1",
      setMigrationParam: setMigrationParamMock,
    });

    const { container, cleanup } = renderView();

    expect(
      container.querySelector('[data-testid="migration-title"]')?.textContent,
    ).toBe("init users");

    cleanup();
  });

  it("toggles the SQL panel with per-operation statements", () => {
    const { container, cleanup } = renderView();

    expect(
      container.querySelector('[data-testid="migration-sql-panel"]'),
    ).toBeNull();

    const sqlButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("SQL"),
    );

    act(() => {
      sqlButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    const panel = container.querySelector(
      '[data-testid="migration-sql-panel"]',
    );

    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('CREATE TABLE "user" ()');

    cleanup();
  });

  it("toggles the Schema panel with a rendered schema diff", () => {
    const { container, cleanup } = renderView();

    const schemaButton = container.querySelector(
      '[data-testid="migration-panel-schema"]',
    );

    act(() => {
      schemaButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    const panel = container.querySelector(
      '[data-testid="migration-schema-panel"]',
    );

    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("model Project {");

    cleanup();
  });

  it("renders an all-models toggle for the diff canvas", () => {
    const { container, cleanup } = renderView();

    expect(
      container.querySelector('[data-testid="migration-show-all-models"]'),
    ).not.toBeNull();

    cleanup();
  });

  it("resizes the details panel from its drag handle via keyboard", () => {
    const { container, cleanup } = renderView();

    const sqlButton = container.querySelector(
      '[data-testid="migration-panel-sql"]',
    );

    act(() => {
      sqlButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    const panel = container.querySelector<HTMLElement>(
      '[data-testid="migration-details-panel"]',
    );
    const handle = container.querySelector(
      '[data-testid="migration-panel-resize-handle"]',
    );

    expect(panel).not.toBeNull();
    expect(handle).not.toBeNull();
    expect(panel?.style.height).toBe("256px");

    act(() => {
      handle?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "ArrowUp",
        }),
      );
    });

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="migration-details-panel"]',
      )?.style.height,
    ).toBe("272px");

    act(() => {
      handle?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "ArrowDown",
        }),
      );
    });

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="migration-details-panel"]',
      )?.style.height,
    ).toBe("256px");

    cleanup();
  });

  it("shows an empty state when no ledger is detected", () => {
    useMigrationsMock.mockReturnValue({
      hasPrismaNextMigrations: false,
      isLoading: false,
      isError: false,
      migrations: [],
    });

    const { container, cleanup } = renderView();

    expect(container.textContent).toContain(
      "No Prisma Next migration ledger detected",
    );

    cleanup();
  });
});
