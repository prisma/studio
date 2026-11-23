import { describe, expect, it } from "vitest";

import { projectActivityRetrySchedule } from "./retry-schedule";

const BASE = Date.parse("2026-11-24T00:00:00.000Z");

describe("projectActivityRetrySchedule", () => {
  it("projects exponential backoff retries up to maximumAttempts", () => {
    const result = projectActivityRetrySchedule({
      attempt: 2,
      maximumAttempts: 5,
      nextAttemptIso: new Date(BASE + 6_000).toISOString(),
      nowMs: BASE,
      policy: {
        backoffCoefficient: 2,
        initialIntervalMs: 5_000,
        maximumAttempts: 5,
        maximumIntervalMs: 15_000,
        scheduleToCloseTimeoutMs: 300_000,
      },
      scheduledTimeIso: new Date(BASE - 10_000).toISOString(),
      state: "Scheduled",
    });

    // Attempt 2 is scheduled in 6s, then 3 (+10s), 4 (+15s capped), 5 (+15s capped).
    expect(result.upcoming.map((u) => u.attempt)).toEqual([2, 3, 4, 5]);
    expect(result.upcoming.map((u) => u.intervalMs)).toEqual([
      6_000, 10_000, 15_000, 15_000,
    ]);
    expect(result.upcoming.at(-1)?.isFinal).toBe(true);
    expect(result.givesUpReason).toBe("max-attempts");
    expect(result.nextAttemptInMs).toBe(6_000);
    expect(result.budgets).toHaveLength(1);
    expect(result.budgets[0]?.label).toBe("Schedule-to-Close");
    expect(result.budgets[0]?.leftMs).toBe(290_000);
  });

  it("caps retries at the Schedule-to-Close deadline when maximumAttempts is unlimited", () => {
    const result = projectActivityRetrySchedule({
      attempt: 1,
      maximumAttempts: 0,
      nowMs: BASE,
      policy: {
        backoffCoefficient: 2,
        initialIntervalMs: 10_000,
        scheduleToCloseTimeoutMs: 45_000,
      },
      scheduledTimeIso: new Date(BASE - 5_000).toISOString(),
      state: "Started",
    });

    // Remaining deadline is 40s from now: attempt 2 (+10s), attempt 3 (+20s -> 30s), attempt 4 (+40s -> 70s > 40s).
    expect(result.upcoming.map((u) => u.attempt)).toEqual([2, 3]);
    expect(result.givesUpReason).toBe("schedule-to-close");
    expect(result.givesUpAtMs).toBe(BASE + 40_000);
  });

  it("reports Start-to-Close and Heartbeat budgets while Started", () => {
    const result = projectActivityRetrySchedule({
      attempt: 1,
      lastHeartbeatIso: new Date(BASE - 3_000).toISOString(),
      lastStartedIso: new Date(BASE - 4_000).toISOString(),
      maximumAttempts: 0,
      nowMs: BASE,
      policy: {
        heartbeatTimeoutMs: 10_000,
        startToCloseTimeoutMs: 30_000,
      },
      scheduledTimeIso: new Date(BASE - 5_000).toISOString(),
      state: "Started",
    });

    expect(result.budgets.map((b) => [b.label, b.leftMs])).toEqual([
      ["Start-to-Close", 26_000],
      ["Heartbeat", 7_000],
    ]);
  });
});
