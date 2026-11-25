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
import { useMemo, useRef, useState } from "react";
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
import { setTemporalListContext } from "./temporal-list-context";
import { formatRelativeTime, pluralize, summarizeIds } from "./temporal-utils";
import {
  TemporalConfirmDialog,
  TemporalFollowControl,
  temporalIconScale,
  TemporalLoadError,
  TemporalRefreshError,
  TemporalSectionLabel,
  temporalTableHeadClass,
  TemporalTime,
  type TemporalTone,
  useNow,
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

/** The actions on one run that ask first, because they are hard to take back. */
type ConfirmedAction = "cancel" | "reset-activity" | "reset-sticky";

const CONFIRM_COPY: Record<
  ConfirmedAction,
  {
    confirmLabel: string;
    describe: (item: TemporalAttentionItem) => string;
    title: string;
  }
> = {
  cancel: {
    confirmLabel: "Request Cancel",
    describe: (item) =>
      `This asks ${item.workflowId} to cancel. The workflow can run its cleanup logic before it stops.`,
    title: "Request cancellation?",
  },
  "reset-activity": {
    confirmLabel: "Reset Activity",
    describe: (item) =>
      `This sets ${item.activityType ?? "the Activity"} of ${item.workflowId} back to attempt 1 and tries it again now.`,
    title: "Reset the Activity?",
  },
  "reset-sticky": {
    confirmLabel: "Reset Sticky Queue",
    describe: (item) =>
      `The next Workflow Task of ${item.workflowId} goes to the Task Queue ${item.taskQueue}, where any Worker can pick it up. Use this when the Worker that held the workflow is gone.`,
    title: "Reset the sticky Task Queue?",
  },
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A time whose relative form keeps counting while refresh is paused. */
function TickingTime(props: { iso: string }) {
  useNow(1_000, true);

  return <TemporalTime iso={props.iso} />;
}

export function TemporalAttentionView(props: {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
}) {
  const { followMode, namespace, onFollowModeChange, onOpenExecution } = props;
  const {
    data,
    dataUpdatedAt,
    error,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useTemporalAttention({ followMode, namespace });
  const { data: capabilities } = useTemporalCapabilities();
  const {
    activityOperation,
    bulkAction,
    cancelWorkflow,
    resetStickyTaskQueue,
    terminateWorkflow,
  } = useTemporalActions(namespace);
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  // The workflow page shows where it is in this list, with the next and previous runs.
  const openFromList = (workflowId: string, runId?: string) => {
    const shown = GROUPS.flatMap((group) =>
      sortAttentionItems(
        group.kind,
        items.filter((item) => item.kind === group.kind),
      ),
    );
    const seen = new Set<string>();

    setTemporalListContext({
      // One run can be in several groups; the list visits it once.
      items: shown
        .filter((item) => {
          const key = `${item.workflowId}\n${item.runId}`;

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);

          return true;
        })
        .map((item) => ({ runId: item.runId, workflowId: item.workflowId })),
      label: "Needs Attention",
    });
    onOpenExecution(workflowId, runId);
  };
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkTerminateOpen, setBulkTerminateOpen] = useState(false);
  const [terminateTarget, setTerminateTarget] =
    useState<TemporalAttentionItem | null>(null);
  // `isOpen` closes the dialog and keeps its text until it is gone.
  const [confirming, setConfirming] = useState<{
    action: ConfirmedAction;
    isOpen: boolean;
    item: TemporalAttentionItem;
  } | null>(null);
  // A dialog opened from code has no trigger, so nothing gets focus back when it closes.
  const dialogOpener = useRef<HTMLElement | null>(null);
  const refocusOpener = () => {
    const opener = dialogOpener.current;

    setTimeout(() => {
      if (opener?.isConnected) {
        opener.focus();
      }
    }, 0);
  };
  // The moment of the check, so its age keeps counting between requests.
  const checkedAt = useMemo(
    () =>
      data
        ? new Date((dataUpdatedAt || Date.now()) - data.ageMs).toISOString()
        : undefined,
    [data, dataUpdatedAt],
  );
  const isPartialCheck = data ? data.checkedRunning < data.totalRunning : false;

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
        reason: reason || `Bulk ${action} from Attention`,
      });
      toast.success(
        `Bulk ${action}: ${res.succeeded} succeeded${res.failed > 0 ? `, ${res.failed} failed` : ""}`,
      );
      setSelectedKeys(new Set());
      void refetch();
    } catch (err) {
      toast.error(`Bulk ${action} failed: ${errorText(err)}`);
    }
  };

  const runConfirmed = async () => {
    if (!confirming) {
      return;
    }

    const { action, item } = confirming;
    const run = { runId: item.runId, workflowId: item.workflowId };

    try {
      if (action === "cancel") {
        await cancelWorkflow.mutateAsync(run);
        toast.success(`Cancel requested for ${item.workflowId}`);
      } else if (action === "reset-sticky") {
        await resetStickyTaskQueue.mutateAsync(run);
        toast.success(`Reset sticky queue for ${item.workflowId}`);
      } else if (item.activityId) {
        await activityOperation.mutateAsync({
          ...run,
          activityId: item.activityId,
          operation: "reset",
        });
        toast.success(`Reset ${item.activityType} of ${item.workflowId}`);
      }

      void refetch();
    } catch (err) {
      toast.error(
        `${CONFIRM_COPY[action].confirmLabel} failed for ${item.workflowId}: ${errorText(err)}`,
      );
    }
  };

  return (
    <div
      className={cn(
        "@container flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-attention-view"
    >
      <StudioHeader
        title="Attention"
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
              aria-label="Refresh Attention"
              title="Refresh Attention"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
          </>
        }
      ></StudioHeader>

      {data && checkedAt ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            <span className="font-medium tabular-nums text-foreground">
              {openProblems}
            </span>{" "}
            of{" "}
            {isPartialCheck
              ? `the ${data.checkedRunning.toLocaleString("en-US")} oldest running workflows`
              : pluralize(data.totalRunning, "running workflow")}{" "}
            {openProblems === 1 ? "needs" : "need"} attention
          </span>
          {isPartialCheck ? (
            <span>
              {data.totalRunning.toLocaleString("en-US")} are running. The newer
              ones are not checked.
            </span>
          ) : null}
          <span className="ml-auto">
            Checked <TickingTime iso={checkedAt} />
          </span>
        </div>
      ) : isLoading ? (
        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          Checking every running execution
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : !data ? (
          <TemporalLoadError
            error={error}
            onRetry={() => void refetch()}
            title={
              <>
                Could not check the running workflows of namespace{" "}
                <code className="font-mono">{namespace}</code>.
              </>
            }
          />
        ) : (
          <div className="flex flex-col">
            {isError ? (
              <TemporalRefreshError
                error={error}
                onRetry={() => void refetch()}
              />
            ) : null}
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
                <CircleCheck className="size-6 opacity-60" />
                <p>
                  No running workflow in{" "}
                  <code className="font-mono text-foreground">{namespace}</code>{" "}
                  needs attention.
                </p>
              </div>
            ) : null}
            {GROUPS.map((group) => {
              const groupItems = items.filter(
                (item) => item.kind === group.kind,
              );

              return groupItems.length > 0 ? (
                <AttentionGroup
                  key={group.kind}
                  description={group.description}
                  dialogOpener={dialogOpener}
                  dotClassName={TONE_DOT[group.tone]}
                  items={groupItems}
                  kind={group.kind}
                  isActivityPending={activityOperation.isPending}
                  onConfirm={(item, action) =>
                    setConfirming({ action, isOpen: true, item })
                  }
                  onOpenExecution={openFromList}
                  onToggleActivityPause={(item) => {
                    if (!item.activityId) {
                      return;
                    }

                    const operation = item.activityPaused ? "unpause" : "pause";

                    void activityOperation
                      .mutateAsync({
                        activityId: item.activityId,
                        operation,
                        runId: item.runId,
                        workflowId: item.workflowId,
                      })
                      .then(() => {
                        toast.success(
                          `${operation === "pause" ? "Paused" : "Unpaused"} ${item.activityType} of ${item.workflowId}`,
                        );
                        void refetch();
                      })
                      .catch((err) =>
                        toast.error(
                          `Could not ${operation} ${item.activityType} of ${item.workflowId}: ${errorText(err)}`,
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
              onClick={(event) => {
                dialogOpener.current = event.currentTarget;
                setBulkCancelOpen(true);
              }}
            >
              <XCircle />
              Request Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkAction.isPending}
              onClick={(event) => {
                dialogOpener.current = event.currentTarget;
                setBulkTerminateOpen(true);
              }}
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
        onOpenChange={(open) => {
          setBulkCancelOpen(open);
          refocusOpener();
        }}
        open={bulkCancelOpen}
        title="Request cancellation?"
        variant="default"
      />

      <TemporalConfirmDialog
        confirmLabel={`Terminate ${pluralize(selectedRuns.length, "Workflow")}`}
        defaultReason="Bulk terminated from Attention"
        description={`This stops ${selectedSummary} immediately, without running cleanup logic.`}
        isPending={bulkAction.isPending}
        onConfirm={(reason) => runBulk("terminate", reason)}
        onOpenChange={(open) => {
          setBulkTerminateOpen(open);
          refocusOpener();
        }}
        open={bulkTerminateOpen}
        reasonLabel="Termination reason"
        showReasonInput
        title="Terminate selected workflows?"
      />

      <TemporalConfirmDialog
        confirmLabel="Terminate Workflow"
        defaultReason="Terminated from Attention"
        description={`This stops ${terminateTarget?.workflowId ?? ""} immediately, without running cleanup logic.`}
        isPending={terminateWorkflow.isPending}
        onConfirm={async (reason) => {
          if (!terminateTarget) {
            return;
          }
          await terminateWorkflow.mutateAsync({
            reason: reason || "Terminated from Attention",
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
            refocusOpener();
          }
        }}
        open={terminateTarget !== null}
        reasonLabel="Termination reason"
        showReasonInput
        title="Terminate workflow?"
      />

      <TemporalConfirmDialog
        confirmLabel={
          confirming ? CONFIRM_COPY[confirming.action].confirmLabel : ""
        }
        description={
          confirming
            ? CONFIRM_COPY[confirming.action].describe(confirming.item)
            : ""
        }
        isPending={
          cancelWorkflow.isPending ||
          resetStickyTaskQueue.isPending ||
          activityOperation.isPending
        }
        onConfirm={runConfirmed}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming((current) =>
              current ? { ...current, isOpen: false } : null,
            );
            refocusOpener();
          }
        }}
        open={confirming?.isOpen === true}
        title={confirming ? CONFIRM_COPY[confirming.action].title : ""}
        variant="default"
      />
    </div>
  );
}

/** What is wrong with one run, in one line. */
function ProblemText(props: {
  item: TemporalAttentionItem;
  kind: TemporalAttentionKind;
  showNextAttempt: boolean;
}) {
  const { item, kind, showNextAttempt } = props;

  if (kind !== "activity-retrying") {
    return <span className="text-foreground">{item.detail}</span>;
  }

  return (
    <>
      <span className="font-mono font-medium text-foreground">
        {item.activityType}
      </span>{" "}
      <span className="text-foreground">
        attempt {item.attempt}
        {item.maximumAttempts ? ` of ${item.maximumAttempts}` : ""}
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
  );
}

/** A sticky cell needs its own line below it: a collapsed table border stays behind. */
const headCellClassName = cn(
  temporalTableHeadClass,
  "shadow-[inset_0_-1px_0_var(--border)]",
);

/** A group's rows in the order the page shows them: the longest-standing problem first, the newest failure first. */
function sortAttentionItems<T extends { since?: string }>(
  kind: string,
  items: T[],
): T[] {
  return [...items].sort((a, b) =>
    kind === "failed"
      ? (b.since ?? "").localeCompare(a.since ?? "")
      : (a.since ?? "").localeCompare(b.since ?? ""),
  );
}

function AttentionGroup(props: {
  description: string;
  /** Set to the row's menu button, which gets focus back when a dialog closes. */
  dialogOpener: React.RefObject<HTMLElement | null>;
  dotClassName: string;
  isActivityPending: boolean;
  items: TemporalAttentionItem[];
  kind: TemporalAttentionKind;
  onConfirm: (item: TemporalAttentionItem, action: ConfirmedAction) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  onTerminate: (item: TemporalAttentionItem) => void;
  onToggleActivityPause: (item: TemporalAttentionItem) => void;
  onToggleGroup: () => void;
  onToggleSelect: (item: TemporalAttentionItem) => void;
  selectedKeys: ReadonlySet<string>;
  supportsActivityOperations: boolean;
  title: string;
}) {
  const {
    description,
    dialogOpener,
    dotClassName,
    isActivityPending,
    items,
    kind,
    onConfirm,
    onOpenExecution,
    onTerminate,
    onToggleActivityPause,
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
  const sorted = sortAttentionItems(kind, items);
  const allSelected =
    isOpenGroup &&
    sorted.length > 0 &&
    sorted.every((item) => selectedKeys.has(runKey(item)));

  return (
    <section
      className="border-b border-border"
      data-testid={`temporal-attention-${kind}`}
    >
      <Table
        className="text-xs"
        // The page scrolls, not the table, so the header can stick to the page.
        containerProps={{ className: "h-auto overflow-visible" }}
      >
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead
              colSpan={6}
              scope="colgroup"
              className="h-auto bg-muted/20 px-4 py-2.5 font-normal"
            >
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
              <p className="pl-4 text-2xs text-muted-foreground">
                {description}
              </p>
            </TableHead>
          </TableRow>
          <TableRow className="border-0 hover:bg-transparent">
            {isOpenGroup ? (
              <TableHead className={cn(headCellClassName, "w-10 pr-2 pl-4")}>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onToggleGroup}
                  aria-label={`Select all in ${title}`}
                />
              </TableHead>
            ) : null}
            <TableHead
              className={cn(
                headCellClassName,
                "@3xl:w-[26%]",
                !isOpenGroup && "pl-4",
              )}
            >
              Workflow
            </TableHead>
            <TableHead
              className={cn(headCellClassName, "hidden @3xl:table-cell")}
            >
              Problem
            </TableHead>
            <TableHead
              className={cn(
                headCellClassName,
                "w-20 @3xl:w-28 @max-3xl:whitespace-normal",
                !isOpenGroup && "@max-3xl:pr-4",
              )}
            >
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
                headCellClassName,
                "hidden w-28 @3xl:table-cell",
                !isOpenGroup && "pr-4",
              )}
            >
              Queue
            </TableHead>
            {isOpenGroup ? (
              <TableHead
                className={cn(
                  headCellClassName,
                  "w-12 pr-4 text-right @3xl:w-20",
                )}
              >
                <span className="@max-3xl:sr-only">Actions</span>
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
                  className={cn(
                    "max-w-0 py-1.5 pr-2",
                    isOpenGroup ? "pl-2" : "pl-4",
                  )}
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
                    <span className="min-w-0 shrink-[4] truncate text-muted-foreground @max-3xl:hidden">
                      {item.workflowType}
                    </span>
                  </button>
                  {/* A narrow page has no Problem column, so the problem goes under the ID. */}
                  <span
                    className="line-clamp-3 pb-0.5 pl-6 text-2xs @3xl:hidden"
                    title={item.detail}
                  >
                    <ProblemText
                      item={item}
                      kind={kind}
                      showNextAttempt={showNextAttempt}
                    />
                  </span>
                </TableCell>
                <TableCell className="hidden max-w-0 px-2 py-2 @3xl:table-cell">
                  <span className="block truncate" title={item.detail}>
                    <ProblemText
                      item={item}
                      kind={kind}
                      showNextAttempt={showNextAttempt}
                    />
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    "px-2 py-2 whitespace-nowrap text-muted-foreground",
                    !isOpenGroup && "@max-3xl:pr-4",
                  )}
                >
                  <TemporalTime
                    iso={showNextAttempt ? item.nextAttemptTime : item.since}
                  />
                </TableCell>
                <TableCell
                  className={cn(
                    "hidden max-w-28 truncate py-2 pl-2 font-mono text-muted-foreground @3xl:table-cell",
                    isOpenGroup ? "pr-2" : "pr-4",
                  )}
                  title={item.taskQueue}
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
                          onKeyDown={(event) => {
                            dialogOpener.current = event.currentTarget;
                          }}
                          onPointerDown={(event) => {
                            dialogOpener.current = event.currentTarget;
                          }}
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
                              disabled={isActivityPending}
                              onClick={() => onConfirm(item, "reset-activity")}
                            >
                              <RotateCcw />
                              Reset Activity
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isActivityPending}
                              onClick={() => onToggleActivityPause(item)}
                            >
                              {item.activityPaused ? <Play /> : <Pause />}
                              {item.activityPaused
                                ? "Unpause Activity"
                                : "Pause Activity"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => onConfirm(item, "reset-sticky")}
                        >
                          <RotateCcw />
                          Reset Sticky Queue
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onConfirm(item, "cancel")}
                        >
                          <XCircle />
                          Request Cancel
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => onTerminate(item)}
                        >
                          <StopCircle />
                          Terminate Workflow
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
