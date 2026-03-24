import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SchemaVisualization } from "./Visualiser";

function cloneMockValue<T>(value: T): T {
  return structuredClone(value);
}

type ReactFlowNode = {
  data: {
    label: string;
  };
  id: string;
  position: {
    x: number;
    y: number;
  };
};

type ReactFlowProps = {
  children?: ReactNode;
  edges: Array<{ id: string; source: string; target: string }>;
  nodes: ReactFlowNode[];
  onInit?: (instance: { fitView: () => void }) => void;
  onNodesChange?: (
    changes: Array<{
      id: string;
      position?: {
        x: number;
        y: number;
      };
      type: string;
    }>,
  ) => void;
};

const mocks = vi.hoisted(() => ({
  fitViewMock: vi.fn(),
  layoutMock: vi.fn(),
  latestReactFlowProps: null as ReactFlowProps | null,
  uiStateStore: new Map<string, unknown>(),
  useNavigationMock: vi.fn<
    () => {
      createUrl: () => string;
      metadata: {
        activeSchema: { name: string };
      };
    }
  >(),
}));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: mocks.useNavigationMock,
}));

vi.mock("@/ui/hooks/use-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useUiState: <T,>(
      key: string,
      initialValue: T,
      options?: { cleanupOnUnmount?: boolean },
    ) => {
      const cleanupOnUnmount = options?.cleanupOnUnmount ?? false;

      const [value, setValue] = React.useState<T>(() => {
        if (!mocks.uiStateStore.has(key)) {
          mocks.uiStateStore.set(key, cloneMockValue(initialValue));
        }

        return (
          (mocks.uiStateStore.get(key) as T | undefined) ??
          cloneMockValue(initialValue)
        );
      });

      React.useEffect(() => {
        if (cleanupOnUnmount) {
          return () => {
            mocks.uiStateStore.delete(key);
          };
        }

        return undefined;
      }, [cleanupOnUnmount, key]);

      const setSharedValue = React.useCallback(
        (updater: T | ((previous: T) => T)) => {
          setValue((previous) => {
            const nextValue =
              typeof updater === "function"
                ? (updater as (previous: T) => T)(previous)
                : updater;

            mocks.uiStateStore.set(key, cloneMockValue(nextValue));
            return cloneMockValue(nextValue);
          });
        },
        [key],
      );

      return [value, setSharedValue] as const;
    },
  };
});

vi.mock("elkjs/lib/elk.bundled.js", () => ({
  default: class MockElk {
    layout = mocks.layoutMock;
  },
}));

vi.mock("reactflow", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  function ReactFlow(props: ReactFlowProps) {
    mocks.latestReactFlowProps = props;

    React.useEffect(() => {
      props.onInit?.({ fitView: mocks.fitViewMock });
    }, [props]);

    return (
      <div data-testid="reactflow">
        {props.nodes.map((node) => (
          <div key={node.id}>{node.data.label}</div>
        ))}
        {props.children}
      </div>
    );
  }

  return {
    __esModule: true,
    Background: () => null,
    ConnectionLineType: {
      SmoothStep: "smoothstep",
    },
    Controls: () => null,
    Handle: () => null,
    MiniMap: () => null,
    Position: {
      Bottom: "bottom",
      Left: "left",
      Right: "right",
      Top: "top",
    },
    addEdge: (
      edge: { id: string; source: string; target: string },
      edges: Array<{ id: string; source: string; target: string }>,
    ) => [...edges, edge],
    applyEdgeChanges: (
      _changes: unknown[],
      edges: Array<{ id: string; source: string; target: string }>,
    ) => edges,
    applyNodeChanges: (
      changes: Array<{
        id: string;
        position?: {
          x: number;
          y: number;
        };
        type: string;
      }>,
      nodes: ReactFlowNode[],
    ) =>
      nodes.map((node) => {
        const positionChange = changes.find(
          (change) => change.id === node.id && change.type === "position",
        );

        if (!positionChange?.position) {
          return node;
        }

        return {
          ...node,
          position: positionChange.position,
        };
      }),
    default: ReactFlow,
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("SchemaVisualization", () => {
  beforeEach(() => {
    mocks.fitViewMock.mockReset();
    mocks.layoutMock.mockReset();
    mocks.latestReactFlowProps = null;
    mocks.uiStateStore.clear();
    mocks.useNavigationMock.mockReturnValue({
      createUrl: () => "#",
      metadata: {
        activeSchema: { name: "public" },
      },
    });
    mocks.layoutMock.mockResolvedValue({
      children: [
        { id: "users", x: 120, y: 80 },
        { id: "posts", x: 420, y: 220 },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("applies elk auto-layout positions on first mount", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SchemaVisualization
          tables={[
            {
              name: "users",
              fields: [{ name: "id", type: "text", isPrimary: true }],
            },
            {
              name: "posts",
              fields: [{ name: "id", type: "text", isPrimary: true }],
            },
          ]}
          relationships={[{ from: "users", to: "posts", type: "1:n" }]}
        />,
      );
    });

    await flush();

    expect(mocks.layoutMock).toHaveBeenCalledTimes(1);
    expect(mocks.latestReactFlowProps?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "users",
          position: { x: 0, y: 0 },
        }),
        expect.objectContaining({
          id: "posts",
          position: { x: 300, y: 140 },
        }),
      ]),
    );
    expect(mocks.fitViewMock).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("preserves manually adjusted positions across unmounts for the same table set", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const tables = [
      {
        name: "users",
        fields: [{ name: "id", type: "text", isPrimary: true }],
      },
      {
        name: "posts",
        fields: [{ name: "id", type: "text", isPrimary: true }],
      },
    ];
    const relationships = [{ from: "users", to: "posts", type: "1:n" }];

    act(() => {
      root.render(
        <SchemaVisualization tables={tables} relationships={relationships} />,
      );
    });

    await flush();

    act(() => {
      mocks.latestReactFlowProps?.onNodesChange?.([
        {
          id: "users",
          position: { x: 333, y: 444 },
          type: "position",
        },
      ]);
    });

    act(() => {
      root.unmount();
    });

    const remountRoot = createRoot(container);

    act(() => {
      remountRoot.render(
        <SchemaVisualization tables={tables} relationships={relationships} />,
      );
    });

    await flush();

    expect(mocks.layoutMock).toHaveBeenCalledTimes(1);
    expect(
      mocks.latestReactFlowProps?.nodes.find((node) => node.id === "users"),
    ).toEqual(
      expect.objectContaining({
        position: { x: 333, y: 444 },
      }),
    );

    act(() => {
      remountRoot.unmount();
    });
    container.remove();
  });
});
