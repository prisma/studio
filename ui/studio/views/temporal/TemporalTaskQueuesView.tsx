import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type {
  TemporalFollowMode,
  TemporalTaskQueueSummary,
} from "@/data/temporal";
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
import { useNavigation } from "@/ui/hooks/use-navigation";
import {
  useTemporalActions,
  useTemporalTaskQueues,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import { formatDuration } from "./temporal-utils";
import {
  TemporalFollowControl,
  temporalIconScale,
  TemporalLoadError,
  TemporalRefreshError,
  TemporalSectionLabel,
  TemporalStatusBadge,
  temporalTableHeadClass,
  TemporalTime,
  useNow,
  WorkflowStatusBadge,
} from "./TemporalPrimitives";
import { TemporalSparkline } from "./TemporalSparkline";

interface TemporalTaskQueuesViewProps {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
}

export function TemporalTaskQueuesView(props: TemporalTaskQueuesViewProps) {
  const { followMode, namespace, onFollowModeChange, onOpenExecution } = props;

  const query = useTemporalTaskQueues({ followMode, namespace });
  const { dataUpdatedAt, isError, error, refetch, isFetching } = query;
  // The answer for another namespace is not shown under this namespace's name.
  const data = query.isPlaceholderData ? undefined : query.data;
  const { resetStickyTaskQueue } = useTemporalActions(namespace);
  const [expandedQueue, setExpandedQueue] = useState<string | null>(null);
  // Renders again every few seconds, so relative times keep counting while refresh is paused.
  useNow(5_000, true);

  const queues = data?.queues ?? [];
  const asOf =
    data && dataUpdatedAt
      ? new Date(dataUpdatedAt - data.ageMs).toISOString()
      : undefined;

  return (
    <div
      className={cn(
        "@container flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-task-queues-view"
    >
      <StudioHeader
        title="Task Queues"
        endContent={
          <>
            <TemporalFollowControl
              value={followMode}
              onChange={onFollowModeChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-8 px-0"
              aria-label="Refresh Task Queues"
              title="Refresh Task Queues"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
          </>
        }
      ></StudioHeader>

      {data ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            <span className="font-medium tabular-nums text-foreground">
              {queues.length}
            </span>{" "}
            {queues.length === 1 ? "queue" : "queues"}
          </span>
          {typeof data.matcherOldestReadyMs === "number" ? (
            <span className="inline-flex items-center gap-2">
              <span>
                Oldest ready task{" "}
                <span className="font-mono text-foreground">
                  {formatDuration(data.matcherOldestReadyMs)}
                </span>
              </span>
              {data.matcherOldestReadyHistory &&
              data.matcherOldestReadyHistory.length > 0 ? (
                <TemporalSparkline
                  formatValue={(v) => formatDuration(v)}
                  height={18}
                  label="Oldest ready task"
                  times={data.matcherOldestReadyHistory.map((p) => p.at)}
                  tone={data.matcherOldestReadyMs > 5_000 ? "warning" : "info"}
                  values={data.matcherOldestReadyHistory.map((p) => p.ms)}
                  width={56}
                  windowMs={TREND_WINDOW_MS}
                />
              ) : null}
            </span>
          ) : null}
          <span className="ml-auto" data-testid="temporal-queues-counted">
            {data.complete
              ? "Counted from every run in the namespace"
              : data.runningComplete
                ? "Counted from the running runs: the namespace holds more runs than Studio copies"
                : "Counted from the first 1,000 running runs"}
            {data.pollersSupported
              ? ""
              : " · This server does not report which Workers poll a queue"}
          </span>
          {asOf ? (
            <span data-testid="temporal-queues-as-of">
              As of <TemporalTime iso={asOf} />
              {followMode === "paused" ? " · Paused" : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {data && isError ? (
        <TemporalRefreshError error={error} onRetry={() => void refetch()} />
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {!data ? (
          isError ? (
            <TemporalLoadError
              error={error}
              onRetry={() => void refetch()}
              title={
                <>
                  Could not load the Task Queues of namespace{" "}
                  <code className="font-mono">{namespace}</code>.
                </>
              }
            />
          ) : (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )
        ) : queues.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <Layers className="size-6 opacity-60" />
            <p>No active task queues in namespace {namespace}.</p>
          </div>
        ) : (
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-background/95">
              <TableRow className="border-border/70 bg-muted/20 hover:bg-muted/20">
                <TableHead className="h-9 w-12 pr-0 pl-4" />
                <TableHead className={temporalTableHeadClass}>Queue</TableHead>
                <TableHead className={temporalTableHeadClass}>Health</TableHead>
                <TableHead className={cn(temporalTableHeadClass, "text-right")}>
                  Running
                </TableHead>
                <TableHead className={cn(temporalTableHeadClass, "text-right")}>
                  Retrying
                </TableHead>
                <TableHead className={cn(temporalTableHeadClass, "text-right")}>
                  Failed
                </TableHead>
                <TableHead className={cn(temporalTableHeadClass, "text-right")}>
                  Pending Activities
                </TableHead>
                <TableHead
                  className={temporalTableHeadClass}
                  title="Running runs plus pending Activities over the last 5 minutes, sampled while a Studio page shows this screen"
                >
                  Active (5m)
                </TableHead>
                <TableHead className={cn(temporalTableHeadClass, "text-right")}>
                  Schedules
                </TableHead>
                <TableHead className={cn(temporalTableHeadClass, "text-right")}>
                  Total Runs
                </TableHead>
                {data.pollersSupported ? (
                  <TableHead
                    className={cn(temporalTableHeadClass, "text-right")}
                  >
                    Pollers
                  </TableHead>
                ) : null}
                <TableHead
                  className={cn(temporalTableHeadClass, "pr-4 text-right")}
                >
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
                    countsClosedRuns={data.complete}
                    followMode={followMode}
                    namespace={namespace}
                    isExpanded={isExpanded}
                    onOpenExecution={onOpenExecution}
                    onResetSticky={async (workflowId, runId) => {
                      try {
                        await resetStickyTaskQueue.mutateAsync({
                          runId,
                          workflowId,
                        });
                        toast.success(`Reset sticky queue for ${workflowId}`);
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : String(err),
                        );
                      }
                    }}
                    onToggle={() =>
                      setExpandedQueue((prev) =>
                        prev === queue.name ? null : queue.name,
                      )
                    }
                    pollersSupported={data.pollersSupported}
                    queue={queue}
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

function CountCell(props: {
  className?: string;
  emphasize?: boolean;
  /** Opens the counted runs in the Workflows screen. */
  href?: string;
  /** Null when the count is not known. */
  value: number | null;
}) {
  const { href, value } = props;
  const text = value === null ? "—" : value.toLocaleString("en-US");

  return (
    <TableCell
      className={cn(
        "px-2 py-2 text-right font-mono tabular-nums",
        props.emphasize && value !== null && value > 0
          ? "font-medium text-foreground"
          : "text-muted-foreground",
        props.className,
      )}
      title={
        value === null
          ? "Not counted: the namespace holds more runs than Studio copies"
          : undefined
      }
    >
      {href && value ? (
        <a
          className="underline decoration-border underline-offset-2 hover:decoration-foreground"
          href={href}
          onClick={(event) => event.stopPropagation()}
        >
          {text}
        </a>
      ) : (
        text
      )}
    </TableCell>
  );
}

const SHOWN_RUNS = 8;
const TREND_WINDOW_MS = 5 * 60_000;

/** Why a queue has its health, in a few words. Null when the badge says it all. */
export function queueHealthReason(
  queue: TemporalTaskQueueSummary,
  pollersSupported: boolean,
): string | null {
  if (queue.health === "stalled") {
    return pollersSupported
      ? "No Worker polls this queue"
      : "A task has waited over 30 seconds for a Worker";
  }

  if (queue.health === "backlogged") {
    return `${queue.pendingBacklogCount.toLocaleString("en-US")} tasks wait for a Worker`;
  }

  if (queue.health === "retrying") {
    const count = queue.retryingActivityCount || queue.retryingWorkflowCount;

    return count === 1
      ? "1 Activity retrying"
      : `${count.toLocaleString("en-US")} Activities retrying`;
  }

  return null;
}

function TaskQueueRow(props: {
  /** False when the queue is counted from its running runs only. */
  countsClosedRuns: boolean;
  followMode: TemporalFollowMode;
  isExpanded: boolean;
  namespace: string;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  onResetSticky: (workflowId: string, runId: string) => Promise<void>;
  onToggle: () => void;
  pollersSupported: boolean;
  queue: TemporalTaskQueueSummary;
}) {
  const {
    countsClosedRuns,
    followMode,
    isExpanded,
    namespace,
    onOpenExecution,
    onResetSticky,
    onToggle,
    pollersSupported,
    queue,
  } = props;
  const { createUrl } = useNavigation();
  const workflowsUrl = (filter: string) =>
    createUrl({
      searchParam: filter,
      ...(followMode === "paused" ? { temporalFollowParam: "paused" } : {}),
      temporalNsParam: namespace,
      temporalSectionParam: "workflows",
      viewParam: "temporal",
    });
  const queueFilter = `TaskQueue = "${queue.name}"`;
  const runningFilter = `${queueFilter} AND ExecutionStatus = "Running"`;
  // The runs the list below is the newest of, and the filter that finds them.
  const listedCount = countsClosedRuns
    ? (queue.totalWorkflowCount ?? 0)
    : queue.activeWorkflowCount;
  const listedNoun = countsClosedRuns ? "run" : "running run";
  const healthReason = queueHealthReason(queue, pollersSupported);
  const hasNoWorker = pollersSupported && queue.pollers.length === 0;

  return (
    <>
      <TableRow
        className="cursor-pointer border-border/60 hover:bg-muted/30"
        data-testid={`temporal-queue-row-${queue.name}`}
        onClick={onToggle}
      >
        <TableCell className="py-2 pr-0 pl-4">
          <Button
            variant="ghost"
            size="xs"
            className="w-6 px-0 text-muted-foreground"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} queue ${queue.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </TableCell>
        <TableCell className="px-2 py-2">
          <span className="font-mono font-medium whitespace-nowrap text-foreground">
            {queue.name}
          </span>
          <span className="ml-2 text-2xs text-muted-foreground">
            {queue.workflowTypes.length > 0 && queue.activityTypes.length > 0
              ? "Workflows and Activities"
              : queue.activityTypes.length === 0
                ? "Workflows"
                : // Without the closed runs, a queue with no running Workflow may still run Workflows.
                  countsClosedRuns
                  ? "Activities only"
                  : "Activities"}
          </span>
        </TableCell>
        <TableCell className="px-2 py-2">
          <div className="flex flex-col items-start gap-1">
            <QueueHealthBadge health={queue.health} />
            {healthReason ? (
              <span
                className="max-w-44 text-2xs leading-snug whitespace-normal text-muted-foreground"
                data-testid={`temporal-queue-health-reason-${queue.name}`}
              >
                {healthReason}
              </span>
            ) : null}
          </div>
        </TableCell>
        <CountCell
          emphasize
          href={workflowsUrl(runningFilter)}
          value={queue.activeWorkflowCount}
        />
        <CountCell emphasize value={queue.retryingWorkflowCount} />
        <CountCell
          emphasize
          href={workflowsUrl(`${queueFilter} AND ExecutionStatus = "Failed"`)}
          value={queue.failedWorkflowCount}
        />
        <CountCell emphasize value={queue.pendingActivityCount} />
        <TableCell className="px-2 py-2">
          <TemporalSparkline
            formatValue={(v) => `${v} active`}
            height={18}
            label={`Running runs plus pending Activities on ${queue.name}`}
            times={(queue.history ?? []).map((point) => point.at)}
            tone={
              queue.health === "stalled"
                ? "danger"
                : queue.health === "retrying" || queue.health === "backlogged"
                  ? "warning"
                  : "info"
            }
            values={(queue.history ?? []).map(
              (point) => point.activeWorkflowCount + point.pendingActivityCount,
            )}
            width={60}
            windowMs={TREND_WINDOW_MS}
          />
        </TableCell>
        <CountCell value={queue.scheduleCount} />
        <CountCell
          href={workflowsUrl(queueFilter)}
          value={queue.totalWorkflowCount}
        />
        {pollersSupported ? (
          <CountCell
            className={
              queue.health === "stalled" && hasNoWorker
                ? "font-medium text-foreground"
                : undefined
            }
            value={queue.pollers.length}
          />
        ) : null}
        <TableCell className="whitespace-nowrap py-2 pr-4 pl-2 text-right text-muted-foreground">
          <TemporalTime iso={queue.lastActivityTime} />
        </TableCell>
      </TableRow>

      {isExpanded ? (
        <TableRow className="border-border/60 bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={12} className="p-0">
            {/* As wide as the visible screen, not the table, so no part of it scrolls out of view. */}
            <div className="sticky left-0 flex w-[100cqw] max-w-full flex-col gap-4 p-4 whitespace-normal">
              {queue.workflowTypes.length > 0 ||
              queue.activityTypes.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {queue.workflowTypes.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <TemporalSectionLabel>
                        {countsClosedRuns
                          ? "Workflow Types"
                          : "Workflow Types of the Running Runs"}
                      </TemporalSectionLabel>
                      <div className="flex flex-wrap gap-2">
                        {queue.workflowTypes.map((type) => (
                          <span
                            key={type.name}
                            className="rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs"
                          >
                            {type.name}{" "}
                            <span className="tabular-nums text-muted-foreground">
                              {type.count.toLocaleString("en-US")}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {queue.activityTypes.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <TemporalSectionLabel>
                        Activity Types
                      </TemporalSectionLabel>
                      <div className="flex flex-wrap gap-2">
                        {queue.activityTypes.map((type) => (
                          <span
                            key={type}
                            className="rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {pollersSupported ? (
                <div className="flex flex-col gap-2">
                  <TemporalSectionLabel>
                    Active Pollers ({queue.pollers.length})
                  </TemporalSectionLabel>
                  {hasNoWorker ? (
                    <p
                      className="text-muted-foreground"
                      data-testid="temporal-queue-no-worker"
                    >
                      No Worker polls this queue.
                      {queue.activeWorkflowCount > 0 ||
                      queue.pendingActivityCount > 0
                        ? " Its tasks wait until one does."
                        : ""}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {queue.pollers.map((p) => (
                        <div
                          key={`${p.taskQueueType}:${p.identity}`}
                          className="rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs"
                        >
                          {p.identity} · {p.taskQueueType}
                          {p.lastAccessTime ? (
                            <>
                              {" · last poll "}
                              <TemporalTime iso={p.lastAccessTime} />
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <TemporalSectionLabel>
                  {countsClosedRuns ? "Newest Runs" : "Newest Running Runs"}
                </TemporalSectionLabel>
                {queue.workflows.length === 0 ? (
                  <p className="text-muted-foreground">
                    {countsClosedRuns
                      ? "No Workflow has run on this queue yet."
                      : "No Workflow runs on this queue now."}
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-md border border-border bg-card [&>*+*]:border-t [&>*+*]:border-border/60">
                    {queue.workflows.slice(0, SHOWN_RUNS).map((wf) => (
                      <div
                        key={`${wf.workflowId}-${wf.runId}`}
                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <WorkflowStatusBadge status={wf.status} />
                          <span className="font-medium text-foreground">
                            {wf.workflowType}
                          </span>
                          <span className="truncate font-mono text-2xs text-muted-foreground">
                            {wf.workflowId}
                          </span>
                          {wf.hasRetryingActivity ? (
                            <TemporalStatusBadge
                              icon={AlertTriangle}
                              tone="warning"
                            >
                              Retrying Activity
                            </TemporalStatusBadge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="mr-2 text-2xs whitespace-nowrap text-muted-foreground">
                            Started <TemporalTime iso={wf.startTime} />
                          </span>
                          {wf.status === "Running" ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-muted-foreground"
                              title="Make the next workflow task go to any worker, not the one that cached this run"
                              onClick={() =>
                                void onResetSticky(wf.workflowId, wf.runId)
                              }
                            >
                              Reset Sticky
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              onOpenExecution(wf.workflowId, wf.runId)
                            }
                          >
                            Inspect
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {listedCount > SHOWN_RUNS ? (
                  <p
                    className="text-2xs text-muted-foreground"
                    data-testid="temporal-queue-runs-note"
                  >
                    The newest {SHOWN_RUNS} of{" "}
                    {listedCount.toLocaleString("en-US")} {listedNoun}s.{" "}
                    <a
                      className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                      href={workflowsUrl(
                        countsClosedRuns ? queueFilter : runningFilter,
                      )}
                    >
                      Open all {listedCount.toLocaleString("en-US")} in
                      Executions
                    </a>
                  </p>
                ) : null}
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
      <TemporalStatusBadge icon={AlertTriangle} tone="danger">
        Stalled
      </TemporalStatusBadge>
    );
  }

  if (health === "retrying" || health === "backlogged") {
    return (
      <TemporalStatusBadge icon={AlertTriangle} tone="warning">
        {health === "retrying" ? "Retrying" : "Backlogged"}
      </TemporalStatusBadge>
    );
  }

  if (health === "healthy") {
    return (
      <TemporalStatusBadge icon={Check} tone="neutral">
        Healthy
      </TemporalStatusBadge>
    );
  }

  return <TemporalStatusBadge tone="muted">Idle</TemporalStatusBadge>;
}
