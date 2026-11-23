import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalTaskQueuesResponse,
  TemporalTaskQueueSummary,
} from "@/data/temporal";

import { TemporalTaskQueuesView } from "./TemporalTaskQueuesView";

const queuesMock = vi.fn<() => TemporalTaskQueuesResponse>();

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalActions: () => ({
    resetStickyTaskQueue: { mutateAsync: vi.fn() },
  }),
  useTemporalTaskQueues: () => ({
    data: queuesMock(),
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({
    createUrl: (values: Record<string, string>) =>
      `#${new URLSearchParams(values).toString()}`,
  }),
}));

vi.mock("../../StudioHeader", () => ({ StudioHeader: () => null }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function billing(
  overrides: Partial<TemporalTaskQueueSummary>,
): TemporalTaskQueueSummary {
  return {
    activeWorkflowCount: 412,
    activityTypes: [],
    failedWorkflowCount: 30,
    health: "healthy",
    lastActivityTime: new Date().toISOString(),
    name: "billing",
    pendingActivityCount: 0,
    pendingBacklogCount: 0,
    pollers: [],
    retryingActivityCount: 0,
    retryingWorkflowCount: 0,
    scheduleCount: 1,
    totalWorkflowCount: 4_120,
    workflowTypes: [{ count: 412, name: "subscriptionBilling" }],
    workflows: Array.from({ length: 25 }, (_, index) => ({
      hasRetryingActivity: false,
      runId: `run-${index}`,
      startTime: "2026-11-23T10:00:00.000Z",
      status: "Running" as const,
      workflowId: `sub-${index}`,
      workflowType: "subscriptionBilling",
    })),
    ...overrides,
  };
}

describe("TemporalTaskQueuesView", () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = "";
  });

  function renderExpanded(response: Partial<TemporalTaskQueuesResponse>) {
    const container = document.createElement("div");

    document.body.append(container);
    queuesMock.mockReturnValue({
      ageMs: 0,
      complete: true,
      pollersSupported: false,
      queues: [],
      runningComplete: true,
      source: "synthesized",
      ...response,
    });
    root = createRoot(container);
    act(() =>
      root!.render(
        <TemporalTaskQueuesView
          followMode="paused"
          namespace="payments-eu"
          onFollowModeChange={vi.fn()}
          onOpenExecution={vi.fn()}
        />,
      ),
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="temporal-queue-row-billing"]',
        )!
        .click(),
    );

    return container;
  }

  const filterOf = (link: Element | null) =>
    new URLSearchParams(link!.getAttribute("href")!.slice(1)).get(
      "searchParam",
    );
  const namespaceOf = (link: Element | null) =>
    new URLSearchParams(link!.getAttribute("href")!.slice(1)).get(
      "temporalNsParam",
    );

  it("gives the number of runs that the link under the newest runs opens", () => {
    const container = renderExpanded({ queues: [billing({})] });
    const note = container.querySelector(
      '[data-testid="temporal-queue-runs-note"]',
    )!;

    expect(note.textContent).toContain("The newest 8 of 4,120 runs.");
    expect(note.textContent).toContain("Open all 4,120 in Workflows");
    expect(filterOf(note.querySelector("a"))).toBe('TaskQueue = "billing"');
    // The link stays in the namespace of the queue.
    expect(namespaceOf(note.querySelector("a"))).toBe("payments-eu");
  });

  it("counts and links the running runs only when the namespace is too large to copy", () => {
    const container = renderExpanded({
      complete: false,
      queues: [
        billing({ failedWorkflowCount: null, totalWorkflowCount: null }),
      ],
    });
    const row = container.querySelector(
      '[data-testid="temporal-queue-row-billing"]',
    )!;
    const note = container.querySelector(
      '[data-testid="temporal-queue-runs-note"]',
    )!;

    expect(
      container.querySelector('[data-testid="temporal-queues-counted"]')!
        .textContent,
    ).toContain("Counted from the running runs");
    // Running is a link to the same 412 runs; failed and total are not known.
    expect(row.querySelector("a")!.textContent).toBe("412");
    expect(filterOf(row.querySelector("a"))).toBe(
      'TaskQueue = "billing" AND ExecutionStatus = "Running"',
    );
    expect(
      [...row.querySelectorAll("td")].filter(
        (cell) => cell.textContent === "—",
      ),
    ).toHaveLength(2);
    expect(note.textContent).toContain("The newest 8 of 412 running runs.");
    expect(filterOf(note.querySelector("a"))).toBe(
      'TaskQueue = "billing" AND ExecutionStatus = "Running"',
    );
  });
});
