import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  RefreshCw,
  Waypoints,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
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
  TemporalLoadError,
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

const ALL_STATUSES = "All";

const HISTORY_SIZE_UNKNOWN_TITLE =
  "The server reports the size of a history when the run closes";

const linkClassName =
  "rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const cellClassName = "px-2 py-2";

/** Marks the row the keyboard is on, as the Executions grid does. */
const focusedCellClassName = "shadow-[inset_2px_0_0_0_var(--foreground)]";

/** The status a `temporalStatus` URL value names, or null for none or an unknown one. */
export function chainStatusOfParam(
  raw: string | null | undefined,
): TemporalWorkflowStatus | null {
  return STATUS_ORDER.find((status) => status === raw) ?? null;
}

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
  onStatusFilterChange: (status: TemporalWorkflowStatus | null) => void;
  /** The status the runs are filtered by. It is in the URL, so the Back button keeps it. */
  statusFilter: TemporalWorkflowStatus | null;
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
    onStatusFilterChange,
    statusFilter,
    workflowId,
  } = props;
  const { createUrl } = useNavigation();
  const tableAreaRef = useRef<HTMLDivElement | null>(null);
  const [pageTokens, setPageTokens] = useState<string[]>([""]);
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
  // Until the first answer, the page knows nothing about the runs and must not say "0".
  const hasAnswer = data !== undefined && !isError;

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

    // The keys move the cursor out of view on a long chain, so the page follows it.
    const moveTo = (nextIndex: number) => {
      setFocusedIndex(nextIndex);
      requestAnimationFrame(() => {
        tableAreaRef.current
          ?.querySelector('tr[data-focused="true"]')
          ?.scrollIntoView({ block: "nearest" });
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlockedTarget(event.target, event.key)) {
        return;
      }

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        moveTo(Math.min(visibleRuns.length - 1, focusedIndex + 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        moveTo(Math.max(0, focusedIndex - 1));
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
    onStatusFilterChange(status);
    setFocusedIndex(0);

    if (isLongChain) {
      setPageTokens([""]);
    }
  };

  const latestRunStatus = latestRun ? (
    <span className="shrink-0" title="Status of the latest run">
      <span className="sr-only">Latest run: </span>
      <WorkflowStatusBadge status={latestRun.status} />
    </span>
  ) : null;

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
  // Without numbers and without the rail, the column would hold only a dot that repeats the status.
  const showRunColumn = showRunNumbers || showChainRail;
  const isSinglePage = pageIndex === 0 && !nextPageToken;
  const pageStart = (pageIndex * PAGE_SIZE + 1).toLocaleString("en-US");
  const pageEnd = loadedThrough.toLocaleString("en-US");
  const filteredTotal = statusFilter
    ? statusCounts?.get(statusFilter)
    : undefined;
  const footerText = !hasAnswer
    ? ""
    : runs.length === 0
      ? "0 runs"
      : statusFilter && !isLongChain
        ? `${visibleRuns.length.toLocaleString("en-US")} ${workflowStatusLabel(statusFilter).toLowerCase()} of ${pluralize(runs.length, "run")}`
        : statusFilter
          ? `${workflowStatusLabel(statusFilter)} runs ${pageStart}–${pageEnd}${filteredTotal ? ` of ${filteredTotal.toLocaleString("en-US")}` : ""}`
          : isSinglePage
            ? pluralize(runs.length, "run")
            : `Runs ${pageStart}–${pageEnd}${totalRuns !== null ? ` of ${totalRuns.toLocaleString("en-US")}` : ""}`;
  const hasRuns = hasAnswer && (runs.length > 0 || statusFilter !== null);

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
            {/* A narrow page drops the control while it reads Live, and keeps it while refresh is paused. */}
            <span
              className={cn(
                "contents",
                followMode !== "paused" && "@max-2xl:hidden",
              )}
            >
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
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={openStartForChain}
              title="Start a new run of this Workflow ID"
            >
              <Plus />
              <span className="@max-3xl:sr-only">Start Execution</span>
            </Button>
            {latestRun ? (
              <Button
                size="sm"
                className="shrink-0 whitespace-nowrap"
                onClick={() => onOpenExecution(workflowId, latestRun.runId)}
              >
                <span>
                  <span className="@max-xl:sr-only">Open </span>
                  Latest Run
                </span>
                <ArrowRight />
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 @max-3xl:hidden">
          <ChainBreadcrumb
            typeDiagramUrl={typeDiagramUrl}
            typeExecutionsUrl={
              workflowType
                ? workflowsUrl(
                    `WorkflowType = ${quoteFilterValue(workflowType)}`,
                  )
                : null
            }
            workflowId={workflowId}
            workflowType={workflowType}
          />
          {latestRunStatus}
        </div>
      </StudioHeader>

      {/* Under 48rem the path and the status have a row of their own, so the header keeps its actions. */}
      <div className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-1.5 @3xl:hidden">
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
        {latestRunStatus}
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
            {taskQueue ? (
              <SummaryFact label="Task Queue" value={taskQueue} />
            ) : null}
            {hasAnswer ? (
              <SummaryFact
                label="Runs"
                value={
                  totalRuns !== null
                    ? totalRuns.toLocaleString("en-US")
                    : `${loadedThrough.toLocaleString("en-US")}+`
                }
              />
            ) : null}
            {hasAnswer && !isLongChain && runs.length > 0 ? (
              <div className="flex items-baseline gap-1.5">
                <dt>First run</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  <TemporalTime iso={runs.at(-1)?.startTime} />
                </dd>
              </div>
            ) : null}
          </dl>
        )}
        {hasRuns ? (
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
        ) : null}
      </div>

      {hasAnswer && (filterStatuses.length > 1 || statusFilter) ? (
        <div
          className="border-b border-border px-4 py-1.5"
          data-testid="temporal-chain-status-filter"
        >
          <ToggleGroup
            type="single"
            aria-label="Filter runs by status"
            className="flex-wrap justify-start gap-1"
            value={statusFilter ?? ALL_STATUSES}
            onValueChange={(next) =>
              applyStatusFilter(
                next === "" || next === ALL_STATUSES
                  ? null
                  : (next as TemporalWorkflowStatus),
              )
            }
          >
            <StatusFilterItem
              count={totalRuns ?? undefined}
              label="All"
              value={ALL_STATUSES}
            />
            {filterStatuses.map((status) => (
              <StatusFilterItem
                key={status}
                count={statusCounts?.get(status)}
                label={workflowStatusLabel(status)}
                status={status}
                value={status}
              />
            ))}
          </ToggleGroup>
        </div>
      ) : null}

      <div ref={tableAreaRef} className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : isError ? (
          <TemporalLoadError
            error={error}
            onRetry={() => void refetch()}
            title={
              <>
                Could not load the runs of{" "}
                <code className="font-mono">{workflowId}</code>.
              </>
            }
          />
        ) : runs.length === 0 && !statusFilter ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted-foreground">
            <p>
              No runs found for Workflow ID{" "}
              <code className="font-mono text-foreground">{workflowId}</code> in
              namespace{" "}
              <code className="font-mono text-foreground">{namespace}</code>.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={openStartForChain}>
                <Plus />
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
              Show All Runs
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-border/70 bg-muted/20 hover:bg-muted/20">
                {showRunColumn ? (
                  <TableHead
                    className={cn(temporalTableHeadClass, "pl-4 @3xl:w-36")}
                  >
                    Run
                  </TableHead>
                ) : null}
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    !showRunColumn && "pl-4",
                  )}
                >
                  Run ID
                </TableHead>
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
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden text-right @xl:table-cell",
                  )}
                >
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
                <TableHead className="hidden h-9 w-8 pr-3 pl-0 @xl:table-cell" />
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
                  onOpen={() => onOpenExecution(run.workflowId, run.runId)}
                  run={run}
                  runHref={runUrl(run.runId)}
                  runNumber={
                    showRunNumbers
                      ? totalRuns - (pageIndex * PAGE_SIZE + indexInPage)
                      : null
                  }
                  showChainRail={showChainRail}
                  showRunColumn={showRunColumn}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="tabular-nums" data-testid="temporal-chain-range">
            {footerText}
          </span>
          {hasAnswer && !isSinglePage ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="xs"
                aria-label="Previous page"
                disabled={pageIndex === 0}
                onClick={() => {
                  setFocusedIndex(0);
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
                    setFocusedIndex(0);
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
          {visibleRuns.length > 0 ? (
            <span className="hidden font-mono text-2xs @2xl:inline">
              j/k move · Enter inspect
            </span>
          ) : null}
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
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5"
      data-testid="temporal-chain-breadcrumb"
    >
      {workflowType && typeExecutionsUrl ? (
        <>
          <span className="flex min-w-0 shrink-0 items-center gap-0.5 font-sans text-sm text-muted-foreground">
            <a
              className={cn(linkClassName, "hover:text-foreground")}
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

      <span className="flex min-w-0 items-center gap-0.5">
        {/* The page is about this Workflow ID, so it is the heading. */}
        <h1
          aria-current="page"
          className="truncate font-mono text-sm font-semibold text-foreground"
          title={workflowId}
        >
          {workflowId}
        </h1>
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

/** One pill of the status filter, in the style of the status presets of the Executions grid. */
function StatusFilterItem(props: {
  /** Undefined when the server could not count the runs. */
  count?: number;
  label: string;
  status?: TemporalWorkflowStatus;
  value: string;
}) {
  const { count, label, status, value } = props;

  return (
    <ToggleGroupItem
      value={value}
      className="h-7 gap-1.5 px-2.5 text-xs font-normal data-[state=on]:bg-secondary data-[state=on]:font-medium"
    >
      {status ? <WorkflowStatusIcon status={status} /> : null}
      <span>{label}</span>
      {count !== undefined ? (
        <span className="font-mono tabular-nums text-muted-foreground">
          {count.toLocaleString("en-US")}
        </span>
      ) : null}
    </ToggleGroupItem>
  );
}

function ChainRunRow(props: {
  isFirst: boolean;
  isFocused: boolean;
  isLast: boolean;
  isLatest: boolean;
  onOpen: () => void;
  run: TemporalWorkflowExecution;
  runHref: string;
  /** Null when the place of the run among every run of the ID is not known. */
  runNumber: number | null;
  showChainRail: boolean;
  showRunColumn: boolean;
}) {
  const {
    isFirst,
    isFocused,
    isLast,
    isLatest,
    onOpen,
    run,
    runHref,
    runNumber,
    showChainRail,
    showRunColumn,
  } = props;
  const isOpen = run.status === "Running" || run.status === "Paused";
  // A server reports the size of a history when the run closes.
  const hasHistorySize = run.historyLength > 0;
  const latestBadge = isLatest ? (
    <Badge variant="secondary" className="px-1.5 py-0 text-2xs font-normal">
      Latest
    </Badge>
  ) : null;

  return (
    <TableRow
      data-focused={isFocused ? "true" : undefined}
      data-testid={`temporal-chain-row-${run.runId}`}
      onClick={onOpen}
      className={cn(
        // The margin keeps a row the keys scroll to clear of the sticky header.
        "group cursor-pointer scroll-mt-9 border-border/60 text-xs hover:bg-muted/30",
        isFocused && "bg-muted/30",
      )}
    >
      {showRunColumn ? (
        <TableCell
          className={cn(
            cellClassName,
            "relative pl-4",
            isFocused && focusedCellClassName,
          )}
        >
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
                  "relative size-2 rounded-full",
                  STATUS_DOT[run.status],
                )}
              />
            </span>
            {runNumber !== null ? (
              <span className="font-mono font-medium tabular-nums text-foreground">
                #{runNumber.toLocaleString("en-US")}
              </span>
            ) : null}
            {latestBadge}
          </div>
        </TableCell>
      ) : null}
      <TableCell
        className={cn(
          cellClassName,
          !showRunColumn && "pl-4",
          !showRunColumn && isFocused && focusedCellClassName,
        )}
      >
        <div className="flex items-center gap-1">
          <a
            href={runHref}
            aria-label={`Run ${run.runId}`}
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
          {showRunColumn ? null : latestBadge}
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
        className={cn(
          cellClassName,
          // An absolute time is long, so a narrow page breaks it after the date instead of pushing Duration out of view.
          "min-w-24 tabular-nums text-muted-foreground @2xl:whitespace-nowrap",
        )}
      >
        <TemporalTime iso={run.startTime} />
      </TableCell>
      <TableCell
        className={cn(
          cellClassName,
          "hidden whitespace-nowrap tabular-nums text-muted-foreground @3xl:table-cell",
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
          "hidden text-right font-mono whitespace-nowrap tabular-nums text-muted-foreground @xl:table-cell",
        )}
      >
        {formatDuration(run.durationMs)}
      </TableCell>
      <TableCell
        className={cn(
          cellClassName,
          "hidden text-right font-mono tabular-nums text-muted-foreground @2xl:table-cell",
        )}
        title={hasHistorySize ? undefined : HISTORY_SIZE_UNKNOWN_TITLE}
      >
        {hasHistorySize ? run.historyLength.toLocaleString("en-US") : "—"}
      </TableCell>
      <TableCell
        className={cn(
          cellClassName,
          "hidden text-right font-mono whitespace-nowrap tabular-nums text-muted-foreground @3xl:table-cell",
        )}
        title={hasHistorySize ? undefined : HISTORY_SIZE_UNKNOWN_TITLE}
      >
        {hasHistorySize ? formatBytes(run.historySizeBytes) : "—"}
      </TableCell>
      <TableCell className="hidden py-2 pr-3 pl-0 text-right @xl:table-cell">
        <ChevronRight
          aria-hidden
          className="ml-auto size-3.5 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100"
        />
      </TableCell>
    </TableRow>
  );
}
