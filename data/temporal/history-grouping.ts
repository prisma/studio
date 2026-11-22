import type {
  TemporalExecutionDetail,
  TemporalFailureInfo,
  TemporalGroupedSpan,
  TemporalHistoryEvent,
  TemporalPendingActivity,
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
} from "./types";

interface RawTimestamp {
  nanos?: number | string | null;
  seconds?: number | string | { low?: number; toNumber?: () => number } | null;
}

interface RawPayload {
  data?: Uint8Array | Buffer | string | null;
  metadata?: Record<string, Uint8Array | Buffer | string> | null;
}

interface RawPayloads {
  payloads?: RawPayload[] | null;
}

interface RawFailure {
  applicationFailureInfo?: { type?: string | null } | null;
  cause?: RawFailure | null;
  message?: string | null;
  source?: string | null;
  stackTrace?: string | null;
}

export function decodeTimestampIso(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const ts = value as RawTimestamp;
    let seconds = 0;

    if (typeof ts.seconds === "number") {
      seconds = ts.seconds;
    } else if (typeof ts.seconds === "string") {
      seconds = Number.parseInt(ts.seconds, 10) || 0;
    } else if (
      ts.seconds &&
      typeof ts.seconds === "object" &&
      typeof ts.seconds.toNumber === "function"
    ) {
      seconds = ts.seconds.toNumber();
    } else if (
      ts.seconds &&
      typeof ts.seconds === "object" &&
      typeof ts.seconds.low === "number"
    ) {
      seconds = ts.seconds.low;
    }

    const nanos =
      typeof ts.nanos === "number"
        ? ts.nanos
        : typeof ts.nanos === "string"
          ? Number.parseInt(ts.nanos, 10) || 0
          : 0;

    if (seconds === 0 && nanos === 0) {
      return undefined;
    }

    const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
    return new Date(ms).toISOString();
  }

  return undefined;
}

function toUtf8String(
  value: Uint8Array | Buffer | string | null | undefined,
): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    // Protobuf JSON encodes `bytes` as base64.
    try {
      if (typeof Buffer !== "undefined") {
        return Buffer.from(value, "base64").toString("utf8");
      }
      return atob(value);
    } catch {
      return value;
    }
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return new TextDecoder().decode(value);
}

export function decodeSinglePayload(
  payload: RawPayload | null | undefined,
): unknown {
  if (!payload) {
    return undefined;
  }

  const encodingRaw = payload.metadata?.encoding;
  const encoding = encodingRaw ? toUtf8String(encodingRaw) : "";

  if (encoding === "binary/null") {
    return null;
  }

  if (payload.data == null) {
    return undefined;
  }

  const text = toUtf8String(payload.data);

  if (
    encoding === "json/plain" ||
    encoding === "" ||
    text.startsWith("{") ||
    text.startsWith("[")
  ) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
}

export function decodePayloads(
  container: RawPayloads | null | undefined,
): unknown {
  const list = container?.payloads;

  if (!list || list.length === 0) {
    return undefined;
  }

  const decoded = list.map((item) => decodeSinglePayload(item));
  return decoded.length === 1 ? decoded[0] : decoded;
}

export function decodePayloadMap(
  fields: Record<string, RawPayload> | null | undefined,
): Record<string, unknown> {
  if (!fields) {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    result[key] = decodeSinglePayload(value);
  }

  return result;
}

export function decodeFailure(
  failure: RawFailure | null | undefined,
): TemporalFailureInfo | undefined {
  if (!failure) {
    return undefined;
  }

  return {
    message: failure.message || "Unknown failure",
    ...(failure.source ? { source: failure.source } : {}),
    ...(failure.stackTrace ? { stackTrace: failure.stackTrace } : {}),
    ...(failure.applicationFailureInfo?.type
      ? { type: failure.applicationFailureInfo.type }
      : {}),
    ...(failure.cause ? { cause: decodeFailure(failure.cause) } : {}),
  };
}

export function normalizeWorkflowStatus(raw: unknown): TemporalWorkflowStatus {
  if (typeof raw === "number") {
    switch (raw) {
      case 1:
        return "Running";
      case 2:
        return "Completed";
      case 3:
        return "Failed";
      case 4:
        return "Canceled";
      case 5:
        return "Terminated";
      case 6:
        return "ContinuedAsNew";
      case 7:
        return "TimedOut";
      default:
        return "Unspecified";
    }
  }

  if (typeof raw === "string") {
    const cleaned = raw
      .replace(/^WORKFLOW_EXECUTION_STATUS_/, "")
      .toUpperCase();
    switch (cleaned) {
      case "RUNNING":
        return "Running";
      case "COMPLETED":
        return "Completed";
      case "FAILED":
        return "Failed";
      case "CANCELED":
      case "CANCELLED":
        return "Canceled";
      case "TERMINATED":
        return "Terminated";
      case "CONTINUED_AS_NEW":
      case "CONTINUEDASNEW":
        return "ContinuedAsNew";
      case "TIMED_OUT":
      case "TIMEDOUT":
        return "TimedOut";
      default:
        return "Unspecified";
    }
  }

  return "Unspecified";
}

function toNumericId(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number.parseInt(value, 10) || 0;
  }
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber?: () => number }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function summarizePayload(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const str = typeof value === "string" ? value : JSON.stringify(value);
    if (!str) {
      return undefined;
    }
    return str.length > 96 ? `${str.slice(0, 93)}...` : str;
  } catch {
    return String(value);
  }
}

function extractEventAttributes(raw: Record<string, unknown>): {
  attributes: Record<string, unknown>;
  attrKey: string;
} {
  for (const [key, value] of Object.entries(raw)) {
    if (key.endsWith("EventAttributes") && value && typeof value === "object") {
      return { attributes: value as Record<string, unknown>, attrKey: key };
    }
  }
  return { attributes: {}, attrKey: "" };
}

function eventTypeFromAttrKey(attrKey: string, rawType: unknown): string {
  if (typeof rawType === "string" && rawType.length > 0) {
    return rawType.replace(/^EVENT_TYPE_/, "");
  }
  if (attrKey.endsWith("EventAttributes")) {
    return attrKey.slice(0, -"EventAttributes".length);
  }
  return String(rawType ?? "Unknown");
}

function normalizeEventTypeName(name: string): string {
  if (!name.includes("_")) {
    return name;
  }
  return name
    .toLowerCase()
    .split("_")
    .map((part) => (part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : ""))
    .join("");
}

/**
 * Converts a workflow execution + raw Temporal history events into structured
 * grouped spans, normalized raw events, decoded input/result/failure, and
 * timeline bounds suitable for Prisma Studio's Execution Debugger.
 */
export function buildExecutionDetail(args: {
  execution: TemporalWorkflowExecution;
  nowMs?: number;
  rawEvents: Record<string, unknown>[];
}): TemporalExecutionDetail {
  const { execution, rawEvents, nowMs = Date.now() } = args;
  const startMs = Date.parse(execution.startTime) || nowMs;
  const closeMs = execution.closeTime ? Date.parse(execution.closeTime) : nowMs;
  const totalDurationMs = Math.max(1, closeMs - startMs);

  let workflowInput: unknown;
  let workflowResult: unknown;
  let workflowFailure: TemporalFailureInfo | undefined;

  const normalizedRawEvents: TemporalHistoryEvent[] = [];
  const spans: TemporalGroupedSpan[] = [];

  const activityByScheduledId = new Map<number, TemporalGroupedSpan>();
  const timerByStartedId = new Map<number, TemporalGroupedSpan>();
  const childByInitiatedId = new Map<number, TemporalGroupedSpan>();
  const updateByAcceptedId = new Map<number, TemporalGroupedSpan>();

  for (const raw of rawEvents) {
    const eventId = toNumericId(raw.eventId);
    const eventTime = decodeTimestampIso(raw.eventTime) ?? execution.startTime;
    const eventMs = Date.parse(eventTime) || startMs;
    const offsetMs = Math.max(0, eventMs - startMs);
    const { attributes, attrKey } = extractEventAttributes(raw);
    const eventType = normalizeEventTypeName(
      eventTypeFromAttrKey(attrKey, raw.eventType),
    );

    normalizedRawEvents.push({
      attributes,
      eventId,
      eventTime,
      eventType,
      offsetMs,
      ...(raw.taskId != null ? { taskId: String(raw.taskId) } : {}),
    });

    if (eventType === "WorkflowExecutionStarted") {
      workflowInput = decodePayloads(
        attributes.input as RawPayloads | undefined,
      );
    } else if (eventType === "WorkflowExecutionCompleted") {
      workflowResult = decodePayloads(
        attributes.result as RawPayloads | undefined,
      );
    } else if (eventType === "WorkflowExecutionFailed") {
      workflowFailure = decodeFailure(
        attributes.failure as RawFailure | undefined,
      );
    } else if (eventType === "WorkflowExecutionTerminated") {
      const reason =
        typeof attributes.reason === "string" && attributes.reason.length > 0
          ? attributes.reason
          : "Workflow terminated";
      workflowFailure = { message: reason, type: "Terminated" };
    } else if (eventType === "ActivityTaskScheduled") {
      const actType =
        (attributes.activityType as { name?: string } | undefined)?.name ??
        "Activity";
      const actId =
        typeof attributes.activityId === "string"
          ? attributes.activityId
          : String(eventId);
      const input = decodePayloads(attributes.input as RawPayloads | undefined);
      const span: TemporalGroupedSpan = {
        activityId: actId,
        attempt: 1,
        durationMs: 1,
        eventIds: [eventId],
        id: `act-${eventId}`,
        input,
        kind: "activity",
        label: actType,
        startOffsetMs: offsetMs,
        startedEventId: eventId,
        status: "running",
        summary: summarizePayload(input),
        taskQueue: (attributes.taskQueue as { name?: string } | undefined)
          ?.name,
        timestamp: eventTime,
      };
      activityByScheduledId.set(eventId, span);
      spans.push(span);
    } else if (eventType === "ActivityTaskStarted") {
      const scheduledId = toNumericId(attributes.scheduledEventId);
      const span = activityByScheduledId.get(scheduledId);
      if (span) {
        span.eventIds.push(eventId);
        span.queueWaitMs = Math.max(0, offsetMs - span.startOffsetMs);
        if (typeof attributes.attempt === "number" && attributes.attempt > 0) {
          span.attempt = attributes.attempt;
        }
        const lastFailure = decodeFailure(
          attributes.lastFailure as RawFailure | undefined,
        );
        if (lastFailure) {
          span.error = lastFailure;
        }
      }
    } else if (
      eventType === "ActivityTaskCompleted" ||
      eventType === "ActivityTaskFailed" ||
      eventType === "ActivityTaskTimedOut" ||
      eventType === "ActivityTaskCanceled"
    ) {
      const scheduledId = toNumericId(attributes.scheduledEventId);
      const span = activityByScheduledId.get(scheduledId);
      if (span) {
        span.eventIds.push(eventId);
        span.closedEventId = eventId;
        span.durationMs = Math.max(1, offsetMs - span.startOffsetMs);
        if (eventType === "ActivityTaskCompleted") {
          span.status = "completed";
          span.output = decodePayloads(
            attributes.result as RawPayloads | undefined,
          );
          span.summary = summarizePayload(span.output) ?? span.summary;
        } else if (eventType === "ActivityTaskFailed") {
          span.status = "failed";
          span.error = decodeFailure(
            attributes.failure as RawFailure | undefined,
          );
          span.summary = span.error?.message ?? "Activity failed";
        } else if (eventType === "ActivityTaskTimedOut") {
          span.status = "timed-out";
          span.error = decodeFailure(
            attributes.failure as RawFailure | undefined,
          ) ?? {
            message: "Activity timed out",
            type: "Timeout",
          };
          span.summary = span.error.message;
        } else {
          span.status = "canceled";
          span.summary = "Activity canceled";
        }
      }
    } else if (eventType === "TimerStarted") {
      const timerId =
        typeof attributes.timerId === "string"
          ? attributes.timerId
          : `#${eventId}`;
      const span: TemporalGroupedSpan = {
        durationMs: Math.max(1, totalDurationMs - offsetMs),
        eventIds: [eventId],
        id: `timer-${eventId}`,
        kind: "timer",
        label: `Timer: ${timerId}`,
        startOffsetMs: offsetMs,
        startedEventId: eventId,
        status: "running",
        summary: "Waiting for timer",
        timestamp: eventTime,
      };
      timerByStartedId.set(eventId, span);
      spans.push(span);
    } else if (eventType === "TimerFired" || eventType === "TimerCanceled") {
      const startedId = toNumericId(attributes.startedEventId);
      const span = timerByStartedId.get(startedId);
      if (span) {
        span.eventIds.push(eventId);
        span.closedEventId = eventId;
        span.durationMs = Math.max(1, offsetMs - span.startOffsetMs);
        span.status = eventType === "TimerFired" ? "fired" : "canceled";
        span.summary =
          eventType === "TimerFired" ? "Fired on schedule" : "Canceled";
      }
    } else if (eventType === "StartChildWorkflowExecutionInitiated") {
      const childType =
        (attributes.workflowType as { name?: string } | undefined)?.name ??
        "ChildWorkflow";
      const childWfId =
        typeof attributes.workflowId === "string" ? attributes.workflowId : "";
      const input = decodePayloads(attributes.input as RawPayloads | undefined);
      const span: TemporalGroupedSpan = {
        childWorkflowId: childWfId,
        durationMs: Math.max(1, totalDurationMs - offsetMs),
        eventIds: [eventId],
        id: `child-${eventId}`,
        input,
        kind: "child-workflow",
        label: `Child: ${childType}`,
        startOffsetMs: offsetMs,
        startedEventId: eventId,
        status: "running",
        summary: childWfId || summarizePayload(input),
        timestamp: eventTime,
      };
      childByInitiatedId.set(eventId, span);
      spans.push(span);
    } else if (eventType === "ChildWorkflowExecutionStarted") {
      const initiatedId = toNumericId(attributes.initiatedEventId);
      const span = childByInitiatedId.get(initiatedId);
      if (span) {
        span.eventIds.push(eventId);
        const exec = attributes.workflowExecution as
          { runId?: string; workflowId?: string } | undefined;
        if (exec?.runId) {
          span.childRunId = exec.runId;
        }
        if (exec?.workflowId) {
          span.childWorkflowId = exec.workflowId;
        }
      }
    } else if (
      eventType === "ChildWorkflowExecutionCompleted" ||
      eventType === "ChildWorkflowExecutionFailed" ||
      eventType === "ChildWorkflowExecutionCanceled" ||
      eventType === "ChildWorkflowExecutionTimedOut" ||
      eventType === "ChildWorkflowExecutionTerminated"
    ) {
      const initiatedId = toNumericId(attributes.initiatedEventId);
      const span = childByInitiatedId.get(initiatedId);
      if (span) {
        span.eventIds.push(eventId);
        span.closedEventId = eventId;
        span.durationMs = Math.max(1, offsetMs - span.startOffsetMs);
        if (eventType === "ChildWorkflowExecutionCompleted") {
          span.status = "completed";
          span.output = decodePayloads(
            attributes.result as RawPayloads | undefined,
          );
        } else if (eventType === "ChildWorkflowExecutionFailed") {
          span.status = "failed";
          span.error = decodeFailure(
            attributes.failure as RawFailure | undefined,
          );
        } else if (eventType === "ChildWorkflowExecutionTimedOut") {
          span.status = "timed-out";
        } else {
          span.status = "canceled";
        }
      }
    } else if (eventType === "WorkflowExecutionSignaled") {
      const signalName =
        typeof attributes.signalName === "string"
          ? attributes.signalName
          : "signal";
      const input = decodePayloads(attributes.input as RawPayloads | undefined);
      spans.push({
        closedEventId: eventId,
        durationMs: 1,
        eventIds: [eventId],
        id: `sig-${eventId}`,
        input,
        kind: "signal",
        label: `Signal: ${signalName}`,
        startOffsetMs: offsetMs,
        startedEventId: eventId,
        status: "completed",
        summary: summarizePayload(input),
        timestamp: eventTime,
      });
    } else if (eventType === "WorkflowExecutionUpdateAccepted") {
      const req = attributes.acceptedRequest as
        { input?: { args?: RawPayloads; name?: string } } | undefined;
      const updateName = req?.input?.name ?? "update";
      const input = decodePayloads(req?.input?.args);
      const span: TemporalGroupedSpan = {
        durationMs: 1,
        eventIds: [eventId],
        id: `upd-${eventId}`,
        input,
        kind: "update",
        label: `Update: ${updateName}`,
        startOffsetMs: offsetMs,
        startedEventId: eventId,
        status: "running",
        summary: summarizePayload(input),
        timestamp: eventTime,
      };
      updateByAcceptedId.set(eventId, span);
      spans.push(span);
    } else if (eventType === "WorkflowExecutionUpdateCompleted") {
      const acceptedId = toNumericId(attributes.acceptedEventId);
      const span = updateByAcceptedId.get(acceptedId);
      if (span) {
        span.eventIds.push(eventId);
        span.closedEventId = eventId;
        span.durationMs = Math.max(1, offsetMs - span.startOffsetMs);
        const outcome = attributes.outcome as
          { failure?: RawFailure; success?: RawPayloads } | undefined;
        if (outcome?.failure) {
          span.status = "failed";
          span.error = decodeFailure(outcome.failure);
          span.summary = span.error?.message;
        } else {
          span.status = "completed";
          span.output = decodePayloads(outcome?.success);
          span.summary = summarizePayload(span.output) ?? span.summary;
        }
      }
    }
  }

  // Merge live pending activity state (retries, last failure, next attempt countdown)
  const pendingByActivityId = new Map<string, TemporalPendingActivity>();
  for (const pending of execution.pendingActivities ?? []) {
    pendingByActivityId.set(pending.activityId, pending);
  }

  for (const span of spans) {
    if (
      span.kind === "activity" &&
      span.status === "running" &&
      span.activityId
    ) {
      const pending = pendingByActivityId.get(span.activityId);
      span.durationMs = Math.max(1, totalDurationMs - span.startOffsetMs);
      if (pending) {
        span.attempt = Math.max(span.attempt ?? 1, pending.attempt);
        span.nextAttemptScheduleTime = pending.nextAttemptScheduleTime;
        if (pending.lastFailure) {
          span.status = "retrying";
          span.error = pending.lastFailure;
          span.summary = `Attempt ${pending.attempt}${pending.maximumAttempts > 0 ? `/${pending.maximumAttempts}` : ""} · ${pending.lastFailure.message}`;
        }
      }
    }
  }

  return {
    execution,
    ...(workflowFailure ? { failure: workflowFailure } : {}),
    ...(workflowInput !== undefined ? { input: workflowInput } : {}),
    rawEvents: normalizedRawEvents,
    rawHistoryJson: { events: rawEvents },
    ...(workflowResult !== undefined ? { result: workflowResult } : {}),
    spans,
    totalDurationMs,
  };
}
