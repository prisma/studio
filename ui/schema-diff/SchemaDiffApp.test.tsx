import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { SchemaDiffApp } from "./SchemaDiffApp";

const bridge = vi.hoisted(() => ({
  ontoolinput: () => {},
  ontoolresult: (_result: unknown) => {},
  ontoolcancelled: () => {},
  onhostcontextchanged: (_context: unknown) => {},
}));
vi.mock("@modelcontextprotocol/ext-apps/react", () => ({
  useApp: (options: { onAppCreated: (instance: unknown) => void }) => {
    options.onAppCreated(bridge);
    return { app: null, error: null };
  },
}));
vi.mock("./SchemaDiff", () => ({
  SchemaDiff: ({ title, className }: { title: string; className?: string }) => (
    <div className={className}>{title}</div>
  ),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it("clears old schemas on a new request and renders only valid successful tool results", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<SchemaDiffApp />));
    act(() =>
      bridge.ontoolresult({
        structuredContent: {
          schema: {
            status: "available",
            title: "Catalog schema",
            fromLabel: "main",
            toLabel: "branch",
            mode: "diff",
            before: {},
            after: {},
          },
        },
      }),
    );
    expect(container.textContent).toBe("Catalog schema");
    act(() => bridge.onhostcontextchanged({ theme: "dark" }));
    expect(container.querySelector(".dark")).not.toBeNull();
    act(() => bridge.ontoolinput());
    expect(container.textContent).toContain("Loading database schema");
    act(() =>
      bridge.ontoolresult({
        structuredContent: { schema: { title: "invalid" } },
      }),
    );
    expect(container.textContent).toContain("could not be loaded");
    act(() =>
      bridge.ontoolresult({
        isError: true,
        structuredContent: { schema: { status: "available" } },
      }),
    );
    expect(container.textContent).toContain("could not be loaded");
    act(() => bridge.ontoolcancelled());
    expect(container.textContent).toContain("cancelled");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
