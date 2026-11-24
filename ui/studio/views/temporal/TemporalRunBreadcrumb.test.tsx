import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalGroupedSpan,
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
} from "@/data/temporal";

import { relatedRunCount, TemporalRelatedPanel } from "./TemporalRelatedPanel";
import {
  runPosition,
  TemporalRunBreadcrumb,
  TemporalWorkflowTypeLink,
} from "./TemporalRunBreadcrumb";

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({
    createUrl: (values: Record<string, string>) =>
      `#${new URLSearchParams(values).toString()}`,
  }),
}));

vi.mock("@/ui/hooks/use-ui-state", () => ({
  useUiState: <T,>(_key: string, initial: T) => [initial, vi.fn(), vi.fn()],
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function run(
  runId: string,
  status: TemporalWorkflowStatus = "Completed",
  overrides: Partial<TemporalWorkflowExecution> = {},
): TemporalWorkflowExecution {
  return {
    durationMs: 1_000,
    historyLength: 10,
    historySizeBytes: 100,
    memo: {},
    namespace: "default",
    runId,
    searchAttributes: {},
    startTime: "2026-11-23T10:00:00.000Z",
    status,
    taskQueue: "shipping",
    workflowId: "shipment-1a4a7395",
    workflowType: "shipment",
    ...overrides,
  };
}

const filterOf = (link: Element | null) =>
  new URLSearchParams(link!.getAttribute("href")!.slice(1)).get("searchParam");

describe("TemporalRunBreadcrumb", () => {
  let root: Root | undefined;
  const onOpenRun = vi.fn();

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  function render(
    props: Partial<Parameters<typeof TemporalRunBreadcrumb>[0]> = {},
  ) {
    const container = document.createElement("div");

    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <TemporalRunBreadcrumb
          execution={run("01a20953-aaaa", "Running")}
          namespace="default"
          onOpenRun={onOpenRun}
          {...props}
        />,
      ),
    );

    return container;
  }

  it("starts the path with the screen the run was opened from and links the Workflow ID to its page", () => {
    const container = render({
      origin: { href: "#section=workflow", label: "Workflow IDs" },
    });
    const origin = container.querySelector(
      '[data-testid="temporal-crumb-origin"]',
    )!;

    expect(origin.textContent).toBe("Workflow IDs");
    expect(origin.getAttribute("href")).toBe("#section=workflow");
    // The Workflow Type is a fact of the run, not a part of its path.
    expect(
      container.querySelector('[data-testid="temporal-crumb-type"]'),
    ).toBeNull();
    const wfHref = container
      .querySelector('[data-testid="temporal-crumb-workflow-id"]')!
      .getAttribute("href")!;
    const wfParams = new URLSearchParams(wfHref.slice(1));
    expect(wfParams.get("temporalSectionParam")).toBe("workflow");
    expect(wfParams.get("temporalWfParam")).toBe("shipment-1a4a7395");
  });

  it("links the Workflow Type to its executions and to its diagram", () => {
    const container = document.createElement("div");

    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <TemporalWorkflowTypeLink
          namespace="default"
          workflowType="shipment"
        />,
      ),
    );

    expect(
      filterOf(container.querySelector('[data-testid="temporal-crumb-type"]')),
    ).toBe('WorkflowType = "shipment"');
    expect(
      container
        .querySelector('[data-testid="temporal-type-link"]')!
        .getAttribute("href"),
    ).toContain("temporalTypeParam=shipment");
  });

  it("says that a run is the only run of its Workflow ID, with nothing to open", () => {
    const container = render({ runs: [run("01a20953-aaaa", "Running")] });

    expect(container.textContent).toContain("Run 01a20953");
    expect(container.textContent).toContain("the only run");
    expect(
      container.querySelector('[data-testid="temporal-run-switcher"]'),
    ).toBeNull();
  });

  it("says which run of several this is and offers the others", () => {
    const container = render({
      runs: [
        run("03cccccc-cccc", "Running"),
        run("01a20953-aaaa", "ContinuedAsNew"),
        run("00bbbbbb-bbbb", "ContinuedAsNew"),
      ],
    });
    const switcher = container.querySelector(
      '[data-testid="temporal-run-switcher"]',
    )!;

    // The runs come newest first, so the middle one is the second run.
    expect(switcher.textContent).toContain("Run 01a20953");
    expect(switcher.textContent).toContain("2 of 3");
  });

  it("writes run IDs so that runs made close in time differ", () => {
    const container = render({
      execution: run("01a20d99-0d5c-7af8-bffe-865954a459e0", "Terminated"),
      runs: [
        run("01a20d99-0d82-7222-b496-9939c1719edf", "TimedOut"),
        run("01a20d99-0d5c-7af8-bffe-865954a459e0", "Terminated"),
      ],
    });

    expect(
      container.querySelector('[data-testid="temporal-run-switcher"]')!
        .textContent,
    ).toContain("Run 01a20d99…59e0");
  });

  it("counts from the server's total when only the newest runs are loaded", () => {
    const container = render({
      hasMoreRuns: true,
      runCount: 130,
      runs: [run("03cccccc-cccc"), run("01a20953-aaaa")],
    });

    expect(
      container.querySelector('[data-testid="temporal-run-switcher"]')!
        .textContent,
    ).toContain("129 of 130");
  });

  it("prints no total and no position while it does not know how many runs there are", () => {
    const container = render({
      hasMoreRuns: true,
      runs: [run("03cccccc-cccc"), run("01a20953-aaaa")],
    });
    const switcher = container.querySelector(
      '[data-testid="temporal-run-switcher"]',
    )!;

    expect(switcher.textContent).not.toMatch(/\d of \d/);
    expect(switcher.textContent).toContain("one of 2+ runs");
  });

  it("makes the run the page's heading", () => {
    expect(
      render({ runs: [run("01a20953-aaaa", "Running")] }).querySelector("h1")!
        .textContent,
    ).toContain("Run 01a20953-aaaa");
  });

  it("shows a run from a history file as text, because the server does not have it", () => {
    const container = render({ isImported: true });

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("shipment-1a4a7395");
  });
});

describe("runPosition", () => {
  it("counts from the oldest run, also when only the newest runs are loaded", () => {
    const newest = [{ runId: "c" }, { runId: "b" }];

    expect(runPosition(newest, "c", 250)).toBe(250);
    expect(runPosition(newest, "b", 250)).toBe(249);
    expect(runPosition(newest, "a", 250)).toBeNull();
  });
});

describe("TemporalRelatedPanel", () => {
  let root: Root | undefined;
  const onOpenExecution = vi.fn();

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  function render(
    props: Partial<Parameters<typeof TemporalRelatedPanel>[0]> = {},
  ) {
    const container = document.createElement("div");

    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <TemporalRelatedPanel
          execution={run("01a20953-aaaa", "Running")}
          isLoadingRuns={false}
          onOpenExecution={onOpenExecution}
          runs={[run("01a20953-aaaa", "Running")]}
          spans={[]}
          workflowIdUrl="#all"
          {...props}
        />,
      ),
    );

    return container;
  }

  const child: TemporalGroupedSpan = {
    childRunId: "run-label",
    childWorkflowId: "label-1a4a7395",
    durationMs: 100,
    eventIds: [],
    id: "child-5",
    kind: "child-workflow",
    label: "Child: printLabel",
    startedEventId: 5,
    startOffsetMs: 0,
    status: "running",
    timestamp: "2026-11-23T10:00:00.000Z",
  };

  it("says in a sentence that a run has no relatives, with no empty lists", () => {
    const container = render();

    expect(container.textContent).toContain(
      "No Workflow started this run, and it started no Child Workflow.",
    );
    expect(container.textContent).toContain("This is the only run of");
    expect(container.querySelector("ul")).toBeNull();
  });

  it("draws the parent above this run and the children under it, and opens the parent", () => {
    const container = render({
      execution: run("01a20953-aaaa", "Running", {
        parentRunId: "run-order",
        parentWorkflowId: "order-1a4a7395",
      }),
      spans: [child],
    });
    const rows = [
      ...container.querySelectorAll(
        '[data-testid="temporal-related-tree"] > li',
      ),
    ];

    expect(rows.map((row) => row.textContent)).toEqual([
      "order-1a4a7395Parent: started this run",
      "shipment-1a4a7395This run · shipment",
      "label-1a4a7395Child · printLabel · Running",
    ]);
    // This run is not a link to itself.
    expect(rows.map((row) => row.querySelector("button") !== null)).toEqual([
      true,
      false,
      true,
    ]);

    act(() => rows[0]!.querySelector("button")!.click());
    expect(onOpenExecution).toHaveBeenCalledWith("order-1a4a7395", "run-order");
  });

  it("lists the other runs of the Workflow ID and marks this one", () => {
    const container = render({
      runs: [
        run("03cccccc-cccc", "Running"),
        run("01a20953-aaaa", "ContinuedAsNew"),
      ],
    });
    const rows = [
      ...container.querySelectorAll(
        '[data-testid="temporal-related-runs"] > li',
      ),
    ];

    expect(rows[1]!.textContent).toContain("This run");
    expect(rows[1]!.querySelector("button")).toBeNull();

    act(() => rows[0]!.querySelector("button")!.click());
    expect(onOpenExecution).toHaveBeenCalledWith(
      "shipment-1a4a7395",
      "03cccccc-cccc",
    );
  });
});

describe("TemporalRelatedPanel with more runs than it loaded", () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
  });

  function render(runCount?: number) {
    const container = document.createElement("div");

    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <TemporalRelatedPanel
          execution={run("01a20d99-0d5c-7af8-bffe-865954a459e0")}
          hasMoreRuns
          isLoadingRuns={false}
          onOpenExecution={vi.fn()}
          runCount={runCount}
          runs={[
            run("01a20d99-0d82-7222-b496-9939c1719edf"),
            run("01a20d99-0d5c-7af8-bffe-865954a459e0"),
          ]}
          spans={[]}
          workflowIdUrl="#all"
        />,
      ),
    );

    return container;
  }

  it("says that it lists the newest runs, with the server's total", () => {
    const text = render(130).textContent;

    expect(text).toContain("Runs of This Workflow ID (130)");
    expect(text).toContain("The newest 2 of 130 runs.");
    expect(text).toContain("View all 130 runs");
    expect(text).toContain("01a20d99…9edf");
  });

  it("prints no total while it does not know one", () => {
    const text = render().textContent;

    expect(text).toContain("The newest 2 runs.");
    expect(text).toContain("View all runs");
    expect(text).not.toContain("(2)");
  });
});

describe("relatedRunCount", () => {
  it("counts the parent, the children and the other runs, not this run", () => {
    expect(
      relatedRunCount({
        execution: run("a", "Running", { parentWorkflowId: "order-1" }),
        runs: [run("a"), run("b"), run("c")],
        spans: [],
      }),
    ).toBe(3);
    expect(
      relatedRunCount({ execution: run("a"), runs: [run("a")], spans: [] }),
    ).toBe(0);
    // A Workflow ID with more runs than the page loaded.
    expect(
      relatedRunCount({
        execution: run("a"),
        runCount: 130,
        runs: [run("a"), run("b")],
        spans: [],
      }),
    ).toBe(129);
  });
});
