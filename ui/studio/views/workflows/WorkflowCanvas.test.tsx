import type { ComponentType, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  WorkflowCanvasNode,
  WorkflowExecutionOverlayNode,
  WorkflowStudioWorkflow,
} from "@/data/workflows";

import { WorkflowCanvas } from "./WorkflowCanvas";

interface WorkflowCanvasNodeData {
  node: WorkflowCanvasNode;
  overlay?: WorkflowExecutionOverlayNode;
}

interface ReactFlowNode {
  data: WorkflowCanvasNodeData;
  id: string;
  position: { x: number; y: number };
  sourcePosition?: string;
  style?: Record<string, number | string>;
  targetPosition?: string;
  type?: string;
}

interface ReactFlowEdge {
  id: string;
  label?: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  type?: string;
}

interface ReactFlowProps {
  children?: ReactNode;
  edges: ReactFlowEdge[];
  fitViewOptions?: {
    includeHiddenNodes?: boolean;
    padding?: number;
  };
  nodes: ReactFlowNode[];
  nodeTypes?: Record<
    string,
    ComponentType<{ data: WorkflowCanvasNodeData; selected: boolean }>
  >;
  onInit?: (instance: {
    fitView: (options?: { padding?: number }) => void;
  }) => void;
}

const mocks = vi.hoisted(() => ({
  fitViewMock: vi.fn(),
  flowInstance: {
    fitView: vi.fn(),
  },
  latestReactFlowProps: null as ReactFlowProps | null,
}));

vi.mock("reactflow", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  function ReactFlow(props: ReactFlowProps) {
    mocks.latestReactFlowProps = props;

    React.useEffect(() => {
      props.onInit?.(mocks.flowInstance);
    }, [props]);

    return (
      <div data-testid="reactflow">
        {props.nodes.map((node) => {
          const NodeComponent = props.nodeTypes?.[node.type ?? ""];

          return (
            <div data-testid={`flow-node-${node.id}`} key={node.id}>
              {NodeComponent
                ? React.createElement(NodeComponent, {
                    data: node.data,
                    selected: false,
                  })
                : null}
            </div>
          );
        })}
        {props.children}
      </div>
    );
  }

  return {
    __esModule: true,
    Background: () => null,
    Controls: () => null,
    Handle: (props: {
      className?: string;
      id?: string;
      position: string;
      type: string;
    }) => (
      <span
        data-handle-id={props.id}
        data-handle-position={props.position}
        data-handle-type={props.type}
      />
    ),
    MarkerType: {
      ArrowClosed: "arrowclosed",
    },
    MiniMap: () => null,
    Position: {
      Left: "left",
      Right: "right",
    },
    default: ReactFlow,
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const workflow: WorkflowStudioWorkflow = {
  approvals: [],
  canvas: {
    edges: [
      {
        from: "approval:humanApproval",
        id: "edge:approval-submit",
        to: "step:submitEvidence",
      },
      {
        from: "approval:humanApproval",
        id: "edge:approval-submit-label",
        label: "approve",
        to: "step:submitEvidence",
      },
    ],
    nodes: [
      {
        id: "step:collectCustomerHistory",
        kind: "step",
        label: "collectCustomerHistory",
        x: 320,
        y: 140,
      },
      {
        id: "approval:humanApproval",
        kind: "approval",
        label: "humanApproval",
        x: 760,
        y: 140,
      },
      {
        id: "step:submitEvidence",
        kind: "step",
        label: "submitEvidence",
        x: 980,
        y: 140,
      },
    ],
  },
  deadLetters: [],
  failureRate: 0,
  id: "wf_dispute",
  ingestEvents: [],
  latestVersion: 1,
  name: "DisputeEvidence",
  overlays: [
    {
      nodes: {
        "step:collectCustomerHistory": {
          attempt: 1,
          durationMs: 60000,
          status: "succeeded",
        },
      },
      runId: "run_1",
      sequence: 1,
    },
  ],
  runs: [],
  runsToday: 1,
  slug: "dispute-evidence",
  timelineFrames: [],
};

function renderCanvas() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WorkflowCanvas runOverlay={workflow.overlays[0]} workflow={workflow} />,
    );
  });

  return { container, root };
}

describe("WorkflowCanvas", () => {
  beforeEach(() => {
    mocks.fitViewMock.mockReset();
    mocks.flowInstance.fitView.mockReset();
    mocks.latestReactFlowProps = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("keeps workflow cards compact and routes duplicated approval edges once", () => {
    const { container, root } = renderCanvas();

    expect(mocks.latestReactFlowProps?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "step:collectCustomerHistory",
          sourcePosition: "right",
          style: { height: 112, width: 208 },
          targetPosition: "left",
        }),
      ]),
    );
    expect(mocks.latestReactFlowProps?.edges).toEqual([
      expect.objectContaining({
        id: "edge:approval-submit",
        label: undefined,
        sourceHandle: "source",
        targetHandle: "target",
      }),
    ]);
    expect(container.textContent).toContain("1m");
    expect(container.textContent).not.toContain("60000ms");
    expect(
      container.querySelector("[data-workflow-node-label]")?.className,
    ).toContain("truncate");
    expect(
      container.querySelector("[data-workflow-node-meta]")?.className,
    ).toContain("grid-cols-2");

    act(() => root.unmount());
    container.remove();
  });
});
