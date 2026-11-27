import { describe, expect, it } from "vitest";

import { buildTimelineScale } from "./timeline-scale";

describe("buildTimelineScale", () => {
  it("places time in proportion when idle time is kept", () => {
    const scale = buildTimelineScale(
      [{ durationMs: 1_000, startOffsetMs: 0 }],
      100_000,
      { collapseIdle: false },
    );

    expect(scale.toFraction(0)).toBe(0);
    expect(scale.toFraction(50_000)).toBeCloseTo(0.5);
    expect(scale.toFraction(100_000)).toBe(1);
    expect(scale.gaps).toEqual([]);
  });

  it("gives a long timer a small fixed width so the Activities around it stay readable", () => {
    // Two one-second Activities with a 30-minute Timer between them.
    const timerMs = 30 * 60_000;
    const scale = buildTimelineScale(
      [
        { durationMs: 1_000, startOffsetMs: 0 },
        { durationMs: timerMs, startOffsetMs: 1_000 },
        { durationMs: 1_000, startOffsetMs: 1_000 + timerMs },
      ],
      2_000 + timerMs,
      { collapseIdle: true },
    );

    expect(scale.gaps).toHaveLength(1);
    expect(scale.gaps[0]!.durationMs).toBe(timerMs);

    const firstActivityWidth = scale.toFraction(1_000) - scale.toFraction(0);
    const gapWidth = scale.gaps[0]!.endFraction - scale.gaps[0]!.startFraction;

    expect(firstActivityWidth).toBeGreaterThan(0.4);
    expect(gapWidth).toBeLessThan(0.1);
    expect(scale.toFraction(2_000 + timerMs)).toBeCloseTo(1);
  });

  it("keeps a run without long quiet stretches in proportion", () => {
    const scale = buildTimelineScale(
      [
        { durationMs: 2_000, startOffsetMs: 0 },
        { durationMs: 3_000, startOffsetMs: 2_000 },
      ],
      5_000,
      { collapseIdle: true },
    );

    expect(scale.gaps).toEqual([]);
    expect(scale.toFraction(2_000)).toBeCloseTo(0.4);
  });

  it("never moves a later point in time to the left of an earlier one", () => {
    const scale = buildTimelineScale(
      [
        { durationMs: 500, startOffsetMs: 0 },
        { durationMs: 600_000, startOffsetMs: 500 },
        { durationMs: 200, startOffsetMs: 300_000 },
        { durationMs: 900, startOffsetMs: 600_500 },
      ],
      601_400,
      { collapseIdle: true },
    );
    let previous = -1;

    for (let offset = 0; offset <= 601_400; offset += 1_234) {
      const fraction = scale.toFraction(offset);

      expect(fraction).toBeGreaterThanOrEqual(previous);
      previous = fraction;
    }
  });
  it("maps a position on the axis back to its point in time", () => {
    const timerMs = 30 * 60_000;
    const scale = buildTimelineScale(
      [
        { durationMs: 1_000, startOffsetMs: 0 },
        { durationMs: timerMs, startOffsetMs: 1_000 },
        { durationMs: 1_000, startOffsetMs: 1_000 + timerMs },
      ],
      2_000 + timerMs,
      { collapseIdle: true },
    );

    for (const offset of [
      0,
      400,
      1_000,
      900_000,
      1_000 + timerMs,
      1_500 + timerMs,
    ]) {
      expect(scale.toOffsetMs(scale.toFraction(offset))).toBeCloseTo(offset, 3);
    }

    expect(scale.toOffsetMs(1)).toBe(2_000 + timerMs);
    expect(scale.toOffsetMs(-1)).toBe(0);
  });
  it("shortens every sleep of a run that sleeps between short Activities", () => {
    // Six cycles: a six-minute Timer, then a half-second Activity.
    const cycleMs = 6 * 60_000 + 500;
    const intervals = Array.from({ length: 6 }).flatMap((_, cycle) => [
      { durationMs: 6 * 60_000, idle: true, startOffsetMs: cycle * cycleMs },
      { durationMs: 500, startOffsetMs: cycle * cycleMs + 6 * 60_000 },
    ]);
    const scale = buildTimelineScale(intervals, 6 * cycleMs, {
      collapseIdle: true,
    });

    expect(scale.gaps).toHaveLength(6);

    const activityWidth =
      scale.toFraction(cycleMs) - scale.toFraction(6 * 60_000);

    // Without the shortening an Activity would take 0.02% of the width.
    expect(activityWidth).toBeGreaterThan(0.05);
  });

  it("keeps a wait that is short next to the work around it", () => {
    const scale = buildTimelineScale(
      [
        { durationMs: 60_000, startOffsetMs: 0 },
        { durationMs: 12_000, idle: true, startOffsetMs: 60_000 },
        { durationMs: 60_000, startOffsetMs: 72_000 },
      ],
      132_000,
      { collapseIdle: true },
    );

    expect(scale.gaps).toEqual([]);
  });
  it("keeps a run in proportion when one span is all it has", () => {
    // One Activity that has run for 24 seconds: nothing else needs the room.
    const scale = buildTimelineScale(
      [{ durationMs: 23_600, startOffsetMs: 100 }],
      23_700,
      { collapseIdle: true },
    );

    expect(scale.gaps).toEqual([]);
  });
});
