import { describe, expect, it } from "vitest";

import {
  buildTypeMap,
  extractRunBuildId,
  formatTimerLength,
  mergeRunIntoTypeMap,
  pickTypeMapSample,
  runMomentOnTypeMap,
  runPathOnTypeMap,
  timerProgress,
  typeMapNeighbours,
  typeMapNodeIdOfSpan,
  typeMapStepId,
} from "./type-map";
import type {
  TemporalGroupedSpan,
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
} from "./types";

function execution(
  workflowId: string,
  status: TemporalWorkflowStatus,
  startTime = "2026-11-23T10:00:00.000Z",
): TemporalWorkflowExecution {
  return {
    durationMs: 1_000,
    historyLength: 10,
    historySizeBytes: 100,
    memo: {},
    namespace: "default",
    runId: `run-${workflowId}`,
    searchAttributes: {},
    startTime,
    status,
    taskQueue: "orders",
    workflowId,
    workflowType: "orderFulfillment",
  };
}

/** A step from the event `from` to the event `to`; no `to` leaves it open. */
function step(
  label: string,
  from: number,
  to?: number,
  overrides: Partial<TemporalGroupedSpan> = {},
): TemporalGroupedSpan {
  return {
    ...(to === undefined ? {} : { closedEventId: to }),
    durationMs: 100,
    eventIds: [from],
    id: `${label}-${from}`,
    kind: "activity",
    label,
    startedEventId: from,
    startOffsetMs: from,
    status: to === undefined ? "running" : "completed",
    timestamp: "2026-11-23T10:00:00.000Z",
    ...overrides,
  };
}

function run(
  workflowId: string,
  status: TemporalWorkflowStatus,
  spans: TemporalGroupedSpan[],
) {
  return { execution: execution(workflowId, status), spans };
}

const edgesOf = (map: ReturnType<typeof buildTypeMap>) =>
  map.edges
    .map((edge) => `${edge.from} > ${edge.to} (${edge.runCount})`)
    .sort();

describe("buildTypeMap", () => {
  it("draws the steps of a run in their order, from the start to the status it closed with", () => {
    const map = buildTypeMap([
      run("order-1", "Completed", [
        step("validateOrder", 5, 7),
        step("chargePayment", 11, 13),
      ]),
    ]);

    expect(map.nodes.map((node) => [node.id, node.kind])).toEqual([
      ["start", "start"],
      ["activity:validateOrder", "activity"],
      ["activity:chargePayment", "activity"],
      ["end:Completed", "end"],
    ]);
    expect(edgesOf(map)).toEqual([
      "activity:chargePayment > end:Completed (1)",
      "activity:validateOrder > activity:chargePayment (1)",
      "start > activity:validateOrder (1)",
    ]);
  });

  it("makes a node per summary when one Activity is several business steps, named by the summary", () => {
    const charged = (id: string, userSummary?: string) =>
      run(id, "Completed", [
        step("chargePayment", 5, 7, userSummary ? { userSummary } : {}),
      ]);
    const map = buildTypeMap([
      charged("order-1", "Charge the card on file"),
      charged("order-2", "Charge  the card\non file"),
      charged("order-3", "Charge a saved wallet"),
      charged("order-4"),
    ]);
    const node = (id: string) => map.nodes.find((each) => each.id === id);

    // Whitespace is one space, so a line break in a summary is the same step.
    expect(
      node("activity:chargePayment:Charge the card on file"),
    ).toMatchObject({
      implementation: "chargePayment",
      label: "Charge the card on file",
      runCount: 2,
    });
    expect(node("activity:chargePayment:Charge a saved wallet")?.runCount).toBe(
      1,
    );
    // An execution with no summary keeps the Activity Type as its name.
    expect(node("activity:chargePayment")).toMatchObject({
      label: "chargePayment",
      runCount: 1,
    });
    expect(map.splitSteps).toEqual(["activity:chargePayment"]);
  });

  it("keeps one node when an Activity's summaries name single executions, not steps", () => {
    const map = buildTypeMap(
      Array.from({ length: 8 }, (_, index) =>
        run(`order-${index}`, "Completed", [
          step("chargePayment", 5, 7, {
            userSummary: `Charge order ${index}`,
          }),
        ]),
      ),
    );

    expect(map.nodes.map((node) => node.id)).toEqual([
      "start",
      "activity:chargePayment",
      "end:Completed",
    ]);
    expect(map.splitSteps).toEqual([]);
  });

  it("names a Timer by its summary, whatever it waits, and never merges a named Timer", () => {
    const map = buildTypeMap(
      [3_000, 7_000, 11_000, 13_000, 17_000].map((timerMs, index) =>
        run(`invoice-${index}`, "Completed", [
          step("Timer: 1", 5, 7, {
            kind: "timer",
            timerMs,
            userSummary: "Wait for payment until the block date",
          }),
          step("Timer: 2", 9, 11, { kind: "timer", timerMs }),
        ]),
      ),
    );

    expect(map.nodes.map((node) => node.id)).toEqual([
      "start",
      "timer:Wait for payment until the block date",
      "timer:Timer",
      "end:Completed",
    ]);
  });

  it("lists Signals and Updates as inputs on the step the run was at, not as steps", () => {
    const paidWhileWaiting = run("invoice-1", "Completed", [
      step("Timer: 1", 5, 9, {
        kind: "timer",
        userSummary: "Wait for payment",
      }),
      step("Signal: invoicePaid", 7, 7, { kind: "signal" }),
      step("markResolved", 11, 13),
    ]);
    const paidLate = run("invoice-2", "Completed", [
      step("Timer: 1", 5, 9, {
        kind: "timer",
        userSummary: "Wait for payment",
      }),
      step("Signal: invoicePaid", 10, 10, { kind: "signal" }),
      step("Update: extendGracePeriod", 4, 4, { kind: "update" }),
      step("markResolved", 11, 13),
    ]);
    const map = buildTypeMap([paidWhileWaiting, paidLate]);

    expect(map.nodes.map((node) => node.kind)).not.toContain("signal");
    expect(edgesOf(map)).toEqual([
      "activity:markResolved > end:Completed (2)",
      "start > timer:Wait for payment (2)",
      "timer:Wait for payment > activity:markResolved (2)",
    ]);
    expect(map.messages).toEqual([
      { kind: "signal", name: "invoicePaid", runCount: 2 },
      { kind: "update", name: "extendGracePeriod", runCount: 1 },
    ]);
    // Paid during the wait, or after it ended: both at the wait. The Update came before any step.
    expect(
      map.nodes.find((node) => node.id === "timer:Wait for payment")?.messages,
    ).toEqual([{ kind: "signal", name: "invoicePaid", runCount: 2 }]);
  });

  it("splits Completed by the business outcome in the result, and keeps a run without one apart", () => {
    const closed = (id: string, result?: unknown) => ({
      ...run(id, "Completed", [step("settle", 5, 7)]),
      ...(result === undefined ? {} : { result }),
    });
    const map = buildTypeMap([
      closed("invoice-1", { status: "resolved" }),
      closed("invoice-2", { status: "resolved" }),
      closed("invoice-3", { status: "abandoned" }),
      // A history longer than the server reads has no result.
      closed("invoice-4"),
    ]);
    const ends = map.nodes
      .filter((node) => node.kind === "end")
      .map((node) => [node.id, node.outcome ?? null, node.runCount]);

    expect(map.outcomeField).toBe("status");
    expect(ends).toEqual([
      ["end:Completed", null, 1],
      ["end:Completed:abandoned", "abandoned", 1],
      ["end:Completed:resolved", "resolved", 2],
    ]);

    // With one outcome only there is nothing to tell apart.
    const same = buildTypeMap([
      closed("invoice-1", { status: "resolved" }),
      closed("invoice-2", { status: "resolved" }),
    ]);

    expect(same.outcomeField).toBeUndefined();
    expect(same.nodes.at(-1)?.id).toBe("end:Completed");
  });

  it("draws one run with the rules of the diagram it is merged into", () => {
    const sampled = buildTypeMap([
      run("invoice-1", "Completed", [
        step("notify", 5, 7, { userSummary: "Send the first warning" }),
        step("notify", 9, 11, { userSummary: "Send the resolved notice" }),
      ]),
    ]);
    const one = run("invoice-2", "Running", [
      step("notify", 5, 7, { userSummary: "Send the first warning" }),
      step("notify", 9, 11, { userSummary: "Send the blocked notice" }),
    ]);
    const merged = mergeRunIntoTypeMap(sampled, one);

    expect(
      merged.nodes
        .filter((node) => node.kind === "activity")
        .map((node) => [node.label, node.runCount]),
    ).toEqual([
      ["Send the first warning", 1],
      ["Send the resolved notice", 1],
      ["Send the blocked notice", 0],
    ]);
    // A diagram from a server that did not split keeps one node per Activity.
    const { splitSteps: _split, ...older } = sampled;

    expect(typeMapStepId(one.spans[1]!, older)).toBe("activity:notify");
  });

  it("counts on each arrow the runs that took it, and shows where a failed run left the others", () => {
    const completed = (id: string) =>
      run(id, "Completed", [
        step("validateOrder", 5, 7),
        step("chargePayment", 11, 13),
      ]);
    const map = buildTypeMap([
      completed("order-1"),
      completed("order-2"),
      run("order-3", "Failed", [
        step("validateOrder", 5, 7, { status: "failed" }),
      ]),
    ]);
    const validate = map.nodes.find(
      (node) => node.id === "activity:validateOrder",
    )!;

    expect(edgesOf(map)).toEqual([
      "activity:chargePayment > end:Completed (2)",
      "activity:validateOrder > activity:chargePayment (2)",
      "activity:validateOrder > end:Failed (1)",
      "start > activity:validateOrder (3)",
    ]);
    expect([validate.runCount, validate.failedRunCount]).toEqual([3, 1]);
    expect(validate.failedRuns).toEqual([
      { runId: "run-order-3", workflowId: "order-3" },
    ]);
    expect(map.statusCounts).toEqual({ Completed: 2, Failed: 1 });
  });

  it("lets two steps that ran at the same time both follow the step before them", () => {
    const map = buildTypeMap([
      run("order-1", "Completed", [
        step("validateOrder", 5, 7),
        // Both start before either ends.
        step("reserveInventory", 11, 15),
        step("chargePayment", 12, 14),
        step("sendOrderEmail", 19, 21),
      ]),
    ]);

    expect(edgesOf(map)).toEqual([
      "activity:chargePayment > activity:sendOrderEmail (1)",
      "activity:reserveInventory > activity:sendOrderEmail (1)",
      "activity:sendOrderEmail > end:Completed (1)",
      "activity:validateOrder > activity:chargePayment (1)",
      "activity:validateOrder > activity:reserveInventory (1)",
      "start > activity:validateOrder (1)",
    ]);
  });

  it("draws a loop as two steps with arrows both ways, and counts how often a step ran", () => {
    const timer = (from: number, to: number) =>
      step("Timer: 1", from, to, { kind: "timer", status: "fired" });
    const map = buildTypeMap([
      run("sub-1", "ContinuedAsNew", [
        step("chargeSubscription", 5, 7),
        timer(8, 9),
        step("chargeSubscription", 11, 13),
        timer(14, 15),
      ]),
    ]);

    expect(edgesOf(map)).toEqual([
      "activity:chargeSubscription > timer:Timer (1)",
      "start > activity:chargeSubscription (1)",
      "timer:Timer > activity:chargeSubscription (1)",
      "timer:Timer > end:ContinuedAsNew (1)",
    ]);
    expect(
      map.nodes.find((node) => node.id === "activity:chargeSubscription")!
        .spanCount,
    ).toBe(2);
  });

  it("tells two Timers apart by the time they wait", () => {
    const map = buildTypeMap([
      run("order-1", "Completed", [
        step("Timer: 1", 5, 6, { kind: "timer", timerMs: 30_000 }),
        step("chargePayment", 8, 9),
        step("Timer: 2", 11, 12, { kind: "timer", timerMs: 900_000 }),
      ]),
    ]);

    expect(
      map.nodes.filter((node) => node.kind === "timer").map((n) => n.label),
    ).toEqual(["Timer 30s", "Timer 15m"]);
    expect(map.timersMerged).toBe(false);
  });

  it("says at which step an open run is now", () => {
    const map = buildTypeMap([
      run("order-1", "Running", [
        step("validateOrder", 5, 7),
        step("chargePayment", 11),
      ]),
      // Nothing is open: the Workflow waits after its last step.
      run("order-2", "Running", [step("validateOrder", 5, 7)]),
    ]);
    const waiting = Object.fromEntries(
      map.nodes.map((node) => [node.id, node.waitingRunCount]),
    );

    expect(waiting).toEqual({
      "activity:chargePayment": 1,
      "activity:validateOrder": 1,
      start: 0,
    });
    expect(map.nodes.some((node) => node.kind === "end")).toBe(false);
  });
});

describe("runPathOnTypeMap", () => {
  const completed = run("order-1", "Completed", [
    step("validateOrder", 5, 7),
    step("Timer: 1", 8, 9, { kind: "timer", timerMs: 30_000 }),
    step("chargePayment", 11, 13),
  ]);
  const waiting = run("order-2", "Running", [
    step("validateOrder", 5, 7),
    step("Timer: 1", 8, undefined, { kind: "timer", timerMs: 30_000 }),
  ]);
  const map = buildTypeMap([completed, waiting]);

  it("finds the steps and arrows of the diagram that a run took, and where it is now", () => {
    const path = runPathOnTypeMap(waiting, map);

    expect(
      Object.entries(path.steps).map(([id, step]) => [id, step.state]),
    ).toEqual([
      ["start", "done"],
      ["activity:validateOrder", "done"],
      ["timer:Timer 30s", "now"],
    ]);
    expect(path.steps["timer:Timer 30s"]!.openSpan?.startedEventId).toBe(8);
    expect(path.edgeIds).toEqual([
      "start\nactivity:validateOrder",
      "activity:validateOrder\ntimer:Timer 30s",
    ]);
    expect(typeMapStepId(waiting.spans[1]!, map)).toBe("timer:Timer 30s");
  });

  it("counts a step of the run that the diagram does not have", () => {
    const other = run("order-3", "Completed", [step("refundPayment", 5, 7)]);

    expect(runPathOnTypeMap(other, map).unknownStepCount).toBe(1);
  });

  it("names what runs do before and after a step, the most common first", () => {
    const { after, before } = typeMapNeighbours(map, "timer:Timer 30s");

    expect(before.map((item) => [item.node.label, item.runCount])).toEqual([
      ["validateOrder", 2],
    ]);
    expect(after.map((item) => [item.node.label, item.runCount])).toEqual([
      ["chargePayment", 1],
    ]);
  });
});

describe("runMomentOnTypeMap", () => {
  const order = (id: string, charge: "completed" | "failed") =>
    run(id, charge === "completed" ? "Completed" : "Failed", [
      step("validateOrder", 5, 7),
      step("chargePayment", 11, 13, { status: charge }),
      ...(charge === "completed" ? [step("sendOrderEmail", 17, 19)] : []),
    ]);
  const map = buildTypeMap([
    order("order-1", "completed"),
    order("order-2", "completed"),
    order("order-3", "failed"),
  ]);
  const statesAt = (
    subject: ReturnType<typeof order>,
    position: number | null,
  ) => {
    const moment = runMomentOnTypeMap(subject, map, position);

    return {
      later: moment.laterStepIds,
      next: Object.fromEntries(
        Object.entries(moment.next).map(([id, item]) => [
          id,
          `${item.runCount} of ${item.ofRuns}${item.isTaken ? ", taken" : ""}`,
        ]),
      ),
      steps: Object.fromEntries(
        Object.entries(moment.steps).map(([id, item]) => [id, item.state]),
      ),
    };
  };

  it("shows a run as it was when one of its steps started", () => {
    // The second step of a run that later completed.
    expect(statesAt(order("order-1", "completed"), 1)).toEqual({
      later: ["activity:sendOrderEmail", "end:Completed"],
      // After chargePayment, two of three runs sent the email and one failed.
      next: {
        "activity:sendOrderEmail": "2 of 3, taken",
        "end:Failed": "1 of 3",
      },
      steps: {
        "activity:chargePayment": "now",
        "activity:validateOrder": "done",
        start: "done",
      },
    });
  });

  it("marks the status a run closed with as its next step at its last step", () => {
    expect(statesAt(order("order-3", "failed"), 1).next).toEqual({
      "activity:sendOrderEmail": "2 of 3",
      "end:Failed": "1 of 3, taken",
    });
  });

  it("shows a closed run whole at the end of its history, with no next step", () => {
    const end = statesAt(order("order-3", "failed"), null);

    expect(end.steps["activity:chargePayment"]).toBe("failed");
    expect(end.steps["end:Failed"]).toBe("done");
    expect(end.next).toEqual({});
    expect(end.later).toEqual([]);
  });

  it("offers what other runs did next while the current step was open, with no step for a Signal", () => {
    // In one run the approval arrives while the Timer runs; in the other the Timer fires.
    const approved = run("order-5", "Completed", [
      step("Timer: 1", 5, 9, { kind: "timer", timerMs: 1_800_000 }),
      step("Signal: approveOrder", 7, 7, { kind: "signal" }),
      step("chargePayment", 11, 13),
    ]);
    const timedOut = run("order-6", "Canceled", [
      step("Timer: 1", 5, 9, { kind: "timer", timerMs: 1_800_000 }),
    ]);
    const waiting = run("order-7", "Running", [
      step("Timer: 1", 5, undefined, { kind: "timer", timerMs: 1_800_000 }),
    ]);
    const approvalMap = buildTypeMap([approved, timedOut]);

    expect(approvalMap.during).toEqual([]);
    expect(
      Object.keys(runMomentOnTypeMap(waiting, approvalMap, null).next).sort(),
    ).toEqual(["activity:chargePayment", "end:Canceled"]);
    // At the Signal, the diagram shows the step the run was at.
    expect(typeMapNodeIdOfSpan(approved, approved.spans[1]!, approvalMap)).toBe(
      "timer:Timer 30m",
    );
    expect(typeMapStepId(approved.spans[1]!, approvalMap)).toBeNull();
  });

  it("offers the possible next steps of an open run", () => {
    const open = run("order-4", "Running", [
      step("validateOrder", 5, 7),
      step("chargePayment", 11),
    ]);

    expect(statesAt(open, null).next).toEqual({
      "activity:sendOrderEmail": "2 of 3",
      "end:Failed": "1 of 3",
    });
  });
});

describe("formatTimerLength", () => {
  it("writes a length in at most two units and drops a unit that is zero", () => {
    expect(
      [450, 4_500, 30_000, 348_000, 7_200_000, 108_000_000].map(
        formatTimerLength,
      ),
    ).toEqual(["450ms", "4.5s", "30s", "5m 48s", "2h", "1d 6h"]);
  });
});

describe("timerProgress", () => {
  it("says when a Timer fires and how much of it is left", () => {
    const started = "2026-11-23T10:00:00.000Z";

    expect(
      timerProgress(
        { timerMs: 30_000, timestamp: started },
        Date.parse(started) + 12_000,
      ),
    ).toEqual({
      firesAtMs: Date.parse(started) + 30_000,
      leftMs: 18_000,
      lengthMs: 30_000,
      share: 0.4,
    });
    expect(timerProgress({ timestamp: started }, 0)).toBeNull();
  });
});

describe("mergeRunIntoTypeMap", () => {
  it("returns the map unchanged when every step and edge of the run is already present", () => {
    const first = run("sub-1", "Running", [
      step("Timer: 1", 5, 6, {
        kind: "timer",
        status: "fired",
        timerMs: 60_000,
      }),
      step("chargeSubscription", 8, 10),
    ]);
    const map = buildTypeMap([first]);

    expect(mergeRunIntoTypeMap(map, first)).toBe(map);
  });

  it("adds steps and arrows from the current run that no sampled run took", () => {
    const newborn = run("sub-new", "Running", [
      step("Timer: 1", 5, undefined, { kind: "timer", timerMs: 60_000 }),
    ]);
    const progressed = run("sub-progressed", "Running", [
      step("Timer: 1", 5, 6, {
        kind: "timer",
        status: "fired",
        timerMs: 60_000,
      }),
      step("chargeSubscription", 8, 10),
      step("sendInvoice", 12, 14),
      step("Timer: 2", 16, undefined, { kind: "timer", timerMs: 60_000 }),
    ]);
    const map = buildTypeMap([newborn]);
    const merged = mergeRunIntoTypeMap(map, progressed);

    expect(merged.nodes.map((node) => [node.id, node.runCount])).toEqual([
      ["start", 1],
      ["timer:Timer 1m", 1],
      ["activity:chargeSubscription", 0],
      ["activity:sendInvoice", 0],
    ]);
    expect(edgesOf(merged)).toEqual([
      "activity:chargeSubscription > activity:sendInvoice (0)",
      "activity:sendInvoice > timer:Timer 1m (0)",
      "start > timer:Timer 1m (1)",
      "timer:Timer 1m > activity:chargeSubscription (0)",
    ]);
    expect(runPathOnTypeMap(progressed, merged).unknownStepCount).toBe(0);
  });
});

describe("pickTypeMapSample", () => {
  it("takes the newest runs and keeps a few of a status that is rare among them", () => {
    const minute = (n: number) =>
      `2026-11-23T10:${String(n).padStart(2, "0")}:00.000Z`;
    const runs = [
      // The oldest run is the only one that failed.
      execution("order-failed", "Failed", minute(0)),
      ...Array.from({ length: 20 }, (_, index) =>
        execution(`order-${index}`, "Completed", minute(index + 1)),
      ),
    ];
    const sample = pickTypeMapSample(runs, 8);

    expect(sample).toHaveLength(8);
    expect(sample.map((item) => item.workflowId)).toContain("order-failed");
    expect(sample[0]!.workflowId).toBe("order-19");
  });

  it("includes recent closed runs and progressed open runs alongside newborn open runs", () => {
    const sec = (n: number) =>
      new Date(
        Date.parse("2026-11-23T10:00:00.000Z") + n * 1_000,
      ).toISOString();
    const runs = [
      // 60 brand-new Running runs with only 2 events.
      ...Array.from({ length: 60 }, (_, index) => ({
        ...execution(`newborn-${index}`, "Running", sec(200 + index)),
        historyLength: 2,
      })),
      // 10 mature Running runs started earlier that have progressed far.
      ...Array.from({ length: 10 }, (_, index) => ({
        ...execution(`mature-${index}`, "Running", sec(50 + index)),
        historyLength: 120 + index,
      })),
      // 20 closed runs started earlier that closed recently.
      ...Array.from({ length: 20 }, (_, index) => ({
        ...execution(`closed-${index}`, "ContinuedAsNew", sec(index)),
        closeTime: sec(180 + index),
        historyLength: 345,
      })),
    ];
    const sample = pickTypeMapSample(runs, 40);
    const closedInSample = sample.filter(
      (item) => item.status === "ContinuedAsNew",
    );
    const matureInSample = sample.filter((item) =>
      item.workflowId.startsWith("mature-"),
    );

    expect(sample).toHaveLength(40);
    expect(closedInSample.length).toBeGreaterThanOrEqual(20);
    expect(matureInSample.length).toBeGreaterThanOrEqual(10);
  });

  it("includes progressed open runs even when every candidate run is Running", () => {
    const sec = (n: number) =>
      new Date(
        Date.parse("2026-11-23T10:00:00.000Z") + n * 1_000,
      ).toISOString();
    const runs = [
      ...Array.from({ length: 50 }, (_, index) => ({
        ...execution(`newborn-${index}`, "Running", sec(100 + index)),
        historyLength: 2,
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        ...execution(`mature-${index}`, "Running", sec(index)),
        historyLength: 80 + index,
      })),
    ];
    const sample = pickTypeMapSample(runs, 20);
    const matureInSample = sample.filter((item) =>
      item.workflowId.startsWith("mature-"),
    );

    expect(sample).toHaveLength(20);
    expect(matureInSample).toHaveLength(5);
  });
});

describe("extractRunBuildId", () => {
  it("reads the newest Worker Build ID from WorkflowTaskCompleted events", () => {
    expect(
      extractRunBuildId([
        {
          attributes: { workerVersionStamp: { buildId: "v1" } },
          eventId: 4,
          eventTime: "2026-11-23T10:00:00.000Z",
          eventType: "WorkflowTaskCompleted",
          offsetMs: 0,
        },
        {
          attributes: {
            deploymentVersion: { buildId: "v2", deploymentName: "billing" },
          },
          eventId: 9,
          eventTime: "2026-11-23T10:00:01.000Z",
          eventType: "WorkflowTaskCompleted",
          offsetMs: 1000,
        },
      ]),
    ).toBe("billing:v2");

    expect(extractRunBuildId([])).toBeUndefined();
  });

  it("reads the Build ID that SDK Workers without Worker Versioning report", () => {
    expect(
      extractRunBuildId([
        {
          attributes: { workerVersion: { buildId: "929c37c5df16" } },
          eventId: 4,
          eventTime: "2026-11-23T10:00:00.000Z",
          eventType: "WorkflowTaskCompleted",
          offsetMs: 0,
        },
      ]),
    ).toBe("929c37c5df16");
  });
});
