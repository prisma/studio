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
  {
    duration: "all",
    label: "All",
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

export type StudioStreamAggregationStatistic =
  | "avg"
  | "count"
  | "max"
  | "min"
  | "p50"
  | "p95"
  | "p99";

const SUMMARY_STATISTICS = [
  "avg",
  "p50",
  "p95",
  "p99",
  "min",
  "max",
] as const satisfies ReadonlyArray<StudioStreamAggregationStatistic>;

type HistogramBuckets = Record<string, number>;

type CountAggregateValue = {
  count: number;
  kind: "count";
};

type SummaryAggregateValue = {
  count: number;
  histogram: HistogramBuckets | null;
  kind: "summary";
  max: number | null;
  min: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  sum: number;
};

type AggregateValue = CountAggregateValue | SummaryAggregateValue;

export interface StudioStreamAggregationStatisticValues {
  avg: number | null;
  count: number | null;
  max: number | null;
  min: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface StudioStreamAggregationPoint {
  end: string;
  start: string;
  statistics: StudioStreamAggregationStatisticValues;
}

export interface StudioStreamAggregationSeries {
  availableStatistics: StudioStreamAggregationStatistic[];
  id: string;
  kind: StudioStreamAggregationMeasureKind;
  label: string;
  measureName: string;
  points: StudioStreamAggregationPoint[];
  rollupName: string;
  statisticValues: StudioStreamAggregationStatisticValues;
  subtitle: string | null;
  unit: string | null;
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
  rollupName: string;
  series: StudioStreamAggregationSeries[];
  to: string;
}

interface AggregationSeriesAccumulator {
  kind: StudioStreamAggregationMeasureKind;
  label: string;
  measureName: string;
  points: StudioStreamAggregationPoint[];
  rollupName: string;
  subtitle: string | null;
  totalValue: AggregateValue | null;
  unit: string | null;
}

export interface UseStreamAggregationsArgs {
  aggregationRollups?: StudioStreamAggregationRollup[];
  enabled?: boolean;
  liveUpdatesEnabled?: boolean;
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
    if (selection.duration === "all") {
      return {
        durationMs: Math.max(1, nowMs),
        fromIso: new Date(0).toISOString(),
        toIso: new Date(nowMs).toISOString(),
      };
    }

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

function normalizeHistogram(value: unknown): HistogramBuckets | null {
  if (!isRecord(value)) {
    return null;
  }

  const histogramEntries = Object.entries(value)
    .map(([bucket, count]) => {
      const normalizedCount = toFiniteNumber(count);

      if (!Number.isFinite(Number(bucket)) || normalizedCount === null) {
        return null;
      }

      return [bucket, normalizedCount] as const;
    })
    .filter(
      (entry): entry is readonly [string, number] =>
        entry !== null && entry[1] > 0,
    );

  if (histogramEntries.length === 0) {
    return null;
  }

  return Object.fromEntries(histogramEntries);
}

function mergeHistograms(
  left: HistogramBuckets | null,
  right: HistogramBuckets | null,
): HistogramBuckets | null {
  if (!left && !right) {
    return null;
  }

  const mergedHistogram: HistogramBuckets = {};

  for (const [bucket, count] of Object.entries(left ?? {})) {
    mergedHistogram[bucket] = (mergedHistogram[bucket] ?? 0) + count;
  }

  for (const [bucket, count] of Object.entries(right ?? {})) {
    mergedHistogram[bucket] = (mergedHistogram[bucket] ?? 0) + count;
  }

  return Object.keys(mergedHistogram).length > 0 ? mergedHistogram : null;
}

function computeHistogramPercentile(
  histogram: HistogramBuckets | null,
  percentile: number,
): number | null {
  if (!histogram) {
    return null;
  }

  const entries = Object.entries(histogram)
    .map(([bucket, count]) => ({
      bucket: Number(bucket),
      count,
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.bucket) &&
        Number.isFinite(entry.count) &&
        entry.count > 0,
    )
    .sort((left, right) => left.bucket - right.bucket);

  if (entries.length === 0) {
    return null;
  }

  const totalCount = entries.reduce((sum, entry) => sum + entry.count, 0);

  if (totalCount <= 0) {
    return null;
  }

  const threshold = totalCount * percentile;
  let accumulatedCount = 0;

  for (const entry of entries) {
    accumulatedCount += entry.count;

    if (accumulatedCount >= threshold) {
      return entry.bucket;
    }
  }

  return entries.at(-1)?.bucket ?? null;
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

  const histogram = normalizeHistogram(raw.histogram);
  const p50 =
    computeHistogramPercentile(histogram, 0.5) ?? toFiniteNumber(raw.p50);
  const p95 =
    computeHistogramPercentile(histogram, 0.95) ?? toFiniteNumber(raw.p95);
  const p99 =
    computeHistogramPercentile(histogram, 0.99) ?? toFiniteNumber(raw.p99);

  return {
    count,
    histogram,
    kind: "summary",
    max: toFiniteNumber(raw.max),
    min: toFiniteNumber(raw.min),
    p50,
    p95,
    p99,
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
    const histogram = mergeHistograms(
      currentValue.histogram,
      nextValue.histogram,
    );

    return {
      count,
      histogram,
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
      p50: computeHistogramPercentile(histogram, 0.5),
      p95: computeHistogramPercentile(histogram, 0.95),
      p99: computeHistogramPercentile(histogram, 0.99),
      sum,
    };
  }

  return currentValue;
}

function createEmptyStatisticValues(): StudioStreamAggregationStatisticValues {
  return {
    avg: null,
    count: null,
    max: null,
    min: null,
    p50: null,
    p95: null,
    p99: null,
  };
}

function toStatisticValues(
  value: AggregateValue | null,
): StudioStreamAggregationStatisticValues {
  if (!value) {
    return createEmptyStatisticValues();
  }

  if (value.kind === "count") {
    return {
      ...createEmptyStatisticValues(),
      count: value.count,
    };
  }

  return {
    avg: value.count > 0 ? value.sum / value.count : null,
    count: value.count,
    max: value.max,
    min: value.min,
    p50: value.p50,
    p95: value.p95,
    p99: value.p99,
  };
}

function getAvailableStatistics(
  kind: StudioStreamAggregationMeasureKind,
  statisticValues: StudioStreamAggregationStatisticValues,
): StudioStreamAggregationStatistic[] {
  if (kind === "count") {
    return statisticValues.count === null ? [] : ["count"];
  }

  return SUMMARY_STATISTICS.filter(
    (statistic) => statisticValues[statistic] !== null,
  );
}

function normalizeGroupKeyLabelValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return null;
}

function serializeGroupKey(value: unknown): string {
  if (!isRecord(value)) {
    return "all";
  }

  const normalizedEntries = Object.entries(value)
    .map(
      ([key, entryValue]) =>
        [key, normalizeGroupKeyLabelValue(entryValue) ?? null] as const,
    )
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  return JSON.stringify(normalizedEntries);
}

function resolveAggregateGroupByDimensions(
  rollup: StudioStreamAggregationRollup,
): string[] {
  const primaryDimension = rollup.dimensions[0];

  if (!primaryDimension) {
    return [];
  }

  const groupByDimensions = [primaryDimension];

  if (primaryDimension !== "unit" && rollup.dimensions.includes("unit")) {
    groupByDimensions.push("unit");
  }

  return groupByDimensions;
}

function resolveSeriesLabel(args: {
  groupKey: unknown;
  measureName: string;
  rollup: StudioStreamAggregationRollup;
}): {
  label: string;
  subtitle: string | null;
  unit: string | null;
} {
  const { groupKey, measureName, rollup } = args;
  const resolvedGroupKey = isRecord(groupKey) ? groupKey : {};
  const primaryDimension = rollup.dimensions[0];
  const unitLabel = normalizeGroupKeyLabelValue(resolvedGroupKey.unit);
  const primaryDimensionLabel =
    primaryDimension &&
    normalizeGroupKeyLabelValue(resolvedGroupKey[primaryDimension]);
  const fallbackDimensionLabel = Object.values(resolvedGroupKey)
    .map((value) => normalizeGroupKeyLabelValue(value))
    .find((value): value is string => value !== null);
  const groupLabel = primaryDimensionLabel ?? fallbackDimensionLabel ?? null;

  if (groupLabel) {
    return {
      label: groupLabel,
      subtitle:
        unitLabel ??
        (measureName === "value"
          ? rollup.name
          : rollup.measures.length > 1
            ? measureName
            : rollup.name),
      unit: unitLabel,
    };
  }

  if (measureName === "value") {
    return {
      label: rollup.name,
      subtitle: null,
      unit: unitLabel,
    };
  }

  return {
    label: measureName,
    subtitle: rollup.name,
    unit: unitLabel,
  };
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
  const normalizedBuckets = payload.buckets
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

      return {
        end,
        groups,
        start,
      };
    })
    .filter(
      (
        bucket,
      ): bucket is {
        end: string;
        groups: unknown[];
        start: string;
      } => bucket !== null,
    );
  const seriesById = new Map<string, AggregationSeriesAccumulator>();

  for (const [bucketIndex, bucket] of normalizedBuckets.entries()) {
    for (const group of bucket.groups) {
      if (!isRecord(group) || !isRecord(group.measures)) {
        continue;
      }

      for (const measure of rollup.measures) {
        const normalizedValue = normalizeMeasureValue(
          measure.kind,
          group.measures[measure.name],
        );

        if (!normalizedValue) {
          continue;
        }

        const { label, subtitle, unit } = resolveSeriesLabel({
          groupKey: group.key,
          measureName: measure.name,
          rollup,
        });
        const seriesId = `${payload.rollup}:${measure.name}:${serializeGroupKey(group.key)}`;
        const existingSeries = seriesById.get(seriesId);

        if (!existingSeries) {
          const points: StudioStreamAggregationPoint[] = normalizedBuckets.map(
            (normalizedBucket) => ({
              end: normalizedBucket.end,
              start: normalizedBucket.start,
              statistics: createEmptyStatisticValues(),
            }),
          );
          const point = points[bucketIndex];

          if (!point) {
            continue;
          }

          const nextSeries: AggregationSeriesAccumulator = {
            kind: measure.kind,
            label,
            measureName: measure.name,
            points,
            rollupName: payload.rollup,
            subtitle,
            totalValue: null,
            unit,
          };

          nextSeries.points[bucketIndex] = {
            ...point,
            statistics: toStatisticValues(normalizedValue),
          };
          nextSeries.totalValue = mergeAggregateValues(
            nextSeries.totalValue,
            normalizedValue,
          );
          seriesById.set(seriesId, nextSeries);
          continue;
        }

        const point = existingSeries.points[bucketIndex];

        if (!point) {
          continue;
        }

        existingSeries.points[bucketIndex] = {
          ...point,
          statistics: toStatisticValues(normalizedValue),
        };
        existingSeries.totalValue = mergeAggregateValues(
          existingSeries.totalValue,
          normalizedValue,
        );
      }
    }
  }

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
    rollupName: payload.rollup,
    series: [...seriesById.entries()]
      .map(([seriesId, series]) => {
        const statisticValues = toStatisticValues(series.totalValue);

        return {
          availableStatistics: getAvailableStatistics(
            series.kind,
            statisticValues,
          ),
          id: seriesId,
          kind: series.kind,
          label: series.label,
          measureName: series.measureName,
          points: series.points,
          rollupName: series.rollupName,
          statisticValues,
          subtitle: series.subtitle,
          unit: series.unit,
        } satisfies StudioStreamAggregationSeries;
      })
      .sort(
        (left, right) =>
          left.label.localeCompare(right.label) ||
          left.measureName.localeCompare(right.measureName),
      ),
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
  const liveUpdatesEnabled = args.liveUpdatesEnabled === true;
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
        const groupByDimensions = resolveAggregateGroupByDimensions(rollup);
        const response = await fetch(aggregateUrl, {
          body: JSON.stringify({
            from: rangeWindow.fromIso,
            group_by:
              groupByDimensions.length > 0 ? groupByDimensions : undefined,
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
        isEnabled &&
        liveUpdatesEnabled &&
        args.rangeSelection.kind === "relative"
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
