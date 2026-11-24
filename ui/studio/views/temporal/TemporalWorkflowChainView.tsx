import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Play,
  RefreshCw,
  Waypoints,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  TemporalFollowMode,
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
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
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useTemporalWorkflows } from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import {
  formatBytes,
  formatDuration,
  isShortcutBlockedTarget,
  pluralize,
} from "./temporal-utils";
import {
  TemporalFollowControl,
  temporalIconScale,
  temporalTableHeadClass,
  TemporalTime,
  TemporalTimeFormatControl,
  WorkflowStatusBadge,
  WorkflowStatusIcon,
  workflowStatusLabel,
} from "./TemporalPrimitives";
import { quoteFilterValue } from "./TemporalRunBreadcrumb";
import type { TemporalStartPreset } from "./TemporalStartSheet";

const PAGE_SIZE = 100;

const STATUS_ORDER: TemporalWorkflowStatus[] = [
  "Running",
  "Paused",
  "Failed",
  "TimedOut",
  "Completed",
  "ContinuedAsNew",
  "Canceled",
  "Terminated",
];

const STATUS_DOT: Record<TemporalWorkflowStatus, string> = {
  Canceled: "bg-muted-foreground/60",
  Completed: "bg-prism-cyan-600 dark:bg-prism-cyan-400",
  ContinuedAsNew: "bg-prism-cyan-600/70 dark:bg-prism-cyan-400/70",
  Failed: "bg-destructive",
  Paused: "bg-amber-600 dark:bg-amber-400",
  Running: "bg-prism-cyan-500 ring-2 ring-prism-cyan-400/35",
  Terminated: "bg-muted-foreground/60",
  TimedOut: "bg-amber-600 dark:bg-amber-400",
  Unspecified: "bg-muted-foreground/50",
};

const linkClassName =
  "rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export interface TemporalWorkflowChainViewProps {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  onOpenStart: (preset?: TemporalStartPreset | null) => void;
  workflowId: string;
}

/**
 * The middle level of the Temporal hierarchy: every Run sharing one Workflow ID
 * (its Workflow Execution Chain), ordered newest first.
 */
export function TemporalWorkflowChainView(
  props: TemporalWorkflowChainViewProps,
) {
  const {
    followMode,
    namespace,
    onFollowModeChange,
    onOpenExecution,
    onOpenStart,
    workflowId,
  } = props;
  const { createUrl } = useNavigation();
  const [pageTokens, setPageTokens] = useState<string[]>([""]);
  const [statusFilter, setStatusFilter] =
    useState<TemporalWorkflowStatus | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    setPageTokens([""]);
    setStatusFilter(null);
    setFocusedIndex(0);
  }, [namespace, workflowId]);

  const pageIndex = pageTokens.length - 1;
  const pageToken = pageTokens[pageIndex] ?? "";
  const idFilter = `WorkflowId = ${quoteFilterValue(workflowId)}`;

  const { data, error, isError, isFetching, isLoading, refetch } =
    useTemporalWorkflows({
      followMode: followMode === "paused" ? "paused" : "live",
      includeCounts: false,
      namespace,
      pageSize: PAGE_SIZE,
      pageToken,
      query: idFilter,
      sort: { direction: "desc", field: "StartTime" },
    });

  const runs = useMemo(() => data?.executions ?? [], [data?.executions]);
  const totalRuns = Math.max(
    data?.sorted?.rowCount ?? 0,
    pageIndex * PAGE_SIZE + runs.length,
  );
  const nextPageToken = data?.nextPageToken;
  const isSinglePage = pageIndex === 0 && !nextPageToken;
  const latestRun = pageIndex === 0 ? runs[0] : undefined;
  const oldestLoadedRun = runs.at(-1);
  const workflowType = runs[0]?.workflowType;
  const taskQueue = runs[0]?.taskQueue;

  const statusCounts = useMemo(() => {
    const counts = new Map<TemporalWorkflowStatus, number>();

    for (const run of runs) {
      counts.set(run.status, (counts.get(run.status) ?? 0) + 1);
    }

    return counts;
  }, [runs]);

  const activeStatuses = useMemo(
    () => STATUS_ORDER.filter((status) => (statusCounts.get(status) ?? 0) > 0),
    [statusCounts],
  );

  const visibleRuns = useMemo(
    () =>
      statusFilter ? runs.filter((run) => run.status === statusFilter) : runs,
    [runs, statusFilter],
  );

  useEffect(() => {
    setFocusedIndex((prev) =>
      visibleRuns.length === 0 ? 0 : Math.min(prev, visibleRuns.length - 1),
    );
  }, [visibleRuns.length]);

  useEffect(() => {
    if (visibleRuns.length === 0) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlockedTarget(event.target, event.key)) {
        return;
      }

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((i) => Math.min(visibleRuns.length - 1, i + 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((i) => Math.max(0, i - 1));
      } else if (event.key === "Enter") {
        const current = visibleRuns[focusedIndex];

        if (current) {
          event.preventDefault();
          onOpenExecution(current.workflowId, current.runId);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedIndex, onOpenExecution, visibleRuns]);

  const totalEventsLoaded = useMemo(
    () => runs.reduce((sum, run) => sum + run.historyLength, 0),
    [runs],
  );

  const workflowsUrl = (filter: string) =>
    createUrl({
      searchParam: filter,
      temporalNsParam: namespace,
      temporalSectionParam: "workflows",
      viewParam: "temporal",
    });

  const typeDiagramUrl = workflowType
    ? createUrl({
        temporalNsParam: namespace,
        temporalSectionParam: "types",
        temporalTypeParam: workflowType,
        viewParam: "temporal",
      })
    : null;

  const executionsUrl = workflowsUrl(idFilter);

  const openStartForChain = () =>
    onOpenStart({
      ...(taskQueue ? { taskQueue } : {}),
      workflowId,
      ...(workflowType ? { workflowType } : {}),
    });

  const breadcrumb = (
    <ChainBreadcrumb
      typeDiagramUrl={typeDiagramUrl}
      typeExecutionsUrl={
        workflowType
          ? workflowsUrl(`WorkflowType = ${quoteFilterValue(workflowType)}`)
          : null
      }
      workflowId={workflowId}
      workflowType={workflowType}
    />
  );

  const runUrl = (runId: string) =>
    createUrl({
      temporalNsParam: namespace,
      temporalRunParam: runId,
      temporalSectionParam: "workflows",
      temporalWfParam: workflowId,
      viewParam: "temporal",
    });

  const pageStart = pageIndex * PAGE_SIZE + 1;
  const pageEnd = pageIndex * PAGE_SIZE + runs.length;

  return (
    <div
      className={cn(
        "@container flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-workflow-chain"
    >
      <StudioHeader
        endContent={
          <>
            <TemporalFollowControl
              onChange={onFollowModeChange}
              value={followMode}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-8 px-0"
              aria-label="Refresh runs"
              title="Refresh runs"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn(isFetching && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={openStartForChain}
            >
              <Play />
              Start Execution
            </Button>
            {latestRun ? (
              <Button
                size="sm"
                className="shrink-0 whitespace-nowrap"
                onClick={() => onOpenExecution(workflowId, latestRun.runId)}
              >
                Open Latest Run
                <ArrowRight />
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <div className="min-w-0 @max-3xl:hidden">{breadcrumb}</div>
          <span className="hidden min-w-0 truncate font-mono text-xs font-medium text-foreground @max-3xl:inline">
            {workflowId}
          </span>
          {latestRun ? (
            <WorkflowStatusBadge
              status={latestRun.status}
              className="shrink-0"
            />
          ) : null}
        </div>
      </StudioHeader>

      <div className="border-b border-border px-4 py-1.5 @3xl:hidden">
        {breadcrumb}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        {isLoading ? (
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <SummaryFact label="Namespace" value={namespace} />
            {taskQueue ? <SummaryFact label="Queue" value={taskQueue} /> : null}
            <SummaryFact
              label="Runs"
              value={totalRuns.toLocaleString("en-US")}
            />
            {runs.length > 0 ? (
              <SummaryFact
                label={isSinglePage ? "Total events" : "Events on page"}
                value={totalEventsLoaded.toLocaleString("en-US")}
              />
            ) : null}
            {isSinglePage && oldestLoadedRun ? (
              <div className="flex items-baseline gap-1.5">
                <dt>First run</dt>
                <dd className="font-mono text-foreground">
                  <TemporalTime iso={oldestLoadedRun.startTime} />
                </dd>
              </div>
            ) : null}
          </dl>
        )}
        <a
          className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          data-testid="temporal-chain-open-executions"
          href={executionsUrl}
        >
          Open in Executions
        </a>
      </div>

      {activeStatuses.length > 1 ? (
        <div
          className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-1.5 text-xs"
          data-testid="temporal-chain-status-filter"
          role="group"
          aria-label="Filter runs by status"
        >
          <button
            type="button"
            aria-pressed={statusFilter === null}
            onClick={() => setStatusFilter(null)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              statusFilter === null
                ? "border-foreground/30 bg-muted font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            All
            <span className="font-mono text-2xs tabular-nums">
              {runs.length.toLocaleString("en-US")}
            </span>
          </button>
          {activeStatuses.map((status) => {
            const count = statusCounts.get(status) ?? 0;
            const isSelected = statusFilter === status;

            return (
              <button
                key={status}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setStatusFilter(isSelected ? null : status)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  isSelected
                    ? "border-foreground/30 bg-muted font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <WorkflowStatusIcon status={status} />
                {workflowStatusLabel(status)}
                <span className="font-mono text-2xs tabular-nums">
                  {count.toLocaleString("en-US")}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <p className="font-medium text-destructive">
              {error instanceof Error
                ? error.message
                : "Could not load runs for this Workflow ID"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted-foreground">
            <p>
              No executions found for Workflow ID{" "}
              <code className="font-mono text-foreground">{workflowId}</code> in
              namespace{" "}
              <code className="font-mono text-foreground">{namespace}</code>.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={openStartForChain}>
                <Play />
                Start Execution
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={workflowsUrl("")}>Open Executions</a>
              </Button>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(temporalTableHeadClass, "w-28 pl-4")}>
                  Run
                </TableHead>
                <TableHead className={temporalTableHeadClass}>Run ID</TableHead>
                <TableHead className={temporalTableHeadClass}>Status</TableHead>
                <TableHead className={temporalTableHeadClass}>
                  Started
                </TableHead>
                <TableHead className={temporalTableHeadClass}>Closed</TableHead>
                <TableHead className={cn(temporalTableHeadClass, "text-right")}>
                  Duration
                </TableHead>
                <TableHead className={cn(temporalTableHeadClass, "text-right")}>
                  Events
                </TableHead>
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden text-right @3xl:table-cell",
                  )}
                >
                  Size
                </TableHead>
                <TableHead className="w-8 pr-3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRuns.map((run, visibleIndex) => {
                const indexInPage = runs.indexOf(run);
                const runNumber =
                  totalRuns - (pageIndex * PAGE_SIZE + indexInPage);
                const isLatest = pageIndex === 0 && indexInPage === 0;
                const isFirstVisible = visibleIndex === 0;
                const isLastVisible = visibleIndex === visibleRuns.length - 1;
                const isFocused = focusedIndex === visibleIndex;

                return (
                  <ChainRunRow
                    key={run.runId}
                    isFirst={isFirstVisible}
                    isFocused={isFocused}
                    isLast={isLastVisible}
                    isLatest={isLatest}
                    onFocus={() => setFocusedIndex(visibleIndex)}
                    onOpen={() => onOpenExecution(run.workflowId, run.runId)}
                    run={run}
                    runHref={runUrl(run.runId)}
                    runNumber={runNumber}
                    showChainRail={statusFilter === null}
                  />
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {runs.length > 0 ? (
            <span className="tabular-nums">
              {statusFilter
                ? `Showing ${visibleRuns.length.toLocaleString("en-US")} ${workflowStatusLabel(statusFilter).toLowerCase()} of ${pluralize(runs.length, "loaded run")}`
                : isSinglePage
                  ? `${pluralize(runs.length, "run")} total`
                  : `Runs ${pageStart.toLocaleString("en-US")}–${pageEnd.toLocaleString("en-US")} of ${totalRuns.toLocaleString("en-US")}`}
            </span>
          ) : (
            <span>0 runs</span>
          )}
          {!isSinglePage ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="xs"
                aria-label="Previous page"
                disabled={pageIndex === 0}
                onClick={() => {
                  setStatusFilter(null);
                  setPageTokens((prev) => prev.slice(0, -1));
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="xs"
                aria-label="Next page"
                disabled={!nextPageToken}
                onClick={() => {
                  if (nextPageToken) {
                    setStatusFilter(null);
                    setPageTokens((prev) => [...prev, nextPageToken]);
                  }
                }}
              >
                <ChevronRight />
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-2xs @2xl:inline">
            j/k move · Enter inspect
          </span>
          <TemporalTimeFormatControl className="h-6" />
        </div>
      </div>
    </div>
  );
}

function ChainBreadcrumb(props: {
  typeDiagramUrl: string | null;
  typeExecutionsUrl: string | null;
  workflowId: string;
  workflowType?: string;
}) {
  const { typeDiagramUrl, typeExecutionsUrl, workflowId, workflowType } = props;

  return (
    <nav
      aria-label="Where this Workflow ID is"
      className="flex min-w-0 items-center gap-1.5"
      data-testid="temporal-chain-breadcrumb"
    >
      {workflowType && typeExecutionsUrl ? (
        <>
          <span className="flex min-w-0 shrink-0 items-center gap-0.5 font-sans text-sm font-semibold text-foreground">
            <a
              className={linkClassName}
              data-testid="temporal-chain-crumb-type"
              href={typeExecutionsUrl}
              title={`Workflow Type ${workflowType}: open its executions`}
            >
              {workflowType}
            </a>
            {typeDiagramUrl ? (
              <Button
                asChild
                variant="ghost"
                size="xs"
                className="w-6 px-0 text-muted-foreground"
              >
                <a
                  aria-label={`Open the diagram of ${workflowType}`}
                  href={typeDiagramUrl}
                  title={`Open the diagram of ${workflowType}`}
                >
                  <Waypoints />
                </a>
              </Button>
            ) : null}
          </span>
          <ChevronRight
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground/70"
          />
        </>
      ) : null}

      <span className="flex min-w-0 items-center gap-0.5 font-mono text-xs font-medium text-foreground">
        <span aria-current="page" className="truncate" title={workflowId}>
          {workflowId}
        </span>
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Copy workflow ID ${workflowId}`}
          title={`Copy workflow ID ${workflowId}`}
          className="w-6 shrink-0 px-0 text-muted-foreground"
          onClick={() => {
            void navigator.clipboard.writeText(workflowId);
            toast.success("Copied Workflow ID");
          }}
        >
          <Copy />
        </Button>
      </span>
    </nav>
  );
}

function SummaryFact(props: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt>{props.label}</dt>
      <dd className="font-mono tabular-nums text-foreground">{props.value}</dd>
    </div>
  );
}

function ChainRunRow(props: {
  isFirst: boolean;
  isFocused: boolean;
  isLast: boolean;
  isLatest: boolean;
  onFocus: () => void;
  onOpen: () => void;
  run: TemporalWorkflowExecution;
  runHref: string;
  runNumber: number;
  showChainRail: boolean;
}) {
  const {
    isFirst,
    isFocused,
    isLast,
    isLatest,
    onFocus,
    onOpen,
    run,
    runHref,
    runNumber,
    showChainRail,
  } = props;
  const shortRunId = run.runId.slice(0, 8);
  const isOpen = run.status === "Running" || run.status === "Paused";

  return (
    <TableRow
      data-focused={isFocused ? "true" : undefined}
      data-testid={`temporal-chain-row-${run.runId}`}
      onClick={onOpen}
      onMouseEnter={onFocus}
      className={cn(
        "group cursor-pointer text-xs transition-colors",
        isFocused && "bg-muted/40",
      )}
    >
      <TableCell className="relative py-2 pl-4">
        {showChainRail && !isFirst ? (
          <span
            aria-hidden
            data-testid="temporal-chain-rail"
            className="pointer-events-none absolute top-0 bottom-1/2 left-[22px] w-px -translate-x-1/2 bg-border"
          />
        ) : null}
        {showChainRail && !isLast ? (
          <span
            aria-hidden
            data-testid="temporal-chain-rail"
            className="pointer-events-none absolute top-1/2 bottom-0 left-[22px] w-px -translate-x-1/2 bg-border"
          />
        ) : null}
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="relative flex h-5 w-3 shrink-0 items-center justify-center"
          >
            <span
              className={cn(
                "relative z-10 size-2 rounded-full",
                STATUS_DOT[run.status],
              )}
            />
          </span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            #{runNumber.toLocaleString("en-US")}
          </span>
          {isLatest ? (
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-2xs font-normal"
            >
              Latest
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-1">
          <a
            href={runHref}
            className={cn(linkClassName, "font-mono text-foreground")}
            title={run.runId}
            onClick={(event) => {
              event.stopPropagation();
              if (
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey &&
                event.button === 0
              ) {
                event.preventDefault();
                onOpen();
              }
            }}
          >
            {shortRunId}
          </a>
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Copy run ID ${run.runId}`}
            title={`Copy run ID ${run.runId}`}
            className="w-6 px-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              void navigator.clipboard.writeText(run.runId);
              toast.success("Copied Run ID");
            }}
          >
            <Copy />
          </Button>
        </div>
      </TableCell>
      <TableCell className="py-2">
        <WorkflowStatusBadge status={run.status} />
      </TableCell>
      <TableCell className="py-2 text-muted-foreground">
        <TemporalTime iso={run.startTime} />
      </TableCell>
      <TableCell className="py-2 text-muted-foreground">
        {run.closeTime ? (
          <TemporalTime iso={run.closeTime} />
        ) : isOpen ? (
          <span>In progress</span>
        ) : (
          <span>—</span>
        )}
      </TableCell>
      <TableCell className="py-2 text-right font-mono tabular-nums text-muted-foreground">
        {formatDuration(run.durationMs)}
      </TableCell>
      <TableCell className="py-2 text-right font-mono tabular-nums text-muted-foreground">
        {run.historyLength.toLocaleString("en-US")}
      </TableCell>
      <TableCell className="hidden py-2 text-right font-mono tabular-nums text-muted-foreground @3xl:table-cell">
        {formatBytes(run.historySizeBytes)}
      </TableCell>
      <TableCell className="py-2 pr-3 text-right">
        <ChevronRight
          aria-hidden
          className="ml-auto size-3.5 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100"
        />
      </TableCell>
    </TableRow>
  );
}
