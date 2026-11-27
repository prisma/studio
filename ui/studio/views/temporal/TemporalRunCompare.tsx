import { useState } from "react";

import type { TemporalExecutionDetail } from "@/data/temporal";
import { alignRunSpans, diffRunInputs } from "@/data/temporal/run-compare";
import { Button } from "@/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  useTemporalWorkflowDetail,
  useTemporalWorkflows,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { formatDuration, formatRelativeTime } from "./temporal-utils";
import {
  TEMPORAL_SPAN_STATUS,
  TemporalSectionLabel,
  TemporalStatusBadge,
} from "./TemporalPrimitives";
import { quoteFilterValue } from "./TemporalRunBreadcrumb";

/** Compares a failed or timed-out run against a recent Completed run of the same type. */
export function TemporalRunCompare(props: {
  detail: TemporalExecutionDetail;
  namespace: string;
  onOpenExecution: (workflowId: string, runId?: string) => void;
}) {
  const { detail, namespace, onOpenExecution } = props;
  const { execution } = detail;
  const candidatesQuery = useTemporalWorkflows({
    followMode: "paused",
    includeCounts: false,
    namespace,
    pageSize: 8,
    query: `WorkflowType = ${quoteFilterValue(execution.workflowType)} AND ExecutionStatus = "Completed"`,
    sort: { direction: "desc", field: "StartTime" },
  });
  const candidates = (candidatesQuery.data?.executions ?? []).filter(
    (run) => run.runId !== execution.runId,
  );
  const [chosenRunId, setChosenRunId] = useState<string | null>(null);
  const baselineRun =
    (chosenRunId
      ? candidates.find((run) => run.runId === chosenRunId)
      : undefined) ??
    candidates[0] ??
    null;

  const baselineDetail = useTemporalWorkflowDetail({
    enabled: baselineRun !== null,
    followMode: "paused",
    namespace,
    runId: baselineRun?.runId,
    workflowId: baselineRun?.workflowId,
  });

  if (candidatesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!baselineRun) {
    return (
      <p
        className="p-10 text-center text-xs text-muted-foreground"
        data-testid="temporal-compare-empty"
      >
        No completed run of{" "}
        <span className="font-mono text-foreground">
          {execution.workflowType}
        </span>{" "}
        was found to compare against.
      </p>
    );
  }

  if (baselineDetail.isLoading || !baselineDetail.data) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const inputDiffs = diffRunInputs(detail.input, baselineDetail.data.input);
  const changedInputs = inputDiffs.filter((row) => row.kind !== "same");
  const alignedSpans = alignRunSpans(detail.spans, baselineDetail.data.spans);

  return (
    <div
      className="flex flex-col gap-5 p-4 text-xs"
      data-testid="temporal-run-compare"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>Comparing against completed run</span>
          {candidates.length > 1 ? (
            <Select
              value={baselineRun.runId}
              onValueChange={(value) => setChosenRunId(value)}
            >
              <SelectTrigger
                aria-label="Baseline completed run"
                className="h-7 w-auto min-w-44 font-mono text-xs text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((run) => (
                  <SelectItem
                    key={run.runId}
                    value={run.runId}
                    className="font-mono text-xs"
                  >
                    {run.workflowId} ({formatRelativeTime(run.startTime)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-mono font-medium text-foreground">
              {baselineRun.workflowId}
            </span>
          )}
          <span>
            took{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatDuration(baselineRun.durationMs)}
            </span>{" "}
            vs{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatDuration(execution.durationMs)}
            </span>
          </span>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={() =>
            onOpenExecution(baselineRun.workflowId, baselineRun.runId)
          }
        >
          Open Baseline
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <TemporalSectionLabel>
          Input Differences ({changedInputs.length})
        </TemporalSectionLabel>
        {changedInputs.length === 0 ? (
          <p className="text-muted-foreground">
            Both runs received the same input.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border [&>*+*]:border-t [&>*+*]:border-border/60">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 bg-muted/30 px-3 py-1.5 font-medium text-muted-foreground">
              <span>Field</span>
              <span>This Run ({execution.status})</span>
              <span>Completed Baseline</span>
            </div>
            {changedInputs.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-3 py-1.5 font-mono"
              >
                <span className="truncate font-medium text-foreground">
                  {row.key}
                </span>
                <span
                  className={cn(
                    "truncate",
                    row.kind === "only-baseline"
                      ? "text-muted-foreground"
                      : "text-destructive",
                  )}
                >
                  {row.kind === "only-baseline"
                    ? "—"
                    : JSON.stringify(row.current)}
                </span>
                <span
                  className={cn(
                    "truncate",
                    row.kind === "only-current"
                      ? "text-muted-foreground"
                      : "text-foreground",
                  )}
                >
                  {row.kind === "only-current"
                    ? "—"
                    : JSON.stringify(row.baseline)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <TemporalSectionLabel>Step-by-Step Comparison</TemporalSectionLabel>
        <div className="overflow-hidden rounded-md border border-border [&>*+*]:border-t [&>*+*]:border-border/60">
          <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] gap-3 bg-muted/30 px-3 py-1.5 font-medium text-muted-foreground">
            <span>#</span>
            <span>This Run</span>
            <span>Completed Baseline</span>
          </div>
          {alignedSpans.map((row) => {
            const isDiff = row.kind !== "match";
            return (
              <div
                key={row.index}
                className={cn(
                  "grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-3 py-2",
                  isDiff && "bg-destructive/5",
                )}
              >
                <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                  {row.index + 1}
                </span>
                <SpanCell span={row.current} />
                <SpanCell span={row.baseline} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SpanCell(props: { span?: TemporalExecutionDetail["spans"][number] }) {
  const { span } = props;

  if (!span) {
    return <span className="text-muted-foreground">Did not reach</span>;
  }

  const status = TEMPORAL_SPAN_STATUS[span.status];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="truncate font-mono font-medium text-foreground">
        {span.label}
      </span>
      <TemporalStatusBadge icon={status.icon} tone={status.tone}>
        {status.label}
      </TemporalStatusBadge>
      <span className="font-mono text-2xs tabular-nums text-muted-foreground">
        {formatDuration(span.durationMs)}
      </span>
    </div>
  );
}
