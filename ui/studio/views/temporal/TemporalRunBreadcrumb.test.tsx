import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalGroupedSpan,
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
} from "@/data/temporal";

import { relatedRunCount, TemporalRelatedPanel } from "./TemporalRelatedPanel";
import { runPosition, TemporalRunBreadcrumb } from "./TemporalRunBreadcrumb";

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

  it("starts the path with the Workflow Type, which opens its diagram, and opens the Runs tab from the Workflow ID", () => {
    const container = render();
    const type = container.querySelector(
      '[data-testid="temporal-crumb-type"]',
    )!;
    const typeParams = new URLSearchParams(type.getAttribute("href")!.slice(1));

    expect(type.textContent).toBe("shipment");
    expect(typeParams.get("temporalSectionParam")).toBe("types");
    expect(typeParams.get("temporalTypeParam")).toBe("shipment");
    // The left menu shows the screen the run was opened from, so the path does not.
    expect(
      container.querySelector('[data-testid="temporal-crumb-origin"]'),
    ).toBeNull();
    // With one run there is no Runs tab, so the Workflow ID is text.
    expect(
      container.querySelector('[data-testid="temporal-crumb-workflow-id"]')!
        .tagName,
    ).toBe("SPAN");
  });

  it("opens the Runs tab from the Workflow ID when the ID has several runs", () => {
    const onOpenRuns = vi.fn();
    const container = render({ onOpenRuns });
    const workflowId = container.querySelector<HTMLButtonElement>(
      '[data-testid="temporal-crumb-workflow-id"]',
    )!;

    expect(workflowId.tagName).toBe("BUTTON");
    act(() => workflowId.click());
    expect(onOpenRuns).toHaveBeenCalled();
  });

  it("shows the Workflow Type of a run from a history file as text", () => {
    const container = render({ isImported: true });

    expect(
      container.querySelector('[data-testid="temporal-crumb-type"]'),
    ).toBeNull();
    expect(container.textContent).toContain("shipment");
  });

  it("says that a run is the only run of its Workflow ID, with nothing to open", () => {
    const container = render({ runs: [run("01a20953-aaaa", "Running")] });

    expect(container.textContent).toContain("Run 01a20953");
    expect(
      container.querySelector('[aria-current="page"]')!.getAttribute("title"),
    ).toContain("the only run of");
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
          onOpenExecution={onOpenExecution}
          spans={[]}
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
    // The other runs of the Workflow ID are in the Runs tab.
    expect(container.textContent).not.toContain("Runs of This Workflow ID");
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
});

describe("relatedRunCount", () => {
  it("counts the root, the parent and the children, not this run or its Workflow ID's other runs", () => {
    expect(
      relatedRunCount({
        execution: run("a", "Running", { parentWorkflowId: "order-1" }),
        spans: [],
      }),
    ).toBe(1);
    expect(relatedRunCount({ execution: run("a"), spans: [] })).toBe(0);
  });
});
