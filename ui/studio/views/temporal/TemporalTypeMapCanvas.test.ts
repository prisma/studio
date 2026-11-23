import { describe, expect, it } from "vitest";

import type { TemporalTypeMapNode } from "@/data/temporal";

import { describeTypeMapEdge } from "./TemporalTypeMapCanvas";

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
  it("annotates start, after-timer, loop, signal, and end edges clearly", () => {
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
    ).toBe("starts · 40");

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
    ).toBe("next · after timer · 15 (38%)");

    expect(
      describeTypeMapEdge({
        edgeRunCount: 15,
        from: charge,
        isLoop: true,
        outgoingEdgeCount: 1,
        to: timer,
        totalRuns: 40,
      }).label,
    ).toBe("↻ loop · 15");

    expect(
      describeTypeMapEdge({
        edgeRunCount: 3,
        from: timer,
        isLoop: false,
        outgoingEdgeCount: 3,
        to: cancel,
        totalRuns: 40,
      }).label,
    ).toBe("on signal · 3 (8%)");

    expect(
      describeTypeMapEdge({
        edgeRunCount: 12,
        from: charge,
        isLoop: false,
        outgoingEdgeCount: 2,
        to: completed,
        totalRuns: 40,
      }).label,
    ).toBe("completed · 12 (80%)");
  });
});
