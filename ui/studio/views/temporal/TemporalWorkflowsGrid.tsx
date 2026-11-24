import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileUp,
  Plus,
  Send,
  StopCircle,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  TemporalBulkActionKind,
  TemporalExecutionDetail,
  TemporalFollowMode,
  TemporalWorkflowExecution,
  TemporalWorkflowSort,
  TemporalWorkflowSortField,
} from "@/data/temporal";
import { buildExecutionDetailFromHistory } from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Checkbox } from "@/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/ui/table";
import { Textarea } from "@/ui/components/ui/textarea";
import { useNavigation } from "@/ui/hooks/use-navigation";
import {
  useTemporalBulkJob,
  useTemporalCapabilities,
  useTemporalFacets,
  useTemporalWorkflowCounts,
  useTemporalWorkflows,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import {
  useWorkflowColumns,
  type WorkflowColumn,
} from "./temporal-grid-columns";
import {
  MAX_TEMPORAL_SAVED_VIEWS,
  TEMPORAL_BUILT_IN_VIEWS,
  useTemporalRecentFilters,
  useTemporalSavedViews,
} from "./temporal-saved-views";
import {
  isShortcutBlockedTarget,
  parseJsonArgsText,
  pluralize,
  summarizeIds,
  toVisibilityQuery,
} from "./temporal-utils";
import { TemporalFilterBuilder } from "./TemporalFilterBuilder";
import {
  TemporalConfirmDialog,
  TemporalFollowControl,
  temporalIconScale,
  TemporalLoadError,
  TemporalNamespaceBadge,
  TemporalRefreshError,
  temporalTableHeadClass,
  TemporalTimeFormatControl,
} from "./TemporalPrimitives";
import {
  type TemporalQueryPhase,
  TemporalQueryStatusButton,
} from "./TemporalQueryStatusButton";
import { TemporalRunPreview } from "./TemporalRunPreview";
import { TemporalSearchField } from "./TemporalSearchField";
import type { TemporalStartPreset } from "./TemporalStartSheet";
import {
  statusPresetOfQuery,
  TemporalStatusFilterBar,
} from "./TemporalStatusFilterBar";

const PAGE_SIZES = [50, 100, 250];

const SORT_FIELDS: ReadonlySet<string> = new Set<TemporalWorkflowSortField>([
  "CloseTime",
  "Duration",
  "ExecutionStatus",
  "HistoryLength",
  "StartTime",
  "TaskQueue",
  "WorkflowId",
  "WorkflowType",
]);

/** Reads the `sort` URL value, for example `StartTime:desc`. */
function parseWorkflowSort(
  raw: string | null | undefined,
): TemporalWorkflowSort | null {
  const [field, direction] = (raw ?? "").split(":");

  return field && SORT_FIELDS.has(field)
    ? {
        direction: direction === "asc" ? "asc" : "desc",
        field: field as TemporalWorkflowSortField,
      }
    : null;
}

const NEWEST_FIRST = { direction: "desc", field: "StartTime" } as const;

const SERVER_ORDER_NOTE =
  "Server order: running first, then the most recently closed";

function rowKey(exec: TemporalWorkflowExecution): string {
  return `${exec.workflowId}::${exec.runId}`;
}

/** Signal, cancel and terminate reach an execution only while it is open. */
function isOpenExecution(exec: TemporalWorkflowExecution): boolean {
  return exec.status === "Running" || exec.status === "Paused";
}

/** The Workflow IDs that more than one of the executions has. */
function repeatedWorkflowIds(
  executions: TemporalWorkflowExecution[],
): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const exec of executions) {
    (seen.has(exec.workflowId) ? repeated : seen).add(exec.workflowId);
  }

  return repeated;
}

interface TemporalWorkflowsGridProps {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  /** Opens a run that was read from a history file. */
  onImportHistory: (detail: TemporalExecutionDetail) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  onOpenStart: (preset?: TemporalStartPreset | null) => void;
  onQueryChange: (query: string) => void;
  query: string;
}

export function TemporalWorkflowsGrid(props: TemporalWorkflowsGridProps) {
  const {
    namespace,
    query,
    followMode,
    onQueryChange,
    onFollowModeChange,
    onImportHistory,
    onOpenExecution,
    onOpenStart,
  } = props;
  const historyFileRef = useRef<HTMLInputElement | null>(null);
  const importHistoryFile = async (file: File) => {
    try {
      onImportHistory(
        buildExecutionDetailFromHistory({
          history: JSON.parse(await file.text()) as unknown,
          workflowId: file.name.replace(/\.json$/i, ""),
        }),
      );
    } catch (err) {
      toast.error(
        `Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const [draftQuery, setDraftQuery] = useState(query);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // The cursor is on an execution, not on a row number, so a refresh that adds rows does not move it.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkSignalOpen, setBulkSignalOpen] = useState(false);
  const [bulkSignalName, setBulkSignalName] = useState("");
  const [bulkSignalArgs, setBulkSignalArgs] = useState("[]");
  const [bulkCancelConfirmOpen, setBulkCancelConfirmOpen] = useState(false);
  const [bulkTerminateConfirmOpen, setBulkTerminateConfirmOpen] =
    useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tableAreaRef = useRef<HTMLDivElement | null>(null);
  const {
    createUrl,
    pageSizeParam,
    setPageSizeParam,
    sortParam,
    setSortParam,
  } = useNavigation();
  // The page size is in the URL, so the Back button and a reload keep it.
  const pageSize = PAGE_SIZES.includes(Number(pageSizeParam))
    ? Number(pageSizeParam)
    : PAGE_SIZES[0]!;
  // The token that loads each page after the first, in page order.
  const [pageTokens, setPageTokens] = useState<string[]>([]);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  const { data: capabilities } = useTemporalCapabilities();
  // Plain text, such as a pasted ID, becomes a search on IDs and types.
  const visibilityQuery = toVisibilityQuery(query);
  const isPlainTextSearch = visibilityQuery !== query.trim();
  const nativeListOrder = capabilities?.nativeListOrder;
  const isNativeNewestFirst = nativeListOrder === "newest-first";
  const parsedSort = parseWorkflowSort(sortParam);
  // The order with no sort in the URL. A server that lists running executions first has none by a column.
  const defaultSort =
    nativeListOrder === "newest-first" || nativeListOrder === "workflow-id"
      ? NEWEST_FIRST
      : undefined;
  const sort = parsedSort ?? defaultSort;
  // Skip in-memory sorting when the server already lists newest-first natively.
  const requestSort =
    isNativeNewestFirst &&
    sort?.field === "StartTime" &&
    sort.direction === "desc"
      ? undefined
      : sort;
  const sortKey = requestSort
    ? `${requestSort.field}:${requestSort.direction}`
    : "";

  useEffect(() => {
    setPageTokens([]);
    setSelectedKeys(new Set());
    setAllMatchingSelected(false);
    setFocusedKey(null);
  }, [namespace, pageSize, sortKey, visibilityQuery]);

  const toggleSort = (field: TemporalWorkflowSortField) => {
    // The list is already in this column's first order, so the first click gives the other one.
    if (!parsedSort && defaultSort?.field === field) {
      void setSortParam(`${field}:asc`);

      return;
    }

    // First click sorts descending, the second ascending, the third clears the sort.
    if (parsedSort?.field !== field) {
      void setSortParam(`${field}:desc`);
    } else if (parsedSort.direction === "desc") {
      void setSortParam(`${field}:asc`);
    } else {
      void setSortParam(null);
    }
  };
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    hasCounts,
    isCounting,
    isFetching,
    isPlaceholderData,
  } = useTemporalWorkflows({
    followMode,
    namespace,
    pageSize,
    pageToken: pageTokens.at(-1),
    query: visibilityQuery,
    sort: requestSort,
  });

  const { data: namespaceCounts } = useTemporalWorkflowCounts({
    followMode,
    namespace,
  });
  const { clearRecentFilters, recentFilters, rememberFilter } =
    useTemporalRecentFilters();
  const hasRowsOfQuery = data !== undefined && !isPlaceholderData && !isError;
  // A failed refresh leaves the rows that loaded before; a failed first load has none.
  const isFirstLoadError = isError && data === undefined;
  const isRefreshError = isError && data !== undefined;
  // Only a request the server refused is about the filter. Any other failure is the server or the network.
  const isFilterRefused =
    isFirstLoadError &&
    (error as { status?: unknown } | null)?.status === 400 &&
    query.trim().length > 0 &&
    !isPlainTextSearch;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = () => {
    setIsRefreshing(true);
    void refetch().finally(() => setIsRefreshing(false));
  };
  // A query the user asked for: a new filter, sort or page, or a refresh.
  const queryPhase: TemporalQueryPhase | null =
    isLoading || isPlaceholderData || isRefreshing
      ? "rows"
      : isCounting
        ? "count"
        : null;

  useEffect(() => {
    const text = query.trim();

    if (hasRowsOfQuery && statusPresetOfQuery(text) === null) {
      rememberFilter(text);
    }
  }, [hasRowsOfQuery, query, rememberFilter]);

  const bulkJob = useTemporalBulkJob(namespace);
  // True when the bulk bar acts on every match of the filter, not only on this page.
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const isBulkPending =
    bulkJob.start.isPending || bulkJob.job?.state === "running";
  const { saveView, views: savedViews } = useTemporalSavedViews();
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const isQuerySaved = [...TEMPORAL_BUILT_IN_VIEWS, ...savedViews].some(
    (view) =>
      view.query === query.trim() && (view.sort ?? "") === (sortParam ?? ""),
  );

  const executions = useMemo(() => data?.executions ?? [], [data?.executions]);
  const { data: facets } = useTemporalFacets(namespace);
  const {
    available: availableColumns,
    columns,
    resetColumns,
    setColumnWidth,
    shownIds: shownColumnIds,
    toggleColumn,
    widthOf,
  } = useWorkflowColumns(executions);
  // The checkbox column and the expand column come before the data columns.
  const FIXED_COLUMNS_WIDTH = 72;
  const tableWidth =
    FIXED_COLUMNS_WIDTH +
    columns.reduce((sum, column) => sum + widthOf(column), 0);
  const flexColumnId = (
    columns.find((column) => column.id === "workflowId") ??
    columns.find((column) => column.id === "type") ??
    columns.at(-1)
  )?.id;
  const countsByStatus = data?.countsByStatus ?? {};
  const totalCount = data?.totalCount ?? executions.length;
  // Show the actual order in the header; never display a skipped sort arrow.
  const displaySort = data?.sortSkippedReason
    ? isNativeNewestFirst
      ? NEWEST_FIRST
      : undefined
    : sort;
  const serverOrderNote =
    nativeListOrder === "open-first" && !displaySort && !data?.sortSkippedReason
      ? SERVER_ORDER_NOTE
      : undefined;
  const exceedsSortLimit = hasCounts && totalCount > 10_000;
  const firstRowNumber = pageTokens.length * pageSize + 1;
  const hasNextPage = Boolean(data?.nextPageToken) && !isPlaceholderData;
  const goToNextPage = () => {
    if (data?.nextPageToken) {
      setPageTokens((tokens) => [...tokens, data.nextPageToken!]);
      setSelectedKeys(new Set());
      setAllMatchingSelected(false);
      setFocusedKey(null);
    }
  };
  const goToPreviousPage = () => {
    setPageTokens((tokens) => tokens.slice(0, -1));
    setSelectedKeys(new Set());
    setAllMatchingSelected(false);
    setFocusedKey(null);
  };

  const toggleSelect = useCallback((key: string) => {
    // A change to the rows means the user no longer wants every match.
    setAllMatchingSelected(false);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allSelected =
    executions.length > 0 &&
    executions.every((e) => selectedKeys.has(rowKey(e)));

  const toggleSelectAll = () => {
    setAllMatchingSelected(false);

    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(executions.map(rowKey)));
    }
  };

  const selectedExecutions = useMemo(
    () => executions.filter((e) => selectedKeys.has(rowKey(e))),
    [executions, selectedKeys],
  );
  const actionableExecutions = useMemo(
    () => selectedExecutions.filter(isOpenExecution),
    [selectedExecutions],
  );
  const closedSelectedCount =
    selectedExecutions.length - actionableExecutions.length;
  const repeatedIds = useMemo(
    () => repeatedWorkflowIds(executions),
    [executions],
  );
  // Runs of one Workflow ID share the first 8 characters of a time-ordered run ID for a minute, so the label takes 13.
  const labelOf = (exec: TemporalWorkflowExecution) =>
    repeatedIds.has(exec.workflowId)
      ? `${exec.workflowId}, run ${exec.runId.slice(0, 13)}`
      : exec.workflowId;
  const selectedSummary = `${pluralize(actionableExecutions.length, "running execution")} (${summarizeIds(actionableExecutions.map(labelOf))})`;
  const focusedIndex =
    focusedKey === null
      ? -1
      : executions.findIndex((exec) => rowKey(exec) === focusedKey);

  const applyQuery = (nextQuery: string) => {
    setDraftQuery(nextQuery);
    onQueryChange(nextQuery);
  };

  // Keyboard navigation (j/k, Space, Enter, /)
  useEffect(() => {
    // The keys move the cursor out of view on a long page, so the page follows it.
    const moveTo = (index: number) => {
      const next = executions[index];

      if (!next) {
        return;
      }

      setFocusedKey(rowKey(next));
      requestAnimationFrame(() => {
        tableAreaRef.current
          ?.querySelector('tr[data-focused="true"]')
          ?.scrollIntoView({ block: "nearest" });
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlockedTarget(event.target, event.key)) return;

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (executions.length === 0) return;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        moveTo(Math.min(executions.length - 1, focusedIndex + 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        moveTo(Math.max(0, focusedIndex - 1));
      } else if (event.key === "x" || event.key === " ") {
        const current = executions[focusedIndex];
        if (current) {
          event.preventDefault();
          toggleSelect(rowKey(current));
        }
      } else if (event.key === "Enter") {
        const current = executions[focusedIndex];
        if (current) {
          event.preventDefault();
          onOpenExecution(current.workflowId, current.runId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [executions, focusedIndex, onOpenExecution, toggleSelect]);

  const runningTotal =
    (countsByStatus.Running ?? 0) + (countsByStatus.Paused ?? 0);
  const bulkCount = allMatchingSelected
    ? runningTotal
    : actionableExecutions.length;
  const bulkSummary = allMatchingSelected
    ? `${runningTotal === 1 ? "the" : "all"} ${pluralize(runningTotal, "running execution")}${query.trim() ? " that this search matches" : ""}`
    : selectedSummary;
  const bulkSignalArgsError = parseJsonArgsText(bulkSignalArgs).error;

  const runBulkAction = async (
    action: TemporalBulkActionKind,
    opts?: { reason?: string; signalArgs?: unknown[]; signalName?: string },
  ) => {
    if (bulkCount === 0) return;
    setBulkSignalOpen(false);

    try {
      await bulkJob.start.mutateAsync({
        action,
        ...(allMatchingSelected
          ? { query: visibilityQuery }
          : {
              items: actionableExecutions.map((e) => ({
                runId: e.runId,
                workflowId: e.workflowId,
              })),
            }),
        reason: opts?.reason || `Bulk ${action} via Prisma Studio`,
        ...(opts?.signalName
          ? { signalArgs: opts.signalArgs, signalName: opts.signalName }
          : {}),
      });
      setSelectedKeys(new Set());
      setAllMatchingSelected(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Bulk ${action} failed`);
    }
  };

  return (
    <div
      className={cn(
        "@container flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-workflows-grid"
    >
      <StudioHeader
        title="Executions"
        endContent={
          <>
            {/* A narrow page drops the control while it reads Live. While paused only a very narrow one does, and says so below. */}
            <span
              className={cn(
                "contents",
                followMode === "paused" ? "@max-lg:hidden" : "@max-2xl:hidden",
              )}
            >
              <TemporalFollowControl
                value={followMode}
                onChange={onFollowModeChange}
              />
            </span>

            <TemporalQueryStatusButton
              isError={isError}
              isPolling={isFetching}
              onRefresh={refresh}
              phase={queryPhase}
              queryKey={[
                namespace,
                visibilityQuery,
                sort ? `${sort.field}:${sort.direction}` : "",
                pageTokens.at(-1) ?? "",
              ].join("\n")}
            />

            <input
              ref={historyFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="History JSON file"
              data-testid="temporal-import-history-input"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void importHistoryFile(file);
                }

                event.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-8 px-0 @max-2xl:hidden"
              aria-label="Open a history file"
              title="Open a history JSON file from the Temporal CLI, the Temporal UI or Studio"
              onClick={() => historyFileRef.current?.click()}
            >
              <FileUp />
            </Button>

            <Button
              size="sm"
              onClick={() => onOpenStart(null)}
              data-testid="temporal-start-workflow-btn"
            >
              <Plus />
              <span className="@max-3xl:sr-only">Start Execution</span>
            </Button>
          </>
        }
      >
        <span className="contents @max-3xl:hidden">
          <TemporalNamespaceBadge namespace={namespace} />
        </span>
        <TemporalSearchField
          draft={draftQuery}
          facets={facets}
          inputRef={searchInputRef}
          onCancel={() => setDraftQuery(query)}
          onClear={() => applyQuery("")}
          onDraftChange={setDraftQuery}
          onSubmit={onQueryChange}
        />
        <TemporalFilterBuilder
          facets={facets}
          onApply={applyQuery}
          query={query}
        />
        {query.trim().length > 0 && !isQuerySaved ? (
          <Popover open={saveViewOpen} onOpenChange={setSaveViewOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                // The header of a very narrow page has no room for it.
                className="shrink-0 @max-md:hidden"
                data-testid="temporal-save-view"
              >
                <Bookmark />
                <span className="max-xl:sr-only">Save View</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (!saveViewName.trim()) {
                    return;
                  }

                  saveView({
                    name: saveViewName.trim(),
                    query: query.trim(),
                    ...(sortParam ? { sort: sortParam } : {}),
                  });
                  toast.success(`Saved view "${saveViewName.trim()}"`);
                  setSaveViewName("");
                  setSaveViewOpen(false);
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="temporal-save-view-name" className="text-xs">
                    Name this search
                  </Label>
                  <Input
                    id="temporal-save-view-name"
                    value={saveViewName}
                    onChange={(e) => setSaveViewName(e.target.value)}
                    placeholder="For example: Failed payouts"
                    className="h-8 text-xs"
                  />
                </div>
                <p className="text-2xs text-muted-foreground">
                  The view goes in the sidebar of this browser. To share it,
                  copy the link of this page.
                </p>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    !saveViewName.trim() ||
                    savedViews.length >= MAX_TEMPORAL_SAVED_VIEWS
                  }
                >
                  {savedViews.length >= MAX_TEMPORAL_SAVED_VIEWS
                    ? `Limit of ${MAX_TEMPORAL_SAVED_VIEWS} views reached`
                    : "Save View"}
                </Button>
              </form>
            </PopoverContent>
          </Popover>
        ) : null}
      </StudioHeader>

      <TemporalStatusFilterBar
        counts={namespaceCounts ?? (query.trim() === "" ? data : undefined)}
        isLoadingRows={isPlaceholderData}
        isPlainTextSearch={isPlainTextSearch}
        matchCount={hasCounts && !isFirstLoadError ? totalCount : undefined}
        onApply={applyQuery}
        onClearRecent={clearRecentFilters}
        query={query}
        recentFilters={recentFilters}
      />

      {followMode === "paused" ? (
        // Where the header has no room for the Paused and Live control, this says the list stands still.
        <div
          className="hidden items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-foreground @max-lg:flex"
          data-testid="temporal-paused-note"
        >
          <span>Refresh is paused.</span>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onFollowModeChange("live")}
          >
            Resume
          </Button>
        </div>
      ) : null}

      {isRefreshError ? (
        <TemporalRefreshError error={error} onRetry={refresh} />
      ) : null}

      <div ref={tableAreaRef} className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-9 w-full" />
            ))}
          </div>
        ) : isFilterRefused ? (
          <div
            className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground"
            data-testid="temporal-grid-error"
            role="alert"
          >
            <p className="font-medium text-foreground">
              The server could not read this filter
            </p>
            <p className="max-w-xl font-mono text-xs break-words text-destructive">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <p className="max-w-xl text-xs">
              A filter compares attributes, joined with AND or OR. For example:{" "}
              <code className="font-mono text-foreground">
                WorkflowType = &quot;orderFulfillment&quot; AND ExecutionStatus
                = &quot;Failed&quot;
              </code>
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => searchInputRef.current?.focus()}>
                Edit Filter
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyQuery("")}
              >
                Clear Filter
              </Button>
            </div>
          </div>
        ) : isFirstLoadError ? (
          <TemporalLoadError
            error={error}
            onRetry={refresh}
            title={
              <>
                Could not load the executions of namespace{" "}
                <code className="font-mono">{namespace}</code>.
              </>
            }
          />
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <p>
              No executions found in namespace{" "}
              <code className="font-mono text-foreground">{namespace}</code>
              {isPlainTextSearch
                ? ` with a Workflow ID, Workflow Type or Run ID starting with ${query.trim()}`
                : query
                  ? ` matching ${query}`
                  : ""}
              .
            </p>
            <div className="flex gap-2">
              {query ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyQuery("")}
                >
                  Clear Filter
                </Button>
              ) : null}
              <Button size="sm" onClick={() => onOpenStart(null)}>
                <Plus />
                Start Execution
              </Button>
            </div>
          </div>
        ) : (
          <Table
            aria-busy={isPlaceholderData}
            // These rows belong to the previous search until the new ones arrive.
            className={cn(
              "table-fixed text-xs transition-opacity",
              isPlaceholderData && "opacity-50",
            )}
            // Fixed widths, so dragging one column edge moves no other column.
            style={{ minWidth: "100%", width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: 32 }} />
              {/* One column has no width, so it takes the space left over on a wide grid. */}
              {columns.map((column) => (
                <col
                  key={column.id}
                  style={
                    column.id === flexColumnId
                      ? undefined
                      : { width: widthOf(column) }
                  }
                />
              ))}
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-background/95">
              <TableRow className="border-border/70 bg-muted/20 hover:bg-muted/20">
                <TableHead className="h-9 pr-2 pl-4">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all executions on this page"
                  />
                </TableHead>
                <TableHead className="h-9 px-0" />
                {columns.map((column) => (
                  <ColumnHead
                    key={column.id}
                    column={column}
                    onResize={(width) => setColumnWidth(column.id, width)}
                    onSort={toggleSort}
                    sort={displaySort}
                    sortDisabled={exceedsSortLimit}
                    title={
                      column.id === "started" ? serverOrderNote : undefined
                    }
                    width={widthOf(column)}
                  />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((exec) => {
                const key = rowKey(exec);

                return (
                  <WorkflowGridRow
                    key={key}
                    columns={columns}
                    execution={exec}
                    isExpanded={expandedKey === key}
                    href={createUrl({
                      ...(followMode === "paused"
                        ? { temporalFollowParam: "paused" }
                        : {}),
                      temporalNsParam: namespace,
                      temporalRunParam: exec.runId,
                      temporalSectionParam: "workflows",
                      temporalWfParam: exec.workflowId,
                      viewParam: "temporal",
                    })}
                    isFocused={focusedKey === key}
                    isSelected={selectedKeys.has(key)}
                    label={labelOf(exec)}
                    namespace={namespace}
                    onClone={(preset) => onOpenStart(preset)}
                    onFocus={() => setFocusedKey(key)}
                    onOpen={() => onOpenExecution(exec.workflowId, exec.runId)}
                    onOpenRun={(runId) =>
                      onOpenExecution(exec.workflowId, runId)
                    }
                    onToggleExpand={() =>
                      setExpandedKey((prev) => (prev === key ? null : key))
                    }
                    onToggleSelect={() => toggleSelect(key)}
                  />
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {selectedExecutions.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2 text-xs"
          data-testid="temporal-bulk-bar"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-foreground">
              {allMatchingSelected
                ? `All ${runningTotal.toLocaleString("en-US")} running matches selected`
                : `${selectedExecutions.length} selected`}
            </span>
            {!allMatchingSelected && closedSelectedCount > 0 ? (
              <span className="text-muted-foreground">
                {actionableExecutions.length === 0
                  ? `${closedSelectedCount === 1 ? "It is" : "They are"} not running, so no action applies.`
                  : `${actionableExecutions.length} running. The actions apply to ${actionableExecutions.length === 1 ? "it" : "them"} only.`}
              </span>
            ) : null}
            {allSelected &&
            !allMatchingSelected &&
            hasCounts &&
            totalCount > executions.length &&
            runningTotal > actionableExecutions.length ? (
              <Button
                variant="link"
                size="xs"
                className="h-auto p-0"
                onClick={() => setAllMatchingSelected(true)}
                data-testid="temporal-select-all-matching"
              >
                Select all {runningTotal.toLocaleString("en-US")} running
                executions that match
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => {
                setSelectedKeys(new Set());
                setAllMatchingSelected(false);
              }}
            >
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isBulkPending || bulkCount === 0}
              onClick={() => setBulkSignalOpen(true)}
            >
              <Send />
              Signal
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isBulkPending || bulkCount === 0}
              onClick={() => setBulkCancelConfirmOpen(true)}
            >
              <XCircle />
              Request Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isBulkPending || bulkCount === 0}
              onClick={() => setBulkTerminateConfirmOpen(true)}
            >
              <StopCircle />
              Terminate
            </Button>
          </div>
        </div>
      ) : null}

      {data?.sortSkippedReason ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-amber-500/10 px-4 py-1.5 text-2xs text-foreground"
          data-testid="temporal-sort-skipped"
        >
          <span>{data.sortSkippedReason}</span>
          {sortParam ? (
            <Button
              variant="outline"
              size="xs"
              className="h-5 px-2 text-2xs"
              onClick={() => void setSortParam(null)}
            >
              Reset Sort
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-card px-4 py-1.5 text-2xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span data-testid="temporal-row-range">
            {/* No row count while nothing loaded, and no total before the server counted. */}
            {isLoading || isFirstLoadError ? null : executions.length === 0 ? (
              "No rows"
            ) : (
              <>
                Rows{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {firstRowNumber.toLocaleString("en-US")}–
                  {(firstRowNumber + executions.length - 1).toLocaleString(
                    "en-US",
                  )}
                </span>
                {hasCounts ? (
                  <>
                    {" "}
                    of{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {totalCount.toLocaleString("en-US")}
                    </span>
                  </>
                ) : isCounting ? (
                  " · counting matches…"
                ) : null}
              </>
            )}
          </span>
          <Button
            variant="outline"
            size="xs"
            className="w-6 px-0"
            aria-label="Previous page"
            disabled={pageTokens.length === 0}
            onClick={goToPreviousPage}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="xs"
            className="w-6 px-0"
            aria-label="Next page"
            disabled={!hasNextPage}
            onClick={goToNextPage}
          >
            <ChevronRight />
          </Button>
          <Select
            value={String(pageSize)}
            onValueChange={(next) =>
              void setPageSizeParam(
                Number(next) === PAGE_SIZES[0] ? null : next,
              )
            }
          >
            <SelectTrigger
              aria-label="Rows per page"
              className="h-6 w-auto gap-1 px-2 text-2xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} className="text-xs" value={String(size)}>
                  {size} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                className="h-6"
                data-testid="temporal-columns"
              >
                <Columns3 />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-80 w-60 overflow-y-auto"
            >
              {availableColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={shownColumnIds.includes(column.id)}
                  className="text-xs"
                  // The last column stays, so the rows can be told apart.
                  disabled={
                    shownColumnIds.length === 1 &&
                    shownColumnIds[0] === column.id
                  }
                  // Keep the menu open, so several columns can be changed at once.
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => toggleColumn(column.id)}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs" onSelect={resetColumns}>
                Reset Columns and Widths
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {serverOrderNote ? (
            <span
              className="hidden @2xl:inline"
              data-testid="temporal-server-order"
            >
              {serverOrderNote}
            </span>
          ) : null}
          {/* The order note is about the server too, and one line holds only one of the two. */}
          {capabilities && !serverOrderNote ? (
            <span className="hidden font-mono @7xl:inline">
              {capabilities.serverKind} ({capabilities.persistenceStore} ·{" "}
              {pluralize(capabilities.shardCount, "shard")})
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "hidden font-mono",
              // Beside the order note the keys fit on a wide page only.
              serverOrderNote ? "@7xl:inline" : "@5xl:inline",
            )}
          >
            j/k move · Space select · Enter inspect · / search
          </span>
          <TemporalTimeFormatControl className="h-6" />
        </div>
      </div>

      <Dialog open={bulkSignalOpen} onOpenChange={setBulkSignalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Signal {pluralize(bulkCount, "running execution")}
            </DialogTitle>
            <DialogDescription>
              Send the same signal to {bulkSummary} in namespace{" "}
              <code className="font-mono">{namespace}</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-sig-name">Signal Name</Label>
              <Input
                id="bulk-sig-name"
                value={bulkSignalName}
                onChange={(e) => setBulkSignalName(e.target.value)}
                placeholder="Signal name"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-sig-args">Arguments (JSON)</Label>
              <Textarea
                id="bulk-sig-args"
                value={bulkSignalArgs}
                onChange={(e) => setBulkSignalArgs(e.target.value)}
                rows={3}
                className="font-mono text-sm"
                spellCheck={false}
                aria-invalid={Boolean(bulkSignalArgsError)}
                aria-describedby={
                  bulkSignalArgsError ? "bulk-sig-args-error" : undefined
                }
              />
              {bulkSignalArgsError ? (
                <p
                  id="bulk-sig-args-error"
                  className="text-xs text-destructive"
                >
                  {bulkSignalArgsError}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSignalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !bulkSignalName.trim() ||
                isBulkPending ||
                Boolean(bulkSignalArgsError)
              }
              onClick={() => {
                const parsed = parseJsonArgsText(bulkSignalArgs);

                if (parsed.error) {
                  return;
                }

                void runBulkAction("signal", {
                  signalArgs: parsed.args,
                  signalName: bulkSignalName.trim(),
                });
              }}
            >
              Send Signal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemporalConfirmDialog
        confirmLabel="Request Cancel"
        description={`This asks ${bulkSummary} to cancel. Each execution can run its cleanup logic before it stops.`}
        isPending={isBulkPending}
        onConfirm={() => runBulkAction("cancel")}
        onOpenChange={setBulkCancelConfirmOpen}
        open={bulkCancelConfirmOpen}
        title="Request cancellation?"
        variant="default"
      />

      <TemporalConfirmDialog
        confirmLabel={`Terminate ${pluralize(bulkCount, "Execution")}`}
        defaultReason="Bulk terminated via Prisma Studio"
        description={`This stops ${bulkSummary} immediately, without running cleanup logic.`}
        isPending={isBulkPending}
        onConfirm={(reason) => runBulkAction("terminate", { reason })}
        onOpenChange={setBulkTerminateConfirmOpen}
        open={bulkTerminateConfirmOpen}
        reasonLabel="Termination reason"
        showReasonInput
        title="Terminate selected executions?"
      />

      <Dialog
        open={bulkJob.job !== undefined}
        onOpenChange={(open) => {
          // A running job keeps going when the dialog closes; only a finished one is dismissed.
          if (!open && bulkJob.job?.state !== "running") {
            bulkJob.reset();
          }
        }}
      >
        {bulkJob.job ? (
          <DialogContent
            className="sm:max-w-md"
            data-testid="temporal-bulk-job"
          >
            <DialogHeader>
              <DialogTitle>
                {bulkJob.job.state === "running"
                  ? `Bulk ${bulkJob.job.action} in progress`
                  : bulkJob.job.state === "aborted"
                    ? `Bulk ${bulkJob.job.action} stopped`
                    : `Bulk ${bulkJob.job.action} finished`}
              </DialogTitle>
              <DialogDescription>
                {bulkJob.job.done.toLocaleString("en-US")} of{" "}
                {pluralize(bulkJob.job.total, "execution")} done
                {bulkJob.job.failed > 0
                  ? `, ${bulkJob.job.failed.toLocaleString("en-US")} failed`
                  : ""}
                .
              </DialogDescription>
            </DialogHeader>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={bulkJob.job.total}
              aria-valuenow={bulkJob.job.done}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-prism-cyan-500 transition-[width]"
                style={{
                  width: `${bulkJob.job.total > 0 ? (bulkJob.job.done / bulkJob.job.total) * 100 : 100}%`,
                }}
              />
            </div>
            {bulkJob.job.errors.length > 0 ? (
              <div className="flex max-h-40 flex-col overflow-auto rounded-md border border-destructive/30 bg-destructive/10 p-2 font-mono text-2xs text-foreground">
                {bulkJob.job.errors.map((item) => (
                  <span key={item.workflowId}>
                    {item.workflowId}: {item.error}
                  </span>
                ))}
              </div>
            ) : null}
            <DialogFooter>
              {bulkJob.job.state === "running" ? (
                <Button
                  variant="outline"
                  disabled={bulkJob.abort.isPending}
                  onClick={() => bulkJob.abort.mutate()}
                >
                  Stop
                </Button>
              ) : (
                <Button onClick={() => bulkJob.reset()}>Close</Button>
              )}
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function WorkflowGridRow(props: {
  columns: WorkflowColumn[];
  execution: TemporalWorkflowExecution;
  /** The link to the run, for a click that opens a new tab. */
  href: string;
  isExpanded: boolean;
  isFocused: boolean;
  isSelected: boolean;
  /** The Workflow ID, with the start of the run ID when the page has the ID twice. */
  label: string;
  namespace: string;
  onClone: (preset: TemporalStartPreset) => void;
  onFocus: () => void;
  onOpen: () => void;
  onOpenRun: (runId: string) => void;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}) {
  const {
    columns,
    execution,
    href,
    label,
    namespace,
    isExpanded,
    isSelected,
    isFocused,
    onToggleSelect,
    onToggleExpand,
    onOpen,
    onOpenRun,
    onClone,
    onFocus,
  } = props;

  return (
    <>
      <TableRow
        onClick={onFocus}
        data-focused={isFocused ? "true" : undefined}
        data-state={isSelected ? "selected" : undefined}
        className={cn(
          // The margin keeps a row the keys scroll to clear of the sticky header.
          "scroll-mt-9 border-border/60 hover:bg-muted/30 data-[state=selected]:bg-muted/50",
          isFocused && "bg-muted/30",
        )}
        data-testid={`temporal-wf-row-${execution.workflowId}`}
      >
        <TableCell
          className={cn(
            "py-2 pr-2 pl-4",
            // Marks the keyboard-focused row without relying on the faint row tint.
            isFocused && "shadow-[inset_2px_0_0_0_var(--foreground)]",
          )}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={`Select ${label}`}
          />
        </TableCell>
        <TableCell className="px-0 py-2">
          <Button
            variant="ghost"
            size="xs"
            className="w-6 px-0 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${label}`}
            data-testid={`temporal-expand-${execution.workflowId}`}
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </TableCell>
        {columns.map((column) => (
          <TableCell
            key={column.id}
            className={cn(
              "truncate px-2 py-2 last:pr-4",
              column.align === "right" && "text-right",
              column.cellClassName,
            )}
          >
            {column.render(execution, { href, onOpen })}
          </TableCell>
        ))}
      </TableRow>

      {isExpanded ? (
        <TableRow
          className="border-border/60 bg-muted/20 hover:bg-muted/20"
          data-testid={`temporal-expanded-${execution.workflowId}`}
        >
          <TableCell colSpan={columns.length + 2} className="p-0">
            {/* As wide as the visible grid, not the table, so no part of it scrolls out of view. */}
            <div className="sticky left-0 w-[100cqw] max-w-full px-4 pt-3 pb-4 whitespace-normal">
              <TemporalRunPreview
                execution={execution}
                namespace={namespace}
                onClone={onClone}
                onOpen={onOpen}
                onOpenRun={onOpenRun}
              />
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function ColumnHead(props: {
  column: WorkflowColumn;
  onResize: (width: number) => void;
  onSort: (field: TemporalWorkflowSortField) => void;
  sort: TemporalWorkflowSort | undefined;
  sortDisabled?: boolean;
  /** Says what the order is when no column gives it. */
  title?: string;
  width: number;
}) {
  const { column, onResize, onSort, sort, sortDisabled, title, width } = props;
  const direction =
    column.sortField && sort?.field === column.sortField
      ? sort.direction
      : null;
  const startResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const handle = event.currentTarget;

    handle.setPointerCapture(event.pointerId);

    // The column that takes the leftover space is wider than its stored width.
    const startWidth =
      handle.parentElement?.getBoundingClientRect().width ?? width;
    const onMove = (move: PointerEvent) =>
      onResize(startWidth + move.clientX - startX);
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  return (
    <TableHead
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
      className={cn(
        temporalTableHeadClass,
        "relative last:pr-4",
        column.align === "right" && "text-right",
      )}
    >
      {column.sortField && !sortDisabled ? (
        <button
          type="button"
          onClick={() => onSort(column.sortField!)}
          title={title}
          className={cn(
            "inline-flex h-6 max-w-full items-center gap-1 rounded-sm uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            direction && "text-foreground",
          )}
          data-testid={`temporal-sort-${column.sortField}`}
        >
          <span className="truncate">{column.label}</span>
          {direction === "asc" ? (
            <ArrowUp aria-hidden className="size-3 shrink-0" />
          ) : direction === "desc" ? (
            <ArrowDown aria-hidden className="size-3 shrink-0" />
          ) : null}
        </button>
      ) : (
        <span
          className={cn(
            "inline-flex h-6 max-w-full items-center gap-1 uppercase",
            direction && "text-foreground",
          )}
          title={
            column.sortField && sortDisabled
              ? "Filter to 10,000 or fewer executions to change sort order"
              : undefined
          }
        >
          <span className="truncate">{column.label}</span>
          {direction === "asc" ? (
            <ArrowUp aria-hidden className="size-3 shrink-0" />
          ) : direction === "desc" ? (
            <ArrowDown aria-hidden className="size-3 shrink-0" />
          ) : null}
        </span>
      )}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize column ${column.label}`}
        className="absolute inset-y-1.5 right-0 w-1.5 cursor-col-resize touch-none border-r border-border/70 hover:border-foreground"
        onPointerDown={startResize}
        data-testid={`temporal-resize-${column.id}`}
      />
    </TableHead>
  );
}
