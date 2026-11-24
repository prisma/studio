import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
} from "@/data/temporal";

import { TemporalWorkflowChainView } from "./TemporalWorkflowChainView";

const workflowsResult = {
  data: undefined as
    | {
        executions: TemporalWorkflowExecution[];
        nextPageToken?: string;
      }
    | undefined,
  error: null as Error | null,
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch: vi.fn(),
};

const countsResult = {
  data: undefined as
    | {
        countsByStatus: Partial<Record<TemporalWorkflowStatus, number>>;
        totalCount: number;
      }
    | undefined,
  refetch: vi.fn(),
};

const useTemporalWorkflowsMock = vi.fn(
  (_args: { query: string }) => workflowsResult,
);
const useTemporalWorkflowCountsMock = vi.fn(
  (_args: { enabled?: boolean; query?: string }) => countsResult,
);

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({
    createUrl: (values: Record<string, string>) =>
      `#${new URLSearchParams(values).toString()}`,
  }),
}));

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalWorkflowCounts: (args: { enabled?: boolean; query?: string }) =>
    useTemporalWorkflowCountsMock(args),
  useTemporalWorkflows: (args: { query: string }) =>
    useTemporalWorkflowsMock(args),
}));

vi.mock("@/ui/hooks/use-ui-state", () => ({
  useUiState: <T,>(_key: string, initial: T) => [initial, vi.fn(), vi.fn()],
}));

vi.mock("../../StudioHeader", () => ({
  StudioHeader: (props: {
    children?: React.ReactNode;
    endContent?: React.ReactNode;
  }) => (
    <header>
      <div>{props.children}</div>
      <div>{props.endContent}</div>
    </header>
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeRun(
  runId: string,
  status: TemporalWorkflowStatus,
  overrides: Partial<TemporalWorkflowExecution> = {},
): TemporalWorkflowExecution {
  return {
    durationMs: 6_480_000,
    historyLength: 345,
    historySizeBytes: 51_200,
    memo: {},
    namespace: "default",
    runId,
    searchAttributes: {},
    startTime: "2026-11-24T10:00:00.000Z",
    status,
    taskQueue: "billing",
    workflowId: "sub-cus_4920",
    workflowType: "subscriptionBilling",
    ...overrides,
  };
}

describe("TemporalWorkflowChainView", () => {
  let root: Root;
  let container: HTMLElement;
  const onOpenExecution = vi.fn();
  const onOpenStart = vi.fn();

  beforeEach(() => {
    workflowsResult.data = {
      executions: [
        makeRun("01a20d4c-0003", "Running", {
          durationMs: 70_000,
          historyLength: 2,
          startTime: "2026-11-24T11:30:00.000Z",
        }),
        makeRun("01a20d4c-0002", "ContinuedAsNew", {
          closeTime: "2026-11-24T11:29:59.000Z",
          startTime: "2026-11-24T09:42:00.000Z",
        }),
        makeRun("01a20d4c-0001", "ContinuedAsNew", {
          closeTime: "2026-11-24T09:41:59.000Z",
          startTime: "2026-11-24T07:54:00.000Z",
        }),
      ],
    };
    countsResult.data = undefined;
    workflowsResult.error = null;
    workflowsResult.isError = false;
    workflowsResult.isFetching = false;
    workflowsResult.isLoading = false;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  // Holds the status filter as the URL does in the app.
  function Harness() {
    const [statusFilter, setStatusFilter] =
      useState<TemporalWorkflowStatus | null>(null);

    return (
      <TemporalWorkflowChainView
        followMode="live"
        namespace="default"
        onFollowModeChange={vi.fn()}
        onOpenExecution={onOpenExecution}
        onOpenStart={onOpenStart}
        onStatusFilterChange={setStatusFilter}
        statusFilter={statusFilter}
        workflowId="sub-cus_4920"
      />
    );
  }

  function render() {
    act(() => root.render(<Harness />));
  }

  it("renders the Workflow Type > Workflow ID breadcrumb, chain summary, and numbered runs", () => {
    render();

    expect(
      container.querySelector('[data-testid="temporal-chain-crumb-type"]')
        ?.textContent,
    ).toBe("subscriptionBilling");
    expect(container.textContent).toContain("sub-cus_4920");
    expect(container.textContent).toContain("Open in Executions");
    expect(container.textContent).toContain("#3");
    expect(container.textContent).toContain("Latest");
    expect(container.textContent).toContain("#1");
    expect(container.textContent).toContain("01a20d4c-0003");
    expect(
      container.querySelector('[data-testid="temporal-chain-range"]')
        ?.textContent,
    ).toBe("3 runs");
    expect(useTemporalWorkflowCountsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("shows a dash for the history size of a run the server has not measured", () => {
    workflowsResult.data = {
      executions: [
        makeRun("01a20d4c-0003", "Running", {
          historyLength: 0,
          historySizeBytes: 0,
        }),
      ],
    };
    render();

    const cells = [
      ...container.querySelectorAll(
        '[data-testid="temporal-chain-row-01a20d4c-0003"] td',
      ),
    ].map((cell) => cell.textContent);

    expect(cells).toContain("—");
    expect(cells).not.toContain("0");
    expect(cells).not.toContain("0 B");
  });

  it("counts and filters a chain of more than one page on the server", () => {
    workflowsResult.data = {
      executions: [
        makeRun("01a20d4c-0130", "TimedOut"),
        makeRun("01a20d4c-0129", "Terminated"),
      ],
      nextPageToken: "page-2",
    };
    countsResult.data = {
      countsByStatus: { Terminated: 117, TimedOut: 13 },
      totalCount: 130,
    };
    render();

    expect(useTemporalWorkflowCountsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: true,
        query: 'WorkflowId = "sub-cus_4920"',
      }),
    );
    expect(container.textContent).toContain("#130");
    expect(container.textContent).toContain("#129");
    expect(
      container.querySelector('[data-testid="temporal-chain-range"]')
        ?.textContent,
    ).toBe("Runs 1–2 of 130");

    const filterBar = container.querySelector(
      '[data-testid="temporal-chain-status-filter"]',
    )!;
    const timedOutButton = [...filterBar.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Timed Out"),
    )!;

    expect(timedOutButton.textContent).toContain("13");

    act(() => timedOutButton.click());

    expect(useTemporalWorkflowsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: 'WorkflowId = "sub-cus_4920" AND ExecutionStatus = "TimedOut"',
      }),
    );
    expect(container.textContent).not.toContain("#130");
  });

  it("shows no run numbers when the server cannot count a long chain", () => {
    workflowsResult.data = {
      executions: [makeRun("01a20d4c-0130", "Terminated")],
      nextPageToken: "page-2",
    };
    countsResult.data = { countsByStatus: {}, totalCount: 0 };
    render();

    expect(container.textContent).toContain("1+");
    expect(container.textContent).not.toContain("#1");
    expect(
      container.querySelector('[data-testid="temporal-chain-status-filter"]'),
    ).toBeNull();
  });

  it("filters runs by status scoped to this Workflow ID and opens a run on click", () => {
    render();

    const filterBar = container.querySelector(
      '[data-testid="temporal-chain-status-filter"]',
    )!;
    const runningButton = [...filterBar.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Running"),
    )!;

    expect(
      container.querySelectorAll('[data-testid="temporal-chain-rail"]').length,
    ).toBeGreaterThan(0);

    act(() => runningButton.click());
    expect(
      container.querySelectorAll('[data-testid^="temporal-chain-row-"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-testid="temporal-chain-rail"]'),
    ).toHaveLength(0);

    const runLink = container.querySelector<HTMLAnchorElement>(
      '[data-testid="temporal-chain-row-01a20d4c-0003"] a',
    )!;
    expect(runLink.getAttribute("href")).toContain(
      "temporalRunParam=01a20d4c-0003",
    );

    act(() => runLink.click());
    expect(onOpenExecution).toHaveBeenCalledWith(
      "sub-cus_4920",
      "01a20d4c-0003",
    );
  });

  it("opens the start sheet prefilled with this Workflow ID, type, and task queue", () => {
    render();

    const startButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Start Execution"),
    )!;

    act(() => startButton.click());
    expect(onOpenStart).toHaveBeenCalledWith({
      taskQueue: "billing",
      workflowId: "sub-cus_4920",
      workflowType: "subscriptionBilling",
    });
  });

  it("shows an actionable empty state when no runs match the Workflow ID", () => {
    workflowsResult.data = { executions: [] };
    render();

    expect(container.textContent).toContain("No runs found for Workflow ID");
    expect(container.textContent).toContain("Find a Workflow ID");
    expect(container.textContent).not.toContain("Open in Executions");
  });
  it("says nothing about the number of runs while they load or when the request fails", () => {
    workflowsResult.data = undefined;
    workflowsResult.isLoading = true;
    render();

    expect(
      container.querySelector('[data-testid="temporal-chain-range"]')
        ?.textContent,
    ).toBe("");

    workflowsResult.isLoading = false;
    workflowsResult.isError = true;
    workflowsResult.error = new Error("rpc error: connection refused");
    render();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not load the runs of sub-cus_4920.",
    );
    expect(container.textContent).toContain("rpc error: connection refused");
    expect(container.textContent).not.toContain("Runs0");
    expect(
      container.querySelector('[data-testid="temporal-chain-range"]')
        ?.textContent,
    ).toBe("");
  });

  it("moves the row cursor with the keys only, and opens the row it is on", () => {
    render();

    const focusedRunId = () =>
      container
        .querySelector('tr[data-focused="true"]')
        ?.getAttribute("data-testid");

    expect(focusedRunId()).toBe("temporal-chain-row-01a20d4c-0003");

    act(() => {
      container
        .querySelector('[data-testid="temporal-chain-row-01a20d4c-0001"]')!
        .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(focusedRunId()).toBe("temporal-chain-row-01a20d4c-0003");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    });
    expect(focusedRunId()).toBe("temporal-chain-row-01a20d4c-0002");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(onOpenExecution).toHaveBeenCalledWith(
      "sub-cus_4920",
      "01a20d4c-0002",
    );
  });

  it("names the page with the Workflow ID and labels the status as the latest run's", () => {
    render();

    expect(container.querySelector("h1")?.textContent).toBe("sub-cus_4920");
    expect(container.textContent).toContain("Latest run: Running");
  });
});
