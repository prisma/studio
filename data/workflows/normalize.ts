import {
  type WorkflowApproval,
  type WorkflowCanvas,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
  type WorkflowDeadLetter,
  type WorkflowExecutionOverlay,
  type WorkflowExecutionOverlayNode,
  type WorkflowIngestEvent,
  type WorkflowRun,
  type WorkflowRunStep,
  type WorkflowStudioEndpointName,
  type WorkflowStudioModel,
  type WorkflowStudioModelWarning,
  WorkflowStudioProviderError,
  type WorkflowStudioRunDetail,
  type WorkflowStudioRuntimeMetadata,
  type WorkflowStudioWorkflow,
  type WorkflowTimelineFrame,
} from "./types";

const WORKFLOW_STUDIO_KIND = "prisma-workflow-studio-model";
const WORKFLOW_STUDIO_VERSION = 1;

const endpointNames: readonly WorkflowStudioEndpointName[] = [
  "approve",
  "inspectRun",
  "reject",
  "replay",
  "snapshot",
  "worker",
];

export function normalizeWorkflowStudioModel(
  input: unknown,
): WorkflowStudioModel {
  const warnings: WorkflowStudioModelWarning[] = [];
  const root = requiredRecord(input, "$");
  const kind = stringValue(root.kind);
  const version = numberValue(root.version);

  if (kind !== WORKFLOW_STUDIO_KIND) {
    throw new WorkflowStudioProviderError(
      "Unsupported Workflow Studio model kind.",
      { payload: input },
    );
  }

  if (version !== WORKFLOW_STUDIO_VERSION) {
    throw new WorkflowStudioProviderError(
      "Unsupported Workflow Studio model version.",
      { payload: input },
    );
  }

  const runtime = normalizeRuntimeMetadata(root.runtime, warnings, "$.runtime");
  const workflows = arrayValue(root.workflows)
    .map((workflow, index) =>
      normalizeWorkflow(workflow, warnings, `$.workflows[${index}]`),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    kind: WORKFLOW_STUDIO_KIND,
    runtime,
    version: WORKFLOW_STUDIO_VERSION,
    warnings,
    workflows,
  };
}

export function normalizeWorkflowRunDetail(
  input: unknown,
): WorkflowStudioRunDetail {
  const root = requiredRecord(input, "$");
  const rawRun = root.run ?? input;
  const warnings: WorkflowStudioModelWarning[] = [];

  return {
    raw: input,
    run: normalizeRun(rawRun, warnings, "$.run"),
  };
}

export function parseWorkflowDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  return undefined;
}

export function workflowDateMs(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function normalizeRuntimeMetadata(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowStudioRuntimeMetadata | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  const record = optionalRecord(input, warnings, path);

  if (!record) {
    return undefined;
  }

  const endpoints: Partial<Record<WorkflowStudioEndpointName, string>> = {};
  const endpointRecord = optionalRecord(
    record.endpoints,
    warnings,
    `${path}.endpoints`,
  );

  if (endpointRecord) {
    for (const endpointName of endpointNames) {
      const endpoint = stringValue(endpointRecord[endpointName]);

      if (endpoint !== undefined) {
        endpoints[endpointName] = endpoint;
      }
    }
  }

  return {
    datasets: stringArray(record.datasets),
    endpoints,
  };
}

function normalizeWorkflow(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowStudioWorkflow {
  const record = optionalRecord(input, warnings, path) ?? {};
  const id = requiredString(record.id, warnings, `${path}.id`, "workflow");
  const name = requiredString(record.name, warnings, `${path}.name`, id);
  const slug = requiredString(record.slug, warnings, `${path}.slug`, id);
  const latestVersion =
    positiveNumber(record.latestVersion) ?? positiveNumber(record.version) ?? 1;
  const canvas = normalizeCanvas(record.canvas, warnings, `${path}.canvas`);
  const runs = arrayValue(record.runs)
    .map((run, index) => normalizeRun(run, warnings, `${path}.runs[${index}]`))
    .sort((left, right) => compareDatesDesc(left.createdAt, right.createdAt));
  const approvals = arrayValue(record.approvals)
    .map((approval, index) =>
      normalizeApproval(approval, warnings, `${path}.approvals[${index}]`),
    )
    .sort((left, right) =>
      compareDatesDesc(left.requestedAt, right.requestedAt),
    );
  const ingestEvents = arrayValue(record.ingestEvents)
    .map((event, index) =>
      normalizeIngestEvent(event, warnings, `${path}.ingestEvents[${index}]`),
    )
    .sort((left, right) => compareDatesDesc(left.receivedAt, right.receivedAt));
  const deadLetters = arrayValue(record.deadLetters)
    .map((deadLetter, index) =>
      normalizeDeadLetter(
        deadLetter,
        warnings,
        `${path}.deadLetters[${index}]`,
      ),
    )
    .sort((left, right) => compareDatesDesc(left.createdAt, right.createdAt));
  const overlays = arrayValue(record.overlays).map((overlay, index) =>
    normalizeOverlay(overlay, warnings, `${path}.overlays[${index}]`),
  );
  const timelineFrames = arrayValue(record.timelineFrames)
    .map((frame, index) =>
      normalizeTimelineFrame(
        frame,
        warnings,
        `${path}.timelineFrames[${index}]`,
      ),
    )
    .sort((left, right) => left.sequence - right.sequence);

  return {
    approvals,
    canvas,
    deadLetters,
    failureRate: boundedRatio(record.failureRate),
    id,
    ingestEvents,
    latestVersion,
    name,
    overlays,
    runs,
    runsToday: nonNegativeInteger(record.runsToday),
    slug,
    timelineFrames,
  };
}

function normalizeCanvas(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowCanvas {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    edges: arrayValue(record.edges).map((edge, index) =>
      normalizeCanvasEdge(edge, warnings, `${path}.edges[${index}]`),
    ),
    nodes: arrayValue(record.nodes).map((node, index) =>
      normalizeCanvasNode(node, warnings, `${path}.nodes[${index}]`),
    ),
  };
}

function normalizeCanvasNode(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowCanvasNode {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    codeRef: stringValue(record.codeRef),
    config: plainRecord(record.config),
    id: requiredString(record.id, warnings, `${path}.id`, "node"),
    kind: requiredString(record.kind, warnings, `${path}.kind`, "step"),
    label: requiredString(record.label, warnings, `${path}.label`, "Untitled"),
    sourceRef: stringValue(record.sourceRef),
    status: stringValue(record.status),
    x: finiteNumber(record.x) ?? 0,
    y: finiteNumber(record.y) ?? 0,
  };
}

function normalizeCanvasEdge(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowCanvasEdge {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    from: requiredString(record.from, warnings, `${path}.from`, ""),
    id: requiredString(record.id, warnings, `${path}.id`, "edge"),
    label: stringValue(record.label),
    to: requiredString(record.to, warnings, `${path}.to`, ""),
  };
}

function normalizeRun(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowRun {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    completedAt: optionalDate(
      record.completedAt,
      warnings,
      `${path}.completedAt`,
    ),
    createdAt: optionalDate(record.createdAt, warnings, `${path}.createdAt`),
    currentNode: stringValue(record.currentNode),
    error: record.error,
    id: requiredString(record.id, warnings, `${path}.id`, "run"),
    input: record.input,
    output: record.output,
    startedAt: optionalDate(record.startedAt, warnings, `${path}.startedAt`),
    state: plainRecord(record.state) ?? {},
    status: requiredString(record.status, warnings, `${path}.status`, "queued"),
    steps: arrayValue(record.steps).map((step, index) =>
      normalizeRunStep(step, warnings, `${path}.steps[${index}]`),
    ),
    updatedAt: optionalDate(record.updatedAt, warnings, `${path}.updatedAt`),
    versionId: stringValue(record.versionId),
    workflowId: requiredString(
      record.workflowId,
      warnings,
      `${path}.workflowId`,
      "",
    ),
  };
}

function normalizeRunStep(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowRunStep {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    attempt: positiveNumber(record.attempt),
    completedAt: optionalDate(
      record.completedAt,
      warnings,
      `${path}.completedAt`,
    ),
    error: record.error,
    id: requiredString(record.id, warnings, `${path}.id`, "step"),
    input: record.input,
    name: stringValue(record.name),
    nodeId: requiredString(record.nodeId, warnings, `${path}.nodeId`, ""),
    output: record.output,
    startedAt: optionalDate(record.startedAt, warnings, `${path}.startedAt`),
    status: requiredString(record.status, warnings, `${path}.status`, "queued"),
  };
}

function normalizeApproval(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowApproval {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    approvalName: requiredString(
      record.approvalName,
      warnings,
      `${path}.approvalName`,
      "Approval",
    ),
    assignees: stringArray(record.assignees),
    decision: record.decision,
    expiresAt: optionalDate(record.expiresAt, warnings, `${path}.expiresAt`),
    id: requiredString(record.id, warnings, `${path}.id`, "approval"),
    nodeId: requiredString(record.nodeId, warnings, `${path}.nodeId`, ""),
    payload: record.payload,
    reason: stringValue(record.reason),
    requestedAt: optionalDate(
      record.requestedAt,
      warnings,
      `${path}.requestedAt`,
    ),
    resolvedAt: optionalDate(record.resolvedAt, warnings, `${path}.resolvedAt`),
    resolvedBy: stringValue(record.resolvedBy),
    runId: requiredString(record.runId, warnings, `${path}.runId`, ""),
    status: requiredString(
      record.status,
      warnings,
      `${path}.status`,
      "pending",
    ),
  };
}

function normalizeIngestEvent(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowIngestEvent {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    connectorAccountId: stringValue(record.connectorAccountId),
    dedupeKey: requiredString(
      record.dedupeKey,
      warnings,
      `${path}.dedupeKey`,
      "",
    ),
    error: stringValue(record.error),
    eventType: requiredString(
      record.eventType,
      warnings,
      `${path}.eventType`,
      "",
    ),
    externalId: requiredString(
      record.externalId,
      warnings,
      `${path}.externalId`,
      "",
    ),
    headers: stringRecord(record.headers),
    id: requiredString(record.id, warnings, `${path}.id`, "event"),
    normalizedPayload: record.normalizedPayload,
    occurredAt: optionalDate(record.occurredAt, warnings, `${path}.occurredAt`),
    rawPayload: record.rawPayload,
    receivedAt: optionalDate(record.receivedAt, warnings, `${path}.receivedAt`),
    signatureVerified: booleanValue(record.signatureVerified) ?? false,
    source: requiredString(record.source, warnings, `${path}.source`, ""),
    status: requiredString(
      record.status,
      warnings,
      `${path}.status`,
      "received",
    ),
  };
}

function normalizeDeadLetter(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowDeadLetter {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    createdAt: optionalDate(record.createdAt, warnings, `${path}.createdAt`),
    id: requiredString(record.id, warnings, `${path}.id`, "dead-letter"),
    kind: requiredString(record.kind, warnings, `${path}.kind`, "run"),
    payload: record.payload,
    reason: requiredString(record.reason, warnings, `${path}.reason`, ""),
    resolvedAt: optionalDate(record.resolvedAt, warnings, `${path}.resolvedAt`),
    resourceId: requiredString(
      record.resourceId,
      warnings,
      `${path}.resourceId`,
      "",
    ),
  };
}

function normalizeOverlay(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowExecutionOverlay {
  const record = optionalRecord(input, warnings, path) ?? {};
  const nodes: Record<string, WorkflowExecutionOverlayNode> = {};
  const nodeRecord = optionalRecord(record.nodes, warnings, `${path}.nodes`);

  if (nodeRecord) {
    for (const [nodeId, nodeValue] of Object.entries(nodeRecord)) {
      nodes[nodeId] = normalizeOverlayNode(
        nodeValue,
        warnings,
        `${path}.nodes.${nodeId}`,
      );
    }
  }

  return {
    nodes,
    runId: requiredString(record.runId, warnings, `${path}.runId`, ""),
    sequence: nonNegativeInteger(record.sequence),
  };
}

function normalizeOverlayNode(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowExecutionOverlayNode {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    attempt: positiveNumber(record.attempt),
    completedAt: optionalDate(
      record.completedAt,
      warnings,
      `${path}.completedAt`,
    ),
    durationMs: positiveNumber(record.durationMs),
    error: record.error,
    inputRef: stringValue(record.inputRef),
    outputRef: stringValue(record.outputRef),
    startedAt: optionalDate(record.startedAt, warnings, `${path}.startedAt`),
    stateDiff: record.stateDiff,
    status: requiredString(
      record.status,
      warnings,
      `${path}.status`,
      "not_started",
    ),
  };
}

function normalizeTimelineFrame(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): WorkflowTimelineFrame {
  const record = optionalRecord(input, warnings, path) ?? {};

  return {
    createdAt: optionalDate(record.createdAt, warnings, `${path}.createdAt`),
    eventType: requiredString(
      record.eventType,
      warnings,
      `${path}.eventType`,
      "EVENT",
    ),
    nodeId: stringValue(record.nodeId),
    overlay: normalizeOverlay(record.overlay, warnings, `${path}.overlay`),
    sequence: nonNegativeInteger(record.sequence),
    state: plainRecord(record.state),
    stateDiff: record.stateDiff,
  };
}

function requiredRecord(input: unknown, path: string): Record<string, unknown> {
  if (isRecord(input)) {
    return input;
  }

  throw new WorkflowStudioProviderError(
    `Workflow Studio payload at ${path} must be an object.`,
    { payload: input },
  );
}

function optionalRecord(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): Record<string, unknown> | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  if (isRecord(input)) {
    return input;
  }

  warnings.push({
    code: "invalid-object",
    message: "Expected an object.",
    path,
  });
  return undefined;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function plainRecord(input: unknown): Record<string, unknown> | undefined {
  return isRecord(input) ? input : undefined;
}

function stringRecord(input: unknown): Record<string, string> | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return result;
}

function requiredString(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
  fallback: string,
): string {
  const value = stringValue(input);

  if (value !== undefined) {
    return value;
  }

  warnings.push({
    code: "invalid-string",
    message: `Expected a string; using ${JSON.stringify(fallback)}.`,
    path,
  });
  return fallback;
}

function stringValue(input: unknown): string | undefined {
  return typeof input === "string" ? input : undefined;
}

function numberValue(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input)
    ? input
    : undefined;
}

function finiteNumber(input: unknown): number | undefined {
  return numberValue(input);
}

function positiveNumber(input: unknown): number | undefined {
  const value = numberValue(input);
  return value !== undefined && value > 0 ? value : undefined;
}

function nonNegativeInteger(input: unknown): number {
  const value = numberValue(input);
  return value !== undefined && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function boundedRatio(input: unknown): number {
  const value = numberValue(input);

  if (value === undefined) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function booleanValue(input: unknown): boolean | undefined {
  return typeof input === "boolean" ? input : undefined;
}

function arrayValue(input: unknown): readonly unknown[] {
  return Array.isArray(input) ? input : [];
}

function stringArray(input: unknown): readonly string[] {
  return arrayValue(input).filter((item) => typeof item === "string");
}

function optionalDate(
  input: unknown,
  warnings: WorkflowStudioModelWarning[],
  path: string,
): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  const value = parseWorkflowDate(input);

  if (value !== undefined) {
    return value;
  }

  warnings.push({
    code: "invalid-date",
    message: "Expected a Date, ISO date string, or epoch milliseconds.",
    path,
  });
  return undefined;
}

function compareDatesDesc(left: string | undefined, right: string | undefined) {
  return (workflowDateMs(right) ?? 0) - (workflowDateMs(left) ?? 0);
}
