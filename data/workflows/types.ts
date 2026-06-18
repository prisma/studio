export type WorkflowNodeKind =
  | "approval"
  | "condition"
  | "parallel"
  | "state"
  | "step"
  | "timer"
  | "trigger"
  | (string & {});

export type WorkflowRunStatus =
  | "cancelled"
  | "completed"
  | "failed"
  | "paused"
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "waiting_for_timer"
  | (string & {});

export type WorkflowStepStatus =
  | "completed"
  | "failed"
  | "queued"
  | "running"
  | "skipped"
  | (string & {});

export type WorkflowApprovalStatus =
  | "approved"
  | "expired"
  | "pending"
  | "rejected"
  | (string & {});

export type WorkflowOverlayNodeStatus =
  | "failed"
  | "not_started"
  | "running"
  | "skipped"
  | "succeeded"
  | "waiting"
  | (string & {});

export type WorkflowReplayMode = "fork" | "recorded" | "reexecute" | "resume";

export interface WorkflowStudioProviderCapabilities {
  approve?: boolean;
  reject?: boolean;
  replay?: boolean;
  replayModes?: readonly WorkflowReplayMode[];
  runWorker?: boolean;
}

export interface WorkflowStudioProviderOptions {
  signal?: AbortSignal;
}

export interface WorkflowStudioRunInspectOptions extends WorkflowStudioProviderOptions {
  include?: readonly string[];
}

export interface WorkflowStudioApprovalDecision {
  reason?: string;
  decision?: unknown;
}

export interface WorkflowStudioReplayInput {
  mode?: WorkflowReplayMode;
}

export interface WorkflowStudioActionResult {
  ok: boolean;
  message?: string;
  value?: unknown;
}

export interface WorkflowStudioProvider {
  readonly capabilities?: WorkflowStudioProviderCapabilities;
  readonly staticModel?: unknown;
  getSnapshot(
    options?: WorkflowStudioProviderOptions,
  ): Promise<WorkflowStudioModel>;
  inspectRun?(
    runId: string,
    options?: WorkflowStudioRunInspectOptions,
  ): Promise<WorkflowStudioRunDetail>;
  approve?(
    approvalId: string,
    input?: WorkflowStudioApprovalDecision,
    options?: WorkflowStudioProviderOptions,
  ): Promise<WorkflowStudioActionResult>;
  reject?(
    approvalId: string,
    input?: WorkflowStudioApprovalDecision,
    options?: WorkflowStudioProviderOptions,
  ): Promise<WorkflowStudioActionResult>;
  replay?(
    runId: string,
    input?: WorkflowStudioReplayInput,
    options?: WorkflowStudioProviderOptions,
  ): Promise<WorkflowStudioActionResult>;
  runWorker?(
    options?: WorkflowStudioProviderOptions,
  ): Promise<WorkflowStudioActionResult>;
}

export interface WorkflowStudioModel {
  readonly kind: "prisma-workflow-studio-model";
  readonly version: 1;
  readonly runtime?: WorkflowStudioRuntimeMetadata;
  readonly workflows: readonly WorkflowStudioWorkflow[];
  readonly warnings: readonly WorkflowStudioModelWarning[];
}

export interface WorkflowStudioRuntimeMetadata {
  readonly datasets: readonly string[];
  readonly endpoints: Partial<Record<WorkflowStudioEndpointName, string>>;
}

export type WorkflowStudioEndpointName =
  | "approve"
  | "inspectRun"
  | "reject"
  | "replay"
  | "snapshot"
  | "worker";

export interface WorkflowStudioModelWarning {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface WorkflowStudioWorkflow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly latestVersion: number;
  readonly runsToday: number;
  readonly failureRate: number;
  readonly canvas: WorkflowCanvas;
  readonly runs: readonly WorkflowRun[];
  readonly approvals: readonly WorkflowApproval[];
  readonly ingestEvents: readonly WorkflowIngestEvent[];
  readonly deadLetters: readonly WorkflowDeadLetter[];
  readonly overlays: readonly WorkflowExecutionOverlay[];
  readonly timelineFrames: readonly WorkflowTimelineFrame[];
}

export interface WorkflowCanvas {
  readonly nodes: readonly WorkflowCanvasNode[];
  readonly edges: readonly WorkflowCanvasEdge[];
}

export interface WorkflowCanvasNode {
  readonly id: string;
  readonly kind: WorkflowNodeKind;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly sourceRef?: string;
  readonly codeRef?: string;
  readonly config?: Record<string, unknown>;
  readonly status?: string;
}

export interface WorkflowCanvasEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export interface WorkflowRun {
  readonly id: string;
  readonly workflowId: string;
  readonly versionId?: string;
  readonly status: WorkflowRunStatus;
  readonly currentNode?: string;
  readonly steps?: readonly WorkflowRunStep[];
  readonly input?: unknown;
  readonly output?: unknown;
  readonly state: Record<string, unknown>;
  readonly error?: unknown;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface WorkflowRunStep {
  readonly id: string;
  readonly nodeId: string;
  readonly name?: string;
  readonly attempt?: number;
  readonly status: WorkflowStepStatus | string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly error?: unknown;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface WorkflowApproval {
  readonly id: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly approvalName: string;
  readonly status: WorkflowApprovalStatus;
  readonly requestedAt?: string;
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
  readonly decision?: unknown;
  readonly reason?: string;
  readonly assignees: readonly string[];
  readonly expiresAt?: string;
  readonly payload?: unknown;
}

export interface WorkflowIngestEvent {
  readonly id: string;
  readonly source: string;
  readonly connectorAccountId?: string;
  readonly externalId: string;
  readonly eventType: string;
  readonly dedupeKey: string;
  readonly occurredAt?: string;
  readonly receivedAt?: string;
  readonly headers?: Record<string, string>;
  readonly rawPayload?: unknown;
  readonly normalizedPayload?: unknown;
  readonly signatureVerified: boolean;
  readonly status: string;
  readonly error?: string;
}

export interface WorkflowDeadLetter {
  readonly id: string;
  readonly kind: "event" | "run" | "step" | (string & {});
  readonly resourceId: string;
  readonly reason: string;
  readonly payload?: unknown;
  readonly createdAt?: string;
  readonly resolvedAt?: string;
}

export interface WorkflowExecutionOverlayNode {
  readonly status: WorkflowOverlayNodeStatus;
  readonly attempt?: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly error?: unknown;
  readonly inputRef?: string;
  readonly outputRef?: string;
  readonly stateDiff?: unknown;
}

export interface WorkflowExecutionOverlay {
  readonly runId: string;
  readonly sequence: number;
  readonly nodes: Record<string, WorkflowExecutionOverlayNode>;
}

export interface WorkflowTimelineFrame {
  readonly sequence: number;
  readonly eventType: string;
  readonly nodeId?: string;
  readonly createdAt?: string;
  readonly overlay: WorkflowExecutionOverlay;
  readonly state?: Record<string, unknown>;
  readonly stateDiff?: unknown;
}

export interface WorkflowStudioRunDetail {
  readonly run: WorkflowRun;
  readonly raw: unknown;
}

export class WorkflowStudioProviderError extends Error {
  readonly status: number | undefined;
  readonly payload: unknown;

  constructor(
    message: string,
    options: { payload?: unknown; status?: number },
  ) {
    super(message);
    this.name = "WorkflowStudioProviderError";
    this.status = options.status;
    this.payload = options.payload;
  }
}
