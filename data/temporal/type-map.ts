import { formatTimerLength } from "./history-grouping";
import type {
  TemporalExecutionDetail,
  TemporalGroupedSpan,
  TemporalHistoryEvent,
  TemporalRunRef,
  TemporalTypeMap,
  TemporalTypeMapEdge,
  TemporalTypeMapMessage,
  TemporalTypeMapNode,
  TemporalTypeMapResponse,
  TemporalWorkflowExecution,
} from "./types";

/**
 * The Worker Build ID that started a run: the first one recorded on its
 * `WorkflowTaskCompleted` events (`deploymentVersion`, `deployment`,
 * `workerVersion` or `workerVersionStamp`). A run keeps the steps of the code
 * that started it, even after a newer Worker takes it over.
 */
export function extractRunBuildId(
  rawEvents: readonly TemporalHistoryEvent[],
): string | undefined {
  for (const event of rawEvents) {
    if (event.eventType !== "WorkflowTaskCompleted") {
      continue;
    }

    const attrs = event.attributes as {
      deployment?: { buildId?: unknown; seriesName?: unknown };
      deploymentVersion?: { buildId?: unknown; deploymentName?: unknown };
      workerVersion?: { buildId?: unknown };
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

    const stamp = attrs.workerVersion ?? attrs.workerVersionStamp;

    return typeof stamp?.buildId === "string" && stamp.buildId
      ? stamp.buildId
      : undefined;
  }

  return undefined;
}

export { formatTimerLength };

export const TYPE_MAP_START_ID = "start";

/** With more distinct unnamed Timers than this, a type's unnamed Timers are one step. */
const MAX_TIMER_STEPS = 4;
const MAX_EXAMPLE_RUNS = 5;
/**
 * An Activity with more distinct summaries than this in the sample is one
 * node: its summaries name single executions (an order ID), not business steps.
 */
const MAX_SUMMARIES_PER_STEP = 6;
/** The result fields that can name a business outcome, in the order they are tried. */
const OUTCOME_FIELDS = ["outcome", "status", "stage"] as const;
const MAX_OUTCOMES = 5;
const MAX_OUTCOME_LENGTH = 40;

type RunForTypeMap = Pick<TemporalExecutionDetail, "execution" | "spans"> &
  Partial<Pick<TemporalExecutionDetail, "result">>;

/** How the spans of runs become nodes; stored on a diagram, so one run is drawn the same way. */
interface TypeMapRules {
  outcomeField?: string;
  splitSteps: Set<string>;
  timersMerged: boolean;
}

function rulesOf(
  map: Pick<TemporalTypeMap, "outcomeField" | "splitSteps" | "timersMerged">,
): TypeMapRules {
  return {
    ...(map.outcomeField ? { outcomeField: map.outcomeField } : {}),
    // A diagram from an older server has no split steps.
    splitSteps: new Set(map.splitSteps ?? []),
    timersMerged: map.timersMerged,
  };
}

function isStep(span: TemporalGroupedSpan): boolean {
  return span.kind !== "workflow" && span.kind !== "workflow-task";
}

/** A Signal or an Update: something a run receives, not a step it takes. */
function isMessage(span: TemporalGroupedSpan): boolean {
  return span.kind === "signal" || span.kind === "update";
}

function isFlowStep(span: TemporalGroupedSpan): boolean {
  return isStep(span) && !isMessage(span);
}

/** A summary on one line, so it can be part of an ID. */
function summaryOf(span: TemporalGroupedSpan): string | undefined {
  const text = span.userSummary?.replace(/\s+/g, " ").trim();

  return text ? text : undefined;
}

/**
 * What tells one Timer of a Workflow from another: the summary the Workflow
 * code gave it, or the time it waits. A Timer's own ID is a sequence number.
 */
function timerLabel(span: TemporalGroupedSpan): string {
  return (
    summaryOf(span) ??
    (span.timerMs ? `Timer ${formatTimerLength(span.timerMs)}` : "Timer")
  );
}

/** The node of an Activity or Child Workflow before any split by summary. */
function baseStepId(span: TemporalGroupedSpan): string {
  return `${span.kind}:${span.label}`;
}

/** The step of a diagram that a span of a run belongs to. */
function stepOf(
  span: TemporalGroupedSpan,
  rules: TypeMapRules,
): { id: string; implementation?: string; label: string } {
  if (span.kind === "timer") {
    // A named Timer is a business step; unnamed ones merge when there are many lengths.
    const label =
      summaryOf(span) ?? (rules.timersMerged ? "Timer" : timerLabel(span));

    return { id: `timer:${label}`, label };
  }

  const summary = summaryOf(span);
  const base = baseStepId(span);

  if (summary && rules.splitSteps.has(base)) {
    return {
      id: `${base}:${summary}`,
      implementation: span.label.replace(/^Child: /, ""),
      label: summary,
    };
  }

  return { id: base, label: span.label };
}

/** The end node of a closed run: its status, and its business outcome when the diagram splits by one. */
function endOf(
  run: RunForTypeMap,
  rules: TypeMapRules,
): { id: string; outcome?: string } {
  const { status } = run.execution;
  const outcome =
    status === "Completed" && rules.outcomeField
      ? outcomeValue(run.result, rules.outcomeField)
      : undefined;

  return outcome
    ? { id: `end:${status}:${outcome}`, outcome }
    : { id: `end:${status}` };
}

function outcomeValue(result: unknown, field: string): string | undefined {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return undefined;
  }

  const value = (result as Record<string, unknown>)[field];

  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_OUTCOME_LENGTH &&
    !/\s{2,}|\n/.test(value)
    ? value
    : undefined;
}

/** The rules a sample of runs is drawn with. */
function rulesFor(runs: RunForTypeMap[]): TypeMapRules {
  const unnamedTimers = new Set<string>();
  const summaries = new Map<string, Set<string>>();

  for (const run of runs) {
    for (const span of run.spans) {
      if (span.kind === "timer") {
        if (!summaryOf(span)) {
          unnamedTimers.add(timerLabel(span));
        }
      } else if (isFlowStep(span)) {
        const summary = summaryOf(span);

        if (summary) {
          const base = baseStepId(span);
          const set = summaries.get(base) ?? new Set<string>();

          set.add(summary);
          summaries.set(base, set);
        }
      }
    }
  }

  const completed = runs.filter((run) => run.execution.status === "Completed");
  const outcomeField = OUTCOME_FIELDS.find((field) => {
    const values = completed
      .map((run) => outcomeValue(run.result, field))
      .filter((value): value is string => value !== undefined);
    const distinct = new Set(values).size;

    // Most completed runs name an outcome, and there are a few outcomes to tell apart.
    return (
      values.length * 2 >= completed.length &&
      distinct >= 2 &&
      distinct <= MAX_OUTCOMES
    );
  });

  return {
    ...(outcomeField ? { outcomeField } : {}),
    splitSteps: new Set(
      [...summaries]
        .filter(([, set]) => set.size <= MAX_SUMMARIES_PER_STEP)
        .map(([base]) => base),
    ),
    timersMerged: unnamedTimers.size > MAX_TIMER_STEPS,
  };
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
 * The step a run was at when a span started: the step open then (the latest
 * to start), or else the last one that had ended. Null before the first step.
 */
function stepAtStart(
  steps: Array<{ end: number; id: string; start: number }>,
  start: number,
): string | null {
  const open = steps.filter((step) => step.start < start && step.end > start);
  const at =
    open.at(-1) ?? steps.filter((step) => step.end < start).at(-1) ?? null;

  return at?.id ?? null;
}

/**
 * Draws one diagram of a Workflow Type from the histories of several of its
 * runs. Temporal stores no definition of a Workflow, so the steps and their
 * order are the ones these runs took.
 *
 * A step is every execution of one Activity Type, Child Workflow Type or
 * Timer, or of one summary of it: an Activity called for several business
 * steps, such as four different emails, is a node per summary. Signals and
 * Updates are inputs, not steps: they are listed on the step the run was at
 * when they arrived. Step B follows step A when A ended before B started and
 * no other step ran wholly between them. Two steps that ran at the same time
 * therefore both follow the step before them, and neither follows the other.
 * The order is that of the history's event IDs, which is exact where clock
 * times of the same millisecond are not.
 */
export function buildTypeMap(
  runs: RunForTypeMap[],
  options: {
    /** The rules of a diagram that exists already, to draw one run the same way. */
    rules?: TypeMapRules;
  } = {},
): TemporalTypeMap {
  const rules = options.rules ?? rulesFor(runs);
  const nodes = new Map<
    string,
    TemporalTypeMapNode & {
      durations: number[];
      /** Runs that received each Signal or Update while at this step. */
      messageRuns: Map<string, TemporalTypeMapMessage>;
      order: number;
      /** How often each summary text was given to the step. */
      summaries: Map<string, number>;
    }
  >();
  const edges = new Map<string, TemporalTypeMapEdge>();
  const during = new Map<string, number>();
  const messages = new Map<string, TemporalTypeMapMessage>();
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
        messageRuns: new Map(),
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
      .filter(isFlowStep)
      .map((span) => ({
        ...stepOf(span, rules),
        end: span.closedEventId ?? Number.POSITIVE_INFINITY,
        span,
        start: span.startedEventId,
      }))
      .sort((a, b) => a.start - b.start);
    const runEdges = new Set<string>();
    const runDuring = new Set<string>();
    const runMessages = new Set<string>();
    const runMessagesAt = new Set<string>();
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

      if (step.implementation) {
        node.implementation = step.implementation;
      }

      node.spanCount++;
      seen.add(step.id);

      const summary = summaryOf(step.span);

      if (step.span.kind !== "timer" && summary) {
        node.summaries.set(summary, (node.summaries.get(summary) ?? 0) + 1);
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

    // Signals and Updates: counted once per run, and on the step the run was at.
    for (const span of run.spans.filter(isMessage)) {
      const kind = span.kind as TemporalTypeMapMessage["kind"];
      const name = span.label.replace(/^(?:Signal|Update): /, "");
      const key = `${kind}:${name}`;
      const at = stepAtStart(steps, span.startedEventId) ?? TYPE_MAP_START_ID;

      if (!runMessages.has(key)) {
        runMessages.add(key);
        const total = messages.get(key) ?? { kind, name, runCount: 0 };

        total.runCount++;
        messages.set(key, total);
      }

      if (!runMessagesAt.has(`${at}\n${key}`)) {
        runMessagesAt.add(`${at}\n${key}`);
        const node = nodes.get(at);

        if (node) {
          const onNode = node.messageRuns.get(key) ?? {
            kind,
            name,
            runCount: 0,
          };

          onNode.runCount++;
          node.messageRuns.set(key, onNode);
        }
      }
    }

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
      const endAt = endOf(run, rules);
      const end = nodeOf(endAt.id, "end", status, Number.MAX_SAFE_INTEGER);

      end.status = status;

      if (endAt.outcome) {
        end.outcome = endAt.outcome;
      }

      end.runCount++;

      for (const step of last) {
        addEdge(step.id, endAt.id);
      }

      if (steps.length === 0) {
        addEdge(TYPE_MAP_START_ID, endAt.id);
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

  const byRuns = (a: TemporalTypeMapMessage, b: TemporalTypeMapMessage) =>
    b.runCount - a.runCount || a.name.localeCompare(b.name);

  return {
    during: [...during].map(([pair, runCount]) => {
      const [at, starts] = pair.split("\n") as [string, string];

      return { at, runCount, starts };
    }),
    edges: [...edges.values()],
    ...(messages.size > 0
      ? { messages: [...messages.values()].sort(byRuns) }
      : {}),
    nodes: [...nodes.values()]
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map(({ durations, messageRuns, order: _order, summaries, ...node }) => ({
        ...node,
        ...(messageRuns.size > 0
          ? { messages: [...messageRuns.values()].sort(byRuns) }
          : {}),
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
    ...(rules.outcomeField ? { outcomeField: rules.outcomeField } : {}),
    runCount: runs.length,
    splitSteps: [...rules.splitSteps].sort(),
    statusCounts,
    timersMerged: rules.timersMerged,
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
  map: Pick<
    TemporalTypeMap,
    "nodes" | "outcomeField" | "splitSteps" | "timersMerged"
  >,
): TypeMapRunPath {
  const rules = rulesOf(map);
  const own = buildTypeMap([run], { rules });
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
                isFlowStep(span) &&
                stepOf(span, rules).id === node.id,
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

/**
 * The spans of a run that are steps of its history, in the order they started:
 * the run page steps through these, Signals and Updates included.
 */
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
  map: Pick<
    TemporalTypeMap,
    | "during"
    | "edges"
    | "nodes"
    | "outcomeField"
    | "splitSteps"
    | "timersMerged"
  >,
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
  // What the run did next: the next real step (not a Signal or an Update), or how it closed.
  const nextStep = isAtEnd
    ? undefined
    : steps.slice(position + 1).find(isFlowStep);
  const takenNextId = isAtEnd
    ? undefined
    : nextStep
      ? typeMapStepId(nextStep, map)!
      : isOpen
        ? undefined
        : endOf(run, rulesOf(map)).id;
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

/**
 * The step of a diagram that a span of a run belongs to, or null for a span
 * that is no step: a Signal or Update is an input, and has no node.
 */
export function typeMapStepId(
  span: TemporalGroupedSpan,
  map: Pick<TemporalTypeMap, "outcomeField" | "splitSteps" | "timersMerged">,
): string | null {
  return isFlowStep(span) ? stepOf(span, rulesOf(map)).id : null;
}

/**
 * The node to show for a span of a run: its own step, or for a Signal or an
 * Update the step the run was at when it arrived.
 */
export function typeMapNodeIdOfSpan(
  run: RunForTypeMap,
  span: TemporalGroupedSpan,
  map: Pick<TemporalTypeMap, "outcomeField" | "splitSteps" | "timersMerged">,
): string | null {
  if (!isMessage(span)) {
    return typeMapStepId(span, map);
  }

  const rules = rulesOf(map);
  const steps = run.spans
    .filter(isFlowStep)
    .map((step) => ({
      end: step.closedEventId ?? Number.POSITIVE_INFINITY,
      id: stepOf(step, rules).id,
      start: step.startedEventId,
    }))
    .sort((a, b) => a.start - b.start);

  return stepAtStart(steps, span.startedEventId);
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
  const own = buildTypeMap([run], { rules: rulesOf(map) });
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
