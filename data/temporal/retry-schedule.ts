import type { TemporalActivityPolicy } from "./types";

export interface ProjectedRetryAttempt {
  atMs: number;
  attempt: number;
  intervalMs: number;
  isFinal?: boolean;
}

export interface ActivityTimeoutBudget {
  elapsedMs: number;
  label: string;
  leftMs: number;
  share: number;
  totalMs: number;
}

export interface ActivityRetryProjection {
  budgets: ActivityTimeoutBudget[];
  deadlineMs?: number;
  givesUpAtMs?: number;
  givesUpReason: "max-attempts" | "schedule-to-close" | "unlimited";
  nextAttemptInMs?: number;
  remainingAttempts: number | null;
  upcoming: ProjectedRetryAttempt[];
}

const DEFAULT_INITIAL_INTERVAL_MS = 1_000;
const DEFAULT_BACKOFF_COEFFICIENT = 2;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function backoffIntervalMs(
  attempt: number,
  policy: TemporalActivityPolicy | undefined,
): number {
  const initial = Math.max(
    1,
    policy?.initialIntervalMs ?? DEFAULT_INITIAL_INTERVAL_MS,
  );
  const coeff = Math.max(
    1,
    policy?.backoffCoefficient ?? DEFAULT_BACKOFF_COEFFICIENT,
  );
  const maxInterval =
    policy?.maximumIntervalMs && policy.maximumIntervalMs > 0
      ? policy.maximumIntervalMs
      : initial * 100;
  // Backoff before attempt `k` (k >= 2) uses exponent `k - 2`.
  const exponent = Math.max(0, attempt - 2);
  return Math.min(maxInterval, Math.round(initial * coeff ** exponent));
}

/**
 * Projects an open or retrying Activity's upcoming retry schedule and active
 * timeout budgets using Temporal's exponential backoff rules.
 */
export function projectActivityRetrySchedule(args: {
  attempt: number;
  expirationTimeIso?: string;
  lastHeartbeatIso?: string;
  lastStartedIso?: string;
  maximumAttempts: number;
  nextAttemptIso?: string;
  nowMs: number;
  paused?: boolean;
  policy?: TemporalActivityPolicy;
  scheduledTimeIso?: string;
  state: "CancelRequested" | "Scheduled" | "Started" | "Unspecified";
  maxUpcoming?: number;
}): ActivityRetryProjection {
  const {
    attempt,
    expirationTimeIso,
    lastHeartbeatIso,
    lastStartedIso,
    maximumAttempts,
    maxUpcoming = 5,
    nextAttemptIso,
    nowMs,
    paused,
    policy,
    scheduledTimeIso,
    state,
  } = args;

  const effectiveMaxAttempts =
    maximumAttempts > 0 ? maximumAttempts : (policy?.maximumAttempts ?? 0);
  const scheduledMs = scheduledTimeIso ? Date.parse(scheduledTimeIso) : NaN;
  const expirationMs = expirationTimeIso ? Date.parse(expirationTimeIso) : NaN;
  const deadlineMs = Number.isFinite(expirationMs)
    ? expirationMs
    : Number.isFinite(scheduledMs) && policy?.scheduleToCloseTimeoutMs
      ? scheduledMs + policy.scheduleToCloseTimeoutMs
      : undefined;

  const budgets: ActivityTimeoutBudget[] = [];

  if (
    policy?.scheduleToCloseTimeoutMs &&
    policy.scheduleToCloseTimeoutMs > 0 &&
    Number.isFinite(scheduledMs)
  ) {
    const totalMs = policy.scheduleToCloseTimeoutMs;
    const elapsedMs = Math.max(0, nowMs - scheduledMs);
    const leftMs = Math.max(0, totalMs - elapsedMs);
    budgets.push({
      elapsedMs,
      label: "Schedule-to-Close",
      leftMs,
      share: clamp01(elapsedMs / totalMs),
      totalMs,
    });
  } else if (deadlineMs !== undefined && Number.isFinite(scheduledMs)) {
    const totalMs = Math.max(1, deadlineMs - scheduledMs);
    const elapsedMs = Math.max(0, nowMs - scheduledMs);
    const leftMs = Math.max(0, deadlineMs - nowMs);
    budgets.push({
      elapsedMs,
      label: "Schedule-to-Close",
      leftMs,
      share: clamp01(elapsedMs / totalMs),
      totalMs,
    });
  }

  if (
    policy?.startToCloseTimeoutMs &&
    policy.startToCloseTimeoutMs > 0 &&
    state === "Started"
  ) {
    const startedMs = lastStartedIso ? Date.parse(lastStartedIso) : NaN;
    if (Number.isFinite(startedMs)) {
      const totalMs = policy.startToCloseTimeoutMs;
      const elapsedMs = Math.max(0, nowMs - startedMs);
      budgets.push({
        elapsedMs,
        label: "Start-to-Close",
        leftMs: Math.max(0, totalMs - elapsedMs),
        share: clamp01(elapsedMs / totalMs),
        totalMs,
      });
    }
  }

  if (
    policy?.heartbeatTimeoutMs &&
    policy.heartbeatTimeoutMs > 0 &&
    state === "Started"
  ) {
    const refMs = lastHeartbeatIso
      ? Date.parse(lastHeartbeatIso)
      : lastStartedIso
        ? Date.parse(lastStartedIso)
        : NaN;
    if (Number.isFinite(refMs)) {
      const totalMs = policy.heartbeatTimeoutMs;
      const elapsedMs = Math.max(0, nowMs - refMs);
      budgets.push({
        elapsedMs,
        label: "Heartbeat",
        leftMs: Math.max(0, totalMs - elapsedMs),
        share: clamp01(elapsedMs / totalMs),
        totalMs,
      });
    }
  }

  const nextScheduledMs = nextAttemptIso ? Date.parse(nextAttemptIso) : NaN;
  const hasExplicitNext = Number.isFinite(nextScheduledMs);
  const firstNextAttempt =
    state === "Scheduled" && hasExplicitNext && nextScheduledMs >= nowMs
      ? attempt
      : attempt + 1;

  const upcoming: ProjectedRetryAttempt[] = [];
  let cursorAttempt = firstNextAttempt;
  let cursorMs =
    hasExplicitNext && nextScheduledMs >= nowMs
      ? nextScheduledMs
      : nowMs + backoffIntervalMs(cursorAttempt, policy);

  if (!paused) {
    // Walk future retries (up to a safe bound) to compute both the upcoming
    // preview list and the final give-up timestamp.
    const maxWalk = 500;
    let walked = 0;
    let lastValidAttempt = attempt;
    let lastValidMs = nowMs;

    while (walked < maxWalk) {
      if (effectiveMaxAttempts > 0 && cursorAttempt > effectiveMaxAttempts) {
        break;
      }
      if (deadlineMs !== undefined && cursorMs > deadlineMs) {
        break;
      }

      const intervalMs =
        walked === 0 && hasExplicitNext && nextScheduledMs >= nowMs
          ? Math.max(0, nextScheduledMs - nowMs)
          : backoffIntervalMs(cursorAttempt, policy);

      if (upcoming.length < maxUpcoming) {
        upcoming.push({
          atMs: cursorMs,
          attempt: cursorAttempt,
          intervalMs,
        });
      }

      lastValidAttempt = cursorAttempt;
      lastValidMs = cursorMs;
      cursorAttempt += 1;
      cursorMs += backoffIntervalMs(cursorAttempt, policy);
      walked += 1;
    }

    const cappedByAttempts =
      effectiveMaxAttempts > 0 && cursorAttempt > effectiveMaxAttempts;
    const cappedByDeadline = deadlineMs !== undefined && cursorMs > deadlineMs;

    if (
      upcoming.length > 0 &&
      upcoming[upcoming.length - 1]!.attempt === lastValidAttempt &&
      (cappedByAttempts || cappedByDeadline)
    ) {
      upcoming[upcoming.length - 1]!.isFinal = true;
    }

    const nextAttemptInMs =
      upcoming.length > 0 ? Math.max(0, upcoming[0]!.atMs - nowMs) : undefined;

    if (cappedByDeadline && (!cappedByAttempts || deadlineMs <= lastValidMs)) {
      return {
        budgets,
        deadlineMs,
        givesUpAtMs: deadlineMs,
        givesUpReason: "schedule-to-close",
        nextAttemptInMs,
        remainingAttempts: walked,
        upcoming,
      };
    }

    if (cappedByAttempts) {
      return {
        budgets,
        deadlineMs,
        givesUpAtMs: lastValidMs,
        givesUpReason: "max-attempts",
        nextAttemptInMs,
        remainingAttempts: Math.max(0, effectiveMaxAttempts - attempt),
        upcoming,
      };
    }

    if (deadlineMs !== undefined) {
      return {
        budgets,
        deadlineMs,
        givesUpAtMs: deadlineMs,
        givesUpReason: "schedule-to-close",
        nextAttemptInMs,
        remainingAttempts: null,
        upcoming,
      };
    }

    return {
      budgets,
      deadlineMs,
      givesUpReason: "unlimited",
      nextAttemptInMs,
      remainingAttempts: null,
      upcoming,
    };
  }

  return {
    budgets,
    deadlineMs,
    givesUpAtMs: deadlineMs,
    givesUpReason:
      effectiveMaxAttempts > 0
        ? "max-attempts"
        : deadlineMs !== undefined
          ? "schedule-to-close"
          : "unlimited",
    remainingAttempts:
      effectiveMaxAttempts > 0
        ? Math.max(0, effectiveMaxAttempts - attempt)
        : null,
    upcoming: [],
  };
}
