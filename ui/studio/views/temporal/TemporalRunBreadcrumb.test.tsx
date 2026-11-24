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

  it("links the Workflow Type to its runs and the Workflow ID to its run chain", () => {
    const container = render();

    expect(
      filterOf(container.querySelector('[data-testid="temporal-crumb-type"]')),
    ).toBe('WorkflowType = "shipment"');
    const wfHref = container
      .querySelector('[data-testid="temporal-crumb-workflow-id"]')!
      .getAttribute("href")!;
    const wfParams = new URLSearchParams(wfHref.slice(1));
    expect(wfParams.get("temporalSectionParam")).toBe("workflow");
    expect(wfParams.get("temporalWfParam")).toBe("shipment-1a4a7395");
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
  });
});
