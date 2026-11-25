import {
  AlertTriangle,
  ArrowUpLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  History,
  Link2,
  ListFilter,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  StopCircle,
  Terminal,
  Waves,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  TemporalActivityOperation,
  TemporalExecutionDetail,
  TemporalFollowMode,
  TemporalGroupedSpan,
  TemporalPendingActivity,
  TemporalTypeMapResponse,
} from "@/data/temporal";
import {
  mergeRunIntoTypeMap,
  runSteps,
  timerProgress,
  typeMapStepId,
} from "@/data/temporal/type-map";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
import { Input } from "@/ui/components/ui/input";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {} from "@/ui/components/ui/tooltip";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useStreams } from "@/ui/hooks/use-streams";
import {
  useTemporalActions,
  useTemporalCapabilities,
  useTemporalTypeMap,
  useTemporalWorkflowCounts,
  useTemporalWorkflowDetail,
  useTemporalWorkflowMetadata,
  useTemporalWorkflows,
  useTemporalWorkflowStack,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { useStudio } from "../../context";
import { StudioHeader } from "../../StudioHeader";
import {
  formatDuration,
  formatFailureMessage,
  formatTimeLeft,
  safeJsonPretty,
} from "./temporal-utils";
import { TemporalFailurePanel } from "./TemporalFailurePanel";
import { TemporalInteractPanel } from "./TemporalInteractPanel";
import { payloadSizeText, TemporalPayloadView } from "./TemporalPayloadView";
import { TemporalPendingActivityCard } from "./TemporalPendingActivityCard";
import {
  TEMPORAL_SPAN_STATUS,
  TemporalConfirmDialog,
  TemporalFollowControl,
  temporalIconScale,
  TemporalLoadError,
  TemporalRefreshError,
  TemporalSectionLabel,
  TemporalSegmentedControl,
  TemporalStatusBadge,
  TemporalTime,
  useNow,
} from "./TemporalPrimitives";
import { relatedRunCount, TemporalRelatedPanel } from "./TemporalRelatedPanel";
import {
  quoteFilterValue,
  TemporalCopyButton,
  TemporalRunBreadcrumb,
} from "./TemporalRunBreadcrumb";
import { TemporalRunCompare } from "./TemporalRunCompare";
import {
  TemporalRunDiagram,
  TemporalRunDiagramInfo,
  TemporalTimerDetail,
} from "./TemporalRunDiagram";
import { TemporalRunStatus } from "./TemporalRunStatus";
import { TemporalRunStepper } from "./TemporalRunStepper";
import type { TemporalStartPreset } from "./TemporalStartSheet";
import { TemporalTimeline } from "./TemporalTimeline";

type InspectorTab = "interact" | "pending" | "related" | "stack" | "meta";

const NEWEST_FIRST = { direction: "desc", field: "StartTime" } as const;

interface TemporalExecutionDebuggerProps {
  followMode: TemporalFollowMode;
  /**
   * A run read from a history file. The page then shows that file and offers
   * no action, because the run may not exist on this server.
   */
  imported?: TemporalExecutionDetail;
  namespace: string;
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
    imported,
    namespace,
    workflowId,
    runId,
    followMode,
    onClone,
    onFollowModeChange,
    onOpenExecution,
  } = props;

  const fetched = useTemporalWorkflowDetail({
    enabled: !imported,
    followMode,
    namespace,
    runId,
    workflowId,
  });
  // While another run loads, the query still holds the run shown before. That
  // run must not appear under this one's ID.
  const fetchedIsThisRun =
    fetched.data?.execution.workflowId === workflowId &&
    (!runId || fetched.data.execution.runId === runId);
  const data = imported ?? (fetchedIsThisRun ? fetched.data : undefined);
  const { error, isError, isFetching, refetch } = fetched;
  const isLoading =
    !imported && (fetched.isLoading || (!data && fetched.isFetching));
  const { data: capabilities } = useTemporalCapabilities();
  // Every run of this Workflow ID, newest first: the path in the header and
  // the Related tab both show them. A server finds them by ID without a scan.
  const runsFollowMode = followMode === "paused" ? "paused" : "live";
  const runsFilter = `WorkflowId = ${quoteFilterValue(workflowId)}`;
  const runsQuery = useTemporalWorkflows({
    enabled: !imported,
    followMode: runsFollowMode,
    includeCounts: false,
    namespace,
    pageSize: 100,
    query: runsFilter,
    sort: NEWEST_FIRST,
  });
  const runsOfId = imported ? undefined : runsQuery.data?.executions;
  const hasMoreRuns = !imported && Boolean(runsQuery.data?.nextPageToken);
  // One page does not hold every run of a long chain, so the server counts them.
  const runCounts = useTemporalWorkflowCounts({
    enabled: hasMoreRuns,
    followMode: runsFollowMode,
    namespace,
    query: runsFilter,
    sort: NEWEST_FIRST,
  });
  const runCount = hasMoreRuns ? runCounts.data?.totalCount : runsOfId?.length;
  const { temporalEventParam, setTemporalEventParam } = useNavigation();

  const { hasDatabase, streamsUrl } = useStudio();
  const { createUrl, schemaParam, streamParam, tableParam } = useNavigation();
  const { streams } = useStreams();
  const targetStream =
    streamParam ??
    streams.find((stream) => stream.observability?.request?.eventsStream)
      ?.observability?.request?.eventsStream ??
    streams[0]?.name;
  const {
    activityOperation,
    cancelWorkflow,
    resetStickyTaskQueue,
    resetWorkflow,
    setWorkflowPaused,
    terminateWorkflow,
  } = useTemporalActions(namespace);
  // The Interact tab asks for the same data, so this costs no second request.
  const metadata = useTemporalWorkflowMetadata({
    enabled: Boolean(data) && !imported,
    namespace,
    runId: data?.execution.runId,
    workflowId,
  });

  const [historyTab, setHistoryTab] = useState<
    "compare" | "diagram" | "grouped" | "raw"
  >("grouped");
  const [diagramNodeId, setDiagramNodeId] = useState<string | null>(null);
  const [diagramSpanIds, setDiagramSpanIds] = useState<string[]>([]);
  // The span the run page is on, in every history view and on the timeline: the stepper moves it.
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [typeMapDraw, setTypeMapDraw] = useState<{
    redraw: number;
    sampleSize?: number;
  }>({ redraw: 0 });
  // The diagram of the type is read only when something on screen shows it:
  // the Diagram tab, or the open row of a Timer.
  const needsTypeMap =
    !imported &&
    (historyTab === "diagram" ||
      data?.spans.some(
        (span) => span.id === selectedSpanId && span.kind === "timer",
      ) === true);
  const typeMap = useTemporalTypeMap({
    followMode,
    namespace,
    redraw: typeMapDraw.redraw,
    sampleSize: typeMapDraw.sampleSize,
    workflowType: needsTypeMap ? (data?.execution.workflowType ?? null) : null,
  });
  // The type's diagram with this run's own steps added, so every step of the run has a node.
  const runTypeMap = useMemo(
    () =>
      typeMap.data && data ? mergeRunIntoTypeMap(typeMap.data, data) : null,
    [data, typeMap.data],
  );
  const steps = useMemo(() => (data ? runSteps(data) : []), [data]);
  const stepIndex = selectedSpanId
    ? steps.findIndex((span) => span.id === selectedSpanId)
    : -1;
  const stepPosition = stepIndex >= 0 ? stepIndex : null;
  /** Puts the run page on a span: its row, its events, its node on the diagram. */
  const selectSpan = (spanId: string | null) => {
    setSelectedSpanId(spanId);

    const span = spanId ? spans.find((item) => item.id === spanId) : undefined;
    const nodeId = span && runTypeMap ? typeMapStepId(span, runTypeMap) : null;

    if (nodeId) {
      setDiagramNodeId(nodeId);
    }
  };
  const [rawFilter, setRawFilter] = useState("");
  const [hiddenEventTypes, setHiddenEventTypes] = useState<string[]>([]);
  // The open event is in the URL, so the page's link points at it.
  const expandedRawId = temporalEventParam ? Number(temporalEventParam) : null;
  const setExpandedRawId = (eventId: number | null) =>
    void setTemporalEventParam(eventId === null ? null : String(eventId));
  const [terminateConfirmOpen, setTerminateConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [resetEventId, setResetEventId] = useState<number | null>(null);
  const [resetActivityId, setResetActivityId] = useState<string | null>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  // A dialog that code opens has no trigger to give focus back to, so the page remembers where focus was.
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const rememberDialogOpener = () => {
    dialogOpenerRef.current = document.activeElement as HTMLElement | null;
  };
  const restoreFocusAfterDialog = () =>
    requestAnimationFrame(() => {
      const opener = dialogOpenerRef.current;

      // A menu item is gone once its menu has closed; the menu's button stands in for it.
      (opener?.isConnected ? opener : actionsButtonRef.current)?.focus();
    });

  const [chosenTab, setInspectorTab] = useState<InspectorTab | null>(null);

  const execution = data?.execution;
  const spans = useMemo(() => data?.spans ?? [], [data?.spans]);
  const rawEvents = useMemo(() => data?.rawEvents ?? [], [data?.rawEvents]);
  const totalDurationMs = data?.totalDurationMs ?? 1;

  const isRunning = execution?.status === "Running";
  const isPaused = execution?.status === "Paused";
  const canAct = !imported;
  const eventTypes = useMemo(
    () => Array.from(new Set(rawEvents.map((evt) => evt.eventType))).sort(),
    [rawEvents],
  );
  // A reset continues from a completed Workflow Task.
  const resetPoints = useMemo(
    () =>
      rawEvents
        .filter((evt) => evt.eventType === "WorkflowTaskCompleted")
        .map((evt) => evt.eventId),
    [rawEvents],
  );
  const canReset =
    canAct && capabilities?.supportsReset === true && resetPoints.length > 0;

  useEffect(() => {
    if (expandedRawId === null || rawEvents.length === 0) {
      return;
    }

    // A link to one event opens the raw list at that event.
    setHistoryTab("raw");
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-temporal-event="${expandedRawId}"]`)
        ?.scrollIntoView({ block: "start" });
    });
    // Only when the page opens on an event, or the events first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawEvents.length > 0]);

  useEffect(() => {
    if (!selectedSpanId || (historyTab !== "grouped" && historyTab !== "raw")) {
      return;
    }

    // The span the page moved to may be far down the list: its row, or its first event.
    const firstEventId = spans.find((span) => span.id === selectedSpanId)
      ?.eventIds[0];
    const rows = Array.from(
      historyListRef.current?.querySelectorAll<HTMLElement>(
        historyTab === "grouped"
          ? "[data-temporal-span]"
          : "[data-temporal-event]",
      ) ?? [],
    );

    rows
      .find((row) =>
        historyTab === "grouped"
          ? row.dataset.temporalSpan === selectedSpanId
          : row.dataset.temporalEvent === String(firstEventId),
      )
      // A span's events go to the middle, so the ones after the first show too.
      ?.scrollIntoView({ block: historyTab === "raw" ? "center" : "nearest" });
  }, [historyTab, selectedSpanId, spans]);

  const sendActivityOperation = (
    activityId: string,
    operation: TemporalActivityOperation,
  ) =>
    activityOperation
      .mutateAsync({
        activityId,
        operation,
        runId: execution?.runId,
        workflowId,
      })
      .then(() => toast.success(`Activity ${activityId}: ${operation} done`))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  const runActivityOperation = (
    activityId: string,
    operation: TemporalActivityOperation,
  ) => {
    // A reset drops the attempts made so far and runs the Activity at once, so it asks first.
    if (operation === "reset") {
      rememberDialogOpener();
      setResetActivityId(activityId);
      return;
    }

    void sendActivityOperation(activityId, operation);
  };
  // The arrow keys step through the rows of the span list and the event list.
  const moveBetweenHistoryRows = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const rows = Array.from(
      historyListRef.current?.querySelectorAll<HTMLElement>(
        "[data-history-row]",
      ) ?? [],
    );
    const index = rows.indexOf(event.currentTarget);
    const target =
      event.key === "ArrowDown"
        ? rows[index + 1]
        : event.key === "ArrowUp"
          ? rows[index - 1]
          : undefined;

    if (target) {
      event.preventDefault();
      target.focus();
    }
  };
  const showInspectorTab = (tab: InspectorTab) => {
    setInspectorTab(tab);
    // On a narrow page the inspector is under the history, out of view.
    requestAnimationFrame(() =>
      document
        .getElementById("temporal-inspector-panel")
        ?.scrollIntoView({ block: "nearest" }),
    );
  };
  const pendingActivities = execution?.pendingActivities ?? [];
  const retryingActivity =
    pendingActivities.find((pa) => pa.lastFailure != null) ?? null;
  const nextAttemptTime =
    retryingActivity?.nextAttemptScheduleTime &&
    Date.parse(retryingActivity.nextAttemptScheduleTime) > Date.now()
      ? retryingActivity.nextAttemptScheduleTime
      : undefined;
  const lastFailedSpan =
    spans.filter((span) => span.status === "failed").at(-1) ?? null;
  const failedSpan = isRunning && !retryingActivity ? lastFailedSpan : null;
  const inspectSpan = (spanId: string) => {
    setHistoryTab("grouped");
    selectSpan(spanId);
  };
  const selectedEventIds = useMemo(
    () =>
      new Set(spans.find((span) => span.id === selectedSpanId)?.eventIds ?? []),
    [selectedSpanId, spans],
  );
  // The time between an event and the one before it. An offset from the start is too coarse after a long wait.
  const eventGaps = useMemo(
    () =>
      new Map(
        rawEvents.slice(1).map((evt, index) => [
          evt.eventId,
          {
            afterEventId: rawEvents[index]!.eventId,
            ms: Math.max(0, evt.offsetMs - rawEvents[index]!.offsetMs),
          },
        ]),
      ),
    [rawEvents],
  );

  const filteredRawEvents = useMemo(() => {
    const q = rawFilter.trim().toLowerCase();
    const shown = rawEvents.filter(
      (evt) => !hiddenEventTypes.includes(evt.eventType),
    );
    if (!q) return shown;
    return shown.filter(
      (evt) =>
        evt.eventType.toLowerCase().includes(q) ||
        String(evt.eventId).includes(q) ||
        JSON.stringify(evt.attributes).toLowerCase().includes(q),
    );
  }, [hiddenEventTypes, rawEvents, rawFilter]);

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

  // A closed run has no pending Activity and no call stack, and its result is what people open it for.
  const isClosed = Boolean(execution) && !isRunning && !isPaused;
  const inspectorTabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "interact", label: "Interact" },
    ...(isClosed
      ? []
      : [
          {
            id: "pending" as const,
            label: `Pending ${pendingActivities.length}`,
          },
        ]),
    {
      id: "related",
      label: execution
        ? `Related ${relatedRunCount({ execution, runCount, runs: runsOfId, spans })}${hasMoreRuns && runCount === undefined ? "+" : ""}`
        : "Related",
    },
    ...(isClosed ? [] : [{ id: "stack" as const, label: "Stack" }]),
    { id: "meta", label: isClosed ? "Input & Result" : "Input" },
  ];
  const inspectorTab: InspectorTab =
    chosenTab && !imported && inspectorTabs.some((tab) => tab.id === chosenTab)
      ? chosenTab
      : isClosed || imported
        ? "meta"
        : "interact";
  const eventDetails = useMemo(() => describeRawEvents(rawEvents), [rawEvents]);

  return (
    <div
      className={cn(
        "@container flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-execution-debugger"
    >
      <StudioHeader
        endContent={
          <>
            {imported ? (
              <Badge variant="secondary" className="font-normal">
                From a history file
              </Badge>
            ) : (
              <TemporalFollowControl
                value={followMode}
                onChange={onFollowModeChange}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              className={cn("w-8 px-0", imported && "hidden")}
              onClick={() => void refetch()}
              aria-label="Refresh execution"
            >
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClone}
              disabled={!execution}
              data-testid="temporal-clone-btn"
            >
              <Play />
              <span className="@max-4xl:sr-only">Clone &amp; Start</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={actionsButtonRef}
                  variant="outline"
                  size="sm"
                  className="w-8 px-0"
                  aria-label="Execution actions"
                  data-testid="temporal-debugger-actions"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-60 [&_[role=menuitem]]:text-xs"
              >
                <DropdownMenuItem
                  disabled={!data}
                  onClick={handleDownloadReplayJson}
                >
                  <Download />
                  Download Replay JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleCopyCli()}>
                  <Terminal />
                  Copy Temporal CLI Command
                </DropdownMenuItem>
                {execution?.parentWorkflowId ? (
                  <DropdownMenuItem
                    onClick={() =>
                      onOpenExecution(
                        execution.parentWorkflowId!,
                        execution.parentRunId,
                      )
                    }
                  >
                    <ArrowUpLeft />
                    Open Parent Run
                  </DropdownMenuItem>
                ) : null}
                {execution && typeof streamsUrl === "string" ? (
                  <DropdownMenuItem asChild>
                    <a
                      href={createUrl({
                        searchParam: execution.workflowId,
                        ...(targetStream ? { streamParam: targetStream } : {}),
                        viewParam: "stream",
                      })}
                    >
                      <Waves />
                      Search Streams
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {execution && hasDatabase ? (
                  <DropdownMenuItem asChild>
                    <a
                      href={createUrl({
                        schemaParam,
                        searchParam: execution.workflowId,
                        tableParam,
                        viewParam: "table",
                      })}
                    >
                      <Database />
                      Search Tables
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {canReset ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        rememberDialogOpener();
                        setResetEventId(resetPoints.at(-1)!);
                      }}
                    >
                      <History />
                      Reset to Last Workflow Task
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        rememberDialogOpener();
                        setResetEventId(resetPoints[0]!);
                      }}
                    >
                      <History />
                      Reset to First Workflow Task
                    </DropdownMenuItem>
                  </>
                ) : null}
                {canAct &&
                capabilities?.supportsWorkflowPause &&
                execution &&
                (isRunning || isPaused) ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void setWorkflowPaused
                        .mutateAsync({
                          paused: !isPaused,
                          runId: execution.runId,
                          workflowId,
                        })
                        .then(() =>
                          toast.success(
                            `${isPaused ? "Resumed" : "Paused"} ${workflowId}`,
                          ),
                        )
                        .catch((e) =>
                          toast.error(
                            e instanceof Error ? e.message : String(e),
                          ),
                        )
                    }
                  >
                    {isPaused ? <Play /> : <Pause />}
                    {isPaused ? "Resume Execution" : "Pause Execution"}
                  </DropdownMenuItem>
                ) : null}
                {/* Only an open run has Workflow Tasks left to route. */}
                {canAct && execution && (isRunning || isPaused) ? (
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
                    <RotateCcw />
                    Reset Sticky Queue
                  </DropdownMenuItem>
                ) : null}
                {canAct && (isRunning || isPaused) && execution ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        rememberDialogOpener();
                        setCancelConfirmOpen(true);
                      }}
                    >
                      <XCircle />
                      Request Cancel
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        rememberDialogOpener();
                        setTerminateConfirmOpen(true);
                      }}
                    >
                      <StopCircle />
                      Terminate Execution
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          {execution ? (
            <>
              {/* A narrow page has no room for the path in the header; the row under it shows it. */}
              <TemporalRunBreadcrumb
                className="@max-4xl:hidden"
                execution={execution}
                isImported={Boolean(imported)}
                namespace={namespace}
                onOpenRun={(runId) => onOpenExecution(workflowId, runId)}
                hasMoreRuns={hasMoreRuns}
                runCount={runCount}
                runs={runsOfId}
              />
              {/* A narrow header has no room for the status either; the row under it shows it. */}
              <TemporalRunStatus
                className="@max-4xl:hidden"
                currentDetails={metadata.data?.currentDetails}
                detail={data}
                isImported={Boolean(imported)}
                run={execution}
              />
            </>
          ) : (
            <h1 className="truncate font-mono text-xs font-normal text-muted-foreground">
              {workflowId}
            </h1>
          )}
        </div>
      </StudioHeader>

      {isLoading ? (
        <div
          aria-label="Loading the run"
          className="flex flex-col gap-3 p-4"
          role="status"
        >
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !data || !execution ? (
        <div className="flex flex-1 flex-col justify-center">
          <TemporalLoadError
            error={error}
            onRetry={() => void refetch()}
            title={
              <>
                Could not load this run of{" "}
                <span className="font-mono">{workflowId}</span>.
              </>
            }
          >
            <Button asChild variant="outline" size="sm">
              <a
                href={createUrl({
                  temporalNsParam: namespace,
                  temporalSectionParam: "workflows",
                  viewParam: "temporal",
                })}
              >
                Open Executions
              </a>
            </Button>
          </TemporalLoadError>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {isError ? (
            <TemporalRefreshError
              error={error}
              onRetry={() => void refetch()}
            />
          ) : null}

          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-1.5 @4xl:hidden"
            data-testid="temporal-debugger-identity"
          >
            <TemporalRunBreadcrumb
              className="flex-wrap"
              execution={execution}
              isImported={Boolean(imported)}
              namespace={namespace}
              onOpenRun={(runId) => onOpenExecution(workflowId, runId)}
              hasMoreRuns={hasMoreRuns}
              runCount={runCount}
              runs={runsOfId}
            />
            <TemporalRunStatus
              currentDetails={metadata.data?.currentDetails}
              detail={data}
              isImported={Boolean(imported)}
              run={execution}
            />
          </div>

          {data.codec && (data.codec.encoded > 0 || data.codec.error) ? (
            <p
              className="border-b border-border bg-amber-500/10 px-4 py-1.5 text-2xs text-foreground"
              data-testid="temporal-codec-notice"
            >
              {data.codec.error
                ? `The Codec Server could not decode this run's payloads: ${data.codec.error}.`
                : `${data.codec.encoded} payloads of this run are encoded. Set a Codec Server for Studio's Temporal connection to read them.`}
            </p>
          ) : null}

          {data.failure ? (
            <div
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs"
              data-testid="temporal-failure-callout"
            >
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                <span
                  className="truncate font-medium text-foreground"
                  title={formatFailureMessage(data.failure)}
                >
                  {formatFailureMessage(data.failure)}
                </span>
              </div>
              {lastFailedSpan ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inspectSpan(lastFailedSpan.id)}
                >
                  Inspect Span
                </Button>
              ) : null}
            </div>
          ) : retryingActivity ? (
            <div
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs"
              data-testid="temporal-retry-callout"
            >
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
                <span className="truncate text-foreground">
                  <span className="font-medium">Retrying activity</span>{" "}
                  <code className="font-mono">
                    {retryingActivity.activityType}
                  </code>{" "}
                  (attempt {retryingActivity.attempt}
                  {retryingActivity.maximumAttempts > 0
                    ? `/${retryingActivity.maximumAttempts}`
                    : ""}
                  {nextAttemptTime ? (
                    <>
                      , next <TemporalTime iso={nextAttemptTime} />
                    </>
                  ) : null}
                  ): {retryingActivity.lastFailure?.message}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(metadata.data?.signals.length ?? 0) > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => showInspectorTab("interact")}
                  >
                    Send Signal
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => showInspectorTab("pending")}
                >
                  Inspect Pending
                </Button>
              </div>
            </div>
          ) : failedSpan ? (
            <div
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs"
              data-testid="temporal-failed-activity-callout"
            >
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                <span className="truncate text-foreground">
                  <span className="font-medium">Activity failed</span>{" "}
                  <code className="font-mono">{failedSpan.label}</code>
                  {failedSpan.error ? `: ${failedSpan.error.message}` : ""}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => inspectSpan(failedSpan.id)}
              >
                Inspect Span
              </Button>
            </div>
          ) : null}

          {/* On a narrow page the panels stack and the page scrolls as one. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_340px] @4xl:overflow-visible">
            <div className="flex min-h-0 min-w-0 flex-col @max-4xl:shrink-0">
              {spans.length > 0 ? (
                <TemporalTimeline
                  highlightedSpanIds={
                    historyTab === "diagram" && !selectedSpanId
                      ? diagramSpanIds
                      : undefined
                  }
                  namespace={namespace}
                  onOpenExecution={onOpenExecution}
                  onSelectSpan={(spanId) => {
                    // Compare has no span of its own to show.
                    if (historyTab === "compare") {
                      setHistoryTab("grouped");
                    }

                    selectSpan(spanId);
                  }}
                  selectedSpanId={selectedSpanId}
                  spans={spans}
                  startTime={execution.startTime}
                  totalDurationMs={totalDurationMs}
                />
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <TemporalSegmentedControl
                    ariaLabel="History view"
                    // Four views do not fit a narrow page at their full padding.
                    className="@max-lg:gap-0 @max-lg:[&>button]:px-1.5"
                    onChange={setHistoryTab}
                    options={[
                      {
                        count: spans.length,
                        label: "Grouped Spans",
                        value: "grouped",
                      },
                      {
                        count: rawEvents.length,
                        label: "Raw Events",
                        value: "raw",
                      },
                      // A run from a history file has no type on the server to draw.
                      ...(imported
                        ? []
                        : [
                            {
                              label: "Diagram",
                              title:
                                "The steps of this Workflow Type, with this run marked",
                              value: "diagram" as const,
                            },
                          ]),
                      ...(!imported &&
                      (execution.status === "Failed" ||
                        execution.status === "TimedOut")
                        ? [
                            {
                              label: "Compare",
                              title:
                                "Compare this failed run against a recent completed run",
                              value: "compare" as const,
                            },
                          ]
                        : []),
                    ]}
                    value={historyTab}
                  />
                  {historyTab === "diagram" && runTypeMap && typeMap.data ? (
                    <TemporalRunDiagramInfo
                      detail={data}
                      isRedrawing={typeMap.isFetching && typeMapDraw.redraw > 0}
                      map={typeMap.data}
                      onRedraw={(sampleSize) =>
                        setTypeMapDraw((draw) => ({
                          redraw: draw.redraw + 1,
                          sampleSize,
                        }))
                      }
                      typeUrl={createUrl({
                        temporalNsParam: namespace,
                        temporalSectionParam: "types",
                        temporalTypeParam: execution.workflowType,
                        viewParam: "temporal",
                      })}
                    />
                  ) : null}
                  {historyTab !== "compare" ? (
                    <TemporalRunStepper
                      isOpen={isRunning || isPaused}
                      onChange={(position) =>
                        selectSpan(
                          position === null
                            ? null
                            : (steps[position]?.id ?? null),
                        )
                      }
                      position={stepPosition}
                      steps={steps}
                    />
                  ) : null}
                </div>
                {historyTab === "raw" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {filteredRawEvents.length < rawEvents.length ? (
                      <span
                        className="font-mono text-2xs text-muted-foreground tabular-nums"
                        data-testid="temporal-raw-shown"
                      >
                        {filteredRawEvents.length.toLocaleString("en-US")} of{" "}
                        {rawEvents.length.toLocaleString("en-US")} shown
                      </span>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid="temporal-event-type-filter"
                        >
                          <ListFilter />
                          Event Types
                          {hiddenEventTypes.length > 0
                            ? ` (${eventTypes.length - hiddenEventTypes.length}/${eventTypes.length})`
                            : ""}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="max-h-80 w-[22rem] overflow-y-auto [&_[role=menuitem]]:text-xs"
                      >
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            setHiddenEventTypes(
                              hiddenEventTypes.length > 0 ? [] : eventTypes,
                            );
                          }}
                        >
                          {hiddenEventTypes.length > 0
                            ? "Show All"
                            : "Hide All"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {eventTypes.map((type) => (
                          <DropdownMenuCheckboxItem
                            key={type}
                            checked={!hiddenEventTypes.includes(type)}
                            className="font-mono text-xs"
                            // Keep the menu open, so several types can be changed at once.
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={(checked) =>
                              setHiddenEventTypes((hidden) =>
                                checked
                                  ? hidden.filter((item) => item !== type)
                                  : [...hidden, type],
                              )
                            }
                          >
                            {type}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Input
                      aria-label="Filter raw events"
                      value={rawFilter}
                      onChange={(e) => setRawFilter(e.target.value)}
                      placeholder="Filter raw events"
                      className="h-8 w-56 text-xs @max-lg:w-40"
                    />
                  </div>
                ) : null}
              </div>

              {data.historyTruncated ? (
                <p className="border-b border-border bg-amber-500/10 px-4 py-1.5 text-2xs text-foreground">
                  This run has {execution.historyLength.toLocaleString("en-US")}{" "}
                  events.{" "}
                  {data.historyTailIncluded
                    ? `Studio shows the first events and the latest events (${rawEvents.length.toLocaleString("en-US")} loaded).`
                    : `Studio shows the first ${rawEvents.length.toLocaleString("en-US")}.`}
                </p>
              ) : null}

              <div
                ref={historyListRef}
                className="min-h-0 flex-1 overflow-y-auto @max-4xl:max-h-[28rem] @max-4xl:flex-none"
              >
                {historyTab === "compare" && !imported ? (
                  <TemporalRunCompare
                    detail={data}
                    namespace={namespace}
                    onOpenExecution={onOpenExecution}
                  />
                ) : historyTab === "diagram" ? (
                  <TemporalRunDiagram
                    detail={data}
                    isError={typeMap.isError}
                    map={typeMap.data}
                    onActiveSpanIdsChange={setDiagramSpanIds}
                    onRetry={() => void typeMap.refetch()}
                    onSelectNode={(nodeId) => {
                      setDiagramNodeId(nodeId);

                      // A step this run took moves the run to its latest visit.
                      const visit =
                        nodeId && runTypeMap
                          ? [...steps]
                              .reverse()
                              .find(
                                (span) =>
                                  typeMapStepId(span, runTypeMap) === nodeId,
                              )
                          : undefined;

                      if (visit) {
                        setSelectedSpanId(visit.id);
                      }
                    }}
                    position={stepPosition}
                    selectedNodeId={diagramNodeId}
                  />
                ) : historyTab === "grouped" ? (
                  spans.length === 0 ? (
                    <p className="p-10 text-center text-xs text-muted-foreground">
                      {isClosed
                        ? "This run closed without an Activity, a Timer, a Signal or a Child Workflow."
                        : "No Activity, Timer, Signal or Child Workflow so far."}{" "}
                      Raw Events shows the lifecycle events.
                    </p>
                  ) : (
                    <div className="[&>*+*]:border-t [&>*+*]:border-border/60">
                      {spans.map((span) => {
                        const matchingPending =
                          span.kind === "activity" &&
                          span.activityId &&
                          span.closedEventId === undefined
                            ? pendingActivities.find(
                                (pa) => pa.activityId === span.activityId,
                              )
                            : undefined;
                        return (
                          <GroupedSpanRow
                            key={span.id}
                            canAct={canAct}
                            isExpanded={selectedSpanId === span.id}
                            isPendingAction={activityOperation.isPending}
                            onActivityOperation={runActivityOperation}
                            onKeyDown={moveBetweenHistoryRows}
                            onShowInDiagram={
                              imported
                                ? undefined
                                : () => {
                                    selectSpan(span.id);
                                    setHistoryTab("diagram");
                                  }
                            }
                            onToggle={() =>
                              selectSpan(
                                selectedSpanId === span.id ? null : span.id,
                              )
                            }
                            pendingActivity={matchingPending}
                            span={span}
                            supportsActivityOperations={
                              capabilities?.supportsActivityOperations === true
                            }
                            typeMap={imported ? null : typeMap.data}
                          />
                        );
                      })}
                    </div>
                  )
                ) : filteredRawEvents.length === 0 ? (
                  <p className="p-10 text-center text-xs text-muted-foreground">
                    No events match this filter.
                  </p>
                ) : (
                  <div className="[&>*+*]:border-t [&>*+*]:border-border/60">
                    {filteredRawEvents.map((evt) => {
                      const isExpanded = expandedRawId === evt.eventId;
                      const gap = eventGaps.get(evt.eventId);

                      return (
                        <div
                          key={evt.eventId}
                          className={cn(
                            "text-xs",
                            // The events of the span the page is on. A shadow, because the list's dividers set the border colour.
                            selectedEventIds.has(evt.eventId) &&
                              "shadow-[inset_2px_0_0_var(--prism-cyan-500)]",
                          )}
                          data-temporal-event={evt.eventId}
                        >
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            data-history-row
                            onClick={() =>
                              setExpandedRawId(isExpanded ? null : evt.eventId)
                            }
                            onKeyDown={moveBetweenHistoryRows}
                            className="grid w-full grid-cols-[16px_48px_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring @max-lg:grid-cols-[16px_36px_minmax(0,1fr)_auto] @max-lg:gap-2"
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3.5 text-muted-foreground" />
                            )}
                            <span className="font-mono text-2xs text-muted-foreground">
                              #{evt.eventId}
                            </span>
                            <span className="flex min-w-0 items-baseline gap-2">
                              {/* The detail gives way first: the event type is cut only when it alone does not fit. */}
                              <span
                                className="max-w-full shrink-0 truncate font-mono font-medium text-foreground"
                                title={evt.eventType}
                              >
                                {evt.eventType}
                              </span>
                              {eventDetails.get(evt.eventId) ? (
                                <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
                                  {eventDetails.get(evt.eventId)}
                                </span>
                              ) : null}
                            </span>
                            <span
                              className="text-right font-mono text-2xs tabular-nums text-muted-foreground @max-lg:hidden"
                              title={
                                gap
                                  ? `${formatDuration(gap.ms)} after event #${gap.afterEventId}`
                                  : undefined
                              }
                            >
                              {gap ? `gap ${formatDuration(gap.ms)}` : ""}
                            </span>
                            <span
                              className="text-right font-mono text-2xs tabular-nums text-muted-foreground"
                              title="Time since the run started"
                            >
                              +{formatDuration(evt.offsetMs)}
                            </span>
                          </button>
                          {isExpanded ? (
                            <div className="border-t border-border/60 bg-muted/20 py-3 pr-4 pl-11">
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                                <TemporalTime iso={evt.eventTime} />
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="text-muted-foreground"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(
                                      window.location.href,
                                    );
                                    toast.success(
                                      `Copied a link to event ${evt.eventId}`,
                                    );
                                  }}
                                >
                                  <Link2 />
                                  Copy Link
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="text-muted-foreground"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(
                                      safeJsonPretty(evt.attributes),
                                    );
                                    toast.success(
                                      `Copied the attributes of event ${evt.eventId}`,
                                    );
                                  }}
                                >
                                  <Copy />
                                  Copy JSON
                                </Button>
                                {canReset &&
                                evt.eventType === "WorkflowTaskCompleted" ? (
                                  <Button
                                    variant="outline"
                                    size="xs"
                                    onClick={() => {
                                      rememberDialogOpener();
                                      setResetEventId(evt.eventId);
                                    }}
                                  >
                                    <History />
                                    Reset to Here
                                  </Button>
                                ) : null}
                              </div>
                              <pre className="max-h-80 overflow-auto font-mono text-xs text-foreground">
                                {safeJsonPretty(evt.attributes)}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <aside className="flex min-h-0 min-w-0 flex-col border-t border-border bg-card @max-4xl:min-h-80 @max-4xl:shrink-0 @4xl:border-t-0 @4xl:border-l">
              <div
                role="tablist"
                aria-label="Execution inspector"
                className="flex border-b border-border text-xs"
              >
                {inspectorTabs.map((tab, index) => {
                  const isActive = inspectorTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`temporal-inspector-tab-${tab.id}`}
                      aria-controls="temporal-inspector-panel"
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setInspectorTab(tab.id)}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") {
                          return;
                        }
                        e.preventDefault();
                        const step = e.key === "ArrowRight" ? 1 : -1;
                        const next =
                          inspectorTabs[
                            (index + step + inspectorTabs.length) %
                              inspectorTabs.length
                          ]!;
                        setInspectorTab(next.id);
                        document
                          .getElementById(`temporal-inspector-tab-${next.id}`)
                          ?.focus();
                      }}
                      className={cn(
                        "-mb-px h-10 flex-1 whitespace-nowrap border-b-2 px-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        isActive
                          ? "border-foreground font-medium text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div
                role="tabpanel"
                id="temporal-inspector-panel"
                aria-labelledby={`temporal-inspector-tab-${inspectorTab}`}
                className="min-h-0 flex-1 overflow-y-auto p-4"
              >
                {imported && inspectorTab !== "meta" ? (
                  <p className="text-xs text-muted-foreground">
                    This run comes from a history file. Queries, Signals and
                    related runs need the server it ran on. The Input &amp;
                    Result tab shows what the file holds.
                  </p>
                ) : inspectorTab === "interact" ? (
                  <TemporalInteractPanel
                    isRunning={isRunning}
                    namespace={namespace}
                    runId={execution.runId}
                    spans={spans}
                    workflowId={workflowId}
                    workflowType={execution.workflowType}
                  />
                ) : inspectorTab === "pending" ? (
                  pendingActivities.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No pending activities.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {pendingActivities.map((pa) => {
                        const matchingSpan = spans.find(
                          (span) =>
                            span.kind === "activity" &&
                            span.activityId === pa.activityId &&
                            span.closedEventId === undefined,
                        );
                        return (
                          <TemporalPendingActivityCard
                            key={pa.activityId}
                            canAct={canAct}
                            isPendingAction={activityOperation.isPending}
                            onActivityOperation={runActivityOperation}
                            pending={pa}
                            policy={matchingSpan?.activityPolicy}
                            scheduledTimestamp={matchingSpan?.timestamp}
                            supportsActivityOperations={
                              capabilities?.supportsActivityOperations === true
                            }
                          />
                        );
                      })}
                    </div>
                  )
                ) : inspectorTab === "related" ? (
                  <TemporalRelatedPanel
                    execution={execution}
                    hasMoreRuns={hasMoreRuns}
                    isLoadingRuns={runsQuery.isLoading}
                    onOpenExecution={onOpenExecution}
                    runCount={runCount}
                    runs={runsOfId}
                    spans={spans}
                    workflowIdUrl={createUrl({
                      temporalNsParam: namespace,
                      temporalSectionParam: "workflow",
                      temporalWfParam: workflowId,
                      viewParam: "temporal",
                    })}
                  />
                ) : inspectorTab === "stack" ? (
                  <StackPanel
                    namespace={namespace}
                    runId={execution.runId}
                    workflowId={workflowId}
                  />
                ) : (
                  <div className="flex flex-col gap-4">
                    {data.details ? (
                      <MetaBlock label="Details">{data.details}</MetaBlock>
                    ) : null}
                    <PayloadBlock
                      emptyText="This run was started with no input."
                      label="Workflow Input"
                      name="the Workflow input"
                      viewClassName={META_VIEW_CLASS}
                      value={data.input}
                    />
                    {data.result !== undefined ? (
                      <PayloadBlock
                        emptyText=""
                        label="Workflow Result"
                        name="the Workflow result"
                        viewClassName={META_VIEW_CLASS}
                        value={data.result}
                      />
                    ) : null}
                    {data.failure ? (
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <TemporalSectionLabel>Failure</TemporalSectionLabel>
                        <TemporalFailurePanel failure={data.failure} />
                      </div>
                    ) : null}
                    {Object.keys(execution.memo).length > 0 ? (
                      <PayloadBlock
                        emptyText=""
                        label="Memo"
                        name="the memo"
                        viewClassName={META_VIEW_CLASS}
                        value={execution.memo}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      <TemporalConfirmDialog
        confirmLabel="Terminate Execution"
        defaultReason="Terminated via Prisma Studio"
        description={`This stops ${workflowId} immediately, without running cleanup logic.`}
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
        onOpenChange={(open) => {
          setTerminateConfirmOpen(open);

          if (!open) {
            restoreFocusAfterDialog();
          }
        }}
        open={terminateConfirmOpen}
        reasonLabel="Termination reason"
        showReasonInput
        title="Terminate workflow execution?"
      />

      <TemporalConfirmDialog
        confirmLabel="Reset Execution"
        defaultReason="Reset via Prisma Studio"
        description={`This starts a new run of ${workflowId} from the history up to event ${resetEventId ?? ""}, and terminates this run if it is still open. Activities after that event run again.`}
        isPending={resetWorkflow.isPending}
        onConfirm={async (reason) => {
          if (!execution || resetEventId === null) return;

          try {
            const result = await resetWorkflow.mutateAsync({
              eventId: resetEventId,
              reason,
              runId: execution.runId,
              workflowId,
            });
            toast.success(`Reset ${workflowId}. Opened the new run.`);
            onOpenExecution(workflowId, result.runId);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          }
        }}
        onOpenChange={(open) => {
          if (open) {
            return;
          }

          setResetEventId(null);
          restoreFocusAfterDialog();
        }}
        open={resetEventId !== null}
        reasonLabel="Reset reason"
        showReasonInput
        title="Reset workflow execution?"
        variant="default"
      />

      <TemporalConfirmDialog
        confirmLabel="Request Cancel"
        description={`This asks ${workflowId} to cancel. The Workflow decides what happens next: it can run its cleanup code first, and it can ignore the request.`}
        isPending={cancelWorkflow.isPending}
        onConfirm={async () => {
          if (!execution) return;

          try {
            await cancelWorkflow.mutateAsync({
              runId: execution.runId,
              workflowId,
            });
            toast.success(`Cancel requested for ${workflowId}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          }
        }}
        onOpenChange={(open) => {
          setCancelConfirmOpen(open);

          if (!open) {
            restoreFocusAfterDialog();
          }
        }}
        open={cancelConfirmOpen}
        title="Request cancellation of this run?"
        variant="default"
      />

      <TemporalConfirmDialog
        confirmLabel="Reset Activity"
        description={`This drops the attempts Activity ${resetActivityId ?? ""} has made, starts them from one again and runs it now, without waiting for the next retry.`}
        isPending={activityOperation.isPending}
        onConfirm={async () => {
          if (resetActivityId !== null) {
            await sendActivityOperation(resetActivityId, "reset");
          }
        }}
        onOpenChange={(open) => {
          if (open) {
            return;
          }

          setResetActivityId(null);
          restoreFocusAfterDialog();
        }}
        open={resetActivityId !== null}
        title="Reset this Activity?"
        variant="default"
      />
    </div>
  );
}

/**
 * One short fact per raw event that tells it apart from others of its type:
 * the Activity, Workflow, Signal or Timer it belongs to, or the failure message.
 */
function describeRawEvents(
  events: TemporalExecutionDetail["rawEvents"],
): Map<number, string> {
  const names = new Map<number, string>();
  const details = new Map<number, string>();
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : undefined;
  const nameOf = (value: unknown) =>
    value && typeof value === "object"
      ? text((value as { name?: unknown }).name)
      : undefined;

  for (const event of events) {
    const attributes = event.attributes ?? {};
    const ownName =
      nameOf(attributes.activityType) ??
      nameOf(attributes.workflowType) ??
      text(attributes.signalName) ??
      text(attributes.markerName) ??
      (text(attributes.timerId)
        ? `Timer ${String(attributes.timerId)}`
        : undefined);
    const name =
      ownName ??
      [
        attributes.scheduledEventId,
        attributes.initiatedEventId,
        attributes.startedEventId,
      ]
        .map((id) => (typeof id === "number" ? names.get(id) : undefined))
        .find(Boolean);
    const failure = attributes.failure as { message?: unknown } | undefined;
    const detail = [name, text(failure?.message)].filter(Boolean).join(" · ");

    if (name) {
      names.set(event.eventId, name);
    }

    if (detail) {
      details.set(event.eventId, detail);
    }
  }

  return details;
}

function StackPanel(props: {
  namespace: string;
  runId: string;
  workflowId: string;
}) {
  const stack = useTemporalWorkflowStack(props);
  const stackError =
    stack.error instanceof Error
      ? stack.error.message
      : String(stack.error ?? "");

  return (
    <div className="flex flex-col gap-3 text-xs" data-testid="temporal-stack">
      <div className="flex items-center justify-between gap-2">
        <TemporalSectionLabel>Call Stack</TemporalSectionLabel>
        <Button
          variant="outline"
          size="xs"
          disabled={stack.isFetching}
          onClick={() => void stack.refetch()}
        >
          <RefreshCw
            className={cn(stack.isFetching && "motion-safe:animate-spin")}
          />
          Refresh
        </Button>
      </div>
      {stack.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : stack.isError ? (
        /not enabled/i.test(stackError) ? (
          <p className="text-muted-foreground">
            The Worker that answered does not record call stacks. The TypeScript
            SDK records them on Node.js only, so a Worker on Bun cannot answer
            this.
          </p>
        ) : (
          <p className="text-muted-foreground">
            No Worker answered the call stack Query:{" "}
            <span className="text-foreground">{stackError}</span>
          </p>
        )
      ) : stack.data ? (
        <pre className="overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
          {stack.data}
        </pre>
      ) : (
        <p className="text-muted-foreground">
          The Workflow is not waiting on anything.
        </p>
      )}
    </div>
  );
}

function MetaBlock(props: {
  children: React.ReactNode;
  label: string;
  tone?: "danger";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <TemporalSectionLabel>{props.label}</TemporalSectionLabel>
      <p
        className={cn(
          "max-h-44 overflow-auto whitespace-pre-wrap rounded-md border px-3 py-2.5 text-xs leading-5 text-foreground",
          props.tone === "danger"
            ? "border-destructive/30 bg-destructive/10"
            : "border-border bg-background",
        )}
      >
        {props.children}
      </p>
    </div>
  );
}

const META_VIEW_CLASS = "max-h-72";

const SPAN_VIEW_CLASS = "max-h-56 bg-card";

/** A payload as JSON with a button that copies it, or a sentence when there is none. */
function PayloadBlock(props: {
  emptyText: string;
  label: React.ReactNode;
  /** What the copy button names, such as "the Workflow input". */
  name: string;
  value: unknown;
  viewClassName: string;
}) {
  const { emptyText, label, name, value, viewClassName } = props;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <TemporalSectionLabel>{label}</TemporalSectionLabel>
          {typeof value === "object" && value !== null ? (
            <span className="shrink-0 text-2xs text-muted-foreground">
              {payloadSizeText(value as Record<string, unknown>)}
            </span>
          ) : null}
        </div>
        {value === undefined ? null : (
          <TemporalCopyButton
            label={`Copy ${name}`}
            toastText={`Copied ${name}`}
            value={safeJsonPretty(value)}
          />
        )}
      </div>
      {value === undefined ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <TemporalPayloadView className={viewClassName} value={value} />
      )}
    </div>
  );
}

function GroupedSpanRow(props: {
  canAct: boolean;
  isExpanded: boolean;
  isPendingAction: boolean;
  onActivityOperation: (
    activityId: string,
    operation: TemporalActivityOperation,
  ) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onShowInDiagram?: (nodeId: string) => void;
  onToggle: () => void;
  pendingActivity?: TemporalPendingActivity;
  span: TemporalGroupedSpan;
  supportsActivityOperations: boolean;
  typeMap?: TemporalTypeMapResponse | null;
}) {
  const {
    canAct,
    span,
    isExpanded,
    isPendingAction,
    onActivityOperation,
    onKeyDown,
    onShowInDiagram,
    onToggle,
    pendingActivity,
    supportsActivityOperations,
    typeMap,
  } = props;
  const isTimer = span.kind === "timer";
  const isOpenTimer = isTimer && span.status === "running";
  // An open Timer counts down, so its row reads the time again every second.
  const now = useNow(1_000, isOpenTimer);
  const timer = isTimer ? timerProgress(span, now) : null;
  const eventRange =
    span.closedEventId && span.closedEventId !== span.startedEventId
      ? `#${span.startedEventId}–${span.closedEventId}`
      : `#${span.startedEventId}`;
  const status = TEMPORAL_SPAN_STATUS[span.status];

  return (
    <div
      className={cn(
        "text-xs",
        isExpanded && "shadow-[inset_2px_0_0_var(--prism-cyan-500)]",
      )}
      data-temporal-span={span.id}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        data-history-row
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={cn(
          // A narrow page drops the event numbers and sizes the status and the duration by their text.
          "grid w-full grid-cols-[16px_64px_minmax(0,1fr)_104px_84px] items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring @max-lg:grid-cols-[16px_minmax(0,1fr)_auto_auto] @max-lg:gap-2",
          isExpanded && "bg-muted/40",
        )}
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
        <span className="font-mono text-2xs text-muted-foreground @max-lg:hidden">
          {eventRange}
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          {/* The summaries give way first: the name is cut only when it alone does not fit. */}
          <span
            className="max-w-full shrink-0 truncate font-mono font-medium text-foreground"
            title={span.label}
          >
            {span.label}
          </span>
          {span.userSummary ? (
            <span className="min-w-0 truncate text-foreground">
              {span.userSummary}
            </span>
          ) : null}
          {isOpenTimer && timer ? (
            <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
              {timer.leftMs > 0
                ? `fires in ${formatTimeLeft(timer.leftMs)}`
                : "due now"}
            </span>
          ) : span.summary ? (
            <span
              className="min-w-0 truncate font-mono text-2xs text-muted-foreground"
              title={span.summary}
            >
              {span.summary}
            </span>
          ) : null}
        </span>
        <TemporalStatusBadge
          className="justify-self-start"
          icon={status.icon}
          tone={status.tone}
        >
          {status.label}
        </TemporalStatusBadge>
        <span className="text-right font-mono tabular-nums text-muted-foreground">
          {isOpenTimer && timer
            ? `${formatTimeLeft(timer.leftMs)} left`
            : formatDuration(span.durationMs)}
        </span>
      </button>

      {isExpanded && isTimer ? (
        <TemporalTimerDetail
          map={typeMap}
          onShowInDiagram={onShowInDiagram}
          span={span}
        />
      ) : isExpanded ? (
        <div className="flex flex-col gap-4 border-t border-border/60 bg-muted/20 py-3 pr-4 pl-11">
          {pendingActivity ? (
            <TemporalPendingActivityCard
              canAct={canAct}
              isPendingAction={isPendingAction}
              onActivityOperation={onActivityOperation}
              pending={pendingActivity}
              policy={span.activityPolicy}
              scheduledTimestamp={span.timestamp}
              supportsActivityOperations={supportsActivityOperations}
            />
          ) : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PayloadBlock
              emptyText="No input."
              label={`Input${
                span.queueWaitMs != null
                  ? ` · queue wait ${formatDuration(span.queueWaitMs)}`
                  : ""
              }`}
              name={`the input of ${span.label}`}
              viewClassName={SPAN_VIEW_CLASS}
              value={span.input}
            />
            {span.error ? (
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-h-6 items-center">
                  <TemporalSectionLabel>Failure</TemporalSectionLabel>
                </div>
                <TemporalFailurePanel
                  attempt={span.kind === "activity" ? span.attempt : undefined}
                  failure={span.error}
                />
              </div>
            ) : (
              <PayloadBlock
                emptyText={
                  span.status === "running" || span.status === "retrying"
                    ? "No output so far."
                    : "No output."
                }
                label="Output"
                name={`the output of ${span.label}`}
                viewClassName={SPAN_VIEW_CLASS}
                value={span.output}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
