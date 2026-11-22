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
