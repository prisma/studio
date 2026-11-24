import { ArrowRight, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  TemporalFollowMode,
  TemporalWorkflowExecution,
} from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
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
  useTemporalCapabilities,
  useTemporalWorkflows,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import { isShortcutBlockedTarget, pluralize } from "./temporal-utils";
import {
  TemporalFollowControl,
  temporalIconScale,
  TemporalNamespaceBadge,
  temporalTableHeadClass,
  TemporalTime,
  TemporalTimeFormatControl,
  WorkflowStatusBadge,
  WorkflowStatusIcon,
  workflowStatusLabel,
} from "./TemporalPrimitives";
import { quoteFilterValue } from "./TemporalRunBreadcrumb";

/** How many executions one request reads. The page lists the Workflow IDs among them. */
const EXECUTION_WINDOW = 200;

const MAX_RUN_MARKS = 6;

const SEARCH_DELAY_MS = 250;

const linkClassName =
  "rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const cellClassName = "px-2 py-2";

export interface TemporalWorkflowIdGroup {
  latestRun: TemporalWorkflowExecution;
  /** The runs of the ID among the executions read, newest first. */
  runs: TemporalWorkflowExecution[];
  workflowId: string;
}

/**
 * One group per Workflow ID, in the order the IDs first appear, each with its
 * runs newest first.
 */
export function groupRunsByWorkflowId(
  executions: TemporalWorkflowExecution[],
): TemporalWorkflowIdGroup[] {
  const runsById = new Map<string, TemporalWorkflowExecution[]>();

  for (const run of executions) {
    const runs = runsById.get(run.workflowId);

    if (runs) {
      runs.push(run);
    } else {
      runsById.set(run.workflowId, [run]);
    }
  }

  return Array.from(runsById, ([workflowId, runs]) => {
    const newestFirst = [...runs].sort((a, b) =>
      b.startTime.localeCompare(a.startTime),
    );

    return { latestRun: newestFirst[0]!, runs: newestFirst, workflowId };
  });
}

export interface TemporalWorkflowIdsViewProps {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  onOpenWorkflowId: (workflowId: string) => void;
  onSearchChange: (search: string) => void;
  /** The text a Workflow ID must start with. Empty lists the IDs of the first executions the server returns. */
  search: string;
}

/**
 * The list above the Workflow ID page: the Workflow IDs among the first
 * executions the server returns, and a field that finds an ID by how it starts.
 */
export function TemporalWorkflowIdsView(props: TemporalWorkflowIdsViewProps) {
  const {
    followMode,
    namespace,
    onFollowModeChange,
    onOpenExecution,
    onOpenWorkflowId,
    onSearchChange,
    search,
  } = props;
  const { createUrl } = useNavigation();
  const { data: capabilities } = useTemporalCapabilities();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(search);
  // The last search this page sent or received, so its own change does not overwrite newer typing.
  const syncedSearch = useRef(search);
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    if (search !== syncedSearch.current) {
      syncedSearch.current = search;
      setDraft(search);
    }
  }, [search]);

  useEffect(() => {
    const text = draft.trim();

    if (text === syncedSearch.current) {
      return;
    }

    const timer = setTimeout(() => {
      syncedSearch.current = text;
      onSearchChange(text);
    }, SEARCH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [draft, onSearchChange]);

  const prefix = search.trim();
  const { data, error, isError, isFetching, isLoading, refetch } =
    useTemporalWorkflows({
      followMode: followMode === "paused" ? "paused" : "live",
      includeCounts: false,
      namespace,
      pageSize: EXECUTION_WINDOW,
      query: prefix ? `WorkflowId STARTS_WITH ${quoteFilterValue(prefix)}` : "",
    });

  const groups = useMemo(
    () => groupRunsByWorkflowId(data?.executions ?? []),
    [data?.executions],
  );
  const executionCount = data?.executions.length ?? 0;
  const hasMoreExecutions = Boolean(data?.nextPageToken);

  useEffect(() => {
    setFocusedIndex((prev) =>
      groups.length === 0 ? 0 : Math.min(prev, groups.length - 1),
    );
  }, [groups.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlockedTarget(event.target, event.key)) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();

        return;
      }

      if (groups.length === 0) {
        return;
      }

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((i) => Math.min(groups.length - 1, i + 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((i) => Math.max(0, i - 1));
      } else if (event.key === "Enter") {
        const current = groups[focusedIndex];

        if (current) {
          event.preventDefault();
          onOpenWorkflowId(current.workflowId);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedIndex, groups, onOpenWorkflowId]);

  const clearSearch = () => {
    setDraft("");
    syncedSearch.current = "";
    onSearchChange("");
    searchInputRef.current?.focus();
  };

  const scope = prefix
    ? `whose ID starts with ${prefix}`
    : capabilities?.nativeListOrder === "newest-first"
      ? "started most recently"
      : "that the server lists first";
  const footerText =
    groups.length === 0
      ? "0 Workflow IDs"
      : hasMoreExecutions
        ? `${pluralize(groups.length, "Workflow ID")} from the ${executionCount.toLocaleString("en-US")} executions ${scope}`
        : `${pluralize(groups.length, "Workflow ID")}, ${pluralize(executionCount, "execution")}`;

  return (
    <div
      className={cn(
        "@container flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-workflow-ids"
    >
      <StudioHeader
        title="Workflow IDs"
        endContent={
          <>
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
              aria-label="Refresh Workflow IDs"
              title="Refresh Workflow IDs"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn(isFetching && "animate-spin")} />
            </Button>
          </>
        }
      >
        <span className="contents @max-3xl:hidden">
          <TemporalNamespaceBadge namespace={namespace} />
        </span>
        <form
          className="relative flex min-w-0 flex-1 items-center"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            syncedSearch.current = draft.trim();
            onSearchChange(draft.trim());
          }}
        >
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
          />
          <Input
            ref={searchInputRef}
            aria-label="Find a Workflow ID by how it starts"
            autoComplete="off"
            className="h-8 pr-8 pl-8 font-mono text-xs"
            data-testid="temporal-workflow-id-search"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Find a Workflow ID by how it starts"
            spellCheck={false}
            value={draft}
          />
          {draft.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label="Clear the search"
              onClick={clearSearch}
              className="absolute right-1 w-6 px-0 text-muted-foreground"
            >
              <X />
            </Button>
          ) : null}
        </form>
      </StudioHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <p className="font-medium text-destructive">
              {error instanceof Error
                ? error.message
                : "Could not load the Workflow IDs"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted-foreground">
            {prefix ? (
              <>
                <p>
                  No Workflow ID in namespace{" "}
                  <code className="font-mono text-foreground">{namespace}</code>{" "}
                  starts with{" "}
                  <code className="font-mono text-foreground">{prefix}</code>.
                  The search matches upper and lower case exactly.
                </p>
                <Button variant="outline" size="sm" onClick={clearSearch}>
                  Clear the search
                </Button>
              </>
            ) : (
              <p>
                Namespace{" "}
                <code className="font-mono text-foreground">{namespace}</code>{" "}
                has no executions, so it has no Workflow IDs yet.
              </p>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-border/70 bg-muted/20 hover:bg-muted/20">
                <TableHead className={cn(temporalTableHeadClass, "pl-4")}>
                  Workflow ID
                </TableHead>
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden @2xl:table-cell",
                  )}
                >
                  Type
                </TableHead>
                <TableHead className={temporalTableHeadClass}>
                  Latest Run
                </TableHead>
                <TableHead className={temporalTableHeadClass}>
                  Started
                </TableHead>
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden @3xl:table-cell",
                  )}
                  title={`The runs of each ID among the ${executionCount.toLocaleString("en-US")} executions this page read, newest first`}
                >
                  Recent Runs
                </TableHead>
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden @5xl:table-cell",
                  )}
                >
                  Task Queue
                </TableHead>
                <TableHead className="h-9 pr-3 pl-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group, index) => (
                <WorkflowIdRow
                  key={group.workflowId}
                  group={group}
                  href={createUrl({
                    temporalNsParam: namespace,
                    temporalSectionParam: "workflow",
                    temporalWfParam: group.workflowId,
                    viewParam: "temporal",
                  })}
                  isFocused={focusedIndex === index}
                  onFocus={() => setFocusedIndex(index)}
                  onOpen={() => onOpenWorkflowId(group.workflowId)}
                  onOpenLatestRun={() =>
                    onOpenExecution(group.workflowId, group.latestRun.runId)
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
        <span
          className="tabular-nums"
          data-testid="temporal-workflow-ids-range"
        >
          {footerText}
          {hasMoreExecutions && !prefix
            ? ". Search to find any other ID."
            : hasMoreExecutions
              ? ". Type more of the ID to narrow the list."
              : ""}
        </span>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-2xs @3xl:inline">
            j/k move · Enter open · / search
          </span>
          <TemporalTimeFormatControl className="h-6" />
        </div>
      </div>
    </div>
  );
}

function WorkflowIdRow(props: {
  group: TemporalWorkflowIdGroup;
  href: string;
  isFocused: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onOpenLatestRun: () => void;
}) {
  const { group, href, isFocused, onFocus, onOpen, onOpenLatestRun } = props;
  const { latestRun, runs, workflowId } = group;
  const marks = runs.slice(0, MAX_RUN_MARKS);
  const runsSummary = `${pluralize(runs.length, "recent run")}, newest first: ${runs
    .slice(0, MAX_RUN_MARKS)
    .map((run) => workflowStatusLabel(run.status))
    .join(", ")}${runs.length > MAX_RUN_MARKS ? " and more" : ""}`;

  return (
    <TableRow
      data-focused={isFocused ? "true" : undefined}
      data-testid={`temporal-workflow-id-row-${workflowId}`}
      onClick={onOpen}
      onMouseEnter={onFocus}
      className={cn(
        "group cursor-pointer border-border/60 text-xs hover:bg-muted/30",
        isFocused && "bg-muted/30",
      )}
    >
      <TableCell className={cn(cellClassName, "max-w-0 w-[36%] pl-4")}>
        <a
          href={href}
          className={cn(
            linkClassName,
            "block truncate font-mono font-medium text-foreground",
          )}
          title={workflowId}
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
          {workflowId}
        </a>
      </TableCell>
      <TableCell
        className={cn(
          cellClassName,
          "hidden max-w-0 w-[18%] truncate text-foreground @2xl:table-cell",
        )}
        title={latestRun.workflowType}
      >
        {latestRun.workflowType}
      </TableCell>
      <TableCell className={cellClassName}>
        <WorkflowStatusBadge status={latestRun.status} />
      </TableCell>
      <TableCell
        className={cn(cellClassName, "whitespace-nowrap text-muted-foreground")}
      >
        <TemporalTime iso={latestRun.startTime} />
      </TableCell>
      <TableCell className={cn(cellClassName, "hidden @3xl:table-cell")}>
        <span
          className="flex items-center gap-1 text-muted-foreground"
          role="img"
          aria-label={runsSummary}
          title={runsSummary}
        >
          {marks.map((run) => (
            <WorkflowStatusIcon key={run.runId} status={run.status} />
          ))}
          {runs.length > MAX_RUN_MARKS ? (
            <span className="font-mono text-2xs tabular-nums">
              +{(runs.length - MAX_RUN_MARKS).toLocaleString("en-US")}
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell
        className={cn(
          cellClassName,
          "hidden whitespace-nowrap font-mono text-muted-foreground @5xl:table-cell",
        )}
      >
        {latestRun.taskQueue}
      </TableCell>
      <TableCell className="py-1 pr-3 pl-0 text-right">
        <span className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="xs"
            className="whitespace-nowrap text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 group-data-[focused=true]:opacity-100"
            title="Open the latest run of this Workflow ID"
            onClick={(event) => {
              event.stopPropagation();
              onOpenLatestRun();
            }}
          >
            Latest run
            <ArrowRight />
          </Button>
          <ChevronRight
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100"
          />
        </span>
      </TableCell>
    </TableRow>
  );
}
