import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkflowStudioModel, WorkflowStudioProvider } from "@/data";

import { WorkflowView } from "./WorkflowView";

const provider = {
  approve: vi.fn(),
  capabilities: {
    approve: true,
    reject: true,
    replay: true,
    runWorker: true,
  },
  getSnapshot: vi.fn(),
  reject: vi.fn(),
  replay: vi.fn(),
  runWorker: vi.fn(),
} satisfies WorkflowStudioProvider;

const refetchMock = vi.fn();

interface NavigationMockValue {
  createUrl: (values: Record<string, string | undefined>) => string;
  workflowFrameParam: string | null;
  workflowParam: string | null;
  workflowRunParam: string | null;
  workflowTabParam: string | null;
}

interface WorkflowsHookValue {
  data: WorkflowStudioModel;
  error: Error | null;
  isFetching: boolean;
  provider: WorkflowStudioProvider;
  refetch: () => Promise<{ data: WorkflowStudioModel }>;
}

const useNavigationMock = vi.fn<() => NavigationMockValue>();
const useWorkflowsMock = vi.fn<() => WorkflowsHookValue>();

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

vi.mock("@/ui/hooks/use-workflows", () => ({
  useWorkflows: () => useWorkflowsMock(),
}));

vi.mock("../../StudioHeader", () => ({
  StudioHeader: (props: { children?: ReactNode; endContent?: ReactNode }) => (
    <header>
      {props.children}
      {props.endContent}
    </header>
  ),
}));

vi.mock("./WorkflowCanvas", () => ({
  WorkflowCanvas: () => <div data-testid="workflow-canvas">Canvas</div>,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const workflowModel: WorkflowStudioModel = {
  kind: "prisma-workflow-studio-model",
  version: 1,
  warnings: [],
  workflows: [
    {
      approvals: [
        {
          approvalName: "Human approval",
          assignees: ["role:finance_ops"],
          id: "approval_1",
          nodeId: "humanApproval",
          requestedAt: "2026-06-16T10:00:00.000Z",
          runId: "run_1",
          status: "pending",
        },
      ],
      canvas: {
        edges: [],
        nodes: [
          {
            id: "trigger",
            kind: "trigger",
            label: "Stripe dispute",
            x: 0,
            y: 0,
          },
        ],
      },
      deadLetters: [],
      failureRate: 0,
      id: "wf_dispute",
      ingestEvents: [],
      latestVersion: 1,
      name: "DisputeEvidence",
      overlays: [],
      runs: [
        {
          createdAt: "2026-06-16T10:00:00.000Z",
          currentNode: "humanApproval",
          id: "run_1",
          state: { amount: 90000 },
          status: "waiting_for_approval",
          steps: [],
          workflowId: "wf_dispute",
        },
      ],
      runsToday: 1,
      slug: "dispute-evidence",
      timelineFrames: [],
    },
  ],
};

function createUrl(values: Record<string, string | undefined>) {
  return `#${Object.entries(values)
    .filter((entry) => entry[1] !== undefined)
    .map((entry) => `${entry[0]}=${entry[1]}`)
    .join("&")}`;
}

function renderWorkflowView() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<WorkflowView />);
  });

  return { container, root };
}

function getButton(container: ParentNode, label: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );
}

describe("WorkflowView", () => {
  beforeEach(() => {
    provider.approve.mockResolvedValue({ ok: true });
    provider.reject.mockResolvedValue({ ok: true });
    provider.replay.mockResolvedValue({ ok: true });
    provider.runWorker.mockResolvedValue({ ok: true });
    refetchMock.mockResolvedValue({ data: workflowModel });
    useNavigationMock.mockReturnValue({
      createUrl,
      workflowFrameParam: null,
      workflowParam: "dispute-evidence",
      workflowRunParam: "run_1",
      workflowTabParam: "canvas",
    });
    useWorkflowsMock.mockReturnValue({
      data: workflowModel,
      error: null,
      isFetching: false,
      provider,
      refetch: refetchMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("renders the selected workflow canvas and summary", () => {
    const { container, root } = renderWorkflowView();

    expect(container.textContent).toContain("DisputeEvidence");
    expect(container.textContent).toContain("Runs today");
    expect(
      container.querySelector("[data-testid='workflow-canvas']"),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("calls the provider worker action and refreshes", async () => {
    const { container, root } = renderWorkflowView();
    const button = getButton(container, "Run worker");

    await act(async () => {
      button?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(provider.runWorker).toHaveBeenCalledTimes(1);
    expect(refetchMock).toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("renders approval actions when the approvals tab is active", () => {
    useNavigationMock.mockReturnValue({
      createUrl,
      workflowFrameParam: null,
      workflowParam: "dispute-evidence",
      workflowRunParam: null,
      workflowTabParam: "approvals",
    });

    const { container, root } = renderWorkflowView();

    expect(container.textContent).toContain("Human approval");
    expect(getButton(container, "Approve")).not.toBeUndefined();
    expect(getButton(container, "Reject")).not.toBeUndefined();

    act(() => root.unmount());
  });

  it("gives the selected run details enough space for timeline and payloads", () => {
    const workflow = workflowModel.workflows[0];
    if (!workflow) {
      throw new Error("Workflow fixture is missing.");
    }
    const run = workflow.runs[0];
    if (!run) {
      throw new Error("Workflow run fixture is missing.");
    }

    const workflowModelWithFrames: WorkflowStudioModel = {
      ...workflowModel,
      workflows: [
        {
          ...workflow,
          runs: [
            {
              ...run,
              input: { disputeId: "dp_123", amount: 90000 },
              output: { approvalStatus: "pending" },
            },
          ],
          timelineFrames: [
            {
              createdAt: "2026-06-16T10:00:00.000Z",
              eventType: "RUN_STARTED",
              overlay: {
                nodes: {},
                runId: run.id,
                sequence: 1,
              },
              sequence: 1,
              stateDiff: { status: "started" },
            },
          ],
        },
      ],
    };

    useNavigationMock.mockReturnValue({
      createUrl,
      workflowFrameParam: "1",
      workflowParam: "dispute-evidence",
      workflowRunParam: "run_1",
      workflowTabParam: "runs",
    });
    useWorkflowsMock.mockReturnValue({
      data: workflowModelWithFrames,
      error: null,
      isFetching: false,
      provider,
      refetch: refetchMock,
    });

    const { container, root } = renderWorkflowView();
    const detail = container.querySelector("[data-workflow-run-detail]");
    const split = container.querySelector("[data-workflow-run-detail-split]");
    const inspector = container.querySelector(
      "[data-workflow-run-detail-inspector]",
    );

    expect(detail?.className).toContain("min-h-96");
    expect(split?.className).toContain("minmax(24rem,30rem)");
    expect(inspector?.className).toContain("gap-4");
    expect(container.textContent).toContain("Run details");
    expect(container.textContent).toContain("Timeline");
    expect(container.textContent).toContain("dp_123");

    act(() => root.unmount());
  });

  it("renders run progress, step payloads, and next workflow steps", () => {
    const workflow = workflowModel.workflows[0];
    if (!workflow) {
      throw new Error("Workflow fixture is missing.");
    }
    const run = workflow.runs[0];
    if (!run) {
      throw new Error("Workflow run fixture is missing.");
    }

    const workflowModelWithRunMap: WorkflowStudioModel = {
      ...workflowModel,
      workflows: [
        {
          ...workflow,
          approvals: [
            {
              approvalName: "Human approval",
              assignees: ["role:finance_ops"],
              id: "approval_1",
              nodeId: "approval:humanApproval",
              payload: { amountCents: 90000, thresholdCents: 50000 },
              requestedAt: "2026-06-16T10:04:00.000Z",
              runId: "run_1",
              status: "pending",
            },
          ],
          canvas: {
            edges: [
              {
                from: "trigger",
                id: "edge:trigger-collect",
                to: "collect",
              },
              {
                from: "collect",
                id: "edge:collect-draft",
                to: "draft",
              },
              {
                from: "draft",
                id: "edge:draft-approval",
                to: "approval:humanApproval",
              },
              {
                from: "approval:humanApproval",
                id: "edge:approval-submit",
                to: "submit",
              },
            ],
            nodes: [
              {
                id: "trigger",
                kind: "trigger",
                label: "Stripe dispute",
                x: 80,
                y: 80,
              },
              {
                id: "collect",
                kind: "step",
                label: "collectCustomerHistory",
                x: 300,
                y: 120,
              },
              {
                id: "draft",
                kind: "step",
                label: "draftResponse",
                x: 520,
                y: 120,
              },
              {
                id: "approval:humanApproval",
                kind: "approval",
                label: "humanApproval",
                x: 740,
                y: 120,
              },
              {
                id: "submit",
                kind: "step",
                label: "submitEvidence",
                x: 960,
                y: 120,
              },
            ],
          },
          overlays: [
            {
              nodes: {
                "approval:humanApproval": { status: "waiting" },
                collect: { attempt: 1, status: "succeeded" },
                draft: { attempt: 1, status: "succeeded" },
                submit: { status: "not_started" },
                trigger: { status: "succeeded" },
              },
              runId: "run_1",
              sequence: 4,
            },
          ],
          runs: [
            {
              ...run,
              currentNode: "approval:humanApproval",
              input: { disputeId: "dp_123" },
              steps: [
                {
                  attempt: 1,
                  id: "step_collect_1",
                  input: { customerId: "cus_123", disputeId: "dp_123" },
                  name: "collectCustomerHistory",
                  nodeId: "collect",
                  output: { orders: 3, tickets: 2 },
                  status: "completed",
                },
                {
                  attempt: 1,
                  id: "step_draft_1",
                  input: { amount: 90000, customerEmail: "billing@test.io" },
                  name: "draftResponse",
                  nodeId: "draft",
                  output: { response: "Submit receipt and support history." },
                  status: "completed",
                },
              ],
            },
          ],
          timelineFrames: [
            {
              createdAt: "2026-06-16T10:04:00.000Z",
              eventType: "APPROVAL_REQUESTED",
              nodeId: "approval:humanApproval",
              overlay: {
                nodes: {
                  "approval:humanApproval": { status: "waiting" },
                  collect: { status: "succeeded" },
                  draft: { status: "succeeded" },
                  trigger: { status: "succeeded" },
                },
                runId: "run_1",
                sequence: 4,
              },
              sequence: 4,
            },
          ],
        },
      ],
    };

    useNavigationMock.mockReturnValue({
      createUrl,
      workflowFrameParam: "4",
      workflowParam: "dispute-evidence",
      workflowRunParam: "run_1",
      workflowTabParam: "runs",
    });
    useWorkflowsMock.mockReturnValue({
      data: workflowModelWithRunMap,
      error: null,
      isFetching: false,
      provider,
      refetch: refetchMock,
    });

    const { container, root } = renderWorkflowView();

    expect(container.textContent).toContain("Run map");
    expect(container.textContent).toContain("Reached 4 of 5 nodes");
    expect(container.textContent).toContain("Next steps");
    expect(container.textContent).toContain("submitEvidence");
    expect(container.textContent).toContain("customerId, disputeId");
    expect(container.textContent).toContain("orders, tickets");
    expect(container.textContent).toContain("amount, customerEmail");
    expect(container.textContent).toContain("response");
    expect(container.textContent).toContain("Next");
    expect(container.querySelector("[data-workflow-run-map]")).not.toBeNull();

    act(() => root.unmount());
  });
});
