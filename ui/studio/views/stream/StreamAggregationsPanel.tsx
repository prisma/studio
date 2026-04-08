import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { Card, CardContent } from "@/ui/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
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
  type StudioStreamAggregationSeries,
  type StudioStreamAggregationStatistic,
  type StudioStreamAggregationStatisticValues,
  useStreamAggregations,
} from "../../../hooks/use-stream-aggregations";
import type {
  StudioStreamAggregationMeasureKind,
  StudioStreamAggregationRollup,
} from "../../../hooks/use-stream-details";
import { useUiState } from "../../../hooks/use-ui-state";

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

const STATISTIC_LABELS: Record<StudioStreamAggregationStatistic, string> = {
  avg: "Average",
  count: "Count",
  max: "Max",
  min: "Min",
  p50: "P50",
  p95: "P95",
  p99: "P99",
};

interface StreamAggregationsPanelProps {
  aggregationRollups: StudioStreamAggregationRollup[];
  liveUpdatesEnabled: boolean;
  onRangeSelectionChange: (selection: StreamAggregationRangeSelection) => void;
  rangeSelection: StreamAggregationRangeSelection;
  streamName: string;
}

interface AbsoluteRangeDraft {
  fromDateValue: string;
  fromTimeValue: string;
  toDateValue: string;
  toTimeValue: string;
}

interface StreamAggregationColumnData {
  availableStatistics: StudioStreamAggregationStatistic[];
  displayUnit: DisplayUnitOption | null;
  enabledStatistics: StudioStreamAggregationStatistic[];
  primaryValue: number | null;
  series: StudioStreamAggregationSeries;
}

interface DisplayUnitOption {
  id: string;
  label: string;
  multiplier: number;
}

interface DisplayUnitFamily {
  options: readonly DisplayUnitOption[];
  sourceMultiplier: number;
}

const BYTE_DISPLAY_UNITS = [
  {
    id: "B",
    label: "B",
    multiplier: 1,
  },
  {
    id: "KB",
    label: "KB",
    multiplier: 1024,
  },
  {
    id: "MB",
    label: "MB",
    multiplier: 1024 ** 2,
  },
  {
    id: "GB",
    label: "GB",
    multiplier: 1024 ** 3,
  },
  {
    id: "TB",
    label: "TB",
    multiplier: 1024 ** 4,
  },
  {
    id: "PB",
    label: "PB",
    multiplier: 1024 ** 5,
  },
] as const satisfies ReadonlyArray<DisplayUnitOption>;

const COUNT_DISPLAY_UNITS = [
  {
    id: "count",
    label: "count",
    multiplier: 1,
  },
  {
    id: "K",
    label: "K",
    multiplier: 1_000,
  },
  {
    id: "M",
    label: "M",
    multiplier: 1_000_000,
  },
  {
    id: "B",
    label: "B",
    multiplier: 1_000_000_000,
  },
  {
    id: "T",
    label: "T",
    multiplier: 1_000_000_000_000,
  },
] as const satisfies ReadonlyArray<DisplayUnitOption>;

const NANOSECOND_DISPLAY_UNITS = [
  {
    id: "ns",
    label: "ns",
    multiplier: 1,
  },
  {
    id: "us",
    label: "us",
    multiplier: 1_000,
  },
  {
    id: "ms",
    label: "ms",
    multiplier: 1_000_000,
  },
  {
    id: "s",
    label: "s",
    multiplier: 1_000_000_000,
  },
  {
    id: "min",
    label: "min",
    multiplier: 60_000_000_000,
  },
] as const satisfies ReadonlyArray<DisplayUnitOption>;

const STREAM_AGGREGATION_COLUMN_CLASS_NAME =
  "w-[19rem] min-w-[19rem] max-w-[19rem] shrink-0";

const INTERACTIVE_TRIGGER_CLASS_NAME =
  "group/control inline-flex h-6 max-w-full items-center justify-start gap-1 whitespace-nowrap rounded-full border border-transparent bg-transparent px-1.5 text-xs font-medium leading-none text-muted-foreground transition-[background-color,border-color,color] duration-150 focus-visible:border-input focus-visible:bg-background/95 focus-visible:text-foreground-neutral data-[state=open]:border-input data-[state=open]:bg-background/95 data-[state=open]:text-foreground-neutral md:hover:border-input md:hover:bg-background/95 md:hover:text-foreground-neutral";

const INTERACTIVE_TRIGGER_ICON_CLASS_NAME =
  "size-3.5 opacity-0 transition-opacity duration-150 group-data-[state=open]/control:opacity-100 md:group-hover/control:opacity-100 md:group-focus-visible/control:opacity-100";

function parseDurationMs(value: string): number | null {
  if (value.trim() === "all") {
    return null;
  }

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

  if (selection.duration === "all") {
    return {
      fromIso: new Date(0).toISOString(),
      toIso: new Date().toISOString(),
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

function formatLocalDateInputValue(isoTimestamp: string): string {
  return formatLocalDateTimeInputValue(isoTimestamp).slice(0, 10);
}

function formatLocalTimeInputValue(isoTimestamp: string): string {
  return formatLocalDateTimeInputValue(isoTimestamp).slice(11, 16);
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

function parseLocalDateAndTimeInputValue(
  dateValue: string,
  timeValue: string,
): string | null {
  if (dateValue.trim().length === 0 || timeValue.trim().length === 0) {
    return null;
  }

  return parseLocalDateTimeInputValue(`${dateValue}T${timeValue}`);
}

function createAbsoluteRangeDraft(
  selection: StreamAggregationRangeSelection,
): AbsoluteRangeDraft {
  const { fromIso, toIso } = resolveRangeSelectionWindow(selection);

  return {
    fromDateValue: formatLocalDateInputValue(fromIso),
    fromTimeValue: formatLocalTimeInputValue(fromIso),
    toDateValue: formatLocalDateInputValue(toIso),
    toTimeValue: formatLocalTimeInputValue(toIso),
  };
}

function formatAggregationValue(
  value: number | null,
  statistic: StudioStreamAggregationStatistic,
  displayUnit: DisplayUnitOption | null,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  const normalizedValue =
    displayUnit && displayUnit.multiplier > 0
      ? value / displayUnit.multiplier
      : value;

  const formatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits:
      statistic === "count"
        ? 0
        : Math.abs(normalizedValue) >= 100
          ? 0
          : Math.abs(normalizedValue) >= 10
            ? 1
            : 2,
  });

  return formatter.format(normalizedValue);
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

function getStatisticValue(
  statisticValues: StudioStreamAggregationStatisticValues,
  statistic: StudioStreamAggregationStatistic,
): number | null {
  return statisticValues[statistic];
}

function resolveDisplayUnitFamily(
  rawUnit: string | null,
): DisplayUnitFamily | null {
  const normalizedUnit = rawUnit?.trim().toLowerCase();

  if (!normalizedUnit) {
    return null;
  }

  if (["b", "byte", "bytes"].includes(normalizedUnit)) {
    return {
      options: BYTE_DISPLAY_UNITS,
      sourceMultiplier: 1,
    };
  }

  if (["kb", "kib", "kilobyte", "kilobytes"].includes(normalizedUnit)) {
    return {
      options: BYTE_DISPLAY_UNITS,
      sourceMultiplier: 1024,
    };
  }

  if (["mb", "mib", "megabyte", "megabytes"].includes(normalizedUnit)) {
    return {
      options: BYTE_DISPLAY_UNITS,
      sourceMultiplier: 1024 ** 2,
    };
  }

  if (["gb", "gib", "gigabyte", "gigabytes"].includes(normalizedUnit)) {
    return {
      options: BYTE_DISPLAY_UNITS,
      sourceMultiplier: 1024 ** 3,
    };
  }

  if (["tb", "tib", "terabyte", "terabytes"].includes(normalizedUnit)) {
    return {
      options: BYTE_DISPLAY_UNITS,
      sourceMultiplier: 1024 ** 4,
    };
  }

  if (["pb", "pib", "petabyte", "petabytes"].includes(normalizedUnit)) {
    return {
      options: BYTE_DISPLAY_UNITS,
      sourceMultiplier: 1024 ** 5,
    };
  }

  if (["ns", "nanosecond", "nanoseconds"].includes(normalizedUnit)) {
    return {
      options: NANOSECOND_DISPLAY_UNITS,
      sourceMultiplier: 1,
    };
  }

  if (["us", "µs", "microsecond", "microseconds"].includes(normalizedUnit)) {
    return {
      options: NANOSECOND_DISPLAY_UNITS,
      sourceMultiplier: 1_000,
    };
  }

  if (["ms", "millisecond", "milliseconds"].includes(normalizedUnit)) {
    return {
      options: NANOSECOND_DISPLAY_UNITS,
      sourceMultiplier: 1_000_000,
    };
  }

  if (["s", "sec", "second", "seconds"].includes(normalizedUnit)) {
    return {
      options: NANOSECOND_DISPLAY_UNITS,
      sourceMultiplier: 1_000_000_000,
    };
  }

  if (["m", "min", "minute", "minutes"].includes(normalizedUnit)) {
    return {
      options: NANOSECOND_DISPLAY_UNITS,
      sourceMultiplier: 60_000_000_000,
    };
  }

  if (["count", "counts"].includes(normalizedUnit)) {
    return {
      options: COUNT_DISPLAY_UNITS,
      sourceMultiplier: 1,
    };
  }

  return null;
}

function resolveAutoDisplayUnit(
  family: DisplayUnitFamily | null,
  value: number | null,
): DisplayUnitOption | null {
  if (!family) {
    return null;
  }

  const absoluteValue =
    value === null ? 0 : Math.abs(value * family.sourceMultiplier);

  return (
    [...family.options]
      .reverse()
      .find((option) => absoluteValue >= option.multiplier) ??
    family.options[0] ??
    null
  );
}

function resolveDisplayUnitOption(args: {
  preferredUnitId?: string | null;
  rawUnit: string | null;
  value: number | null;
}): DisplayUnitOption | null {
  const family = resolveDisplayUnitFamily(args.rawUnit);

  if (!family) {
    return null;
  }

  if (args.preferredUnitId) {
    const preferredUnit = family.options.find(
      (option) => option.id === args.preferredUnitId,
    );

    if (preferredUnit) {
      return preferredUnit;
    }
  }

  return resolveAutoDisplayUnit(family, args.value);
}

function getDisplayedSubtitle(args: {
  displayUnit: DisplayUnitOption | null;
  series: StudioStreamAggregationSeries;
}): string | null {
  return args.displayUnit?.label ?? args.series.unit ?? args.series.subtitle;
}

function createDefaultEnabledStatistics(
  series: StudioStreamAggregationSeries,
): StudioStreamAggregationStatistic[] {
  if (series.availableStatistics.length === 0) {
    return [];
  }

  if (series.availableStatistics.includes("avg")) {
    return ["avg"];
  }

  const [firstStatistic] = series.availableStatistics;

  return firstStatistic ? [firstStatistic] : [];
}

function areStatisticListsEqual(
  left: StudioStreamAggregationStatistic[] | undefined,
  right: StudioStreamAggregationStatistic[],
): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }

  return left.every((statistic, index) => statistic === right[index]);
}

function normalizeStoredStatistics(
  statistics: StudioStreamAggregationStatistic[] | undefined,
): StudioStreamAggregationStatistic[] {
  if (!statistics || statistics.length === 0) {
    return [];
  }

  const nextStatistics: StudioStreamAggregationStatistic[] = [];

  for (const statistic of statistics) {
    if (nextStatistics.includes(statistic)) {
      continue;
    }

    nextStatistics.push(statistic);
  }

  return nextStatistics;
}

function mergeSelectableStatistics(args: {
  enabledStatistics: StudioStreamAggregationStatistic[];
  series: StudioStreamAggregationSeries;
}): StudioStreamAggregationStatistic[] {
  const nextStatistics = [...args.series.availableStatistics];

  for (const statistic of args.enabledStatistics) {
    if (nextStatistics.includes(statistic)) {
      continue;
    }

    nextStatistics.push(statistic);
  }

  return nextStatistics;
}

function StreamAggregationSparkline(props: {
  kind: StudioStreamAggregationMeasureKind;
  points: StudioStreamAggregationPoint[];
  statistic: StudioStreamAggregationStatistic;
}) {
  const { kind, points, statistic } = props;
  const gradientId = useId();
  const finiteValues = useMemo(
    () =>
      points
        .map((point) => getStatisticValue(point.statistics, statistic))
        .filter(
          (value): value is number => value !== null && Number.isFinite(value),
        ),
    [points, statistic],
  );
  const resolvedValues = useMemo(() => {
    const firstFiniteValue = finiteValues[0];

    if (firstFiniteValue === undefined) {
      return [];
    }

    let previousValue = firstFiniteValue;

    return points.map((point) => {
      const currentValue = getStatisticValue(point.statistics, statistic);

      if (typeof currentValue === "number" && Number.isFinite(currentValue)) {
        previousValue = currentValue;
      }

      return previousValue;
    });
  }, [finiteValues, points, statistic]);
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
        strokeWidth="1.4"
      />
    </svg>
  );
}

function StreamAggregationStatisticBadge(props: {
  availableStatistics: StudioStreamAggregationStatistic[];
  enabledStatistics: StudioStreamAggregationStatistic[];
  onStatisticToggle: (
    statistic: StudioStreamAggregationStatistic,
    enabled: boolean,
  ) => void;
  statistic: StudioStreamAggregationStatistic;
}) {
  const {
    availableStatistics,
    enabledStatistics,
    onStatisticToggle,
    statistic,
  } = props;

  if (availableStatistics.length <= 1) {
    return (
      <span className="text-xs font-medium text-muted-foreground">
        {STATISTIC_LABELS[statistic]}
      </span>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(INTERACTIVE_TRIGGER_CLASS_NAME, "min-w-0")}
          data-testid="stream-aggregation-statistic-trigger"
          size="sm"
          type="button"
          variant="ghost"
        >
          {STATISTIC_LABELS[statistic]}
          <ChevronDown className={INTERACTIVE_TRIGGER_ICON_CLASS_NAME} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-sans">
        {availableStatistics.map((availableStatistic) => (
          <DropdownMenuCheckboxItem
            key={availableStatistic}
            checked={enabledStatistics.includes(availableStatistic)}
            className="font-sans"
            onCheckedChange={(checked) => {
              onStatisticToggle(availableStatistic, checked === true);
            }}
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            {STATISTIC_LABELS[availableStatistic]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StreamAggregationUnitControl(props: {
  displayUnit: DisplayUnitOption | null;
  onDisplayUnitChange: (unitId: string) => void;
  rawUnit: string | null;
  subtitle: string | null;
}) {
  const { displayUnit, onDisplayUnitChange, rawUnit, subtitle } = props;
  const unitFamily = resolveDisplayUnitFamily(rawUnit);
  const visibleLabel = displayUnit?.label ?? rawUnit ?? subtitle;

  if (!visibleLabel) {
    return null;
  }

  if (!unitFamily || unitFamily.options.length <= 1) {
    return (
      <p className="max-w-full truncate text-xs font-medium leading-none text-muted-foreground">
        {visibleLabel}
      </p>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(
            INTERACTIVE_TRIGGER_CLASS_NAME,
            "h-5 max-w-full px-1 text-xs",
          )}
          data-testid="stream-aggregation-unit-trigger"
          size="sm"
          type="button"
          variant="ghost"
        >
          {visibleLabel}
          <ChevronDown className={INTERACTIVE_TRIGGER_ICON_CLASS_NAME} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="font-sans">
        <DropdownMenuRadioGroup
          onValueChange={onDisplayUnitChange}
          value={displayUnit?.id ?? ""}
        >
          {unitFamily.options.map((option) => (
            <DropdownMenuRadioItem
              key={option.id}
              className="font-sans"
              value={option.id}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StreamAggregationCard(props: {
  availableStatistics: StudioStreamAggregationStatistic[];
  displayUnit: DisplayUnitOption | null;
  enabledStatistics: StudioStreamAggregationStatistic[];
  kind: StudioStreamAggregationMeasureKind;
  label: string;
  onDisplayUnitChange: (unitId: string) => void;
  onStatisticToggle: (
    statistic: StudioStreamAggregationStatistic,
    enabled: boolean,
  ) => void;
  points: StudioStreamAggregationPoint[];
  rawUnit: string | null;
  showStatisticMenu: boolean;
  statistic: StudioStreamAggregationStatistic;
  subtitle: string | null;
  value: number | null;
}) {
  const {
    availableStatistics,
    displayUnit,
    enabledStatistics,
    kind,
    label,
    onDisplayUnitChange,
    onStatisticToggle,
    points,
    rawUnit,
    showStatisticMenu,
    statistic,
    subtitle,
    value,
  } = props;

  return (
    <Card
      className="relative min-h-40 w-full overflow-hidden border-border/70 bg-card/90 [contain:layout_paint]"
      data-testid="stream-aggregation-card"
    >
      <CardContent className="relative flex h-full min-h-40 min-w-0 flex-col justify-between p-4">
        <div className="relative z-10 flex min-w-0 flex-col items-start gap-1.5">
          <p
            className="w-full truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
            data-testid="stream-aggregation-label"
          >
            {label}
          </p>
          <div className="flex min-w-0 max-w-full flex-col items-start gap-0">
            <StreamAggregationUnitControl
              displayUnit={displayUnit}
              onDisplayUnitChange={onDisplayUnitChange}
              rawUnit={rawUnit}
              subtitle={subtitle}
            />
            <div className="-mt-0.5">
              {showStatisticMenu ? (
                <StreamAggregationStatisticBadge
                  availableStatistics={availableStatistics}
                  enabledStatistics={enabledStatistics}
                  onStatisticToggle={onStatisticToggle}
                  statistic={statistic}
                />
              ) : (
                <span
                  className="text-xs font-medium leading-none text-muted-foreground"
                  data-testid="stream-aggregation-statistic-text"
                >
                  {STATISTIC_LABELS[statistic]}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center py-4">
          <span
            className="text-center text-4xl font-semibold tracking-tight text-foreground"
            data-testid="stream-aggregation-value"
          >
            {formatAggregationValue(value, statistic, displayUnit)}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 opacity-80">
          <StreamAggregationSparkline
            kind={kind}
            points={points}
            statistic={statistic}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function StreamAggregationsPanel(props: StreamAggregationsPanelProps) {
  const {
    aggregationRollups,
    liveUpdatesEnabled,
    onRangeSelectionChange,
    rangeSelection,
    streamName,
  } = props;
  const enabledStatisticsStateKey = streamName
    ? `stream:${streamName}:aggregation-enabled-statistics`
    : undefined;
  const displayUnitStateKey = streamName
    ? `stream:${streamName}:aggregation-display-units`
    : undefined;
  const [isCustomRangeOpen, setIsCustomRangeOpen] = useState(false);
  const [absoluteRangeDraft, setAbsoluteRangeDraft] =
    useState<AbsoluteRangeDraft>(() =>
      createAbsoluteRangeDraft(rangeSelection),
    );
  const rangeSelectionKind = rangeSelection.kind;
  const rangeSelectionDuration =
    rangeSelectionKind === "relative" ? rangeSelection.duration : null;
  const rangeSelectionFromIso =
    rangeSelectionKind === "absolute" ? rangeSelection.fromIso : null;
  const rangeSelectionToIso =
    rangeSelectionKind === "absolute" ? rangeSelection.toIso : null;
  const absoluteRangeDraftSeed = useMemo(() => {
    if (
      rangeSelectionKind === "absolute" &&
      rangeSelectionFromIso &&
      rangeSelectionToIso
    ) {
      return createAbsoluteRangeDraft({
        fromIso: rangeSelectionFromIso,
        kind: "absolute",
        toIso: rangeSelectionToIso,
      });
    }

    return createAbsoluteRangeDraft({
      duration: rangeSelectionDuration ?? "1h",
      kind: "relative",
    });
  }, [
    rangeSelectionKind,
    rangeSelectionDuration,
    rangeSelectionFromIso,
    rangeSelectionToIso,
  ]);
  const [enabledStatisticsBySeriesId, setEnabledStatisticsBySeriesId] =
    useUiState<Record<string, StudioStreamAggregationStatistic[]>>(
      enabledStatisticsStateKey,
      {},
    );
  const [displayUnitBySeriesId, setDisplayUnitBySeriesId] = useUiState<
    Record<string, string>
  >(displayUnitStateKey, {});
  const absoluteRangeFieldId = useId();
  const absoluteFromIso = parseLocalDateAndTimeInputValue(
    absoluteRangeDraft.fromDateValue,
    absoluteRangeDraft.fromTimeValue,
  );
  const absoluteToIso = parseLocalDateAndTimeInputValue(
    absoluteRangeDraft.toDateValue,
    absoluteRangeDraft.toTimeValue,
  );
  const canApplyAbsoluteRange =
    absoluteFromIso !== null &&
    absoluteToIso !== null &&
    Date.parse(absoluteFromIso) < Date.parse(absoluteToIso);
  const { aggregations, error, isError, isLoading } = useStreamAggregations({
    aggregationRollups,
    enabled: true,
    liveUpdatesEnabled,
    rangeSelection,
    streamName,
  });
  const aggregationSeries = useMemo(
    () => aggregations.flatMap((aggregation) => aggregation.series),
    [aggregations],
  );
  const aggregationSeriesById = useMemo(
    () =>
      new Map(aggregationSeries.map((series) => [series.id, series] as const)),
    [aggregationSeries],
  );
  const aggregationColumns = useMemo<StreamAggregationColumnData[]>(
    () =>
      aggregationSeries
        .map((series) => {
          const storedEnabledStatistics = normalizeStoredStatistics(
            enabledStatisticsBySeriesId[series.id],
          );
          const enabledStatistics =
            storedEnabledStatistics.length > 0
              ? storedEnabledStatistics
              : createDefaultEnabledStatistics(series);
          const primaryStatistic = enabledStatistics[0];
          const primaryValue =
            primaryStatistic === undefined
              ? null
              : getStatisticValue(series.statisticValues, primaryStatistic);
          const displayUnit = resolveDisplayUnitOption({
            preferredUnitId: displayUnitBySeriesId[series.id],
            rawUnit: series.unit,
            value: primaryValue,
          });

          return {
            availableStatistics: mergeSelectableStatistics({
              enabledStatistics,
              series,
            }),
            displayUnit,
            enabledStatistics,
            primaryValue,
            series,
          };
        })
        .sort((left, right) => {
          const leftValue = left.primaryValue;
          const rightValue = right.primaryValue;

          if (
            leftValue !== null &&
            rightValue !== null &&
            leftValue !== rightValue
          ) {
            return rightValue - leftValue;
          }

          return left.series.label.localeCompare(right.series.label);
        }),
    [aggregationSeries, displayUnitBySeriesId, enabledStatisticsBySeriesId],
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

    setAbsoluteRangeDraft(absoluteRangeDraftSeed);
  }, [absoluteRangeDraftSeed, isCustomRangeOpen]);

  return (
    <section
      className="min-w-0 overflow-hidden border-b border-border bg-muted/20 px-4 py-4"
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
              <PopoverContent
                align="end"
                className="max-h-[min(34rem,calc(100vh-3rem))] w-[32rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-border/80 bg-background/98 p-0 font-sans shadow-xl shadow-black/5"
                data-testid="stream-aggregations-custom-range-popover"
                sideOffset={8}
              >
                <div className="grid font-sans">
                  <div className="grid gap-3 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
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
                            className="h-9 justify-start rounded-lg border-border/70 bg-muted/25 px-3 font-sans shadow-none hover:bg-accent"
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

                  <div className="border-t border-border/70 bg-muted/20 p-4">
                    <div className="grid gap-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Absolute time range
                      </p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-2 rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
                          <Label
                            className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"
                            htmlFor={`${absoluteRangeFieldId}-from-date`}
                          >
                            From
                          </Label>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.25rem]">
                            <Input
                              className="font-sans"
                              data-testid="stream-aggregations-range-from-date"
                              id={`${absoluteRangeFieldId}-from-date`}
                              onChange={(event) => {
                                setAbsoluteRangeDraft((currentValue) => ({
                                  ...currentValue,
                                  fromDateValue: event.currentTarget.value,
                                }));
                              }}
                              type="date"
                              value={absoluteRangeDraft.fromDateValue}
                            />
                            <Input
                              className="font-sans tabular-nums"
                              data-testid="stream-aggregations-range-from-time"
                              id={`${absoluteRangeFieldId}-from-time`}
                              onChange={(event) => {
                                setAbsoluteRangeDraft((currentValue) => ({
                                  ...currentValue,
                                  fromTimeValue: event.currentTarget.value,
                                }));
                              }}
                              step={60}
                              type="time"
                              value={absoluteRangeDraft.fromTimeValue}
                            />
                          </div>
                        </div>
                        <div className="grid gap-2 rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
                          <Label
                            className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"
                            htmlFor={`${absoluteRangeFieldId}-to-date`}
                          >
                            To
                          </Label>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.25rem]">
                            <Input
                              className="font-sans"
                              data-testid="stream-aggregations-range-to-date"
                              id={`${absoluteRangeFieldId}-to-date`}
                              onChange={(event) => {
                                setAbsoluteRangeDraft((currentValue) => ({
                                  ...currentValue,
                                  toDateValue: event.currentTarget.value,
                                }));
                              }}
                              type="date"
                              value={absoluteRangeDraft.toDateValue}
                            />
                            <Input
                              className="font-sans tabular-nums"
                              data-testid="stream-aggregations-range-to-time"
                              id={`${absoluteRangeFieldId}-to-time`}
                              onChange={(event) => {
                                setAbsoluteRangeDraft((currentValue) => ({
                                  ...currentValue,
                                  toTimeValue: event.currentTarget.value,
                                }));
                              }}
                              step={60}
                              type="time"
                              value={absoluteRangeDraft.toTimeValue}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                        <p className="max-w-[24rem] text-xs leading-5 text-muted-foreground">
                          Local time inputs are converted to UTC for the Streams
                          query.
                        </p>
                        <Button
                          className="h-9 rounded-lg px-4 shadow-sm"
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

      <div className="mt-4 min-w-0">
        {isLoading ? (
          <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-1">
            {Array.from({ length: 3 }, (_unused, index) => (
              <Card
                key={index}
                className={cn(
                  STREAM_AGGREGATION_COLUMN_CLASS_NAME,
                  "min-h-40 border-border/70 bg-card/90",
                )}
              >
                <CardContent className="flex h-full min-h-40 flex-col justify-between p-4">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
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
        ) : aggregationColumns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
            No rollup data is available for this range yet.
          </div>
        ) : (
          <div
            className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden pb-1"
            data-testid="stream-aggregations-scroll-area"
          >
            <div className="flex w-max min-w-full gap-3">
              {aggregationColumns.map((column) => (
                <div
                  key={column.series.id}
                  className={cn(
                    STREAM_AGGREGATION_COLUMN_CLASS_NAME,
                    "flex flex-col gap-3 [contain:layout_paint]",
                  )}
                  data-testid="stream-aggregation-column"
                >
                  {column.enabledStatistics.map((statistic, statisticIndex) => (
                    <StreamAggregationCard
                      key={`${column.series.id}:${statistic}`}
                      availableStatistics={column.availableStatistics}
                      displayUnit={column.displayUnit}
                      enabledStatistics={column.enabledStatistics}
                      kind={column.series.kind}
                      label={column.series.label}
                      onDisplayUnitChange={(unitId) => {
                        setDisplayUnitBySeriesId((currentValue) => {
                          if (currentValue[column.series.id] === unitId) {
                            return currentValue;
                          }

                          return {
                            ...currentValue,
                            [column.series.id]: unitId,
                          };
                        });
                      }}
                      onStatisticToggle={(nextStatistic, enabled) => {
                        const series = aggregationSeriesById.get(
                          column.series.id,
                        );

                        if (!series) {
                          return;
                        }

                        setEnabledStatisticsBySeriesId((currentValue) => {
                          const currentStatistics = normalizeStoredStatistics(
                            currentValue[column.series.id],
                          );
                          const currentEnabledStatistics =
                            currentStatistics.length > 0
                              ? currentStatistics
                              : createDefaultEnabledStatistics(series);
                          const nextStatistics = enabled
                            ? column.availableStatistics.filter(
                                (availableStatistic) =>
                                  currentEnabledStatistics.includes(
                                    availableStatistic,
                                  ) || availableStatistic === nextStatistic,
                              )
                            : currentEnabledStatistics.filter(
                                (availableStatistic) =>
                                  availableStatistic !== nextStatistic,
                              );

                          if (nextStatistics.length === 0) {
                            return currentValue;
                          }

                          if (
                            areStatisticListsEqual(
                              currentValue[column.series.id],
                              nextStatistics,
                            )
                          ) {
                            return currentValue;
                          }

                          return {
                            ...currentValue,
                            [column.series.id]: nextStatistics,
                          };
                        });
                      }}
                      points={column.series.points}
                      rawUnit={column.series.unit}
                      showStatisticMenu={statisticIndex === 0}
                      statistic={statistic}
                      subtitle={getDisplayedSubtitle({
                        displayUnit: column.displayUnit,
                        series: column.series,
                      })}
                      value={getStatisticValue(
                        column.series.statisticValues,
                        statistic,
                      )}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
