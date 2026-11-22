import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  StopCircle,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  TemporalBulkActionKind,
  TemporalFollowMode,
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
} from "@/data/temporal";
import { Badge } from "@/ui/components/ui/badge";
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
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/ui/components/ui/popover";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { Textarea } from "@/ui/components/ui/textarea";
import {
  useTemporalActions,
  useTemporalCapabilities,
  useTemporalWorkflowDetail,
  useTemporalWorkflows,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import {
  formatDuration,
  formatRelativeTime,
  parseJsonArgsText,
  safeJsonPretty,
  statusBadgeClasses,
  statusDotClasses,
} from "./temporal-utils";
import type { TemporalStartPreset } from "./TemporalStartSheet";

const STATUS_FILTERS: Array<{
  label: string;
  status: TemporalWorkflowStatus | "All";
}> = [
  { label: "All", status: "All" },
  { label: "Running", status: "Running" },
  { label: "Failed", status: "Failed" },
  { label: "Timed Out", status: "TimedOut" },
  { label: "Completed", status: "Completed" },
  { label: "Canceled", status: "Canceled" },
  { label: "Terminated", status: "Terminated" },
];

const SAVED_VIEWS = [
  { label: "All Executions", query: "" },
  { label: "Failed Workflows", query: 'ExecutionStatus = "Failed"' },
  { label: "Running Workflows", query: 'ExecutionStatus = "Running"' },
  { label: "Billing Queue", query: 'TaskQueue = "billing"' },
  { label: "ChargeOrder Runs", query: 'WorkflowType = "ChargeOrder"' },
];

interface TemporalWorkflowsGridProps {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
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
    onOpenExecution,
    onOpenStart,
  } = props;

  const [draftQuery, setDraftQuery] = useState(query);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkSignalOpen, setBulkSignalOpen] = useState(false);
  const [bulkSignalName, setBulkSignalName] = useState("approveDeposit");
  const [bulkSignalArgs, setBulkSignalArgs] = useState("[]");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  const { data: capabilities } = useTemporalCapabilities();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useTemporalWorkflows({
      followMode,
      namespace,
      query,
    });

  const { bulkAction } = useTemporalActions(namespace);

  const executions = useMemo(() => data?.executions ?? [], [data?.executions]);
  const countsByStatus = data?.countsByStatus ?? {};
  const totalCount = data?.totalCount ?? executions.length;

  const rowKey = (exec: TemporalWorkflowExecution) =>
    `${exec.workflowId}::${exec.runId}`;

  const activeStatusFilter = useMemo<TemporalWorkflowStatus | "All">(() => {
    const match = query.trim().match(/^ExecutionStatus\s*=\s*"([A-Za-z]+)"$/);
    if (!match) return "All";
    return match[1] as TemporalWorkflowStatus;
  }, [query]);

  const knownWorkflowTypes = useMemo(
    () => Array.from(new Set(executions.map((e) => e.workflowType))),
    [executions],
  );
  const knownTaskQueues = useMemo(
    () => Array.from(new Set(executions.map((e) => e.taskQueue))),
    [executions],
  );

  const toggleSelect = useCallback((key: string) => {
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

  // Keyboard navigation (j/k, Space, Enter, /)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.key === "/" && !inInput) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (inInput || executions.length === 0) return;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((i) => Math.min(executions.length - 1, i + 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((i) => Math.max(0, i - 1));
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

  const runBulkAction = async (
    action: TemporalBulkActionKind,
    opts?: { signalArgs?: unknown[]; signalName?: string },
  ) => {
    if (selectedExecutions.length === 0) return;
    try {
      const res = await bulkAction.mutateAsync({
        action,
        items: selectedExecutions.map((e) => ({
          runId: e.runId,
          workflowId: e.workflowId,
        })),
        reason: `Bulk ${action} via Prisma Studio`,
        ...(opts?.signalName
          ? { signalArgs: opts.signalArgs, signalName: opts.signalName }
          : {}),
      });
      if (res.failed === 0) {
        toast.success(`Bulk ${action}: ${res.succeeded} workflow(s) updated`);
      } else {
        toast.warning(
          `Bulk ${action}: ${res.succeeded} succeeded, ${res.failed} failed`,
        );
      }
      setSelectedKeys(new Set());
      setBulkSignalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Bulk ${action} failed`);
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="temporal-workflows-grid"
    >
      <StudioHeader
        title="Workflows"
        endContent={
          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                >
                  <Bookmark className="mr-1 size-3" />
                  Views
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1.5">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Saved Visibility Views
                </div>
                {SAVED_VIEWS.map((view) => (
                  <button
                    key={view.label}
                    type="button"
                    onClick={() => {
                      setDraftQuery(view.query);
                      onQueryChange(view.query);
                    }}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
                  >
                    <span>{view.label}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <div className="inline-flex rounded-md border border-border bg-secondary p-0.5 text-[11px]">
              {(["paused", "live", "tail"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onFollowModeChange(mode)}
                  className={cn(
                    "rounded px-2 py-0.5 capitalize transition-colors",
                    followMode === mode
                      ? "bg-background font-medium text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void refetch()}
              aria-label="Refresh workflows"
            >
              <RefreshCw
                className={cn("size-3.5", isFetching && "animate-spin")}
              />
            </Button>

            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() =>
                onOpenStart({
                  taskQueue: knownTaskQueues[0],
                  workflowType: knownWorkflowTypes[0],
                })
              }
              data-testid="temporal-start-workflow-btn"
            >
              <Plus className="mr-1 size-3.5" />
              Start
            </Button>
          </div>
        }
      >
        <form
          className="relative flex max-w-xl flex-1 items-center"
          onSubmit={(e) => {
            e.preventDefault();
            onQueryChange(draftQuery.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder='Visibility query (e.g. TaskQueue = "billing" AND ExecutionStatus = "Failed")'
            className="h-8 pr-7 pl-8 font-mono text-xs"
            data-testid="temporal-visibility-search"
          />
          {draftQuery.length > 0 ? (
            <button
              type="button"
              aria-label="Clear visibility query"
              onClick={() => {
                setDraftQuery("");
                onQueryChange("");
              }}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </form>
      </StudioHeader>

      {/* Status Filter Pills Strip */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-secondary/40 px-3 py-1.5">
        {STATUS_FILTERS.map((item) => {
          const count =
            item.status === "All"
              ? totalCount
              : (countsByStatus[item.status] ?? 0);
          const isActive = activeStatusFilter === item.status;

          if (item.status !== "All" && count === 0 && !isActive) {
            return null;
          }

          return (
            <button
              key={item.status}
              type="button"
              onClick={() => {
                const nextQuery =
                  item.status === "All"
                    ? ""
                    : `ExecutionStatus = "${item.status}"`;
                setDraftQuery(nextQuery);
                onQueryChange(nextQuery);
              }}
              data-testid={`temporal-status-pill-${item.status}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums transition-colors",
                isActive
                  ? "border-primary bg-background text-foreground shadow-2xs"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {item.status !== "All" ? (
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    statusDotClasses(item.status),
                  )}
                />
              ) : null}
              <span>{item.label}</span>
              <span className="font-mono text-[10.5px] opacity-80">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Workflows Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-9 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-xs text-muted-foreground">
            <p className="font-medium text-destructive">
              {error instanceof Error
                ? error.message
                : "Failed to load workflows"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-xs text-muted-foreground">
            <p>
              No workflows found in namespace{" "}
              <code className="font-mono text-foreground">{namespace}</code>
              {query ? ` matching ${query}` : ""}.
            </p>
            <div className="flex gap-2">
              {query ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDraftQuery("");
                    onQueryChange("");
                  }}
                >
                  Clear Filter
                </Button>
              ) : null}
              <Button size="sm" onClick={() => onOpenStart(null)}>
                <Plus className="mr-1 size-3.5" />
                Start Workflow
              </Button>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-secondary/95 backdrop-blur-xs">
              <tr className="border-b border-border text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-9 px-3 py-2 text-left">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all workflows"
                  />
                </th>
                <th className="w-7 py-2" />
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Workflow</th>
                <th className="px-2 py-2 text-left">Task Queue</th>
                <th className="px-2 py-2 text-left">Started</th>
                <th className="px-2 py-2 text-right">Duration</th>
                <th className="px-3 py-2 text-right">Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {executions.map((exec, index) => {
                const key = rowKey(exec);
                const isSelected = selectedKeys.has(key);
                const isExpanded = expandedKey === key;
                const isFocused = focusedIndex === index;

                return (
                  <WorkflowGridRow
                    key={key}
                    execution={exec}
                    isExpanded={isExpanded}
                    isFocused={isFocused}
                    isSelected={isSelected}
                    namespace={namespace}
                    onClone={(preset) => onOpenStart(preset)}
                    onFocus={() => setFocusedIndex(index)}
                    onOpen={() => onOpenExecution(exec.workflowId, exec.runId)}
                    onToggleExpand={() =>
                      setExpandedKey((prev) => (prev === key ? null : key))
                    }
                    onToggleSelect={() => toggleSelect(key)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Multi-Select Bulk Action Bar */}
      {selectedExecutions.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t border-primary/50 bg-secondary px-4 py-2 text-xs"
          data-testid="temporal-bulk-bar"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              {selectedExecutions.length} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedKeys(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={bulkAction.isPending}
              onClick={() => setBulkSignalOpen(true)}
            >
              <Send className="mr-1 size-3" />
              Bulk Signal
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={bulkAction.isPending}
              onClick={() => void runBulkAction("cancel")}
            >
              <XCircle className="mr-1 size-3" />
              Bulk Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              disabled={bulkAction.isPending}
              onClick={() => void runBulkAction("terminate")}
            >
              <StopCircle className="mr-1 size-3" />
              Bulk Terminate
            </Button>
          </div>
        </div>
      ) : null}

      {/* Footer Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            Showing{" "}
            <strong className="text-foreground">{executions.length}</strong> of{" "}
            <strong className="text-foreground">{totalCount}</strong> executions
          </span>
          {capabilities ? (
            <span className="hidden font-mono sm:inline">
              · {capabilities.serverKind} ({capabilities.persistenceStore} ·{" "}
              {capabilities.shardCount}{" "}
              {capabilities.shardCount === 1 ? "shard" : "shards"})
            </span>
          ) : null}
        </div>
        <span className="hidden font-mono text-[10.5px] md:inline">
          j/k nav · Space select · Enter inspect · / search
        </span>
      </div>

      {/* Bulk Signal Dialog */}
      <Dialog open={bulkSignalOpen} onOpenChange={setBulkSignalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Bulk Signal ({selectedExecutions.length} workflows)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Send the same signal to all selected workflow executions in
              namespace <code className="font-mono">{namespace}</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-sig-name" className="text-xs">
                Signal Name
              </Label>
              <Input
                id="bulk-sig-name"
                value={bulkSignalName}
                onChange={(e) => setBulkSignalName(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-sig-args" className="text-xs">
                Signal Arguments (JSON)
              </Label>
              <Textarea
                id="bulk-sig-args"
                value={bulkSignalArgs}
                onChange={(e) => setBulkSignalArgs(e.target.value)}
                rows={3}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkSignalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!bulkSignalName.trim() || bulkAction.isPending}
              onClick={() => {
                const parsed = parseJsonArgsText(bulkSignalArgs);
                if (parsed.error) {
                  toast.error(parsed.error);
                  return;
                }
                void runBulkAction("signal", {
                  signalArgs: parsed.args,
                  signalName: bulkSignalName.trim(),
                });
              }}
            >
              Send Signal to {selectedExecutions.length} Runs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkflowGridRow(props: {
  execution: TemporalWorkflowExecution;
  isExpanded: boolean;
  isFocused: boolean;
  isSelected: boolean;
  namespace: string;
  onClone: (preset: TemporalStartPreset) => void;
  onFocus: () => void;
  onOpen: () => void;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}) {
  const {
    execution,
    namespace,
    isExpanded,
    isSelected,
    isFocused,
    onToggleSelect,
    onToggleExpand,
    onOpen,
    onClone,
    onFocus,
  } = props;

  const { data: detail, isLoading: isDetailLoading } =
    useTemporalWorkflowDetail({
      enabled: isExpanded,
      followMode: "paused",
      namespace,
      runId: execution.runId,
      workflowId: execution.workflowId,
    });

  return (
    <>
      <tr
        onClick={onFocus}
        className={cn(
          "transition-colors hover:bg-secondary/50",
          isSelected && "bg-primary/5",
          isFocused && "bg-secondary/40",
        )}
        data-testid={`temporal-wf-row-${execution.workflowId}`}
      >
        <td className="px-3 py-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={`Select ${execution.workflowId}`}
          />
        </td>
        <td className="py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-label={`Expand ${execution.workflowId}`}
            data-testid={`temporal-expand-${execution.workflowId}`}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        </td>
        <td className="px-2 py-2">
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 text-[10.5px]",
              statusBadgeClasses(execution.status),
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                statusDotClasses(execution.status),
              )}
            />
            {execution.status}
          </Badge>
        </td>
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="group flex items-baseline gap-2 text-left"
          >
            <span className="font-semibold text-foreground group-hover:underline">
              {execution.workflowType}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {execution.workflowId}
            </span>
          </button>
        </td>
        <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">
          {execution.taskQueue}
        </td>
        <td
          className="px-2 py-2 text-[11px] text-muted-foreground"
          title={execution.startTime}
        >
          {formatRelativeTime(execution.startTime)}
        </td>
        <td className="px-2 py-2 text-right font-mono text-[11px] tabular-nums text-foreground">
          {formatDuration(execution.durationMs)}
        </td>
        <td className="px-3 py-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {execution.historyLength}
        </td>
      </tr>

      {isExpanded ? (
        <tr
          className="bg-secondary/30"
          data-testid={`temporal-expanded-${execution.workflowId}`}
        >
          <td colSpan={8} className="px-6 py-3">
            {isDetailLoading || !detail ? (
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-border bg-card p-2.5">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Input Payload
                      {Object.keys(detail.execution.memo).length > 0
                        ? ` · Memo: ${Object.entries(detail.execution.memo)
                            .map(([k, v]) => `${k}=${String(v)}`)
                            .join(", ")}`
                        : ""}
                    </div>
                    <pre className="max-h-28 overflow-auto font-mono text-[11px] text-foreground">
                      {safeJsonPretty(detail.input)}
                    </pre>
                  </div>

                  <div className="rounded-md border border-border bg-card p-2.5">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {detail.failure
                        ? "Failure"
                        : detail.execution.pendingActivities?.some(
                              (a) => a.lastFailure,
                            )
                          ? "Retrying Pending Activity"
                          : "Result / Latest State"}
                    </div>
                    {detail.failure ? (
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-destructive">
                        {detail.failure.type ? `${detail.failure.type}: ` : ""}
                        {detail.failure.message}
                      </pre>
                    ) : detail.execution.pendingActivities?.length ? (
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-amber-700 dark:text-amber-400">
                        {detail.execution.pendingActivities
                          .map(
                            (a) =>
                              `${a.activityType} (attempt ${a.attempt}${a.maximumAttempts > 0 ? `/${a.maximumAttempts}` : ""})${a.lastFailure ? `: ${a.lastFailure.message}` : ""}`,
                          )
                          .join("\n")}
                      </pre>
                    ) : (
                      <pre className="max-h-28 overflow-auto font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                        {detail.result !== undefined
                          ? safeJsonPretty(detail.result)
                          : `${detail.spans.length} spans · ${detail.execution.status}`}
                      </pre>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={onOpen}>
                    <ExternalLink className="mr-1 size-3" />
                    Open Execution Debugger
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const args =
                        detail.input === undefined
                          ? []
                          : Array.isArray(detail.input)
                            ? detail.input
                            : [detail.input];
                      onClone({
                        args,
                        clonedFromWorkflowId: execution.workflowId,
                        taskQueue: execution.taskQueue,
                        workflowType: execution.workflowType,
                      });
                    }}
                  >
                    <Play className="mr-1 size-3" />
                    Clone &amp; Re-run
                  </Button>
                </div>
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
