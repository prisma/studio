import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemporalAttentionView } from "./TemporalAttentionView";

const bulkAction = vi.fn().mockResolvedValue({ failed: 0, succeeded: 1 });
const cancelWorkflow = vi.fn().mockResolvedValue({ ok: true });
const resetStickyTaskQueue = vi.fn().mockResolvedValue({ ok: true });
const terminateWorkflow = vi.fn().mockResolvedValue({ ok: true });
const activityOperation = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalActions: () => ({
    activityOperation: { isPending: false, mutateAsync: activityOperation },
    bulkAction: { isPending: false, mutateAsync: bulkAction },
    cancelWorkflow: { isPending: false, mutateAsync: cancelWorkflow },
    resetStickyTaskQueue: {
      isPending: false,
      mutateAsync: resetStickyTaskQueue,
    },
    terminateWorkflow: { isPending: false, mutateAsync: terminateWorkflow },
  }),
  useTemporalAttention: () => ({
    data: {
      ageMs: 0,
      checkedRunning: 2,
      items: [
        {
          activityId: "deposit",
          activityType: "depositFunds",
          attempt: 3,
          detail: "503 unavailable",
          kind: "activity-retrying",
          maximumAttempts: 25,
          runId: "run-1",
          since: "2026-11-23T10:00:00.000Z",
          startTime: "2026-11-23T09:59:00.000Z",
          status: "Running",
          taskQueue: "billing",
          workflowId: "xfer-901",
          workflowType: "MoneyTransfer",
        },
        {
          detail: "Failed after 1s.",
          kind: "failed",
          runId: "run-2",
          since: "2026-11-23T10:01:00.000Z",
          startTime: "2026-11-23T10:00:59.000Z",
          status: "Failed",
          taskQueue: "billing",
          workflowId: "ord-8492",
          workflowType: "ChargeOrder",
        },
      ],
      totalRunning: 2,
    },
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useTemporalCapabilities: () => ({
    data: { supportsActivityOperations: true },
  }),
}));

vi.mock("../../StudioHeader", () => ({ StudioHeader: () => null }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TemporalAttentionView", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("lets operators select open-problem runs and shows bulk remediation actions", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <TemporalAttentionView
          followMode="paused"
          namespace="default"
          onFollowModeChange={vi.fn()}
          onOpenExecution={vi.fn()}
        />,
      );
    });

    // Open-run group has selection checkboxes and row actions; failed group does not.
    const checkbox = container.querySelector<HTMLButtonElement>(
      '[aria-label="Select xfer-901"]',
    )!;
    expect(checkbox).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Select ord-8492"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="temporal-attention-actions-xfer-901"]',
      ),
    ).not.toBeNull();

    act(() => {
      checkbox.click();
    });

    const bulkBar = container.querySelector(
      '[data-testid="temporal-attention-bulk-bar"]',
    )!;
    expect(bulkBar.textContent).toContain("1 selected");
    expect(bulkBar.textContent).toContain("Request Cancel");
    expect(bulkBar.textContent).toContain("Terminate");

    act(() => root.unmount());
  });
});
