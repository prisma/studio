import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  StopCircle,
  Terminal,
  Waves,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { TemporalFollowMode, TemporalGroupedSpan } from "@/data/temporal";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { Textarea } from "@/ui/components/ui/textarea";
import { useNavigation } from "@/ui/hooks/use-navigation";
import {
  useTemporalActions,
  useTemporalWorkflowDetail,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { useStudio } from "../../context";
import { StudioHeader } from "../../StudioHeader";
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  parseJsonArgsText,
  safeJsonPretty,
  spanBarClasses,
} from "./temporal-utils";
import {
  TemporalConfirmDialog,
  TemporalFollowControl,
  WorkflowStatusBadge,
} from "./TemporalPrimitives";
import type { TemporalStartPreset } from "./TemporalStartSheet";

interface TemporalExecutionDebuggerProps {
  followMode: TemporalFollowMode;
  namespace: string;
  onBack: () => void;
  onClone: (preset: TemporalStartPreset) => void;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  runId?: string;
  workflowId: string;
}

export function TemporalExecutionDebugger(
  props: TemporalExecutionDebuggerProps,
) {
  const {
    namespace,
    workflowId,
    runId,
    followMode,
    onBack,
    onClone,
    onFollowModeChange,
    onOpenExecution,
  } = props;

  const { data, isLoading, isError, error, refetch, isFetching } =
    useTemporalWorkflowDetail({
      followMode,
      namespace,
      runId,
      workflowId,
    });

  const { hasDatabase, streamsUrl } = useStudio();
  const { setSearchParam, setStreamParam, setViewParam } = useNavigation();
  const {
    queryWorkflow,
    resetStickyTaskQueue,
    signalWorkflow,
    updateWorkflow,
    cancelWorkflow,
    terminateWorkflow,
  } = useTemporalActions(namespace);

  const [historyTab, setHistoryTab] = useState<"grouped" | "raw">("grouped");
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [rawFilter, setRawFilter] = useState("");
  const [expandedRawId, setExpandedRawId] = useState<number | null>(null);
  const [terminateConfirmOpen, setTerminateConfirmOpen] = useState(false);

  // Right inspector state
  const [inspectorTab, setInspectorTab] = useState<
    "interact" | "pending" | "meta"
  >("interact");
  const [interactKind, setInteractKind] = useState<
    "query" | "signal" | "update"
  >("query");
  const [interactName, setInteractName] = useState("getState");
  const [interactArgs, setInteractArgs] = useState("[]");
  const [interactOutput, setInteractOutput] = useState<{
    durationMs?: number;
    error?: string;
    label: string;
    value?: unknown;
  } | null>(null);

  const execution = data?.execution;
  const spans = useMemo(() => data?.spans ?? [], [data?.spans]);
  const rawEvents = useMemo(() => data?.rawEvents ?? [], [data?.rawEvents]);
  const totalDurationMs = data?.totalDurationMs ?? 1;

  // Match default query/signal name to the inspected WorkflowType
  useEffect(() => {
    if (!execution?.workflowType) return;
    if (interactKind === "query") {
      setInteractName(
        execution.workflowType === "MoneyTransfer"
          ? "transferStatus"
          : execution.workflowType === "ChargeOrder"
            ? "orderStatus"
            : "getState",
      );
    } else if (interactKind === "signal") {
      setInteractName(
        execution.workflowType === "MoneyTransfer"
          ? "approveDeposit"
          : execution.workflowType === "SubscriptionRenewal"
            ? "renewNow"
            : "cancelOrder",
      );
    }
  }, [execution?.workflowType, interactKind]);

  const retryingActivity = useMemo(
    () =>
      execution?.pendingActivities?.find((pa) => pa.lastFailure != null) ??
      null,
    [execution?.pendingActivities],
  );

  const filteredRawEvents = useMemo(() => {
    const q = rawFilter.trim().toLowerCase();
    if (!q) return rawEvents;
    return rawEvents.filter(
      (evt) =>
        evt.eventType.toLowerCase().includes(q) ||
        String(evt.eventId).includes(q) ||
        JSON.stringify(evt.attributes).toLowerCase().includes(q),
    );
  }, [rawEvents, rawFilter]);

  const handleDownloadReplayJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.rawHistoryJson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflowId}-${execution?.runId?.slice(0, 8) ?? "history"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded replay history JSON");
  };

  const handleCopyCli = async () => {
    const cmd = `temporal workflow show --namespace ${namespace} --workflow-id ${workflowId}${execution?.runId ? ` --run-id ${execution.runId}` : ""}`;
    try {
      await navigator.clipboard.writeText(cmd);
      toast.success("Copied temporal CLI command");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleClone = () => {
    if (!execution) return;
    const args =
      data?.input === undefined
        ? []
        : Array.isArray(data.input)
          ? data.input
          : [data.input];
    onClone({
      args,
      clonedFromWorkflowId: execution.workflowId,
      taskQueue: execution.taskQueue,
      workflowType: execution.workflowType,
    });
  };

  const handleRunInteraction = async () => {
    const parsed = parseJsonArgsText(interactArgs);
    if (parsed.error) {
      setInteractOutput({ error: parsed.error, label: "Invalid JSON" });
      return;
    }
    const name = interactName.trim();
    if (!name) {
      setInteractOutput({ error: "Enter a name first", label: "Validation" });
      return;
    }

    try {
      if (interactKind === "query") {
        const res = await queryWorkflow.mutateAsync({
          args: parsed.args,
          queryType: name,
          runId: execution?.runId,
          workflowId,
        });
        setInteractOutput({
          durationMs: res.durationMs,
          label: `Query "${name}"`,
          value: res.rejected
            ? { rejected: true, status: res.rejectedStatus }
            : res.result,
        });
      } else if (interactKind === "signal") {
        await signalWorkflow.mutateAsync({
          args: parsed.args,
          runId: execution?.runId,
          signalName: name,
          workflowId,
        });
        setInteractOutput({
          label: `Signal "${name}" delivered`,
          value: { ok: true, signal: name },
        });
        toast.success(`Sent signal "${name}" to ${workflowId}`);
      } else {
        const res = await updateWorkflow.mutateAsync({
          args: parsed.args,
          runId: execution?.runId,
          updateName: name,
          workflowId,
        });
        setInteractOutput({
          durationMs: res.durationMs,
          error: res.failure?.message,
          label: `Update "${name}" (${res.outcome})`,
          value: res.result,
        });
      }
    } catch (err) {
      setInteractOutput({
        error: err instanceof Error ? err.message : String(err),
        label: `${interactKind} failed`,
      });
    }
  };

  const isRunning = execution?.status === "Running";

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="temporal-execution-debugger"
    >
      <StudioHeader
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
              onClick={() => void refetch()}
              aria-label="Refresh execution"
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  isFetching && "motion-safe:animate-spin",
                )}
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={handleClone}
              disabled={!execution}
              data-testid="temporal-clone-btn"
            >
              <Play className="mr-1 size-3" />
              Clone &amp; Re-run
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  aria-label="Workflow actions"
                  data-testid="temporal-debugger-actions"
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  disabled={!data}
                  onClick={handleDownloadReplayJson}
                >
                  <Download className="mr-2 size-3.5" />
                  Download Replay JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleCopyCli()}>
                  <Terminal className="mr-2 size-3.5" />
                  Copy temporal CLI
                </DropdownMenuItem>
                {execution ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void resetStickyTaskQueue
                        .mutateAsync({ runId: execution.runId, workflowId })
                        .then(() =>
                          toast.success(`Sticky queue reset for ${workflowId}`),
                        )
                        .catch((e) =>
                          toast.error(
                            e instanceof Error ? e.message : String(e),
                          ),
                        )
                    }
                  >
                    <RotateCcw className="mr-2 size-3.5" />
                    Reset Sticky Queue
                  </DropdownMenuItem>
                ) : null}
                {isRunning && execution ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        void cancelWorkflow
                          .mutateAsync({ runId: execution.runId, workflowId })
                          .then(() =>
                            toast.success(`Cancel requested for ${workflowId}`),
                          )
                          .catch((e) =>
                            toast.error(
                              e instanceof Error ? e.message : String(e),
                            ),
                          )
                      }
                    >
                      <XCircle className="mr-2 size-3.5" />
                      Request Cancel
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setTerminateConfirmOpen(true)}
                    >
                      <StopCircle className="mr-2 size-3.5" />
                      Terminate Workflow
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
            onClick={onBack}
            data-testid="temporal-back-to-grid"
          >
            <ArrowLeft className="mr-1 size-3.5" />
            Workflows
          </Button>
          {execution ? (
            <>
              <WorkflowStatusBadge
                status={execution.status}
                className="shrink-0"
              />
              <span className="truncate text-sm font-semibold text-foreground">
                {execution.workflowType}
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {execution.workflowId}
              </span>
              <button
                type="button"
                aria-label={`Copy run ID ${execution.runId}`}
                className="hidden shrink-0 items-center gap-1 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground xl:inline-flex"
                onClick={() => {
                  void navigator.clipboard.writeText(execution.runId);
                  toast.success("Copied Run ID");
                }}
                title={`Run ID: ${execution.runId}`}
              >
                run {execution.runId.slice(0, 8)}
                <Copy className="size-2.5" />
              </button>
            </>
          ) : (
            <span className="truncate font-mono text-xs text-muted-foreground">
              {workflowId}
            </span>
          )}
        </div>
      </StudioHeader>

      {isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : isError || !data || !execution ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-destructive">
            {error instanceof Error
              ? error.message
              : "Could not load workflow execution"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Metadata summary + Lineage strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-1.5 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Queue:{" "}
                <strong className="font-mono text-foreground">
                  {execution.taskQueue}
                </strong>
              </span>
              <span>
                Duration:{" "}
                <strong className="font-mono text-foreground">
                  {formatDuration(execution.durationMs)}
                </strong>
              </span>
              <span>
                History:{" "}
                <strong className="font-mono text-foreground">
                  {execution.historyLength} events
                </strong>{" "}
                ({formatBytes(execution.historySizeBytes)})
              </span>
              <span>Started {formatRelativeTime(execution.startTime)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {execution.parentWorkflowId ? (
                <button
                  type="button"
                  onClick={() => {
                    if (execution.parentWorkflowId) {
                      onOpenExecution(
                        execution.parentWorkflowId,
                        execution.parentRunId,
                      );
                    }
                  }}
                  className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[10.5px] text-prism-cyan-600 hover:underline dark:text-prism-cyan-400"
                >
                  Parent: {execution.parentWorkflowId} ↗
                </button>
              ) : null}
              {typeof streamsUrl === "string" ? (
                <button
                  type="button"
                  onClick={() => {
                    void setStreamParam("app-events");
                    void setSearchParam(execution.workflowId);
                    void setViewParam("stream");
                  }}
                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
                >
                  <Waves className="size-3" />
                  Streams
                </button>
              ) : null}
              {hasDatabase ? (
                <button
                  type="button"
                  onClick={() => {
                    void setSearchParam(execution.workflowId);
                    void setViewParam("table");
                  }}
                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
                >
                  <Database className="size-3" />
                  Tables
                </button>
              ) : null}
            </div>
          </div>

          {/* Conditional Diagnostic Callout Strip */}
          {data.failure ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs"
              data-testid="temporal-failure-callout"
            >
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-destructive" />
                <span className="truncate font-medium text-destructive">
                  {data.failure.type ? `${data.failure.type}: ` : ""}
                  {data.failure.message}
                </span>
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={handleClone}>
                <Play className="mr-1 size-3" />
                Clone &amp; Re-run with Edits
              </Button>
            </div>
          ) : retryingActivity ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs"
              data-testid="temporal-retry-callout"
            >
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="truncate">
                  <strong className="text-amber-700 dark:text-amber-300">
                    Retrying Activity:
                  </strong>{" "}
                  <code className="font-mono">
                    {retryingActivity.activityType}
                  </code>{" "}
                  (attempt {retryingActivity.attempt}
                  {retryingActivity.maximumAttempts > 0
                    ? `/${retryingActivity.maximumAttempts}`
                    : ""}
                  ): {retryingActivity.lastFailure?.message}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setInspectorTab("pending")}
                >
                  Inspect Pending
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setInspectorTab("interact");
                    setInteractKind("signal");
                    setInteractName("approveDeposit");
                  }}
                >
                  Send Signal to Unblock
                </Button>
              </div>
            </div>
          ) : null}

          {/* Split Body: Left Timeline+Spans, Right Live Inspector */}
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_320px]">
            {/* Left Main Debugger Pane */}
            <div className="flex min-h-0 flex-col border-b border-border lg:border-r lg:border-b-0">
              {/* Synchronized Compact Gantt Timeline */}
              {spans.length > 0 ? (
                <div
                  className="border-b border-border bg-secondary/30 px-4 py-3"
                  data-testid="temporal-gantt-timeline"
                >
                  <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                    <span>0ms</span>
                    <span>{formatDuration(totalDurationMs * 0.25)}</span>
                    <span>{formatDuration(totalDurationMs * 0.5)}</span>
                    <span>{formatDuration(totalDurationMs * 0.75)}</span>
                    <span>{formatDuration(totalDurationMs)}</span>
                  </div>
                  <div className="max-h-36 space-y-1.5 overflow-y-auto">
                    {spans.map((span) => {
                      const leftPct = Math.min(
                        96,
                        (span.startOffsetMs / totalDurationMs) * 100,
                      );
                      const widthPct = Math.max(
                        1.8,
                        Math.min(
                          100 - leftPct,
                          (span.durationMs / totalDurationMs) * 100,
                        ),
                      );
                      const isSelected = selectedSpanId === span.id;

                      return (
                        <button
                          key={span.id}
                          type="button"
                          onClick={() => {
                            setHistoryTab("grouped");
                            setSelectedSpanId(isSelected ? null : span.id);
                          }}
                          className={cn(
                            "grid w-full grid-cols-[132px_1fr_54px] items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-secondary",
                            isSelected && "bg-secondary ring-1 ring-primary/40",
                          )}
                        >
                          <span className="truncate font-mono text-foreground">
                            {span.label}
                            {span.attempt && span.attempt > 1
                              ? ` ×${span.attempt}`
                              : ""}
                          </span>
                          <div className="relative h-3 overflow-hidden rounded bg-muted">
                            <div
                              className={cn(
                                "absolute top-0.5 bottom-0.5 rounded-xs",
                                spanBarClasses(span.kind, span.status),
                              )}
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                              }}
                            />
                          </div>
                          <span className="text-right font-mono text-[10px] text-muted-foreground">
                            {span.status === "retrying"
                              ? "retry"
                              : formatDuration(span.durationMs)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Grouped / Raw History Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-md border border-border bg-secondary p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setHistoryTab("grouped")}
                      className={cn(
                        "rounded px-2.5 py-0.5 font-medium transition-colors",
                        historyTab === "grouped"
                          ? "bg-background text-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Grouped Spans ({spans.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTab("raw")}
                      className={cn(
                        "rounded px-2.5 py-0.5 font-medium transition-colors",
                        historyTab === "raw"
                          ? "bg-background text-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Raw Events ({rawEvents.length})
                    </button>
                  </div>
                </div>
                {historyTab === "raw" ? (
                  <Input
                    value={rawFilter}
                    onChange={(e) => setRawFilter(e.target.value)}
                    placeholder="Filter raw events..."
                    className="h-7 w-52 text-xs"
                  />
                ) : null}
              </div>

              {/* Spans or Raw Events Scroll Area */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {historyTab === "grouped" ? (
                  spans.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      No activity, timer, signal, or child spans recorded yet.
                      Switch to Raw Events to inspect lifecycle events.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {spans.map((span) => (
                        <GroupedSpanRow
                          key={span.id}
                          isExpanded={selectedSpanId === span.id}
                          onToggle={() =>
                            setSelectedSpanId((prev) =>
                              prev === span.id ? null : span.id,
                            )
                          }
                          span={span}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <div className="divide-y divide-border">
                    {filteredRawEvents.map((evt) => {
                      const isExpanded = expandedRawId === evt.eventId;
                      return (
                        <div key={evt.eventId} className="text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRawId(isExpanded ? null : evt.eventId)
                            }
                            className="flex w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-secondary/50"
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="w-8 font-mono text-muted-foreground">
                              #{evt.eventId}
                            </span>
                            <span className="flex-1 truncate font-mono font-medium text-foreground">
                              {evt.eventType}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              +{formatDuration(evt.offsetMs)}
                            </span>
                          </button>
                          {isExpanded ? (
                            <pre className="overflow-x-auto border-t border-border bg-secondary/40 px-10 py-2 font-mono text-[11px] text-foreground">
                              {safeJsonPretty(evt.attributes)}
                            </pre>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Inspector Sheet: Interact / Pending / Meta */}
            <aside className="flex min-h-0 flex-col border-t border-border bg-card lg:border-t-0">
              <div
                role="tablist"
                aria-label="Execution inspector tabs"
                className="grid grid-cols-3 border-b border-border bg-secondary/40 text-xs"
              >
                {(
                  [
                    { id: "interact", label: "Interact" },
                    {
                      id: "pending",
                      label: `Pending (${execution.pendingActivities?.length ?? 0})`,
                    },
                    { id: "meta", label: "Meta" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === t.id}
                    onClick={() => setInspectorTab(t.id)}
                    className={cn(
                      "border-b-2 py-2 text-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      inspectorTab === t.id
                        ? "border-primary bg-card text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
                {inspectorTab === "interact" ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 rounded-md border border-border bg-secondary p-0.5 text-xs">
                      {(["query", "signal", "update"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            setInteractKind(k);
                            setInteractOutput(null);
                            if (k === "query") {
                              setInteractName(
                                execution.workflowType === "MoneyTransfer"
                                  ? "transferStatus"
                                  : "getState",
                              );
                            } else if (k === "signal") {
                              setInteractName(
                                execution.workflowType === "MoneyTransfer"
                                  ? "approveDeposit"
                                  : "renewNow",
                              );
                            } else {
                              setInteractName("setLimit");
                            }
                          }}
                          className={cn(
                            "rounded py-1 capitalize font-medium transition-colors",
                            interactKind === k
                              ? "bg-background text-foreground shadow-2xs"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {k}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="temporal-interact-name"
                        className="text-[11px] uppercase tracking-wide text-muted-foreground"
                      >
                        {interactKind} Name
                      </Label>
                      <Input
                        id="temporal-interact-name"
                        value={interactName}
                        onChange={(e) => setInteractName(e.target.value)}
                        className="h-8 font-mono text-xs"
                        placeholder={
                          interactKind === "query"
                            ? "transferStatus"
                            : interactKind === "signal"
                              ? "approveDeposit"
                              : "setLimit"
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="temporal-interact-args"
                        className="text-[11px] uppercase tracking-wide text-muted-foreground"
                      >
                        Arguments (JSON)
                      </Label>
                      <Textarea
                        id="temporal-interact-args"
                        value={interactArgs}
                        onChange={(e) => setInteractArgs(e.target.value)}
                        rows={3}
                        className="font-mono text-xs"
                        spellCheck={false}
                      />
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      disabled={
                        queryWorkflow.isPending ||
                        signalWorkflow.isPending ||
                        updateWorkflow.isPending
                      }
                      onClick={() => void handleRunInteraction()}
                      data-testid="temporal-interact-submit"
                    >
                      <Send className="mr-1.5 size-3.5" />
                      {interactKind === "query"
                        ? "Run Live Query"
                        : interactKind === "signal"
                          ? "Send Signal"
                          : "Execute Update"}
                    </Button>

                    {interactOutput ? (
                      <div
                        className="space-y-1 rounded-md border border-border bg-secondary/40 p-2.5"
                        data-testid="temporal-interact-output"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-foreground">
                            {interactOutput.label}
                          </span>
                          {interactOutput.durationMs != null ? (
                            <span className="font-mono text-muted-foreground">
                              {interactOutput.durationMs}ms
                            </span>
                          ) : null}
                        </div>
                        {interactOutput.error ? (
                          <pre className="whitespace-pre-wrap font-mono text-[11px] text-destructive">
                            {interactOutput.error}
                          </pre>
                        ) : (
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                            {safeJsonPretty(interactOutput.value)}
                          </pre>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : inspectorTab === "pending" ? (
                  <div className="space-y-3 text-xs">
                    {!execution.pendingActivities ||
                    execution.pendingActivities.length === 0 ? (
                      <p className="text-muted-foreground">
                        No pending activities.
                      </p>
                    ) : (
                      execution.pendingActivities.map((pa) => (
                        <div
                          key={pa.activityId}
                          className="space-y-1.5 rounded-md border border-border bg-secondary/40 p-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <strong className="font-mono">
                              {pa.activityType}
                            </strong>
                            <Badge variant="outline" className="text-[10px]">
                              Attempt {pa.attempt}
                              {pa.maximumAttempts > 0
                                ? `/${pa.maximumAttempts}`
                                : ""}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            ID:{" "}
                            <span className="font-mono">{pa.activityId}</span> ·{" "}
                            State: {pa.state}
                          </div>
                          {pa.lastFailure ? (
                            <div className="rounded border border-destructive/40 bg-destructive/10 p-1.5 font-mono text-[10.5px] text-destructive">
                              {pa.lastFailure.message}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Workflow Input
                      </div>
                      <pre className="max-h-40 overflow-auto rounded border border-border bg-secondary/40 p-2 font-mono text-[11px]">
                        {safeJsonPretty(data.input)}
                      </pre>
                    </div>
                    {data.result !== undefined ? (
                      <div>
                        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Workflow Result
                        </div>
                        <pre className="max-h-40 overflow-auto rounded border border-border bg-secondary/40 p-2 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                          {safeJsonPretty(data.result)}
                        </pre>
                      </div>
                    ) : null}
                    {data.failure ? (
                      <div>
                        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-destructive">
                          Failure &amp; Stack Trace
                        </div>
                        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded border border-destructive/40 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
                          {data.failure.message}
                          {data.failure.stackTrace
                            ? `\n\n${data.failure.stackTrace}`
                            : ""}
                        </pre>
                      </div>
                    ) : null}
                    {Object.keys(execution.memo).length > 0 ? (
                      <div>
                        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Memo
                        </div>
                        <pre className="overflow-auto rounded border border-border bg-secondary/40 p-2 font-mono text-[11px]">
                          {safeJsonPretty(execution.memo)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      <TemporalConfirmDialog
        confirmLabel="Terminate workflow"
        defaultReason="Terminated via Prisma Studio"
        description={`Terminate ${workflowId}? The execution stops immediately without running cleanup logic.`}
        isPending={terminateWorkflow.isPending}
        onConfirm={async (reason) => {
          if (!execution) return;
          await terminateWorkflow.mutateAsync({
            reason: reason || "Terminated via Prisma Studio",
            runId: execution.runId,
            workflowId,
          });
          toast.success(`Terminated ${workflowId}`);
        }}
        onOpenChange={setTerminateConfirmOpen}
        open={terminateConfirmOpen}
        reasonLabel="Termination Reason"
        showReasonInput
        title="Terminate workflow execution?"
      />
    </div>
  );
}

function GroupedSpanRow(props: {
  isExpanded: boolean;
  onToggle: () => void;
  span: TemporalGroupedSpan;
}) {
  const { span, isExpanded, onToggle } = props;
  const eventRange =
    span.closedEventId && span.closedEventId !== span.startedEventId
      ? `#${span.startedEventId}–${span.closedEventId}`
      : `#${span.startedEventId}`;

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "grid w-full grid-cols-[18px_58px_1fr_76px_64px] items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-secondary/50",
          isExpanded && "bg-secondary/70",
        )}
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
        <span className="font-mono text-[11px] text-muted-foreground">
          {eventRange}
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono font-medium text-foreground">
            {span.label}
          </span>
          {span.summary ? (
            <span className="truncate text-[11px] text-muted-foreground">
              {span.summary}
            </span>
          ) : null}
        </div>
        <div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] capitalize",
              span.status === "completed" || span.status === "fired"
                ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                : span.status === "failed"
                  ? "border-destructive/50 text-destructive"
                  : span.status === "retrying" || span.status === "timed-out"
                    ? "border-amber-500/50 text-amber-700 dark:text-amber-400"
                    : "border-sky-500/40 text-sky-600 dark:text-sky-400",
            )}
          >
            {span.status}
          </Badge>
        </div>
        <span className="text-right font-mono text-[11px] text-muted-foreground">
          {formatDuration(span.durationMs)}
        </span>
      </button>

      {isExpanded ? (
        <div className="grid grid-cols-1 gap-3 border-t border-border bg-secondary/30 px-10 py-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Input{" "}
              {span.queueWaitMs != null
                ? `· queue wait ${formatDuration(span.queueWaitMs)}`
                : ""}
            </div>
            <pre className="max-h-40 overflow-auto rounded border border-border bg-card p-2 font-mono text-[11px]">
              {safeJsonPretty(span.input)}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {span.error ? "Failure" : "Output"}
            </div>
            {span.error ? (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-destructive/40 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
                {span.error.type ? `${span.error.type}: ` : ""}
                {span.error.message}
                {span.error.stackTrace ? `\n\n${span.error.stackTrace}` : ""}
              </pre>
            ) : (
              <pre className="max-h-40 overflow-auto rounded border border-border bg-card p-2 font-mono text-[11px]">
                {safeJsonPretty(span.output)}
              </pre>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
