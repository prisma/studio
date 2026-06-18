import { Circle, GitBranch, Timer, UserCheck, Zap } from "lucide-react";
import { type FC, memo, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  type ReactFlowInstance,
} from "reactflow";

import type {
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowExecutionOverlay,
  WorkflowExecutionOverlayNode,
  WorkflowStudioWorkflow,
  WorkflowTimelineFrame,
} from "@/data/workflows";
import { Badge } from "@/ui/components/ui/badge";
import { cn } from "@/ui/lib/utils";

import { formatWorkflowStatus, getWorkflowStatusTone } from "./workflow-status";
import { WorkflowJsonInspector } from "./WorkflowJsonInspector";

interface WorkflowCanvasProps {
  frame?: WorkflowTimelineFrame;
  runOverlay?: WorkflowExecutionOverlay;
  workflow: WorkflowStudioWorkflow;
}

interface WorkflowCanvasNodeData {
  node: WorkflowCanvasNode;
  overlay?: WorkflowExecutionOverlayNode;
}

const workflowNodeDimensions = {
  height: 112,
  width: 208,
};

const WorkflowGraphNode: FC<NodeProps<WorkflowCanvasNodeData>> = memo(
  ({ data, selected }) => {
    const Icon = getNodeIcon(data.node.kind);
    const tone = getWorkflowStatusTone(
      data.overlay?.status ?? data.node.status,
    );

    return (
      <div
        className={cn(
          "w-52 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm",
          selected && "border-primary ring-2 ring-primary/20",
        )}
      >
        <Handle
          id="target"
          type="target"
          position={Position.Left}
          className="opacity-0"
        />
        <div className="flex min-h-16 items-center gap-2 border-b border-border px-3 py-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-medium"
              data-workflow-node-label
              title={data.node.label}
            >
              {data.node.label}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {data.node.kind}
            </div>
          </div>
        </div>
        <div className="space-y-2 px-3 py-2 text-xs text-muted-foreground">
          <Badge variant={tone} className="max-w-full overflow-hidden truncate">
            {formatWorkflowStatus(data.overlay?.status ?? data.node.status)}
          </Badge>
          <div
            className="grid grid-cols-2 items-center gap-2"
            data-workflow-node-meta
          >
            <div className="truncate">
              {data.overlay?.attempt !== undefined
                ? `Attempt ${data.overlay.attempt}`
                : "No attempt"}
            </div>
            <div className="truncate text-right">
              {formatNodeDuration(data.overlay?.durationMs)}
            </div>
          </div>
        </div>
        <Handle
          id="source"
          type="source"
          position={Position.Right}
          className="opacity-0"
        />
      </div>
    );
  },
);
WorkflowGraphNode.displayName = "WorkflowGraphNode";

const nodeTypes = {
  workflowNode: WorkflowGraphNode,
} satisfies NodeTypes;

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  const { frame, runOverlay, workflow } = props;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<WorkflowCanvasNodeData> | null>(null);
  const activeOverlay = frame?.overlay ?? runOverlay;
  const graphNodes = useMemo(
    () =>
      workflow.canvas.nodes.map((node) => {
        const graphNode: Node<WorkflowCanvasNodeData> = {
          data: {
            node,
            overlay: activeOverlay?.nodes[node.id],
          },
          id: node.id,
          position: { x: node.x, y: node.y },
          sourcePosition: Position.Right,
          style: workflowNodeDimensions,
          targetPosition: Position.Left,
          type: "workflowNode",
        };

        return graphNode;
      }),
    [activeOverlay?.nodes, workflow.canvas.nodes],
  );
  const graphEdges = useMemo(
    () =>
      visibleCanvasEdges(workflow.canvas.edges).map((edge) => {
        const graphEdge: Edge = {
          id: edge.id,
          label: edge.label,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          source: edge.from,
          sourceHandle: "source",
          target: edge.to,
          targetHandle: "target",
          type: "smoothstep",
        };

        return graphEdge;
      }),
    [workflow.canvas.edges],
  );
  const selectedCanvasNode = workflow.canvas.nodes.find(
    (node) => node.id === selectedNodeId,
  );
  const selectedOverlay = selectedCanvasNode
    ? activeOverlay?.nodes[selectedCanvasNode.id]
    : undefined;

  useEffect(() => {
    if (!flowInstance) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      flowInstance.fitView({
        duration: 0,
        includeHiddenNodes: false,
        padding: 0.16,
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [flowInstance, graphEdges, graphNodes, selectedNodeId]);

  return (
    <div
      className={cn(
        "grid h-full min-h-0 border-t border-border",
        selectedCanvasNode
          ? "grid-cols-[minmax(0,1fr)_320px]"
          : "grid-cols-[minmax(0,1fr)]",
      )}
    >
      <div className="min-h-0 bg-muted/20">
        <ReactFlow
          edges={graphEdges}
          fitView
          fitViewOptions={{
            includeHiddenNodes: false,
            padding: 0.16,
          }}
          minZoom={0.25}
          nodes={graphNodes}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onInit={setFlowInstance}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      {selectedCanvasNode ? (
        <aside className="min-h-0 overflow-auto border-l border-border bg-background p-4">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-sm font-semibold">
                {selectedCanvasNode.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedCanvasNode.kind}
              </div>
            </div>
            <Badge
              variant={getWorkflowStatusTone(
                selectedOverlay?.status ?? selectedCanvasNode.status,
              )}
              className="w-fit"
            >
              {formatWorkflowStatus(
                selectedOverlay?.status ?? selectedCanvasNode.status,
              )}
            </Badge>
            {selectedCanvasNode.sourceRef ? (
              <div className="text-xs text-muted-foreground">
                Source:{" "}
                <span className="font-mono text-foreground">
                  {selectedCanvasNode.sourceRef}
                </span>
              </div>
            ) : null}
            {selectedCanvasNode.codeRef ? (
              <div className="text-xs text-muted-foreground">
                Code:{" "}
                <span className="font-mono text-foreground">
                  {selectedCanvasNode.codeRef}
                </span>
              </div>
            ) : null}
            <WorkflowJsonInspector
              label="Node config"
              value={selectedCanvasNode.config ?? {}}
            />
            <WorkflowJsonInspector
              label="Execution overlay"
              value={selectedOverlay ?? {}}
            />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function getNodeIcon(kind: string) {
  switch (kind) {
    case "approval":
      return UserCheck;
    case "condition":
    case "parallel":
      return GitBranch;
    case "timer":
      return Timer;
    case "trigger":
      return Zap;
    default:
      return Circle;
  }
}

function formatNodeDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return "Open";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = Math.round(durationMs / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return remainingSeconds === 0
    ? `${minutes}m`
    : `${minutes}m ${remainingSeconds}s`;
}

function visibleCanvasEdges(
  edges: readonly WorkflowCanvasEdge[],
): WorkflowCanvasEdge[] {
  const byPair = new Map<string, WorkflowCanvasEdge>();

  for (const edge of edges) {
    const pair = `${edge.from}\u0000${edge.to}`;
    const existing = byPair.get(pair);

    if (
      !existing ||
      (existing.label !== undefined && edge.label === undefined)
    ) {
      byPair.set(pair, edge);
    }
  }

  return [...byPair.values()];
}
