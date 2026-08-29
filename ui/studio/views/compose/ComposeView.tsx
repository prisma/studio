import {
  Activity,
  Box,
  Database,
  Globe,
  Layers,
  Mail,
  Package,
  Pause,
  Play,
  Radio,
  X,
  Zap,
} from "lucide-react";
import { type FC, memo, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  Handle,
  type NodeProps,
  type NodeTypes,
  Position,
} from "reactflow";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import { StudioHeader } from "../../StudioHeader";
import type { ViewProps } from "../View";
import {
  buildTraceRows,
  type ComposeGraph,
  type ComposeHealth,
  type ComposeServiceType,
  type ComposeTraceRow,
  createComposeFixture,
  createRng,
  summarizeGraph,
  tickTraffic,
} from "./compose-data";
import {
  buildComposeFlow,
  type ComposeFlowNode,
  type ComposeNodeData,
  layoutComposeNodes,
} from "./compose-layout";

const TICK_MS = 1400;

const HEALTH_STYLES: Record<ComposeHealth, { dot: string; label: string }> = {
  healthy: { dot: "bg-emerald-500", label: "healthy" },
  degraded: { dot: "bg-amber-500", label: "degraded" },
  down: { dot: "bg-rose-500", label: "down" },
};

const SERVICE_ICONS: Record<ComposeServiceType, FC<{ className?: string }>> = {
  postgres: Database,
  redis: Zap,
  "object-storage": Package,
  "external-api": Globe,
  email: Mail,
};

const HealthDot: FC<{ health: ComposeHealth }> = ({ health }) => (
  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
    <span
      className={cn(
        "size-2 rounded-full",
        HEALTH_STYLES[health].dot,
        health !== "healthy" && "animate-pulse",
      )}
    />
    {HEALTH_STYLES[health].label}
  </span>
);

const MetricsRow: FC<{ data: ComposeNodeData }> = ({ data }) => (
  <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
    <span>{(data.outRps || data.inRps).toFixed(1)} rps</span>
    <span>·</span>
    <span>p95 {data.p95Ms}ms</span>
  </div>
);

const ComposeModuleNode: FC<NodeProps<ComposeNodeData>> = memo(
  function ComposeModuleNode({ data }) {
    const { node, health } = data;

    if (node.kind === "ingress") {
      return (
        <div
          className="w-[224px] rounded-full border-2 border-dashed border-border bg-card/80 px-4 py-3 shadow-sm"
          data-testid="compose-node-ingress"
        >
          <Handle
            type="source"
            position={Position.Right}
            style={{ opacity: 0 }}
          />
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-primary" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {node.name}
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {node.detail}
              </div>
            </div>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {data.outRps.toFixed(1)} rps
            </span>
          </div>
        </div>
      );
    }

    const bundled = node.deployment?.mode === "bundled";

    return (
      <div
        className={cn(
          "w-[224px] rounded-xl border-2 bg-card shadow-[0_16px_32px_-16px_rgba(0,0,0,0.35)]",
          health === "healthy" && "border-border",
          health === "degraded" && "border-amber-400/80",
          health === "down" && "border-rose-400/80",
        )}
        data-testid={`compose-node-${node.id}`}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {bundled ? (
              <Layers className="size-3.5 shrink-0 text-primary" />
            ) : (
              <Box className="size-3.5 shrink-0 text-primary" />
            )}
            <span className="truncate text-sm font-bold text-foreground">
              {node.name}
            </span>
          </div>
          <Badge className="shrink-0 text-[9px]" variant="secondary">
            {bundled && node.deployment?.mode === "bundled"
              ? `bundled · ${node.deployment.app}`
              : "unit"}
          </Badge>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2">
          <div className="truncate text-[11px] text-muted-foreground">
            {node.detail}
          </div>
          <div className="flex items-center justify-between">
            <MetricsRow data={data} />
            <HealthDot health={health} />
          </div>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0 }}
        />
      </div>
    );
  },
);

const ComposeServiceNode: FC<NodeProps<ComposeNodeData>> = memo(
  function ComposeServiceNode({ data }) {
    const { node, health } = data;
    const Icon = node.serviceType ? SERVICE_ICONS[node.serviceType] : Globe;

    return (
      <div
        className={cn(
          "w-[224px] -rotate-1 rounded-xl border-2 bg-muted/60 shadow-[0_12px_24px_-14px_rgba(0,0,0,0.4)]",
          health === "healthy" && "border-border",
          health === "degraded" &&
            "border-amber-400/80 bg-amber-50/60 dark:bg-amber-950/30",
          health === "down" &&
            "border-rose-400/80 bg-rose-50/60 dark:bg-rose-950/30",
        )}
        data-testid={`compose-node-${node.id}`}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/70">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {node.name}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {node.detail}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <HealthDot health={health} />
            <span className="font-mono text-[10px] text-muted-foreground">
              {data.inRps.toFixed(1)} rps
            </span>
          </div>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0 }}
        />
      </div>
    );
  },
);

const nodeTypes: NodeTypes = {
  composeModule: ComposeModuleNode,
  composeService: ComposeServiceNode,
};

function TracePanel(props: {
  graph: ComposeGraph;
  selectedId: string;
  tick: number;
  onClose: () => void;
}) {
  const { graph, selectedId, tick, onClose } = props;
  const node = graph.nodes.find((candidate) => candidate.id === selectedId);
  const rows: ComposeTraceRow[] = useMemo(
    () =>
      node
        ? buildTraceRows(node, graph.edges, createRng(tick * 7919 + 17))
        : [],
    [node, graph.edges, tick],
  );

  if (!node) {
    return null;
  }

  return (
    <div
      className="flex h-64 shrink-0 flex-col border-t border-border bg-card/60"
      data-testid="compose-trace-panel"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
        <Activity className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">
          Recent boundary traces — {node.name}
        </span>
        <span className="text-[10px] text-muted-foreground">
          auto-instrumented at the Compose boundary
        </span>
        <Button
          className="ml-auto h-6 w-6 p-0"
          onClick={onClose}
          size="xs"
          variant="ghost"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <table className="w-full text-left font-mono text-[11px]">
          <tbody>
            {rows.map((row, index) => (
              <tr
                className="border-b border-border/40"
                key={`${tick}-${index}`}
              >
                <td className="py-1 pr-3">
                  <span
                    className={cn(
                      "mr-2 inline-block size-1.5 rounded-full",
                      row.ok ? "bg-emerald-500" : "bg-rose-500",
                    )}
                  />
                  {row.span}
                </td>
                <td className="py-1 pr-3 text-muted-foreground">
                  {row.target}
                </td>
                <td className="py-1 text-right text-muted-foreground">
                  {row.durationMs}ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ComposeView(_props: ViewProps) {
  const [graph, setGraph] = useState<ComposeGraph>(() =>
    createComposeFixture(),
  );
  const [tick, setTick] = useState(0);
  const [isLive, setIsLive] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutedNodes, setLayoutedNodes] = useState<ComposeFlowNode[] | null>(
    null,
  );
  const rngRef = useRef(createRng(20260715));

  const flow = useMemo(() => buildComposeFlow(graph), [graph]);

  // Layout once — the topology is fixed; ticks only mutate traffic data,
  // so positions are computed a single time and node payloads are merged
  // into the layouted set every render (persistent-canvas pattern from
  // the Migrations view).
  useEffect(() => {
    let cancelled = false;
    const { nodes, edges } = buildComposeFlow(graph);

    void layoutComposeNodes(nodes, edges).then((positioned) => {
      if (!cancelled) {
        setLayoutedNodes(positioned);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layout depends only on the fixed topology
  }, []);

  useEffect(() => {
    if (!isLive) {
      return;
    }

    const interval = window.setInterval(() => {
      setTick((current) => current + 1);
      setGraph((current) => ({
        ...current,
        edges: tickTraffic(current.edges, Date.now() / TICK_MS, rngRef.current),
      }));
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, [isLive]);

  const positionById = useMemo(
    () =>
      new Map(
        (layoutedNodes ?? []).map((node) => [node.id, node.position] as const),
      ),
    [layoutedNodes],
  );

  const liveNodes = useMemo(
    () =>
      layoutedNodes === null
        ? []
        : flow.nodes.map((node) => ({
            ...node,
            position: positionById.get(node.id) ?? node.position,
          })),
    [flow.nodes, layoutedNodes, positionById],
  );

  const liveEdges: Edge[] = layoutedNodes === null ? [] : flow.edges;
  const summary = useMemo(() => summarizeGraph(graph), [graph]);
  const summaryHealth = HEALTH_STYLES[summary.health];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <StudioHeader>
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Compose</span>
          <Badge variant="secondary">prototype</Badge>
        </div>
      </StudioHeader>

      <main className="relative flex min-h-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur-md [&>*]:pointer-events-auto">
          <h1
            className="text-sm font-semibold text-foreground"
            data-testid="compose-app-name"
          >
            {graph.appName}
          </h1>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("size-2 rounded-full", summaryHealth.dot)} />
            {summaryHealth.label}
          </span>
          <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5">
              {summary.modules} modules
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5">
              {summary.services} services
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5">
              {summary.inboundRps.toFixed(1)} rps in
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5",
                summary.errorRate >= 0.02
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                  : "bg-muted",
              )}
            >
              {(summary.errorRate * 100).toFixed(1)}% err
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] italic text-muted-foreground/70">
              simulated data
            </span>
            <Button
              aria-pressed={isLive}
              className="h-7 shadow-none"
              data-testid="compose-live-toggle"
              onClick={() => setIsLive((current) => !current)}
              size="xs"
              type="button"
              variant={isLive ? "secondary" : "outline"}
            >
              {isLive ? (
                <Pause data-icon="inline-start" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              {isLive ? "Live" : "Paused"}
            </Button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">
            <ReactFlow
              className="compose-canvas"
              edges={liveEdges}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              maxZoom={1.4}
              minZoom={0.2}
              nodes={liveNodes}
              nodesConnectable={false}
              nodesDraggable={false}
              nodeTypes={nodeTypes}
              onNodeClick={(_event, node) => {
                setSelectedId(node.id.replace(/^compose:/, ""));
              }}
              onPaneClick={() => setSelectedId(null)}
              proOptions={{ hideAttribution: true }}
            >
              <Background className="bg-muted/40" gap={20} size={1.5} />
              <Controls
                className="shadow-sm [&_button]:border [&_button]:border-input [&_button]:bg-background [&_button_>_svg]:fill-foreground"
                showInteractive={false}
              />
            </ReactFlow>
          </div>
        </div>

        {selectedId !== null && (
          <TracePanel
            graph={graph}
            onClose={() => setSelectedId(null)}
            selectedId={selectedId}
            tick={tick}
          />
        )}
      </main>
    </div>
  );
}
