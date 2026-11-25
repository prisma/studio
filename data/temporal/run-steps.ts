import { MAX_SUMMARIES_PER_STEP, summaryOf, timerLabel } from "./type-map";
import type {
  TemporalGroupedSpan,
  TemporalSpanKind,
  TemporalSpanStatus,
} from "./types";

/**
 * The spans of a run that are one business step: the same Activity or Child
 * Workflow with the same summary, the same Signal or Update, or Timers with
 * the same summary or length.
 */
export interface TemporalRunStep {
  /** The durations of all its spans added up. */
  durationMs: number;
  /** The Activity or Child Workflow Type, when the step is named by its summary. */
  implementation?: string;
  key: string;
  kind: TemporalSpanKind;
  label: string;
  /** The most attempts any of its spans took. */
  maxAttempt: number;
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
 * Groups a run's spans into steps for a short overview, named as the Workflow
 * Type's diagram names them: an Activity or Child Workflow by the summary the
 * code gave it, a Timer by its summary or its length, in the order each first
 * started. A loop that runs an Activity 20 times is then one step, not 20 rows.
 * A type with more than `MAX_SUMMARIES_PER_STEP` summaries in the run is one
 * step named by its type, because its summaries name single calls.
 *
 * With more steps than `limit`, steps that failed or are still open stay and
 * the remaining places go to the earliest other steps.
 */
export function summarizeRunSteps(
  spans: TemporalGroupedSpan[],
  limit: number,
): TemporalRunSteps {
  const byKey = new Map<string, TemporalRunStep>();
  const stepSpans = spans.filter(
    (span) => span.kind !== "workflow" && span.kind !== "workflow-task",
  );
  const summariesByType = new Map<string, Set<string>>();

  for (const span of stepSpans) {
    const summary = summaryOf(span);

    if (
      summary &&
      (span.kind === "activity" || span.kind === "child-workflow")
    ) {
      const type = `${span.kind}:${span.label}`;
      const summaries = summariesByType.get(type) ?? new Set<string>();

      summaries.add(summary);
      summariesByType.set(type, summaries);
    }
  }

  for (const span of stepSpans) {
    const type = `${span.kind}:${span.label}`;
    const summary = summaryOf(span);
    const named =
      summary !== undefined &&
      (summariesByType.get(type)?.size ?? 0) <= MAX_SUMMARIES_PER_STEP;
    // A Timer's own label is a sequence number, so Timers go by summary or length.
    const { key, label } =
      span.kind === "timer"
        ? { key: `timer:${timerLabel(span)}`, label: timerLabel(span) }
        : named
          ? { key: `${type}:${summary}`, label: summary }
          : { key: type, label: span.label };
    const step = byKey.get(key);

    if (!step) {
      byKey.set(key, {
        durationMs: span.durationMs,
        ...(named && span.kind !== "timer"
          ? { implementation: span.label.replace(/^Child: /, "") }
          : {}),
        key,
        kind: span.kind,
        label,
        maxAttempt: span.attempt ?? 1,
        spans: [span],
        status: span.status,
      });
      continue;
    }

    step.spans.push(span);
    step.durationMs += span.durationMs;
    step.maxAttempt = Math.max(step.maxAttempt, span.attempt ?? 1);

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
