import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
} from "@/data/temporal";

import {
  groupRunsByWorkflowId,
  TemporalWorkflowIdsView,
} from "./TemporalWorkflowIdsView";

const workflowsResult = {
  data: undefined as
    | { executions: TemporalWorkflowExecution[]; nextPageToken?: string }
    | undefined,
  error: null as Error | null,
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch: vi.fn(),
};

const useTemporalWorkflowsMock = vi.fn(
  (_args: { query: string }) => workflowsResult,
);

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({
    createUrl: (values: Record<string, string>) =>
      `#${new URLSearchParams(values).toString()}`,
  }),
}));

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalCapabilities: () => ({
    data: { nativeListOrder: "newest-first" },
  }),
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
    title?: string;
  }) => (
    <header>
      <h1>{props.title}</h1>
      <div>{props.children}</div>
      <div>{props.endContent}</div>
    </header>
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeRun(
  workflowId: string,
  runId: string,
  status: TemporalWorkflowStatus,
  startTime: string,
): TemporalWorkflowExecution {
  return {
    durationMs: 1_000,
    historyLength: 10,
    historySizeBytes: 1_024,
    memo: {},
    namespace: "default",
    runId,
    searchAttributes: {},
    startTime,
    status,
    taskQueue: "billing",
    workflowId,
    workflowType: "subscriptionBilling",
  };
}

describe("groupRunsByWorkflowId", () => {
  it("keeps the order the IDs first appear in and puts the newest run of each first", () => {
    const groups = groupRunsByWorkflowId([
      makeRun("sub-2", "b-old", "Completed", "2026-11-24T09:00:00.000Z"),
      makeRun("sub-1", "a-1", "Running", "2026-11-24T10:00:00.000Z"),
      makeRun("sub-2", "b-new", "Failed", "2026-11-24T11:00:00.000Z"),
    ]);

    expect(groups.map((group) => group.workflowId)).toEqual(["sub-2", "sub-1"]);
    expect(groups[0]?.latestRun.runId).toBe("b-new");
    expect(groups[0]?.runs.map((run) => run.runId)).toEqual(["b-new", "b-old"]);
  });
});

describe("TemporalWorkflowIdsView", () => {
  let root: Root;
  let container: HTMLElement;
  const onOpenExecution = vi.fn();
  const onOpenWorkflowId = vi.fn();
  const onSearchChange = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    workflowsResult.data = {
      executions: [
        makeRun("sub-cus_2", "run-2c", "Running", "2026-11-24T12:00:00.000Z"),
        makeRun("order-9", "run-9", "Failed", "2026-11-24T11:00:00.000Z"),
        makeRun(
          "sub-cus_2",
          "run-2b",
          "ContinuedAsNew",
          "2026-11-24T10:00:00.000Z",
        ),
      ],
    };
    workflowsResult.isError = false;
    workflowsResult.isLoading = false;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function render(search = "") {
    act(() =>
      root.render(
        <TemporalWorkflowIdsView
          followMode="live"
          namespace="default"
          onFollowModeChange={vi.fn()}
          onOpenExecution={onOpenExecution}
          onOpenWorkflowId={onOpenWorkflowId}
          onSearchChange={onSearchChange}
          search={search}
        />,
      ),
    );
  }

  const rows = () =>
    [
      ...container.querySelectorAll(
        '[data-testid^="temporal-workflow-id-row-"]',
      ),
    ] as HTMLElement[];

  it("lists each Workflow ID once with its latest run and links to its page", () => {
    render();

    expect(rows().map((row) => row.querySelector("a")?.textContent)).toEqual([
      "sub-cus_2",
      "order-9",
    ]);
    expect(rows()[0]?.textContent).toContain("Running");
    expect(
      rows()[0]?.querySelector('[role="img"]')?.getAttribute("aria-label"),
    ).toBe("2 recent runs, newest first: Running, Continued as New");
    expect(rows()[0]?.querySelector("a")?.getAttribute("href")).toContain(
      "temporalSectionParam=workflow&temporalWfParam=sub-cus_2",
    );
    expect(
      container.querySelector('[data-testid="temporal-workflow-ids-range"]')
        ?.textContent,
    ).toBe("2 Workflow IDs, 3 executions");
    expect(useTemporalWorkflowsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeCounts: false, query: "" }),
    );
  });

  it("opens the page of a Workflow ID from its row and its latest run from the row button", () => {
    render();

    act(() => rows()[0]!.click());
    expect(onOpenWorkflowId).toHaveBeenCalledWith("sub-cus_2");

    const latestRunButton = [...rows()[1]!.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Latest Run"),
    )!;

    act(() => latestRunButton.click());
    expect(onOpenExecution).toHaveBeenCalledWith("order-9", "run-9");
    expect(onOpenWorkflowId).toHaveBeenCalledTimes(1);
  });

  it("asks the server for the IDs that start with the search text", () => {
    render("sub-");

    expect(useTemporalWorkflowsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'WorkflowId STARTS_WITH "sub-"' }),
    );
  });

  it("sends the typed search after a short wait", () => {
    render();

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="temporal-workflow-id-search"]',
    )!;
    // React reads a typed value through the element's own setter, so the test calls it directly.
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "order-");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onSearchChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSearchChange).toHaveBeenCalledWith("order-");
  });

  it("says that the list is a part of the namespace when the server has more executions", () => {
    workflowsResult.data = {
      ...workflowsResult.data!,
      nextPageToken: "more",
    };
    render();

    expect(
      container.querySelector('[data-testid="temporal-workflow-ids-range"]')
        ?.textContent,
    ).toBe(
      "2 Workflow IDs from the 3 executions started most recently. Search to find any other ID.",
    );
  });

  it("offers to clear a search that matches no Workflow ID", () => {
    workflowsResult.data = { executions: [] };
    render("zzz");

    expect(container.textContent).toContain("starts with zzz");

    const clearButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Clear the search",
    )!;

    act(() => clearButton.click());
    expect(onSearchChange).toHaveBeenCalledWith("");
  });
});
