import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SchemaVisualizationData } from "../../../hooks/use-schema-visualization";
import { SchemaView } from "./SchemaView";

function cloneMockValue<T>(value: T): T {
  return structuredClone(value);
}

const { uiStateStore, useNavigationMock, useSchemaVisualizationMock } =
  vi.hoisted(() => ({
    uiStateStore: new Map<string, unknown>(),
    useNavigationMock: vi.fn<
      () => {
        metadata: {
          activeSchema: { name: string };
        };
      }
    >(),
    useSchemaVisualizationMock: vi.fn<() => SchemaVisualizationData>(),
  }));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: useNavigationMock,
}));

vi.mock("@/ui/hooks/use-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useUiState: <T,>(key: string, initialValue: T) => {
      const [value, setValue] = React.useState<T>(() => {
        if (!uiStateStore.has(key)) {
          uiStateStore.set(key, cloneMockValue(initialValue));
        }

        return (
          (uiStateStore.get(key) as T | undefined) ??
          cloneMockValue(initialValue)
        );
      });

      const setSharedValue = React.useCallback(
        (updater: T | ((previous: T) => T)) => {
          setValue((previous) => {
            const nextValue =
              typeof updater === "function"
                ? (updater as (previous: T) => T)(previous)
                : updater;

            uiStateStore.set(key, cloneMockValue(nextValue));
            return cloneMockValue(nextValue);
          });
        },
        [key],
      );

      return [value, setSharedValue] as const;
    },
  };
});

vi.mock("../../../hooks/use-schema-visualization", () => ({
  useSchemaVisualization: useSchemaVisualizationMock,
}));

vi.mock("../../StudioHeader", () => ({
  StudioHeader: ({
    children,
    endContent,
  }: {
    children?: ReactNode;
    endContent?: ReactNode;
  }) => (
    <div data-testid="studio-header">
      <div>{children}</div>
      <div data-testid="studio-header-end">{endContent}</div>
    </div>
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
    uiStateStore.clear();
    useNavigationMock.mockReturnValue({
      metadata: {
        activeSchema: { name: "public" },
      },
    });
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

  it("shows reset layout only after positions diverge from the stored auto layout", () => {
    useSchemaVisualizationMock.mockReturnValue({
      tables: [
        { fields: [], name: "users" },
        { fields: [], name: "posts" },
      ],
      relationships: [],
    });

    uiStateStore.set("schema-visualizer:public:posts|users:node-positions", {
      posts: { x: 420, y: 220 },
      users: { x: 333, y: 444 },
    });
    uiStateStore.set(
      "schema-visualizer:public:posts|users:auto-layout-node-positions",
      {
        posts: { x: 420, y: 220 },
        users: { x: 120, y: 80 },
      },
    );
    uiStateStore.set(
      "schema-visualizer:public:posts|users:reset-layout-version",
      0,
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<SchemaView />);
    });

    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Reset layout"),
    );

    expect(resetButton).toBeTruthy();

    act(() => {
      resetButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(
      uiStateStore.get("schema-visualizer:public:posts|users:node-positions"),
    ).toEqual(
      uiStateStore.get(
        "schema-visualizer:public:posts|users:auto-layout-node-positions",
      ),
    );
    expect(
      uiStateStore.get(
        "schema-visualizer:public:posts|users:reset-layout-version",
      ),
    ).toBe(1);
    expect(container.textContent).not.toContain("Reset layout");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
