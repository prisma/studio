import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  TemporalCreateScheduleInput,
  TemporalFollowMode,
  TemporalScheduleDetail,
  TemporalScheduleOverlapPolicy,
  TemporalScheduleSummary,
} from "@/data/temporal";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
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
  useTemporalScheduleActions,
  useTemporalScheduleDetail,
  useTemporalSchedules,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import {
  formatDuration,
  formatRelativeTime,
  parseJsonArgsText,
  pluralize,
  safeJsonPretty,
  summarizeIds,
} from "./temporal-utils";
import { TemporalCombobox } from "./TemporalCombobox";
import { TemporalJsonEditor } from "./TemporalJsonEditor";
import {
  TemporalConfirmDialog,
  TemporalField,
  TemporalFollowControl,
  temporalIconScale,
  TemporalNamespaceBadge,
  TemporalSectionLabel,
  TemporalStatusBadge,
  temporalTableHeadClass,
} from "./TemporalPrimitives";

const OVERLAP_POLICIES: TemporalScheduleOverlapPolicy[] = [
  "SKIP",
  "BUFFER_ONE",
  "BUFFER_ALL",
  "CANCEL_OTHER",
  "TERMINATE_OTHER",
  "ALLOW_ALL",
];

/** What a schedule does when a run is due while the last one still runs. */
const OVERLAP_POLICY_TEXT: Record<
  TemporalScheduleOverlapPolicy,
  { hint: string; label: string }
> = {
  ALLOW_ALL: { hint: "start it next to the running one", label: "Allow All" },
  BUFFER_ALL: { hint: "queue every due run", label: "Buffer All" },
  BUFFER_ONE: { hint: "queue one run, skip the rest", label: "Buffer One" },
  CANCEL_OTHER: {
    hint: "cancel the running one, then start",
    label: "Cancel Other",
  },
  SKIP: { hint: "do not start it", label: "Skip" },
  TERMINATE_OTHER: {
    hint: "terminate the running one, then start",
    label: "Terminate Other",
  },
};

function ScheduleStateBadge(props: { paused: boolean }) {
  return props.paused ? (
    <TemporalStatusBadge icon={Pause} tone="warning">
      Paused
    </TemporalStatusBadge>
  ) : (
    <TemporalStatusBadge icon={Check} tone="neutral">
      Active
    </TemporalStatusBadge>
  );
}

function toastError(err: unknown) {
  toast.error(err instanceof Error ? err.message : String(err));
}

interface TemporalSchedulesViewProps {
  followMode: TemporalFollowMode;
  knownTaskQueues: string[];
  knownWorkflowTypes: string[];
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
}

export function TemporalSchedulesView(props: TemporalSchedulesViewProps) {
  const {
    followMode,
    knownTaskQueues,
    knownWorkflowTypes,
    namespace,
    onFollowModeChange,
    onOpenExecution,
  } = props;

  const [pageTokens, setPageTokens] = useState<string[]>([]);

  useEffect(() => {
    setPageTokens([]);
  }, [namespace]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    isPlaceholderData,
  } = useTemporalSchedules({
    followMode,
    namespace,
    pageToken: pageTokens.at(-1),
  });
  const hasNextPage = Boolean(data?.nextPageToken) && !isPlaceholderData;
  const {
    bulkScheduleAction,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    patchSchedule,
    previewMatchingTimes,
  } = useTemporalScheduleActions(namespace);

  const schedules = useMemo(() => data?.schedules ?? [], [data?.schedules]);
  const [filterText, setFilterText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // The open schedule is in the URL, so a link can open it and the browser's
  // Back button closes it.
  const { temporalScheduleParam, setTemporalScheduleParam } = useNavigation();
  const activeScheduleId = temporalScheduleParam ?? null;
  const setActiveScheduleId = (scheduleId: string | null) =>
    void setTemporalScheduleParam(scheduleId, { history: "push" });
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] =
    useState<TemporalScheduleDetail | null>(null);
  const [bulkPauseOpen, setBulkPauseOpen] = useState(false);
  const [bulkPauseNote, setBulkPauseNote] = useState("Maintenance window");
  const [bulkTriggerConfirmOpen, setBulkTriggerConfirmOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return schedules;
    return schedules.filter(
      (s) =>
        s.scheduleId.toLowerCase().includes(q) ||
        s.workflowType.toLowerCase().includes(q) ||
        s.taskQueue.toLowerCase().includes(q) ||
        (s.notes ?? "").toLowerCase().includes(q),
    );
  }, [filterText, schedules]);

  const selectedSchedules = useMemo(
    () => filtered.filter((s) => selectedIds.has(s.scheduleId)),
    [filtered, selectedIds],
  );
  const allSelected =
    filtered.length > 0 && selectedSchedules.length === filtered.length;
  const selectedSummary = `${pluralize(selectedSchedules.length, "schedule")} (${summarizeIds(selectedSchedules.map((s) => s.scheduleId))})`;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.scheduleId)));
    }
  };

  const runBulk = async (
    action: "pause" | "unpause" | "trigger" | "delete",
    note?: string,
  ) => {
    const ids = selectedSchedules.map((s) => s.scheduleId);
    if (ids.length === 0) return;
    try {
      const res = await bulkScheduleAction.mutateAsync({
        action,
        note,
        scheduleIds: ids,
      });
      toast.success(
        `Bulk ${action}: ${res.succeeded} succeeded${res.failed > 0 ? `, ${res.failed} failed` : ""}`,
      );
      setSelectedIds(new Set());
    } catch (err) {
      toastError(err);
    }
  };

  const activeCount = schedules.filter((s) => !s.paused).length;
  const pausedCount = schedules.filter((s) => s.paused).length;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-schedules-view"
    >
      <StudioHeader
        title="Schedules"
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
              aria-label="Refresh schedules"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              data-testid="temporal-create-schedule-btn"
            >
              <Plus />
              New Schedule
            </Button>
          </>
        }
      >
        <TemporalNamespaceBadge namespace={namespace} />
        <div className="relative flex min-w-0 max-w-md flex-1 items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <Input
            aria-label="Filter schedules"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter schedules"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </StudioHeader>

      <div className="flex items-center gap-4 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <SummaryCount count={schedules.length} label="total" />
        <SummaryCount count={activeCount} label="active" />
        <SummaryCount count={pausedCount} label="paused" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <p className="font-medium text-destructive">
              {error instanceof Error
                ? error.message
                : "Could not load schedules"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <CalendarClock className="size-6 opacity-60" />
            <p>
              {schedules.length === 0
                ? `No schedules in namespace ${namespace}.`
                : "No schedules match this filter."}
            </p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              New Schedule
            </Button>
          </div>
        ) : (
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-background/95">
              <TableRow className="border-border/70 bg-muted/20 hover:bg-muted/20">
                <TableHead className="h-9 w-10 pr-2 pl-4">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all schedules"
                  />
                </TableHead>
                <TableHead className={temporalTableHeadClass}>
                  Schedule
                </TableHead>
                <TableHead className={temporalTableHeadClass}>State</TableHead>
                <TableHead className={temporalTableHeadClass}>
                  Workflow / Queue
                </TableHead>
                <TableHead className={temporalTableHeadClass}>
                  Cadence
                </TableHead>
                <TableHead
                  className={cn(temporalTableHeadClass, "hidden xl:table-cell")}
                >
                  Overlap
                </TableHead>
                <TableHead className={temporalTableHeadClass}>
                  Next Run
                </TableHead>
                <TableHead
                  className={cn(temporalTableHeadClass, "pr-4 text-right")}
                >
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sched) => {
                const isSelected = selectedIds.has(sched.scheduleId);
                return (
                  <TableRow
                    key={sched.scheduleId}
                    data-state={isSelected ? "selected" : undefined}
                    className="cursor-pointer border-border/60 hover:bg-muted/30 data-[state=selected]:bg-muted/50"
                    data-testid={`temporal-schedule-row-${sched.scheduleId}`}
                    onClick={() => setActiveScheduleId(sched.scheduleId)}
                  >
                    <TableCell
                      className="py-2.5 pr-2 pl-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(sched.scheduleId)}
                        aria-label={`Select schedule ${sched.scheduleId}`}
                      />
                    </TableCell>
                    <TableCell className="w-full min-w-48 max-w-0 px-2 py-2.5">
                      <div className="flex min-w-0 flex-col">
                        <button
                          type="button"
                          className="max-w-full self-start truncate rounded-sm py-1 font-mono font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveScheduleId(sched.scheduleId);
                          }}
                        >
                          {sched.scheduleId}
                        </button>
                        {sched.notes ? (
                          <span
                            className="truncate text-2xs text-muted-foreground"
                            title={sched.notes}
                          >
                            {sched.notes}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2.5">
                      <ScheduleStateBadge paused={sched.paused} />
                    </TableCell>
                    <TableCell className="px-2 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">
                          {sched.workflowType}
                        </span>
                        <span className="font-mono text-2xs text-muted-foreground">
                          {sched.taskQueue}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2.5 font-mono text-foreground">
                      {sched.cadenceSummary}
                    </TableCell>
                    <TableCell className="hidden px-2 py-2.5 font-mono text-muted-foreground xl:table-cell">
                      {OVERLAP_POLICY_TEXT[sched.overlapPolicy]?.label ??
                        sched.overlapPolicy}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2.5 tabular-nums text-muted-foreground">
                      {!sched.paused && sched.nextActionTimes[0]
                        ? formatRelativeTime(sched.nextActionTimes[0])
                        : "—"}
                    </TableCell>
                    <TableCell
                      className="py-2.5 pr-4 pl-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          className="w-7 px-0 text-muted-foreground"
                          aria-label={`Trigger ${sched.scheduleId} now`}
                          title="Trigger now"
                          onClick={() =>
                            void patchSchedule
                              .mutateAsync({
                                input: { action: "trigger" },
                                scheduleId: sched.scheduleId,
                              })
                              .then(() =>
                                toast.success(`Triggered ${sched.scheduleId}`),
                              )
                              .catch(toastError)
                          }
                        >
                          <Zap />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="w-7 px-0 text-muted-foreground"
                          aria-label={`${sched.paused ? "Resume" : "Pause"} ${sched.scheduleId}`}
                          title={sched.paused ? "Resume" : "Pause"}
                          onClick={() =>
                            void patchSchedule
                              .mutateAsync({
                                input: {
                                  action: sched.paused ? "unpause" : "pause",
                                },
                                scheduleId: sched.scheduleId,
                              })
                              .then(() =>
                                toast.success(
                                  `${sched.paused ? "Resumed" : "Paused"} ${sched.scheduleId}`,
                                ),
                              )
                              .catch(toastError)
                          }
                        >
                          {sched.paused ? <Play /> : <Pause />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {pageTokens.length > 0 || hasNextPage ? (
        <div
          className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground"
          data-testid="temporal-schedules-pagination"
        >
          <span>Page {pageTokens.length + 1}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              className="w-6 px-0"
              aria-label="Previous page"
              disabled={pageTokens.length === 0}
              onClick={() => {
                setPageTokens((tokens) => tokens.slice(0, -1));
                setSelectedIds(new Set());
              }}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="w-6 px-0"
              aria-label="Next page"
              disabled={!hasNextPage}
              onClick={() => {
                if (data?.nextPageToken) {
                  setPageTokens((tokens) => [...tokens, data.nextPageToken!]);
                  setSelectedIds(new Set());
                }
              }}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}

      {selectedSchedules.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2 text-xs"
          data-testid="temporal-schedules-bulk-bar"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {selectedSchedules.length} selected
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={bulkScheduleAction.isPending}
              onClick={() => setBulkPauseOpen(true)}
            >
              <Pause />
              Pause
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkScheduleAction.isPending}
              onClick={() => void runBulk("unpause", "Resumed in bulk")}
            >
              <Play />
              Resume
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkScheduleAction.isPending}
              onClick={() => setBulkTriggerConfirmOpen(true)}
            >
              <Zap />
              Trigger
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkScheduleAction.isPending}
              onClick={() => setBulkDeleteConfirmOpen(true)}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={bulkPauseOpen} onOpenChange={setBulkPauseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Pause {pluralize(selectedSchedules.length, "schedule")}
            </DialogTitle>
            <DialogDescription>
              The note is stored on every paused schedule, so other operators
              can see why it stopped firing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-pause-note">Maintenance note</Label>
            <Input
              id="bulk-pause-note"
              value={bulkPauseNote}
              onChange={(e) => setBulkPauseNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPauseOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setBulkPauseOpen(false);
                void runBulk("pause", bulkPauseNote.trim());
              }}
            >
              Pause {pluralize(selectedSchedules.length, "Schedule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemporalConfirmDialog
        confirmLabel={`Trigger ${pluralize(selectedSchedules.length, "Schedule")}`}
        description={`This starts one workflow run now for each of ${selectedSummary}.`}
        isPending={bulkScheduleAction.isPending}
        onConfirm={() => runBulk("trigger")}
        onOpenChange={setBulkTriggerConfirmOpen}
        open={bulkTriggerConfirmOpen}
        title="Trigger selected schedules?"
        variant="default"
      />

      <TemporalConfirmDialog
        confirmLabel={`Delete ${pluralize(selectedSchedules.length, "Schedule")}`}
        description={`This permanently deletes ${selectedSummary} in namespace ${namespace}. Workflows that already started keep running.`}
        isPending={bulkScheduleAction.isPending}
        onConfirm={() => runBulk("delete")}
        onOpenChange={setBulkDeleteConfirmOpen}
        open={bulkDeleteConfirmOpen}
        title="Delete selected schedules?"
      />

      <ScheduleDetailSheet
        namespace={namespace}
        onClose={() => setActiveScheduleId(null)}
        onDelete={async (id) => {
          await deleteSchedule.mutateAsync(id);
          toast.success(`Deleted schedule ${id}`);
          // No history entry: Back must not reopen a schedule that is gone.
          void setTemporalScheduleParam(null);
        }}
        onEdit={setEditingSchedule}
        onOpenExecution={onOpenExecution}
        onPatch={async (id, input) => {
          await patchSchedule.mutateAsync({ input, scheduleId: id });
        }}
        onPreviewMatching={(id, startTime, endTime) =>
          previewMatchingTimes.mutateAsync({
            endTime,
            scheduleId: id,
            startTime,
          })
        }
        scheduleId={activeScheduleId}
        summary={
          schedules.find((s) => s.scheduleId === activeScheduleId) ?? null
        }
      />

      <ScheduleFormSheet
        editing={editingSchedule}
        knownTaskQueues={knownTaskQueues}
        knownWorkflowTypes={knownWorkflowTypes}
        namespace={namespace}
        onOpenChange={(open) => {
          setCreateOpen(open);

          if (!open) {
            setEditingSchedule(null);
          }
        }}
        onSave={async (input) => {
          if (editingSchedule) {
            await updateSchedule.mutateAsync(input);
            toast.success(`Saved schedule ${input.scheduleId}`);
          } else {
            await createSchedule.mutateAsync(input);
            toast.success(`Created schedule ${input.scheduleId}`);
          }
        }}
        open={createOpen || editingSchedule !== null}
      />
    </div>
  );
}

function SummaryCount(props: { count: number; label: string }) {
  return (
    <span>
      <span className="font-medium tabular-nums text-foreground">
        {props.count}
      </span>{" "}
      {props.label}
    </span>
  );
}

function ScheduleDetailSheet(props: {
  namespace: string;
  onClose: () => void;
  onDelete: (scheduleId: string) => Promise<void>;
  onEdit: (detail: TemporalScheduleDetail) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  onPatch: (
    scheduleId: string,
    input: {
      action: "pause" | "unpause" | "trigger" | "backfill";
      backfillEndTime?: string;
      backfillStartTime?: string;
      note?: string;
      overlapPolicy?: TemporalScheduleOverlapPolicy;
    },
  ) => Promise<void>;
  onPreviewMatching: (
    scheduleId: string,
    startTime: string,
    endTime: string,
  ) => Promise<{ times: string[] }>;
  scheduleId: string | null;
  summary: TemporalScheduleSummary | null;
}) {
  const {
    namespace,
    scheduleId,
    summary,
    onClose,
    onDelete,
    onEdit,
    onOpenExecution,
    onPatch,
    onPreviewMatching,
  } = props;

  const { data: detail, isLoading } = useTemporalScheduleDetail({
    namespace,
    scheduleId: scheduleId ?? undefined,
  });

  const nowIso = new Date().toISOString().slice(0, 16);
  const oneHourAgoIso = new Date(Date.now() - 3600 * 1000)
    .toISOString()
    .slice(0, 16);
  const [backfillStart, setBackfillStart] = useState(oneHourAgoIso);
  const [backfillEnd, setBackfillEnd] = useState(nowIso);
  const [backfillPreview, setBackfillPreview] = useState<string[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const info = detail ?? summary;
  const upcomingTimes = info
    ? (detail?.matchingTimes ?? info.nextActionTimes).slice(0, 8)
    : [];
  const recentActions = info ? info.recentActions.slice(-8).reverse() : [];

  return (
    <Sheet open={Boolean(scheduleId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className={cn(
          "flex w-full flex-col gap-0 p-0 sm:max-w-lg",
          temporalIconScale,
        )}
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2 pr-8">
            <SheetTitle className="truncate font-mono text-base">
              {scheduleId}
            </SheetTitle>
            {info ? <ScheduleStateBadge paused={info.paused} /> : null}
          </div>
          <SheetDescription className="text-xs">
            {info
              ? `${info.workflowType} on queue ${info.taskQueue} · ${info.cadenceSummary} · Overlap: ${OVERLAP_POLICY_TEXT[info.overlapPolicy]?.label ?? info.overlapPolicy}`
              : `Namespace ${namespace}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5 text-xs *:shrink-0">
          {isLoading && !info ? (
            <Skeleton className="h-32 w-full" />
          ) : info ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    void onPatch(info.scheduleId, { action: "trigger" })
                      .then(() => toast.success(`Triggered ${info.scheduleId}`))
                      .catch(toastError)
                  }
                >
                  <Zap />
                  Trigger Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void onPatch(info.scheduleId, {
                      action: info.paused ? "unpause" : "pause",
                    })
                      .then(() =>
                        toast.success(
                          `${info.paused ? "Resumed" : "Paused"} ${info.scheduleId}`,
                        ),
                      )
                      .catch(toastError)
                  }
                >
                  {info.paused ? <Play /> : <Pause />}
                  {info.paused ? "Resume" : "Pause"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!detail}
                  onClick={() => detail && onEdit(detail)}
                  data-testid="temporal-schedule-edit"
                >
                  <Pencil />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>

              <section className="flex flex-col gap-2">
                <TemporalSectionLabel>
                  Upcoming Fire Times (UTC)
                </TemporalSectionLabel>
                {upcomingTimes.length === 0 ? (
                  <p className="text-muted-foreground">
                    No upcoming runs scheduled.
                  </p>
                ) : (
                  <ul className="rounded-md border border-border [&>*+*]:border-t [&>*+*]:border-border/60">
                    {upcomingTimes.map((iso) => (
                      <li
                        key={iso}
                        className="flex items-center justify-between gap-4 px-3 py-1.5 font-mono"
                      >
                        <span>{iso.replace("T", " ").slice(0, 19)}Z</span>
                        <span className="text-muted-foreground">
                          {formatRelativeTime(iso)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <TemporalSectionLabel>
                    Backfill a Missed Window
                  </TemporalSectionLabel>
                  <p className="text-muted-foreground">
                    Preview the fire times in a window, then start a run for
                    each of them.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <TemporalField htmlFor="bf-start" label="Start (UTC)">
                    <Input
                      id="bf-start"
                      type="datetime-local"
                      value={backfillStart}
                      onChange={(e) => {
                        setBackfillStart(e.target.value);
                        setBackfillPreview(null);
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </TemporalField>
                  <TemporalField htmlFor="bf-end" label="End (UTC)">
                    <Input
                      id="bf-end"
                      type="datetime-local"
                      value={backfillEnd}
                      onChange={(e) => {
                        setBackfillEnd(e.target.value);
                        setBackfillPreview(null);
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </TemporalField>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewLoading}
                    onClick={() => {
                      setPreviewLoading(true);
                      void onPreviewMatching(
                        info.scheduleId,
                        `${backfillStart}:00.000Z`,
                        `${backfillEnd}:00.000Z`,
                      )
                        .then((res) => {
                          setBackfillPreview(res.times);
                        })
                        .catch(toastError)
                        .finally(() => {
                          setPreviewLoading(false);
                        });
                    }}
                    data-testid="temporal-backfill-preview-btn"
                  >
                    Preview Fire Times
                  </Button>
                  <Button
                    size="sm"
                    disabled={!backfillPreview || backfillPreview.length === 0}
                    onClick={() => setBackfillConfirmOpen(true)}
                  >
                    Run Backfill
                    {backfillPreview ? ` (${backfillPreview.length})` : ""}
                  </Button>
                </div>
                {backfillPreview !== null ? (
                  <p
                    className="text-foreground"
                    data-testid="temporal-backfill-preview-result"
                  >
                    {backfillPreview.length === 0 ? (
                      "No fire times match this window."
                    ) : (
                      <>
                        {pluralize(backfillPreview.length, "fire time")}:{" "}
                        <span className="font-mono">
                          {backfillPreview
                            .slice(0, 4)
                            .map((t) => `${t.slice(11, 19)}Z`)
                            .join(", ")}
                        </span>
                        {backfillPreview.length > 4
                          ? ` and ${backfillPreview.length - 4} more`
                          : ""}
                      </>
                    )}
                  </p>
                ) : null}
              </section>

              <section className="flex flex-col gap-2">
                <TemporalSectionLabel>
                  Recent Runs ({info.recentActions.length})
                </TemporalSectionLabel>
                {recentActions.length === 0 ? (
                  <p className="text-muted-foreground">
                    No runs yet. Use Trigger Now to test this schedule.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-md border border-border [&>*+*]:border-t [&>*+*]:border-border/60">
                    {recentActions.map((act, idx) => (
                      <button
                        key={`${act.workflowId}-${idx}`}
                        type="button"
                        disabled={!act.workflowId}
                        onClick={() => {
                          if (act.workflowId) {
                            onClose();
                            onOpenExecution(act.workflowId, act.runId);
                          }
                        }}
                        className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="truncate font-mono text-foreground">
                          {act.workflowId || "Pending"}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatRelativeTime(
                            act.actualTime ?? act.scheduleTime,
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>

        <TemporalConfirmDialog
          confirmLabel={`Start ${pluralize(backfillPreview?.length ?? 0, "Run")}`}
          description={`This starts ${pluralize(backfillPreview?.length ?? 0, "workflow run")} for ${scheduleId ?? ""}. Backfill uses the ALLOW_ALL overlap policy, so the runs start even while another run is in progress.`}
          onConfirm={async () => {
            if (!info) return;
            try {
              await onPatch(info.scheduleId, {
                action: "backfill",
                backfillEndTime: `${backfillEnd}:00.000Z`,
                backfillStartTime: `${backfillStart}:00.000Z`,
                overlapPolicy: "ALLOW_ALL",
              });
              toast.success(
                `Queued ${pluralize(backfillPreview?.length ?? 0, "backfill run")}`,
              );
              setBackfillPreview(null);
            } catch (err) {
              toastError(err);
            }
          }}
          onOpenChange={setBackfillConfirmOpen}
          open={backfillConfirmOpen}
          title="Run backfill?"
          variant="default"
        />

        <TemporalConfirmDialog
          confirmLabel="Delete Schedule"
          description={`This permanently deletes schedule ${scheduleId ?? ""}. Workflows that already started keep running.`}
          onConfirm={() =>
            scheduleId ? onDelete(scheduleId) : Promise.resolve()
          }
          onOpenChange={setDeleteConfirmOpen}
          open={deleteConfirmOpen}
          title="Delete schedule?"
        />
      </SheetContent>
    </Sheet>
  );
}

const TIME_ZONES: string[] =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];

/** The form that creates a schedule, or changes the one passed as `editing`. */
export function ScheduleFormSheet(props: {
  editing: TemporalScheduleDetail | null;
  knownTaskQueues: string[];
  knownWorkflowTypes: string[];
  namespace: string;
  onOpenChange: (open: boolean) => void;
  onSave: (input: TemporalCreateScheduleInput) => Promise<void>;
  open: boolean;
}) {
  const {
    editing,
    knownTaskQueues,
    knownWorkflowTypes,
    namespace,
    onOpenChange,
    onSave: onCreate,
    open,
  } = props;

  const [scheduleId, setScheduleId] = useState("");
  const [workflowType, setWorkflowType] = useState(knownWorkflowTypes[0] || "");
  const [taskQueue, setTaskQueue] = useState(knownTaskQueues[0] || "");
  const [cadenceMode, setCadenceMode] = useState<"interval" | "cron">(
    "interval",
  );
  const [intervalSeconds, setIntervalSeconds] = useState("3600");
  const [cronExpression, setCronExpression] = useState("0 * * * *");
  const [timezone, setTimezone] = useState("");
  const [catchupSeconds, setCatchupSeconds] = useState("");
  const [overlapPolicy, setOverlapPolicy] =
    useState<TemporalScheduleOverlapPolicy>("SKIP");
  const [notes, setNotes] = useState("");
  const [argsText, setArgsText] = useState("[{}]");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!editing) {
      // A new schedule starts empty, also after another schedule was edited.
      setScheduleId("");
      setWorkflowType(knownWorkflowTypes[0] || "");
      setTaskQueue(knownTaskQueues[0] || "");
      setCadenceMode("interval");
      setCronExpression("0 * * * *");
      setIntervalSeconds("3600");
      setTimezone("");
      setCatchupSeconds("");
      setOverlapPolicy("SKIP");
      setNotes("");
      setArgsText("[{}]");
      return;
    }

    setScheduleId(editing.scheduleId);
    setWorkflowType(editing.workflowType);
    setTaskQueue(editing.taskQueue);
    setCadenceMode(editing.cronExpression ? "cron" : "interval");
    setCronExpression(editing.cronExpression ?? "0 * * * *");
    setIntervalSeconds(String(editing.intervalSeconds ?? 3600));
    setTimezone(editing.timezone ?? "");
    setCatchupSeconds(
      editing.catchupWindowSeconds ? String(editing.catchupWindowSeconds) : "",
    );
    setOverlapPolicy(editing.overlapPolicy);
    setNotes(editing.notes ?? "");
    setArgsText(
      safeJsonPretty(
        editing.workflowArgs === undefined
          ? []
          : Array.isArray(editing.workflowArgs)
            ? editing.workflowArgs
            : [editing.workflowArgs],
      ),
    );
    // The known types and queues only seed a new form; a refetch must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, open]);

  const parsedArgs = parseJsonArgsText(argsText);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedArgs.error) return;
    setSubmitting(true);
    try {
      await onCreate({
        args: parsedArgs.args,
        ...(cadenceMode === "cron"
          ? { cronExpression: cronExpression.trim() }
          : {
              intervalSeconds: Math.max(
                10,
                Number.parseInt(intervalSeconds, 10) || 300,
              ),
            }),
        ...(Number.parseInt(catchupSeconds, 10) > 0
          ? { catchupWindowSeconds: Number.parseInt(catchupSeconds, 10) }
          : {}),
        notes: notes.trim() || undefined,
        overlapPolicy,
        scheduleId: scheduleId.trim(),
        taskQueue: taskQueue.trim(),
        ...(timezone.trim() ? { timezone: timezone.trim() } : {}),
        ...(editing?.workflowIdPrefix
          ? { workflowIdPrefix: editing.workflowIdPrefix }
          : {}),
        workflowType: workflowType.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          "flex w-full flex-col gap-0 p-0 sm:max-w-lg",
          temporalIconScale,
        )}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("sched-id")?.focus();
        }}
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base">
              {editing ? "Edit Schedule" : "New Schedule"}
            </SheetTitle>
            <TemporalNamespaceBadge namespace={namespace} />
          </div>
          <SheetDescription className="text-xs">
            Start a workflow on a repeating interval or a cron expression.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 *:shrink-0">
            <TemporalField htmlFor="sched-id" label="Schedule ID">
              <Input
                id="sched-id"
                required
                // A schedule keeps its ID; a new ID would be another schedule.
                readOnly={editing !== null}
                value={scheduleId}
                onChange={(e) => setScheduleId(e.target.value)}
                className="h-8 font-mono text-xs read-only:cursor-default read-only:bg-muted/50 read-only:text-muted-foreground read-only:focus-visible:ring-0"
              />
            </TemporalField>
            <div className="grid grid-cols-2 gap-4">
              <TemporalField htmlFor="sched-wf-type" label="Workflow Type">
                <TemporalCombobox
                  id="sched-wf-type"
                  listLabel="Workflow Types"
                  onChange={setWorkflowType}
                  options={knownWorkflowTypes.map((value) => ({ value }))}
                  placeholder="Choose or type"
                  value={workflowType}
                />
              </TemporalField>
              <TemporalField htmlFor="sched-tq" label="Task Queue">
                <TemporalCombobox
                  id="sched-tq"
                  listLabel="Task Queues"
                  onChange={setTaskQueue}
                  options={knownTaskQueues.map((value) => ({ value }))}
                  placeholder="Choose or type"
                  value={taskQueue}
                />
              </TemporalField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TemporalField htmlFor="sched-cadence-mode" label="Cadence">
                <Select
                  value={cadenceMode}
                  onValueChange={(v) =>
                    setCadenceMode(v === "cron" ? "cron" : "interval")
                  }
                >
                  <SelectTrigger
                    id="sched-cadence-mode"
                    className="h-8 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interval">Interval</SelectItem>
                    <SelectItem value="cron">Cron</SelectItem>
                  </SelectContent>
                </Select>
              </TemporalField>
              <TemporalField
                htmlFor="sched-cadence"
                label={
                  cadenceMode === "cron" ? "Cron Expression" : "Every (seconds)"
                }
              >
                <Input
                  id="sched-cadence"
                  value={
                    cadenceMode === "cron" ? cronExpression : intervalSeconds
                  }
                  onChange={(e) =>
                    cadenceMode === "cron"
                      ? setCronExpression(e.target.value)
                      : setIntervalSeconds(e.target.value)
                  }
                  className="h-8 font-mono text-xs"
                />
              </TemporalField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TemporalField htmlFor="sched-timezone" label="Time Zone">
                <Input
                  id="sched-timezone"
                  list="sched-timezones"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="UTC"
                  className="h-8 font-mono text-xs"
                />
                <datalist id="sched-timezones">
                  {TIME_ZONES.map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
                <p className="text-2xs text-muted-foreground">
                  A cron expression is read in this time zone.
                </p>
              </TemporalField>
              <TemporalField
                htmlFor="sched-catchup"
                label="Catch-up Window (seconds)"
              >
                <Input
                  id="sched-catchup"
                  inputMode="numeric"
                  value={catchupSeconds}
                  onChange={(e) => setCatchupSeconds(e.target.value)}
                  placeholder="Server default (1 year)"
                  className="h-8 font-mono text-xs"
                />
                <p className="text-2xs text-muted-foreground">
                  {Number.parseInt(catchupSeconds, 10) > 0
                    ? `${formatDuration(Number.parseInt(catchupSeconds, 10) * 1000)}. `
                    : ""}
                  After an outage, runs missed by more than this are skipped.
                </p>
              </TemporalField>
            </div>
            <TemporalField htmlFor="sched-overlap" label="Overlap Policy">
              <Select
                value={overlapPolicy}
                onValueChange={(v) =>
                  setOverlapPolicy(v as TemporalScheduleOverlapPolicy)
                }
              >
                <SelectTrigger id="sched-overlap" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERLAP_POLICIES.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">
                      {OVERLAP_POLICY_TEXT[p].label}
                      <span className="text-muted-foreground">
                        : {OVERLAP_POLICY_TEXT[p].hint}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TemporalField>
            <TemporalField htmlFor="sched-notes" label="Notes">
              <Input
                id="sched-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Owner or purpose (optional)"
                className="h-8 text-xs"
              />
            </TemporalField>
            <TemporalField htmlFor="sched-args" label="Input Arguments (JSON)">
              <TemporalJsonEditor
                ariaLabel="Input Arguments (JSON)"
                id="sched-args"
                isInvalid={Boolean(parsedArgs.error)}
                minHeight="96px"
                onChange={setArgsText}
                samples={[]}
                value={argsText}
              />
              {parsedArgs.error ? (
                <p className="text-xs text-destructive">{parsedArgs.error}</p>
              ) : null}
            </TemporalField>
          </div>
          <SheetFooter className="border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                submitting ||
                !scheduleId.trim() ||
                !workflowType.trim() ||
                !taskQueue.trim() ||
                Boolean(parsedArgs.error)
              }
            >
              {editing ? "Save Changes" : "Create Schedule"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
