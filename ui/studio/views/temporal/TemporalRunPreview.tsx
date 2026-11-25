import { Copy, Database, Play, Waves } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import type {
  TemporalExecutionDetail,
  TemporalGroupedSpan,
  TemporalPendingActivity,
  TemporalWorkflowExecution,
} from "@/data/temporal";
import { summarizeRunSteps } from "@/data/temporal/run-steps";
import { buildTimelineScale } from "@/data/temporal/timeline-scale";
import { timerProgress } from "@/data/temporal/type-map";
import { Button } from "@/ui/components/ui/button";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useStreams } from "@/ui/hooks/use-streams";
import { useTemporalWorkflowDetail } from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { useStudio } from "../../context";
import {
  formatBytes,
  formatDuration,
  formatFailureMessage,
  formatRelativeTime,
  pluralize,
  safeJsonPretty,
  spanBarClasses,
} from "./temporal-utils";
import {
  TEMPORAL_SPAN_STATUS,
  TemporalSectionLabel,
  TemporalSpanStatusIcon,
  TemporalTime,
} from "./TemporalPrimitives";
import { TemporalPayloadView } from "./TemporalPayloadView";
import type { TemporalStartPreset } from "./TemporalStartSheet";

/** The fold-out shows this many steps; the run page shows the rest. */
const MAX_STEPS = 6;

/** As tall at most as the steps box with all its rows, so the three blocks line up. */
const paneClass =
  "max-h-[182px] overflow-auto rounded-md border border-border bg-card px-3 py-2.5 font-mono text-xs leading-5 text-foreground";

/** A payload the Codec Server did not decode arrives as its encoding and size. */
function encodedPayloadNote(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const encoded = (value as { $encodedPayload?: unknown }).$encodedPayload;

  if (typeof encoded !== "object" || encoded === null) {
    return null;
  }

  const { encoding, sizeBytes } = encoded as {
    encoding?: string;
    sizeBytes?: number;
  };

  return `${encoding ?? "encoded"}, ${formatBytes(sizeBytes ?? 0)}`;
}

function formatMemoValue(value: unknown): string {
  return typeof value === "string"
    ? value
    : (encodedPayloadNote(value) ?? JSON.stringify(value));
}

/**
 * What a row of the Workflows grid shows when it is unfolded: the steps of the
 * run on a small timeline, its input, and its outcome. Non-standard UI: see
 * `Architecture/non-standard-ui.md`, "Temporal Run Preview".
 */
export function TemporalRunPreview(props: {
  execution: TemporalWorkflowExecution;
  namespace: string;
  onClone: (preset: TemporalStartPreset) => void;
  onOpen: () => void;
  onOpenRun: (runId: string) => void;
}) {
  const { execution, namespace, onClone, onOpen, onOpenRun } = props;
  const { hasDatabase, streamsUrl } = useStudio();
  const { createUrl, schemaParam, streamParam, tableParam } = useNavigation();
  const { streams } = useStreams();
  const targetStream =
    streamParam ??
    streams.find((stream) => stream.observability?.request?.eventsStream)
      ?.observability?.request?.eventsStream ??
    streams[0]?.name;
  const { data: detail, isLoading } = useTemporalWorkflowDetail({
    followMode: "paused",
    namespace,
    runId: execution.runId,
    workflowId: execution.workflowId,
  });

  if (isLoading || !detail) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-80 max-w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );
  }

  const run = detail.execution;
  const memoEntries = Object.entries(run.memo);
  const cloneArgs =
    detail.input === undefined
      ? []
      : Array.isArray(detail.input)
        ? detail.input
        : [detail.input];

  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex items-start justify-between gap-x-6 gap-y-2 @max-3xl:flex-wrap">
        <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5 font-mono text-xs text-muted-foreground">
          {detail.summary ? (
            <span className="basis-full font-sans text-sm text-foreground">
              {detail.summary}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Copy run ID ${run.runId}`}
            className="-mx-1 px-1 font-mono font-normal text-muted-foreground [&_svg]:size-3"
            onClick={() => {
              void navigator.clipboard.writeText(run.runId);
              toast.success("Copied Run ID");
            }}
            title={`Run ID: ${run.runId}`}
          >
            run {run.runId.slice(0, 8)}
            <Copy />
          </Button>
          <span>
            started <TemporalTime iso={run.startTime} />
          </span>
          {run.closeTime ? (
            <span>
              closed <TemporalTime iso={run.closeTime} />
            </span>
          ) : null}
          {run.historyLength > 0 ? (
            <span>
              {pluralize(run.historyLength, "event")},{" "}
              {formatBytes(run.historySizeBytes)}
            </span>
          ) : null}
          {detail.chain.previousRunId ? (
            <RunLink
              label="previous run"
              onOpen={() => onOpenRun(detail.chain.previousRunId!)}
            />
          ) : null}
          {detail.chain.nextRunId ? (
            <RunLink
              label="next run"
              onOpen={() => onOpenRun(detail.chain.nextRunId!)}
            />
          ) : null}
        </div>

        {/* No wider than the preview, so the buttons wrap on a narrow page. */}
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
          {typeof streamsUrl === "string" ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
              <a
                href={createUrl({
                  searchParam: execution.workflowId,
                  ...(targetStream ? { streamParam: targetStream } : {}),
                  viewParam: "stream",
                })}
              >
                <Waves />
                Search Streams
              </a>
            </Button>
          ) : null}
          {hasDatabase ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
              <a
                href={createUrl({
                  schemaParam,
                  searchParam: execution.workflowId,
                  tableParam,
                  viewParam: "table",
                })}
              >
                <Database />
                Search Tables
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onClone({
                args: cloneArgs,
                clonedFromWorkflowId: execution.workflowId,
                taskQueue: execution.taskQueue,
                workflowType: execution.workflowType,
              })
            }
          >
            <Play />
            Clone &amp; Start
          </Button>
          <Button variant="outline" size="sm" onClick={onOpen}>
            Inspect
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 @3xl:grid-cols-2 @4xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)] @6xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,3fr)]">
        <StepsBlock
          className="@3xl:col-span-2 @4xl:col-span-1"
          onOpen={onOpen}
          spans={detail.spans}
          totalDurationMs={detail.totalDurationMs}
        />
        <PayloadBlock label="Input" value={detail.input} />
        <OutcomeBlock detail={detail} />
      </div>

      {memoEntries.length > 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <TemporalSectionLabel>Memo</TemporalSectionLabel>
          {memoEntries.map(([key, value]) => (
            <span key={key} className="font-mono text-xs">
              <span className="text-muted-foreground">{key}:</span>{" "}
              {formatMemoValue(value)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RunLink(props: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="rounded-sm underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={props.onOpen}
    >
      {props.label}
    </button>
  );
}

function StepsBlock(props: {
  className?: string;
  onOpen: () => void;
  spans: TemporalGroupedSpan[];
  totalDurationMs: number;
}) {
  const { className, onOpen, spans, totalDurationMs } = props;
  const { hiddenCount, steps } = useMemo(
    () => summarizeRunSteps(spans, MAX_STEPS),
    [spans],
  );
  const scale = useMemo(
    () =>
      buildTimelineScale(
        steps.flatMap((step) =>
          step.spans.map((span) => ({
            durationMs: span.durationMs,
            idle: span.kind === "timer",
            startOffsetMs: span.startOffsetMs,
          })),
        ),
        totalDurationMs,
        { collapseIdle: true },
      ),
    [steps, totalDurationMs],
  );
  const shortenedMs = scale.gaps.reduce((sum, gap) => sum + gap.durationMs, 0);

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
      data-testid="temporal-preview-steps"
    >
      <TemporalSectionLabel>Steps</TemporalSectionLabel>
      {steps.length === 0 ? (
        <p className={cn(paneClass, "font-sans text-muted-foreground")}>
          No Activity, Timer, Child Workflow or message yet.
        </p>
      ) : (
        <div className="flex flex-col rounded-md border border-border bg-card px-3 py-1.5">
          {steps.map((step) => (
            <div
              key={step.key}
              className="grid h-6 grid-cols-[14px_minmax(0,9rem)_minmax(5rem,1fr)_4rem] items-center gap-x-2 text-xs"
              title={`${step.label}: ${
                step.spans.length === 1
                  ? TEMPORAL_SPAN_STATUS[step.status].label
                  : `${step.spans.length} times, ${formatDuration(step.durationMs)} in total`
              }`}
            >
              <TemporalSpanStatusIcon status={step.status} />
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-foreground">{step.label}</span>
                {step.spans.length > 1 ? (
                  <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                    ×{step.spans.length}
                  </span>
                ) : null}
              </span>
              <span className="relative h-full" aria-hidden>
                <span className="absolute inset-x-0 top-1/2 h-px bg-border/70" />
                {scale.gaps.map((gap) => (
                  <span
                    key={gap.startFraction}
                    className="absolute inset-y-0 bg-muted/60"
                    style={{
                      left: `${gap.startFraction * 100}%`,
                      width: `${(gap.endFraction - gap.startFraction) * 100}%`,
                    }}
                  />
                ))}
                {step.spans.map((span) => {
                  const left = scale.toFraction(span.startOffsetMs);
                  const right = scale.toFraction(
                    span.startOffsetMs + span.durationMs,
                  );
                  const isInstant =
                    span.kind === "signal" || span.kind === "update";

                  return isInstant ? (
                    <span
                      key={span.id}
                      className={cn(
                        "absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45",
                        spanBarClasses(span.kind, span.status),
                      )}
                      style={{ left: `${left * 100}%` }}
                    />
                  ) : (
                    <span
                      key={span.id}
                      className={cn(
                        "absolute top-1/2 h-2 min-w-[3px] -translate-y-1/2 rounded-sm",
                        spanBarClasses(span.kind, span.status),
                      )}
                      style={{
                        left: `${left * 100}%`,
                        width: `${Math.max(0, right - left) * 100}%`,
                      }}
                    />
                  );
                })}
              </span>
              <span className="text-right font-mono tabular-nums text-muted-foreground">
                {step.kind === "signal" ? "" : formatDuration(step.durationMs)}
              </span>
            </div>
          ))}
          {hiddenCount > 0 || shortenedMs > 0 ? (
            <div className="flex h-6 items-center justify-between gap-3 font-mono text-2xs text-muted-foreground">
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  className="rounded-sm underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={onOpen}
                >
                  {pluralize(hiddenCount, "more step")}
                </button>
              ) : (
                <span />
              )}
              {shortenedMs > 0 ? (
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2.5 w-4 rounded-[2px] bg-muted"
                  />
                  {formatDuration(shortenedMs)} not to scale
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PayloadBlock(props: { label: string; value: unknown }) {
  const { label, value } = props;
  const encodedNote = encodedPayloadNote(value);
  const text = safeJsonPretty(value);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex h-4 items-center justify-between gap-2">
        <TemporalSectionLabel>{label}</TemporalSectionLabel>
        {value !== undefined && !encodedNote ? (
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Copy ${label}`}
            title={`Copy ${label}`}
            className="-mr-1 h-5 w-5 px-0 text-muted-foreground [&_svg]:size-3"
            onClick={() => {
              void navigator.clipboard.writeText(text);
              toast.success(`Copied ${label}`);
            }}
          >
            <Copy />
          </Button>
        ) : null}
      </div>
      {encodedNote ? (
        <p className={cn(paneClass, "font-sans text-muted-foreground")}>
          Not decoded ({encodedNote}). Studio could not reach the Codec Server.
        </p>
      ) : value === undefined ? (
        <p className={cn(paneClass, "font-sans text-muted-foreground")}>
          No {label.toLowerCase()}.
        </p>
      ) : (
        <TemporalPayloadView className="max-h-[182px] bg-card" value={value} />
      )}
    </div>
  );
}

const NO_RESULT_TEXT: Partial<
  Record<TemporalWorkflowExecution["status"], string>
> = {
  Canceled: "The run was canceled before it returned a result.",
  Completed: "The Workflow returned no value.",
  ContinuedAsNew: "The run handed its work to a new run.",
  Terminated: "The run was terminated before it returned a result.",
  TimedOut: "The run timed out before it returned a result.",
};

function OutcomeBlock(props: { detail: TemporalExecutionDetail }) {
  const { detail } = props;
  const pendingActivities = detail.execution.pendingActivities ?? [];

  if (detail.failure) {
    const failedSpan = detail.spans
      .filter((span) => span.status === "failed" || span.status === "timed-out")
      .at(-1);

    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex h-4 items-center">
          <TemporalSectionLabel>Failure</TemporalSectionLabel>
        </div>
        <div
          className={cn(
            paneClass,
            "border-destructive/40 bg-destructive/10 whitespace-pre-wrap",
          )}
        >
          {failedSpan ? (
            <div className="mb-1 font-sans text-muted-foreground">
              {failedSpan.label}
              {failedSpan.attempt && failedSpan.attempt > 1
                ? `, attempt ${failedSpan.attempt}`
                : ""}
            </div>
          ) : null}
          {formatFailureMessage(detail.failure)}
        </div>
      </div>
    );
  }

  if (pendingActivities.length > 0) {
    const isRetrying = pendingActivities.some((a) => a.lastFailure);

    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex h-4 items-center">
          <TemporalSectionLabel>
            {isRetrying ? "Retrying Activity" : "Pending Activities"}
          </TemporalSectionLabel>
        </div>
        <div
          className={cn(
            paneClass,
            "flex flex-col gap-2",
            isRetrying && "border-amber-500/40 bg-amber-500/10",
          )}
        >
          {pendingActivities.map((activity) => (
            <PendingActivityLine
              key={activity.activityId}
              activity={activity}
            />
          ))}
        </div>
      </div>
    );
  }

  if (detail.result !== undefined) {
    return <PayloadBlock label="Result" value={detail.result} />;
  }

  if (detail.execution.status !== "Running") {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex h-4 items-center">
          <TemporalSectionLabel>Result</TemporalSectionLabel>
        </div>
        <p className={cn(paneClass, "font-sans text-muted-foreground")}>
          {NO_RESULT_TEXT[detail.execution.status] ?? "No result."}
        </p>
      </div>
    );
  }

  const openSpans = detail.spans.filter(
    (span) =>
      span.status === "running" &&
      span.kind !== "workflow" &&
      span.kind !== "workflow-task",
  );

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex h-4 items-center">
        <TemporalSectionLabel>Waiting On</TemporalSectionLabel>
      </div>
      {openSpans.length === 0 ? (
        <p className={cn(paneClass, "font-sans text-muted-foreground")}>
          No Activity, Timer or Child Workflow is open. The Workflow waits for a
          Signal, an Update or its next Workflow Task.
        </p>
      ) : (
        <div className={cn(paneClass, "flex flex-col gap-1")}>
          {openSpans.map((span) => (
            <div key={span.id} className="flex items-baseline gap-2">
              <span className="min-w-0 truncate">
                {span.userSummary ?? span.label}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {timerFireTime(span) ?? (
                  <>started {formatRelativeTime(span.timestamp)}</>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "fires in 4m" for an open Timer. */
function timerFireTime(span: TemporalGroupedSpan): string | null {
  const progress = timerProgress(span, Date.now());

  if (span.kind !== "timer" || !progress) {
    return null;
  }

  return progress.leftMs > 0
    ? `fires ${formatRelativeTime(new Date(progress.firesAtMs).toISOString())}`
    : "due now";
}

function PendingActivityLine(props: { activity: TemporalPendingActivity }) {
  const { activity } = props;
  const nextAttemptMs = activity.nextAttemptScheduleTime
    ? Date.parse(activity.nextAttemptScheduleTime)
    : Number.NaN;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span>{activity.activityType}</span>
        <span className="text-muted-foreground">
          attempt {activity.attempt}
          {activity.maximumAttempts > 0
            ? ` of ${activity.maximumAttempts}`
            : ""}
          {activity.paused
            ? ", paused"
            : nextAttemptMs > Date.now()
              ? `, next ${formatRelativeTime(activity.nextAttemptScheduleTime)}`
              : ""}
        </span>
      </div>
      {activity.lastFailure ? (
        <div className="whitespace-pre-wrap text-foreground">
          {formatFailureMessage(activity.lastFailure)}
        </div>
      ) : null}
    </div>
  );
}
