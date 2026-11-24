import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemporalAttentionView } from "./TemporalAttentionView";

const bulkAction = vi.fn().mockResolvedValue({ failed: 0, succeeded: 1 });
const cancelWorkflow = vi.fn().mockResolvedValue({ ok: true });
const resetStickyTaskQueue = vi.fn().mockResolvedValue({ ok: true });
const terminateWorkflow = vi.fn().mockResolvedValue({ ok: true });
const activityOperation = vi.fn().mockResolvedValue({ ok: true });

const loaded = {
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
  error: null as Error | null,
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch: vi.fn(),
};
const queries = { attention: loaded as Record<string, unknown> };

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
  useTemporalAttention: () => queries.attention,
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
    queries.attention = loaded;
  });

  function render() {
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

    return { container, root };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  async function chooseRowAction(container: HTMLElement, label: string) {
    const trigger = container.querySelector<HTMLElement>(
      '[data-testid="temporal-attention-actions-xfer-901"]',
    )!;

    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
      await settle();
    });

    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((element) => element.textContent === label)!;

    await act(async () => {
      item.click();
      await settle();
    });
  }

  it.each([
    ["Request Cancel", cancelWorkflow],
    ["Reset Activity", activityOperation],
    ["Reset Sticky Queue", resetStickyTaskQueue],
  ])("asks before %s acts on one run", async (label, action) => {
    const { container, root } = render();

    await chooseRowAction(container, label);

    expect(action).not.toHaveBeenCalled();

    const dialog = document.querySelector('[role="alertdialog"]')!;

    expect(dialog.textContent).toContain("xfer-901");

    await act(async () => {
      [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent === label)!
        .click();
      await settle();
    });

    expect(action).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("says how many runs it checked when it could not check all of them", () => {
    queries.attention = {
      ...loaded,
      data: { ...loaded.data, checkedRunning: 1_500, totalRunning: 4_200 },
    };

    const { container, root } = render();
    const text = container.textContent ?? "";

    expect(text).toContain("1 of the 1,500 oldest running executions needs");
    expect(text).toContain("4,200 are running");
    expect(text).not.toContain("of 4200");

    act(() => root.unmount());
  });

  it("keeps the list when a refresh fails", () => {
    queries.attention = {
      ...loaded,
      error: new Error("upstream unavailable"),
      isError: true,
    };

    const { container, root } = render();

    expect(
      container.querySelector('[data-testid="temporal-refresh-error"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("xfer-901");

    act(() => root.unmount());
  });

  it("shows no count when the first check fails", () => {
    queries.attention = {
      ...loaded,
      data: undefined,
      error: new Error("upstream unavailable"),
      isError: true,
    };

    const { container, root } = render();
    const text = container.textContent ?? "";

    expect(text).toContain("Could not check the running executions");
    expect(text).not.toContain("need attention");
    expect(text).not.toContain("Checking every running execution");

    act(() => root.unmount());
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
