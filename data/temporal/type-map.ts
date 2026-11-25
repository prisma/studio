import { formatTimerLength } from "./history-grouping";
import type {
  TemporalExecutionDetail,
  TemporalGroupedSpan,
  TemporalHistoryEvent,
  TemporalRunRef,
  TemporalTypeMap,
  TemporalTypeMapEdge,
  TemporalTypeMapNode,
  TemporalTypeMapResponse,
  TemporalWorkflowExecution,
} from "./types";

/**
 * Reads the newest Worker Build ID recorded on a run's `WorkflowTaskCompleted`
 * events, checking both `deploymentVersion`, `deployment`, and `workerVersionStamp`.
 */
export function extractRunBuildId(
  rawEvents: readonly TemporalHistoryEvent[],
): string | undefined {
  for (let i = rawEvents.length - 1; i >= 0; i--) {
    const event = rawEvents[i]!;
    if (event.eventType !== "WorkflowTaskCompleted") {
      continue;
    }

    const attrs = event.attributes as {
      deployment?: { buildId?: unknown; seriesName?: unknown };
      deploymentVersion?: { buildId?: unknown; deploymentName?: unknown };
      workerVersionStamp?: { buildId?: unknown };
    };
    const depVersion = attrs.deploymentVersion;
    if (typeof depVersion?.buildId === "string" && depVersion.buildId) {
      return typeof depVersion.deploymentName === "string" &&
        depVersion.deploymentName
        ? `${depVersion.deploymentName}:${depVersion.buildId}`
        : depVersion.buildId;
    }

    const dep = attrs.deployment;
    if (typeof dep?.buildId === "string" && dep.buildId) {
      return typeof dep.seriesName === "string" && dep.seriesName
        ? `${dep.seriesName}:${dep.buildId}`
        : dep.buildId;
    }

    const stamp = attrs.workerVersionStamp;
    if (typeof stamp?.buildId === "string" && stamp.buildId) {
      return stamp.buildId;
    }
  }

  return undefined;
}

export { formatTimerLength };

export const TYPE_MAP_START_ID = "start";

/** With more distinct Timers than this, a type's Timers are one step. */
const MAX_TIMER_STEPS = 4;
const MAX_EXAMPLE_RUNS = 5;

type RunForTypeMap = Pick<TemporalExecutionDetail, "execution" | "spans">;

function isStep(span: TemporalGroupedSpan): boolean {
  return span.kind !== "workflow" && span.kind !== "workflow-task";
}

/**
 * What tells one Timer of a Workflow from another: the summary the Workflow
 * code gave it, or the time it waits. A Timer's own ID is a sequence number.
 */
function timerLabel(span: TemporalGroupedSpan): string {
  return (
    span.userSummary ??
    (span.timerMs ? `Timer ${formatTimerLength(span.timerMs)}` : "Timer")
  );
}

/** The step of a diagram that a span of a run belongs to. */
function stepOf(
  span: TemporalGroupedSpan,
  timersMerged: boolean,
): { id: string; label: string } {
  const label =
    span.kind !== "timer"
      ? span.label
      : timersMerged
        ? "Timer"
        : timerLabel(span);

  return { id: `${span.kind}:${label}`, label };
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Draws one diagram of a Workflow Type from the histories of several of its
 * runs. Temporal stores no definition of a Workflow, so the steps and their
 * order are the ones these runs took.
 *
 * A step is every execution of one Activity Type, Child Workflow Type, Signal,
 * Update or Timer. Step B follows step A when A ended before B started and no
 * other step ran wholly between them. Two steps that ran at the same time
 * therefore both follow the step before them, and neither follows the other.
 * The order is that of the history's event IDs, which is exact where clock
 * times of the same millisecond are not.
 */
export function buildTypeMap(
  runs: RunForTypeMap[],
  options: {
    /** Set to draw one run with the steps of a diagram that exists already. */
    timersMerged?: boolean;
  } = {},
): TemporalTypeMap {
  const timerLabels = new Set<string>();

  for (const run of runs) {
    for (const span of run.spans) {
      if (span.kind === "timer") {
        timerLabels.add(timerLabel(span));
      }
    }
  }

  const mergeTimers =
    options.timersMerged ?? timerLabels.size > MAX_TIMER_STEPS;
  const nodes = new Map<
    string,
    TemporalTypeMapNode & {
      durations: number[];
      order: number;
      /** How often each summary text was given to the step. */
      summaries: Map<string, number>;
    }
  >();
  const edges = new Map<string, TemporalTypeMapEdge>();
  const during = new Map<string, number>();
  const statusCounts: TemporalTypeMap["statusCounts"] = {};
  const nodeOf = (
    id: string,
    kind: TemporalTypeMapNode["kind"],
    label: string,
    order: number,
  ) => {
    let node = nodes.get(id);

    if (!node) {
      node = {
        durations: [],
        failedRunCount: 0,
        failedRuns: [],
        id,
        kind,
        label,
        order,
        retriedRunCount: 0,
        runCount: 0,
        spanCount: 0,
        summaries: new Map(),
        waitingRunCount: 0,
        waitingRuns: [],
      };
      nodes.set(id, node);
    }

    node.order = Math.min(node.order, order);

    return node;
  };
  const addExample = (list: TemporalRunRef[], ref: TemporalRunRef) => {
    if (list.length < MAX_EXAMPLE_RUNS) {
      list.push(ref);
    }
  };

  nodeOf(TYPE_MAP_START_ID, "start", "Start", -1).runCount = runs.length;

  for (const run of runs) {
    const { status } = run.execution;
    const ref = {
      runId: run.execution.runId,
      workflowId: run.execution.workflowId,
    };
    const isOpen = status === "Running" || status === "Paused";
    const steps = run.spans
      .filter(isStep)
      .map((span) => ({
        ...stepOf(span, mergeTimers),
        end: span.closedEventId ?? Number.POSITIVE_INFINITY,
        span,
        start: span.startedEventId,
      }))
      .sort((a, b) => a.start - b.start);
    const runEdges = new Set<string>();
    const runDuring = new Set<string>();
    const followed = new Set<number>();
    const seen = new Set<string>();
    const failed = new Set<string>();
    const retried = new Set<string>();
    const addEdge = (from: string, to: string) => {
      // A step that follows itself is a repeat of the step, not a path.
      if (from !== to) {
        runEdges.add(`${from}\n${to}`);
      }
    };

    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    steps.forEach((step, index) => {
      const node = nodeOf(step.id, step.span.kind as never, step.label, index);

      node.spanCount++;
      seen.add(step.id);

      if (step.span.kind !== "timer" && step.span.userSummary) {
        node.summaries.set(
          step.span.userSummary,
          (node.summaries.get(step.span.userSummary) ?? 0) + 1,
        );
      }

      if (step.span.closedEventId !== undefined) {
        node.durations.push(step.span.durationMs);
      }

      if (step.span.status === "failed" || step.span.status === "timed-out") {
        failed.add(step.id);
      }

      if ((step.span.attempt ?? 1) > 1) {
        retried.add(step.id);
      }

      const before = steps
        .map((other, otherIndex) => ({ index: otherIndex, other }))
        .filter(({ other }) => other.end < step.start);
      const latestStart = Math.max(...before.map(({ other }) => other.start));

      if (before.length === 0) {
        addEdge(TYPE_MAP_START_ID, step.id);
      }

      for (const other of steps) {
        if (
          other.id !== step.id &&
          other.start < step.start &&
          other.end > step.start
        ) {
          runDuring.add(`${other.id}\n${step.id}`);
        }
      }

      for (const { index: beforeIndex, other } of before) {
        if (other.end >= latestStart) {
          followed.add(beforeIndex);
          addEdge(other.id, step.id);
        }
      }
    });

    const last = steps.filter((_, index) => !followed.has(index));

    if (isOpen) {
      // An open run is at its open steps, or after the last one it finished.
      const open = last.filter((step) => step.end === Number.POSITIVE_INFINITY);
      const at = new Set(
        (open.length > 0 ? open : last).map((step) => step.id),
      );

      for (const id of at.size > 0 ? at : [TYPE_MAP_START_ID]) {
        const node = nodes.get(id)!;

        node.waitingRunCount++;
        addExample(node.waitingRuns, ref);
      }
    } else {
      const endId = `end:${status}`;
      const end = nodeOf(endId, "end", status, Number.MAX_SAFE_INTEGER);

      end.status = status;
      end.runCount++;

      for (const step of last) {
        addEdge(step.id, endId);
      }

      if (steps.length === 0) {
        addEdge(TYPE_MAP_START_ID, endId);
      }
    }

    for (const id of seen) {
      const node = nodes.get(id)!;

      node.runCount++;

      if (failed.has(id)) {
        node.failedRunCount++;
        addExample(node.failedRuns, ref);
      }

      if (retried.has(id)) {
        node.retriedRunCount++;
      }
    }

    for (const pair of runDuring) {
      during.set(pair, (during.get(pair) ?? 0) + 1);
    }

    for (const edgeId of runEdges) {
      const [from, to] = edgeId.split("\n") as [string, string];
      const edge = edges.get(edgeId) ?? { from, id: edgeId, runCount: 0, to };

      edge.runCount++;
      edges.set(edgeId, edge);
    }
  }

  return {
    during: [...during].map(([pair, runCount]) => {
      const [at, starts] = pair.split("\n") as [string, string];

      return { at, runCount, starts };
    }),
    edges: [...edges.values()],
    nodes: [...nodes.values()]
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map(({ durations, order: _order, summaries, ...node }) => ({
        ...node,
        ...(summaries.size > 0
          ? {
              summary: [...summaries].sort(
                (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
              )[0]![0],
            }
          : {}),
        ...(durations.length > 0
          ? { medianDurationMs: median(durations) }
          : {}),
      })),
    runCount: runs.length,
    statusCounts,
    timersMerged: mergeTimers,
  };
}

/** Where one run is on the diagram of its Workflow Type. */
export interface TypeMapRunPath {
  /** The arrows this run took, by the `id` of the diagram's edges. */
  edgeIds: string[];
  /** The steps this run took, by the `id` of the diagram's nodes. */
  steps: Record<
    string,
    {
      /** The span of this run that is open at the step now. */
      openSpan?: TemporalGroupedSpan;
      state: "done" | "failed" | "now";
      /** How often the run took the step. */
      times: number;
    }
  >;
  /** Steps of this run that the diagram does not have: no sampled run took them. */
  unknownStepCount: number;
}

/**
 * Finds the steps and arrows of a diagram that one run took. The run is drawn
 * by the same rules as the diagram, so its steps have the same IDs.
 */
export function runPathOnTypeMap(
  run: RunForTypeMap,
  map: Pick<TemporalTypeMap, "nodes" | "timersMerged">,
): TypeMapRunPath {
  const own = buildTypeMap([run], { timersMerged: map.timersMerged });
  const known = new Set(map.nodes.map((node) => node.id));
  const path: TypeMapRunPath = { edgeIds: [], steps: {}, unknownStepCount: 0 };

  for (const node of own.nodes) {
    if (!known.has(node.id)) {
      path.unknownStepCount++;
      continue;
    }

    path.steps[node.id] = {
      openSpan:
        node.waitingRunCount > 0
          ? run.spans.find(
              (span) =>
                span.closedEventId === undefined &&
                isStep(span) &&
                stepOf(span, map.timersMerged).id === node.id,
            )
          : undefined,
      state:
        node.waitingRunCount > 0
          ? "now"
          : node.failedRunCount > 0
            ? "failed"
            : "done",
      times: node.kind === "start" || node.kind === "end" ? 1 : node.spanCount,
    };
  }

  path.edgeIds = own.edges.map((edge) => edge.id);

  return path;
}

/** The spans of a run that are steps, in the order they started. */
export function runSteps(run: RunForTypeMap): TemporalGroupedSpan[] {
  return run.spans
    .filter(isStep)
    .sort((a, b) => a.startedEventId - b.startedEventId);
}

/** A step that can follow the step a run is at. */
export interface TypeMapNextStep {
  /** True when this run went there next. */
  isTaken: boolean;
  /** How many sampled runs took the step the run is at. */
  ofRuns: number;
  /** How many of them went here next. */
  runCount: number;
}

/** Where a run was on the diagram at one step of its history. */
export interface TypeMapRunMoment extends TypeMapRunPath {
  /** Steps the run takes after this moment, by node ID. */
  laterStepIds: string[];
  /**
   * The steps that can follow the step the run is at, by node ID: the steps
   * that sampled runs took next, and the one this run took.
   */
  next: Record<string, TypeMapNextStep>;
  /** The arrows from the step the run is at to those steps. */
  nextEdgeIds: string[];
}

/**
 * Where a run was on the diagram when its step number `position` started, or
 * where it is at the end of its history when `position` is null. At an
 * earlier step, the steps that had not started yet are left out and a step
 * that was still open counts as open, so the diagram shows that moment.
 */
export function runMomentOnTypeMap(
  run: RunForTypeMap,
  map: Pick<TemporalTypeMap, "during" | "edges" | "nodes" | "timersMerged">,
  position: number | null,
): TypeMapRunMoment {
  const steps = runSteps(run);
  const full = runPathOnTypeMap(run, map);
  const isAtEnd = position === null || position >= steps.length;
  const cursor = isAtEnd ? null : steps[position]!.startedEventId;
  const path =
    cursor === null
      ? full
      : runPathOnTypeMap(
          {
            execution: { ...run.execution, status: "Running" },
            spans: run.spans
              .filter((span) => span.startedEventId <= cursor)
              .map((span) =>
                span.closedEventId === undefined || span.closedEventId <= cursor
                  ? span
                  : // It closed later, so at this moment it is open.
                    {
                      ...span,
                      closedEventId: undefined,
                      error: undefined,
                      status: "running" as const,
                    },
              ),
          },
          map,
        );
  const isOpen =
    run.execution.status === "Running" || run.execution.status === "Paused";
  // What the run did next: the step that started next, or the status it closed with.
  const takenNextId = isAtEnd
    ? undefined
    : position + 1 < steps.length
      ? (typeMapStepId(steps[position + 1]!, map) ?? undefined)
      : isOpen
        ? undefined
        : `end:${run.execution.status}`;
  const nodes = new Map(map.nodes.map((node) => [node.id, node]));
  const nowIds = Object.entries(path.steps)
    .filter(([, step]) => step.state === "now")
    .map(([id]) => id);
  const next: TypeMapRunMoment["next"] = {};
  const nextEdgeIds: string[] = [];

  // A closed run at the end of its history has no next step.
  if (!isAtEnd || isOpen) {
    for (const edge of map.edges) {
      if (!nowIds.includes(edge.from) || nowIds.includes(edge.to)) {
        continue;
      }

      const known = next[edge.to];

      nextEdgeIds.push(edge.id);

      if (!known || edge.runCount > known.runCount) {
        next[edge.to] = {
          isTaken: edge.to === takenNextId,
          ofRuns: nodes.get(edge.from)?.runCount ?? edge.runCount,
          runCount: edge.runCount,
        };
      }
    }

    // A step that sampled runs started while this one was open can also come
    // next: a Signal that arrives while a Timer runs.
    for (const pair of map.during) {
      if (
        nowIds.includes(pair.at) &&
        !(pair.starts in path.steps) &&
        !(pair.starts in next)
      ) {
        next[pair.starts] = {
          isTaken: pair.starts === takenNextId,
          ofRuns: nodes.get(pair.at)?.runCount ?? pair.runCount,
          runCount: pair.runCount,
        };
      }
    }
  }

  return {
    ...path,
    laterStepIds: Object.keys(full.steps).filter((id) => !(id in path.steps)),
    next,
    nextEdgeIds,
  };
}

/** The step of a diagram that a span of a run belongs to, or null for a span that is no step. */
export function typeMapStepId(
  span: TemporalGroupedSpan,
  map: Pick<TemporalTypeMap, "timersMerged">,
): string | null {
  return isStep(span) ? stepOf(span, map.timersMerged).id : null;
}

/**
 * The steps that sampled runs took right before and right after a step, the
 * most common first: what the step does in the Workflow.
 */
export function typeMapNeighbours(
  map: Pick<TemporalTypeMap, "edges" | "nodes">,
  nodeId: string,
): {
  after: Array<{ node: TemporalTypeMapNode; runCount: number }>;
  before: Array<{ node: TemporalTypeMapNode; runCount: number }>;
} {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const side = (from: "from" | "to", other: "from" | "to") =>
    map.edges
      .filter((edge) => edge[from] === nodeId && byId.has(edge[other]))
      .sort((a, b) => b.runCount - a.runCount)
      .map((edge) => ({
        node: byId.get(edge[other])!,
        runCount: edge.runCount,
      }));

  return { after: side("from", "to"), before: side("to", "from") };
}

/** How far a Timer is, at the time `nowMs`. Null for a span without a length. */
export function timerProgress(
  span: Pick<TemporalGroupedSpan, "timerMs" | "timestamp">,
  nowMs: number,
): {
  firesAtMs: number;
  leftMs: number;
  lengthMs: number;
  share: number;
} | null {
  const startedMs = Date.parse(span.timestamp);

  if (!span.timerMs || !Number.isFinite(startedMs)) {
    return null;
  }

  const firesAtMs = startedMs + span.timerMs;

  return {
    firesAtMs,
    leftMs: Math.max(0, firesAtMs - nowMs),
    lengthMs: span.timerMs,
    share: Math.min(1, Math.max(0, (nowMs - startedMs) / span.timerMs)),
  };
}

/**
 * Ensures every step and transition that `run` actually took exists in `map`.
 * Nodes and edges added solely from `run` carry `runCount: 0` so sampled counts
 * stay accurate. Returns `map` unchanged when nothing is missing.
 */
export function mergeRunIntoTypeMap<T extends TemporalTypeMap>(
  map: T,
  run: RunForTypeMap,
): T {
  const own = buildTypeMap([run], { timersMerged: map.timersMerged });
  const knownNodes = new Set(map.nodes.map((node) => node.id));
  const knownEdges = new Set(map.edges.map((edge) => edge.id));
  const missingNodes = own.nodes
    .filter((node) => !knownNodes.has(node.id))
    .map((node): TemporalTypeMapNode => {
      const { medianDurationMs: _median, ...rest } = node;

      return {
        ...rest,
        failedRunCount: 0,
        failedRuns: [],
        retriedRunCount: 0,
        runCount: 0,
        spanCount: 0,
        waitingRunCount: 0,
        waitingRuns: [],
      };
    });
  const missingEdges = own.edges
    .filter((edge) => !knownEdges.has(edge.id))
    .map((edge): TemporalTypeMapEdge => ({ ...edge, runCount: 0 }));

  if (missingNodes.length === 0 && missingEdges.length === 0) {
    return map;
  }

  const missingSteps = missingNodes.filter((node) => node.kind !== "end");
  const missingEnds = missingNodes.filter((node) => node.kind === "end");
  const firstEndIndex = map.nodes.findIndex((node) => node.kind === "end");
  const nodes =
    firstEndIndex === -1
      ? [...map.nodes, ...missingSteps, ...missingEnds]
      : [
          ...map.nodes.slice(0, firstEndIndex),
          ...missingSteps,
          ...map.nodes.slice(firstEndIndex),
          ...missingEnds,
        ];

  return {
    ...map,
    edges: [...map.edges, ...missingEdges],
    nodes,
  };
}

/** A sample has at least this many runs of every status that the type has. */
const MIN_RUNS_PER_STATUS = 3;

function isOpenStatus(status: TemporalWorkflowExecution["status"]): boolean {
  return status === "Running" || status === "Paused";
}

function activityTime(run: TemporalWorkflowExecution): string {
  return run.closeTime ?? run.startTime;
}

/**
 * The runs to draw a Workflow Type from: recent runs of every status (ordered
 * by close time when closed, else start time), progressed open runs so
 * long-lived workflows show their later steps, and a balance of recent closed
 * and open runs so newly started open runs cannot crowd out finished paths.
 */
export function pickTypeMapSample(
  runs: TemporalWorkflowExecution[],
  limit: number,
): TemporalWorkflowExecution[] {
  if (limit <= 0 || runs.length === 0) {
    return [];
  }

  const byActivity = [...runs].sort((a, b) => {
    const timeDiff = activityTime(b).localeCompare(activityTime(a));

    return timeDiff !== 0 ? timeDiff : b.startTime.localeCompare(a.startTime);
  });
  const statuses = [...new Set(byActivity.map((run) => run.status))];
  const sample = new Set<TemporalWorkflowExecution>();

  // Take at least one run per status before taking the second and third so
  // small limits still represent every status.
  for (
    let slot = 0;
    slot < MIN_RUNS_PER_STATUS && sample.size < limit;
    slot++
  ) {
    for (const status of statuses) {
      if (sample.size >= limit) {
        break;
      }

      const candidate = byActivity.filter((run) => run.status === status)[slot];

      if (candidate) {
        sample.add(candidate);
      }
    }
  }

  // Reserve up to a quarter of the sample for the furthest-progressed open
  // runs so long-lived workflows draw steps beyond their initial Timer/wait.
  const openByProgress = byActivity
    .filter((run) => isOpenStatus(run.status))
    .sort(
      (a, b) =>
        b.historyLength - a.historyLength ||
        activityTime(b).localeCompare(activityTime(a)),
    );
  const progressedOpenQuota = Math.floor(limit / 4);
  let progressedAdded = 0;

  for (const run of openByProgress) {
    if (sample.size >= limit || progressedAdded >= progressedOpenQuota) {
      break;
    }

    if (!sample.has(run)) {
      sample.add(run);
      progressedAdded++;
    }
  }

  // When both closed and open runs exist, give recent closed runs up to half
  // the sample so finished paths are not drowned out by newborn open runs.
  const closedByActivity = byActivity.filter(
    (run) => !isOpenStatus(run.status),
  );
  const closedTarget = Math.floor(limit / 2);
  let closedCount = [...sample].filter(
    (run) => !isOpenStatus(run.status),
  ).length;

  for (const run of closedByActivity) {
    if (sample.size >= limit || closedCount >= closedTarget) {
      break;
    }

    if (!sample.has(run)) {
      sample.add(run);
      closedCount++;
    }
  }

  // Fill remaining slots with the most recently active runs of any status.
  for (const run of byActivity) {
    if (sample.size >= limit) {
      break;
    }

    sample.add(run);
  }

  return byActivity.filter((run) => sample.has(run)).slice(0, limit);
}

/** The sample sizes a redraw of a type's diagram steps through: each run costs one or two history reads. */
export const TYPE_MAP_SAMPLE_STEPS = [40, 100, 200];

/** How many runs the next redraw reads: the next step, or the same number when the type has no more runs. */
export function nextTypeMapSampleSize(
  map: Pick<
    TemporalTypeMapResponse,
    "candidateCount" | "candidatesComplete" | "runCount" | "sampleSize"
  >,
): number {
  const current = map.sampleSize ?? TYPE_MAP_SAMPLE_STEPS[0]!;
  const hasMoreRuns =
    !map.candidatesComplete || map.candidateCount > map.runCount;
  const next = TYPE_MAP_SAMPLE_STEPS.find((size) => size > current);

  return hasMoreRuns && next ? next : current;
}
