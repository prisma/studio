import { act } from "react";
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
        sorted?: { rowCount: number };
      }
    | undefined,
  error: null as Error | null,
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch: vi.fn(),
};

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({
    createUrl: (values: Record<string, string>) =>
      `#${new URLSearchParams(values).toString()}`,
  }),
}));

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalWorkflows: () => workflowsResult,
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
      sorted: { rowCount: 3 },
    };
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

  function render() {
    act(() =>
      root.render(
        <TemporalWorkflowChainView
          followMode="live"
          namespace="default"
          onFollowModeChange={vi.fn()}
          onOpenExecution={onOpenExecution}
          onOpenStart={onOpenStart}
          workflowId="sub-cus_4920"
        />,
      ),
    );
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
    expect(container.textContent).toContain("01a20d4c");
    expect(container.textContent).toContain("692");
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
    workflowsResult.data = { executions: [], sorted: { rowCount: 0 } };
    render();

    expect(container.textContent).toContain(
      "No executions found for Workflow ID",
    );
    expect(container.textContent).toContain("Open Executions");
  });
});
