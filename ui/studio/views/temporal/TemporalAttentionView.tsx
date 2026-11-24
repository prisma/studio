import {
  CircleCheck,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  StopCircle,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  TemporalAttentionItem,
  TemporalAttentionKind,
  TemporalFollowMode,
} from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Checkbox } from "@/ui/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
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
  useTemporalAttention,
  useTemporalCapabilities,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import { formatRelativeTime, pluralize, summarizeIds } from "./temporal-utils";
import {
  TemporalConfirmDialog,
  TemporalFollowControl,
  temporalIconScale,
  TemporalNamespaceBadge,
  TemporalSectionLabel,
  temporalTableHeadClass,
  TemporalTime,
  type TemporalTone,
  WorkflowStatusIcon,
} from "./TemporalPrimitives";

/** The groups in the order a person on call would work through them. */
const GROUPS: Array<{
  description: string;
  kind: TemporalAttentionKind;
  title: string;
  tone: TemporalTone;
}> = [
  {
    description:
      "The Workflow code throws or is not deterministic. These runs make no progress until the code is fixed.",
    kind: "workflow-task-failing",
    title: "Workflow Tasks Failing",
    tone: "danger",
  },
  {
    description:
      "A task waits and no Worker picks it up. Check that Workers poll the Task Queue.",
    kind: "no-worker",
    title: "Waiting for a Worker",
    tone: "danger",
  },
  {
    description:
      "An Activity failed and the server tries it again. It keeps trying until it succeeds or reaches its attempt limit.",
    kind: "activity-retrying",
    title: "Activities Retrying",
    tone: "warning",
  },
  {
    description:
      "These runs take much longer than closed runs of the same Workflow Type.",
    kind: "long-running",
    title: "Running Longer Than Usual",
    tone: "warning",
  },
  {
    description: "Runs that failed or timed out in the last hour.",
    kind: "failed",
    title: "Failed in the Last Hour",
    tone: "muted",
  },
];

const TONE_DOT: Record<TemporalTone, string> = {
  danger: "bg-destructive",
  info: "bg-prism-cyan-500",
  muted: "bg-muted-foreground/50",
  neutral: "bg-prism-cyan-500",
  warning: "bg-amber-500",
};

function runKey(item: Pick<TemporalAttentionItem, "runId" | "workflowId">) {
  return `${item.workflowId}::${item.runId}`;
}

export function TemporalAttentionView(props: {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
}) {
  const { followMode, namespace, onFollowModeChange, onOpenExecution } = props;
  const { data, error, isError, isFetching, isLoading, refetch } =
    useTemporalAttention({ followMode, namespace });
  const { data: capabilities } = useTemporalCapabilities();
  const {
    activityOperation,
    bulkAction,
    cancelWorkflow,
    resetStickyTaskQueue,
    terminateWorkflow,
  } = useTemporalActions(namespace);
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkTerminateOpen, setBulkTerminateOpen] = useState(false);
  const [terminateTarget, setTerminateTarget] =
    useState<TemporalAttentionItem | null>(null);

  // One run can have two problems; the summary counts runs.
  const openRunsByKey = useMemo(() => {
    const map = new Map<string, TemporalAttentionItem>();
    for (const item of items) {
      if (item.kind !== "failed") {
        map.set(runKey(item), item);
      }
    }
    return map;
  }, [items]);
  const openProblems = openRunsByKey.size;
  const selectedRuns = useMemo(
    () =>
      [...selectedKeys]
        .map((key) => openRunsByKey.get(key))
        .filter((item): item is TemporalAttentionItem => item !== undefined),
    [openRunsByKey, selectedKeys],
  );
  const selectedSummary = `${pluralize(selectedRuns.length, "workflow")} (${summarizeIds(selectedRuns.map((item) => item.workflowId))})`;

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectGroup = (groupItems: TemporalAttentionItem[]) => {
    const keys = Array.from(new Set(groupItems.map(runKey)));
    const allChosen = keys.length > 0 && keys.every((k) => selectedKeys.has(k));

    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (allChosen) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      return next;
    });
  };

  const runBulk = async (action: "cancel" | "terminate", reason?: string) => {
    if (selectedRuns.length === 0) {
      return;
    }

    try {
      const res = await bulkAction.mutateAsync({
        action,
        items: selectedRuns.map((item) => ({
          runId: item.runId,
          workflowId: item.workflowId,
        })),
        reason: reason || `Bulk ${action} from Needs Attention`,
      });
      toast.success(
        `Bulk ${action}: ${res.succeeded} succeeded${res.failed > 0 ? `, ${res.failed} failed` : ""}`,
      );
      setSelectedKeys(new Set());
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-attention-view"
    >
      <StudioHeader
        title="Needs Attention"
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
              aria-label="Refresh"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
          </>
        }
      >
        <TemporalNamespaceBadge namespace={namespace} />
      </StudioHeader>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        {data ? (
          <>
            <span>
              <span className="font-medium tabular-nums text-foreground">
                {openProblems}
              </span>{" "}
              of {pluralize(data.totalRunning, "running workflow")}{" "}
              {openProblems === 1 ? "needs" : "need"} attention
            </span>
            {data.checkedRunning < data.totalRunning ? (
              <span>
                Checked the {data.checkedRunning.toLocaleString("en-US")} oldest
              </span>
            ) : null}
            <span className="ml-auto">
              Checked{" "}
              {formatRelativeTime(
                new Date(Date.now() - data.ageMs).toISOString(),
              )}
            </span>
          </>
        ) : (
          <span>Checking every running workflow</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <p className="font-medium text-destructive">
              {error instanceof Error
                ? error.message
                : "Could not check the running workflows"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <CircleCheck className="size-6 opacity-60" />
            <p>
              No running workflow in{" "}
              <code className="font-mono text-foreground">{namespace}</code>{" "}
              needs attention.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {GROUPS.map((group) => {
              const groupItems = items.filter(
                (item) => item.kind === group.kind,
              );

              return groupItems.length > 0 ? (
                <AttentionGroup
                  key={group.kind}
                  description={group.description}
                  dotClassName={TONE_DOT[group.tone]}
                  items={groupItems}
                  kind={group.kind}
                  onActivityOp={(item, operation) => {
                    if (!item.activityId) {
                      return;
                    }
                    void activityOperation
                      .mutateAsync({
                        activityId: item.activityId,
                        operation,
                        runId: item.runId,
                        workflowId: item.workflowId,
                      })
                      .then(() => {
                        toast.success(
                          `Activity ${item.activityId}: ${operation} done`,
                        );
                        void refetch();
                      })
                      .catch((err) =>
                        toast.error(
                          err instanceof Error ? err.message : String(err),
                        ),
                      );
                  }}
                  onCancel={(item) => {
                    void cancelWorkflow
                      .mutateAsync({
                        runId: item.runId,
                        workflowId: item.workflowId,
                      })
                      .then(() => {
                        toast.success(
                          `Cancel requested for ${item.workflowId}`,
                        );
                        void refetch();
                      })
                      .catch((err) =>
                        toast.error(
                          err instanceof Error ? err.message : String(err),
                        ),
                      );
                  }}
                  onOpenExecution={onOpenExecution}
                  onResetSticky={(item) => {
                    void resetStickyTaskQueue
                      .mutateAsync({
                        runId: item.runId,
                        workflowId: item.workflowId,
                      })
                      .then(() => {
                        toast.success(
                          `Reset sticky queue for ${item.workflowId}`,
                        );
                        void refetch();
                      })
                      .catch((err) =>
                        toast.error(
                          err instanceof Error ? err.message : String(err),
                        ),
                      );
                  }}
                  onTerminate={(item) => setTerminateTarget(item)}
                  onToggleGroup={() => toggleSelectGroup(groupItems)}
                  onToggleSelect={(item) => toggleSelect(runKey(item))}
                  selectedKeys={selectedKeys}
                  supportsActivityOperations={
                    capabilities?.supportsActivityOperations === true
                  }
                  title={group.title}
                />
              ) : null;
            })}
          </div>
        )}
      </div>

      {selectedRuns.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2 text-xs"
          data-testid="temporal-attention-bulk-bar"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {selectedRuns.length} selected
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => setSelectedKeys(new Set())}
            >
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={bulkAction.isPending}
              onClick={() => setBulkCancelOpen(true)}
            >
              <XCircle />
              Request Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkAction.isPending}
              onClick={() => setBulkTerminateOpen(true)}
            >
              <StopCircle />
              Terminate
            </Button>
          </div>
        </div>
      ) : null}

      <TemporalConfirmDialog
        confirmLabel="Request Cancel"
        description={`This asks ${selectedSummary} to cancel. Each workflow can run its cleanup logic before it stops.`}
        isPending={bulkAction.isPending}
        onConfirm={() => runBulk("cancel")}
        onOpenChange={setBulkCancelOpen}
        open={bulkCancelOpen}
        title="Request cancellation?"
        variant="default"
      />

      <TemporalConfirmDialog
        confirmLabel={`Terminate ${pluralize(selectedRuns.length, "workflow")}`}
        defaultReason="Bulk terminated from Needs Attention"
        description={`This stops ${selectedSummary} immediately, without running cleanup logic.`}
        isPending={bulkAction.isPending}
        onConfirm={(reason) => runBulk("terminate", reason)}
        onOpenChange={setBulkTerminateOpen}
        open={bulkTerminateOpen}
        reasonLabel="Termination reason"
        showReasonInput
        title="Terminate selected workflows?"
      />

      <TemporalConfirmDialog
        confirmLabel="Terminate Execution"
        defaultReason="Terminated from Needs Attention"
        description={`This stops ${terminateTarget?.workflowId ?? ""} immediately, without running cleanup logic.`}
        isPending={terminateWorkflow.isPending}
        onConfirm={async (reason) => {
          if (!terminateTarget) {
            return;
          }
          await terminateWorkflow.mutateAsync({
            reason: reason || "Terminated from Needs Attention",
            runId: terminateTarget.runId,
            workflowId: terminateTarget.workflowId,
          });
          toast.success(`Terminated ${terminateTarget.workflowId}`);
          setTerminateTarget(null);
          void refetch();
        }}
        onOpenChange={(open) => {
          if (!open) {
            setTerminateTarget(null);
          }
        }}
        open={terminateTarget !== null}
        reasonLabel="Termination reason"
        showReasonInput
        title="Terminate workflow execution?"
      />
    </div>
  );
}

function AttentionGroup(props: {
  description: string;
  dotClassName: string;
  items: TemporalAttentionItem[];
  kind: TemporalAttentionKind;
  onActivityOp: (
    item: TemporalAttentionItem,
    operation: "pause" | "reset" | "unpause",
  ) => void;
  onCancel: (item: TemporalAttentionItem) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  onResetSticky: (item: TemporalAttentionItem) => void;
  onTerminate: (item: TemporalAttentionItem) => void;
  onToggleGroup: () => void;
  onToggleSelect: (item: TemporalAttentionItem) => void;
  selectedKeys: ReadonlySet<string>;
  supportsActivityOperations: boolean;
  title: string;
}) {
  const {
    description,
    dotClassName,
    items,
    kind,
    onActivityOp,
    onCancel,
    onOpenExecution,
    onResetSticky,
    onTerminate,
    onToggleGroup,
    onToggleSelect,
    selectedKeys,
    supportsActivityOperations,
    title,
  } = props;
  const isOpenGroup = kind !== "failed";
  // Some servers report only when the next attempt is due, not when the last one ended.
  const showNextAttempt =
    kind === "activity-retrying" && items.every((item) => !item.since);
  // The longest-standing problem first.
  const sorted = [...items].sort((a, b) =>
    kind === "failed"
      ? (b.since ?? "").localeCompare(a.since ?? "")
      : (a.since ?? "").localeCompare(b.since ?? ""),
  );
  const allSelected =
    isOpenGroup &&
    sorted.length > 0 &&
    sorted.every((item) => selectedKeys.has(runKey(item)));

  return (
    <section
      className="border-b border-border"
      data-testid={`temporal-attention-${kind}`}
    >
      <div className="flex flex-col gap-0.5 bg-muted/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", dotClassName)}
          />
          <TemporalSectionLabel className="text-foreground">
            {title}
          </TemporalSectionLabel>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {items.length}
          </span>
        </div>
        <p className="pl-4 text-2xs text-muted-foreground">{description}</p>
      </div>
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="border-border/70 hover:bg-transparent">
            {isOpenGroup ? (
              <TableHead className="h-9 w-10 pr-2 pl-4">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onToggleGroup}
                  aria-label={`Select all in ${title}`}
                />
              </TableHead>
            ) : null}
            <TableHead
              className={cn(
                temporalTableHeadClass,
                "w-[26%]",
                !isOpenGroup && "pl-4",
              )}
            >
              Workflow
            </TableHead>
            <TableHead className={temporalTableHeadClass}>Problem</TableHead>
            <TableHead className={cn(temporalTableHeadClass, "w-28")}>
              {kind === "failed"
                ? "Closed"
                : showNextAttempt
                  ? "Next Attempt"
                  : kind === "activity-retrying"
                    ? "Last Attempt"
                    : "Since"}
            </TableHead>
            <TableHead
              className={cn(
                temporalTableHeadClass,
                "w-24",
                !isOpenGroup && "pr-4",
              )}
            >
              Queue
            </TableHead>
            {isOpenGroup ? (
              <TableHead
                className={cn(temporalTableHeadClass, "w-20 pr-4 text-right")}
              >
                Actions
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item, index) => {
            const isSelected = isOpenGroup && selectedKeys.has(runKey(item));
            return (
              <TableRow
                key={`${item.runId}:${item.activityType ?? ""}:${index}`}
                data-state={isSelected ? "selected" : undefined}
                className="cursor-pointer border-border/60 hover:bg-muted/30 data-[state=selected]:bg-muted/50"
                onClick={() => onOpenExecution(item.workflowId, item.runId)}
              >
                {isOpenGroup ? (
                  <TableCell
                    className="py-1.5 pr-2 pl-4"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect(item)}
                      aria-label={`Select ${item.workflowId}`}
                    />
                  </TableCell>
                ) : null}
                <TableCell
                  className={cn("max-w-0 py-1.5 pr-2", !isOpenGroup && "pl-4")}
                >
                  <button
                    type="button"
                    className="flex h-6 max-w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={`${item.workflowId} (${item.workflowType})`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenExecution(item.workflowId, item.runId);
                    }}
                  >
                    <WorkflowStatusIcon status={item.status} />
                    {/* The ID keeps its room; the type gives way first. */}
                    <span className="min-w-12 shrink truncate font-mono text-foreground hover:underline">
                      {item.workflowId}
                    </span>
                    <span className="min-w-0 shrink-[4] truncate text-muted-foreground">
                      {item.workflowType}
                    </span>
                  </button>
                </TableCell>
                <TableCell className="max-w-0 px-2 py-2">
                  <span className="block truncate" title={item.detail}>
                    {kind === "activity-retrying" ? (
                      <>
                        <span className="font-mono font-medium text-foreground">
                          {item.activityType}
                        </span>{" "}
                        <span className="text-foreground">
                          attempt {item.attempt}
                          {item.maximumAttempts
                            ? ` of ${item.maximumAttempts}`
                            : ""}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {item.detail}
                          {!showNextAttempt &&
                          item.nextAttemptTime &&
                          Date.parse(item.nextAttemptTime) > Date.now()
                            ? ` · next attempt ${formatRelativeTime(item.nextAttemptTime)}`
                            : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-foreground">{item.detail}</span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                  <TemporalTime
                    iso={showNextAttempt ? item.nextAttemptTime : item.since}
                  />
                </TableCell>
                <TableCell
                  className={cn(
                    "py-2 pl-2 font-mono text-muted-foreground",
                    isOpenGroup ? "pr-2" : "pr-4",
                  )}
                >
                  {item.taskQueue}
                </TableCell>
                {isOpenGroup ? (
                  <TableCell
                    className="py-1.5 pr-4 pl-2 text-right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="w-7 px-0 text-muted-foreground"
                          aria-label={`Actions for ${item.workflowId}`}
                          data-testid={`temporal-attention-actions-${item.workflowId}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-52 [&_[role=menuitem]]:text-xs"
                      >
                        {supportsActivityOperations &&
                        kind === "activity-retrying" &&
                        item.activityId ? (
                          <>
                            <DropdownMenuItem
                              onClick={() => onActivityOp(item, "reset")}
                            >
                              <RotateCcw />
                              Reset Activity
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                onActivityOp(
                                  item,
                                  item.activityPaused ? "unpause" : "pause",
                                )
                              }
                            >
                              {item.activityPaused ? <Play /> : <Pause />}
                              {item.activityPaused
                                ? "Unpause Activity"
                                : "Pause Activity"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        ) : null}
                        <DropdownMenuItem onClick={() => onResetSticky(item)}>
                          <RotateCcw />
                          Reset Sticky Queue
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onCancel(item)}>
                          <XCircle />
                          Request Cancel
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => onTerminate(item)}
                        >
                          <StopCircle />
                          Terminate Execution
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
