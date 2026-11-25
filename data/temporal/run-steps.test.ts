import { describe, expect, it } from "vitest";

import { summarizeRunSteps } from "./run-steps";
import type { TemporalGroupedSpan } from "./types";

function span(
  overrides: Partial<TemporalGroupedSpan> &
    Pick<TemporalGroupedSpan, "kind" | "label" | "startOffsetMs">,
): TemporalGroupedSpan {
  return {
    durationMs: 100,
    eventIds: [],
    id: `${overrides.label}-${overrides.startOffsetMs}`,
    startedEventId: 1,
    status: "completed",
    timestamp: "2026-11-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("summarizeRunSteps", () => {
  it("makes one step of an Activity that a loop ran many times, and one of all Timers", () => {
    const spans = [0, 1, 2].flatMap((cycle) => [
      span({
        kind: "activity",
        label: "chargeCustomer",
        startOffsetMs: cycle * 1_000,
      }),
      span({
        durationMs: 900,
        kind: "timer",
        label: `Timer: ${cycle + 1}`,
        startOffsetMs: cycle * 1_000 + 100,
        status: "fired",
      }),
    ]);

    const { hiddenCount, steps } = summarizeRunSteps(spans, 6);

    expect(hiddenCount).toBe(0);
    expect(
      steps.map((step) => [step.label, step.spans.length, step.durationMs]),
    ).toEqual([
      ["chargeCustomer", 3, 300],
      ["Timer", 3, 2_700],
    ]);
  });

  it("names steps by their summaries, as the Workflow Type's diagram does", () => {
    const { steps } = summarizeRunSteps(
      [
        span({
          kind: "activity",
          label: "notifyDunningStage",
          startOffsetMs: 0,
          userSummary: "Send the at-risk warning",
        }),
        span({
          durationMs: 4_000,
          kind: "timer",
          label: "Timer: 1",
          startOffsetMs: 100,
          status: "fired",
          userSummary: "Wait for payment until the block date",
        }),
        span({
          kind: "timer",
          label: "Timer: 2",
          startOffsetMs: 4_200,
          status: "fired",
          timerMs: 3_000,
        }),
        span({
          attempt: 2,
          kind: "activity",
          label: "notifyDunningStage",
          startOffsetMs: 7_300,
          userSummary: "Send the blocked notice",
        }),
      ],
      8,
    );

    expect(
      steps.map((step) => [step.label, step.implementation, step.maxAttempt]),
    ).toEqual([
      ["Send the at-risk warning", "notifyDunningStage", 1],
      ["Wait for payment until the block date", undefined, 1],
      ["Timer 3s", undefined, 1],
      ["Send the blocked notice", "notifyDunningStage", 2],
    ]);
  });

  it("names an Activity by its type when its summaries name single calls", () => {
    const { steps } = summarizeRunSteps(
      Array.from({ length: 8 }, (_, index) =>
        span({
          kind: "activity",
          label: "chargeOrder",
          startOffsetMs: index * 100,
          userSummary: `Charge order ${index}`,
        }),
      ),
      8,
    );

    expect(steps.map((step) => [step.label, step.spans.length])).toEqual([
      ["chargeOrder", 8],
    ]);
  });

  it("gives a step the status of its most urgent span", () => {
    const { steps } = summarizeRunSteps(
      [
        span({ kind: "activity", label: "chargeCard", startOffsetMs: 0 }),
        span({
          kind: "activity",
          label: "chargeCard",
          startOffsetMs: 500,
          status: "failed",
        }),
        span({
          kind: "activity",
          label: "chargeCard",
          startOffsetMs: 900,
          status: "running",
        }),
      ],
      6,
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]!.status).toBe("failed");
  });

  it("leaves out Workflow Tasks", () => {
    const { steps } = summarizeRunSteps(
      [
        span({
          kind: "workflow-task",
          label: "Workflow Task",
          startOffsetMs: 0,
        }),
        span({ kind: "signal", label: "Signal: approve", startOffsetMs: 10 }),
      ],
      6,
    );

    expect(steps.map((step) => step.label)).toEqual(["Signal: approve"]);
  });

  it("keeps a failed step when the run has more steps than fit", () => {
    const spans = ["a", "b", "c", "d"].map((label, index) =>
      span({
        kind: "activity",
        label,
        startOffsetMs: index * 100,
        status: label === "d" ? "failed" : "completed",
      }),
    );

    const { hiddenCount, steps } = summarizeRunSteps(spans, 3);

    expect(hiddenCount).toBe(1);
    expect(steps.map((step) => step.label)).toEqual(["a", "b", "d"]);
  });
});
