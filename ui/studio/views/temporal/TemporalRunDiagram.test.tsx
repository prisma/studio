import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalGroupedSpan,
  TemporalTypeMapNode,
  TemporalTypeMapResponse,
} from "@/data/temporal";

import { TemporalRunDiagram, TemporalTimerDetail } from "./TemporalRunDiagram";

vi.mock("@/ui/hooks/use-ui-state", () => ({
  useUiState: <T,>(_key: string, initial: T) => [initial, vi.fn(), vi.fn()],
}));

const canvasProps = vi.fn<(props: CanvasProps) => void>();

interface CanvasProps {
  run: {
    isPast: boolean;
    path: {
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
  const onOpenSpan = vi.fn();
  const onActiveSpanIdsChange = vi.fn();

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

  /** A run that tracked the package and now waits on the Timer. */
  function render(overrides?: {
    focusSpan?: { id: string; seq: number } | null;
    selectedId?: string | null;
    spans?: TemporalGroupedSpan[];
  }) {
    act(() =>
      root.render(
        <TemporalRunDiagram
          detail={{
            execution: {
              durationMs: 1_000,
              historyLength: 33,
              historySizeBytes: 100,
              memo: {},
              namespace: "default",
              runId: "run-1",
              searchAttributes: {},
              startTime: STARTED,
              status: "Running",
              taskQueue: "shipping",
              workflowId: "shipment-1",
              workflowType: "shipment",
            },
            spans: overrides?.spans ?? [activity(27, 29), timer({})],
          }}
          focusSpan={overrides?.focusSpan}
          isError={false}
          map={map}
          onActiveSpanIdsChange={onActiveSpanIdsChange}
          onOpenSpan={onOpenSpan}
          onRetry={vi.fn()}
          onSelect={vi.fn()}
          selectedId={overrides?.selectedId ?? null}
          typeUrl="#type"
        />,
      ),
    );
  }

  const shown = () => canvasProps.mock.lastCall![0].run;
  const stepper = () =>
    container
      .querySelector('[data-testid="temporal-run-stepper"]')!
      .textContent.replace(/\s+/g, " ");
  const press = (label: string) =>
    act(() =>
      container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.click(),
    );

  it("opens at the end of the history, with the possible next steps of an open run", () => {
    render();

    expect(stepper()).toContain("Now · 2 steps so far");
    expect(shown().isPast).toBe(false);
    expect(shown().path.steps["timer:Timer 30s"]!.state).toBe("now");
    expect(Object.keys(shown().path.next).sort()).toEqual([
      "activity:trackPackage",
      "end:Completed",
    ]);
  });

  it("steps back to an earlier step and shows the run as it was then", () => {
    render();
    press("First step");

    expect(stepper()).toContain("Step 1 of 2trackPackage");
    expect(shown().isPast).toBe(true);
    expect(shown().path.steps["activity:trackPackage"]!.state).toBe("now");
    // The Timer had not started yet, and the run went there next.
    expect(shown().path.laterStepIds).toEqual(["timer:Timer 30s"]);
    expect(shown().path.next["timer:Timer 30s"]!.isTaken).toBe(true);

    press("Next step");
    expect(stepper()).toContain("Step 2 of 2Timer: 3");

    press("Next step");
    expect(stepper()).toContain("Now");
    expect(shown().isPast).toBe(false);
  });

  it("opens the span of the step on screen in the list of spans", () => {
    render();
    press("First step");

    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Open Span")!
        .click(),
    );
    expect(onOpenSpan).toHaveBeenCalledWith("activity-27");
  });

  it("steps through the run with arrow, Home and End keys", () => {
    render();
    const key = (k: string) =>
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: k }),
        );
      });

    key("ArrowLeft");
    expect(stepper()).toContain("Step 2 of 2Timer: 3");

    key("Home");
    expect(stepper()).toContain("Step 1 of 2trackPackage");

    key("ArrowRight");
    expect(stepper()).toContain("Step 2 of 2Timer: 3");

    key("End");
    expect(stepper()).toContain("Now");
  });

  it("reports all active spans as the stepper moves so the timeline can highlight them", () => {
    render({
      spans: [
        { ...activity(27, 29), closedEventId: undefined, status: "running" },
        timer({}),
      ],
    });
    // At Now with two parallel open steps, both spans are reported.
    expect(onActiveSpanIdsChange).toHaveBeenLastCalledWith([
      "activity-27",
      "timer-33",
    ]);

    press("First step");
    expect(onActiveSpanIdsChange).toHaveBeenLastCalledWith(["activity-27"]);

    press("Next step");
    expect(onActiveSpanIdsChange).toHaveBeenLastCalledWith(["timer-33"]);
  });

  it("jumps the stepper when focusSpan changes and shows node details when selected", () => {
    render({
      focusSpan: { id: "activity-27", seq: 1 },
      selectedId: "activity:trackPackage",
    });

    expect(stepper()).toContain("Step 1 of 2trackPackage");
    const detailText = container
      .querySelector('[data-testid="temporal-run-node-detail"]')!
      .textContent.replace(/\s+/g, " ");
    expect(detailText).toContain("trackPackage");
    expect(detailText).toContain("Taken once in this run");

    act(() =>
      [
        ...container.querySelectorAll<HTMLButtonElement>(
          '[data-testid="temporal-run-node-detail"] button',
        ),
      ]
        .find((button) => button.textContent === "Open Span")!
        .click(),
    );
    expect(onOpenSpan).toHaveBeenCalledWith("activity-27");
  });
});
