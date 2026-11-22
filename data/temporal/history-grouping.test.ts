import { describe, expect, it } from "vitest";

import {
  buildExecutionDetail,
  decodePayloads,
  normalizeWorkflowStatus,
} from "./history-grouping";
import type { TemporalWorkflowExecution } from "./types";

function jsonPayload(value: unknown) {
  return {
    data: Buffer.from(JSON.stringify(value), "utf8"),
    metadata: {
      encoding: Buffer.from("json/plain", "utf8"),
    },
  };
}

describe("Temporal history grouping & payload decoding", () => {
  it("normalizes numeric and enum-string workflow statuses", () => {
    expect(normalizeWorkflowStatus(1)).toBe("Running");
    expect(normalizeWorkflowStatus(3)).toBe("Failed");
    expect(normalizeWorkflowStatus("WORKFLOW_EXECUTION_STATUS_COMPLETED")).toBe(
      "Completed",
    );
    expect(normalizeWorkflowStatus("TIMED_OUT")).toBe("TimedOut");
  });

  it("decodes single and multi-argument json/plain payloads", () => {
    expect(
      decodePayloads({ payloads: [jsonPayload({ orderId: "o-1" })] }),
    ).toEqual({
      orderId: "o-1",
    });
    expect(
      decodePayloads({
        payloads: [jsonPayload("a"), jsonPayload(42)],
      }),
    ).toEqual(["a", 42]);
  });

  it("groups activity triplets, timers, signals, and merges retrying pending activities", () => {
    const startTime = "2026-11-22T10:00:00.000Z";
    const execution: TemporalWorkflowExecution = {
      durationMs: 12_000,
      historyLength: 10,
      historySizeBytes: 2048,
      memo: { owner: "billing" },
      namespace: "default",
      pendingActivities: [
        {
          activityId: "2",
          activityType: "depositFunds",
          attempt: 4,
          lastFailure: {
            message: "BankGateway503",
            type: "ServiceUnavailable",
          },
          maximumAttempts: 5,
          nextAttemptScheduleTime: "2026-11-22T10:00:18.000Z",
          state: "Scheduled",
        },
      ],
      runId: "run-1",
      searchAttributes: {},
      startTime,
      status: "Running",
      taskQueue: "billing",
      workflowId: "xfer-901",
      workflowType: "MoneyTransfer",
    };

    const detail = buildExecutionDetail({
      execution,
      nowMs: Date.parse("2026-11-22T10:00:12.000Z"),
      rawEvents: [
        {
          eventId: 1,
          eventTime: "2026-11-22T10:00:00.000Z",
          eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED",
          workflowExecutionStartedEventAttributes: {
            input: { payloads: [jsonPayload({ amountCents: 25000 })] },
          },
        },
        {
          eventId: 5,
          eventTime: "2026-11-22T10:00:00.100Z",
          eventType: "EVENT_TYPE_ACTIVITY_TASK_SCHEDULED",
          activityTaskScheduledEventAttributes: {
            activityId: "1",
            activityType: { name: "withdrawFunds" },
            input: { payloads: [jsonPayload({ from: "acct_1" })] },
            taskQueue: { name: "billing" },
          },
        },
        {
          eventId: 6,
          eventTime: "2026-11-22T10:00:00.120Z",
          eventType: "EVENT_TYPE_ACTIVITY_TASK_STARTED",
          activityTaskStartedEventAttributes: {
            attempt: 1,
            scheduledEventId: 5,
          },
        },
        {
          eventId: 7,
          eventTime: "2026-11-22T10:00:00.310Z",
          eventType: "EVENT_TYPE_ACTIVITY_TASK_COMPLETED",
          activityTaskCompletedEventAttributes: {
            result: { payloads: [jsonPayload({ withdrawn: true })] },
            scheduledEventId: 5,
          },
        },
        {
          eventId: 8,
          eventTime: "2026-11-22T10:00:00.350Z",
          eventType: "EVENT_TYPE_TIMER_STARTED",
          timerStartedEventAttributes: { timerId: "fraudHoldTimer" },
        },
        {
          eventId: 9,
          eventTime: "2026-11-22T10:00:05.350Z",
          eventType: "EVENT_TYPE_TIMER_FIRED",
          timerFiredEventAttributes: { startedEventId: 8 },
        },
        {
          eventId: 10,
          eventTime: "2026-11-22T10:00:05.400Z",
          eventType: "EVENT_TYPE_ACTIVITY_TASK_SCHEDULED",
          activityTaskScheduledEventAttributes: {
            activityId: "2",
            activityType: { name: "depositFunds" },
            input: { payloads: [jsonPayload({ to: "acct_2" })] },
            taskQueue: { name: "billing" },
          },
        },
      ],
    });

    expect(detail.input).toEqual({ amountCents: 25000 });
    expect(detail.rawEvents).toHaveLength(7);
    expect(detail.spans).toHaveLength(3);

    const [withdraw, timer, deposit] = detail.spans;
    expect(withdraw?.label).toBe("withdrawFunds");
    expect(withdraw?.status).toBe("completed");
    expect(withdraw?.queueWaitMs).toBe(20);
    expect(withdraw?.durationMs).toBe(210);
    expect(withdraw?.output).toEqual({ withdrawn: true });

    expect(timer?.kind).toBe("timer");
    expect(timer?.status).toBe("fired");
    expect(timer?.durationMs).toBe(5000);

    expect(deposit?.label).toBe("depositFunds");
    expect(deposit?.status).toBe("retrying");
    expect(deposit?.attempt).toBe(4);
    expect(deposit?.error?.message).toBe("BankGateway503");
  });
});
