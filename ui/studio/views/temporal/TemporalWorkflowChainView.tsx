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
  TemporalWorkflowSort,
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
import {
  useTemporalWorkflowCounts,
  useTemporalWorkflows,
} from "@/ui/hooks/use-temporal";
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

const NEWEST_FIRST: TemporalWorkflowSort = {
  direction: "desc",
  field: "StartTime",
};

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

const cellClassName = "px-2 py-2";

/**
 * A run ID that still tells runs apart when it is cut: run IDs made close in
 * time start with the same characters and differ at the end.
 */
function compactRunId(runId: string): string {
  return runId.length > 14 ? `${runId.slice(0, 8)}…${runId.slice(-4)}` : runId;
}

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
 * (its Workflow Execution Chain), ordered newest first. The caller gives it a
 * key per Workflow ID, so its state starts fresh for each one.
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
  // True once the runs did not fit one page. The server then counts and filters them.
  const [isLongChain, setIsLongChain] = useState(false);
  const [rememberedLatestRun, setRememberedLatestRun] =
    useState<TemporalWorkflowExecution>();

  const pageIndex = pageTokens.length - 1;
  const pageToken = pageTokens[pageIndex] ?? "";
  const idFilter = `WorkflowId = ${quoteFilterValue(workflowId)}`;
  const serverStatusFilter = isLongChain ? statusFilter : null;
  const queryFollowMode = followMode === "paused" ? "paused" : "live";

  const {
    data,
    error,
    isError,
    isFetching,
    isLoading,
    isPlaceholderData,
    refetch,
  } = useTemporalWorkflows({
    followMode: queryFollowMode,
    includeCounts: false,
    namespace,
    pageSize: PAGE_SIZE,
    pageToken,
    query: serverStatusFilter
      ? `${idFilter} AND ExecutionStatus = "${serverStatusFilter}"`
      : idFilter,
    sort: NEWEST_FIRST,
  });
  const chainCounts = useTemporalWorkflowCounts({
    enabled: isLongChain,
    followMode: queryFollowMode,
    namespace,
    query: idFilter,
    sort: NEWEST_FIRST,
  });

  const runs = useMemo(() => data?.executions ?? [], [data?.executions]);
  const nextPageToken = data?.nextPageToken;

  if (!isLongChain && nextPageToken && !isPlaceholderData) {
    setIsLongChain(true);
  }

  const newestLoadedRun =
    pageIndex === 0 && !serverStatusFilter && !isPlaceholderData
      ? runs[0]
      : undefined;

  if (
    newestLoadedRun &&
    (rememberedLatestRun?.runId !== newestLoadedRun.runId ||
      rememberedLatestRun.status !== newestLoadedRun.status)
  ) {
    setRememberedLatestRun(newestLoadedRun);
  }

  const latestRun = newestLoadedRun ?? rememberedLatestRun;
  const workflowType = latestRun?.workflowType;
  const taskQueue = latestRun?.taskQueue;

  // The counts of every run of the ID. Null when the server could not count a long chain.
  const statusCounts = useMemo(() => {
    const counts = new Map<TemporalWorkflowStatus, number>();

    if (!isLongChain) {
      for (const run of runs) {
        counts.set(run.status, (counts.get(run.status) ?? 0) + 1);
      }

      return counts;
    }

    if (!chainCounts.data || chainCounts.data.totalCount === 0) {
      return null;
    }

    for (const status of STATUS_ORDER) {
      const count = chainCounts.data.countsByStatus[status] ?? 0;

      if (count > 0) {
        counts.set(status, count);
      }
    }

    return counts;
  }, [chainCounts.data, isLongChain, runs]);

  const totalRuns = isLongChain
    ? statusCounts
      ? (chainCounts.data?.totalCount ?? null)
      : null
    : runs.length;
  const loadedThrough = pageIndex * PAGE_SIZE + runs.length;

  const filterStatuses = STATUS_ORDER.filter(
    (status) => (statusCounts?.get(status) ?? 0) > 0 || status === statusFilter,
  );

  const visibleRuns = useMemo(
    () =>
      runs
        .map((run, indexInPage) => ({ indexInPage, run }))
        .filter(
          ({ run }) =>
            isLongChain || !statusFilter || run.status === statusFilter,
        ),
    [isLongChain, runs, statusFilter],
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
        const current = visibleRuns[focusedIndex]?.run;

        if (current) {
          event.preventDefault();
          onOpenExecution(current.workflowId, current.runId);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedIndex, onOpenExecution, visibleRuns]);

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

  const openStartForChain = () =>
    onOpenStart({
      ...(taskQueue ? { taskQueue } : {}),
      workflowId,
      ...(workflowType ? { workflowType } : {}),
    });

  const applyStatusFilter = (status: TemporalWorkflowStatus | null) => {
    setStatusFilter(status);

    if (isLongChain) {
      setPageTokens([""]);
    }
  };

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

  // A run's number counts from the oldest, so it needs the place of the row among every run.
  const showRunNumbers = totalRuns !== null && !serverStatusFilter;
  const showChainRail = statusFilter === null;
  const isSinglePage = pageIndex === 0 && !nextPageToken;
  const pageStart = (pageIndex * PAGE_SIZE + 1).toLocaleString("en-US");
  const pageEnd = loadedThrough.toLocaleString("en-US");
  const filteredTotal = statusFilter
    ? statusCounts?.get(statusFilter)
    : undefined;
  const footerText =
    runs.length === 0
      ? "0 runs"
      : statusFilter && !isLongChain
        ? `${visibleRuns.length.toLocaleString("en-US")} ${workflowStatusLabel(statusFilter).toLowerCase()} of ${pluralize(runs.length, "run")}`
        : statusFilter
          ? `${workflowStatusLabel(statusFilter)} runs ${pageStart}–${pageEnd}${filteredTotal ? ` of ${filteredTotal.toLocaleString("en-US")}` : ""}`
          : isSinglePage
            ? pluralize(runs.length, "run")
            : `Runs ${pageStart}–${pageEnd}${totalRuns !== null ? ` of ${totalRuns.toLocaleString("en-US")}` : ""}`;

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
            {/* A narrow page keeps the two actions and drops the rare control. */}
            <span className="contents @max-2xl:hidden">
              <TemporalFollowControl
                onChange={onFollowModeChange}
                value={followMode}
              />
            </span>
            <Button
              variant="outline"
              size="sm"
              className="w-8 px-0"
              aria-label="Refresh runs"
              title="Refresh runs"
              onClick={() => {
                void chainCounts.refetch();
                void refetch();
              }}
              disabled={isFetching}
            >
              <RefreshCw className={cn(isFetching && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={openStartForChain}
              title="Start a new run of this Workflow ID"
            >
              <Play />
              <span className="@max-3xl:sr-only">Start Execution</span>
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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 @max-3xl:hidden">{breadcrumb}</div>
          {latestRun ? (
            <span className="shrink-0" title="Status of the latest run">
              <WorkflowStatusBadge status={latestRun.status} />
            </span>
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
              value={
                totalRuns !== null
                  ? totalRuns.toLocaleString("en-US")
                  : `${loadedThrough.toLocaleString("en-US")}+`
              }
            />
            {!isLongChain && runs.length > 0 ? (
              <div className="flex items-baseline gap-1.5">
                <dt>First run</dt>
                <dd className="font-mono text-foreground">
                  <TemporalTime iso={runs.at(-1)?.startTime} />
                </dd>
              </div>
            ) : null}
          </dl>
        )}
        <a
          className={cn(
            linkClassName,
            "font-medium text-foreground underline underline-offset-2 hover:no-underline",
          )}
          data-testid="temporal-chain-open-executions"
          href={workflowsUrl(idFilter)}
          title="Open these runs in Executions, to filter, sort or select them"
        >
          Open in Executions
        </a>
      </div>

      {filterStatuses.length > 1 || statusFilter ? (
        <div
          className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-1.5 text-xs"
          data-testid="temporal-chain-status-filter"
          role="group"
          aria-label="Filter runs by status"
        >
          <StatusFilterButton
            count={totalRuns ?? undefined}
            isSelected={statusFilter === null}
            label="All"
            onClick={() => applyStatusFilter(null)}
          />
          {filterStatuses.map((status) => (
            <StatusFilterButton
              key={status}
              count={statusCounts?.get(status)}
              isSelected={statusFilter === status}
              label={workflowStatusLabel(status)}
              onClick={() =>
                applyStatusFilter(statusFilter === status ? null : status)
              }
              status={status}
            />
          ))}
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
        ) : runs.length === 0 && !statusFilter ? (
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
                <a
                  href={createUrl({
                    temporalNsParam: namespace,
                    temporalSectionParam: "workflow",
                    viewParam: "temporal",
                  })}
                >
                  Find a Workflow ID
                </a>
              </Button>
            </div>
          </div>
        ) : visibleRuns.length === 0 && statusFilter ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted-foreground">
            <p>
              No run of this Workflow ID is{" "}
              {workflowStatusLabel(statusFilter).toLowerCase()} now.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyStatusFilter(null)}
            >
              Show all runs
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-border/70 bg-muted/20 hover:bg-muted/20">
                <TableHead className={cn(temporalTableHeadClass, "pl-4")}>
                  Run
                </TableHead>
                <TableHead className={temporalTableHeadClass}>Run ID</TableHead>
                <TableHead className={temporalTableHeadClass}>Status</TableHead>
                <TableHead className={temporalTableHeadClass}>
                  Started
                </TableHead>
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden @3xl:table-cell",
                  )}
                >
                  Closed
                </TableHead>
                <TableHead className={cn(temporalTableHeadClass, "text-right")}>
                  Duration
                </TableHead>
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden text-right @2xl:table-cell",
                  )}
                >
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
                <TableHead className="h-9 w-8 pr-3 pl-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRuns.map(({ indexInPage, run }, visibleIndex) => (
                <ChainRunRow
                  key={run.runId}
                  isFirst={visibleIndex === 0}
                  isFocused={focusedIndex === visibleIndex}
                  isLast={visibleIndex === visibleRuns.length - 1}
                  isLatest={run.runId === latestRun?.runId}
                  onFocus={() => setFocusedIndex(visibleIndex)}
                  onOpen={() => onOpenExecution(run.workflowId, run.runId)}
                  run={run}
                  runHref={runUrl(run.runId)}
                  runNumber={
                    showRunNumbers
                      ? totalRuns - (pageIndex * PAGE_SIZE + indexInPage)
                      : null
                  }
                  showChainRail={showChainRail}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="tabular-nums" data-testid="temporal-chain-range">
            {footerText}
          </span>
          {!isSinglePage ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="xs"
                aria-label="Previous page"
                disabled={pageIndex === 0}
                onClick={() => setPageTokens((prev) => prev.slice(0, -1))}
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

function StatusFilterButton(props: {
  /** Undefined when the server could not count the runs. */
  count?: number;
  isSelected: boolean;
  label: string;
  onClick: () => void;
  status?: TemporalWorkflowStatus;
}) {
  const { count, isSelected, label, onClick, status } = props;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isSelected
          ? "border-foreground/30 bg-muted font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {status ? <WorkflowStatusIcon status={status} /> : null}
      {label}
      {count !== undefined ? (
        <span className="font-mono text-2xs tabular-nums">
          {count.toLocaleString("en-US")}
        </span>
      ) : null}
    </button>
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
  /** Null when the place of the run among every run of the ID is not known. */
  runNumber: number | null;
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
  const isOpen = run.status === "Running" || run.status === "Paused";
  // A server reports the size of a history when the run closes.
  const hasHistorySize = run.historyLength > 0;

  return (
    <TableRow
      data-focused={isFocused ? "true" : undefined}
      data-testid={`temporal-chain-row-${run.runId}`}
      onClick={onOpen}
      onMouseEnter={onFocus}
      className={cn(
        "group cursor-pointer border-border/60 text-xs hover:bg-muted/30",
        isFocused && "bg-muted/30",
      )}
    >
      <TableCell className={cn(cellClassName, "relative pl-4")}>
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
        <div className="flex items-center gap-2.5 whitespace-nowrap">
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
          {runNumber !== null ? (
            <span className="font-mono font-medium tabular-nums text-foreground">
              #{runNumber.toLocaleString("en-US")}
            </span>
          ) : null}
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
      <TableCell className={cellClassName}>
        <div className="flex items-center gap-1">
          <a
            href={runHref}
            className={cn(
              linkClassName,
              "font-mono whitespace-nowrap text-foreground",
            )}
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
            <span className="@5xl:hidden">{compactRunId(run.runId)}</span>
            <span className="hidden @5xl:inline">{run.runId}</span>
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
      <TableCell className={cellClassName}>
        <WorkflowStatusBadge status={run.status} />
      </TableCell>
      <TableCell
        className={cn(cellClassName, "whitespace-nowrap text-muted-foreground")}
      >
        <TemporalTime iso={run.startTime} />
      </TableCell>
      <TableCell
        className={cn(
          cellClassName,
          "hidden whitespace-nowrap text-muted-foreground @3xl:table-cell",
        )}
      >
        {run.closeTime ? (
          <TemporalTime iso={run.closeTime} />
        ) : isOpen ? (
          <span>In progress</span>
        ) : (
          <span>—</span>
        )}
      </TableCell>
      <TableCell
        className={cn(
          cellClassName,
          "text-right font-mono whitespace-nowrap tabular-nums text-muted-foreground",
        )}
      >
        {formatDuration(run.durationMs)}
      </TableCell>
      <TableCell
        className={cn(
          cellClassName,
          "hidden text-right font-mono tabular-nums text-muted-foreground @2xl:table-cell",
        )}
      >
        {hasHistorySize ? run.historyLength.toLocaleString("en-US") : "—"}
      </TableCell>
      <TableCell
        className={cn(
          cellClassName,
          "hidden text-right font-mono whitespace-nowrap tabular-nums text-muted-foreground @3xl:table-cell",
        )}
      >
        {hasHistorySize ? formatBytes(run.historySizeBytes) : "—"}
      </TableCell>
      <TableCell className="py-2 pr-3 pl-0 text-right">
        <ChevronRight
          aria-hidden
          className="ml-auto size-3.5 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100"
        />
      </TableCell>
    </TableRow>
  );
}
