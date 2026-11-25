import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalGroupedSpan,
  TemporalTypeMapNode,
  TemporalTypeMapResponse,
} from "@/data/temporal";

import {
  TemporalRunDiagram,
  TemporalRunDiagramInfo,
  TemporalTimerDetail,
} from "./TemporalRunDiagram";

vi.mock("@/ui/hooks/use-ui-state", () => ({
  useUiState: <T,>(_key: string, initial: T) => [initial, vi.fn(), vi.fn()],
}));

const canvasProps = vi.fn<(props: CanvasProps) => void>();

interface CanvasProps {
  map: TemporalTypeMapResponse;
  run: {
    isPast: boolean;
    path: {
      edgeIds: string[];
      laterStepIds: string[];
      next: Record<string, { isTaken: boolean }>;
      steps: Record<string, { state: string }>;
    };
  };
}

// The canvas needs a browser's layout; the tests read what it is given.
vi.mock("./TemporalTypeMapCanvas", () => ({
  TYPE_MAP_STEP_KINDS: {
    activity: { name: "Activity" },
    "child-workflow": { name: "Child Workflow" },
    signal: { name: "Signal" },
    timer: { name: "Timer" },
    update: { name: "Update" },
  },
  TemporalTypeMapCanvas: (props: CanvasProps) => {
    canvasProps(props);

    return null;
  },
  typeMapStepName: (node: TemporalTypeMapNode) => node.label,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const STARTED = "2026-11-23T16:54:18.000Z";

function timer(overrides: Partial<TemporalGroupedSpan>): TemporalGroupedSpan {
  return {
    durationMs: 84,
    eventIds: [33],
    id: "timer-33",
    kind: "timer",
    label: "Timer: 3",
    startedEventId: 33,
    startOffsetMs: 0,
    status: "running",
    timerMs: 30_000,
    timestamp: STARTED,
    ...overrides,
  };
}

function node(
  id: string,
  kind: TemporalTypeMapNode["kind"],
  label: string,
): TemporalTypeMapNode {
  return {
    failedRunCount: 0,
    failedRuns: [],
    id,
    kind,
    label,
    retriedRunCount: 0,
    runCount: 40,
    spanCount: 40,
    waitingRunCount: 0,
    waitingRuns: [],
  };
}

const map: TemporalTypeMapResponse = {
  ageMs: 0,
  candidateCount: 300,
  candidatesComplete: true,
  during: [],
  edges: [
    {
      from: "activity:trackPackage",
      id: "a",
      runCount: 38,
      to: "timer:Timer 30s",
    },
    {
      from: "timer:Timer 30s",
      id: "b",
      runCount: 30,
      to: "activity:trackPackage",
    },
    { from: "timer:Timer 30s", id: "c", runCount: 8, to: "end:Completed" },
  ],
  nodes: [
    node("activity:trackPackage", "activity", "trackPackage"),
    node("timer:Timer 30s", "timer", "Timer 30s"),
    { ...node("end:Completed", "end", "Completed"), status: "Completed" },
  ],
  runCount: 40,
  statusCounts: { Completed: 40 },
  timersMerged: false,
  truncatedRunCount: 0,
  workflowType: "shipment",
};

describe("TemporalTimerDetail", () => {
  let root: Root;
  let container: HTMLElement;
  const onShowInDiagram = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(STARTED) + 12_000);
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

  const render = (span: TemporalGroupedSpan) =>
    act(() =>
      root.render(
        <TemporalTimerDetail
          map={map}
          onShowInDiagram={onShowInDiagram}
          span={span}
        />,
      ),
    );
  const text = () => container.textContent.replace(/\s+/g, " ");

  it("says how long an open Timer is and how much is left, and counts down", () => {
    render(timer({}));

    expect(text()).toContain("Length30s");
    expect(text()).toContain("Left18s");
    expect(
      container
        .querySelector('[role="progressbar"]')!
        .getAttribute("aria-valuenow"),
    ).toBe("40");

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(text()).toContain("Left15s");
    // A Timer has no input or output to show.
    expect(text()).not.toContain("undefined");
  });

  it("says what runs of the type do before and after the Timer", () => {
    render(timer({}));

    expect(text()).toContain(
      "In recent runs this Timer comes after trackPackage (38 of 40).",
    );
    expect(text()).toContain(
      "After it, runs go on to trackPackage (30 of 40), the end (Completed) (8 of 40).",
    );

    act(() => container.querySelector("button")!.click());
    expect(onShowInDiagram).toHaveBeenCalledWith("timer:Timer 30s");
  });

  it("says when a Timer fired and after how long, with no countdown", () => {
    render(timer({ closedEventId: 34, durationMs: 30_000, status: "fired" }));

    expect(text()).toContain("after 30.0s");
    expect(text()).not.toContain("Left");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
});

describe("TemporalRunDiagram", () => {
  let root: Root;
  let container: HTMLElement;
  const onActiveSpanIdsChange = vi.fn();
  const onSelectNode = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  function activity(from: number, to: number): TemporalGroupedSpan {
    return {
      closedEventId: to,
      durationMs: 345,
      eventIds: [from],
      id: `activity-${from}`,
      kind: "activity",
      label: "trackPackage",
      startedEventId: from,
      startOffsetMs: 0,
      status: "completed",
      timestamp: STARTED,
    };
  }

  const execution = {
    durationMs: 1_000,
    historyLength: 33,
    historySizeBytes: 100,
    memo: {},
    namespace: "default",
    runId: "run-1",
    searchAttributes: {},
    startTime: STARTED,
    status: "Running" as const,
    taskQueue: "shipping",
    workflowId: "shipment-1",
    workflowType: "shipment",
  };

  /** A run that tracked the package and now waits on the Timer. */
  function render(overrides?: {
    position?: number | null;
    selectedNodeId?: string | null;
    spans?: TemporalGroupedSpan[];
  }) {
    act(() =>
      root.render(
        <TemporalRunDiagram
          detail={{
            execution,
            spans: overrides?.spans ?? [activity(27, 29), timer({})],
          }}
          isError={false}
          map={map}
          onActiveSpanIdsChange={onActiveSpanIdsChange}
          onRetry={vi.fn()}
          onSelectNode={onSelectNode}
          position={overrides?.position ?? null}
          selectedNodeId={overrides?.selectedNodeId ?? null}
        />,
      ),
    );
  }

  const shown = () => canvasProps.mock.lastCall![0].run;

  it("shows the end of the history, with the possible next steps of an open run", () => {
    render();

    expect(shown().isPast).toBe(false);
    expect(shown().path.steps["timer:Timer 30s"]!.state).toBe("now");
    expect(Object.keys(shown().path.next).sort()).toEqual([
      "activity:trackPackage",
      "end:Completed",
    ]);
    // The explanation is behind the info button, not above the diagram.
    expect(container.textContent).not.toContain("recent runs");
  });

  it("shows the run as it was at the run page's step", () => {
    render({ position: 0 });

    expect(shown().isPast).toBe(true);
    expect(shown().path.steps["activity:trackPackage"]!.state).toBe("now");
    // The Timer had not started yet, and the run went there next.
    expect(shown().path.laterStepIds).toEqual(["timer:Timer 30s"]);
    expect(shown().path.next["timer:Timer 30s"]!.isTaken).toBe(true);

    render({ position: null });
    expect(shown().isPast).toBe(false);
  });

  it("reports the spans open at the end of the history, so the timeline can highlight them", () => {
    render({
      spans: [
        { ...activity(27, 29), closedEventId: undefined, status: "running" },
        timer({}),
      ],
    });
    expect(onActiveSpanIdsChange).toHaveBeenLastCalledWith([
      "activity-27",
      "timer-33",
    ]);

    // At a step, the run page's own selection marks the timeline.
    render({
      position: 0,
      spans: [
        { ...activity(27, 29), closedEventId: undefined, status: "running" },
        timer({}),
      ],
    });
    expect(onActiveSpanIdsChange).toHaveBeenLastCalledWith([]);
  });

  it("shows how this run relates to the chosen node, with no buttons", () => {
    render({ selectedNodeId: "activity:trackPackage" });

    const detail = container.querySelector(
      '[data-testid="temporal-run-node-detail"]',
    )!;

    expect(detail.textContent.replace(/\s+/g, " ")).toContain(
      "Taken once in this run",
    );
    expect(detail.querySelector("button")).toBeNull();
  });

  it("adds steps from the current run that were missing from the sampled diagram and updates as new steps arrive", () => {
    const charge: TemporalGroupedSpan = {
      closedEventId: 40,
      durationMs: 250,
      eventIds: [38],
      id: "activity-38",
      kind: "activity",
      label: "chargeSubscription",
      startedEventId: 38,
      startOffsetMs: 30_000,
      status: "completed",
      timestamp: STARTED,
    };

    render({
      spans: [
        activity(27, 29),
        timer({ closedEventId: 34, durationMs: 30_000, status: "fired" }),
        charge,
      ],
    });

    const lastCall = canvasProps.mock.lastCall![0];
    expect(lastCall.map.nodes.map((n) => n.id)).toContain(
      "activity:chargeSubscription",
    );
    expect(lastCall.run.path.steps["activity:chargeSubscription"]!.state).toBe(
      "now",
    );
    expect(lastCall.run.path.edgeIds).toContain(
      "timer:Timer 30s\nactivity:chargeSubscription",
    );

    const invoice: TemporalGroupedSpan = {
      durationMs: 120,
      eventIds: [42],
      id: "activity-42",
      kind: "activity",
      label: "sendInvoice",
      startedEventId: 42,
      startOffsetMs: 30_300,
      status: "running",
      timestamp: STARTED,
    };

    render({
      spans: [
        activity(27, 29),
        timer({ closedEventId: 34, durationMs: 30_000, status: "fired" }),
        charge,
        invoice,
      ],
    });

    const updatedCall = canvasProps.mock.lastCall![0];
    expect(updatedCall.map.nodes.map((n) => n.id)).toContain(
      "activity:sendInvoice",
    );
    expect(
      updatedCall.run.path.steps["activity:chargeSubscription"]!.state,
    ).toBe("done");
    expect(updatedCall.run.path.steps["activity:sendInvoice"]!.state).toBe(
      "now",
    );
  });

  it("explains the diagram behind an info button, with the type's diagram and a redraw from more runs", () => {
    const onRedraw = vi.fn();

    act(() =>
      root.render(
        <TemporalRunDiagramInfo
          detail={{
            execution,
            spans: [
              activity(27, 29),
              {
                ...activity(38, 40),
                id: "activity-38",
                label: "chargeSubscription",
              },
            ],
          }}
          isRedrawing={false}
          map={map}
          onRedraw={onRedraw}
          typeUrl="#type"
        />,
      ),
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="temporal-run-diagram-info"]',
        )!
        .click(),
    );

    const details = document.querySelector(
      '[data-testid="temporal-run-diagram-info-details"]',
    )!;

    expect(details.textContent.replace(/\s+/g, " ")).toContain(
      "plus 1 step of this run that none of them took",
    );
    expect(details.querySelector("a")!.getAttribute("href")).toBe("#type");
    act(() =>
      details
        .querySelector<HTMLElement>(
          '[data-testid="temporal-run-diagram-redraw"]',
        )!
        .click(),
    );
    expect(onRedraw).toHaveBeenCalledWith(100);
  });
});
