import { describe, expect, it } from "vitest";

import {
  buildDemoWorkflowSeedData,
  createStaticWorkflowStudioModel,
  DISPUTE_CONTEXT,
  DISPUTE_WORKFLOW_APPROVAL_ID,
  DISPUTE_WORKFLOW_ID,
  DISPUTE_WORKFLOW_RUN_ID,
} from "./workflow-demo-data";
import { handleDemoWorkflowRequest } from "./workflows-fixture";

describe("Workflow demo data", () => {
  it("seeds the durable workflow store and app dispute tables", () => {
    const seed = buildDemoWorkflowSeedData(
      new Date("2026-06-17T10:00:00.000Z"),
    );

    expect(seed.definitionRows).toEqual([
      expect.objectContaining({
        id: DISPUTE_WORKFLOW_ID,
        name: "DisputeEvidence",
        slug: DISPUTE_WORKFLOW_ID,
      }),
    ]);
    expect(seed.versionRows[0]).toEqual(
      expect.objectContaining({
        status: "active",
        version: 1,
        workflow_id: DISPUTE_WORKFLOW_ID,
      }),
    );
    expect(seed.runRows[0]).toEqual(
      expect.objectContaining({
        current_step: "approval:humanApproval",
        id: DISPUTE_WORKFLOW_RUN_ID,
        status: "waiting_for_approval",
      }),
    );
    expect(seed.approvalRows[0]).toEqual(
      expect.objectContaining({
        id: DISPUTE_WORKFLOW_APPROVAL_ID,
        status: "pending",
      }),
    );
    expect(seed.disputeCaseRows[0]).toEqual(
      expect.objectContaining({
        amount_cents: 90000,
        stripe_dispute_id: DISPUTE_CONTEXT.disputeId,
        status: "pending_approval",
      }),
    );
    expect(seed.stepRunRows.map((row) => row["node_id"])).toEqual([
      "step:collectCustomerHistory",
      "step:draftResponse",
    ]);
  });

  it("keeps the fallback snapshot aligned with the seeded workflow graph", () => {
    const model = createStaticWorkflowStudioModel();
    const workflow = model.workflows[0];

    expect(workflow).toEqual(
      expect.objectContaining({
        id: DISPUTE_WORKFLOW_ID,
        latestVersion: 1,
        name: "DisputeEvidence",
      }),
    );
    expect(workflow?.canvas.nodes.map((node) => node.id)).toEqual([
      "trigger:stripeDisputeCreated",
      "state:DisputeCaseState",
      "step:collectCustomerHistory",
      "step:draftResponse",
      "approval:humanApproval",
      "step:submitEvidence",
      "step:postSummary",
      "step:learnFromApproval",
    ]);
    expect(workflow?.runs[0]?.state["customerEmail"]).toBe(
      "billing@acme.example",
    );
    expect(String(workflow?.runs[0]?.state["draftResponse"])).toContain(
      "signed enterprise agreement",
    );
    expect(workflow?.runs[0]?.steps?.map((step) => step.nodeId)).toEqual([
      "step:collectCustomerHistory",
      "step:draftResponse",
    ]);
    expect(workflow?.runs[0]?.steps?.[0]?.input).toEqual(
      expect.objectContaining({
        customerId: "cus_demo_123",
        disputeId: "du_demo_123",
      }),
    );
  });

  it("serves the static workflow snapshot when no PPg database is attached", async () => {
    const response = await handleDemoWorkflowRequest(
      new Request("http://localhost/api/prisma-workflows/studio"),
      "/api/prisma-workflows",
    );
    const payload = recordFromUnknown(await response.json());
    const workflows = arrayFromUnknown(payload["workflows"]).map(
      recordFromUnknown,
    );

    expect(response.ok).toBe(true);
    expect(payload).toEqual(
      expect.objectContaining({
        kind: "prisma-workflow-studio-model",
        version: 1,
      }),
    );
    expect(workflows[0]).toEqual(
      expect.objectContaining({
        id: DISPUTE_WORKFLOW_ID,
      }),
    );
    expect(typeof workflows[0]?.["runsToday"]).toBe("number");
  });
});

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function arrayFromUnknown(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
