import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { useStudio } from "../studio/context";
import type {
  StudioStreamAggregationMeasureKind,
  StudioStreamAggregationRollup,
} from "./use-stream-details";

const DEFAULT_STREAM_AGGREGATION_REFRESH_INTERVAL_MS = 5_000;
const MAX_STREAM_AGGREGATION_BUCKETS = 72;

export const STREAM_AGGREGATION_QUICK_RANGES = [
  {
    duration: "5m",
    label: "Last 5 minutes",
  },
  {
    duration: "15m",
    label: "Last 15 minutes",
  },
  {
    duration: "30m",
    label: "Last 30 minutes",
  },
  {
    duration: "1h",
    label: "Last 1 hour",
  },
  {
    duration: "3h",
    label: "Last 3 hours",
  },
  {
    duration: "6h",
    label: "Last 6 hours",
  },
  {
    duration: "12h",
    label: "Last 12 hours",
  },
  {
    duration: "24h",
    label: "Last 24 hours",
  },
  {
    duration: "2d",
    label: "Last 2 days",
  },
  {
    duration: "7d",
    label: "Last 7 days",
  },
] as const;

export type StreamAggregationRelativeDuration =
  (typeof STREAM_AGGREGATION_QUICK_RANGES)[number]["duration"];

export type StreamAggregationRangeSelection =
  | {
      duration: StreamAggregationRelativeDuration;
      kind: "relative";
    }
  | {
      fromIso: string;
      kind: "absolute";
      toIso: string;
    };

interface StreamAggregationApiPayload {
  buckets: unknown[];
  coverage: {
    indexed_segments: number;
    index_families_used: unknown[];
    scanned_segments: number;
    scanned_tail_docs: number;
    used_rollups: boolean;
  };
  from: string;
  interval: string;
  rollup: string;
  stream: string;
  to: string;
}

type CountAggregateValue = {
  count: number;
  kind: "count";
};

type SummaryAggregateValue = {
  avg: number | null;
  count: number;
  kind: "summary";
  max: number | null;
  min: number | null;
  sum: number;
};

type AggregateValue = CountAggregateValue | SummaryAggregateValue;

export interface StudioStreamAggregationPoint {
  end: string;
  start: string;
  value: number | null;
}

export interface StudioStreamAggregationMeasureSeries {
  kind: StudioStreamAggregationMeasureKind;
  name: string;
  points: StudioStreamAggregationPoint[];
  summaryValue: number | null;
}

export interface StudioStreamAggregationResult {
  coverage: {
    indexFamiliesUsed: string[];
    indexedSegments: number;
    scannedSegments: number;
    scannedTailDocs: number;
    usedRollups: boolean;
  };
  from: string;
  interval: string;
  measures: StudioStreamAggregationMeasureSeries[];
  rollupName: string;
  to: string;
}

export interface UseStreamAggregationsArgs {
  aggregationRollups?: StudioStreamAggregationRollup[];
  enabled?: boolean;
  refreshIntervalMs?: number;
  rangeSelection: StreamAggregationRangeSelection;
  streamName?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createStreamAggregateUrl(
  streamsUrl: string | undefined,
  streamName: string | null | undefined,
): string {
  const trimmedStreamsUrl = streamsUrl?.trim();
  const trimmedStreamName = streamName?.trim();

  if (!trimmedStreamsUrl || !trimmedStreamName) {
    return "";
  }

  const encodedStreamName = encodeURIComponent(trimmedStreamName);
  const suffix = `/v1/stream/${encodedStreamName}/_aggregate`;

  try {
    const url = new URL(trimmedStreamsUrl);
    const pathname = url.pathname.replace(/\/+$/, "");

    url.pathname = `${pathname}${suffix}`;
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    const pathname = trimmedStreamsUrl
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");

    return `${pathname}${suffix}`;
  }
}

function parseDurationMs(value: string): number | null {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  const multiplier =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1_000
        : unit === "m"
          ? 60_000
          : unit === "h"
            ? 3_600_000
            : 86_400_000;

  return numericValue * multiplier;
}

function resolveRangeSelectionKey(
  selection: StreamAggregationRangeSelection,
): string {
  if (selection.kind === "relative") {
    return `relative:${selection.duration}`;
  }

  return `absolute:${selection.fromIso}:${selection.toIso}`;
}

function resolveRangeWindow(
  selection: StreamAggregationRangeSelection,
  nowMs: number,
): {
  durationMs: number;
  fromIso: string;
  toIso: string;
} {
  if (selection.kind === "relative") {
    const durationMs = parseDurationMs(selection.duration) ?? 3_600_000;
    const toMs = nowMs;
    const fromMs = Math.max(0, toMs - durationMs);

    return {
      durationMs,
      fromIso: new Date(fromMs).toISOString(),
      toIso: new Date(toMs).toISOString(),
    };
  }

  const fromMs = Date.parse(selection.fromIso);
  const toMs = Date.parse(selection.toIso);
  const durationMs = Math.max(1, toMs - fromMs);

  return {
    durationMs,
    fromIso: selection.fromIso,
    toIso: selection.toIso,
  };
}

function pickAggregateInterval(
  intervals: string[],
  durationMs: number,
): string {
  const sortedIntervals = intervals
    .map((interval) => ({
      interval,
      intervalMs: parseDurationMs(interval),
    }))
    .filter(
      (
        entry,
      ): entry is {
        interval: string;
        intervalMs: number;
      } => entry.intervalMs !== null,
    )
    .sort((left, right) => left.intervalMs - right.intervalMs);

  for (const entry of sortedIntervals) {
    if (durationMs / entry.intervalMs <= MAX_STREAM_AGGREGATION_BUCKETS) {
      return entry.interval;
    }
  }

  return sortedIntervals.at(-1)?.interval ?? intervals[0] ?? "1m";
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCountValue(raw: unknown): CountAggregateValue | null {
  if (!isRecord(raw)) {
    return null;
  }

  const count = toFiniteNumber(raw.count);

  if (count === null) {
    return null;
  }

  return {
    count,
    kind: "count",
  };
}

function normalizeSummaryValue(raw: unknown): SummaryAggregateValue | null {
  if (!isRecord(raw)) {
    return null;
  }

  const count = toFiniteNumber(raw.count);
  const sum = toFiniteNumber(raw.sum);

  if (count === null || sum === null) {
    return null;
  }

  return {
    avg: count > 0 ? sum / count : null,
    count,
    kind: "summary",
    max: toFiniteNumber(raw.max),
    min: toFiniteNumber(raw.min),
    sum,
  };
}

function normalizeMeasureValue(
  kind: StudioStreamAggregationMeasureKind,
  raw: unknown,
): AggregateValue | null {
  return kind === "count"
    ? normalizeCountValue(raw)
    : normalizeSummaryValue(raw);
}

function mergeAggregateValues(
  currentValue: AggregateValue | null,
  nextValue: AggregateValue | null,
): AggregateValue | null {
  if (!nextValue) {
    return currentValue;
  }

  if (!currentValue) {
    return nextValue;
  }

  if (currentValue.kind === "count" && nextValue.kind === "count") {
    return {
      count: currentValue.count + nextValue.count,
      kind: "count",
    };
  }

  if (currentValue.kind === "summary" && nextValue.kind === "summary") {
    const count = currentValue.count + nextValue.count;
    const sum = currentValue.sum + nextValue.sum;

    return {
      avg: count > 0 ? sum / count : null,
      count,
      kind: "summary",
      max:
        currentValue.max === null
          ? nextValue.max
          : nextValue.max === null
            ? currentValue.max
            : Math.max(currentValue.max, nextValue.max),
      min:
        currentValue.min === null
          ? nextValue.min
          : nextValue.min === null
            ? currentValue.min
            : Math.min(currentValue.min, nextValue.min),
      sum,
    };
  }

  return currentValue;
}

function getAggregateDisplayValue(value: AggregateValue | null): number | null {
  if (!value) {
    return null;
  }

  return value.kind === "count" ? value.count : value.avg;
}

function isStreamAggregationApiPayload(
  value: unknown,
): value is StreamAggregationApiPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.buckets) &&
    isRecord(value.coverage) &&
    typeof value.from === "string" &&
    typeof value.interval === "string" &&
    typeof value.rollup === "string" &&
    typeof value.stream === "string" &&
    typeof value.to === "string"
  );
}

function normalizeStreamAggregationResult(args: {
  payload: StreamAggregationApiPayload;
  rollup: StudioStreamAggregationRollup;
}): StudioStreamAggregationResult {
  const { payload, rollup } = args;

  return {
    coverage: {
      indexFamiliesUsed: Array.isArray(payload.coverage.index_families_used)
        ? payload.coverage.index_families_used.filter(
            (family): family is string => typeof family === "string",
          )
        : [],
      indexedSegments: payload.coverage.indexed_segments,
      scannedSegments: payload.coverage.scanned_segments,
      scannedTailDocs: payload.coverage.scanned_tail_docs,
      usedRollups: payload.coverage.used_rollups,
    },
    from: payload.from,
    interval: payload.interval,
    measures: rollup.measures.map((measure) => {
      let totalValue: AggregateValue | null = null;
      const points = payload.buckets
        .map((bucket) => {
          if (!isRecord(bucket)) {
            return null;
          }

          const start = typeof bucket.start === "string" ? bucket.start : null;
          const end = typeof bucket.end === "string" ? bucket.end : null;
          const groups = Array.isArray(bucket.groups) ? bucket.groups : [];

          if (!start || !end) {
            return null;
          }

          const mergedValue = groups.reduce<AggregateValue | null>(
            (currentValue, group) => {
              if (!isRecord(group) || !isRecord(group.measures)) {
                return currentValue;
              }

              return mergeAggregateValues(
                currentValue,
                normalizeMeasureValue(
                  measure.kind,
                  group.measures[measure.name],
                ),
              );
            },
            null,
          );

          totalValue = mergeAggregateValues(totalValue, mergedValue);

          return {
            end,
            start,
            value: getAggregateDisplayValue(mergedValue),
          } satisfies StudioStreamAggregationPoint;
        })
        .filter(
          (point): point is StudioStreamAggregationPoint => point !== null,
        );

      return {
        kind: measure.kind,
        name: measure.name,
        points,
        summaryValue: getAggregateDisplayValue(totalValue),
      } satisfies StudioStreamAggregationMeasureSeries;
    }),
    rollupName: payload.rollup,
    to: payload.to,
  };
}

export function useStreamAggregations(args: UseStreamAggregationsArgs) {
  const { streamsUrl } = useStudio();
  const aggregateUrl = useMemo(
    () => createStreamAggregateUrl(streamsUrl, args.streamName),
    [args.streamName, streamsUrl],
  );
  const rangeKey = resolveRangeSelectionKey(args.rangeSelection);
  const refreshIntervalMs =
    typeof args.refreshIntervalMs === "number" && args.refreshIntervalMs > 0
      ? args.refreshIntervalMs
      : DEFAULT_STREAM_AGGREGATION_REFRESH_INTERVAL_MS;
  const aggregationRollups = args.aggregationRollups ?? [];
  const isEnabled =
    args.enabled !== false &&
    aggregateUrl.length > 0 &&
    aggregationRollups.length > 0 &&
    typeof args.streamName === "string" &&
    args.streamName.trim().length > 0;

  const queries = useQueries({
    queries: aggregationRollups.map((rollup) => ({
      enabled: isEnabled,
      queryFn: async ({
        signal,
      }: {
        signal: AbortSignal;
      }): Promise<StudioStreamAggregationResult> => {
        const rangeWindow = resolveRangeWindow(args.rangeSelection, Date.now());
        const interval = pickAggregateInterval(
          rollup.intervals,
          rangeWindow.durationMs,
        );
        const response = await fetch(aggregateUrl, {
          body: JSON.stringify({
            from: rangeWindow.fromIso,
            interval,
            measures: rollup.measures.map((measure) => measure.name),
            rollup: rollup.name,
            to: rangeWindow.toIso,
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
          signal,
        });

        if (!response.ok) {
          throw new Error(
            `Failed loading stream aggregations (${response.status} ${response.statusText})`,
          );
        }

        const payload = (await response.json()) as unknown;

        if (!isStreamAggregationApiPayload(payload)) {
          throw new Error(
            "Streams server returned an invalid stream aggregation response shape.",
          );
        }

        return normalizeStreamAggregationResult({
          payload,
          rollup,
        });
      },
      queryKey: [
        "stream-aggregations",
        aggregateUrl,
        "stream",
        args.streamName ?? "",
        "rollup",
        rollup.name,
        "range",
        rangeKey,
      ] as const,
      refetchInterval:
        isEnabled && args.rangeSelection.kind === "relative"
          ? refreshIntervalMs
          : false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
      retryOnMount: false,
      staleTime: 0,
    })),
  });

  const aggregations = useMemo(
    () =>
      queries
        .map((query) => query.data ?? null)
        .filter(
          (aggregation): aggregation is StudioStreamAggregationResult =>
            aggregation !== null,
        ),
    [queries],
  );

  return {
    aggregations,
    error: queries.find((query) => query.error instanceof Error)?.error ?? null,
    isError: queries.some((query) => query.isError),
    isFetching: queries.some((query) => query.isFetching),
    isLoading: queries.some((query) => query.isLoading),
    refetch: async () => {
      await Promise.all(queries.map((query) => query.refetch()));
    },
  };
}
