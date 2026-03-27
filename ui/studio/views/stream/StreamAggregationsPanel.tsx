import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import { Card, CardContent } from "@/ui/components/ui/card";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/ui/components/ui/popover";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { cn } from "@/ui/lib/utils";

import {
  STREAM_AGGREGATION_QUICK_RANGES,
  type StreamAggregationRangeSelection,
  type StreamAggregationRelativeDuration,
  type StudioStreamAggregationPoint,
  useStreamAggregations,
} from "../../../hooks/use-stream-aggregations";
import type {
  StudioStreamAggregationMeasureKind,
  StudioStreamAggregationRollup,
} from "../../../hooks/use-stream-details";

const COMMON_STREAM_AGGREGATION_RANGES = [
  {
    duration: "5m",
    label: "5 minutes",
  },
  {
    duration: "1h",
    label: "1 hour",
  },
  {
    duration: "12h",
    label: "12 hours",
  },
] as const satisfies ReadonlyArray<{
  duration: StreamAggregationRelativeDuration;
  label: string;
}>;

const SPARKLINE_TONES: Record<
  StudioStreamAggregationMeasureKind,
  {
    fillEnd: string;
    fillStart: string;
    line: string;
  }
> = {
  count: {
    fillEnd: "rgba(34, 197, 94, 0.02)",
    fillStart: "rgba(34, 197, 94, 0.20)",
    line: "#22c55e",
  },
  summary: {
    fillEnd: "rgba(59, 130, 246, 0.02)",
    fillStart: "rgba(59, 130, 246, 0.20)",
    line: "#3b82f6",
  },
  summary_parts: {
    fillEnd: "rgba(14, 165, 233, 0.02)",
    fillStart: "rgba(14, 165, 233, 0.20)",
    line: "#0ea5e9",
  },
};

interface StreamAggregationsPanelProps {
  aggregationRollups: StudioStreamAggregationRollup[];
  onRangeSelectionChange: (selection: StreamAggregationRangeSelection) => void;
  rangeSelection: StreamAggregationRangeSelection;
  streamName: string;
}

interface StreamAggregationCardData {
  id: string;
  kind: StudioStreamAggregationMeasureKind;
  name: string;
  points: StudioStreamAggregationPoint[];
  rollupName: string;
  summaryValue: number | null;
}

interface AbsoluteRangeDraft {
  fromInputValue: string;
  toInputValue: string;
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

function formatRelativeRangeLabel(
  duration: StreamAggregationRelativeDuration,
): string {
  return (
    STREAM_AGGREGATION_QUICK_RANGES.find((range) => range.duration === duration)
      ?.label ?? duration
  );
}

function resolveRangeSelectionWindow(
  selection: StreamAggregationRangeSelection,
) {
  if (selection.kind === "absolute") {
    return {
      fromIso: selection.fromIso,
      toIso: selection.toIso,
    };
  }

  const durationMs = parseDurationMs(selection.duration) ?? 3_600_000;
  const nowMs = Date.now();

  return {
    fromIso: new Date(Math.max(0, nowMs - durationMs)).toISOString(),
    toIso: new Date(nowMs).toISOString(),
  };
}

function formatCompactDateTime(isoTimestamp: string): string {
  const timestamp = new Date(isoTimestamp);

  if (Number.isNaN(timestamp.getTime())) {
    return isoTimestamp;
  }

  return timestamp.toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function formatRangeSelectionSummary(
  selection: StreamAggregationRangeSelection,
): string {
  if (selection.kind === "relative") {
    return formatRelativeRangeLabel(selection.duration);
  }

  return `${formatCompactDateTime(selection.fromIso)} to ${formatCompactDateTime(selection.toIso)}`;
}

function formatLocalDateTimeInputValue(isoTimestamp: string): string {
  const timestamp = new Date(isoTimestamp);

  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }

  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  const hour = String(timestamp.getHours()).padStart(2, "0");
  const minute = String(timestamp.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseLocalDateTimeInputValue(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

function createAbsoluteRangeDraft(
  selection: StreamAggregationRangeSelection,
): AbsoluteRangeDraft {
  const { fromIso, toIso } = resolveRangeSelectionWindow(selection);

  return {
    fromInputValue: formatLocalDateTimeInputValue(fromIso),
    toInputValue: formatLocalDateTimeInputValue(toIso),
  };
}

function formatAggregationValue(
  value: number | null,
  kind: StudioStreamAggregationMeasureKind,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  const formatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits:
      kind === "count"
        ? 0
        : Math.abs(value) >= 100
          ? 0
          : Math.abs(value) >= 10
            ? 1
            : 2,
  });

  return formatter.format(value);
}

function getCustomRangeButtonLabel(
  selection: StreamAggregationRangeSelection,
): string {
  if (selection.kind === "absolute") {
    return "Custom";
  }

  const isCommonRange = COMMON_STREAM_AGGREGATION_RANGES.some(
    (range) => range.duration === selection.duration,
  );

  if (isCommonRange) {
    return "More";
  }

  return formatRelativeRangeLabel(selection.duration).replace(/^Last /, "");
}

function buildSparklinePath(values: number[]): {
  areaPath: string;
  linePath: string;
} | null {
  const firstValue = values[0];

  if (firstValue === undefined) {
    return null;
  }

  const plottedValues: number[] =
    values.length === 1 ? [firstValue, firstValue] : values;
  const minValue = Math.min(...plottedValues);
  const maxValue = Math.max(...plottedValues);
  const range = maxValue - minValue;
  const floorY = 44;
  const topY = 8;
  const usableHeight = floorY - topY;

  const coordinates = plottedValues.map((value, index) => {
    const x =
      plottedValues.length === 1
        ? 50
        : (index / (plottedValues.length - 1)) * 100;
    const normalizedValue = range === 0 ? 0.5 : (value - minValue) / range;
    const y = floorY - normalizedValue * usableHeight;

    return {
      x,
      y,
    };
  });

  const linePath = coordinates
    .map(
      (coordinate, index) =>
        `${index === 0 ? "M" : "L"} ${coordinate.x.toFixed(2)} ${coordinate.y.toFixed(2)}`,
    )
    .join(" ");

  const firstCoordinate = coordinates[0];
  const lastCoordinate = coordinates.at(-1);

  if (!firstCoordinate || !lastCoordinate) {
    return null;
  }

  return {
    areaPath: `${linePath} L ${lastCoordinate.x.toFixed(2)} ${floorY} L ${firstCoordinate.x.toFixed(2)} ${floorY} Z`,
    linePath,
  };
}

function StreamAggregationSparkline(props: {
  kind: StudioStreamAggregationMeasureKind;
  points: StudioStreamAggregationPoint[];
}) {
  const { kind, points } = props;
  const gradientId = useId();
  const finiteValues = useMemo(
    () =>
      points
        .map((point) => point.value)
        .filter(
          (value): value is number => value !== null && Number.isFinite(value),
        ),
    [points],
  );
  const resolvedValues = useMemo(() => {
    const firstFiniteValue = finiteValues[0];

    if (firstFiniteValue === undefined) {
      return [];
    }

    let previousValue = firstFiniteValue;

    return points.map((point) => {
      if (typeof point.value === "number" && Number.isFinite(point.value)) {
        previousValue = point.value;
      }

      return previousValue;
    });
  }, [finiteValues, points]);
  const paths = useMemo(
    () => buildSparklinePath(resolvedValues),
    [resolvedValues],
  );
  const tone = SPARKLINE_TONES[kind];

  if (!paths) {
    return (
      <div className="h-full w-full bg-linear-to-t from-muted/30 to-transparent" />
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 48"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={tone.fillStart} />
          <stop offset="100%" stopColor={tone.fillEnd} />
        </linearGradient>
      </defs>
      <path d={paths.areaPath} fill={`url(#${gradientId})`} />
      <path
        d={paths.linePath}
        fill="none"
        stroke={tone.line}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function StreamAggregationCard(props: StreamAggregationCardData) {
  const { kind, name, points, rollupName, summaryValue } = props;

  return (
    <Card className="relative min-h-40 min-w-[13rem] overflow-hidden border-border/70 bg-card/90 shadow-sm">
      <CardContent className="relative flex h-full min-h-40 flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {rollupName}
            </p>
          </div>
          <Badge className="bg-background/80" variant="outline">
            {kind === "count" ? "Count" : "Average"}
          </Badge>
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center py-4">
          <span className="text-center text-4xl font-semibold tracking-tight text-foreground">
            {formatAggregationValue(summaryValue, kind)}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 opacity-80">
          <StreamAggregationSparkline kind={kind} points={points} />
        </div>
      </CardContent>
    </Card>
  );
}

export function StreamAggregationsPanel(props: StreamAggregationsPanelProps) {
  const {
    aggregationRollups,
    onRangeSelectionChange,
    rangeSelection,
    streamName,
  } = props;
  const [isCustomRangeOpen, setIsCustomRangeOpen] = useState(false);
  const [absoluteRangeDraft, setAbsoluteRangeDraft] =
    useState<AbsoluteRangeDraft>(() =>
      createAbsoluteRangeDraft(rangeSelection),
    );
  const rangeFieldId = useId();
  const absoluteFromIso = parseLocalDateTimeInputValue(
    absoluteRangeDraft.fromInputValue,
  );
  const absoluteToIso = parseLocalDateTimeInputValue(
    absoluteRangeDraft.toInputValue,
  );
  const canApplyAbsoluteRange =
    absoluteFromIso !== null &&
    absoluteToIso !== null &&
    Date.parse(absoluteFromIso) < Date.parse(absoluteToIso);
  const { aggregations, error, isError, isFetching, isLoading } =
    useStreamAggregations({
      aggregationRollups,
      enabled: true,
      rangeSelection,
      streamName,
    });
  const aggregationCards = useMemo(
    () =>
      aggregations.flatMap((aggregation) =>
        aggregation.measures.map((measure) => ({
          id: `${aggregation.rollupName}:${measure.name}`,
          kind: measure.kind,
          name: measure.name,
          points: measure.points,
          rollupName: aggregation.rollupName,
          summaryValue: measure.summaryValue,
        })),
      ),
    [aggregations],
  );
  const isCustomRangeSelected =
    rangeSelection.kind === "absolute" ||
    (rangeSelection.kind === "relative" &&
      !COMMON_STREAM_AGGREGATION_RANGES.some(
        (range) => range.duration === rangeSelection.duration,
      ));

  useEffect(() => {
    if (!isCustomRangeOpen) {
      return;
    }

    setAbsoluteRangeDraft(createAbsoluteRangeDraft(rangeSelection));
  }, [isCustomRangeOpen, rangeSelection]);

  return (
    <section
      className="border-b border-border bg-muted/20 px-4 py-4"
      data-testid="stream-aggregations-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Aggregations
          </p>
          <p className="text-sm text-muted-foreground">
            {formatRangeSelectionSummary(rangeSelection)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-stretch overflow-hidden rounded-md border border-input bg-background/95 shadow-sm">
            {COMMON_STREAM_AGGREGATION_RANGES.map((range) => {
              const isSelected =
                rangeSelection.kind === "relative" &&
                rangeSelection.duration === range.duration;

              return (
                <Button
                  key={range.duration}
                  className={cn(
                    "h-8 rounded-none border-0 border-r border-input px-3 shadow-none",
                    isSelected && "bg-secondary hover:bg-secondary",
                  )}
                  onClick={() => {
                    onRangeSelectionChange({
                      duration: range.duration,
                      kind: "relative",
                    });
                  }}
                  size="sm"
                  type="button"
                  variant={isSelected ? "secondary" : "ghost"}
                >
                  {range.label}
                </Button>
              );
            })}

            <Popover
              open={isCustomRangeOpen}
              onOpenChange={setIsCustomRangeOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  className={cn(
                    "h-8 rounded-none border-0 px-3 shadow-none",
                    isCustomRangeSelected && "bg-secondary hover:bg-secondary",
                  )}
                  data-testid="stream-aggregations-custom-range-button"
                  size="sm"
                  type="button"
                  variant={isCustomRangeSelected ? "secondary" : "ghost"}
                >
                  {getCustomRangeButtonLabel(rangeSelection)}
                  <ChevronDown className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[25rem] p-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      More quick ranges
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {STREAM_AGGREGATION_QUICK_RANGES.filter(
                        (range) =>
                          !COMMON_STREAM_AGGREGATION_RANGES.some(
                            (commonRange) =>
                              commonRange.duration === range.duration,
                          ),
                      ).map((range) => {
                        const isSelected =
                          rangeSelection.kind === "relative" &&
                          rangeSelection.duration === range.duration;

                        return (
                          <Button
                            key={range.duration}
                            className="justify-start"
                            onClick={() => {
                              onRangeSelectionChange({
                                duration: range.duration,
                                kind: "relative",
                              });
                              setIsCustomRangeOpen(false);
                            }}
                            size="sm"
                            type="button"
                            variant={isSelected ? "secondary" : "outline"}
                          >
                            {range.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-border pt-4">
                    <div className="grid gap-3">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Absolute time range
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label htmlFor={`${rangeFieldId}-from`}>From</Label>
                          <Input
                            id={`${rangeFieldId}-from`}
                            onChange={(event) => {
                              setAbsoluteRangeDraft((currentValue) => ({
                                ...currentValue,
                                fromInputValue: event.currentTarget.value,
                              }));
                            }}
                            type="datetime-local"
                            value={absoluteRangeDraft.fromInputValue}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor={`${rangeFieldId}-to`}>To</Label>
                          <Input
                            id={`${rangeFieldId}-to`}
                            onChange={(event) => {
                              setAbsoluteRangeDraft((currentValue) => ({
                                ...currentValue,
                                toInputValue: event.currentTarget.value,
                              }));
                            }}
                            type="datetime-local"
                            value={absoluteRangeDraft.toInputValue}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          Local time inputs are converted to UTC for the Streams
                          query.
                        </p>
                        <Button
                          disabled={!canApplyAbsoluteRange}
                          onClick={() => {
                            if (!absoluteFromIso || !absoluteToIso) {
                              return;
                            }

                            onRangeSelectionChange({
                              fromIso: absoluteFromIso,
                              kind: "absolute",
                              toIso: absoluteToIso,
                            });
                            setIsCustomRangeOpen(false);
                          }}
                          size="sm"
                          type="button"
                        >
                          Apply range
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="flex gap-3">
            {Array.from({ length: 3 }, (_unused, index) => (
              <Card
                key={index}
                className="min-h-40 min-w-[13rem] border-border/70 bg-card/90 shadow-sm"
              >
                <CardContent className="flex h-full min-h-40 flex-col justify-between p-4">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="mx-auto h-10 w-24" />
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
            {error?.message ?? "Aggregation data is unavailable right now."}
          </div>
        ) : aggregationCards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
            No rollup data is available for this range yet.
          </div>
        ) : (
          <div
            className="overflow-x-auto pb-1"
            data-testid="stream-aggregations-scroll-area"
          >
            <div className="flex min-w-max gap-3">
              {aggregationCards.map((aggregationCard) => (
                <StreamAggregationCard
                  key={aggregationCard.id}
                  {...aggregationCard}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {isFetching && !isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Refreshing aggregation rollups…
        </p>
      ) : null}
    </section>
  );
}
