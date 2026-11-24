import {
  Check,
  CircleDot,
  Cog,
  CornerDownRight,
  type LucideIcon,
  Mail,
  PenLine,
  RotateCw,
  Timer,
  Workflow,
  XCircle,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BaseEdge,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  type ReactFlowInstance,
} from "reactflow";

import type { TemporalTypeMap, TemporalTypeMapNode } from "@/data/temporal";
import type {
  TypeMapNextStep,
  TypeMapRunMoment,
  TypeMapRunPath,
} from "@/data/temporal/type-map";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { cn } from "@/ui/lib/utils";

import { CanvasZoomControls } from "../../CanvasZoomControls";
import {
  layoutTypeMap,
  orderTypeMapNodes,
  roundedPath,
  type TypeMapLayout,
  typeMapNodeHasMarks,
  typeMapNodeSize,
  type TypeMapPoint,
} from "./temporal-type-map-layout";
import { formatDuration } from "./temporal-utils";
import { WorkflowStatusBadge, workflowStatusLabel } from "./TemporalPrimitives";

type StepKind = Exclude<TemporalTypeMapNode["kind"], "end" | "start">;

export const TYPE_MAP_STEP_KINDS: Record<
  StepKind,
  { icon: LucideIcon; name: string; prefix?: string }
> = {
  activity: { icon: Cog, name: "Activity" },
  "child-workflow": {
    icon: Workflow,
    name: "Child Workflow",
    prefix: "Child: ",
  },
  signal: { icon: Mail, name: "Signal", prefix: "Signal: " },
  timer: { icon: Timer, name: "Timer" },
  update: { icon: PenLine, name: "Update", prefix: "Update: " },
};

/** The name of a step without the kind in front of it, which the node shows on its own line. */
export function typeMapStepName(node: TemporalTypeMapNode): string {
  const prefix =
    node.kind === "start" || node.kind === "end"
      ? undefined
      : TYPE_MAP_STEP_KINDS[node.kind].prefix;

  return prefix && node.label.startsWith(prefix)
    ? node.label.slice(prefix.length)
    : node.label;
}

/** What one run did at a node, with a text for where it is now. */
interface RunAtNode {
  /** True when the diagram shows an earlier moment of the run, not its end. */
  isPast: boolean;
  /** Set when the step can follow the step the run is at. */
  next?: TypeMapNextStep;
  note?: string;
  /** `later`: the run takes the step after the moment shown. `none`: never. */
  state: "done" | "failed" | "later" | "none" | "now";
  times: number;
}

interface TypeMapNodeData {
  isSelected: boolean;
  node: TemporalTypeMapNode;
  /**
   * Set in the diagram of one run: what the run did at this node. Undefined in
   * the diagram of a type.
   */
  run?: RunAtNode;
  totalRuns: number;
}

const handleClassName = "!size-px !min-h-0 !min-w-0 !border-0 !opacity-0";

function Handles(props: { source?: boolean; target?: boolean }) {
  return (
    <>
      {props.target === false ? null : (
        <Handle
          className={handleClassName}
          isConnectable={false}
          position={Position.Top}
          type="target"
        />
      )}
      {props.source === false ? null : (
        <Handle
          className={handleClassName}
          isConnectable={false}
          position={Position.Bottom}
          type="source"
        />
      )}
    </>
  );
}

/** How a node looks by what one run did there. A node the run did not reach is faint. */
function runNodeClassName(run: RunAtNode | undefined): string {
  if (!run) {
    return "";
  }

  // A step that can come next has a dashed border, whatever else is true of it.
  if (run.next && (run.state === "none" || run.state === "later")) {
    return "border-dashed !border-foreground/60";
  }

  return run.state === "none"
    ? "opacity-60"
    : run.state === "later"
      ? "opacity-80"
      : run.state === "now"
        ? "!border-prism-cyan-600 ring-2 ring-prism-cyan-400/50 dark:!border-prism-cyan-300"
        : run.state === "failed"
          ? "!border-destructive"
          : "!border-foreground/60";
}

const StartNode = memo(function StartNode() {
  return (
    <div className="flex size-full items-center justify-center rounded-full border border-border bg-muted font-sans text-xs font-medium text-foreground">
      Start
      <Handles target={false} />
    </div>
  );
});

const EndNode = memo(function EndNode(props: NodeProps<TypeMapNodeData>) {
  const { isSelected, node, run } = props.data;

  return (
    <div
      className={cn(
        "flex size-full items-center justify-between gap-2 rounded-full border bg-card pr-3 pl-1 font-sans text-xs",
        isSelected ? "border-foreground" : "border-border",
        runNodeClassName(run),
      )}
    >
      <Handles source={false} />
      <WorkflowStatusBadge status={node.status ?? "Completed"} />
      <span className="font-mono whitespace-nowrap tabular-nums text-muted-foreground">
        {node.runCount === 0 && run !== undefined
          ? "this run"
          : `${node.runCount.toLocaleString("en-US")} ${node.runCount === 1 ? "run" : "runs"}`}
      </span>
    </div>
  );
});

const StepNode = memo(function StepNode(props: NodeProps<TypeMapNodeData>) {
  const { isSelected, node, run, totalRuns } = props.data;
  const kind = TYPE_MAP_STEP_KINDS[node.kind as StepKind];
  const Icon = kind.icon;

  return (
    <div
      className={cn(
        "flex size-full cursor-pointer flex-col justify-center gap-1 rounded-lg border bg-card px-3 text-left font-sans shadow-xs",
        isSelected
          ? "border-foreground ring-1 ring-foreground"
          : "border-border hover:border-foreground/40",
        runNodeClassName(run),
      )}
      data-run-next={
        run?.next ? (run.next.isTaken ? "taken" : "possible") : undefined
      }
      data-run-state={run?.state}
      data-testid={`temporal-type-map-node-${node.id}`}
    >
      <Handles />
      <div className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-foreground">
          {typeMapStepName(node)}
        </span>
        {node.medianDurationMs === undefined ? null : (
          <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
            {formatDuration(node.medianDurationMs)}
          </span>
        )}
      </div>
      <div className="truncate text-2xs text-muted-foreground">
        {node.runCount === 0 && run !== undefined ? (
          `${kind.name} · Only in this run`
        ) : (
          <>
            {kind.name} · {node.runCount} of {totalRuns} runs
            {node.spanCount > node.runCount
              ? ` · ${node.spanCount.toLocaleString("en-US")} times`
              : ""}
          </>
        )}
      </div>
      {run !== undefined ? (
        <div className="flex items-center gap-1 truncate text-2xs font-medium text-foreground">
          {run.state === "now" ? (
            <>
              <CircleDot
                aria-hidden
                className="size-3 shrink-0 text-prism-cyan-700 dark:text-prism-cyan-300"
              />
              <span className="truncate">
                {run.isPast ? "This run was here" : "This run is here"}
                {run.note ? ` · ${run.note}` : ""}
              </span>
            </>
          ) : run.state === "failed" ? (
            <>
              <XCircle
                aria-hidden
                className="size-3 shrink-0 text-destructive"
              />
              Failed in this run
            </>
          ) : run.state === "done" ? (
            <>
              <Check aria-hidden className="size-3 shrink-0" />
              <span className="truncate">
                This run: {run.times === 1 ? "once" : `${run.times} times`}
                {run.next
                  ? run.next.isTaken
                    ? " · went here next"
                    : ` · possible next (${run.next.runCount} of ${run.next.ofRuns})`
                  : ""}
              </span>
            </>
          ) : run.next ? (
            <>
              <CornerDownRight aria-hidden className="size-3 shrink-0" />
              <span className="truncate">
                {run.next.isTaken
                  ? "This run went here next"
                  : `Possible next · ${run.next.runCount} of ${run.next.ofRuns} runs`}
              </span>
            </>
          ) : (
            <span className="font-normal text-muted-foreground">
              {run.state === "later" ? "Later in this run" : "Not in this run"}
            </span>
          )}
        </div>
      ) : typeMapNodeHasMarks(node) ? (
        <div className="flex items-center gap-3 text-2xs font-medium text-foreground">
          {node.waitingRunCount > 0 ? (
            <span className="flex items-center gap-1">
              <CircleDot
                aria-hidden
                className="size-3 text-prism-cyan-700 dark:text-prism-cyan-300"
              />
              {node.waitingRunCount} here now
            </span>
          ) : null}
          {node.failedRunCount > 0 ? (
            <span className="flex items-center gap-1">
              <XCircle aria-hidden className="size-3 text-destructive" />
              {node.failedRunCount} failed
            </span>
          ) : null}
          {node.retriedRunCount > 0 ? (
            <span className="flex items-center gap-1">
              <RotateCw
                aria-hidden
                className="size-3 text-amber-600 dark:text-amber-400"
              />
              {node.retriedRunCount} retried
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

const nodeTypes: NodeTypes = { end: EndNode, start: StartNode, step: StepNode };

interface RoutedEdgeData {
  /** The text on the arrow. Null for an arrow that needs none. */
  annotation: string | null;
  isHighlighted: boolean;
  label?: TypeMapPoint;
  points: TypeMapPoint[];
  tooltip: string;
}

export interface TypeMapEdgeAnnotation {
  /** The text for an arrow of the selected step: the words, the count of runs and the share. */
  detail: string;
  /** The text while the pointer is on any arrow: the words and the share. */
  hoverLabel: string;
  /**
   * The words on the arrow: the summary the Workflow code gave the step it
   * leads to, or what kind of transition it is. Null for an arrow that needs
   * no words, because the steps at its ends say it all.
   */
  label: string | null;
  tooltip: string;
}

/** A summary longer than this is cut on the arrow; the tooltip has all of it. */
const MAX_EDGE_TEXT_LENGTH = 36;

/**
 * Builds the visible edge annotation and hover title for a transition between
 * two steps on the workflow diagram.
 */
export function describeTypeMapEdge(params: {
  edgeRunCount: number;
  from?: TemporalTypeMapNode;
  isLoop: boolean;
  /**
   * False for an arrow that is not the one most runs took into its step. Only
   * the main arrow carries the step's summary, so the text shows once.
   */
  isMainIncoming?: boolean;
  isNext?: boolean;
  isTaken?: boolean;
  isTakenNext?: boolean;
  outgoingEdgeCount: number;
  to?: TemporalTypeMapNode;
  totalRuns: number;
}): TypeMapEdgeAnnotation {
  const {
    edgeRunCount,
    from,
    isLoop,
    isMainIncoming = true,
    isNext,
    isTaken,
    isTakenNext,
    outgoingEdgeCount,
    to,
    totalRuns,
  } = params;
  const countText = edgeRunCount.toLocaleString("en-US");
  // A share is of the runs that reached the source step, not of all runs.
  const sourceRuns = from && from.runCount > 0 ? from.runCount : totalRuns;
  const pct =
    sourceRuns > 0
      ? Math.min(100, Math.round((edgeRunCount / sourceRuns) * 100))
      : null;
  const share = pct === null ? null : `${pct}%`;
  const hasChoice = outgoingEdgeCount > 1;

  // What kind of transition the arrow is, in words. Null where the steps at its ends already say it.
  let role: string | null = null;
  let roleDescription = "Transition";

  if (isLoop) {
    role = "↻ loop";
    roleDescription = "Loops back to an earlier step";
  } else if (to?.kind === "signal") {
    role = "on signal";
    roleDescription = "Triggered by a Signal";
  } else if (to?.kind === "update") {
    role = "on update";
    roleDescription = "Triggered by an Update";
  } else if (to?.kind === "end") {
    const endLabel = workflowStatusLabel(to.status ?? "Completed");

    // The status is on the node itself; the word helps only where it names one branch of several.
    role = hasChoice ? endLabel.toLowerCase() : null;
    roleDescription = `Workflow closed as ${endLabel}`;
  } else if (from?.kind === "start") {
    roleDescription = "First step of the workflow";
  } else if (from?.kind === "timer") {
    role = "after timer";
    roleDescription = "Continues after the Timer";
  } else if (to?.kind === "timer") {
    roleDescription = "Starts a Timer";
  } else if (to?.kind === "child-workflow") {
    roleDescription = "Starts a Child Workflow";
  }

  // The developer's own words for the step win over ours.
  const summary = !isLoop && isMainIncoming ? to?.summary : undefined;
  const words = summary
    ? summary.length > MAX_EDGE_TEXT_LENGTH
      ? `${summary.slice(0, MAX_EDGE_TEXT_LENGTH - 1).trimEnd()}…`
      : summary
    : role;
  const isRunOnly = edgeRunCount === 0;
  const prefix = isTakenNext ? "next" : null;
  const join = (...parts: Array<string | null>) =>
    parts.filter((part) => part !== null).join(" · ");
  const label = isRunOnly
    ? join(prefix, words, "this run")
    : join(prefix, words) || null;
  const hoverLabel = isRunOnly
    ? join(prefix, words, "this run")
    : join(prefix, words, share);
  const detail = isRunOnly
    ? join(prefix, words, "this run")
    : join(
        prefix,
        words,
        `${countText} ${edgeRunCount === 1 ? "run" : "runs"}`,
        hasChoice ? share : null,
      );

  const fromName = from
    ? from.kind === "start"
      ? "Start"
      : typeMapStepName(from)
    : "Start";
  const toName = to
    ? to.kind === "end"
      ? workflowStatusLabel(to.status ?? "Completed")
      : typeMapStepName(to)
    : "End";
  const runNote = isTakenNext
    ? "This run went here next"
    : isTaken
      ? "Taken by this run"
      : isNext
        ? "Possible next step"
        : null;
  const shareText = pct === null ? "" : ` (${pct}%)`;
  const tooltipParts = [
    `${fromName} → ${toName}`,
    isRunOnly
      ? `Only in this run (not in ${totalRuns.toLocaleString("en-US")} sampled runs)`
      : !from || from.kind === "start" || sourceRuns === totalRuns
        ? `${countText} of ${totalRuns.toLocaleString("en-US")} sampled runs${shareText}`
        : `${countText} of the ${sourceRuns.toLocaleString("en-US")} sampled runs that reached ${fromName}${shareText}`,
    roleDescription,
    ...(summary ? [`Summary in the code: ${summary}`] : []),
    ...(runNote ? [runNote] : []),
  ];

  return { detail, hoverLabel, label, tooltip: tooltipParts.join(" · ") };
}

/** The colour of the canvas: the page background under the dotted layer of `bg-muted/40`. */
const EDGE_LABEL_HALO =
  "color-mix(in oklab, var(--muted) 40%, var(--background))";

/** An arrow along the route the layout found around the nodes, with its edge annotation. */
const RoutedEdge = memo(function RoutedEdge(props: EdgeProps<RoutedEdgeData>) {
  const { data, markerEnd, style } = props;

  if (!data || data.points.length < 2) {
    return null;
  }

  return (
    <g>
      <title>{data.tooltip}</title>
      <BaseEdge
        markerEnd={markerEnd}
        path={roundedPath(data.points, 6)}
        style={style}
      />
      {data.label && data.annotation ? (
        // Plain text, so an annotation cannot be taken for a step. The stroke in the canvas colour keeps the arrow from striking through it.
        <text
          data-testid="temporal-type-map-edge-label"
          dominantBaseline="central"
          fill={
            data.isHighlighted ? "var(--foreground)" : "var(--muted-foreground)"
          }
          fontFamily="var(--font-sans)"
          fontSize={11}
          fontWeight={data.isHighlighted ? 600 : 500}
          paintOrder="stroke"
          stroke={EDGE_LABEL_HALO}
          strokeLinejoin="round"
          strokeWidth={6}
          style={{ fontVariantNumeric: "tabular-nums" }}
          textAnchor="middle"
          x={data.label.x}
          y={data.label.y}
        >
          {data.annotation}
        </text>
      ) : null}
    </g>
  );
});

const edgeTypes: EdgeTypes = { routed: RoutedEdge };

/** Below this zoom the names in the nodes are too small to read. */
const MIN_OPENING_ZOOM = 0.8;
const OPENING_MARGIN = 24;

/**
 * Where the diagram opens: whole and centred when that leaves it readable.
 * A diagram too tall for that opens at a readable size with its start at the
 * top, and the user scrolls down it. One too wide opens on its Start step.
 */
export function openingViewport(
  bounds: { height: number; width: number; x: number; y: number },
  view: { height: number; width: number },
  start?: { width: number; x: number },
): { x: number; y: number; zoom: number } {
  const fit = Math.min(
    (view.width - 2 * OPENING_MARGIN) / bounds.width,
    (view.height - 2 * OPENING_MARGIN) / bounds.height,
  );
  const zoom = Math.min(1, Math.max(MIN_OPENING_ZOOM, fit));
  const fitsHeight = bounds.height * zoom <= view.height - 2 * OPENING_MARGIN;
  const fitsWidth = bounds.width * zoom <= view.width - 2 * OPENING_MARGIN;
  const leftmost = OPENING_MARGIN - bounds.x * zoom;
  const rightmost =
    view.width - OPENING_MARGIN - (bounds.x + bounds.width) * zoom;

  return {
    x:
      fitsWidth || !start
        ? (view.width - bounds.width * zoom) / 2 - bounds.x * zoom
        : Math.min(
            leftmost,
            Math.max(
              rightmost,
              view.width / 2 - (start.x + start.width / 2) * zoom,
            ),
          ),
    y:
      (fitsHeight ? (view.height - bounds.height * zoom) / 2 : OPENING_MARGIN) -
      bounds.y * zoom,
    zoom,
  };
}

/** What a screen reader says for a node: its name, its kind and its counts. */
function typeMapNodeName(node: TemporalTypeMapNode, totalRuns: number): string {
  if (node.kind === "start") {
    return "Start";
  }

  const runs = `${node.runCount} ${node.runCount === 1 ? "run" : "runs"}`;

  if (node.kind === "end") {
    return `${workflowStatusLabel(node.status ?? "Completed")}, ${runs}`;
  }

  return [
    typeMapStepName(node),
    TYPE_MAP_STEP_KINDS[node.kind].name,
    node.runCount > 0
      ? `${node.runCount} of ${totalRuns} runs`
      : "only in this run",
    node.waitingRunCount > 0 ? `${node.waitingRunCount} here now` : null,
    node.failedRunCount > 0 ? `${node.failedRunCount} failed` : null,
    node.retriedRunCount > 0 ? `${node.retriedRunCount} retried` : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
}

/** The arrow is 1.5 to 3 px wide by the share of the sampled runs that took it. */
function edgeWidth(runCount: number, totalRuns: number): number {
  return 1.5 + 1.5 * (totalRuns > 0 ? runCount / totalRuns : 0);
}

/**
 * The diagram of a Workflow Type: the steps its sampled runs took, top to
 * bottom, with an arrow where one step followed another and the number of runs
 * that went that way.
 */
export function TemporalTypeMapCanvas(props: {
  map: TemporalTypeMap;
  onSelect: (nodeId: string | null) => void;
  /**
   * One run to mark on the diagram: the steps and arrows it took stand out,
   * the others are faint, and the step it is at says so. `notes` adds a text
   * to a step the run is at, such as the time a Timer has left.
   */
  run?: {
    /** True when `path` is an earlier moment of the run, not its end. */
    isPast?: boolean;
    notes?: Record<string, string>;
    path: TypeMapRunPath & Partial<TypeMapRunMoment>;
  };
  selectedId: string | null;
}) {
  const { map, onSelect, run, selectedId } = props;
  const isRunDiagram = run !== undefined;
  // The layout depends on which nodes and arrows exist, not on their counts.
  // In the diagram of a run every step has three lines, so the layout does
  // not change when the run moves on.
  const shape = useMemo(
    () =>
      JSON.stringify([
        map.nodes.map((node) => [
          node.id,
          isRunDiagram || typeMapNodeHasMarks(node),
        ]),
        map.edges.map((edge) => edge.id),
      ]),
    [isRunDiagram, map],
  );
  const [layout, setLayout] = useState<
    (TypeMapLayout & { shape: string }) | null
  >(null);
  const container = useRef<HTMLDivElement>(null);
  const flow = useRef<ReactFlowInstance | null>(null);
  // While the pointer is on any arrow, every arrow shows its share.
  const [isArrowHovered, setIsArrowHovered] = useState(false);
  const nodeById = useMemo(
    () => new Map(map.nodes.map((node) => [node.id, node])),
    [map.nodes],
  );
  const nodeOrder = useMemo(
    () =>
      new Map(orderTypeMapNodes(map).map((node, index) => [node.id, index])),
    [map],
  );
  const outgoingCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const edge of map.edges) {
      counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
    }

    return counts;
  }, [map.edges]);
  // The arrow most runs took into each step: the one that carries the step's summary.
  const mainIncoming = useMemo(() => {
    const main = new Map<string, { id: string; runCount: number }>();

    for (const edge of map.edges) {
      const current = main.get(edge.to);

      if (!current || edge.runCount > current.runCount) {
        main.set(edge.to, { id: edge.id, runCount: edge.runCount });
      }
    }

    return new Set([...main.values()].map((edge) => edge.id));
  }, [map.edges]);
  const describeEdge = (
    edge: TemporalTypeMap["edges"][number],
    runState: { isNext?: boolean; isTaken?: boolean; isTakenNext?: boolean },
  ) => {
    const fromIndex = nodeOrder.get(edge.from);
    const toIndex = nodeOrder.get(edge.to);

    return describeTypeMapEdge({
      edgeRunCount: edge.runCount,
      from: nodeById.get(edge.from),
      isLoop:
        fromIndex !== undefined && toIndex !== undefined && toIndex < fromIndex,
      isMainIncoming: mainIncoming.has(edge.id),
      outgoingEdgeCount: outgoingCounts.get(edge.from) ?? 1,
      to: nodeById.get(edge.to),
      totalRuns: map.runCount,
      ...runState,
    });
  };

  useEffect(() => {
    let isCurrent = true;
    // The room each arrow's text needs, with its share and "next" beside it.
    const labelWidths = Object.fromEntries(
      map.edges.map((edge) => [
        edge.id,
        (describeEdge(edge, {}).label?.length ?? 0) * 6 + 52,
      ]),
    );

    void layoutTypeMap(map, {
      allStepsTall: isRunDiagram,
      labelWidths,
    }).then((result) => {
      if (isCurrent) {
        setLayout({ ...result, shape });
      }
    });

    return () => {
      isCurrent = false;
    };
    // `shape` stands for the parts of `map` that the layout reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);

  const nodes = useMemo<Array<Node<TypeMapNodeData>>>(
    () =>
      layout?.shape !== shape
        ? []
        : map.nodes.map((node) => {
            const size = typeMapNodeSize(node, isRunDiagram ? true : undefined);
            const taken = run?.path.steps[node.id];
            const runAtNode: RunAtNode | undefined = run
              ? {
                  isPast: run.isPast ?? false,
                  next: run.path.next?.[node.id],
                  note: run.notes?.[node.id],
                  state:
                    taken?.state ??
                    (run.path.laterStepIds?.includes(node.id)
                      ? "later"
                      : "none"),
                  times: taken?.times ?? 0,
                }
              : undefined;

            return {
              ariaLabel: typeMapNodeName(node, map.runCount),
              className: cn(
                "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                node.kind === "start" || node.kind === "end"
                  ? "rounded-full"
                  : "rounded-lg",
              ),
              data: {
                isSelected: node.id === selectedId,
                node,
                ...(runAtNode ? { run: runAtNode } : {}),
                totalRuns: map.runCount,
              },
              // Start opens no details, so the Tab key skips it.
              focusable: node.kind !== "start",
              id: node.id,
              position: layout.nodes[node.id] ?? { x: 0, y: 0 },
              style: { height: size.height, width: size.width },
              type:
                node.kind === "start" || node.kind === "end"
                  ? node.kind
                  : "step",
            };
          }),
    [isRunDiagram, layout, map, run, selectedId, shape],
  );
  const takenEdges = useMemo(
    () => (run ? new Set(run.path.edgeIds) : undefined),
    [run],
  );
  // The arrows to the steps that can come next, drawn dashed.
  const nextEdges = useMemo(() => new Set(run?.path.nextEdgeIds ?? []), [run]);
  const edges = useMemo<Array<Edge<RoutedEdgeData>>>(
    () =>
      layout?.shape !== shape
        ? []
        : map.edges.map((edge) => {
            const isOfSelected =
              selectedId !== null &&
              (edge.from === selectedId || edge.to === selectedId);
            // In the diagram of a run, the arrows the run took stand out.
            const isTaken = takenEdges?.has(edge.id) ?? false;
            const isNext = !isTaken && nextEdges.has(edge.id);
            const isTakenNext =
              isNext && Boolean(run?.path.next?.[edge.to]?.isTaken);
            const isStrong =
              isOfSelected || (selectedId === null && (isTaken || isTakenNext));
            const isFaint =
              selectedId !== null
                ? !isOfSelected
                : takenEdges && !isTaken && !isNext;
            const color = isStrong
              ? "var(--foreground)"
              : "var(--muted-foreground)";
            const annotation = describeEdge(edge, {
              isNext,
              isTaken,
              isTakenNext,
            });
            const markerSize = isStrong ? 38 : 34;

            return {
              data: {
                // A faint arrow shows no text. An arrow of the selected step shows its count; a pointer on any arrow shows every share.
                annotation: isFaint
                  ? null
                  : isOfSelected
                    ? annotation.detail
                    : isArrowHovered
                      ? annotation.hoverLabel
                      : annotation.label,
                isHighlighted: isStrong || isNext,
                ...layout.edges[edge.id],
                points: layout.edges[edge.id]?.points ?? [],
                tooltip: annotation.tooltip,
              },
              id: edge.id,
              markerEnd: {
                color,
                height: markerSize,
                markerUnits: "userSpaceOnUse",
                type: MarkerType.ArrowClosed,
                width: markerSize,
              },
              source: edge.from,
              style: {
                opacity: isFaint ? 0.45 : 1,
                stroke: color,
                ...(isNext ? { strokeDasharray: "5 4" } : {}),
                strokeWidth: takenEdges
                  ? isTaken
                    ? 2.25
                    : isNext
                      ? 1.75
                      : 1.4
                  : edgeWidth(edge.runCount, map.runCount),
              },
              target: edge.to,
              type: "routed",
              zIndex: isStrong ? 2 : isNext ? 1 : 0,
            };
          }),
    // `describeEdge` reads only values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isArrowHovered,
      layout,
      mainIncoming,
      map,
      nextEdges,
      nodeById,
      nodeOrder,
      outgoingCounts,
      run?.path.next,
      selectedId,
      shape,
      takenEdges,
    ],
  );

  if (nodes.length === 0) {
    return (
      <div className="flex size-full flex-col items-center gap-4 p-8">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-14 w-60" />
        <Skeleton className="h-14 w-60" />
      </div>
    );
  }

  const bounds = nodes.reduce(
    (box, node) => ({
      bottom: Math.max(
        box.bottom,
        node.position.y + Number(node.style!.height),
      ),
      left: Math.min(box.left, node.position.x),
      right: Math.max(box.right, node.position.x + Number(node.style!.width)),
      top: Math.min(box.top, node.position.y),
    }),
    {
      bottom: Number.NEGATIVE_INFINITY,
      left: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
    },
  );

  const startNode = nodes.find((node) => node.type === "start");

  return (
    // The focused node inside is the control; this element only listens for its keys.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={container}
      className="size-full"
      onFocusCapture={(event) => {
        const canvas = container.current?.querySelector(".react-flow");
        const node = event.target;

        if (!canvas || !node.classList.contains("react-flow__node")) {
          return;
        }

        // The browser scrolls the canvas element to a focused node, which moves the background and the zoom bar. The viewport must move instead.
        canvas.scrollTo(0, 0);

        if (!flow.current || !node.matches(":focus-visible")) {
          return;
        }

        const view = canvas.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        const shift = (
          start: number,
          end: number,
          low: number,
          high: number,
        ) =>
          start < low + OPENING_MARGIN
            ? low + OPENING_MARGIN - start
            : end > high - OPENING_MARGIN
              ? high - OPENING_MARGIN - end
              : 0;
        const dx = shift(box.left, box.right, view.left, view.right);
        const dy = shift(box.top, box.bottom, view.top, view.bottom);

        if (dx !== 0 || dy !== 0) {
          const viewport = flow.current.getViewport();

          flow.current.setViewport({
            ...viewport,
            x: viewport.x + dx,
            y: viewport.y + dy,
          });
        }
      }}
      onKeyDown={(event) => {
        const node = event.target as HTMLElement;
        const id = node.getAttribute("data-id");

        if (!id || !node.classList.contains("react-flow__node")) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(id === selectedId ? null : id);
        } else if (event.key === "Escape" && selectedId !== null) {
          onSelect(null);
        }
      }}
    >
      <ReactFlow
        // A new shape is a new diagram: open it at its start again.
        key={shape}
        // The view selects a node itself; React Flow's own keys would select and move nodes in its store.
        disableKeyboardA11y
        edges={edges}
        edgesFocusable={false}
        edgeTypes={edgeTypes}
        minZoom={0.2}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodeTypes={nodeTypes}
        onEdgeMouseEnter={() => setIsArrowHovered(true)}
        onEdgeMouseLeave={() => setIsArrowHovered(false)}
        onInit={(instance) => {
          const view = container.current?.getBoundingClientRect();

          flow.current = instance;

          if (view && view.width > 0 && view.height > 0) {
            instance.setViewport(
              openingViewport(
                {
                  height: bounds.bottom - bounds.top,
                  width: bounds.right - bounds.left,
                  x: bounds.left,
                  y: bounds.top,
                },
                view,
                startNode && {
                  width: Number(startNode.style!.width),
                  x: startNode.position.x,
                },
              ),
            );
          }
        }}
        onNodeClick={(_event, node) =>
          onSelect(
            node.id === selectedId || node.type === "start" ? null : node.id,
          )
        }
        onPaneClick={() => onSelect(null)}
        // A diagram runs top to bottom, so the wheel moves down it; pinch zooms.
        panOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background className="bg-muted/40" gap={20} size={1.5} />
        <CanvasZoomControls />
      </ReactFlow>
    </div>
  );
}
