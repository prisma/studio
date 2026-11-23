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
        onBack={vi.fn()}
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

    expect(container.textContent).toContain("typeOf-order-2");
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
