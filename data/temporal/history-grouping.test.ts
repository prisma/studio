import { describe, expect, it } from "vitest";

import {
  buildExecutionDetail,
  buildExecutionDetailFromHistory,
  decodePayloads,
  normalizeWorkflowStatus,
  toProto3Json,
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
          timerStartedEventAttributes: {
            startToFireTimeout: { nanos: 500_000_000, seconds: 4 },
            timerId: "fraudHoldTimer",
          },
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
    expect(detail.rawEvents[0]?.attributes).toEqual({
      input: { amountCents: 25000 },
    });
    expect(detail.rawEvents[1]?.attributes).toEqual({
      activityId: "1",
      activityType: { name: "withdrawFunds" },
      input: { from: "acct_1" },
      taskQueue: { name: "billing" },
    });
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
    // How long the Workflow asked the Timer to wait.
    expect(timer?.timerMs).toBe(4_500);
    expect(timer?.label).toBe("Timer 4.5s");

    expect(deposit?.label).toBe("depositFunds");
    expect(deposit?.status).toBe("retrying");
    expect(deposit?.attempt).toBe(4);
    expect(deposit?.error?.message).toBe("BankGateway503");
  });
  it("keeps why an Activity failed for good: the type, the non-retryable mark and the retry state", () => {
    const detail = buildExecutionDetail({
      execution: {
        durationMs: 1_000,
        historyLength: 3,
        historySizeBytes: 100,
        memo: {},
        namespace: "default",
        runId: "run-1",
        searchAttributes: {},
        startTime: "2026-11-22T10:00:00.000Z",
        status: "Running",
        taskQueue: "billing",
        workflowId: "sub-1",
        workflowType: "subscriptionBilling",
      },
      rawEvents: [
        {
          activityTaskScheduledEventAttributes: {
            activityType: { name: "chargeSubscription" },
          },
          eventId: 5,
          eventTime: "2026-11-22T10:00:00.100Z",
          eventType: "EVENT_TYPE_ACTIVITY_TASK_SCHEDULED",
        },
        {
          activityTaskFailedEventAttributes: {
            failure: {
              applicationFailureInfo: {
                details: { payloads: [jsonPayload({ card: "card_0005" })] },
                nonRetryable: true,
                type: "CardExpired",
              },
              message: "payment method card_0005 expired",
              stackTrace: "at chargeSubscription (/app/activities.ts:171:32)",
            },
            retryState: "RETRY_STATE_NON_RETRYABLE_FAILURE",
            scheduledEventId: 5,
          },
          eventId: 7,
          eventTime: "2026-11-22T10:00:00.500Z",
          eventType: "EVENT_TYPE_ACTIVITY_TASK_FAILED",
        },
      ],
    });

    expect(detail.spans[0]!.error).toEqual({
      details: { card: "card_0005" },
      isNonRetryable: true,
      message: "payment method card_0005 expired",
      retryState: "NON_RETRYABLE_FAILURE",
      stackTrace: "at chargeSubscription (/app/activities.ts:171:32)",
      type: "CardExpired",
    });
  });

  it("does not call a Timer or an Activity running once the run has closed", () => {
    const detail = buildExecutionDetail({
      execution: {
        closeTime: "2026-11-22T10:03:00.000Z",
        durationMs: 180_000,
        historyLength: 4,
        historySizeBytes: 512,
        memo: {},
        namespace: "default",
        runId: "run-1",
        searchAttributes: {},
        startTime: "2026-11-22T10:00:00.000Z",
        status: "TimedOut",
        taskQueue: "shipping",
        workflowId: "shipment-1",
        workflowType: "shipment",
      },
      nowMs: Date.parse("2026-11-22T12:00:00.000Z"),
      rawEvents: [
        {
          eventId: 1,
          eventTime: "2026-11-22T10:00:00.000Z",
          eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED",
          workflowExecutionStartedEventAttributes: {},
        },
        {
          eventId: 5,
          eventTime: "2026-11-22T10:00:01.000Z",
          eventType: "EVENT_TYPE_TIMER_STARTED",
          timerStartedEventAttributes: { timerId: "1" },
        },
        {
          eventId: 6,
          eventTime: "2026-11-22T10:00:02.000Z",
          eventType: "EVENT_TYPE_ACTIVITY_TASK_SCHEDULED",
          activityTaskScheduledEventAttributes: {
            activityId: "1",
            activityType: { name: "trackPackage" },
          },
        },
        {
          eventId: 7,
          eventTime: "2026-11-22T10:03:00.000Z",
          eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT",
          workflowExecutionTimedOutEventAttributes: {},
        },
      ],
    });

    expect(
      detail.spans.map((span) => [span.label, span.status, span.summary]),
    ).toEqual([
      ["Timer: 1", "canceled", "Open when the run closed"],
      ["trackPackage", "canceled", "Open when the run closed"],
    ]);
  });

  it("reads the run chain, the summary and the details from the history", () => {
    const execution: TemporalWorkflowExecution = {
      durationMs: 5_000,
      historyLength: 2,
      historySizeBytes: 100,
      memo: {},
      namespace: "default",
      runId: "run-2",
      searchAttributes: {},
      startTime: "2026-11-22T10:00:00.000Z",
      status: "ContinuedAsNew",
      taskQueue: "billing",
      workflowId: "sub-1",
      workflowType: "subscriptionBilling",
    };
    const detail = buildExecutionDetail({
      execution,
      rawEvents: [
        {
          eventId: 1,
          eventTime: "2026-11-22T10:00:00.000Z",
          eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED",
          userMetadata: {
            details: jsonPayload("Renews every month."),
            summary: jsonPayload("Subscription of Ada"),
          },
          workflowExecutionStartedEventAttributes: {
            continuedExecutionRunId: "run-1",
            firstExecutionRunId: "run-1",
          },
        },
        {
          eventId: 2,
          eventTime: "2026-11-22T10:00:05.000Z",
          eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW",
          workflowExecutionContinuedAsNewEventAttributes: {
            newExecutionRunId: "run-3",
          },
        },
      ],
    });

    expect(detail.chain).toEqual({
      firstRunId: "run-1",
      nextRunId: "run-3",
      previousRunId: "run-1",
    });
    expect(detail.summary).toBe("Subscription of Ada");
    expect(detail.details).toBe("Renews every month.");
  });

  it("marks a payload that a codec wrote and nothing decoded", () => {
    expect(
      decodePayloads({
        payloads: [
          {
            data: Buffer.from("sealed-bytes"),
            metadata: { encoding: Buffer.from("binary/encrypted") },
          },
        ],
      }),
    ).toEqual({
      $encodedPayload: { encoding: "binary/encrypted", sizeBytes: 12 },
    });
  });
  it("writes timestamps and durations in proto3 JSON form for history export", () => {
    expect(
      toProto3Json({
        eventTime: { nanos: 164293000, seconds: "1795372937" },
        workflowExecutionStartedEventAttributes: {
          attempt: 1,
          workflowRunTimeout: { seconds: 180 },
          workflowTaskTimeout: { nanos: 500000000, seconds: 10 },
        },
      }),
    ).toEqual({
      eventTime: "2026-11-22T18:42:17.164293000Z",
      workflowExecutionStartedEventAttributes: {
        attempt: 1,
        workflowRunTimeout: "180s",
        workflowTaskTimeout: "10.5s",
      },
    });
  });

  it("writes a zero duration as a string, so the SDK replayers accept the export", () => {
    // protobuf.js drops the fields of a zero Duration and leaves an empty object.
    expect(
      toProto3Json({
        activityTaskScheduledEventAttributes: {
          header: {},
          heartbeatTimeout: {},
          retryPolicy: { initialInterval: {}, maximumInterval: { seconds: 5 } },
          scheduleToStartTimeout: {},
        },
        workflowExecutionStartedEventAttributes: {
          firstWorkflowTaskBackoff: {},
        },
      }),
    ).toEqual({
      activityTaskScheduledEventAttributes: {
        header: {},
        heartbeatTimeout: "0s",
        retryPolicy: { initialInterval: "0s", maximumInterval: "5s" },
        scheduleToStartTimeout: "0s",
      },
      workflowExecutionStartedEventAttributes: {
        firstWorkflowTaskBackoff: "0s",
      },
    });
  });

  it("builds a run from a history file in the Temporal CLI's JSON form", () => {
    const base64 = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64");
    const detail = buildExecutionDetailFromHistory({
      history: {
        events: [
          {
            eventId: "1",
            eventTime: "2026-11-22T10:00:00Z",
            eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED",
            workflowExecutionStartedEventAttributes: {
              input: {
                payloads: [
                  {
                    data: base64({ orderId: "o-1" }),
                    metadata: {
                      encoding: Buffer.from("json/plain").toString("base64"),
                    },
                  },
                ],
              },
              originalExecutionRunId: "run-9",
              taskQueue: { name: "orders" },
              workflowType: { name: "orderFulfillment" },
            },
          },
          {
            eventId: "2",
            eventTime: "2026-11-22T10:00:04Z",
            eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_FAILED",
            workflowExecutionFailedEventAttributes: {
              failure: { message: "card declined" },
            },
          },
        ],
      },
      workflowId: "order-from-file",
    });

    expect(detail.execution).toMatchObject({
      durationMs: 4_000,
      runId: "run-9",
      status: "Failed",
      taskQueue: "orders",
      workflowId: "order-from-file",
      workflowType: "orderFulfillment",
    });
    expect(detail.input).toEqual({ orderId: "o-1" });
    expect(detail.failure?.message).toBe("card declined");
    expect(() =>
      buildExecutionDetailFromHistory({ history: {}, workflowId: "x" }),
    ).toThrow("The file holds no history events.");
  });
});
