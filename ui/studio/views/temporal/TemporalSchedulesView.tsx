import {
  CalendarClock,
  Check,
  ExternalLink,
  History,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  TemporalFollowMode,
  TemporalScheduleOverlapPolicy,
  TemporalScheduleSummary,
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
import { Textarea } from "@/ui/components/ui/textarea";
import {
  useTemporalScheduleActions,
  useTemporalScheduleDetail,
  useTemporalSchedules,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import { formatRelativeTime, parseJsonArgsText } from "./temporal-utils";
import {
  TemporalConfirmDialog,
  TemporalFollowControl,
} from "./TemporalPrimitives";

const OVERLAP_POLICIES: TemporalScheduleOverlapPolicy[] = [
  "SKIP",
  "BUFFER_ONE",
  "BUFFER_ALL",
  "CANCEL_OTHER",
  "TERMINATE_OTHER",
  "ALLOW_ALL",
];

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

  const { data, isLoading, isError, error, refetch, isFetching } =
    useTemporalSchedules({ followMode, namespace });
  const {
    bulkScheduleAction,
    createSchedule,
    deleteSchedule,
    patchSchedule,
    previewMatchingTimes,
  } = useTemporalScheduleActions(namespace);

  const schedules = useMemo(() => data?.schedules ?? [], [data?.schedules]);
  const [filterText, setFilterText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkPauseOpen, setBulkPauseOpen] = useState(false);
  const [bulkPauseNote, setBulkPauseNote] = useState("Maintenance window");
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
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const activeCount = schedules.filter((s) => !s.paused).length;
  const pausedCount = schedules.filter((s) => s.paused).length;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="temporal-schedules-view"
    >
      <StudioHeader
        title="Schedules"
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
              aria-label="Refresh schedules"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  isFetching && "motion-safe:animate-spin",
                )}
              />
            </Button>
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setCreateOpen(true)}
              data-testid="temporal-create-schedule-btn"
            >
              <Plus className="mr-1 size-3.5" />
              New Schedule
            </Button>
          </div>
        }
      >
        <Input
          aria-label="Filter schedules"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter by schedule ID, workflow type, or queue..."
          className="h-8 max-w-md font-mono text-xs"
        />
      </StudioHeader>

      <div className="flex items-center gap-3 border-b border-border bg-secondary/40 px-4 py-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono text-foreground">
          {schedules.length} total
        </span>
        <span>·</span>
        <span>{activeCount} active</span>
        <span>·</span>
        <span>{pausedCount} paused</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-xs text-muted-foreground">
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
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-xs text-muted-foreground">
            <CalendarClock className="size-6 opacity-60" />
            <p>
              {schedules.length === 0
                ? `No schedules configured in namespace ${namespace}.`
                : "No schedules match your filter."}
            </p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 size-3.5" />
              Create Schedule
            </Button>
          </div>
        ) : (
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-secondary/95 backdrop-blur-xs">
              <TableRow className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                <TableHead className="h-8 w-9 px-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all schedules"
                  />
                </TableHead>
                <TableHead className="h-8 px-2">Schedule</TableHead>
                <TableHead className="h-8 px-2">State</TableHead>
                <TableHead className="h-8 px-2">Workflow / Queue</TableHead>
                <TableHead className="h-8 px-2">Cadence</TableHead>
                <TableHead className="h-8 px-2">Overlap</TableHead>
                <TableHead className="h-8 px-2">Next Run</TableHead>
                <TableHead className="h-8 px-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sched) => {
                const isSelected = selectedIds.has(sched.scheduleId);
                return (
                  <TableRow
                    key={sched.scheduleId}
                    className={cn(
                      "cursor-pointer hover:bg-secondary/50",
                      isSelected && "bg-primary/5",
                    )}
                    data-testid={`temporal-schedule-row-${sched.scheduleId}`}
                    onClick={() => setActiveScheduleId(sched.scheduleId)}
                  >
                    <TableCell
                      className="px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(sched.scheduleId)}
                        aria-label={`Select schedule ${sched.scheduleId}`}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <div className="font-mono font-medium text-foreground">
                        {sched.scheduleId}
                      </div>
                      {sched.notes ? (
                        <div className="max-w-xs truncate text-[11px] text-muted-foreground">
                          {sched.notes}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {sched.paused ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/50 bg-amber-500/10 text-[10.5px] text-amber-700 dark:text-amber-300"
                        >
                          <Pause className="size-2.5" />
                          Paused
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="gap-1 border-border bg-secondary/70 text-[10.5px] text-foreground"
                        >
                          <Check className="size-2.5 text-prism-cyan-600 dark:text-prism-cyan-400" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <div className="font-medium text-foreground">
                        {sched.workflowType}
                      </div>
                      <div className="font-mono text-[10.5px] text-muted-foreground">
                        {sched.taskQueue}
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2 font-mono text-[11px] text-foreground">
                      {sched.cadenceSummary}
                    </TableCell>
                    <TableCell className="px-2 py-2 font-mono text-[10.5px] text-muted-foreground">
                      {sched.overlapPolicy}
                    </TableCell>
                    <TableCell className="px-2 py-2 text-[11px] tabular-nums text-muted-foreground">
                      {sched.paused
                        ? "Paused"
                        : sched.nextActionTimes[0]
                          ? formatRelativeTime(sched.nextActionTimes[0])
                          : "—"}
                    </TableCell>
                    <TableCell
                      className="px-3 py-2 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          aria-label={`Trigger ${sched.scheduleId} now`}
                          onClick={() =>
                            void patchSchedule
                              .mutateAsync({
                                input: { action: "trigger" },
                                scheduleId: sched.scheduleId,
                              })
                              .then(() =>
                                toast.success(`Triggered ${sched.scheduleId}`),
                              )
                              .catch((err) =>
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : String(err),
                                ),
                              )
                          }
                        >
                          <Zap className="mr-1 size-3" />
                          Trigger
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
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
                                  `${sched.paused ? "Unpaused" : "Paused"} ${sched.scheduleId}`,
                                ),
                              )
                              .catch((err) =>
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : String(err),
                                ),
                              )
                          }
                        >
                          {sched.paused ? (
                            <>
                              <Play className="mr-1 size-3" />
                              Resume
                            </>
                          ) : (
                            <>
                              <Pause className="mr-1 size-3" />
                              Pause
                            </>
                          )}
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

      {/* Multi-Select Bulk Schedule Actions Bar */}
      {selectedSchedules.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t border-primary/50 bg-secondary px-4 py-2 text-xs"
          data-testid="temporal-schedules-bulk-bar"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              {selectedSchedules.length} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
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
              disabled={bulkScheduleAction.isPending}
              onClick={() => setBulkPauseOpen(true)}
            >
              <Pause className="mr-1 size-3" />
              Bulk Pause
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={bulkScheduleAction.isPending}
              onClick={() => void runBulk("unpause", "Resumed in bulk")}
            >
              <Play className="mr-1 size-3" />
              Bulk Resume
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={bulkScheduleAction.isPending}
              onClick={() => void runBulk("trigger")}
            >
              <Zap className="mr-1 size-3" />
              Bulk Trigger
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              disabled={bulkScheduleAction.isPending}
              onClick={() => setBulkDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-1 size-3" />
              Bulk Delete
            </Button>
          </div>
        </div>
      ) : null}

      {/* Bulk Pause Maintenance Note Dialog */}
      <Dialog open={bulkPauseOpen} onOpenChange={setBulkPauseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Pause {selectedSchedules.length} schedules
            </DialogTitle>
            <DialogDescription>
              Add a maintenance note stored on every paused schedule so other
              operators know why firing stopped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="bulk-pause-note" className="text-xs">
              Maintenance Note
            </Label>
            <Input
              id="bulk-pause-note"
              value={bulkPauseNote}
              onChange={(e) => setBulkPauseNote(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkPauseOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setBulkPauseOpen(false);
                void runBulk("pause", bulkPauseNote.trim());
              }}
            >
              Pause {selectedSchedules.length} Schedules
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemporalConfirmDialog
        confirmLabel={`Delete ${selectedSchedules.length} schedule${selectedSchedules.length === 1 ? "" : "s"}`}
        description={`Permanently delete ${selectedSchedules.length} selected schedule${selectedSchedules.length === 1 ? "" : "s"} in namespace ${namespace}. Already-started workflows keep running.`}
        isPending={bulkScheduleAction.isPending}
        onConfirm={() => runBulk("delete")}
        onOpenChange={setBulkDeleteConfirmOpen}
        open={bulkDeleteConfirmOpen}
        title="Delete selected schedules?"
      />

      {/* Schedule Detail & Visual Backfill Sheet */}
      <ScheduleDetailSheet
        namespace={namespace}
        onClose={() => setActiveScheduleId(null)}
        onDelete={async (id) => {
          await deleteSchedule.mutateAsync(id);
          toast.success(`Deleted schedule ${id}`);
          setActiveScheduleId(null);
        }}
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

      {/* Create Schedule Sheet */}
      <CreateScheduleSheet
        knownTaskQueues={knownTaskQueues}
        knownWorkflowTypes={knownWorkflowTypes}
        namespace={namespace}
        onCreate={async (input) => {
          await createSchedule.mutateAsync(input);
          toast.success(`Created schedule ${input.scheduleId}`);
        }}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
    </div>
  );
}

function ScheduleDetailSheet(props: {
  namespace: string;
  onClose: () => void;
  onDelete: (scheduleId: string) => Promise<void>;
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const info = detail ?? summary;

  return (
    <Sheet open={Boolean(scheduleId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 font-mono text-sm">
            <span>{scheduleId}</span>
            {info?.paused ? (
              <Badge
                variant="outline"
                className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
              >
                Paused
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Active
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {info
              ? `${info.workflowType} on queue ${info.taskQueue} · ${info.cadenceSummary} · Overlap ${info.overlapPolicy}`
              : `Namespace ${namespace}`}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 text-xs">
          {isLoading && !info ? (
            <Skeleton className="h-32 w-full" />
          ) : info ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    void onPatch(info.scheduleId, { action: "trigger" })
                      .then(() => toast.success(`Triggered ${info.scheduleId}`))
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : String(e)),
                      )
                  }
                >
                  <Zap className="mr-1 size-3" />
                  Trigger Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    void onPatch(info.scheduleId, {
                      action: info.paused ? "unpause" : "pause",
                    })
                      .then(() =>
                        toast.success(
                          `${info.paused ? "Resumed" : "Paused"} ${info.scheduleId}`,
                        ),
                      )
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : String(e)),
                      )
                  }
                >
                  {info.paused ? (
                    <>
                      <Play className="mr-1 size-3" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="mr-1 size-3" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="mr-1 size-3" />
                  Delete
                </Button>
              </div>

              {/* Upcoming Fires */}
              <div className="space-y-1.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Upcoming Fire Times (UTC)
                </div>
                <div className="rounded-md border border-border bg-secondary/30 p-2.5">
                  {(detail?.matchingTimes ?? info.nextActionTimes).length ===
                  0 ? (
                    <span className="text-muted-foreground">
                      No upcoming runs scheduled.
                    </span>
                  ) : (
                    <ul className="space-y-1 font-mono text-[11px]">
                      {(detail?.matchingTimes ?? info.nextActionTimes)
                        .slice(0, 8)
                        .map((iso) => (
                          <li
                            key={iso}
                            className="flex items-center justify-between"
                          >
                            <span>{iso.replace("T", " ").slice(0, 19)}Z</span>
                            <span className="text-muted-foreground">
                              {formatRelativeTime(iso)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Visual Backfill with Pre-Flight Count */}
              <div className="space-y-2 rounded-md border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <History className="size-3.5" />
                  <span>Backfill Missed Window</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Preview exact matching fire times before running backfill so
                  you never trigger an unexpected workflow storm.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="bf-start" className="text-[11px]">
                      Start (UTC)
                    </Label>
                    <Input
                      id="bf-start"
                      type="datetime-local"
                      value={backfillStart}
                      onChange={(e) => {
                        setBackfillStart(e.target.value);
                        setBackfillPreview(null);
                      }}
                      className="h-8 font-mono text-[11px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="bf-end" className="text-[11px]">
                      End (UTC)
                    </Label>
                    <Input
                      id="bf-end"
                      type="datetime-local"
                      value={backfillEnd}
                      onChange={(e) => {
                        setBackfillEnd(e.target.value);
                        setBackfillPreview(null);
                      }}
                      className="h-8 font-mono text-[11px]"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
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
                        .catch((e) => {
                          toast.error(
                            e instanceof Error ? e.message : String(e),
                          );
                        })
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
                    className="h-7 text-xs"
                    disabled={!backfillPreview || backfillPreview.length === 0}
                    onClick={() =>
                      void onPatch(info.scheduleId, {
                        action: "backfill",
                        backfillEndTime: `${backfillEnd}:00.000Z`,
                        backfillStartTime: `${backfillStart}:00.000Z`,
                        overlapPolicy: "ALLOW_ALL",
                      })
                        .then(() => {
                          toast.success(
                            `Queued ${backfillPreview?.length ?? 0} backfill runs`,
                          );
                          setBackfillPreview(null);
                        })
                        .catch((e) =>
                          toast.error(
                            e instanceof Error ? e.message : String(e),
                          ),
                        )
                    }
                  >
                    Run Backfill
                    {backfillPreview ? ` (${backfillPreview.length})` : ""}
                  </Button>
                </div>
                {backfillPreview !== null ? (
                  <div
                    className="rounded border border-border bg-secondary/40 p-2 font-mono text-[11px]"
                    data-testid="temporal-backfill-preview-result"
                  >
                    {backfillPreview.length === 0
                      ? "0 scheduled runs match this window."
                      : `${backfillPreview.length} matching fire time${backfillPreview.length === 1 ? "" : "s"}: ${backfillPreview
                          .slice(0, 4)
                          .map((t) => t.slice(11, 19) + "Z")
                          .join(
                            ", ",
                          )}${backfillPreview.length > 4 ? ` (+${backfillPreview.length - 4} more)` : ""}`}
                  </div>
                ) : null}
              </div>

              {/* Recent Runs */}
              <div className="space-y-1.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Spawned Runs ({info.recentActions.length})
                </div>
                {info.recentActions.length === 0 ? (
                  <p className="text-muted-foreground">
                    No runs spawned yet. Click Trigger Now to test this
                    schedule.
                  </p>
                ) : (
                  <div className="divide-y divide-border rounded-md border border-border">
                    {info.recentActions
                      .slice(-8)
                      .reverse()
                      .map((act, idx) => (
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
                          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-secondary/50"
                        >
                          <span className="truncate font-mono text-[11px] text-foreground">
                            {act.workflowId || "Pending"}
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-muted-foreground">
                            {formatRelativeTime(
                              act.actualTime ?? act.scheduleTime,
                            )}
                            <ExternalLink className="size-3" />
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        <TemporalConfirmDialog
          confirmLabel="Delete schedule"
          description={`Permanently delete schedule ${scheduleId ?? ""}?`}
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

function CreateScheduleSheet(props: {
  knownTaskQueues: string[];
  knownWorkflowTypes: string[];
  namespace: string;
  onCreate: (input: {
    args?: unknown[];
    cronExpression?: string;
    intervalSeconds?: number;
    notes?: string;
    overlapPolicy: TemporalScheduleOverlapPolicy;
    scheduleId: string;
    taskQueue: string;
    workflowType: string;
  }) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const {
    knownTaskQueues,
    knownWorkflowTypes,
    namespace,
    onCreate,
    onOpenChange,
    open,
  } = props;

  const [scheduleId, setScheduleId] = useState("hourly-audit-job");
  const [workflowType, setWorkflowType] = useState(
    knownWorkflowTypes[0] || "ChargeOrder",
  );
  const [taskQueue, setTaskQueue] = useState(knownTaskQueues[0] || "billing");
  const [cadenceMode, setCadenceMode] = useState<"interval" | "cron">(
    "interval",
  );
  const [intervalSeconds, setIntervalSeconds] = useState("600");
  const [cronExpression, setCronExpression] = useState("*/15 * * * *");
  const [overlapPolicy, setOverlapPolicy] =
    useState<TemporalScheduleOverlapPolicy>("SKIP");
  const [notes, setNotes] = useState("");
  const [argsText, setArgsText] = useState("[{}]");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseJsonArgsText(argsText);
    if (parsed.error) {
      toast.error(`Invalid JSON arguments: ${parsed.error}`);
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        args: parsed.args,
        ...(cadenceMode === "cron"
          ? { cronExpression: cronExpression.trim() }
          : {
              intervalSeconds: Math.max(
                10,
                Number.parseInt(intervalSeconds, 10) || 300,
              ),
            }),
        notes: notes.trim() || undefined,
        overlapPolicy,
        scheduleId: scheduleId.trim(),
        taskQueue: taskQueue.trim(),
        workflowType: workflowType.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-sm">Create Schedule</SheetTitle>
          <SheetDescription className="text-xs">
            Schedule recurring workflow runs in namespace{" "}
            <code className="font-mono">{namespace}</code>.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-xs">
            <div className="space-y-1">
              <Label htmlFor="sched-id" className="text-xs">
                Schedule ID
              </Label>
              <Input
                id="sched-id"
                required
                value={scheduleId}
                onChange={(e) => setScheduleId(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="sched-wf-type" className="text-xs">
                  Workflow Type
                </Label>
                <Input
                  id="sched-wf-type"
                  required
                  value={workflowType}
                  onChange={(e) => setWorkflowType(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sched-tq" className="text-xs">
                  Task Queue
                </Label>
                <Input
                  id="sched-tq"
                  required
                  value={taskQueue}
                  onChange={(e) => setTaskQueue(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Cadence Type</Label>
                <Select
                  value={cadenceMode}
                  onValueChange={(v) =>
                    setCadenceMode(v === "cron" ? "cron" : "interval")
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interval" className="text-xs">
                      Interval (seconds)
                    </SelectItem>
                    <SelectItem value="cron" className="text-xs">
                      Cron expression
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sched-cadence" className="text-xs">
                  {cadenceMode === "cron" ? "Cron" : "Seconds"}
                </Label>
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
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Overlap Policy</Label>
              <Select
                value={overlapPolicy}
                onValueChange={(v) =>
                  setOverlapPolicy(v as TemporalScheduleOverlapPolicy)
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERLAP_POLICIES.map((p) => (
                    <SelectItem key={p} value={p} className="font-mono text-xs">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sched-notes" className="text-xs">
                Notes
              </Label>
              <Input
                id="sched-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional owner or purpose"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sched-args" className="text-xs">
                Input Arguments (JSON)
              </Label>
              <Textarea
                id="sched-args"
                rows={4}
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>
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
            <Button type="submit" size="sm" disabled={submitting}>
              Create Schedule
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
