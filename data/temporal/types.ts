export type TemporalServerKind = "slate-temporal-next" | "temporal";

export interface TemporalCapabilities {
  address: string;
  clusterName: string;
  /** The Codec Server the BFF decodes payloads with, when one is set. */
  codec: { configured: boolean; endpoint?: string };
  persistenceStore: string;
  serverKind: TemporalServerKind;
  serverVersion: string;
  /**
   * The order a list without a sort comes in. `slate-temporal-next` lists by
   * Workflow Id; a standard Temporal server lists open runs first, newest first.
   */
  /**
   * The order of a list without a sort. `newest-first` is by start time.
   * `open-first` is the standard visibility order: running executions first,
   * then closed ones by close time, newest first.
   */
  nativeListOrder: "newest-first" | "open-first" | "workflow-id";
  shardCount: number;
  /** PauseActivity, UnpauseActivity and ResetActivity. */
  supportsActivityOperations: boolean;
  supportsAdminApi: boolean;
  supportsCountGroupByStatus: boolean;
  supportsDescribeTaskQueue: boolean;
  supportsNativeBatch: boolean;
  supportsReset: boolean;
  supportsSchedules: boolean;
  supportsWorkflowPause: boolean;
}

export interface TemporalNamespace {
  description?: string;
  id: string;
  name: string;
  retentionDays?: number;
  state: string;
}

export type TemporalWorkflowStatus =
  | "Running"
  | "Completed"
  | "Failed"
  | "Canceled"
  | "Terminated"
  | "Paused"
  | "ContinuedAsNew"
  | "TimedOut"
  | "Unspecified";

export interface TemporalFailureInfo {
  cause?: TemporalFailureInfo;
  /** What the code attached to an application failure. */
  details?: unknown;
  /** True when the code marked the failure as one that must not be retried. */
  isNonRetryable?: boolean;
  message: string;
  /**
   * Why the server retries or does not retry, without the `RETRY_STATE_`
   * prefix: `NON_RETRYABLE_FAILURE`, `MAXIMUM_ATTEMPTS_REACHED`, `TIMEOUT`.
   */
  retryState?: string;
  source?: string;
  stackTrace?: string;
  /** For a timeout: `START_TO_CLOSE`, `SCHEDULE_TO_START`, `HEARTBEAT`. */
  timeoutType?: string;
  type?: string;
}

export interface TemporalActivityPolicy {
  backoffCoefficient?: number;
  heartbeatTimeoutMs?: number;
  initialIntervalMs?: number;
  maximumAttempts?: number;
  maximumIntervalMs?: number;
  scheduleToCloseTimeoutMs?: number;
  scheduleToStartTimeoutMs?: number;
  startToCloseTimeoutMs?: number;
}

export interface TemporalPendingActivity {
  activityId: string;
  activityType: string;
  attempt: number;
  expirationTime?: string;
  heartbeatDetails?: unknown;
  lastAttemptCompleteTime?: string;
  lastFailure?: TemporalFailureInfo;
  lastHeartbeatTime?: string;
  lastStartedTime?: string;
  lastWorkerIdentity?: string;
  maximumAttempts: number;
  nextAttemptScheduleTime?: string;
  paused?: boolean;
  scheduledTime?: string;
  state: "Scheduled" | "Started" | "CancelRequested" | "Unspecified";
  taskQueue?: string;
}

export interface TemporalPendingChildWorkflow {
  initiatedId: string;
  parentClosePolicy?: string;
  runId: string;
  workflowId: string;
  workflowType: string;
}

export interface TemporalWorkflowExecution {
  closeTime?: string;
  durationMs: number;
  executionTime?: string;
  firstRunId?: string;
  historyLength: number;
  historySizeBytes: number;
  memo: Record<string, unknown>;
  namespace: string;
  parentRunId?: string;
  parentWorkflowId?: string;
  pendingActivities?: TemporalPendingActivity[];
  pendingChildren?: TemporalPendingChildWorkflow[];
  rootRunId?: string;
  rootWorkflowId?: string;
  runId: string;
  searchAttributes: Record<string, unknown>;
  startTime: string;
  status: TemporalWorkflowStatus;
  taskQueue: string;
  workflowId: string;
  workflowType: string;
}

export type TemporalWorkflowSortField =
  | "CloseTime"
  | "Duration"
  | "ExecutionStatus"
  | "HistoryLength"
  | "StartTime"
  | "TaskQueue"
  | "WorkflowId"
  | "WorkflowType";

export interface TemporalWorkflowSort {
  direction: "asc" | "desc";
  field: TemporalWorkflowSortField;
}

export interface TemporalListWorkflowsResponse {
  countsByStatus: Partial<Record<TemporalWorkflowStatus, number>>;
  executions: TemporalWorkflowExecution[];
  nextPageToken?: string;
  /** Set when a sort was asked for and the rows come in the server's order instead. */
  sortSkippedReason?: string;
  /** Set when the rows are a page of a sorted copy of every matching run. */
  sorted?: { ageMs: number; rowCount: number };
  totalCount: number;
}

export type TemporalSpanKind =
  | "workflow"
  | "workflow-task"
  | "activity"
  | "timer"
  | "child-workflow"
  | "signal"
  | "update";

export type TemporalSpanStatus =
  | "running"
  | "completed"
  | "failed"
  | "retrying"
  | "canceled"
  | "timed-out"
  | "fired";

export interface TemporalGroupedSpan {
  activityId?: string;
  activityPolicy?: TemporalActivityPolicy;
  attempt?: number;
  childRunId?: string;
  childWorkflowId?: string;
  closedEventId?: number;
  durationMs: number;
  error?: TemporalFailureInfo;
  eventIds: number[];
  id: string;
  input?: unknown;
  kind: TemporalSpanKind;
  label: string;
  nextAttemptScheduleTime?: string;
  output?: unknown;
  queueWaitMs?: number;
  startedEventId: number;
  startOffsetMs: number;
  status: TemporalSpanStatus;
  summary?: string;
  taskQueue?: string;
  /** For a Timer: how long the Workflow asked it to wait. */
  timerMs?: number;
  timestamp: string;
  /** The summary the Workflow code gave this Activity, Timer or Child Workflow. */
  userSummary?: string;
}

/** The runs before and after this one in its Workflow Execution Chain. */
export interface TemporalRunChain {
  firstRunId?: string;
  nextRunId?: string;
  previousRunId?: string;
}

export interface TemporalHistoryEvent {
  attributes: Record<string, unknown>;
  eventId: number;
  eventTime: string;
  eventType: string;
  offsetMs: number;
  taskId?: string;
}

export interface TemporalExecutionDetail {
  chain: TemporalRunChain;
  /** What the Codec Server did to this run's payloads. */
  codec?: { decoded: number; encoded: number; error?: string };
  /** The details text the starter gave the Workflow Execution (Markdown). */
  details?: string;
  execution: TemporalWorkflowExecution;
  failure?: TemporalFailureInfo;
  /** True when the BFF also fetched the tail of a truncated history via reverse history. */
  historyTailIncluded?: boolean;
  /** True when the run has more events than the BFF reads. */
  historyTruncated?: boolean;
  input?: unknown;
  rawEvents: TemporalHistoryEvent[];
  rawHistoryJson: { events: unknown[] };
  result?: unknown;
  spans: TemporalGroupedSpan[];
  /** The one-line summary the starter gave the Workflow Execution. */
  summary?: string;
  totalDurationMs: number;
}

export interface TemporalStartWorkflowInput {
  args: unknown[];
  idReusePolicy?:
    | "ALLOW_DUPLICATE"
    | "ALLOW_DUPLICATE_FAILED_ONLY"
    | "REJECT_DUPLICATE"
    | "TERMINATE_IF_RUNNING";
  memo?: Record<string, unknown>;
  signalArgs?: unknown[];
  signalName?: string;
  taskQueue: string;
  workflowExecutionTimeoutSeconds?: number;
  workflowId: string;
  workflowRunTimeoutSeconds?: number;
  workflowType: string;
}

export interface TemporalStartWorkflowResult {
  runId: string;
  workflowId: string;
}

export interface TemporalQueryResult {
  durationMs: number;
  rejected?: boolean;
  rejectedStatus?: string;
  result: unknown;
}

export interface TemporalUpdateResult {
  durationMs: number;
  outcome: "completed" | "rejected" | "accepted";
  result?: unknown;
  failure?: TemporalFailureInfo;
  updateId: string;
}

export type TemporalActivityOperation = "pause" | "reset" | "unpause";

export type TemporalBulkActionKind = "cancel" | "terminate" | "signal";

export interface TemporalBulkActionItem {
  runId?: string;
  workflowId: string;
}

export interface TemporalBulkActionRequest {
  action: TemporalBulkActionKind;
  items: TemporalBulkActionItem[];
  reason?: string;
  signalArgs?: unknown[];
  signalName?: string;
}

/** A bulk action the BFF runs in the background, with its progress. */
export interface TemporalBulkJob {
  action: TemporalBulkActionKind;
  done: number;
  /** The first failures, for the report. `failed` counts all of them. */
  errors: Array<{ error: string; workflowId: string }>;
  failed: number;
  finishedAt?: string;
  id: string;
  /** The List Filter the job ran on, when it ran on every match. */
  query?: string;
  startedAt: string;
  state: "aborted" | "completed" | "running";
  total: number;
}

export interface TemporalBulkJobRequest {
  action: TemporalBulkActionKind;
  /** The runs to act on. Leave out to act on every running run that matches `query`. */
  items?: TemporalBulkActionItem[];
  query?: string;
  reason?: string;
  signalArgs?: unknown[];
  signalName?: string;
}

export interface TemporalBulkActionItemResult {
  error?: string;
  ok: boolean;
  runId?: string;
  workflowId: string;
}

export interface TemporalBulkActionResponse {
  action: TemporalBulkActionKind;
  failed: number;
  results: TemporalBulkActionItemResult[];
  succeeded: number;
}

export type TemporalFollowMode = "paused" | "live" | "tail";

/**
 * The Temporal screen a URL belongs to. A run page keeps the section it was
 * opened from, so the left menu does not move when a run opens. `recent` is a
 * run opened from the menu's Recent Runs.
 */
export type TemporalSection =
  | "attention"
  | "cluster"
  | "queues"
  | "recent"
  | "schedules"
  | "types"
  | "workers"
  | "workflow"
  | "workflows";

/** One Worker process, as the Task Queues it polls report it. */
export interface TemporalWorker {
  identity: string;
  lastAccessTime?: string;
  taskQueues: Array<{ name: string; type: "activity" | "workflow" }>;
}

export interface TemporalWorkerDeployment {
  createTime?: string;
  currentVersion?: string;
  name: string;
  rampingPercentage?: number;
  rampingVersion?: string;
}

export interface TemporalNexusEndpoint {
  createdTime?: string;
  description?: string;
  id: string;
  name: string;
  /** `namespace/task-queue` of a Worker target, or the URL of an external one. */
  target: string;
}

/**
 * Workers, Worker Deployments and Nexus Endpoints. Each list is null when the
 * server does not offer it.
 */
export interface TemporalWorkersResponse {
  deployments: TemporalWorkerDeployment[] | null;
  nexusEndpoints: TemporalNexusEndpoint[] | null;
  workers: TemporalWorker[] | null;
}

/** The Workflow Types and Task Queues in use, for suggestions in forms and filters. */
export interface TemporalFacets {
  /** False when the namespace holds more runs than the BFF reads. */
  complete: boolean;
  /** The custom Search Attributes registered for the namespace. */
  searchAttributes: Array<{ name: string; type: string }>;
  taskQueues: Array<{ count: number; name: string }>;
  workflowTypes: Array<{
    count: number;
    latestRun: { runId: string; workflowId: string };
    name: string;
  }>;
}

export type TemporalAttentionKind =
  | "activity-retrying"
  | "failed"
  | "long-running"
  | "no-worker"
  | "workflow-task-failing";

export interface TemporalAttentionItem {
  activityId?: string;
  activityPaused?: boolean;
  activityType?: string;
  attempt?: number;
  /** One sentence that says what is wrong. */
  detail: string;
  kind: TemporalAttentionKind;
  maximumAttempts?: number;
  nextAttemptTime?: string;
  runId: string;
  /** When the problem began. */
  since?: string;
  startTime: string;
  status: TemporalWorkflowStatus;
  taskQueue: string;
  workflowId: string;
  workflowType: string;
}

export interface TemporalAttentionResponse {
  ageMs: number;
  /** Running Workflow Executions the BFF looked at, and how many there are. */
  checkedRunning: number;
  items: TemporalAttentionItem[];
  totalRunning: number;
}

export type TemporalScheduleOverlapPolicy =
  | "SKIP"
  | "BUFFER_ONE"
  | "BUFFER_ALL"
  | "CANCEL_OTHER"
  | "TERMINATE_OTHER"
  | "ALLOW_ALL";

export interface TemporalScheduleRecentAction {
  actualTime?: string;
  runId?: string;
  scheduleTime?: string;
  workflowId?: string;
}

export interface TemporalScheduleSummary {
  actionCount: number;
  cadenceSummary: string;
  cronExpression?: string;
  intervalSeconds?: number;
  lastAction?: TemporalScheduleRecentAction;
  missedCatchupWindow: number;
  nextActionTimes: string[];
  notes?: string;
  overlapPolicy: TemporalScheduleOverlapPolicy;
  overlapSkipped: number;
  paused: boolean;
  recentActions: TemporalScheduleRecentAction[];
  remainingActions?: number;
  runningWorkflows: Array<{ runId: string; workflowId: string }>;
  scheduleId: string;
  taskQueue: string;
  /** The IANA time zone the cron expression is read in. Absent means UTC. */
  timezone?: string;
  workflowArgs?: unknown;
  workflowIdPrefix?: string;
  workflowType: string;
}

export interface TemporalListSchedulesResponse {
  nextPageToken?: string;
  schedules: TemporalScheduleSummary[];
}

export interface TemporalScheduleDetail extends TemporalScheduleSummary {
  catchupWindowSeconds?: number;
  jitterSeconds?: number;
  matchingTimes: string[];
  memo?: Record<string, unknown>;
}

export interface TemporalCreateScheduleInput {
  args?: unknown[];
  catchupWindowSeconds?: number;
  cronExpression?: string;
  intervalSeconds?: number;
  jitterSeconds?: number;
  notes?: string;
  overlapPolicy?: TemporalScheduleOverlapPolicy;
  paused?: boolean;
  scheduleId: string;
  taskQueue: string;
  timezone?: string;
  workflowIdPrefix?: string;
  workflowType: string;
}

export interface TemporalPatchScheduleInput {
  action: "pause" | "unpause" | "trigger" | "backfill";
  backfillEndTime?: string;
  backfillStartTime?: string;
  note?: string;
  overlapPolicy?: TemporalScheduleOverlapPolicy;
}

export type TemporalBulkScheduleActionKind =
  "pause" | "unpause" | "trigger" | "delete";

export interface TemporalBulkScheduleRequest {
  action: TemporalBulkScheduleActionKind;
  note?: string;
  scheduleIds: string[];
}

export interface TemporalBulkScheduleResponse {
  action: TemporalBulkScheduleActionKind;
  failed: number;
  results: Array<{ error?: string; ok: boolean; scheduleId: string }>;
  succeeded: number;
}

export interface TemporalTaskQueuePoller {
  buildId?: string;
  identity: string;
  lastAccessTime?: string;
  ratePerSecond?: number;
  taskQueueType: "activity" | "workflow";
}

export interface TemporalTaskQueueSample {
  activeWorkflowCount: number;
  at: number;
  pendingActivityCount: number;
  retryingWorkflowCount: number;
}

export interface TemporalTaskQueueSummary {
  activeWorkflowCount: number;
  /** The Activity Types that Workflows schedule on this queue. */
  activityTypes: string[];
  /** Null when the namespace is too large to count its closed runs. */
  failedWorkflowCount: number | null;
  health: "healthy" | "retrying" | "stalled" | "backlogged" | "idle";
  /** Rolling 5-minute samples captured by the BFF. */
  history?: TemporalTaskQueueSample[];
  lastActivityTime?: string;
  name: string;
  /** Activities scheduled on this queue that have not finished. */
  pendingActivityCount: number;
  pendingBacklogCount: number;
  pollers: TemporalTaskQueuePoller[];
  retryingActivityCount: number;
  retryingWorkflowCount: number;
  scheduleCount: number;
  /** Null when the namespace is too large to count its closed runs. */
  totalWorkflowCount: number | null;
  /** The types of the counted runs: all runs, or the running ones. */
  workflowTypes: Array<{ count: number; name: string }>;
  /** The newest of the counted runs. */
  workflows: Array<{
    hasRetryingActivity: boolean;
    runId: string;
    startTime: string;
    status: TemporalWorkflowStatus;
    workflowId: string;
    workflowType: string;
  }>;
}

export interface TemporalTaskQueuesResponse {
  /** How old the copy of the runs is that the counts come from. */
  ageMs: number;
  /**
   * False when the namespace holds more runs than the BFF counts. The queues
   * are then counted from the running runs only.
   */
  complete: boolean;
  matcherOldestReadyHistory?: Array<{ at: number; ms: number }>;
  matcherOldestReadyMs?: number;
  /** False on a server that does not report which Workers poll a queue. */
  pollersSupported: boolean;
  queues: TemporalTaskQueueSummary[];
  /** False when even the running runs are more than the BFF counts. */
  runningComplete: boolean;
  source: "describe-task-queue" | "synthesized";
}

export interface TemporalRunRef {
  runId: string;
  workflowId: string;
}

/**
 * One box of a Workflow Type's diagram: the start, a step that runs of the type
 * take, or a status that runs close with.
 */
export interface TemporalTypeMapNode {
  /** Sampled runs in which this step failed or timed out. */
  failedRunCount: number;
  /** A few of those runs. */
  failedRuns: TemporalRunRef[];
  id: string;
  kind:
    "start" | "end" | Exclude<TemporalSpanKind, "workflow" | "workflow-task">;
  label: string;
  /** Half of the finished executions of this step took at most this long. */
  medianDurationMs?: number;
  /** Sampled runs in which this step needed more than one attempt. */
  retriedRunCount: number;
  /** Sampled runs that took this step, or closed with this status. */
  runCount: number;
  /** How often the step ran in all sampled runs together. */
  spanCount: number;
  /** The status a run closes with, for an `end` node. */
  status?: TemporalWorkflowStatus;
  /**
   * The text the Workflow code gave this Activity or Child Workflow most often
   * (the SDK's `summary` option). A Timer's summary is its `label`.
   */
  summary?: string;
  /** Sampled open runs that are at this step now. */
  waitingRunCount: number;
  /** A few of those runs. */
  waitingRuns: TemporalRunRef[];
}

/** Sampled runs went from the step `from` to the step `to`. */
export interface TemporalTypeMapEdge {
  from: string;
  id: string;
  runCount: number;
  to: string;
}

export interface TemporalTypeMap {
  /**
   * Steps that sampled runs started while another step was open: `starts`
   * began during `at`, as a Signal that arrives while a Timer runs. No arrow
   * joins the two, because neither ended before the other started.
   */
  during: Array<{ at: string; runCount: number; starts: string }>;
  edges: TemporalTypeMapEdge[];
  nodes: TemporalTypeMapNode[];
  /** How many runs the diagram is drawn from. */
  runCount: number;
  statusCounts: Partial<Record<TemporalWorkflowStatus, number>>;
  /** True when the type has too many distinct Timers and they are one step. */
  timersMerged: boolean;
}

export interface TemporalTypeMapVersion {
  buildId: string;
  map: TemporalTypeMap;
  runCount: number;
}

export interface TemporalTypeMapResponse extends TemporalTypeMap {
  ageMs: number;
  /** How many runs of the type the BFF chose the sample from. */
  candidateCount: number;
  /** False when the namespace is too large for the BFF to know every run of the type. */
  candidatesComplete: boolean;
  /** Sampled runs whose history is longer than the BFF reads. */
  truncatedRunCount: number;
  /** Per-Build-ID diagrams when the sampled runs span more than one Worker version. */
  versions?: TemporalTypeMapVersion[];
  workflowType: string;
}

/** A recent run of a Workflow Type with the arguments it was started with. */
export interface TemporalTypeInputRun extends TemporalRunRef {
  args: unknown[];
  /** True when a codec encoded the input and nothing decoded it. */
  isEncoded: boolean;
  startTime: string;
  status: TemporalWorkflowStatus;
  taskQueue: string;
}

export interface TemporalTypeInputsResponse {
  /** The newest runs of the type first. */
  runs: TemporalTypeInputRun[];
  /** The Task Queue that most known runs of the type are on. */
  taskQueue?: string;
}

/** A measurement the server gives as a cause of a health state that is not `ok`. */
export interface TemporalClusterHealthReason {
  /** The shard the measurement is of; absent for a measurement of the server. */
  shard?: number;
  signal: string;
  unit: string;
  value: number;
}

export interface TemporalClusterHistorySample {
  at: number;
  historyEventsPerS: number;
  l0Ssts: number;
  matcherOldestReadyMs: number;
  progressDelayMs: number;
  runsClosedPerS: number;
  runsOpenedPerS: number;
  unflushedBytes: number;
}

export interface TemporalClusterShard {
  admissionMode: {
    batch: string;
    existing: string;
    new: string;
  };
  backlog: boolean;
  closedBy?: string | null;
  committerBusy: number;
  compactionState: string;
  durableSeq: number;
  effectLagMs: number;
  generation: number;
  health: string;
  healthReasons: TemporalClusterHealthReason[];
  historyEventsPerS: number;
  homeEntries: number;
  hot: boolean;
  id: number;
  l0Ssts: number;
  lifecycle: string;
  of: number;
  placementVersion: number;
  /** Rolling 5-minute progress lag samples (ms) for this shard. */
  progressDelayHistory?: number[];
  progressDelayMs: number;
  rateLimitPerS?: number | null;
  retentionLagS: number;
  runsClosedPerS: number;
  runsOpenedPerS: number;
  storageBytes: number;
  timerLagMs: number;
  unflushedBytes: number;
  walPutsPerS: number;
}

export interface TemporalClusterOverview {
  admissionAvailable: boolean;
  cell?: Record<string, unknown> | null;
  dims: Array<{
    capacity: number | null;
    headroom10s?: number;
    name: string;
    unit: string;
    usage: number;
  }>;
  headroom: {
    binding: string;
    overall10s?: number;
    overall60s?: number;
  };
  health: {
    reasons: TemporalClusterHealthReason[];
    state: string;
    /** The server's own names for the kind of trouble, such as `hot_server`. */
    tags: string[];
  };
  /** Rolling 5-minute samples captured by the BFF across polls. */
  history?: TemporalClusterHistorySample[];
  info: {
    authMode: string;
    listen: string;
    namespaces: number;
    phase: string;
    placementVersion: number;
    projects: number;
    revision: string;
    schemaVersion: number;
    shardCount: number;
    slatedbRev: string;
    storeKind: string;
    temporalApiRelease: string;
    tlsEnabled: boolean;
    uptimeSeconds: number;
    version: string;
  };
  memory: {
    budgetBytes: number | null;
    projectedBytes: number | null;
    rssBytes: number | null;
  };
  placement?: Record<string, unknown> | null;
  readyz: {
    phase: string;
    ready: boolean;
    subsystems: Record<string, string>;
  };
  shards: TemporalClusterShard[];
  storageActiveBytes: number;
  window: string;
  workerHint: {
    matcherOldestReadyMs: number;
  };
}

export interface TemporalClusterTracesResponse {
  capacity: number;
  dropped: number;
  droppedEvents: number;
  sample: unknown;
  traces: Array<Record<string, unknown>>;
}

export interface TemporalAdmissionUpdateInput {
  class: "wait" | "existing" | "new" | "batch";
  mode: "limit" | "closed";
  ratePerS?: number;
  scope?: string;
  ttlS: number;
}
