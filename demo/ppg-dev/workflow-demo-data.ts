import type {
  WorkflowCanvas,
  WorkflowStudioModel,
  WorkflowStudioRuntimeMetadata,
} from "../../data/workflows";

export const DEMO_WORKFLOW_SCHEMA = "_prisma_workflows";
export const DISPUTE_WORKFLOW_ID = "dispute-evidence";
export const DISPUTE_WORKFLOW_NAME = "DisputeEvidence";
export const DISPUTE_WORKFLOW_VERSION_ID = "wfver_dispute_evidence_v1";
export const DISPUTE_WORKFLOW_RUN_ID = "run_dispute_001";
export const DISPUTE_WORKFLOW_APPROVAL_ID = "approval_dispute_001";
export const DISPUTE_WORKFLOW_EVENT_ID = "ingest_dispute_001";
export const DISPUTE_WORKFLOW_SOURCE_HASH = "sha256-demo-dispute-evidence";

export const WORKFLOW_STUDIO_RUNTIME: WorkflowStudioRuntimeMetadata = {
  datasets: [
    "ingestEvents",
    "runs",
    "steps",
    "timeline",
    "stateSnapshots",
    "approvals",
    "outbox",
    "deadLetters",
  ],
  endpoints: {
    approve: "/api/prisma-workflows/approve/:approvalId",
    inspectRun: "/api/prisma-workflows/inspect/:runId",
    reject: "/api/prisma-workflows/reject/:approvalId",
    replay: "/api/prisma-workflows/replay/:runId",
    snapshot: "/api/prisma-workflows/studio",
    worker: "/api/prisma-workflows/run",
  },
};

export const DISPUTE_WORKFLOW_CANVAS = {
  edges: [
    {
      from: "trigger:stripeDisputeCreated",
      id: "DisputeEvidence:edge:0",
      to: "step:collectCustomerHistory",
    },
    {
      from: "step:collectCustomerHistory",
      id: "DisputeEvidence:edge:1",
      to: "step:draftResponse",
    },
    {
      from: "step:draftResponse",
      id: "DisputeEvidence:edge:2",
      to: "approval:humanApproval",
    },
    {
      from: "approval:humanApproval",
      id: "DisputeEvidence:edge:3",
      to: "step:submitEvidence",
    },
    {
      from: "step:submitEvidence",
      id: "DisputeEvidence:edge:4",
      to: "step:postSummary",
    },
    {
      from: "step:postSummary",
      id: "DisputeEvidence:edge:5",
      to: "step:learnFromApproval",
    },
    {
      from: "approval:humanApproval",
      id: "DisputeEvidence:approval:humanApproval:approve",
      label: "approve",
      to: "step:submitEvidence",
    },
  ],
  nodes: [
    {
      config: {
        dedupeBy: "event.data.object.id",
        event: "charge.dispute.created",
      },
      id: "trigger:stripeDisputeCreated",
      kind: "trigger",
      label: "stripeDisputeCreated",
      sourceRef: "stripe",
      x: 80,
      y: 80,
    },
    {
      id: "state:DisputeCaseState",
      kind: "state",
      label: "DisputeCaseState",
      x: 80,
      y: 260,
    },
    {
      codeRef: "./src/steps/collect-customer-history.ts",
      config: {
        checkpoint: true,
        retry: {
          backoff: "exponential",
          maxAttempts: 3,
        },
        sideEffects: "internal",
      },
      id: "step:collectCustomerHistory",
      kind: "step",
      label: "collectCustomerHistory",
      x: 320,
      y: 140,
    },
    {
      codeRef: "./src/steps/draft-response.ts",
      config: {
        budget: {
          maxTokens: 2000,
          maxUsd: 1.25,
          timeout: "45s",
        },
        checkpoint: true,
        sideEffects: "internal",
      },
      id: "step:draftResponse",
      kind: "step",
      label: "draftResponse",
      x: 540,
      y: 140,
    },
    {
      config: {
        assignees: ["role:finance_ops"],
        onApprove: "submitEvidence",
        timeout: "48h",
        when: "state.amount > 50000",
      },
      id: "approval:humanApproval",
      kind: "approval",
      label: "humanApproval",
      x: 760,
      y: 140,
    },
    {
      codeRef: "./src/steps/submit-evidence.ts",
      config: {
        checkpoint: true,
        idempotency: "state.disputeId",
        sideEffects: "external",
      },
      id: "step:submitEvidence",
      kind: "step",
      label: "submitEvidence",
      x: 980,
      y: 140,
    },
    {
      codeRef: "./src/steps/post-summary.ts",
      config: {
        checkpoint: false,
        idempotency: "state.disputeId",
        sideEffects: "external",
      },
      id: "step:postSummary",
      kind: "step",
      label: "postSummary",
      x: 1200,
      y: 140,
    },
    {
      codeRef: "./src/steps/learn-from-approved-response.ts",
      config: {
        checkpoint: true,
        sideEffects: "internal",
      },
      id: "step:learnFromApproval",
      kind: "step",
      label: "learnFromApproval",
      x: 1420,
      y: 140,
    },
  ],
} satisfies WorkflowCanvas;

export const DISPUTE_WORKFLOW_GRAPH = {
  canvas: DISPUTE_WORKFLOW_CANVAS,
  connectors: [
    {
      actions: [],
      connector: "stripe",
      events: ["charge.dispute.created"],
      id: "stripe",
      syncs: [],
    },
    {
      actions: ["lookupCompany"],
      connector: "hubspot",
      events: [],
      id: "hubspot",
      syncs: [],
    },
    {
      actions: ["listCustomerOrders"],
      connector: "shopify",
      events: [],
      id: "shopify",
      syncs: [],
    },
    {
      actions: ["listTickets"],
      connector: "zendesk",
      events: [],
      id: "zendesk",
      syncs: [],
    },
    {
      actions: ["postMessage"],
      connector: "slack",
      events: [],
      id: "slack",
      syncs: [],
    },
  ],
  id: DISPUTE_WORKFLOW_ID,
  name: DISPUTE_WORKFLOW_NAME,
  nodes: [
    {
      checkpoint: true,
      id: "step:collectCustomerHistory",
      kind: "step",
      name: "collectCustomerHistory",
      retry: {
        backoff: "exponential",
        maxAttempts: 3,
      },
      run: "./src/steps/collect-customer-history.ts",
      sideEffects: "internal",
    },
    {
      budget: {
        maxTokens: 2000,
        maxUsd: 1.25,
        timeout: "45s",
      },
      checkpoint: true,
      id: "step:draftResponse",
      kind: "step",
      name: "draftResponse",
      run: "./src/steps/draft-response.ts",
      sideEffects: "internal",
    },
    {
      assignees: ["role:finance_ops"],
      id: "approval:humanApproval",
      kind: "approval",
      name: "humanApproval",
      onApprove: "submitEvidence",
      timeout: "48h",
      when: "state.amount > 50000",
    },
    {
      checkpoint: true,
      id: "step:submitEvidence",
      idempotency: "state.disputeId",
      kind: "step",
      name: "submitEvidence",
      run: "./src/steps/submit-evidence.ts",
      sideEffects: "external",
    },
    {
      checkpoint: false,
      id: "step:postSummary",
      idempotency: "state.disputeId",
      kind: "step",
      name: "postSummary",
      run: "./src/steps/post-summary.ts",
      sideEffects: "external",
    },
    {
      checkpoint: true,
      id: "step:learnFromApproval",
      kind: "step",
      name: "learnFromApproval",
      run: "./src/steps/learn-from-approved-response.ts",
      sideEffects: "internal",
    },
  ],
  policies: {
    budget: {
      maxRunsPerDay: 500,
      maxUsd: 1.25,
    },
    maxRetries: 3,
    retention: {
      payloadDays: 30,
      runHistoryDays: 90,
    },
    timeout: "2h",
  },
  slug: DISPUTE_WORKFLOW_ID,
  sourceHash: DISPUTE_WORKFLOW_SOURCE_HASH,
  states: [
    {
      fields: [
        {
          id: true,
          list: false,
          name: "disputeId",
          optional: false,
          type: "String",
        },
        {
          id: false,
          list: false,
          name: "customerId",
          optional: false,
          type: "String",
        },
        {
          id: false,
          list: false,
          name: "customerEmail",
          optional: true,
          type: "String",
        },
        {
          id: false,
          list: false,
          name: "amount",
          optional: false,
          type: "Int",
        },
        {
          id: false,
          list: false,
          name: "draftResponse",
          optional: true,
          type: "String",
        },
      ],
      name: "DisputeCaseState",
    },
  ],
  triggers: [
    {
      dedupeBy: "event.data.object.id",
      event: "charge.dispute.created",
      id: "trigger:stripeDisputeCreated",
      kind: "trigger",
      name: "stripeDisputeCreated",
      source: "stripe",
    },
  ],
  version: 1,
} as const;

export const DISPUTE_CONTEXT = {
  amount: 90000,
  currency: "usd",
  customerEmail: "billing@acme.example",
  customerId: "cus_demo_123",
  disputeId: "du_demo_123",
  hubspotHistory: {
    company: "Acme Labs",
    lifecycleStage: "enterprise",
    recentNotes: [
      "CFO requested consolidated receipts before renewal.",
      "Account owner confirmed disputed charge maps to annual add-on.",
    ],
  },
  reason: "fraudulent",
  shopifyOrders: [
    {
      fulfilledAt: "2026-06-12T14:30:00.000Z",
      id: "gid://shopify/Order/4198",
      total: 900,
    },
  ],
  stripeMetadata: {
    chargeId: "ch_demo_123",
    invoiceId: "in_demo_456",
    receiptUrl: "https://stripe.example/receipts/ch_demo_123",
  },
  zendeskTickets: [
    {
      id: "zd_719",
      status: "solved",
      subject: "Need receipt for add-on invoice",
    },
  ],
} as const;

export const DISPUTE_DRAFT_RESPONSE =
  "The customer has a signed enterprise agreement, matching Shopify fulfillment, prior Zendesk confirmation, and Stripe metadata tying the disputed charge to invoice in_demo_456. Submit the receipt, fulfillment record, and support transcript as evidence.";

type SeedValue =
  | Date
  | boolean
  | null
  | number
  | string
  | readonly SeedValue[]
  | { readonly [key: string]: SeedValue | undefined };
type SeedRow = Record<string, SeedValue>;

export interface DemoWorkflowSeedData {
  approvalRows: readonly SeedRow[];
  canvasLayoutRows: readonly SeedRow[];
  connectorAccountRows: readonly SeedRow[];
  connectorCursorRows: readonly SeedRow[];
  definitionRows: readonly SeedRow[];
  disputeCaseRows: readonly SeedRow[];
  ingestEventRows: readonly SeedRow[];
  runRows: readonly SeedRow[];
  snapshotRows: readonly SeedRow[];
  stepRunRows: readonly SeedRow[];
  timelineRows: readonly SeedRow[];
  triggerMatchRows: readonly SeedRow[];
  versionRows: readonly SeedRow[];
}

export function buildDemoWorkflowSeedData(
  now = new Date(),
): DemoWorkflowSeedData {
  const receivedAt = minutesBefore(now, 9);
  const runStartedAt = minutesBefore(now, 8);
  const collectStartedAt = minutesBefore(now, 7);
  const collectCompletedAt = minutesBefore(now, 6);
  const draftStartedAt = minutesBefore(now, 5);
  const draftCompletedAt = minutesBefore(now, 4);
  const approvalRequestedAt = minutesBefore(now, 3);

  const runState = {
    ...DISPUTE_CONTEXT,
    draftResponse: DISPUTE_DRAFT_RESPONSE,
  };

  return {
    approvalRows: [
      {
        approval_name: "Finance approval",
        assignees: ["role:finance_ops"],
        expires_at: minutesAfter(now, 48 * 60),
        id: DISPUTE_WORKFLOW_APPROVAL_ID,
        node_id: "approval:humanApproval",
        payload: {
          amountCents: DISPUTE_CONTEXT.amount,
          customerEmail: DISPUTE_CONTEXT.customerEmail,
          draftResponse: DISPUTE_DRAFT_RESPONSE,
          thresholdCents: 50000,
        },
        requested_at: approvalRequestedAt,
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        status: "pending",
      },
    ],
    canvasLayoutRows: [
      {
        id: "layout_dispute_evidence_v1",
        layout: DISPUTE_WORKFLOW_CANVAS,
        updated_at: runStartedAt,
        version_id: DISPUTE_WORKFLOW_VERSION_ID,
        workflow_id: DISPUTE_WORKFLOW_ID,
      },
    ],
    connectorAccountRows: [
      {
        connector: "stripe",
        created_at: receivedAt,
        id: "acct_stripe_demo",
        label: "Stripe demo account",
        metadata: {
          livemode: false,
          webhook: "charge.dispute.created",
        },
      },
      {
        connector: "slack",
        created_at: receivedAt,
        id: "acct_slack_finance_ops",
        label: "Finance Ops Slack",
        metadata: {
          channel: "#finance-ops",
        },
      },
    ],
    connectorCursorRows: [
      {
        connector: "stripe",
        cursor_key: "charge.dispute.created",
        cursor_value: "evt_demo_123",
        id: "cursor_stripe_disputes",
        updated_at: receivedAt,
      },
    ],
    definitionRows: [
      {
        created_at: receivedAt,
        id: DISPUTE_WORKFLOW_ID,
        name: DISPUTE_WORKFLOW_NAME,
        slug: DISPUTE_WORKFLOW_ID,
        updated_at: receivedAt,
      },
    ],
    disputeCaseRows: [
      {
        amount_cents: DISPUTE_CONTEXT.amount,
        approved_response: null,
        created_at: receivedAt,
        customer_email: DISPUTE_CONTEXT.customerEmail,
        draft_response: DISPUTE_DRAFT_RESPONSE,
        evidence_id: null,
        id: "case_du_demo_123",
        provider_context: DISPUTE_CONTEXT,
        status: "pending_approval",
        stripe_dispute_id: DISPUTE_CONTEXT.disputeId,
        updated_at: approvalRequestedAt,
      },
    ],
    ingestEventRows: [
      {
        connector_account_id: "acct_stripe_demo",
        dedupe_key: DISPUTE_CONTEXT.disputeId,
        event_type: "charge.dispute.created",
        external_id: "evt_demo_123",
        headers: {
          "stripe-signature": "t=1781700000,v1=demo",
        },
        id: DISPUTE_WORKFLOW_EVENT_ID,
        normalized_payload: DISPUTE_CONTEXT,
        occurred_at: receivedAt,
        raw_payload: {
          data: {
            object: {
              amount: DISPUTE_CONTEXT.amount,
              charge: "ch_demo_123",
              customer: DISPUTE_CONTEXT.customerId,
              id: DISPUTE_CONTEXT.disputeId,
              reason: DISPUTE_CONTEXT.reason,
            },
          },
          id: "evt_demo_123",
          type: "charge.dispute.created",
        },
        received_at: receivedAt,
        signature_verified: true,
        source: "stripe",
        status: "matched",
      },
    ],
    runRows: [
      {
        completed_at: null,
        created_at: runStartedAt,
        current_step: "approval:humanApproval",
        error: null,
        id: DISPUTE_WORKFLOW_RUN_ID,
        ingest_event_id: DISPUTE_WORKFLOW_EVENT_ID,
        input: {
          disputeId: DISPUTE_CONTEXT.disputeId,
        },
        output: null,
        started_at: runStartedAt,
        state: runState,
        status: "waiting_for_approval",
        updated_at: approvalRequestedAt,
        version_id: DISPUTE_WORKFLOW_VERSION_ID,
        workflow_id: DISPUTE_WORKFLOW_ID,
      },
    ],
    snapshotRows: [
      {
        created_at: runStartedAt,
        diff: {
          amount: DISPUTE_CONTEXT.amount,
          customerId: DISPUTE_CONTEXT.customerId,
          disputeId: DISPUTE_CONTEXT.disputeId,
        },
        id: "snapshot_dispute_001",
        node_id: "trigger:stripeDisputeCreated",
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        sequence: 1,
        state: {
          amount: DISPUTE_CONTEXT.amount,
          customerId: DISPUTE_CONTEXT.customerId,
          disputeId: DISPUTE_CONTEXT.disputeId,
        },
      },
      {
        created_at: collectCompletedAt,
        diff: {
          hubspotHistory: DISPUTE_CONTEXT.hubspotHistory,
          shopifyOrders: DISPUTE_CONTEXT.shopifyOrders,
          stripeMetadata: DISPUTE_CONTEXT.stripeMetadata,
          zendeskTickets: DISPUTE_CONTEXT.zendeskTickets,
        },
        id: "snapshot_dispute_002",
        node_id: "step:collectCustomerHistory",
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        sequence: 2,
        state: {
          ...DISPUTE_CONTEXT,
        },
      },
      {
        created_at: draftCompletedAt,
        diff: {
          draftResponse: DISPUTE_DRAFT_RESPONSE,
        },
        id: "snapshot_dispute_003",
        node_id: "step:draftResponse",
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        sequence: 3,
        state: runState,
      },
    ],
    stepRunRows: [
      {
        attempt: 1,
        completed_at: collectCompletedAt,
        created_at: collectStartedAt,
        error: null,
        id: "step_run_collect_history_001",
        input: {
          customerId: DISPUTE_CONTEXT.customerId,
          disputeId: DISPUTE_CONTEXT.disputeId,
        },
        node_id: "step:collectCustomerHistory",
        output: {
          hubspotHistory: DISPUTE_CONTEXT.hubspotHistory,
          shopifyOrders: DISPUTE_CONTEXT.shopifyOrders,
          stripeMetadata: DISPUTE_CONTEXT.stripeMetadata,
          zendeskTickets: DISPUTE_CONTEXT.zendeskTickets,
        },
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        started_at: collectStartedAt,
        status: "completed",
        step_name: "collectCustomerHistory",
      },
      {
        attempt: 1,
        completed_at: draftCompletedAt,
        created_at: draftStartedAt,
        error: null,
        id: "step_run_draft_response_001",
        input: {
          amount: DISPUTE_CONTEXT.amount,
          customerEmail: DISPUTE_CONTEXT.customerEmail,
          providerContext: DISPUTE_CONTEXT,
        },
        node_id: "step:draftResponse",
        output: {
          response: DISPUTE_DRAFT_RESPONSE,
        },
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        started_at: draftStartedAt,
        status: "completed",
        step_name: "draftResponse",
      },
    ],
    timelineRows: [
      {
        created_at: runStartedAt,
        id: "timeline_dispute_001",
        node_id: "trigger:stripeDisputeCreated",
        payload: {
          eventId: DISPUTE_WORKFLOW_EVENT_ID,
        },
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        sequence: 1,
        type: "RUN_STARTED",
      },
      {
        created_at: collectCompletedAt,
        id: "timeline_dispute_002",
        node_id: "step:collectCustomerHistory",
        payload: {
          providers: ["hubspot", "shopify", "zendesk", "stripe"],
        },
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        sequence: 2,
        type: "STEP_COMPLETED",
      },
      {
        created_at: draftCompletedAt,
        id: "timeline_dispute_003",
        node_id: "step:draftResponse",
        payload: {
          maxUsd: 1.25,
          model: "gpt-5.5-pro",
        },
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        sequence: 3,
        type: "STEP_COMPLETED",
      },
      {
        created_at: approvalRequestedAt,
        id: "timeline_dispute_004",
        node_id: "approval:humanApproval",
        payload: {
          amountCents: DISPUTE_CONTEXT.amount,
          thresholdCents: 50000,
        },
        run_id: DISPUTE_WORKFLOW_RUN_ID,
        sequence: 4,
        type: "APPROVAL_REQUESTED",
      },
    ],
    triggerMatchRows: [
      {
        created_at: receivedAt,
        id: "trigger_match_dispute_001",
        ingest_event_id: DISPUTE_WORKFLOW_EVENT_ID,
        version_id: DISPUTE_WORKFLOW_VERSION_ID,
        workflow_id: DISPUTE_WORKFLOW_ID,
      },
    ],
    versionRows: [
      {
        compiled_graph: DISPUTE_WORKFLOW_GRAPH,
        created_at: receivedAt,
        id: DISPUTE_WORKFLOW_VERSION_ID,
        source_hash: DISPUTE_WORKFLOW_SOURCE_HASH,
        status: "active",
        version: 1,
        visual_graph: DISPUTE_WORKFLOW_CANVAS,
        workflow_id: DISPUTE_WORKFLOW_ID,
      },
    ],
  };
}

export function createStaticWorkflowStudioModel(args?: {
  approvalStatus?: "approved" | "pending" | "rejected";
  replayCount?: number;
  workerRuns?: number;
}): WorkflowStudioModel {
  const approvalStatus = args?.approvalStatus ?? "pending";
  const replayCount = args?.replayCount ?? 0;
  const workerRuns = args?.workerRuns ?? 0;
  const seed = buildDemoWorkflowSeedData();
  const runId =
    replayCount === 0 ? DISPUTE_WORKFLOW_RUN_ID : `run_replay_${replayCount}`;
  const runCreatedAt = iso(seed.runRows[0]?.created_at);
  const approvalRequestedAt = iso(seed.approvalRows[0]?.requested_at);

  return {
    kind: "prisma-workflow-studio-model",
    runtime: WORKFLOW_STUDIO_RUNTIME,
    version: 1,
    warnings: [],
    workflows: [
      {
        approvals: [
          {
            approvalName: "Finance approval",
            assignees: ["role:finance_ops"],
            id: DISPUTE_WORKFLOW_APPROVAL_ID,
            nodeId: "approval:humanApproval",
            payload: seed.approvalRows[0]?.payload,
            requestedAt: approvalRequestedAt,
            runId,
            status: approvalStatus,
          },
        ],
        canvas: DISPUTE_WORKFLOW_CANVAS,
        deadLetters:
          approvalStatus === "rejected"
            ? [
                {
                  createdAt: iso(new Date()),
                  id: "deadletter_dispute_001",
                  kind: "run",
                  payload: { runId },
                  reason: "Approval was rejected in the demo fixture.",
                  resourceId: runId,
                },
              ]
            : [],
        failureRate: approvalStatus === "rejected" ? 1 : 0,
        id: DISPUTE_WORKFLOW_ID,
        ingestEvents: [
          {
            dedupeKey: DISPUTE_CONTEXT.disputeId,
            eventType: "charge.dispute.created",
            externalId: "evt_demo_123",
            id: DISPUTE_WORKFLOW_EVENT_ID,
            normalizedPayload: DISPUTE_CONTEXT,
            rawPayload: seed.ingestEventRows[0]?.raw_payload,
            receivedAt: iso(seed.ingestEventRows[0]?.received_at),
            signatureVerified: true,
            source: "stripe",
            status: "matched",
          },
        ],
        latestVersion: 1,
        name: DISPUTE_WORKFLOW_NAME,
        overlays: [
          {
            nodes: {
              "approval:humanApproval": {
                status: approvalStatus === "pending" ? "waiting" : "succeeded",
              },
              "state:DisputeCaseState": { status: "succeeded" },
              "step:collectCustomerHistory": {
                durationMs: 60000,
                status: "succeeded",
              },
              "step:draftResponse": {
                durationMs: 60000,
                status: "succeeded",
              },
              "step:learnFromApproval": {
                status:
                  approvalStatus === "approved" ? "succeeded" : "not_started",
              },
              "step:postSummary": {
                status:
                  approvalStatus === "approved" ? "succeeded" : "not_started",
              },
              "step:submitEvidence": {
                status:
                  approvalStatus === "approved" ? "succeeded" : "not_started",
              },
              "trigger:stripeDisputeCreated": { status: "succeeded" },
            },
            runId,
            sequence: approvalStatus === "approved" ? 7 : 4,
          },
        ],
        runs: [
          {
            completedAt:
              approvalStatus === "approved" ? iso(new Date()) : undefined,
            createdAt: runCreatedAt,
            currentNode:
              approvalStatus === "pending"
                ? "approval:humanApproval"
                : undefined,
            id: runId,
            input: { disputeId: DISPUTE_CONTEXT.disputeId },
            state: {
              ...DISPUTE_CONTEXT,
              draftResponse: DISPUTE_DRAFT_RESPONSE,
              workerRuns,
            },
            status:
              approvalStatus === "pending"
                ? "waiting_for_approval"
                : approvalStatus === "approved"
                  ? "completed"
                  : "failed",
            steps: buildStaticRunSteps(seed),
            updatedAt: approvalRequestedAt,
            versionId: DISPUTE_WORKFLOW_VERSION_ID,
            workflowId: DISPUTE_WORKFLOW_ID,
          },
        ],
        runsToday: 1 + replayCount,
        slug: DISPUTE_WORKFLOW_ID,
        timelineFrames: [
          {
            createdAt: runCreatedAt,
            eventType: "RUN_STARTED",
            overlay: {
              nodes: {
                "trigger:stripeDisputeCreated": { status: "running" },
              },
              runId,
              sequence: 1,
            },
            sequence: 1,
            state: {
              amount: DISPUTE_CONTEXT.amount,
              customerId: DISPUTE_CONTEXT.customerId,
              disputeId: DISPUTE_CONTEXT.disputeId,
            },
          },
          {
            createdAt: iso(seed.timelineRows[2]?.created_at),
            eventType: "STEP_COMPLETED",
            nodeId: "step:draftResponse",
            overlay: {
              nodes: {
                "step:collectCustomerHistory": { status: "succeeded" },
                "step:draftResponse": { status: "succeeded" },
                "trigger:stripeDisputeCreated": { status: "succeeded" },
              },
              runId,
              sequence: 3,
            },
            sequence: 3,
            stateDiff: { draftResponse: "created" },
          },
          {
            createdAt: approvalRequestedAt,
            eventType: "APPROVAL_REQUESTED",
            nodeId: "approval:humanApproval",
            overlay: {
              nodes: {
                "approval:humanApproval": { status: "waiting" },
                "step:collectCustomerHistory": { status: "succeeded" },
                "step:draftResponse": { status: "succeeded" },
                "trigger:stripeDisputeCreated": { status: "succeeded" },
              },
              runId,
              sequence: 4,
            },
            sequence: 4,
          },
        ],
      },
    ],
  };
}

function minutesBefore(date: Date, minutes: number): Date {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

function minutesAfter(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildStaticRunSteps(seed: DemoWorkflowSeedData) {
  return seed.stepRunRows.map((row) => ({
    attempt: seedNumber(row["attempt"]) ?? 1,
    completedAt: iso(row["completed_at"]),
    error: row["error"] ?? undefined,
    id: seedString(row["id"]) ?? "step",
    input: row["input"],
    name: seedString(row["step_name"]),
    nodeId: seedString(row["node_id"]) ?? "",
    output: row["output"],
    startedAt: iso(row["started_at"]),
    status: seedString(row["status"]) ?? "queued",
  }));
}

function iso(value: unknown): string | undefined {
  return value instanceof Date ? value.toISOString() : undefined;
}

function seedString(value: SeedValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function seedNumber(value: SeedValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}
