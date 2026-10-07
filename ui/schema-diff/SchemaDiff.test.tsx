import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import type { MigrationDiffNode } from "./diff-layout";
import { SchemaDiff } from "./SchemaDiff";

vi.mock("reactflow", () => ({
  default: ({
    children,
    nodes,
  }: {
    children: React.ReactNode;
    nodes: MigrationDiffNode[];
  }) => (
    <div>
      {nodes.map((node) => (
        <span
          key={node.id}
          data-testid="schema-model-status"
          data-status={
            "model" in node.data
              ? node.data.model.status
              : node.data.enumDiff.status
          }
        />
      ))}
      {children}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
}));

vi.mock("./diff-layout", async () => ({
  ...(await vi.importActual<typeof import("./diff-layout")>("./diff-layout")),
  layoutMigrationDiffNodes: (nodes: unknown[]) => Promise.resolve(nodes),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it("renders a branch comparison without Studio providers or SQL controls", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  let root = createRoot(container);
  const after = {
    domain: {
      namespaces: {
        public: {
          models: {
            User: {
              fields: {
                email: {
                  nullable: false,
                  type: { kind: "scalar", codecId: "pg/text@1" },
                },
              },
              relations: {},
              storage: {
                table: "users",
                namespaceId: "public",
                fields: { email: { column: "email" } },
              },
            },
          },
        },
      },
    },
    storage: { namespaces: {} },
  };
  try {
    await act(async () => {
      root.render(
        <SchemaDiff
          before={null}
          after={after}
          title="Database schema"
          fromLabel="main"
          toLabel="feat/users"
        />,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toContain("feat/users");
    expect(container.textContent).toContain("+1 model");
    expect(container.querySelector('[data-status="added"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="migration-panel-sql"]'),
    ).toBeNull();
    act(() =>
      (
        container.querySelector(
          '[data-testid="migration-panel-schema"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(container.textContent).toContain("model User");
    expect(container.textContent).toContain("email");
    await act(async () => {
      root.render(<SchemaDiff before={null} after={after} mode="schema" />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain("model User");
    expect(container.textContent).not.toContain("No schema changes.");
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<SchemaDiff before={null} after={after} mode="schema" />);
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain("+1 model");
    expect(container.querySelector('[data-status="added"]')).toBeNull();
    expect(container.querySelector('[data-status="unchanged"]')).not.toBeNull();
    const schemaButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="migration-panel-schema"]',
    );
    expect(schemaButton).not.toBeNull();
    act(() => schemaButton?.click());
    expect(container.textContent).toContain("model User");
    act(() =>
      root.render(<SchemaDiff before={after} after={null} mode="schema" />),
    );
    expect(
      container.querySelector(
        '[data-testid="migration-contract-upgrade-notice"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="migration-panel-schema"]'),
    ).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
