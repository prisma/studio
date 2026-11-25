import type {
  TemporalExecutionDetail,
  TemporalWorkflowExecution,
} from "@/data/temporal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/components/ui/tooltip";
import { cn } from "@/ui/lib/utils";

import {
  formatBytes,
  formatDuration,
  formatFailureMessage,
  formatRelativeTime,
} from "./temporal-utils";
import { TemporalTime, WorkflowStatusBadge } from "./TemporalPrimitives";
import { compactRunId } from "./TemporalRunBreadcrumb";

/** What the run page knows beyond the run's row: what it was started for and how it ended. */
export type TemporalRunOutcomeDetail = Partial<
  Pick<
    TemporalExecutionDetail,
    "chain" | "codec" | "failure" | "result" | "summary"
  >
>;

type Fact = [label: string, value: React.ReactNode];

/** What a closed run ended with, in one line: its failure, its next run, or the start of its result. */
export function runOutcome(
  execution: TemporalWorkflowExecution,
  detail: TemporalRunOutcomeDetail,
): string | null {
  if (detail.failure) {
    return formatFailureMessage(detail.failure);
  }

  if (execution.status === "ContinuedAsNew" && detail.chain?.nextRunId) {
    return `Continued as run ${compactRunId(detail.chain.nextRunId)}`;
  }

  if (detail.result === undefined) {
    return null;
  }

  const text = JSON.stringify(detail.result) ?? String(detail.result);

  return `Result: ${text.length > 200 ? `${text.slice(0, 200)}…` : text}`;
}

/**
 * A run's status, how long it ran and when it closed. Hovering or focusing it
 * shows what the run was started for, what it last reported, how it ended, and
 * the facts about it. A page that has only the run's row loads the rest when
 * the card opens (`onOpenChange`).
 */
export function TemporalRunStatus(props: {
  className?: string;
  currentDetails?: string;
  detail?: TemporalRunOutcomeDetail;
  /** More facts after the run's own, such as the number of runs of its Workflow ID. */
  extraFacts?: Fact[];
  /** A line above the card, such as "Latest run 01a2…7d75". */
  heading?: string;
  isImported?: boolean;
  /** True while the card waits for `detail`. */
  isLoadingDetail?: boolean;
  onOpenChange?: (open: boolean) => void;
  run: TemporalWorkflowExecution;
}) {
  const {
    className,
    currentDetails,
    detail = {},
    extraFacts = [],
    heading,
    isImported = false,
    isLoadingDetail = false,
    onOpenChange,
    run,
  } = props;
  const outcome = runOutcome(run, detail);
  const facts: Fact[] = [
    ["Type", run.workflowType],
    ["Queue", run.taskQueue],
    ["Started", <TemporalTime key="started" iso={run.startTime} />],
    ...(run.closeTime
      ? ([
          ["Closed", <TemporalTime key="closed" iso={run.closeTime} />],
        ] as Fact[])
      : []),
    ["Duration", formatDuration(run.durationMs)],
    [
      "History",
      `${run.historyLength} events · ${formatBytes(run.historySizeBytes)}`,
    ],
    ...(detail.codec && detail.codec.decoded > 0
      ? ([["Codec", `${detail.codec.decoded} payloads decoded`]] as Fact[])
      : []),
    ...(run.parentWorkflowId
      ? ([["Parent", run.parentWorkflowId]] as Fact[])
      : []),
    ...(isImported ? ([["Source", "Imported history"]] as Fact[]) : []),
    ...extraFacts,
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip onOpenChange={onOpenChange}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 cursor-help items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
            data-testid="temporal-run-status"
          >
            {heading ? <span className="sr-only">{heading}: </span> : null}
            <WorkflowStatusBadge status={run.status} />
            <span className="font-mono text-2xs text-muted-foreground tabular-nums">
              {formatDuration(run.durationMs)}
              {run.closeTime ? ` · ${formatRelativeTime(run.closeTime)}` : null}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          align="end"
          side="bottom"
          className="w-[min(28rem,calc(100vw-2rem))] p-3"
          data-testid="temporal-run-status-card"
        >
          <div className="flex flex-col gap-2">
            {heading ? (
              <p className="text-2xs text-muted-foreground">{heading}</p>
            ) : null}
            {detail.summary ? (
              <p className="font-medium text-foreground">{detail.summary}</p>
            ) : null}
            {currentDetails ? (
              <p className="whitespace-pre-wrap text-muted-foreground">
                <span className="text-foreground">Last reported: </span>
                {currentDetails}
              </p>
            ) : null}
            {outcome ? (
              <p className="break-words font-mono text-2xs text-foreground">
                {outcome}
              </p>
            ) : isLoadingDetail ? (
              <p className="text-2xs text-muted-foreground">
                Loading the result…
              </p>
            ) : null}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt>{label}</dt>
                  <dd className="truncate font-mono text-foreground">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
