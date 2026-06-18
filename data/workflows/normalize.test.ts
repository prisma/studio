import { describe, expect, it } from "vitest";

import {
  normalizeWorkflowStudioModel,
  parseWorkflowDate,
  WorkflowStudioProviderError,
} from "./index";

const staticModel = {
  kind: "prisma-workflow-studio-model",
  version: 1,
  runtime: {
    datasets: ["runs", "stateSnapshots"],
    endpoints: {
      snapshot: "/api/prisma-workflows/studio",
      replay: "/api/prisma-workflows/replay/:runId",
    },
  },
  workflows: [
    {
      id: "wf_disputes",
      name: "DisputeEvidence",
      slug: "dispute-evidence",
      version: 2,
      canvas: {
        nodes: [
          {
            id: "trigger",
            kind: "trigger",
            label: "Stripe dispute",
            x: 0,
            y: 0,
          },
        ],
        edges: [],
      },
    },
  ],
};

describe("workflow normalization", () => {
  it("normalizes generated static studio json", () => {
    const model = normalizeWorkflowStudioModel(staticModel);

    expect(model.workflows[0]?.latestVersion).toBe(2);
    expect(model.workflows[0]?.runs).toEqual([]);
    expect(model.workflows[0]?.approvals).toEqual([]);
    expect(model.runtime?.endpoints.snapshot).toBe(
      "/api/prisma-workflows/studio",
    );
  });

  it("normalizes runtime snapshot dates into ISO strings", () => {
    const model = normalizeWorkflowStudioModel({
      ...staticModel,
      workflows: [
        {
          ...staticModel.workflows[0],
          latestVersion: 3,
          runs: [
            {
              id: "run_1",
              workflowId: "wf_disputes",
              status: "completed",
              state: { amount: 90000 },
              createdAt: new Date("2026-06-16T10:00:00.000Z"),
            },
            {
              id: "run_2",
              workflowId: "wf_disputes",
              status: "running",
              state: {},
              createdAt: Date.parse("2026-06-16T10:00:00.000Z"),
            },
          ],
          approvals: [
            {
              id: "approval_1",
              runId: "run_1",
              nodeId: "humanApproval",
              approvalName: "Human approval",
              status: "pending",
              requestedAt: "2026-06-16T11:00:00Z",
              assignees: ["role:finance_ops"],
            },
          ],
        },
      ],
    });

    expect(model.workflows[0]?.latestVersion).toBe(3);
    expect(model.workflows[0]?.runs[0]?.createdAt).toBe(
      "2026-06-16T10:00:00.000Z",
    );
    expect(model.workflows[0]?.approvals[0]?.requestedAt).toBe(
      "2026-06-16T11:00:00.000Z",
    );
  });

  it("normalizes per-run step attempts with input and output payloads", () => {
    const model = normalizeWorkflowStudioModel({
      ...staticModel,
      workflows: [
        {
          ...staticModel.workflows[0],
          runs: [
            {
              id: "run_1",
              workflowId: "wf_disputes",
              status: "waiting_for_approval",
              state: {},
              steps: [
                {
                  attempt: 1,
                  completedAt: "2026-06-16T10:02:00Z",
                  id: "step_collect_1",
                  input: { disputeId: "dp_123" },
                  name: "collectCustomerHistory",
                  nodeId: "step:collectCustomerHistory",
                  output: { orderCount: 1 },
                  startedAt: "2026-06-16T10:01:00Z",
                  status: "completed",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(model.workflows[0]?.runs[0]?.steps).toEqual([
      {
        attempt: 1,
        completedAt: "2026-06-16T10:02:00.000Z",
        id: "step_collect_1",
        input: { disputeId: "dp_123" },
        name: "collectCustomerHistory",
        nodeId: "step:collectCustomerHistory",
        output: { orderCount: 1 },
        startedAt: "2026-06-16T10:01:00.000Z",
        status: "completed",
      },
    ]);
  });

  it("rejects unsupported model kind and version", () => {
    expect(() =>
      normalizeWorkflowStudioModel({
        kind: "wrong",
        version: 1,
        workflows: [],
      }),
    ).toThrow(WorkflowStudioProviderError);

    expect(() =>
      normalizeWorkflowStudioModel({
        kind: "prisma-workflow-studio-model",
        version: 99,
        workflows: [],
      }),
    ).toThrow(WorkflowStudioProviderError);
  });

  it("parses Date objects, ISO strings, and epoch milliseconds", () => {
    expect(parseWorkflowDate(new Date("2026-06-16T00:00:00Z"))).toBe(
      "2026-06-16T00:00:00.000Z",
    );
    expect(parseWorkflowDate("2026-06-16T01:00:00Z")).toBe(
      "2026-06-16T01:00:00.000Z",
    );
    expect(parseWorkflowDate(Date.parse("2026-06-16T00:00:00.000Z"))).toBe(
      "2026-06-16T00:00:00.000Z",
    );
    expect(parseWorkflowDate("not a date")).toBeUndefined();
  });
});
