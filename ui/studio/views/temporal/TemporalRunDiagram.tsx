import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  TemporalExecutionDetail,
  TemporalGroupedSpan,
  TemporalTypeMapNode,
  TemporalTypeMapResponse,
} from "@/data/temporal";
import {
  formatTimerLength,
  runMomentOnTypeMap,
  runSteps,
  timerProgress,
  typeMapNeighbours,
  typeMapStepId,
} from "@/data/temporal/type-map";
import { Button } from "@/ui/components/ui/button";
import { Skeleton } from "@/ui/components/ui/skeleton";

import {
  formatAbsoluteTime,
  formatDuration,
  formatTimeLeft,
  pluralize,
} from "./temporal-utils";
import {
  TEMPORAL_SPAN_STATUS,
  TemporalTime,
  useNow,
  workflowStatusLabel,
} from "./TemporalPrimitives";
import {
  TemporalTypeMapCanvas,
  TYPE_MAP_STEP_KINDS,
  typeMapStepName,
} from "./TemporalTypeMapCanvas";

/** "12s left" for an open Timer, "for 3.20s" for another open step. */
function openStepNote(span: TemporalGroupedSpan, nowMs: number): string {
  const progress = span.kind === "timer" ? timerProgress(span, nowMs) : null;

  if (progress) {
    return progress.leftMs > 0
      ? `${formatTimeLeft(progress.leftMs)} left`
      : "due now";
  }

  return `for ${formatDuration(Math.max(0, nowMs - Date.parse(span.timestamp)))}`;
}

/**
 * The diagram of a run's Workflow Type with the run marked on it: the steps
 * and arrows the run took stand out, the step it is at says so, with the time
 * a Timer has left, and the steps that can come next have a dashed border.
 *
 * The bar under the text steps through the run's history: at each step the
 * diagram shows the run as it was when that step started.
 */
export function TemporalRunDiagram(props: {
  detail: Pick<TemporalExecutionDetail, "execution" | "spans">;
  /** Moves the stepper to this span when changed (for example, on timeline click). */
  focusSpan?: { id: string; seq: number } | null;
  isError: boolean;
  map: TemporalTypeMapResponse | undefined;
  /** Called with the span(s) the stepper is currently on, so the timeline can highlight them. */
  onActiveSpanIdsChange?: (spanIds: string[]) => void;
  /** Opens a span in the list of spans. */
  onOpenSpan?: (spanId: string) => void;
  onRetry: () => void;
  onSelect: (nodeId: string | null) => void;
  selectedId: string | null;
  /** The diagram of the type on its own screen. */
  typeUrl: string;
}) {
  const {
    detail,
    focusSpan,
    isError,
    map,
    onActiveSpanIdsChange,
    onOpenSpan,
    onRetry,
    onSelect,
    selectedId,
    typeUrl,
  } = props;
  const steps = useMemo(() => runSteps(detail), [detail]);
  // Null is the end of the history: where the run is now, or how it closed.
  const [chosenPosition, setChosenPosition] = useState<number | null>(null);
  const position =
    chosenPosition === null || chosenPosition >= steps.length
      ? null
      : chosenPosition;

  useEffect(() => {
    if (!focusSpan) {
      return;
    }

    const index = steps.findIndex((span) => span.id === focusSpan.id);

    if (index >= 0) {
      setChosenPosition(index);
    }
  }, [focusSpan, steps]);

  const moment = useMemo(
    () => (map ? runMomentOnTypeMap(detail, map, position) : null),
    [detail, map, position],
  );
  const openSteps = useMemo(
    () =>
      position === null
        ? Object.entries(moment?.steps ?? {}).filter(([, step]) => step.openSpan)
        : [],
    [moment?.steps, position],
  );
  const now = useNow(1_000, openSteps.length > 0);
  const notes = Object.fromEntries(
    openSteps.map(([id, step]) => [id, openStepNote(step.openSpan!, now)]),
  );
  const hasDiagram = !isError && Boolean(map && moment);
  const activeSpanIds = useMemo(() => {
    if (position !== null) {
      const current = steps[position];
      return current ? [current.id] : [];
    }

    return openSteps
      .map(([, step]) => step.openSpan?.id)
      .filter((id): id is string => Boolean(id));
  }, [openSteps, position, steps]);

  useEffect(() => {
    onActiveSpanIdsChange?.(activeSpanIds);

    return () => {
      onActiveSpanIdsChange?.([]);
    };
  }, [activeSpanIds, onActiveSpanIdsChange]);

  useEffect(() => {
    if (!hasDiagram || steps.length === 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;

      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest('[role="dialog"], [role="menu"], [role="listbox"]'))
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setChosenPosition(Math.max(0, (position ?? steps.length) - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (position !== null) {
          setChosenPosition(position + 1 >= steps.length ? null : position + 1);
        }
      } else if (event.key === "Home") {
        event.preventDefault();
        setChosenPosition(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setChosenPosition(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasDiagram, position, steps.length]);

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-sm text-muted-foreground">
        <p className="font-medium text-destructive">
          Could not draw this Workflow Type
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (!map || !moment) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-16 w-60" />
        <Skeleton className="h-16 w-60" />
      </div>
    );
  }

  const isOpen =
    detail.execution.status === "Running" ||
    detail.execution.status === "Paused";
  const stepAt = position === null ? null : steps[position]!;

  return (
    <div
      className="flex h-full min-h-96 flex-col"
      data-testid="temporal-run-diagram"
    >
      <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
        The steps of{" "}
        <span className="font-mono text-foreground">{map.workflowType}</span>,
        drawn from {map.runCount} recent runs. Dark steps and arrows are the
        ones this run took. A dashed step can come next; its number says how
        many recent runs went there.
        {moment.unknownStepCount > 0
          ? ` ${moment.unknownStepCount} ${moment.unknownStepCount === 1 ? "step" : "steps"} of this run are not in the diagram, because none of those runs took them.`
          : ""}{" "}
        <a
          className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          href={typeUrl}
        >
          Open the diagram of the type
        </a>
      </p>

      {steps.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-1.5 text-xs"
          data-testid="temporal-run-stepper"
        >
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="xs"
              aria-label="First step"
              title="First step"
              className="w-6 px-0"
              disabled={position === 0}
              onClick={() => setChosenPosition(0)}
            >
              <SkipBack />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              aria-label="Previous step"
              title="Previous step"
              className="w-6 px-0"
              disabled={position === 0}
              onClick={() => setChosenPosition((position ?? steps.length) - 1)}
            >
              <ChevronLeft />
            </Button>
            {/* The arrow keys move this slider one step at a time. */}
            <input
              type="range"
              aria-label="Step of the run's history"
              aria-valuetext={
                stepAt
                  ? `Step ${position! + 1} of ${steps.length}: ${stepName(stepAt)}`
                  : isOpen
                    ? "Now"
                    : "End of the run"
              }
              className="mx-1 h-1 w-40 cursor-pointer accent-foreground"
              max={steps.length}
              min={0}
              onChange={(event) =>
                setChosenPosition(Number(event.target.value))
              }
              step={1}
              value={position ?? steps.length}
            />
            <Button
              variant="ghost"
              size="xs"
              aria-label="Next step"
              title="Next step"
              className="w-6 px-0"
              disabled={position === null}
              onClick={() => setChosenPosition(position! + 1)}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              aria-label={isOpen ? "Now" : "End of the run"}
              title={isOpen ? "Now" : "End of the run"}
              className="w-6 px-0"
              disabled={position === null}
              onClick={() => setChosenPosition(null)}
            >
              <SkipForward />
            </Button>
          </div>

          {stepAt ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
                Step {position! + 1} of {steps.length}
              </span>
              <span className="font-mono text-foreground">
                {stepName(stepAt)}
              </span>
              <span>
                {TEMPORAL_SPAN_STATUS[stepAt.status].label} · started{" "}
                <TemporalTime iso={stepAt.timestamp} />
                {stepAt.closedEventId === undefined
                  ? ""
                  : ` · took ${formatDuration(stepAt.durationMs)}`}
              </span>
              {onOpenSpan ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onOpenSpan(stepAt.id)}
                >
                  Open Span
                </Button>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {isOpen ? "Now" : "End of the run"}
              </span>
              {" · "}
              {isOpen
                ? `${pluralize(steps.length, "step")} so far`
                : `${pluralize(steps.length, "step")}, closed as ${workflowStatusLabel(detail.execution.status)}`}
            </span>
          )}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <TemporalTypeMapCanvas
          map={map}
          onSelect={onSelect}
          run={{ isPast: position !== null, notes, path: moment }}
          selectedId={selectedId}
        />
      </div>

      {selectedId ? (
        <RunNodeDetail
          map={map}
          moment={moment}
          node={map.nodes.find((node) => node.id === selectedId) ?? null}
          onJumpToStep={(index) => setChosenPosition(index)}
          onOpenSpan={onOpenSpan}
          steps={steps}
        />
      ) : null}
    </div>
  );
}

/** Shows how this run relates to the clicked node on the diagram, with step and span links. */
function RunNodeDetail(props: {
  map: TemporalTypeMapResponse;
  moment: ReturnType<typeof runMomentOnTypeMap>;
  node: TemporalTypeMapNode | null;
  onJumpToStep: (index: number) => void;
  onOpenSpan?: (spanId: string) => void;
  steps: TemporalGroupedSpan[];
}) {
  const { map, moment, node, onJumpToStep, onOpenSpan, steps } = props;

  if (!node || node.kind === "start") {
    return null;
  }

  if (node.kind === "end") {
    return (
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-muted-foreground"
        data-testid="temporal-run-node-detail"
      >
        <span>
          <span className="font-medium tabular-nums text-foreground">
            {node.runCount} of {map.runCount}
          </span>{" "}
          sampled runs closed as{" "}
          <span className="font-medium text-foreground">
            {workflowStatusLabel(node.status ?? "Completed")}
          </span>
          .
        </span>
      </div>
    );
  }

  const kind = TYPE_MAP_STEP_KINDS[node.kind];
  const matches = steps
    .map((span, index) => ({ index, span }))
    .filter(({ span }) => typeMapStepId(span, map) === node.id);
  const latest = matches.at(-1) ?? null;
  const nextInfo = moment.next[node.id];

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-muted/20 px-4 py-2.5 text-xs"
      data-testid="temporal-run-node-detail"
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono font-medium text-foreground">
          {typeMapStepName(node)}
        </span>
        {kind.name === typeMapStepName(node) ? null : (
          <span className="text-muted-foreground">{kind.name}</span>
        )}
        <span className="text-muted-foreground">
          {matches.length > 0 ? (
            <>
              Taken{" "}
              <span className="font-medium tabular-nums text-foreground">
                {matches.length === 1 ? "once" : `${matches.length} times`}
              </span>{" "}
              in this run
              {latest
                ? ` (${TEMPORAL_SPAN_STATUS[latest.span.status].label}${latest.span.closedEventId === undefined ? "" : ` · ${formatDuration(latest.span.durationMs)}`})`
                : ""}
            </>
          ) : nextInfo ? (
            <>
              Can come next ({nextInfo.runCount} of {map.runCount} recent runs)
            </>
          ) : (
            "Not taken by this run"
          )}
        </span>
        {node.medianDurationMs !== undefined ? (
          <span className="text-muted-foreground">
            Typical{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatDuration(node.medianDurationMs)}
            </span>
          </span>
        ) : null}
      </div>
      {latest ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={() => onJumpToStep(latest.index)}
          >
            Jump to Step {latest.index + 1}
          </Button>
          {onOpenSpan ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => onOpenSpan(latest.span.id)}
            >
              Open Span
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The name of a step without the kind in front of it. */
function stepName(span: TemporalGroupedSpan): string {
  return span.label.replace(/^(?:Child|Signal|Update): /, "");
}

function StepList(props: {
  items: ReturnType<typeof typeMapNeighbours>["after"];
  total: number;
}) {
  return (
    <>
      {props.items.map((item, index) => (
        <span key={item.node.id}>
          {index > 0 ? ", " : ""}
          <span className="font-mono text-foreground">
            {item.node.kind === "start"
              ? "the start"
              : item.node.kind === "end"
                ? `the end (${item.node.label})`
                : typeMapStepName(item.node)}
          </span>{" "}
          ({item.runCount} of {props.total})
        </span>
      ))}
    </>
  );
}

/**
 * What the expanded row of a Timer shows: how long it is, when it fires and
 * how much is left, and what runs of the type do before and after it. A Timer
 * has no input and no output.
 */
export function TemporalTimerDetail(props: {
  /** Undefined while the diagram loads, null when there is none to load. */
  map: TemporalTypeMapResponse | null | undefined;
  onShowInDiagram?: (nodeId: string) => void;
  span: TemporalGroupedSpan;
}) {
  const { map, onShowInDiagram, span } = props;
  const isOpen = span.status === "running";
  const now = useNow(1_000, isOpen);
  const progress = timerProgress(span, now);
  const startedMs = Date.parse(span.timestamp);
  const closedIso = isOpen
    ? undefined
    : new Date(startedMs + span.durationMs).toISOString();
  const nodeId = map ? typeMapStepId(span, map) : null;
  const neighbours =
    map && nodeId && map.nodes.some((node) => node.id === nodeId)
      ? typeMapNeighbours(map, nodeId)
      : null;
  return (
    <div
      className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 py-3 pr-4 pl-11 text-xs"
      data-testid="temporal-timer-detail"
    >
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-muted-foreground">
        <Fact label="Length">
          {span.timerMs ? formatTimerLength(span.timerMs) : "not recorded"}
        </Fact>
        <Fact label="Started">
          <TemporalTime iso={span.timestamp} />
        </Fact>
        {isOpen && progress ? (
          <>
            {/* "Left" is the relative time, so this is the time of day. */}
            <Fact label="Fires at">
              {formatAbsoluteTime(
                new Date(progress.firesAtMs).toISOString(),
                "local",
              )}
            </Fact>
            <Fact label="Left">
              {progress.leftMs > 0
                ? formatTimeLeft(progress.leftMs)
                : "due now"}
            </Fact>
          </>
        ) : (
          <Fact
            label={
              span.status === "fired"
                ? "Fired"
                : span.status === "canceled"
                  ? "Canceled"
                  : "Ended"
            }
          >
            <TemporalTime iso={closedIso} /> · after{" "}
            {formatDuration(span.durationMs)}
          </Fact>
        )}
      </dl>

      {isOpen && progress ? (
        <div
          aria-label={`${Math.round(progress.share * 100)}% of the Timer has passed`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(progress.share * 100)}
          className="h-1.5 max-w-md overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-prism-cyan-600 dark:bg-prism-cyan-300"
            style={{ width: `${progress.share * 100}%` }}
          />
        </div>
      ) : null}

      {neighbours && map ? (
        <div className="flex flex-col gap-1 text-muted-foreground">
          {neighbours.before.length > 0 ? (
            <p>
              In recent runs this Timer comes after{" "}
              <StepList items={neighbours.before} total={map.runCount} />.
            </p>
          ) : null}
          {neighbours.after.length > 0 ? (
            <p>
              After it, runs go on to{" "}
              <StepList items={neighbours.after} total={map.runCount} />.
            </p>
          ) : null}
        </div>
      ) : map === undefined ? (
        <Skeleton className="h-4 w-80" />
      ) : null}

      {onShowInDiagram && nodeId && neighbours ? (
        <div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onShowInDiagram(nodeId)}
          >
            Show in Diagram
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Fact(props: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt>{props.label}</dt>
      <dd className="font-mono text-foreground">{props.children}</dd>
    </div>
  );
}
