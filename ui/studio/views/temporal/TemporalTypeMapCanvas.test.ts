import { describe, expect, it } from "vitest";

import type { TemporalTypeMapNode } from "@/data/temporal";

import { describeTypeMapEdge, openingViewport } from "./TemporalTypeMapCanvas";

function node(
  id: string,
  kind: TemporalTypeMapNode["kind"],
  label: string,
  overrides: Partial<TemporalTypeMapNode> = {},
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
    ...overrides,
  };
}

describe("describeTypeMapEdge", () => {
  it("shows a share only where the source step has more than one way out", () => {
    const start = node("start", "start", "Start", { runCount: 40 });
    const timer = node("timer:Timer", "timer", "Timer", { runCount: 40 });
    const charge = node("activity:charge", "activity", "charge", {
      runCount: 15,
    });
    const cancel = node(
      "signal:Signal: cancelSubscription",
      "signal",
      "Signal: cancelSubscription",
      { runCount: 3 },
    );
    const completed = node("end:Completed", "end", "Completed", {
      runCount: 12,
      status: "Completed",
    });

    expect(
      describeTypeMapEdge({
        edgeRunCount: 40,
        from: start,
        isLoop: false,
        outgoingEdgeCount: 1,
        to: timer,
        totalRuns: 40,
      }).label,
    ).toBeNull();

    expect(
      describeTypeMapEdge({
        edgeRunCount: 15,
        from: timer,
        isLoop: false,
        isNext: true,
        isTakenNext: true,
        outgoingEdgeCount: 3,
        to: charge,
        totalRuns: 40,
      }).label,
    ).toBe("next · 38%");

    expect(
      describeTypeMapEdge({
        edgeRunCount: 15,
        from: charge,
        isLoop: true,
        outgoingEdgeCount: 1,
        to: timer,
        totalRuns: 40,
      }).label,
    ).toBeNull();

    expect(
      describeTypeMapEdge({
        edgeRunCount: 3,
        from: timer,
        isLoop: false,
        outgoingEdgeCount: 3,
        to: cancel,
        totalRuns: 40,
      }).label,
    ).toBe("8%");

    expect(
      describeTypeMapEdge({
        edgeRunCount: 12,
        from: charge,
        isLoop: false,
        outgoingEdgeCount: 2,
        to: completed,
        totalRuns: 40,
      }).label,
    ).toBe("80%");
  });

  it("marks a loop, and gives the count of runs for an arrow of the selected step", () => {
    const timer = node("timer:Timer", "timer", "Timer", { runCount: 40 });
    const invoice = node("activity:invoice", "activity", "invoice", {
      runCount: 23,
    });
    const loop = describeTypeMapEdge({
      edgeRunCount: 23,
      from: invoice,
      isLoop: true,
      outgoingEdgeCount: 3,
      to: timer,
      totalRuns: 40,
    });

    expect(loop.label).toBe("↻ 100%");
    expect(loop.detail).toBe("↻ 23 runs · 100%");
    expect(
      describeTypeMapEdge({
        edgeRunCount: 1,
        from: timer,
        isLoop: false,
        outgoingEdgeCount: 1,
        to: invoice,
        totalRuns: 40,
      }).detail,
    ).toBe("1 run");
  });

  it("labels run-only transitions added from the current run without showing zero", () => {
    const timer = node("timer:Timer", "timer", "Timer", { runCount: 40 });
    const charge = node("activity:charge", "activity", "charge", {
      runCount: 0,
    });
    const edge = describeTypeMapEdge({
      edgeRunCount: 0,
      from: timer,
      isLoop: false,
      isTaken: true,
      outgoingEdgeCount: 1,
      to: charge,
      totalRuns: 40,
    });

    expect(edge.label).toBe("this run");
    expect(edge.tooltip).toContain("Only in this run");
  });

  it("gives the share of the runs that reached the source step, in those words", () => {
    const timer = node("timer:Timer 30m", "timer", "Timer 30m", {
      runCount: 12,
    });
    const charge = node("activity:charge", "activity", "charge", {
      runCount: 29,
    });
    const edge = describeTypeMapEdge({
      edgeRunCount: 2,
      from: timer,
      isLoop: false,
      outgoingEdgeCount: 2,
      to: charge,
      totalRuns: 40,
    });

    expect(edge.label).toBe("17%");
    expect(edge.tooltip).toContain(
      "2 of the 12 sampled runs that reached Timer 30m (17%)",
    );
    expect(edge.tooltip).not.toContain("of 40");
  });

  it("gives the share of all sampled runs for an arrow from Start", () => {
    const start = node("start", "start", "Start", { runCount: 40 });
    const validate = node("activity:validate", "activity", "validate");

    expect(
      describeTypeMapEdge({
        edgeRunCount: 40,
        from: start,
        isLoop: false,
        outgoingEdgeCount: 1,
        to: validate,
        totalRuns: 40,
      }).tooltip,
    ).toContain("40 of 40 sampled runs");
  });

  it("writes the short text and the fuller text the same way for every kind of step", () => {
    const shipment = node(
      "child-workflow:Child: shipment",
      "child-workflow",
      "Child: shipment",
      {
        runCount: 29,
      },
    );
    const email = node("activity:sendOrderEmail", "activity", "sendOrderEmail");
    const edge = describeTypeMapEdge({
      edgeRunCount: 24,
      from: shipment,
      isLoop: false,
      outgoingEdgeCount: 2,
      to: email,
      totalRuns: 40,
    });

    expect(edge.label).toBe("83%");
    expect(edge.detail).toBe("24 runs · 83%");
  });
});

describe("openingViewport", () => {
  it("opens a diagram wider than the view on its Start step", () => {
    const viewport = openingViewport(
      { height: 400, width: 1_000, x: 0, y: 0 },
      { height: 600, width: 370 },
      { width: 80, x: 400 },
    );

    // Start's middle, at x 440, is in the middle of the view.
    expect(viewport.zoom).toBe(0.8);
    expect(viewport.x).toBeCloseTo(370 / 2 - 440 * 0.8);
  });

  it("does not open past the left edge of a wide diagram", () => {
    const viewport = openingViewport(
      { height: 400, width: 1_000, x: 0, y: 0 },
      { height: 600, width: 370 },
      { width: 80, x: 0 },
    );

    expect(viewport.x).toBe(24);
  });
});
