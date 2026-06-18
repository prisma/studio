import type { Sql } from "postgres";

import type {
  WorkflowApproval,
  WorkflowCanvas,
  WorkflowDeadLetter,
  WorkflowExecutionOverlay,
  WorkflowExecutionOverlayNode,
  WorkflowIngestEvent,
  WorkflowRun,
  WorkflowStudioModel,
  WorkflowTimelineFrame,
} from "../../data/workflows";
import {
  createStaticWorkflowStudioModel,
  DEMO_WORKFLOW_SCHEMA,
  DISPUTE_CONTEXT,
  DISPUTE_DRAFT_RESPONSE,
  DISPUTE_WORKFLOW_CANVAS,
  DISPUTE_WORKFLOW_GRAPH,
  DISPUTE_WORKFLOW_RUN_ID,
  WORKFLOW_STUDIO_RUNTIME,
} from "./workflow-demo-data";

type SerializedQueryRunner = <T>(runner: () => Promise<T>) => Promise<T>;

interface DemoWorkflowRequestOptions {
  postgresClient?: Sql | null;
  runSerializedQuery?: SerializedQueryRunner;
}

interface WorkflowDefinitionRow {
  id: string;
  name: string;
  slug: string;
}

interface WorkflowVersionRow {
  compiledGraph: unknown;
  id: string;
  version: number;
  visualGraph: unknown;
  workflowId: string;
}

interface WorkflowRunRow {
  completedAt: Date | null;
  createdAt: Date;
  currentNode: string | null;
  error: unknown;
  id: string;
  input: unknown;
  output: unknown;
  startedAt: Date | null;
  state: unknown;
  status: string;
  updatedAt: Date;
  versionId: string;
  workflowId: string;
}

interface WorkflowStepRunRow {
  attempt: number;
  completedAt: Date | null;
  error: unknown;
  id: string;
  input: unknown;
  nodeId: string;
  output: unknown;
  runId: string;
  startedAt: Date | null;
  status: string;
  stepName: string;
}

interface WorkflowTimelineRow {
  createdAt: Date;
  id: string;
  nodeId: string | null;
  payload: unknown;
  runId: string;
  sequence: number;
  type: string;
}

interface WorkflowSnapshotRow {
  createdAt: Date;
  diff: unknown;
  nodeId: string | null;
  runId: string;
  sequence: number;
  state: unknown;
}

interface WorkflowApprovalRow {
  approvalName: string;
  assignees: unknown;
  decision: unknown;
  expiresAt: Date | null;
  id: string;
  nodeId: string;
  payload: unknown;
  reason: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  runId: string;
  status: string;
}

interface WorkflowIngestEventRow {
  connectorAccountId: string | null;
  dedupeKey: string;
  error: string | null;
  eventType: string;
  externalId: string;
  headers: unknown;
  id: string;
  normalizedPayload: unknown;
  occurredAt: Date | null;
  rawPayload: unknown;
  receivedAt: Date;
  signatureVerified: boolean;
  source: string;
  status: string;
}

interface WorkflowDeadLetterRow {
  createdAt: Date;
  id: string;
  kind: string;
  payload: unknown;
  reason: string;
  resolvedAt: Date | null;
  resourceId: string;
}

interface WorkflowRows {
  approvals: readonly WorkflowApprovalRow[];
  deadLetters: readonly WorkflowDeadLetterRow[];
  definitions: readonly WorkflowDefinitionRow[];
  ingestEvents: readonly WorkflowIngestEventRow[];
  runs: readonly WorkflowRunRow[];
  snapshots: readonly WorkflowSnapshotRow[];
  steps: readonly WorkflowStepRunRow[];
  timeline: readonly WorkflowTimelineRow[];
  versions: readonly WorkflowVersionRow[];
}

let approvalStatus: "approved" | "pending" | "rejected" = "pending";
let replayCount = 0;
let workerRuns = 0;

export function getDemoWorkflowStudioSnapshot(): WorkflowStudioModel {
  return createStaticWorkflowStudioModel({
    approvalStatus,
    replayCount,
    workerRuns,
  });
}

export async function getDemoWorkflowStudioSnapshotFromDatabase(
  postgresClient: Sql,
): Promise<WorkflowStudioModel | null> {
  if (!(await hasSeededWorkflowTables(postgresClient))) {
    return null;
  }

  const rows = await loadWorkflowRows(postgresClient);

  if (rows.definitions.length === 0) {
    return {
      ...getDemoWorkflowStudioSnapshot(),
      warnings: [
        {
          code: "demo-workflow-seed-empty",
          message:
            "The Prisma Workflow tables exist, but the demo workflow seed rows were not found.",
          path: "$",
        },
      ],
    };
  }

  return buildStudioModelFromRows(rows);
}

export async function handleDemoWorkflowRequest(
  request: Request,
  basePath: string,
  options: DemoWorkflowRequestOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.slice(basePath.length).split("/").filter(Boolean);
  const [action, id] = route;

  if (request.method === "GET" && action === "studio") {
    const model = await withWorkflowDatabase(options, (postgresClient) =>
      getDemoWorkflowStudioSnapshotFromDatabase(postgresClient),
    );

    return Response.json(model ?? getDemoWorkflowStudioSnapshot());
  }

  if (request.method === "GET" && action === "inspect") {
    const model = await withWorkflowDatabase(options, (postgresClient) =>
      getDemoWorkflowStudioSnapshotFromDatabase(postgresClient),
    );
    const snapshot = model ?? getDemoWorkflowStudioSnapshot();
    const run = snapshot.workflows
      .flatMap((workflow) => workflow.runs)
      .find((candidate) => candidate.id === id);

    return run
      ? Response.json({ run })
      : Response.json({ error: "Workflow run not found" }, { status: 404 });
  }

  if (request.method === "POST" && action === "approve" && id) {
    const handled = await withWorkflowDatabase(options, (postgresClient) =>
      approveWorkflowRun(postgresClient, id),
    );

    if (handled) {
      return Response.json({
        message: "Approved dispute evidence response in the seeded PPg demo.",
        ok: true,
      });
    }

    approvalStatus = "approved";
    return Response.json({ ok: true });
  }

  if (request.method === "POST" && action === "reject" && id) {
    const handled = await withWorkflowDatabase(options, (postgresClient) =>
      rejectWorkflowRun(postgresClient, id),
    );

    if (handled) {
      return Response.json({
        message: "Rejected dispute evidence response in the seeded PPg demo.",
        ok: true,
      });
    }

    approvalStatus = "rejected";
    return Response.json({ ok: true });
  }

  if (request.method === "POST" && action === "replay" && id) {
    const handled = await withWorkflowDatabase(options, (postgresClient) =>
      replayWorkflowRun(postgresClient, id),
    );

    if (handled) {
      return Response.json({
        message: "Created a replay run from the seeded PPg workflow tables.",
        ok: true,
      });
    }

    replayCount += 1;
    approvalStatus = "pending";
    return Response.json({ ok: true });
  }

  if (request.method === "POST" && action === "run") {
    const handled = await withWorkflowDatabase(options, runWorkflowWorker);

    if (handled) {
      return Response.json({
        message:
          "Recorded a demo worker heartbeat in the Workflow lease table.",
        ok: true,
      });
    }

    workerRuns += 1;
    return Response.json({ ok: true });
  }

  return Response.json(
    { error: "Workflow demo route not found" },
    { status: 404 },
  );
}

async function withWorkflowDatabase<T>(
  options: DemoWorkflowRequestOptions,
  operation: (postgresClient: Sql) => Promise<T | null>,
): Promise<T | null> {
  const postgresClient = options.postgresClient;

  if (!postgresClient) {
    return null;
  }

  const run = () => operation(postgresClient);

  return options.runSerializedQuery
    ? await options.runSerializedQuery(run)
    : await run();
}

async function hasSeededWorkflowTables(postgresClient: Sql): Promise<boolean> {
  const rows = await postgresClient<readonly { exists: boolean }[]>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = ${DEMO_WORKFLOW_SCHEMA}
        and table_name = 'WorkflowDefinition'
    ) as "exists"
  `;

  return rows[0]?.exists === true;
}

async function loadWorkflowRows(postgresClient: Sql): Promise<WorkflowRows> {
  const definitions = await postgresClient<readonly WorkflowDefinitionRow[]>`
    select id, name, slug
    from "_prisma_workflows"."WorkflowDefinition"
    order by created_at
  `;
  const versions = await postgresClient<readonly WorkflowVersionRow[]>`
    select
      id,
      workflow_id as "workflowId",
      version,
      compiled_graph as "compiledGraph",
      visual_graph as "visualGraph"
    from "_prisma_workflows"."WorkflowVersion"
    order by created_at
  `;
  const ingestEvents = await postgresClient<readonly WorkflowIngestEventRow[]>`
    select
      id,
      source,
      connector_account_id as "connectorAccountId",
      external_id as "externalId",
      event_type as "eventType",
      dedupe_key as "dedupeKey",
      occurred_at as "occurredAt",
      received_at as "receivedAt",
      headers,
      raw_payload as "rawPayload",
      normalized_payload as "normalizedPayload",
      signature_verified as "signatureVerified",
      status,
      error
    from "_prisma_workflows"."WorkflowIngestEvent"
    order by received_at
  `;
  const runs = await postgresClient<readonly WorkflowRunRow[]>`
    select
      id,
      workflow_id as "workflowId",
      version_id as "versionId",
      status,
      current_step as "currentNode",
      input,
      output,
      state,
      error,
      started_at as "startedAt",
      completed_at as "completedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from "_prisma_workflows"."WorkflowRun"
    order by created_at
  `;
  const steps = await postgresClient<readonly WorkflowStepRunRow[]>`
    select
      id,
      run_id as "runId",
      node_id as "nodeId",
      step_name as "stepName",
      attempt,
      status,
      input,
      output,
      error,
      started_at as "startedAt",
      completed_at as "completedAt"
    from "_prisma_workflows"."WorkflowStepRun"
    order by created_at
  `;
  const timeline = await postgresClient<readonly WorkflowTimelineRow[]>`
    select
      id,
      run_id as "runId",
      sequence,
      type,
      node_id as "nodeId",
      payload,
      created_at as "createdAt"
    from "_prisma_workflows"."WorkflowTimelineEvent"
    order by run_id, sequence
  `;
  const snapshots = await postgresClient<readonly WorkflowSnapshotRow[]>`
    select
      run_id as "runId",
      sequence,
      node_id as "nodeId",
      state,
      diff,
      created_at as "createdAt"
    from "_prisma_workflows"."WorkflowStateSnapshot"
    order by run_id, sequence
  `;
  const approvals = await postgresClient<readonly WorkflowApprovalRow[]>`
    select
      id,
      run_id as "runId",
      node_id as "nodeId",
      approval_name as "approvalName",
      status,
      requested_at as "requestedAt",
      resolved_at as "resolvedAt",
      resolved_by as "resolvedBy",
      decision,
      reason,
      assignees,
      expires_at as "expiresAt",
      payload
    from "_prisma_workflows"."WorkflowApproval"
    order by requested_at
  `;
  const deadLetters = await postgresClient<readonly WorkflowDeadLetterRow[]>`
    select
      id,
      kind,
      resource_id as "resourceId",
      reason,
      payload,
      created_at as "createdAt",
      resolved_at as "resolvedAt"
    from "_prisma_workflows"."WorkflowDeadLetter"
    order by created_at
  `;

  return {
    approvals,
    deadLetters,
    definitions,
    ingestEvents,
    runs,
    snapshots,
    steps,
    timeline,
    versions,
  };
}

function buildStudioModelFromRows(rows: WorkflowRows): WorkflowStudioModel {
  const workflows = rows.definitions.map((definition) => {
    const versions = rows.versions.filter(
      (version) => version.workflowId === definition.id,
    );
    const latestVersion = versions.reduce(
      (latest, version) => Math.max(latest, version.version),
      1,
    );
    const version = versions.find(
      (candidate) => candidate.version === latestVersion,
    );
    const canvas = canvasFromVersion(version) ?? DISPUTE_WORKFLOW_CANVAS;
    const runs = rows.runs
      .filter((run) => run.workflowId === definition.id)
      .map((run) =>
        mapRun(
          run,
          rows.steps.filter((step) => step.runId === run.id),
        ),
      );
    const runIds = new Set(runs.map((run) => run.id));
    const failedRuns = runs.filter((run) => run.status === "failed").length;

    return {
      approvals: rows.approvals
        .filter((approval) => runIds.has(approval.runId))
        .map(mapApproval),
      canvas,
      deadLetters: rows.deadLetters.map(mapDeadLetter),
      failureRate: runs.length === 0 ? 0 : failedRuns / runs.length,
      id: definition.id,
      ingestEvents: rows.ingestEvents.map(mapIngestEvent),
      latestVersion,
      name: definition.name,
      overlays: runs.map((run) => buildOverlay(rows, canvas, run.id)),
      runs,
      runsToday: runs.filter((run) => isToday(run.createdAt)).length,
      slug: definition.slug,
      timelineFrames: runs.flatMap((run) =>
        buildTimelineFrames(rows, canvas, run.id),
      ),
    };
  });

  return {
    kind: "prisma-workflow-studio-model",
    runtime: WORKFLOW_STUDIO_RUNTIME,
    version: 1,
    warnings: [],
    workflows,
  };
}

function canvasFromVersion(
  version: WorkflowVersionRow | undefined,
): WorkflowCanvas | undefined {
  if (isWorkflowCanvas(version?.visualGraph)) {
    return version.visualGraph;
  }

  if (isWorkflowCanvas(DISPUTE_WORKFLOW_GRAPH.canvas)) {
    return DISPUTE_WORKFLOW_GRAPH.canvas;
  }

  return undefined;
}

function mapRun(
  row: WorkflowRunRow,
  steps: readonly WorkflowStepRunRow[],
): WorkflowRun {
  return {
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt),
    currentNode: row.currentNode ?? undefined,
    error: row.error ?? undefined,
    id: row.id,
    input: row.input,
    output: row.output ?? undefined,
    startedAt: iso(row.startedAt),
    state: recordFromUnknown(row.state),
    status: row.status,
    steps: steps.map(mapStepRun),
    updatedAt: iso(row.updatedAt),
    versionId: row.versionId,
    workflowId: row.workflowId,
  };
}

function mapStepRun(row: WorkflowStepRunRow) {
  return {
    attempt: row.attempt,
    completedAt: iso(row.completedAt),
    error: row.error ?? undefined,
    id: row.id,
    input: row.input ?? undefined,
    name: row.stepName,
    nodeId: row.nodeId,
    output: row.output ?? undefined,
    startedAt: iso(row.startedAt),
    status: row.status,
  };
}

function mapApproval(row: WorkflowApprovalRow): WorkflowApproval {
  return {
    approvalName: row.approvalName,
    assignees: stringArray(row.assignees),
    decision: row.decision ?? undefined,
    expiresAt: iso(row.expiresAt),
    id: row.id,
    nodeId: row.nodeId,
    payload: row.payload ?? undefined,
    reason: row.reason ?? undefined,
    requestedAt: iso(row.requestedAt),
    resolvedAt: iso(row.resolvedAt),
    resolvedBy: row.resolvedBy ?? undefined,
    runId: row.runId,
    status: row.status,
  };
}

function mapIngestEvent(row: WorkflowIngestEventRow): WorkflowIngestEvent {
  return {
    connectorAccountId: row.connectorAccountId ?? undefined,
    dedupeKey: row.dedupeKey,
    error: row.error ?? undefined,
    eventType: row.eventType,
    externalId: row.externalId,
    headers: stringRecord(row.headers),
    id: row.id,
    normalizedPayload: row.normalizedPayload ?? undefined,
    occurredAt: iso(row.occurredAt),
    rawPayload: row.rawPayload,
    receivedAt: iso(row.receivedAt),
    signatureVerified: row.signatureVerified,
    source: row.source,
    status: row.status,
  };
}

function mapDeadLetter(row: WorkflowDeadLetterRow): WorkflowDeadLetter {
  return {
    createdAt: iso(row.createdAt),
    id: row.id,
    kind: row.kind,
    payload: row.payload ?? undefined,
    reason: row.reason,
    resolvedAt: iso(row.resolvedAt),
    resourceId: row.resourceId,
  };
}

function buildTimelineFrames(
  rows: WorkflowRows,
  canvas: WorkflowCanvas,
  runId: string,
): WorkflowTimelineFrame[] {
  return rows.timeline
    .filter((event) => event.runId === runId)
    .map((event) => {
      const snapshot = latestSnapshotAt(rows.snapshots, runId, event.sequence);

      return {
        createdAt: iso(event.createdAt),
        eventType: event.type,
        nodeId: event.nodeId ?? undefined,
        overlay: buildOverlay(rows, canvas, runId, event.sequence),
        sequence: event.sequence,
        state: snapshot ? recordFromUnknown(snapshot.state) : undefined,
        stateDiff: snapshot?.diff,
      };
    });
}

function buildOverlay(
  rows: WorkflowRows,
  canvas: WorkflowCanvas,
  runId: string,
  sequence?: number,
): WorkflowExecutionOverlay {
  const events = rows.timeline.filter(
    (event) =>
      event.runId === runId &&
      (sequence === undefined || event.sequence <= sequence),
  );
  const latestSequence = events.at(-1)?.sequence ?? 0;
  const nodes: Record<string, WorkflowExecutionOverlayNode> = {};

  for (const node of canvas.nodes) {
    nodes[node.id] = { status: "not_started" };
  }

  if (events.some((event) => event.type === "RUN_STARTED")) {
    nodes["trigger:stripeDisputeCreated"] = { status: "succeeded" };
    nodes["state:DisputeCaseState"] = { status: "succeeded" };
  }

  for (const step of rows.steps.filter(
    (candidate) => candidate.runId === runId,
  )) {
    if (!hasNodeEvent(events, step.nodeId)) {
      continue;
    }

    nodes[step.nodeId] = {
      attempt: step.attempt,
      completedAt: iso(step.completedAt),
      durationMs: durationMs(step.startedAt, step.completedAt),
      error: step.error ?? undefined,
      inputRef: `${step.id}:input`,
      outputRef: step.output == null ? undefined : `${step.id}:output`,
      startedAt: iso(step.startedAt),
      status: overlayStatusFromStep(step.status),
    };
  }

  for (const approval of rows.approvals.filter(
    (candidate) => candidate.runId === runId,
  )) {
    if (!hasNodeEvent(events, approval.nodeId)) {
      continue;
    }

    nodes[approval.nodeId] = {
      completedAt: iso(approval.resolvedAt),
      startedAt: iso(approval.requestedAt),
      status: overlayStatusFromApproval(approval.status),
    };
  }

  const run = rows.runs.find((candidate) => candidate.id === runId);

  if (
    sequence === undefined &&
    run?.currentNode &&
    nodes[run.currentNode]?.status === "not_started"
  ) {
    nodes[run.currentNode] = {
      status: run.status === "running" ? "running" : "waiting",
    };
  }

  return {
    nodes,
    runId,
    sequence: latestSequence,
  };
}

async function approveWorkflowRun(
  postgresClient: Sql,
  approvalId: string,
): Promise<boolean> {
  if (!(await hasSeededWorkflowTables(postgresClient))) {
    return false;
  }

  await postgresClient`
    update "_prisma_workflows"."WorkflowApproval"
    set
      status = 'approved',
      resolved_at = now(),
      resolved_by = 'finance.ops@demo.prisma.io',
      decision = ${postgresClient.json({ approved: true })},
      reason = 'Approved from the Studio Workflow demo.'
    where id = ${approvalId}
  `;

  await postgresClient`
    update "_prisma_workflows"."WorkflowRun"
    set
      status = 'completed',
      current_step = null,
      completed_at = now(),
      updated_at = now(),
      output = ${postgresClient.json({
        evidenceId: "ev_demo_123",
        slackMessageTs: "1718629123.000100",
      })},
      state = coalesce(state, '{}'::jsonb) || ${postgresClient.json({
        approvedBy: "finance.ops@demo.prisma.io",
        approvedResponse: DISPUTE_DRAFT_RESPONSE,
        evidenceId: "ev_demo_123",
        slackMessageTs: "1718629123.000100",
      })}::jsonb
    where id = (
      select run_id
      from "_prisma_workflows"."WorkflowApproval"
      where id = ${approvalId}
    )
  `;

  await insertApprovedWorkflowRows(postgresClient, approvalId);

  return true;
}

async function rejectWorkflowRun(
  postgresClient: Sql,
  approvalId: string,
): Promise<boolean> {
  if (!(await hasSeededWorkflowTables(postgresClient))) {
    return false;
  }

  await postgresClient`
    update "_prisma_workflows"."WorkflowApproval"
    set
      status = 'rejected',
      resolved_at = now(),
      resolved_by = 'finance.ops@demo.prisma.io',
      decision = ${postgresClient.json({ approved: false })},
      reason = 'Rejected from the Studio Workflow demo.'
    where id = ${approvalId}
  `;

  await postgresClient`
    update "_prisma_workflows"."WorkflowRun"
    set
      status = 'failed',
      current_step = null,
      error = ${postgresClient.json({
        code: "approval_rejected",
        message: "Finance Ops rejected the drafted evidence response.",
      })},
      completed_at = now(),
      updated_at = now()
    where id = (
      select run_id
      from "_prisma_workflows"."WorkflowApproval"
      where id = ${approvalId}
    )
  `;

  await postgresClient`
    insert into "_prisma_workflows"."WorkflowDeadLetter" (
      id,
      kind,
      resource_id,
      reason,
      payload,
      created_at
    )
    select
      'deadletter_' || run_id,
      'run',
      run_id,
      'Finance Ops rejected the drafted evidence response.',
      ${postgresClient.json({ approvalId })},
      now()
    from "_prisma_workflows"."WorkflowApproval"
    where id = ${approvalId}
    on conflict (id) do update set
      reason = excluded.reason,
      payload = excluded.payload,
      created_at = excluded.created_at
  `;

  return true;
}

async function replayWorkflowRun(
  postgresClient: Sql,
  runId: string,
): Promise<boolean> {
  if (!(await hasSeededWorkflowTables(postgresClient))) {
    return false;
  }

  const countRows = await postgresClient<readonly { count: string }[]>`
    select count(*)::text as count
    from "_prisma_workflows"."WorkflowRun"
    where id like 'run_replay_%'
  `;
  const replayIndex = Number.parseInt(countRows[0]?.count ?? "0", 10) + 1;
  const replayRunId = `run_replay_${replayIndex}`;
  const replayApprovalId = `approval_replay_${replayIndex}`;

  await postgresClient`
    insert into "_prisma_workflows"."WorkflowRun" (
      id,
      workflow_id,
      version_id,
      ingest_event_id,
      status,
      current_step,
      input,
      state,
      started_at,
      created_at,
      updated_at
    )
    select
      ${replayRunId},
      workflow_id,
      version_id,
      ingest_event_id,
      'waiting_for_approval',
      'approval:humanApproval',
      input,
      state || ${postgresClient.json({ replayOf: runId })}::jsonb,
      now(),
      now(),
      now()
    from "_prisma_workflows"."WorkflowRun"
    where id = ${runId}
    on conflict (id) do nothing
  `;

  await postgresClient`
    insert into "_prisma_workflows"."WorkflowStepRun" (
      id,
      run_id,
      node_id,
      step_name,
      attempt,
      status,
      input,
      output,
      started_at,
      completed_at,
      created_at
    )
    select
      id || ${`_replay_${replayIndex}`},
      ${replayRunId},
      node_id,
      step_name,
      attempt,
      status,
      input,
      output,
      now() - interval '2 minutes',
      now() - interval '1 minute',
      now() - interval '2 minutes'
    from "_prisma_workflows"."WorkflowStepRun"
    where run_id = ${runId}
    on conflict (run_id, node_id, attempt) do nothing
  `;

  await postgresClient`
    insert into "_prisma_workflows"."WorkflowApproval" (
      id,
      run_id,
      node_id,
      approval_name,
      status,
      requested_at,
      assignees,
      expires_at,
      payload
    )
    values (
      ${replayApprovalId},
      ${replayRunId},
      'approval:humanApproval',
      'Finance approval',
      'pending',
      now(),
      ${postgresClient.json(["role:finance_ops"])},
      now() + interval '48 hours',
      ${postgresClient.json({
        amountCents: DISPUTE_CONTEXT.amount,
        draftResponse: DISPUTE_DRAFT_RESPONSE,
        replayOf: runId,
      })}
    )
    on conflict (id) do nothing
  `;

  await insertReplayTimelineRows(postgresClient, replayRunId);

  return true;
}

async function runWorkflowWorker(postgresClient: Sql): Promise<boolean> {
  if (!(await hasSeededWorkflowTables(postgresClient))) {
    return false;
  }

  await postgresClient`
    insert into "_prisma_workflows"."WorkflowLease" (
      id,
      resource_type,
      resource_id,
      worker_id,
      locked_until,
      heartbeat_at
    )
    values (
      'lease_demo_worker',
      'run',
      ${DISPUTE_WORKFLOW_RUN_ID},
      'studio-demo-worker',
      now() + interval '30 seconds',
      now()
    )
    on conflict (resource_type, resource_id) do update set
      worker_id = excluded.worker_id,
      locked_until = excluded.locked_until,
      heartbeat_at = excluded.heartbeat_at
  `;

  return true;
}

async function insertApprovedWorkflowRows(
  transaction: Sql,
  approvalId: string,
): Promise<void> {
  await transaction`
    insert into "_prisma_workflows"."WorkflowStepRun" (
      id,
      run_id,
      node_id,
      step_name,
      attempt,
      status,
      input,
      output,
      started_at,
      completed_at,
      created_at
    )
    select
      'step_run_submit_evidence_001',
      run_id,
      'step:submitEvidence',
      'submitEvidence',
      1,
      'completed',
      ${transaction.json({ disputeId: DISPUTE_CONTEXT.disputeId })},
      ${transaction.json({ evidenceId: "ev_demo_123" })},
      now() - interval '2 minutes',
      now() - interval '90 seconds',
      now() - interval '2 minutes'
    from "_prisma_workflows"."WorkflowApproval"
    where id = ${approvalId}
    on conflict (run_id, node_id, attempt) do update set
      status = excluded.status,
      output = excluded.output,
      completed_at = excluded.completed_at
  `;

  await transaction`
    insert into "_prisma_workflows"."WorkflowStepRun" (
      id,
      run_id,
      node_id,
      step_name,
      attempt,
      status,
      input,
      output,
      started_at,
      completed_at,
      created_at
    )
    select
      'step_run_post_summary_001',
      run_id,
      'step:postSummary',
      'postSummary',
      1,
      'completed',
      ${transaction.json({ evidenceId: "ev_demo_123" })},
      ${transaction.json({ channel: "#finance-ops", ts: "1718629123.000100" })},
      now() - interval '80 seconds',
      now() - interval '60 seconds',
      now() - interval '80 seconds'
    from "_prisma_workflows"."WorkflowApproval"
    where id = ${approvalId}
    on conflict (run_id, node_id, attempt) do update set
      status = excluded.status,
      output = excluded.output,
      completed_at = excluded.completed_at
  `;

  await transaction`
    insert into "_prisma_workflows"."WorkflowStepRun" (
      id,
      run_id,
      node_id,
      step_name,
      attempt,
      status,
      input,
      output,
      started_at,
      completed_at,
      created_at
    )
    select
      'step_run_learn_001',
      run_id,
      'step:learnFromApproval',
      'learnFromApproval',
      1,
      'completed',
      ${transaction.json({ approvedResponse: DISPUTE_DRAFT_RESPONSE })},
      ${transaction.json({ examplesAdded: 1 })},
      now() - interval '55 seconds',
      now() - interval '30 seconds',
      now() - interval '55 seconds'
    from "_prisma_workflows"."WorkflowApproval"
    where id = ${approvalId}
    on conflict (run_id, node_id, attempt) do update set
      status = excluded.status,
      output = excluded.output,
      completed_at = excluded.completed_at
  `;

  await transaction`
    insert into "_prisma_workflows"."WorkflowTimelineEvent" (
      id,
      run_id,
      sequence,
      type,
      node_id,
      payload,
      created_at
    )
    select
      event.id,
      approval.run_id,
      event.sequence,
      event.type,
      event.node_id,
      event.payload,
      now()
    from "_prisma_workflows"."WorkflowApproval" approval
    cross join (
      values
        (
          'timeline_dispute_005',
          5,
          'APPROVAL_APPROVED',
          'approval:humanApproval',
          ${transaction.json({ approvedBy: "finance.ops@demo.prisma.io" })}
        ),
        (
          'timeline_dispute_006',
          6,
          'STEP_COMPLETED',
          'step:submitEvidence',
          ${transaction.json({ evidenceId: "ev_demo_123" })}
        ),
        (
          'timeline_dispute_007',
          7,
          'STEP_COMPLETED',
          'step:postSummary',
          ${transaction.json({ channel: "#finance-ops" })}
        ),
        (
          'timeline_dispute_008',
          8,
          'STEP_COMPLETED',
          'step:learnFromApproval',
          ${transaction.json({ examplesAdded: 1 })}
        )
    ) as event(id, sequence, type, node_id, payload)
    where approval.id = ${approvalId}
    on conflict (run_id, sequence) do update set
      type = excluded.type,
      node_id = excluded.node_id,
      payload = excluded.payload,
      created_at = excluded.created_at
  `;

  await transaction`
    update dispute_cases
    set
      approved_response = ${DISPUTE_DRAFT_RESPONSE},
      evidence_id = 'ev_demo_123',
      status = 'submitted',
      updated_at = now()
    where stripe_dispute_id = ${DISPUTE_CONTEXT.disputeId}
  `;

  await transaction`
    insert into approved_dispute_responses (
      id,
      dispute_reason,
      amount_cents,
      response,
      confidence,
      approved_by,
      created_at
    )
    values (
      'approved_response_demo_001',
      ${DISPUTE_CONTEXT.reason},
      ${DISPUTE_CONTEXT.amount},
      ${DISPUTE_DRAFT_RESPONSE},
      0.91,
      'finance.ops@demo.prisma.io',
      now()
    )
    on conflict (id) do update set
      response = excluded.response,
      confidence = excluded.confidence,
      approved_by = excluded.approved_by,
      created_at = excluded.created_at
  `;
}

async function insertReplayTimelineRows(
  transaction: Sql,
  replayRunId: string,
): Promise<void> {
  await transaction`
    insert into "_prisma_workflows"."WorkflowTimelineEvent" (
      id,
      run_id,
      sequence,
      type,
      node_id,
      payload,
      created_at
    )
    values
      (
        ${`timeline_${replayRunId}_001`},
        ${replayRunId},
        1,
        'RUN_STARTED',
        'trigger:stripeDisputeCreated',
        ${transaction.json({ replay: true })},
        now() - interval '2 minutes'
      ),
      (
        ${`timeline_${replayRunId}_002`},
        ${replayRunId},
        2,
        'STEP_COMPLETED',
        'step:collectCustomerHistory',
        ${transaction.json({ replay: true })},
        now() - interval '90 seconds'
      ),
      (
        ${`timeline_${replayRunId}_003`},
        ${replayRunId},
        3,
        'STEP_COMPLETED',
        'step:draftResponse',
        ${transaction.json({ replay: true })},
        now() - interval '60 seconds'
      ),
      (
        ${`timeline_${replayRunId}_004`},
        ${replayRunId},
        4,
        'APPROVAL_REQUESTED',
        'approval:humanApproval',
        ${transaction.json({ replay: true })},
        now()
      )
    on conflict (run_id, sequence) do nothing
  `;
}

function latestSnapshotAt(
  snapshots: readonly WorkflowSnapshotRow[],
  runId: string,
  sequence: number,
): WorkflowSnapshotRow | undefined {
  return snapshots
    .filter(
      (snapshot) => snapshot.runId === runId && snapshot.sequence <= sequence,
    )
    .at(-1);
}

function hasNodeEvent(
  events: readonly WorkflowTimelineRow[],
  nodeId: string,
): boolean {
  return events.some((event) => event.nodeId === nodeId);
}

function overlayStatusFromStep(
  status: string,
): WorkflowExecutionOverlayNode["status"] {
  switch (status) {
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "running":
      return "running";
    case "skipped":
      return "skipped";
    case "queued":
      return "waiting";
    default:
      return "not_started";
  }
}

function overlayStatusFromApproval(
  status: string,
): WorkflowExecutionOverlayNode["status"] {
  switch (status) {
    case "approved":
      return "succeeded";
    case "pending":
      return "waiting";
    case "expired":
    case "rejected":
      return "failed";
    default:
      return "waiting";
  }
}

function durationMs(
  startedAt: Date | null,
  completedAt: Date | null,
): number | undefined {
  if (!startedAt || !completedAt) {
    return undefined;
  }

  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

function isToday(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function iso(value: Date | null | undefined): string | undefined {
  return value instanceof Date ? value.toISOString() : undefined;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function isWorkflowCanvas(value: unknown): value is WorkflowCanvas {
  if (!isRecord(value)) {
    return false;
  }

  return Array.isArray(value.nodes) && Array.isArray(value.edges);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
