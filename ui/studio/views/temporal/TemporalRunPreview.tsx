import {
  ChevronRight,
  Copy,
  Database,
  MoreHorizontal,
  Play,
  Waves,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import type {
  TemporalExecutionDetail,
  TemporalGroupedSpan,
  TemporalPendingActivity,
  TemporalWorkflowExecution,
} from "@/data/temporal";
import {
  summarizeRunSteps,
  type TemporalRunStep,
} from "@/data/temporal/run-steps";
import { buildTimelineScale } from "@/data/temporal/timeline-scale";
import {
  isOpenStatus,
  resultOutcome,
  summaryOf,
  timerProgress,
} from "@/data/temporal/type-map";
import { Button } from "@/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
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
  safeJsonPretty,
  spanBarClasses,
} from "./temporal-utils";
import { payloadSizeText, TemporalPayloadView } from "./TemporalPayloadView";
import {
  TEMPORAL_SPAN_STATUS,
  TemporalSectionLabel,
  TemporalSpanStatusIcon,
} from "./TemporalPrimitives";
import type { TemporalStartPreset } from "./TemporalStartSheet";

/** The fold-out shows this many steps; the run page shows the rest. */
const MAX_STEPS = 8;

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

/** A memo value, or a note when the Codec Server did not decode it. */
function memoValue(value: unknown): unknown {
  const note = encodedPayloadNote(value);

  return note ? `not decoded (${note})` : value;
}

/**
 * What a row of the Workflows grid shows when it is unfolded: how the run
 * ended, its steps on a small timeline named as the Workflow Type's diagram
 * names them, its input and memo, and its result or failure. The row above
 * already shows the status, the times and the history size. Non-standard UI:
 * see `Architecture/non-standard-ui.md`, "Temporal Run Preview".
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
  const cloneArgs =
    detail.input === undefined
      ? []
      : Array.isArray(detail.input)
        ? detail.input
        : [detail.input];
  const outcome =
    run.status === "Completed" ? resultOutcome(detail.result) : undefined;
  const outcomeBlock = <OutcomeBlock detail={detail} outcome={outcome} />;
  const hasOutcomeBlock = hasThirdBlock(detail);

  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex items-start justify-between gap-x-6">
        <div className="flex min-h-7 min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          {detail.summary ? (
            <span className="text-sm text-foreground">{detail.summary}</span>
          ) : null}
          {outcome ? (
            <span data-testid="temporal-preview-outcome">
              Ended as{" "}
              <span className="font-mono text-foreground">{outcome.value}</span>
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="w-7 shrink-0 px-0 text-muted-foreground"
              aria-label="Run actions"
              data-testid="temporal-preview-actions"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 [&_[role=menuitem]]:text-xs"
          >
            <DropdownMenuItem
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
              Clone &amp; Start…
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(run.runId);
                toast.success("Copied Run ID");
              }}
            >
              <Copy />
              Copy Run ID
            </DropdownMenuItem>
            {typeof streamsUrl === "string" ? (
              <DropdownMenuItem asChild>
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
              </DropdownMenuItem>
            ) : null}
            {hasDatabase ? (
              <DropdownMenuItem asChild>
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
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-x-4 gap-y-3",
          hasOutcomeBlock
            ? "@3xl:grid-cols-2 @4xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)] @6xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,3fr)]"
            : "@3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        )}
      >
        <StepsBlock
          className={cn(hasOutcomeBlock && "@3xl:col-span-2 @4xl:col-span-1")}
          detail={detail}
          onOpen={onOpen}
        />
        {/* On a narrow page the result comes before the input. */}
        <PayloadBlock
          className="@max-3xl:order-3"
          label="Input"
          memo={run.memo}
          value={detail.input}
        />
        {hasOutcomeBlock ? (
          <div className="min-w-0 @max-3xl:order-2">{outcomeBlock}</div>
        ) : null}
      </div>
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

/** What the duration column of a step says: how long it ran, or what it is doing now. */
function stepTimeText(
  step: TemporalRunStep,
  pending: TemporalPendingActivity[],
): string {
  const open = [...step.spans]
    .reverse()
    .find((span) => span.status === "running" || span.status === "retrying");

  if (step.kind === "signal" || step.kind === "update") {
    return "";
  }

  if (open?.status === "retrying") {
    const activity = pending.find(
      (item) => item.activityId === open.activityId,
    );
    const attempt = activity?.attempt ?? open.attempt;

    return attempt
      ? `try ${attempt}${activity && activity.maximumAttempts > 0 ? ` of ${activity.maximumAttempts}` : ""}`
      : "retrying";
  }

  if (open) {
    return timerFireTime(open) ?? `running ${formatDuration(open.durationMs)}`;
  }

  return formatDuration(step.durationMs);
}

function StepsBlock(props: {
  className?: string;
  detail: TemporalExecutionDetail;
  onOpen: () => void;
}) {
  const { className, detail, onOpen } = props;
  const { spans, totalDurationMs } = detail;
  const pending = detail.execution.pendingActivities ?? [];
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
  const isWaitingForMessage =
    isOpenStatus(detail.execution.status) &&
    !spans.some(
      (span) =>
        (span.status === "running" || span.status === "retrying") &&
        span.kind !== "workflow" &&
        span.kind !== "workflow-task",
    );
  const totalSteps = steps.length + hiddenCount;

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
      data-testid="temporal-preview-steps"
    >
      <TemporalSectionLabel>Steps</TemporalSectionLabel>
      <div className="flex flex-col rounded-md border border-border bg-card px-3 py-1.5">
        {steps.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">
            No Activity, Timer, Child Workflow or message yet.
          </p>
        ) : null}
        {steps.map((step) => (
          <div
            key={step.key}
            className="grid h-6 grid-cols-[14px_minmax(0,3fr)_minmax(3rem,2fr)_5.5rem] items-center gap-x-2 text-xs"
            data-testid="temporal-preview-step"
            title={[
              step.label,
              step.implementation,
              step.spans.length === 1
                ? TEMPORAL_SPAN_STATUS[step.status].label
                : `${step.spans.length} times, ${formatDuration(step.durationMs)} in total`,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <TemporalSpanStatusIcon status={step.status} />
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-foreground">{step.label}</span>
              {step.spans.length > 1 ? (
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  ×{step.spans.length}
                </span>
              ) : null}
              {step.maxAttempt > 1 && step.status !== "retrying" ? (
                <span className="shrink-0 text-2xs text-amber-600 dark:text-amber-400">
                  {step.maxAttempt} tries
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
            <span
              className={cn(
                "truncate text-right font-mono tabular-nums",
                step.status === "retrying"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
              )}
            >
              {stepTimeText(step, pending)}
            </span>
          </div>
        ))}
        {isWaitingForMessage ? (
          <p className="flex h-6 items-center text-xs text-muted-foreground">
            Waiting for a Signal, an Update or its next Workflow Task
          </p>
        ) : null}
        <div className="flex h-6 items-center justify-between gap-3 font-mono text-2xs text-muted-foreground">
          <button
            type="button"
            className="rounded-sm underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpen}
            data-testid="temporal-preview-open"
          >
            {totalSteps > steps.length
              ? `All ${totalSteps} steps`
              : "Open the run"}
          </button>
          {shortenedMs > 0 ? (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-4 rounded-[2px] bg-muted" />
              {formatDuration(shortenedMs)} not to scale
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PayloadBlock(props: {
  className?: string;
  label: string;
  /** Shown folded below the value. */
  memo?: Record<string, unknown>;
  value: unknown;
}) {
  const { className, label, memo, value } = props;
  const encodedNote = encodedPayloadNote(value);
  const text = safeJsonPretty(value);
  const memoEntries = Object.entries(memo ?? {});

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
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
      {memoEntries.length > 0 ? (
        <details className="group text-xs" data-testid="temporal-preview-memo">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
            Memo · {payloadSizeText(memo!)}
          </summary>
          <TemporalPayloadView
            className="mt-1.5 max-h-40 bg-card"
            value={Object.fromEntries(
              memoEntries.map(([key, item]) => [key, memoValue(item)]),
            )}
          />
        </details>
      ) : null}
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

/** Whether the fold-out has a third block: a failure, a retrying Activity's error, or a closed run's result. */
function hasThirdBlock(detail: TemporalExecutionDetail): boolean {
  return (
    Boolean(detail.failure) ||
    (detail.execution.pendingActivities ?? []).some(
      (activity) => activity.lastFailure,
    ) ||
    !isOpenStatus(detail.execution.status)
  );
}

function OutcomeBlock(props: {
  detail: TemporalExecutionDetail;
  outcome: { field: string; value: string } | undefined;
}) {
  const { detail, outcome } = props;
  const retrying = (detail.execution.pendingActivities ?? []).filter(
    (activity) => activity.lastFailure,
  );

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
              {summaryOf(failedSpan) ?? failedSpan.label}
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

  if (retrying.length > 0) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex h-4 items-center">
          <TemporalSectionLabel>Last Error</TemporalSectionLabel>
        </div>
        <div
          className={cn(
            paneClass,
            "flex flex-col gap-2 border-amber-500/40 bg-amber-500/10",
          )}
        >
          {retrying.map((activity) => (
            <PendingActivityLine
              key={activity.activityId}
              activity={activity}
              name={
                summaryOf(
                  detail.spans.find(
                    (span) => span.activityId === activity.activityId,
                  ) ?? ({} as TemporalGroupedSpan),
                ) ?? activity.activityType
              }
            />
          ))}
        </div>
      </div>
    );
  }

  if (detail.result !== undefined) {
    // The field that says how the run ended comes first.
    const value =
      outcome &&
      typeof detail.result === "object" &&
      detail.result !== null &&
      !Array.isArray(detail.result)
        ? { [outcome.field]: outcome.value, ...detail.result }
        : detail.result;

    return <PayloadBlock label="Result" value={value} />;
  }

  if (!isOpenStatus(detail.execution.status)) {
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

  return null;
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

function PendingActivityLine(props: {
  activity: TemporalPendingActivity;
  name: string;
}) {
  const { activity, name } = props;
  const nextAttemptMs = activity.nextAttemptScheduleTime
    ? Date.parse(activity.nextAttemptScheduleTime)
    : Number.NaN;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span>{name}</span>
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
