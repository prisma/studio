import * as proto from "@temporalio/proto";

import {
  decodePayloads,
  decodeTimestampIso,
} from "../../data/temporal/history-grouping";
import type {
  TemporalScheduleOverlapPolicy,
  TemporalScheduleRecentAction,
  TemporalScheduleSummary,
} from "../../data/temporal/types";

const enums = proto.temporal.api.enums.v1;

export function decodeDurationSeconds(
  dur?: {
    nanos?: number;
    seconds?: number | { toNumber?: () => number };
  } | null,
): number | undefined {
  if (!dur) return undefined;
  const s =
    typeof dur.seconds === "number"
      ? dur.seconds
      : typeof dur.seconds === "object" && dur.seconds?.toNumber
        ? dur.seconds.toNumber()
        : 0;
  return s > 0 ? s : undefined;
}

export function overlapPolicyToEnum(
  policy: TemporalScheduleOverlapPolicy,
): number {
  switch (policy) {
    case "BUFFER_ONE":
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_BUFFER_ONE;
    case "BUFFER_ALL":
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_BUFFER_ALL;
    case "CANCEL_OTHER":
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_CANCEL_OTHER;
    case "TERMINATE_OTHER":
      return enums.ScheduleOverlapPolicy
        .SCHEDULE_OVERLAP_POLICY_TERMINATE_OTHER;
    case "ALLOW_ALL":
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_ALLOW_ALL;
    default:
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_SKIP;
  }
}

export function enumToOverlapPolicy(
  value?: number | null,
): TemporalScheduleOverlapPolicy {
  switch (value) {
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_BUFFER_ONE:
      return "BUFFER_ONE";
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_BUFFER_ALL:
      return "BUFFER_ALL";
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_CANCEL_OTHER:
      return "CANCEL_OTHER";
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_TERMINATE_OTHER:
      return "TERMINATE_OTHER";
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_ALLOW_ALL:
      return "ALLOW_ALL";
    default:
      return "SKIP";
  }
}

export function formatScheduleSpecSummary(
  spec?: proto.temporal.api.schedule.v1.IScheduleSpec | null,
): string {
  if (!spec) return "Custom schedule";
  if (spec.cronString && spec.cronString.length > 0) {
    return `Cron ${spec.cronString[0]}`;
  }
  if (spec.interval && spec.interval.length > 0) {
    const secs = decodeDurationSeconds(spec.interval[0]?.interval as never);
    if (secs) {
      if (secs % 86400 === 0) return `Every ${secs / 86400}d`;
      if (secs % 3600 === 0) return `Every ${secs / 3600}h`;
      if (secs % 60 === 0) return `Every ${secs / 60}m`;
      return `Every ${secs}s`;
    }
  }
  if (spec.structuredCalendar && spec.structuredCalendar.length > 0) {
    return "Calendar spec";
  }
  return "Custom schedule";
}

const CRON_FIELD_BOUNDS = {
  dayOfMonth: [1, 31],
  dayOfWeek: [0, 6],
  hour: [0, 23],
  minute: [0, 59],
  month: [1, 12],
} as const;

/**
 * Writes a structured calendar as the five-field cron expression it came from.
 * Returns undefined for a calendar that five fields cannot express (seconds
 * other than 0, or a year).
 */
export function structuredCalendarToCron(
  calendar:
    proto.temporal.api.schedule.v1.IStructuredCalendarSpec | null | undefined,
): string | undefined {
  if (!calendar) {
    return undefined;
  }

  const seconds = calendar.second ?? [];
  const onlySecondZero =
    seconds.length === 0 ||
    (seconds.length === 1 &&
      (seconds[0]!.start ?? 0) === 0 &&
      (seconds[0]!.end ?? 0) === 0);

  if (!onlySecondZero || (calendar.year ?? []).length > 0) {
    return undefined;
  }

  const field = (name: keyof typeof CRON_FIELD_BOUNDS): string => {
    const [min, max] = CRON_FIELD_BOUNDS[name];
    const ranges = calendar[name] ?? [];

    if (ranges.length === 0) {
      // An absent field means its lowest value, except day of week, which means every day.
      return name === "dayOfWeek" ? "*" : String(min);
    }

    return ranges
      .map((range) => {
        const start = range.start ?? 0;
        const end = Math.max(range.end ?? 0, start);
        const step = range.step && range.step > 1 ? range.step : 1;
        const span =
          start === min && end === max
            ? "*"
            : start === end
              ? String(start)
              : `${start}-${end}`;

        return step > 1 ? `${span}/${step}` : span;
      })
      .join(",");
  };

  return [
    field("minute"),
    field("hour"),
    field("dayOfMonth"),
    field("month"),
    field("dayOfWeek"),
  ].join(" ");
}

export function mapScheduleSummary(
  scheduleId: string,
  desc: proto.temporal.api.workflowservice.v1.DescribeScheduleResponse,
): TemporalScheduleSummary {
  const sched = desc.schedule;
  const info = desc.info;
  const startWf = sched?.action?.startWorkflow;
  const recentActions: TemporalScheduleRecentAction[] = (
    info?.recentActions ?? []
  ).map((a) => ({
    actualTime: decodeTimestampIso(a.actualTime as never) || undefined,
    runId: a.startWorkflowResult?.runId || undefined,
    scheduleTime: decodeTimestampIso(a.scheduleTime as never) || undefined,
    workflowId: a.startWorkflowResult?.workflowId || undefined,
  }));

  const intervalSeconds = sched?.spec?.interval?.[0]
    ? decodeDurationSeconds(sched.spec.interval[0].interval as never)
    : undefined;
  // A standard server stores a cron string as a structured calendar and returns that.
  const cronExpression =
    sched?.spec?.cronString?.[0] ||
    structuredCalendarToCron(sched?.spec?.structuredCalendar?.[0]) ||
    undefined;

  return {
    actionCount: Number(info?.actionCount ?? 0),
    cadenceSummary: cronExpression
      ? `Cron ${cronExpression}`
      : formatScheduleSpecSummary(sched?.spec),
    cronExpression,
    intervalSeconds,
    lastAction: recentActions[recentActions.length - 1],
    missedCatchupWindow: Number(info?.missedCatchupWindow ?? 0),
    nextActionTimes: (info?.futureActionTimes ?? [])
      .map((t) => decodeTimestampIso(t as never))
      .filter((s): s is string => typeof s === "string" && s.length > 0),
    notes: sched?.state?.notes || undefined,
    overlapPolicy: enumToOverlapPolicy(sched?.policies?.overlapPolicy),
    overlapSkipped: Number(info?.overlapSkipped ?? 0),
    paused: Boolean(sched?.state?.paused),
    recentActions,
    remainingActions: sched?.state?.limitedActions
      ? Number(sched.state.remainingActions ?? 0)
      : undefined,
    runningWorkflows: (info?.runningWorkflows ?? []).map((rw) => ({
      runId: rw.runId || "",
      workflowId: rw.workflowId || "",
    })),
    scheduleId,
    taskQueue: startWf?.taskQueue?.name || "default",
    ...(sched?.spec?.timezoneName ? { timezone: sched.spec.timezoneName } : {}),
    workflowArgs: decodePayloads(startWf?.input as never),
    workflowIdPrefix: startWf?.workflowId || undefined,
    workflowType: startWf?.workflowType?.name || "Unknown",
  };
}
