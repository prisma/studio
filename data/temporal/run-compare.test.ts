import { describe, expect, it } from "vitest";

import { alignRunSpans, diffRunInputs } from "./run-compare";
import type { TemporalGroupedSpan } from "./types";

function span(
  overrides: Partial<TemporalGroupedSpan> & {
    id: string;
    label: string;
    startedEventId: number;
  },
): TemporalGroupedSpan {
  return {
    durationMs: 120,
    eventIds: [overrides.startedEventId],
    kind: "activity",
    startOffsetMs: 0,
    status: "completed",
    timestamp: "2026-11-23T10:00:00.000Z",
    ...overrides,
  };
}

describe("diffRunInputs", () => {
  it("identifies changed, missing, extra, and matching keys", () => {
    const rows = diffRunInputs(
      { amount: 9900, currency: "USD", promo: "BAD" },
      { amount: 4200, currency: "USD", region: "eu" },
    );

    expect(rows).toEqual([
      { baseline: 4200, current: 9900, key: "amount", kind: "changed" },
      { baseline: "USD", current: "USD", key: "currency", kind: "same" },
      { current: "BAD", key: "promo", kind: "only-current" },
      { baseline: "eu", key: "region", kind: "only-baseline" },
    ]);
  });
});

describe("alignRunSpans", () => {
  it("highlights where a failed run diverged from a completed baseline", () => {
    const rows = alignRunSpans(
      [
        span({ id: "a1", label: "validateCart", startedEventId: 5 }),
        span({
          id: "a2",
          label: "chargeCard",
          startedEventId: 11,
          status: "failed",
        }),
      ],
      [
        span({ id: "b1", label: "validateCart", startedEventId: 5 }),
        span({ id: "b2", label: "chargeCard", startedEventId: 11 }),
        span({ id: "b3", label: "issueReceipt", startedEventId: 17 }),
      ],
    );

    expect(rows.map((r) => r.kind)).toEqual([
      "match",
      "status-diff",
      "only-baseline",
    ]);
  });
});
