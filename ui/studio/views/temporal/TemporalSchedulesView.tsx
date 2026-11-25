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
import { useEffect, useMemo, useRef, useState } from "react";
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
  TemporalLoadError,
  TemporalNamespaceBadge,
  TemporalRefreshError,
  TemporalSectionLabel,
  TemporalStatusBadge,
  temporalTableHeadClass,
  TemporalTime,
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

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The first time a schedule is due that has not passed. The server's list can be hours old. */
function nextRunTime(times: string[]): string | undefined {
  const now = Date.now();

  return times.find((iso) => Date.parse(iso) > now);
}

/** The cadence with the time zone of a cron expression, which decides when it fires. */
function cadenceText(schedule: TemporalScheduleSummary): string {
  return schedule.cronExpression
    ? `${schedule.cadenceSummary} (${schedule.timezone ?? "UTC"})`
    : schedule.cadenceSummary;
}

function triggerDescription(schedule: TemporalScheduleSummary): string {
  return `This starts one run of ${schedule.workflowType} on Task Queue ${schedule.taskQueue} now, outside the times of schedule ${schedule.scheduleId}.`;
}

/** A dialog opened from code has no trigger, so the control that opened it must get focus back. */
function focusSoon(element: HTMLElement | null) {
  setTimeout(() => {
    if (element?.isConnected) {
      element.focus();
    }
  }, 0);
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
  // `isOpen` closes the dialog and keeps its text until it is gone.
  const [triggering, setTriggering] = useState<{
    isOpen: boolean;
    schedule: TemporalScheduleSummary;
  } | null>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  // A narrow page has the filter and New Schedule in a row of their own, so there are two of each.
  const headerFilter = useRef<HTMLInputElement>(null);
  const rowFilter = useRef<HTMLInputElement>(null);
  const openNewSchedule = (opener: HTMLElement) => {
    dialogOpener.current = opener;
    setCreateOpen(true);
  };
  const pausingId =
    patchSchedule.isPending &&
    patchSchedule.variables?.input.action !== "trigger"
      ? patchSchedule.variables?.scheduleId
      : undefined;
  // The queue that the schedules of a Workflow Type use, as a suggestion for a new schedule of that type.
  const queueByWorkflowType = useMemo(
    () =>
      Object.fromEntries(
        (data?.schedules ?? []).map((s) => [s.workflowType, s.taskQueue]),
      ),
    [data?.schedules],
  );

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
      toast.error(`Bulk ${action} failed: ${errorText(err)}`);
    }
  };

  const activeCount = schedules.filter((s) => !s.paused).length;
  const pausedCount = schedules.filter((s) => s.paused).length;

  return (
    <div
      className={cn(
        "@container flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-schedules-view"
    >
      <StudioHeader
        title="Schedules"
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
                value={followMode}
                onChange={onFollowModeChange}
              />
            </span>
            <Button
              variant="outline"
              size="sm"
              className="w-8 px-0"
              aria-label="Refresh Schedules"
              title="Refresh Schedules"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
            <Button
              size="sm"
              className="@max-lg:hidden @max-2xl:w-8 @max-2xl:px-0"
              title="New Schedule"
              onClick={(event) => openNewSchedule(event.currentTarget)}
              data-testid="temporal-create-schedule-btn"
            >
              <Plus />
              <span className="@max-2xl:sr-only">New Schedule</span>
            </Button>
          </>
        }
      >
        <span className="contents @max-3xl:hidden">
          <TemporalNamespaceBadge namespace={namespace} />
        </span>
        <ScheduleFilter
          className="max-w-md @max-lg:hidden"
          inputRef={headerFilter}
          onChange={setFilterText}
          value={filterText}
        />
      </StudioHeader>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2 @lg:hidden">
        <ScheduleFilter
          inputRef={rowFilter}
          onChange={setFilterText}
          value={filterText}
        />
        <Button
          size="sm"
          onClick={(event) => openNewSchedule(event.currentTarget)}
        >
          <Plus />
          New Schedule
        </Button>
      </div>

      {data ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <SummaryCount count={schedules.length} label="total" />
          <SummaryCount count={activeCount} label="active" />
          <SummaryCount count={pausedCount} label="paused" />
          {filtered.length < schedules.length ? (
            <span className="ml-auto">
              The filter shows {filtered.length} of {schedules.length}
            </span>
          ) : null}
        </div>
      ) : null}
      {data && isError ? (
        <TemporalRefreshError error={error} onRetry={() => void refetch()} />
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data ? (
          <TemporalLoadError
            error={error}
            onRetry={() => void refetch()}
            title={
              <>
                Could not load the schedules of namespace{" "}
                <code className="font-mono">{namespace}</code>.
              </>
            }
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground">
            <CalendarClock className="size-6 opacity-60" />
            {schedules.length === 0 ? (
              <>
                <p>No schedules in namespace {namespace}.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(event) => openNewSchedule(event.currentTarget)}
                >
                  <Plus />
                  New Schedule
                </Button>
              </>
            ) : (
              <>
                <p>
                  No schedule has{" "}
                  <code className="font-mono text-foreground">
                    {filterText.trim()}
                  </code>{" "}
                  in its ID, Workflow Type, Task Queue or notes.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilterText("");
                    // The one of the two filter fields that the page shows at this width.
                    [headerFilter.current, rowFilter.current]
                      .find((input) => input?.offsetParent)
                      ?.focus();
                  }}
                >
                  Clear Filter
                </Button>
              </>
            )}
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
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden @lg:table-cell",
                  )}
                >
                  State
                </TableHead>
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden @3xl:table-cell",
                  )}
                >
                  Workflow / Queue
                </TableHead>
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden @3xl:table-cell",
                  )}
                >
                  Cadence
                </TableHead>
                <TableHead
                  className={cn(
                    temporalTableHeadClass,
                    "hidden @5xl:table-cell",
                  )}
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
                const nextRun = nextRunTime(sched.nextActionTimes);
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
                    <TableCell className="w-full max-w-0 min-w-36 px-2 py-2.5">
                      <div className="flex min-w-0 flex-col">
                        <button
                          type="button"
                          className="max-w-full self-start truncate rounded-sm py-1 text-left font-mono font-medium text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none @max-lg:break-all @max-lg:whitespace-normal"
                          data-schedule-id={sched.scheduleId}
                          title={sched.scheduleId}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveScheduleId(sched.scheduleId);
                          }}
                        >
                          {sched.scheduleId}
                        </button>
                        {sched.notes ? (
                          <span
                            className="truncate text-2xs text-muted-foreground @max-3xl:hidden"
                            title={sched.notes}
                          >
                            {sched.notes}
                          </span>
                        ) : null}
                        {/* A narrow page has no State, Workflow and Cadence columns, so they go under the ID. */}
                        <span
                          className="truncate text-2xs text-muted-foreground @3xl:hidden"
                          title={`${sched.workflowType} · ${cadenceText(sched)}`}
                        >
                          {sched.paused ? (
                            <span className="font-medium text-amber-700 @lg:hidden dark:text-amber-400">
                              Paused ·{" "}
                            </span>
                          ) : null}
                          {sched.workflowType} · {cadenceText(sched)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden px-2 py-2.5 @lg:table-cell">
                      <ScheduleStateBadge paused={sched.paused} />
                    </TableCell>
                    <TableCell className="hidden px-2 py-2.5 @3xl:table-cell">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">
                          {sched.workflowType}
                        </span>
                        <span className="font-mono text-2xs text-muted-foreground">
                          {sched.taskQueue}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden px-2 py-2.5 whitespace-nowrap @3xl:table-cell">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-foreground">
                          {sched.cadenceSummary}
                        </span>
                        {sched.cronExpression ? (
                          <span
                            className="text-2xs text-muted-foreground"
                            title="The time zone the cron expression is read in"
                          >
                            {sched.timezone ?? "UTC"}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden px-2 py-2.5 font-mono text-muted-foreground @5xl:table-cell">
                      {OVERLAP_POLICY_TEXT[sched.overlapPolicy]?.label ??
                        sched.overlapPolicy}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                      {sched.paused ? "—" : <TemporalTime iso={nextRun} />}
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
                          title="Trigger Now"
                          onClick={(event) => {
                            dialogOpener.current = event.currentTarget;
                            setTriggering({ isOpen: true, schedule: sched });
                          }}
                        >
                          <Zap />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="w-7 px-0 text-muted-foreground"
                          aria-label={`${sched.paused ? "Resume" : "Pause"} ${sched.scheduleId}`}
                          title={sched.paused ? "Resume" : "Pause"}
                          disabled={pausingId === sched.scheduleId}
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
                              .catch((err) =>
                                toast.error(
                                  `Could not ${sched.paused ? "resume" : "pause"} ${sched.scheduleId}: ${errorText(err)}`,
                                ),
                              )
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
              onClick={(event) => {
                dialogOpener.current = event.currentTarget;
                setBulkPauseOpen(true);
              }}
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
              onClick={(event) => {
                dialogOpener.current = event.currentTarget;
                setBulkTriggerConfirmOpen(true);
              }}
            >
              <Zap />
              Trigger
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkScheduleAction.isPending}
              onClick={(event) => {
                dialogOpener.current = event.currentTarget;
                setBulkDeleteConfirmOpen(true);
              }}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={bulkPauseOpen} onOpenChange={setBulkPauseOpen}>
        <DialogContent
          className="sm:max-w-md"
          onCloseAutoFocus={() => dialogOpener.current?.focus()}
        >
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
        onOpenChange={(open) => {
          setBulkTriggerConfirmOpen(open);
          focusSoon(dialogOpener.current);
        }}
        open={bulkTriggerConfirmOpen}
        title="Trigger selected schedules?"
        variant="default"
      />

      <TemporalConfirmDialog
        confirmLabel={`Delete ${pluralize(selectedSchedules.length, "Schedule")}`}
        description={`This permanently deletes ${selectedSummary} in namespace ${namespace}. Workflows that already started keep running.`}
        isPending={bulkScheduleAction.isPending}
        onConfirm={() => runBulk("delete")}
        onOpenChange={(open) => {
          setBulkDeleteConfirmOpen(open);
          focusSoon(dialogOpener.current);
        }}
        open={bulkDeleteConfirmOpen}
        title="Delete selected schedules?"
      />

      <TemporalConfirmDialog
        confirmLabel="Trigger Now"
        description={triggering ? triggerDescription(triggering.schedule) : ""}
        isPending={patchSchedule.isPending}
        onConfirm={async () => {
          if (!triggering) {
            return;
          }

          const { scheduleId } = triggering.schedule;

          try {
            await patchSchedule.mutateAsync({
              input: { action: "trigger" },
              scheduleId,
            });
            toast.success(`Triggered ${scheduleId}`);
          } catch (err) {
            toast.error(`Could not trigger ${scheduleId}: ${errorText(err)}`);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setTriggering((current) =>
              current ? { ...current, isOpen: false } : null,
            );
            focusSoon(dialogOpener.current);
          }
        }}
        open={triggering?.isOpen === true}
        title={`Trigger ${triggering?.schedule.scheduleId ?? "schedule"} now?`}
        variant="default"
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
        onEdit={(detail, opener) => {
          dialogOpener.current = opener;
          setEditingSchedule(detail);
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

      <ScheduleFormSheet
        editing={editingSchedule}
        knownTaskQueues={knownTaskQueues}
        knownWorkflowTypes={knownWorkflowTypes}
        namespace={namespace}
        onClosed={() => dialogOpener.current?.focus()}
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
        queueByWorkflowType={queueByWorkflowType}
      />
    </div>
  );
}

function ScheduleFilter(props: {
  className?: string;
  inputRef: React.Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  value: string;
}) {
  const { className, inputRef, onChange, value } = props;

  return (
    <div
      className={cn("relative flex min-w-24 flex-1 items-center", className)}
    >
      <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
      <Input
        ref={inputRef}
        aria-label="Filter schedules"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.stopPropagation();
            onChange("");
          }
        }}
        placeholder="Filter schedules"
        className="h-8 pl-8 text-xs"
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

/** "in 37d" up to two months, then months or years: thousands of days say little. */
function formatTimeUntil(iso: string): string {
  const days = (Date.parse(iso) - Date.now()) / 86_400_000;

  return days > 730
    ? `in ${Math.round(days / 365)}y`
    : days > 60
      ? `in ${Math.round(days / 30)}mo`
      : formatRelativeTime(iso);
}

/** A time as the sheet writes every UTC time: `2026-11-24 14:05:00Z`. */
function formatUtc(iso: string): string {
  return `${iso.replace("T", " ").slice(0, 19)}Z`;
}

/** The last hour, as the values of two `datetime-local` inputs read in UTC. */
function lastHourWindow(): { end: string; start: string } {
  return {
    end: new Date().toISOString().slice(0, 16),
    start: new Date(Date.now() - 3_600_000).toISOString().slice(0, 16),
  };
}

function ScheduleDetailSheet(props: {
  namespace: string;
  onClose: () => void;
  onDelete: (scheduleId: string) => Promise<void>;
  onEdit: (detail: TemporalScheduleDetail, opener: HTMLElement) => void;
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

  const { data, error, isError, isLoading, refetch } =
    useTemporalScheduleDetail({
      namespace,
      scheduleId: scheduleId ?? undefined,
    });
  // The query keeps the details of the schedule that was open before while the next one loads.
  const detail = data?.scheduleId === scheduleId ? data : undefined;

  const [backfillStart, setBackfillStart] = useState(
    () => lastHourWindow().start,
  );
  const [backfillEnd, setBackfillEnd] = useState(() => lastHourWindow().end);
  const [backfillPreview, setBackfillPreview] = useState<string[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [triggerConfirmOpen, setTriggerConfirmOpen] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const lastOpenId = useRef<string | null>(null);

  useEffect(() => {
    if (!scheduleId) {
      return;
    }

    const lastHour = lastHourWindow();

    lastOpenId.current = scheduleId;
    setBackfillStart(lastHour.start);
    setBackfillEnd(lastHour.end);
    setBackfillPreview(null);
  }, [scheduleId]);

  const info = detail ?? summary;
  const upcomingTimes = info
    ? (detail?.matchingTimes ?? info.nextActionTimes)
        .filter((iso) => Date.parse(iso) > Date.now())
        .slice(0, 8)
    : [];
  const recentActions = info ? info.recentActions.slice(-8).reverse() : [];
  const isWindowSet = backfillStart !== "" && backfillEnd !== "";
  const isWindowValid = isWindowSet && backfillStart < backfillEnd;

  return (
    <Sheet open={Boolean(scheduleId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className={cn(
          "flex w-full flex-col gap-0 p-0 sm:max-w-lg",
          temporalIconScale,
        )}
        // The sheet opens from the URL, so it has no trigger to give focus back to.
        onCloseAutoFocus={() =>
          [...document.querySelectorAll<HTMLElement>("[data-schedule-id]")]
            .find((row) => row.dataset.scheduleId === lastOpenId.current)
            ?.focus()
        }
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
              ? `${info.workflowType} on queue ${info.taskQueue} · ${cadenceText(info)} · Overlap: ${OVERLAP_POLICY_TEXT[info.overlapPolicy]?.label ?? info.overlapPolicy}`
              : `Namespace ${namespace}`}
          </SheetDescription>
        </SheetHeader>

        {info && isError ? (
          <TemporalRefreshError error={error} onRetry={() => void refetch()} />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5 text-xs *:shrink-0">
          {!info ? (
            isError ? (
              <TemporalLoadError
                error={error}
                onRetry={() => void refetch()}
                title={
                  <>
                    Could not load schedule{" "}
                    <code className="font-mono">{scheduleId}</code>.
                  </>
                }
              />
            ) : isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : null
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={(event) => {
                    dialogOpener.current = event.currentTarget;
                    setTriggerConfirmOpen(true);
                  }}
                >
                  <Zap />
                  Trigger Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPausing}
                  onClick={() => {
                    setIsPausing(true);
                    void onPatch(info.scheduleId, {
                      action: info.paused ? "unpause" : "pause",
                    })
                      .then(() =>
                        toast.success(
                          `${info.paused ? "Resumed" : "Paused"} ${info.scheduleId}`,
                        ),
                      )
                      .catch((err) =>
                        toast.error(
                          `Could not ${info.paused ? "resume" : "pause"} ${info.scheduleId}: ${errorText(err)}`,
                        ),
                      )
                      .finally(() => setIsPausing(false));
                  }}
                >
                  {info.paused ? <Play /> : <Pause />}
                  {info.paused ? "Resume" : "Pause"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!detail}
                  title={
                    detail
                      ? undefined
                      : "Edit needs the details of the schedule, which have not loaded"
                  }
                  onClick={(event) =>
                    detail && onEdit(detail, event.currentTarget)
                  }
                  data-testid="temporal-schedule-edit"
                >
                  <Pencil />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={(event) => {
                    dialogOpener.current = event.currentTarget;
                    setDeleteConfirmOpen(true);
                  }}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>

              <section className="flex flex-col gap-2">
                <TemporalSectionLabel>
                  Upcoming Fire Times (UTC)
                </TemporalSectionLabel>
                {info.paused ? (
                  <p className="text-muted-foreground">
                    Paused. This schedule starts no runs until it is resumed.
                  </p>
                ) : upcomingTimes.length === 0 ? (
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
                        <span>{formatUtc(iso)}</span>
                        <span className="text-muted-foreground">
                          {formatTimeUntil(iso)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {info.notes ||
              detail?.catchupWindowSeconds ||
              info.workflowArgs !== undefined ? (
                <section className="flex flex-col gap-2">
                  <TemporalSectionLabel>Details</TemporalSectionLabel>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
                    {info.notes ? (
                      <div className="contents">
                        <dt className="text-muted-foreground">Notes</dt>
                        <dd className="break-words text-foreground">
                          {info.notes}
                        </dd>
                      </div>
                    ) : null}
                    {detail?.catchupWindowSeconds ? (
                      <div className="contents">
                        <dt className="text-muted-foreground">
                          Catch-up Window
                        </dt>
                        <dd className="text-foreground">
                          {formatDuration(detail.catchupWindowSeconds * 1000)}
                        </dd>
                      </div>
                    ) : null}
                    {info.workflowArgs !== undefined ? (
                      <div className="contents">
                        <dt className="text-muted-foreground">
                          Input Arguments
                        </dt>
                        <dd>
                          <pre className="max-h-40 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-2xs text-foreground">
                            {safeJsonPretty(info.workflowArgs)}
                          </pre>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </section>
              ) : null}

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
                      aria-invalid={isWindowSet && !isWindowValid}
                      aria-describedby={
                        isWindowSet && !isWindowValid
                          ? "bf-window-error"
                          : undefined
                      }
                      onChange={(e) => {
                        setBackfillEnd(e.target.value);
                        setBackfillPreview(null);
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </TemporalField>
                </div>
                {isWindowSet && !isWindowValid ? (
                  <p id="bf-window-error" className="text-destructive">
                    The end must be after the start.
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewLoading || !isWindowValid}
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
                        .catch((err) =>
                          toast.error(
                            `Could not preview the fire times: ${errorText(err)}`,
                          ),
                        )
                        .finally(() => {
                          setPreviewLoading(false);
                        });
                    }}
                    data-testid="temporal-backfill-preview-btn"
                  >
                    Preview Fire Times
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!backfillPreview || backfillPreview.length === 0}
                    onClick={(event) => {
                      dialogOpener.current = event.currentTarget;
                      setBackfillConfirmOpen(true);
                    }}
                  >
                    Run Backfill
                    {backfillPreview ? ` (${backfillPreview.length})` : ""}
                  </Button>
                </div>
                {backfillPreview !== null ? (
                  <div
                    className="flex flex-col gap-1 text-foreground"
                    data-testid="temporal-backfill-preview-result"
                  >
                    {backfillPreview.length === 0 ? (
                      <p>No fire times match this window.</p>
                    ) : (
                      <>
                        <p>{pluralize(backfillPreview.length, "fire time")}:</p>
                        <ul className="font-mono">
                          {backfillPreview.slice(0, 4).map((iso) => (
                            <li key={iso}>{formatUtc(iso)}</li>
                          ))}
                        </ul>
                        {backfillPreview.length > 4 ? (
                          <p className="text-muted-foreground">
                            and {backfillPreview.length - 4} more
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </section>

              <section className="flex flex-col gap-2">
                <TemporalSectionLabel>
                  Recent Runs
                  {info.recentActions.length > recentActions.length
                    ? ` (the newest ${recentActions.length} of ${info.recentActions.length})`
                    : ` (${recentActions.length})`}
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
                          <TemporalTime
                            iso={act.actualTime ?? act.scheduleTime}
                          />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <TemporalConfirmDialog
          confirmLabel="Trigger Now"
          description={info ? triggerDescription(info) : ""}
          onConfirm={async () => {
            if (!info) return;
            try {
              await onPatch(info.scheduleId, { action: "trigger" });
              toast.success(`Triggered ${info.scheduleId}`);
            } catch (err) {
              toast.error(
                `Could not trigger ${info.scheduleId}: ${errorText(err)}`,
              );
            }
          }}
          onOpenChange={(open) => {
            setTriggerConfirmOpen(open);
            focusSoon(dialogOpener.current);
          }}
          open={triggerConfirmOpen}
          title={`Trigger ${scheduleId ?? "schedule"} now?`}
          variant="default"
        />

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
              toast.error(`Could not run the backfill: ${errorText(err)}`);
            }
          }}
          onOpenChange={(open) => {
            setBackfillConfirmOpen(open);
            focusSoon(dialogOpener.current);
          }}
          open={backfillConfirmOpen}
          title="Run backfill?"
          variant="default"
        />

        <TemporalConfirmDialog
          confirmLabel="Delete Schedule"
          description={`This permanently deletes schedule ${scheduleId ?? ""}. Workflows that already started keep running.`}
          onConfirm={async () => {
            if (!scheduleId) return;
            try {
              await onDelete(scheduleId);
            } catch (err) {
              toast.error(`Could not delete ${scheduleId}: ${errorText(err)}`);
            }
          }}
          onOpenChange={(open) => {
            setDeleteConfirmOpen(open);
            focusSoon(dialogOpener.current);
          }}
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

/** A shorter interval is almost always a typing mistake, and floods the Task Queue. */
const MIN_INTERVAL_SECONDS = 10;

/** A whole number of seconds as typed into the form, or null for any other text. */
function parseSeconds(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

/** What is wrong with a cron expression that the form can tell without the server. */
function cronError(text: string): string | null {
  const fields = text.trim().split(/\s+/).filter(Boolean);

  if (fields.length === 0) {
    return "Enter a cron expression.";
  }

  // The server also takes a seconds and a year field, and words such as @daily.
  return text.trim().startsWith("@") ||
    (fields.length >= 5 && fields.length <= 7)
    ? null
    : "A cron expression has five fields: minute, hour, day of month, month and day of week.";
}

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });

    return true;
  } catch {
    return false;
  }
}

/** The form that creates a schedule, or changes the one passed as `editing`. */
export function ScheduleFormSheet(props: {
  editing: TemporalScheduleDetail | null;
  knownTaskQueues: string[];
  knownWorkflowTypes: string[];
  namespace: string;
  /** Called when the sheet is gone, to give focus back to what opened it. */
  onClosed?: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: (input: TemporalCreateScheduleInput) => Promise<void>;
  open: boolean;
  /** The Task Queue to suggest for a Workflow Type, where one is known. */
  queueByWorkflowType: Record<string, string>;
}) {
  const {
    editing,
    knownTaskQueues,
    knownWorkflowTypes,
    namespace,
    onClosed,
    onOpenChange,
    onSave: onCreate,
    open,
    queueByWorkflowType,
  } = props;

  const [scheduleId, setScheduleId] = useState("");
  const [workflowType, setWorkflowType] = useState("");
  const [taskQueue, setTaskQueue] = useState("");
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
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSubmitError(null);

    if (!editing) {
      // A new schedule starts empty, also after another schedule was edited.
      // No type or queue is filled in: the first of each list need not belong together.
      setScheduleId("");
      setWorkflowType("");
      setTaskQueue("");
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
  }, [editing, open]);

  const parsedArgs = parseJsonArgsText(argsText);
  const interval = parseSeconds(intervalSeconds);
  const catchup = parseSeconds(catchupSeconds);
  const cadenceError =
    cadenceMode === "cron"
      ? cronError(cronExpression)
      : interval === null
        ? "Enter a whole number of seconds, such as 3600 for one hour."
        : interval < MIN_INTERVAL_SECONDS
          ? `The shortest interval is ${MIN_INTERVAL_SECONDS} seconds.`
          : null;
  const catchupError =
    catchupSeconds.trim() === "" || (catchup !== null && catchup > 0)
      ? null
      : "Enter a whole number of seconds, or leave it empty.";
  const timezoneError =
    timezone.trim() === "" || isTimeZone(timezone.trim())
      ? null
      : "Not a time zone name, such as Europe/Berlin.";
  const isInvalid =
    cadenceError !== null ||
    catchupError !== null ||
    timezoneError !== null ||
    Boolean(parsedArgs.error);

  const chooseWorkflowType = (value: string) => {
    const suggested = queueByWorkflowType[value];

    // The queue follows the type while it is empty or was filled in for the type before.
    if (
      suggested &&
      (taskQueue === "" || taskQueue === queueByWorkflowType[workflowType])
    ) {
      setTaskQueue(suggested);
    }

    setWorkflowType(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onCreate({
        args: parsedArgs.args,
        ...(cadenceMode === "cron"
          ? { cronExpression: cronExpression.trim() }
          : { intervalSeconds: interval ?? undefined }),
        ...(catchup ? { catchupWindowSeconds: catchup } : {}),
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
      setSubmitError(errorText(err));
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
        onCloseAutoFocus={onClosed}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // The ID of an existing schedule cannot change, so focus starts at the first field that can.
          document
            .getElementById(editing ? "sched-wf-type" : "sched-id")
            ?.focus();
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
                  onChange={chooseWorkflowType}
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
                  aria-describedby="sched-cadence-hint"
                  aria-invalid={cadenceError !== null}
                  inputMode={cadenceMode === "cron" ? undefined : "numeric"}
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
                <p
                  id="sched-cadence-hint"
                  className={cn(
                    "text-2xs",
                    cadenceError ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {cadenceError ??
                    (cadenceMode === "cron"
                      ? "Minute, hour, day of month, month, day of week."
                      : `Every ${formatDuration((interval ?? 0) * 1000)}.`)}
                </p>
              </TemporalField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TemporalField htmlFor="sched-timezone" label="Time Zone">
                <Input
                  id="sched-timezone"
                  aria-describedby="sched-timezone-hint"
                  aria-invalid={timezoneError !== null}
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
                <p
                  id="sched-timezone-hint"
                  className={cn(
                    "text-2xs",
                    timezoneError
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {timezoneError ??
                    "A cron expression is read in this time zone."}
                </p>
              </TemporalField>
              <TemporalField
                htmlFor="sched-catchup"
                label="Catch-up Window (seconds)"
              >
                <Input
                  id="sched-catchup"
                  aria-describedby="sched-catchup-hint"
                  aria-invalid={catchupError !== null}
                  inputMode="numeric"
                  value={catchupSeconds}
                  onChange={(e) => setCatchupSeconds(e.target.value)}
                  placeholder="Server default (1 year)"
                  className="h-8 font-mono text-xs"
                />
                <p
                  id="sched-catchup-hint"
                  className={cn(
                    "text-2xs",
                    catchupError ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {catchupError ??
                    `${catchup ? `${formatDuration(catchup * 1000)}. ` : ""}After an outage, runs missed by more than this are skipped.`}
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
          {submitError ? (
            <p
              className="border-t border-border px-5 py-2 text-xs break-words text-destructive"
              role="alert"
            >
              Could not {editing ? "save" : "create"} the schedule:{" "}
              {submitError}
            </p>
          ) : null}
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
                isInvalid
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
