import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TemporalExecutionDetail } from "@/data/temporal";

import { TemporalExecutionDebugger } from "./TemporalExecutionDebugger";

const detailMock = vi.fn<() => Record<string, unknown>>();
const metadataMock = vi.fn<(args: unknown) => Record<string, unknown>>(
  () => ({}),
);
const idle = { isPending: false, mutateAsync: vi.fn() };

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalActions: () => ({
    activityOperation: idle,
    cancelWorkflow: idle,
    queryWorkflow: idle,
    resetStickyTaskQueue: idle,
    resetWorkflow: idle,
    setWorkflowPaused: idle,
    signalWorkflow: idle,
    terminateWorkflow: idle,
    updateWorkflow: idle,
  }),
  useTemporalCapabilities: () => ({ data: undefined }),
  useTemporalWorkflowCounts: () => ({}),
  useTemporalWorkflowDetail: () => detailMock(),
  useTemporalWorkflowDetails: () => [],
  useTemporalWorkflowMetadata: (args: unknown) => metadataMock(args),
  useTemporalTypeMap: () => ({}),
  useTemporalWorkflows: () => ({}),
  useTemporalWorkflowStack: () => ({}),
}));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({
    createUrl: () => "#",
    setTemporalEventParam: vi.fn(),
    temporalEventParam: null,
  }),
}));

vi.mock("@/ui/hooks/use-streams", () => ({
  useStreams: () => ({ streams: [] }),
}));

vi.mock("@/ui/hooks/use-ui-state", () => ({
  useUiState: <T,>(_key: string, initial: T) => [initial, vi.fn(), vi.fn()],
}));

vi.mock("../../context", () => ({
  useStudio: () => ({
    hasDatabase: false,
    isNavigationOpen: true,
    toggleNavigation: vi.fn(),
  }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function detailOf(workflowId: string, runId: string): TemporalExecutionDetail {
  return {
    chain: {},
    execution: {
      durationMs: 1_000,
      historyLength: 3,
      historySizeBytes: 100,
      memo: {},
      namespace: "default",
      runId,
      searchAttributes: {},
      startTime: "2026-11-22T10:00:00.000Z",
      status: "Running",
      taskQueue: "billing",
      workflowId,
      workflowType: `typeOf-${workflowId}`,
    },
    rawEvents: [],
    rawHistoryJson: { events: [] },
    spans: [],
    totalDurationMs: 1_000,
  };
}

function render(workflowId: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <TemporalExecutionDebugger
        followMode="paused"
        namespace="default"
        onClone={vi.fn()}
        onFollowModeChange={vi.fn()}
        onOpenExecution={vi.fn()}
        workflowId={workflowId}
      />,
    );
  });

  return { container, unmount: () => act(() => root.unmount()) };
}

describe("TemporalExecutionDebugger", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows the run it was asked for", () => {
    detailMock.mockReturnValue({ data: detailOf("order-2", "run-2") });

    const { container, unmount } = render("order-2");

    expect(container.textContent).toContain("Run run-2");
    expect(
      container.querySelector('[data-testid="temporal-back-to-grid"]'),
    ).toBeNull();
    unmount();
  });

  it("shows the summary, the last details, the outcome and the facts only on the status, not as bars", () => {
    const detail = detailOf("order-2", "run-2");

    detail.execution.status = "Completed";
    detail.execution.closeTime = "2026-11-22T10:00:01.000Z";
    detail.summary = "Charge the order";
    detail.result = { charged: true };
    detailMock.mockReturnValue({ data: detail });
    metadataMock.mockReturnValue({
      data: { currentDetails: "Charged 3 items" },
    });

    const { container, unmount } = render("order-2");

    expect(container.textContent).not.toContain("Charge the order");
    expect(container.textContent).not.toContain("Namespace");
    expect(
      container.querySelector('[data-testid="temporal-debugger-summary"]'),
    ).toBeNull();

    const status = container.querySelector<HTMLButtonElement>(
      '[data-testid="temporal-run-status"]',
    )!;

    expect(status.textContent).toContain("Completed");
    expect(status.textContent).toContain("1.00s");

    act(() => {
      status.focus();
    });

    const card = document.querySelector(
      '[data-testid="temporal-run-status-card"]',
    )!;

    expect(card.textContent).toContain("Charge the order");
    expect(card.textContent).toContain("Last reported: Charged 3 items");
    expect(card.textContent).toContain('Result: {"charged":true}');
    expect(card.textContent).toContain("typeOf-order-2");
    expect(card.textContent).toContain("billing");
    expect(card.textContent).toContain("3 events");
    unmount();
  });

  it("keeps the loaded run on screen when a refresh fails", () => {
    detailMock.mockReturnValue({
      data: detailOf("order-2", "run-2"),
      error: new Error("14 UNAVAILABLE: connection lost"),
      isError: true,
    });

    const { container, unmount } = render("order-2");

    expect(container.textContent).toContain("Run run-2");
    expect(
      container.querySelector('[data-testid="temporal-refresh-error"]')!
        .textContent,
    ).toContain("14 UNAVAILABLE: connection lost");
    expect(
      container.querySelector('[data-testid="temporal-load-error"]'),
    ).toBeNull();
    unmount();
  });

  it("says that the run could not load when the first request fails, with a way to the Executions", () => {
    detailMock.mockReturnValue({
      error: new Error("workflow not found for ID: order-2"),
      isError: true,
    });

    const { container, unmount } = render("order-2");
    const error = container.querySelector(
      '[data-testid="temporal-load-error"]',
    )!;

    expect(error.textContent).toContain("Could not load this run");
    expect(error.textContent).toContain("workflow not found for ID: order-2");
    expect(error.querySelector("a")!.textContent).toBe("Open Executions");
    expect(container.querySelector("h1")!.textContent).toContain("order-2");
    unmount();
  });

  it("says that a closed run had no input and recorded no span, without 'undefined' or 'yet'", () => {
    const detail = detailOf("order-2", "run-2");

    detail.execution.status = "Terminated";
    detailMock.mockReturnValue({ data: detail });

    const { container, unmount } = render("order-2");

    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).not.toContain("yet");
    expect(container.textContent).toContain(
      "This run was started with no input.",
    );
    unmount();
  });

  it("does not show or query the run shown before while another run loads", () => {
    // The query still holds the previous run as placeholder data.
    detailMock.mockReturnValue({
      data: detailOf("sub-1", "run-1"),
      isFetching: true,
    });

    const { container, unmount } = render("order-2");

    expect(container.textContent).not.toContain("typeOf-sub-1");
    expect(metadataMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false, runId: undefined }),
    );
    unmount();
  });
});
