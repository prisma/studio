import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TemporalPendingActivityCard } from "./TemporalPendingActivityCard";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const BASE = Date.parse("2026-11-24T00:00:00.000Z");

describe("TemporalPendingActivityCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("renders timeout budgets, upcoming retries, and give-up summary", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <TemporalPendingActivityCard
          canAct={true}
          isPendingAction={false}
          onActivityOperation={vi.fn()}
          pending={{
            activityId: "deposit",
            activityType: "depositFunds",
            attempt: 3,
            lastFailure: { message: "503 bank unavailable" },
            maximumAttempts: 5,
            nextAttemptScheduleTime: new Date(BASE + 8_000).toISOString(),
            scheduledTime: new Date(BASE - 20_000).toISOString(),
            state: "Scheduled",
            taskQueue: "billing",
          }}
          policy={{
            backoffCoefficient: 2,
            initialIntervalMs: 5_000,
            maximumAttempts: 5,
            maximumIntervalMs: 20_000,
            scheduleToCloseTimeoutMs: 120_000,
          }}
          scheduledTimestamp={new Date(BASE - 20_000).toISOString()}
          supportsActivityOperations={true}
        />,
      );
    });

    const budgets = container.querySelector(
      '[data-testid="temporal-activity-budgets"]',
    )!;
    expect(budgets.textContent).toContain("Schedule-to-Close");
    expect(budgets.textContent).toContain("1m 40s left");

    const schedule = container.querySelector(
      '[data-testid="temporal-activity-retry-schedule"]',
    )!;
    expect(schedule.textContent).toContain("#3in 8s");
    expect(schedule.textContent).toContain("#5");
    expect(schedule.textContent).toContain("final");
    expect(schedule.textContent).toContain("Gives up after attempt 5");

    act(() => root.unmount());
  });
});
