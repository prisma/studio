import type { TemporalGroupedSpan } from "./types";

export interface RunInputDiffRow {
  baseline?: unknown;
  current?: unknown;
  key: string;
  kind: "changed" | "only-baseline" | "only-current" | "same";
}

export interface AlignedSpanRow {
  baseline?: TemporalGroupedSpan;
  current?: TemporalGroupedSpan;
  index: number;
  kind: "diverged" | "match" | "only-baseline" | "only-current" | "status-diff";
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value) && value.length === 1) {
    return asPlainObject(value[0]);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

/** Compares the inputs of two runs key-by-key when both are objects, or as one value. */
export function diffRunInputs(
  currentInput: unknown,
  baselineInput: unknown,
): RunInputDiffRow[] {
  const currentObj = asPlainObject(currentInput);
  const baselineObj = asPlainObject(baselineInput);

  if (!currentObj || !baselineObj) {
    const same = stableJson(currentInput) === stableJson(baselineInput);
    return [
      {
        baseline: baselineInput,
        current: currentInput,
        key: "input",
        kind: same ? "same" : "changed",
      },
    ];
  }

  const keys = Array.from(
    new Set([...Object.keys(currentObj), ...Object.keys(baselineObj)]),
  ).sort();

  return keys.map((key) => {
    const hasCurrent = Object.prototype.hasOwnProperty.call(currentObj, key);
    const hasBaseline = Object.prototype.hasOwnProperty.call(baselineObj, key);

    if (hasCurrent && !hasBaseline) {
      return { current: currentObj[key], key, kind: "only-current" };
    }
    if (!hasCurrent && hasBaseline) {
      return { baseline: baselineObj[key], key, kind: "only-baseline" };
    }
    const same = stableJson(currentObj[key]) === stableJson(baselineObj[key]);
    return {
      baseline: baselineObj[key],
      current: currentObj[key],
      key,
      kind: same ? "same" : "changed",
    };
  });
}

function isStepSpan(span: TemporalGroupedSpan): boolean {
  return span.kind !== "workflow" && span.kind !== "workflow-task";
}

/**
 * Lines up the ordered steps of a failed run against a completed baseline run
 * so the first diverging step stands out immediately.
 */
export function alignRunSpans(
  currentSpans: readonly TemporalGroupedSpan[],
  baselineSpans: readonly TemporalGroupedSpan[],
): AlignedSpanRow[] {
  const current = currentSpans
    .filter(isStepSpan)
    .sort((a, b) => a.startedEventId - b.startedEventId);
  const baseline = baselineSpans
    .filter(isStepSpan)
    .sort((a, b) => a.startedEventId - b.startedEventId);
  const count = Math.max(current.length, baseline.length);
  const rows: AlignedSpanRow[] = [];

  for (let i = 0; i < count; i++) {
    const c = current[i];
    const b = baseline[i];

    if (c && !b) {
      rows.push({ current: c, index: i, kind: "only-current" });
    } else if (!c && b) {
      rows.push({ baseline: b, index: i, kind: "only-baseline" });
    } else if (c && b) {
      const sameStep = c.kind === b.kind && c.label === b.label;
      const kind = !sameStep
        ? "diverged"
        : c.status === b.status
          ? "match"
          : "status-diff";
      rows.push({ baseline: b, current: c, index: i, kind });
    }
  }

  return rows;
}
