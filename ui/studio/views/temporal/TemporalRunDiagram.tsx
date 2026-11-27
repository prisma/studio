import { Info, RefreshCw } from "lucide-react";
import { useEffect, useMemo } from "react";

import type {
  TemporalExecutionDetail,
  TemporalGroupedSpan,
  TemporalTypeMapNode,
  TemporalTypeMapResponse,
} from "@/data/temporal";
import {
  formatTimerLength,
  mergeRunIntoTypeMap,
  nextTypeMapSampleSize,
  runMomentOnTypeMap,
  runSteps,
  timerProgress,
  TYPE_MAP_SAMPLE_STEPS,
  typeMapNeighbours,
  typeMapStepId,
} from "@/data/temporal/type-map";
import { Button } from "@/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/ui/components/ui/popover";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { cn } from "@/ui/lib/utils";

import {
  formatAbsoluteTime,
  formatDuration,
  formatTimeLeft,
  pluralize,
} from "./temporal-utils";
import { TemporalFailurePanel } from "./TemporalFailurePanel";
import { payloadSizeText, TemporalPayloadView } from "./TemporalPayloadView";
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
 * `position` is the run page's step (`TemporalRunStepper`): at a step the
 * diagram shows the run as it was when that step started.
 */
export function TemporalRunDiagram(props: {
  detail: Pick<TemporalExecutionDetail, "execution" | "spans">;
  isError: boolean;
  map: TemporalTypeMapResponse | undefined;
  /** Called with the span(s) open at the end of the history, so the timeline can highlight them. */
  onActiveSpanIdsChange?: (spanIds: string[]) => void;
  onRetry: () => void;
  onSelectNode: (nodeId: string | null) => void;
  /** The run page's step; null is the end of the history. */
  position: number | null;
  selectedNodeId: string | null;
}) {
  const {
    detail,
    isError,
    map,
    onActiveSpanIdsChange,
    onRetry,
    onSelectNode,
    position,
    selectedNodeId,
  } = props;
  const steps = useMemo(() => runSteps(detail), [detail]);
  const displayMap = useMemo(
    () => (map ? mergeRunIntoTypeMap(map, detail) : null),
    [detail, map],
  );
  const moment = useMemo(
    () =>
      displayMap ? runMomentOnTypeMap(detail, displayMap, position) : null,
    [detail, displayMap, position],
  );
  const openSteps = useMemo(
    () =>
      position === null
        ? Object.entries(moment?.steps ?? {}).filter(
            ([, step]) => step.openSpan,
          )
        : [],
    [moment?.steps, position],
  );
  const now = useNow(1_000, openSteps.length > 0);
  const notes = Object.fromEntries(
    openSteps.map(([id, step]) => [id, openStepNote(step.openSpan!, now)]),
  );
  const openSpanIds = useMemo(
    () =>
      openSteps
        .map(([, step]) => step.openSpan?.id)
        .filter((id): id is string => Boolean(id)),
    [openSteps],
  );

  useEffect(() => {
    onActiveSpanIdsChange?.(openSpanIds);

    return () => {
      onActiveSpanIdsChange?.([]);
    };
  }, [openSpanIds, onActiveSpanIdsChange]);

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

  if (!displayMap || !moment) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-16 w-60" />
        <Skeleton className="h-16 w-60" />
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-96 flex-col"
      data-testid="temporal-run-diagram"
    >
      <div className="min-h-0 flex-1">
        <TemporalTypeMapCanvas
          map={displayMap}
          onSelect={onSelectNode}
          run={{ isPast: position !== null, notes, path: moment }}
          selectedId={selectedNodeId}
        />
      </div>

      {selectedNodeId ? (
        <RunNodeDetail
          map={displayMap}
          moment={moment}
          node={
            displayMap.nodes.find((node) => node.id === selectedNodeId) ?? null
          }
          position={position}
          steps={steps}
        />
      ) : null}
    </div>
  );
}

/**
 * How the run's diagram is drawn, behind an info button beside the history
 * views: what the marks mean, which runs the diagram comes from, a link to the
 * type's own diagram, and a redraw from more runs.
 */
export function TemporalRunDiagramInfo(props: {
  detail: Pick<TemporalExecutionDetail, "execution" | "spans">;
  isRedrawing: boolean;
  map: TemporalTypeMapResponse;
  onRedraw: (sampleSize: number) => void;
  /** The diagram of the type on its own screen. */
  typeUrl: string;
}) {
  const { detail, isRedrawing, map, onRedraw, typeUrl } = props;
  const addedStepCount = useMemo(
    () =>
      mergeRunIntoTypeMap(map, detail).nodes.filter(
        (node) => node.runCount === 0 && node.kind !== "start",
      ).length,
    [detail, map],
  );
  const nextSize = nextTypeMapSampleSize(map);
  const grows = nextSize > (map.sampleSize ?? TYPE_MAP_SAMPLE_STEPS[0]!);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="w-6 shrink-0 px-0 text-muted-foreground"
          aria-label="How this diagram is drawn"
          title="How this diagram is drawn"
          data-testid="temporal-run-diagram-info"
        >
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-80 flex-col gap-2 p-3 text-xs"
        data-testid="temporal-run-diagram-info-details"
      >
        <p className="font-medium text-foreground">
          The steps of <span className="font-mono">{map.workflowType}</span>
        </p>
        <p className="text-muted-foreground">
          Drawn from {pluralize(map.runCount, "recent run")}
          {addedStepCount > 0
            ? `, plus ${pluralize(addedStepCount, "step")} of this run that none of them took`
            : ""}
          . Dark steps and arrows are the ones this run took. A dashed step can
          come next; its number says how many recent runs went there.
        </p>
        <p className="text-muted-foreground">
          Choosing a step that this run took moves the run to that step, in
          every history view.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="xs">
            <a href={typeUrl}>Open the Type&apos;s Diagram</a>
          </Button>
          {grows ? (
            <Button
              variant="outline"
              size="xs"
              disabled={isRedrawing}
              onClick={() => onRedraw(nextSize)}
              data-testid="temporal-run-diagram-redraw"
            >
              <RefreshCw
                className={cn(isRedrawing && "motion-safe:animate-spin")}
              />
              Redraw from up to {nextSize} runs
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** How this run relates to the chosen node on the diagram. */
function RunNodeDetail(props: {
  map: TemporalTypeMapResponse;
  moment: ReturnType<typeof runMomentOnTypeMap>;
  node: TemporalTypeMapNode | null;
  /** The run page's step; null is the end of the history. */
  position: number | null;
  steps: TemporalGroupedSpan[];
}) {
  const { map, moment, node, position, steps } = props;

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
          {node.runCount > 0 ? (
            <>
              <span className="font-medium tabular-nums text-foreground">
                {node.runCount} of {map.runCount}
              </span>{" "}
              sampled runs closed as{" "}
            </>
          ) : (
            "This run closed as "
          )}
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
  // The visit at the run page's step, or the last one before it.
  const latest =
    (position === null
      ? matches.at(-1)
      : [...matches].reverse().find(({ index }) => index <= position)) ?? null;
  const nextInfo = moment.next[node.id];

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-muted/20 px-4 py-2.5 text-xs"
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
      {latest && node.kind !== "timer" ? (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <PayloadButton
            label="Input"
            stepName={typeMapStepName(node)}
            value={latest.span.input}
          />
          {latest.span.error ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  data-testid="temporal-run-node-failure"
                >
                  Failure
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="top"
                className="max-h-96 w-[min(32rem,calc(100vw-2rem))] overflow-auto p-3"
              >
                <TemporalFailurePanel
                  attempt={
                    latest.span.kind === "activity"
                      ? latest.span.attempt
                      : undefined
                  }
                  failure={latest.span.error}
                />
              </PopoverContent>
            </Popover>
          ) : latest.span.status === "running" ||
            latest.span.status === "retrying" ? null : (
            <PayloadButton
              label="Output"
              stepName={typeMapStepName(node)}
              value={latest.span.output}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A step's input or output behind a small button that says how big it is. */
function PayloadButton(props: {
  label: string;
  stepName: string;
  value: unknown;
}) {
  const { label, stepName, value } = props;

  if (value === undefined) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="gap-1.5 text-muted-foreground"
          data-testid={`temporal-run-node-${label.toLowerCase()}`}
        >
          <span className="text-foreground">{label}</span>
          {typeof value === "object" && value !== null
            ? payloadSizeText(value as Record<string, unknown>)
            : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
      >
        <p className="truncate border-b border-border px-3 py-2 text-2xs text-muted-foreground">
          <span className="text-foreground">{label}</span> of {stepName}
        </p>
        <TemporalPayloadView
          className="max-h-80 rounded-none border-0 bg-transparent"
          value={value}
        />
      </PopoverContent>
    </Popover>
  );
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
