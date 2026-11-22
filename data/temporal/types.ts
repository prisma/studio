export type TemporalServerKind = "slate-temporal-next" | "temporal";

export interface TemporalCapabilities {
  address: string;
  clusterName: string;
  persistenceStore: string;
  serverKind: TemporalServerKind;
  serverVersion: string;
  shardCount: number;
  supportsAdminApi: boolean;
  supportsCountGroupByStatus: boolean;
  supportsDescribeTaskQueue: boolean;
  supportsNativeBatch: boolean;
  supportsReset: boolean;
  supportsSchedules: boolean;
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
  | "ContinuedAsNew"
  | "TimedOut"
  | "Unspecified";

export interface TemporalFailureInfo {
  cause?: TemporalFailureInfo;
  message: string;
  source?: string;
  stackTrace?: string;
  type?: string;
}

export interface TemporalPendingActivity {
  activityId: string;
  activityType: string;
  attempt: number;
  heartbeatDetails?: unknown;
  lastAttemptCompleteTime?: string;
  lastFailure?: TemporalFailureInfo;
  lastHeartbeatTime?: string;
  lastStartedTime?: string;
  lastWorkerIdentity?: string;
  maximumAttempts: number;
  nextAttemptScheduleTime?: string;
  scheduledTime?: string;
  state: "Scheduled" | "Started" | "CancelRequested" | "Unspecified";
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

export interface TemporalListWorkflowsResponse {
  countsByStatus: Partial<Record<TemporalWorkflowStatus, number>>;
  executions: TemporalWorkflowExecution[];
  nextPageToken?: string;
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
  timestamp: string;
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
  execution: TemporalWorkflowExecution;
  failure?: TemporalFailureInfo;
  input?: unknown;
  rawEvents: TemporalHistoryEvent[];
  rawHistoryJson: { events: unknown[] };
  result?: unknown;
  spans: TemporalGroupedSpan[];
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

export type TemporalSection = "workflows" | "schedules" | "queues" | "cluster";

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
}

export interface TemporalTaskQueueSummary {
  activeWorkflowCount: number;
  failedWorkflowCount: number;
  health: "healthy" | "retrying" | "stalled" | "backlogged" | "idle";
  lastActivityTime?: string;
  name: string;
  pendingBacklogCount: number;
  pollers: TemporalTaskQueuePoller[];
  retryingWorkflowCount: number;
  scheduleCount: number;
  totalWorkflowCount: number;
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
  matcherOldestReadyMs?: number;
  queues: TemporalTaskQueueSummary[];
  source: "describe-task-queue" | "synthesized";
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
  historyEventsPerS: number;
  homeEntries: number;
  hot: boolean;
  id: number;
  l0Ssts: number;
  lifecycle: string;
  of: number;
  placementVersion: number;
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
    reasons: string[];
    state: string;
  };
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
