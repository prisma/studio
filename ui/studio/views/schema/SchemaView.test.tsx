import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SchemaView } from "./SchemaView";

const { useSchemaVisualizationMock } = vi.hoisted(() => ({
  useSchemaVisualizationMock: vi.fn<
    () => {
      tables: [];
      relationships: [];
    }
  >(),
}));

vi.mock("../../../hooks/use-schema-visualization", () => ({
  useSchemaVisualization: useSchemaVisualizationMock,
}));

vi.mock("../../StudioHeader", () => ({
  StudioHeader: ({ children }: { children?: ReactNode }) => (
    <div data-testid="studio-header">{children}</div>
  ),
}));

vi.mock("./Visualiser", () => ({
  SchemaVisualization: () => <div data-testid="schema-visualization" />,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("SchemaView", () => {
  beforeEach(() => {
    useSchemaVisualizationMock.mockReturnValue({
      tables: [],
      relationships: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("renders compact legend badges with size-based dimensions", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<SchemaView />);
    });

    const legendBadges = Array.from(
      container.querySelectorAll('[data-testid="studio-header"] span.size-5'),
    );

    expect(legendBadges).toHaveLength(3);
    expect(
      legendBadges.every((badge) => badge.className.includes("size-5")),
    ).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
