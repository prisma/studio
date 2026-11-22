import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type {
  TemporalFollowMode,
  TemporalTaskQueueSummary,
} from "@/data/temporal";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/ui/table";
import {
  useTemporalActions,
  useTemporalTaskQueues,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import { formatDuration, formatRelativeTime } from "./temporal-utils";
import {
  TemporalFollowControl,
  WorkflowStatusBadge,
} from "./TemporalPrimitives";

interface TemporalTaskQueuesViewProps {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
}

export function TemporalTaskQueuesView(props: TemporalTaskQueuesViewProps) {
  const { followMode, namespace, onFollowModeChange, onOpenExecution } = props;

  const { data, isLoading, isError, error, refetch, isFetching } =
    useTemporalTaskQueues({ followMode, namespace });
  const { resetStickyTaskQueue } = useTemporalActions(namespace);
  const [expandedQueue, setExpandedQueue] = useState<string | null>("billing");

  const queues = data?.queues ?? [];

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="temporal-task-queues-view"
    >
      <StudioHeader
        title="Task Queues"
        endContent={
          <div className="flex items-center gap-1.5">
            <TemporalFollowControl
              value={followMode}
              onChange={onFollowModeChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-label="Refresh task queues"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  isFetching && "motion-safe:animate-spin",
                )}
              />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10.5px]">
            {data?.source === "describe-task-queue"
              ? "Live DescribeTaskQueue"
              : "Synthesized from active executions & /v1/load"}
          </Badge>
          {typeof data?.matcherOldestReadyMs === "number" ? (
            <span>
              Matcher oldest ready:{" "}
              <strong className="font-mono text-foreground">
                {formatDuration(data.matcherOldestReadyMs)}
              </strong>
            </span>
          ) : null}
        </div>
        <span className="font-mono">
          {queues.length} queue{queues.length === 1 ? "" : "s"} in {namespace}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-xs text-muted-foreground">
            <p className="font-medium text-destructive">
              {error instanceof Error
                ? error.message
                : "Could not load task queues"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : queues.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-xs text-muted-foreground">
            <Layers className="size-6 opacity-60" />
            <p>No active task queues observed in namespace {namespace}.</p>
          </div>
        ) : (
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-secondary/95 backdrop-blur-xs">
              <TableRow className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                <TableHead className="h-8 w-8 px-3" />
                <TableHead className="h-8 px-2">Queue Name</TableHead>
                <TableHead className="h-8 px-2">Health</TableHead>
                <TableHead className="h-8 px-2 text-right">Running</TableHead>
                <TableHead className="h-8 px-2 text-right">Retrying</TableHead>
                <TableHead className="h-8 px-2 text-right">Failed</TableHead>
                <TableHead className="h-8 px-2 text-right">Schedules</TableHead>
                <TableHead className="h-8 px-2 text-right">
                  {data?.source === "describe-task-queue"
                    ? "Pollers"
                    : "Total Runs"}
                </TableHead>
                <TableHead className="h-8 px-3 text-right">
                  Last Activity
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queues.map((queue) => {
                const isExpanded = expandedQueue === queue.name;
                return (
                  <TaskQueueRow
                    key={queue.name}
                    isExpanded={isExpanded}
                    onOpenExecution={onOpenExecution}
                    onResetSticky={async (workflowId, runId) => {
                      await resetStickyTaskQueue.mutateAsync({
                        runId,
                        workflowId,
                      });
                      toast.success(`Reset sticky queue for ${workflowId}`);
                    }}
                    onToggle={() =>
                      setExpandedQueue((prev) =>
                        prev === queue.name ? null : queue.name,
                      )
                    }
                    queue={queue}
                    source={data?.source ?? "synthesized"}
                  />
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function TaskQueueRow(props: {
  isExpanded: boolean;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  onResetSticky: (workflowId: string, runId: string) => Promise<void>;
  onToggle: () => void;
  queue: TemporalTaskQueueSummary;
  source: "describe-task-queue" | "synthesized";
}) {
  const {
    isExpanded,
    onOpenExecution,
    onResetSticky,
    onToggle,
    queue,
    source,
  } = props;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-secondary/50"
        data-testid={`temporal-queue-row-${queue.name}`}
        onClick={onToggle}
      >
        <TableCell className="px-3 py-2">
          {isExpanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="px-2 py-2 font-mono font-semibold text-foreground">
          {queue.name}
        </TableCell>
        <TableCell className="px-2 py-2">
          <QueueHealthBadge health={queue.health} />
        </TableCell>
        <TableCell className="px-2 py-2 text-right font-mono tabular-nums">
          {queue.activeWorkflowCount}
        </TableCell>
        <TableCell className="px-2 py-2 text-right font-mono tabular-nums">
          <span
            className={cn(
              queue.retryingWorkflowCount > 0 &&
                "font-semibold text-amber-700 dark:text-amber-300",
            )}
          >
            {queue.retryingWorkflowCount}
          </span>
        </TableCell>
        <TableCell className="px-2 py-2 text-right font-mono tabular-nums">
          <span
            className={cn(
              queue.failedWorkflowCount > 0 && "font-semibold text-destructive",
            )}
          >
            {queue.failedWorkflowCount}
          </span>
        </TableCell>
        <TableCell className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
          {queue.scheduleCount}
        </TableCell>
        <TableCell className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
          {source === "describe-task-queue"
            ? queue.pollers.length
            : queue.totalWorkflowCount}
        </TableCell>
        <TableCell className="px-3 py-2 text-right text-[11px] text-muted-foreground">
          {formatRelativeTime(queue.lastActivityTime)}
        </TableCell>
      </TableRow>

      {isExpanded ? (
        <TableRow className="bg-secondary/30 hover:bg-secondary/30">
          <TableCell colSpan={9} className="px-6 py-3">
            <div className="space-y-3">
              {queue.pollers.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Active Pollers ({queue.pollers.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {queue.pollers.map((p) => (
                      <div
                        key={p.identity}
                        className="rounded border border-border bg-card px-2.5 py-1 font-mono text-[11px]"
                      >
                        {p.identity}
                        {p.lastAccessTime
                          ? ` · ${formatRelativeTime(p.lastAccessTime)}`
                          : ""}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Executions on {queue.name} ({queue.workflows.length})
                </div>
                <div className="divide-y divide-border rounded-md border border-border bg-card">
                  {queue.workflows.slice(0, 8).map((wf) => (
                    <div
                      key={`${wf.workflowId}-${wf.runId}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <WorkflowStatusBadge
                          status={wf.status}
                          className="text-[10px]"
                        />
                        <span className="font-medium text-foreground">
                          {wf.workflowType}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {wf.workflowId}
                        </span>
                        {wf.hasRetryingActivity ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
                          >
                            Retrying Activity
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {wf.status === "Running" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() =>
                              void onResetSticky(wf.workflowId, wf.runId)
                            }
                          >
                            <RotateCcw className="mr-1 size-3" />
                            Reset Sticky
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() =>
                            onOpenExecution(wf.workflowId, wf.runId)
                          }
                        >
                          <ExternalLink className="mr-1 size-3" />
                          Inspect
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function QueueHealthBadge(props: {
  health: TemporalTaskQueueSummary["health"];
}) {
  const { health } = props;
  if (health === "stalled") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-destructive/50 bg-destructive/10 text-[10.5px] text-destructive"
      >
        <AlertTriangle className="size-2.5" />
        Stalled
      </Badge>
    );
  }
  if (health === "retrying" || health === "backlogged") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/50 bg-amber-500/10 text-[10.5px] text-amber-700 dark:text-amber-300"
      >
        <AlertTriangle className="size-2.5" />
        {health === "retrying" ? "Retrying" : "Backlogged"}
      </Badge>
    );
  }
  if (health === "healthy") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-border bg-secondary/70 text-[10.5px] text-foreground"
      >
        <Check className="size-2.5 text-prism-cyan-600 dark:text-prism-cyan-400" />
        Healthy
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10.5px] text-muted-foreground">
      Idle
    </Badge>
  );
}
