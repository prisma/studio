import type {
  TemporalGroupedSpan,
  TemporalSpanKind,
  TemporalSpanStatus,
} from "./types";

/** Every run of one Activity, Child Workflow, Signal or Update, or every Timer. */
export interface TemporalRunStep {
  /** The durations of all its spans added up. */
  durationMs: number;
  key: string;
  kind: TemporalSpanKind;
  label: string;
  spans: TemporalGroupedSpan[];
  /** The status among its spans that most needs a look. */
  status: TemporalSpanStatus;
}

export interface TemporalRunSteps {
  /** How many steps the limit left out. */
  hiddenCount: number;
  steps: TemporalRunStep[];
}

/** The most urgent status first. */
const STATUS_URGENCY: TemporalSpanStatus[] = [
  "failed",
  "timed-out",
  "retrying",
  "running",
  "canceled",
  "completed",
  "fired",
];

function isOpenOrBroken(status: TemporalSpanStatus): boolean {
  return STATUS_URGENCY.indexOf(status) <= STATUS_URGENCY.indexOf("running");
}

/**
 * Groups a run's spans into steps for a short overview: one step for each
 * Activity type, Child Workflow type, Signal and Update, and one for all
 * Timers, in the order each first started. A loop that runs an Activity 20
 * times is then one step, not 20 rows.
 *
 * With more steps than `limit`, steps that failed or are still open stay and
 * the remaining places go to the earliest other steps.
 */
export function summarizeRunSteps(
  spans: TemporalGroupedSpan[],
  limit: number,
): TemporalRunSteps {
  const byKey = new Map<string, TemporalRunStep>();

  for (const span of spans) {
    if (span.kind === "workflow" || span.kind === "workflow-task") {
      continue;
    }

    // Each Timer has its own sequence number as label, so Timers group by kind.
    const key = span.kind === "timer" ? "timer" : `${span.kind}:${span.label}`;
    const step = byKey.get(key);

    if (!step) {
      byKey.set(key, {
        durationMs: span.durationMs,
        key,
        kind: span.kind,
        label: span.kind === "timer" ? "Timer" : span.label,
        spans: [span],
        status: span.status,
      });
      continue;
    }

    step.spans.push(span);
    step.durationMs += span.durationMs;

    if (
      STATUS_URGENCY.indexOf(span.status) < STATUS_URGENCY.indexOf(step.status)
    ) {
      step.status = span.status;
    }
  }

  const firstStart = (step: TemporalRunStep) =>
    Math.min(...step.spans.map((span) => span.startOffsetMs));
  const all = [...byKey.values()].sort((a, b) => firstStart(a) - firstStart(b));

  if (all.length <= limit) {
    return { hiddenCount: 0, steps: all };
  }

  const kept = new Set(
    [
      ...all.filter((step) => isOpenOrBroken(step.status)),
      ...all.filter((step) => !isOpenOrBroken(step.status)),
    ].slice(0, limit),
  );

  return {
    hiddenCount: all.length - limit,
    steps: all.filter((step) => kept.has(step)),
  };
}
