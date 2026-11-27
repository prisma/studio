import { useId } from "react";

import { cn } from "@/ui/lib/utils";

import { formatDuration } from "./temporal-utils";

type SparklineTone = "danger" | "info" | "muted" | "warning";

const STROKE_CLASS: Record<SparklineTone, string> = {
  danger: "stroke-destructive",
  info: "stroke-prism-cyan-600 dark:stroke-prism-cyan-400",
  muted: "stroke-muted-foreground",
  warning: "stroke-amber-500",
};

const FILL_CLASS: Record<SparklineTone, string> = {
  danger: "fill-destructive/15",
  info: "fill-prism-cyan-500/15",
  muted: "fill-muted-foreground/10",
  warning: "fill-amber-500/15",
};

const DOT_CLASS: Record<SparklineTone, string> = {
  danger: "fill-destructive",
  info: "fill-prism-cyan-600 dark:fill-prism-cyan-400",
  muted: "fill-muted-foreground",
  warning: "fill-amber-500",
};

/**
 * Compact SVG sparkline for rolling 5-minute metrics. Handles 0, 1, or flat
 * series cleanly without layout shift.
 *
 * The vertical axis starts at zero, so a step from 105 to 106 reads as small.
 * With `times` the samples sit where they were taken, so a gap between
 * samples is as wide as the time it lasted.
 */
export function TemporalSparkline(props: {
  className?: string;
  formatValue?: (value: number) => string;
  height?: number;
  label: string;
  /** When each value was sampled, in milliseconds. Same length as `values`. */
  times?: readonly number[];
  tone?: SparklineTone;
  values: readonly number[];
  width?: number;
  /** The time the full width stands for. Without it, the samples fill the width. */
  windowMs?: number;
}) {
  const {
    className,
    formatValue = (v) => String(v),
    height = 22,
    label,
    times,
    tone = "info",
    values,
    width = 76,
    windowMs,
  } = props;
  const clipId = useId();
  const padX = 2;
  const padY = 3;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);

  if (values.length === 0) {
    return (
      <svg
        role="img"
        aria-label={`${label}: no samples yet`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn("shrink-0 overflow-visible", className)}
      >
        <line
          x1={padX}
          y1={height / 2}
          x2={width - padX}
          y2={height / 2}
          className="stroke-border"
          strokeDasharray="2 2"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const latest = values[values.length - 1]!;
  const floor = Math.min(0, min);
  const range = max - floor;
  const toY = (value: number) =>
    range === 0
      ? height - padY
      : padY + innerH - ((value - floor) / range) * innerH;

  const sampleTimes =
    times && times.length === values.length && values.length > 0
      ? times
      : undefined;
  const lastTime = sampleTimes?.[sampleTimes.length - 1];
  const spanMs =
    sampleTimes && lastTime !== undefined ? lastTime - sampleTimes[0]! : 0;
  const axisMs = Math.max(windowMs ?? spanMs, spanMs);
  const toX = (index: number) => {
    if (sampleTimes && lastTime !== undefined) {
      return axisMs === 0
        ? width - padX
        : width - padX - ((lastTime - sampleTimes[index]!) / axisMs) * innerW;
    }

    return values.length === 1
      ? width - padX
      : padX + (index / (values.length - 1)) * innerW;
  };

  const points =
    values.length === 1 && !sampleTimes
      ? [
          { x: padX, y: toY(values[0]!) },
          { x: width - padX, y: toY(values[0]!) },
        ]
      : values.map((value, index) => ({ x: toX(index), y: toY(value) }));

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const areaPath = `${linePath} L${last.x.toFixed(1)},${(height - 1).toFixed(1)} L${first.x.toFixed(1)},${(height - 1).toFixed(1)} Z`;
  const sampleCount = `${values.length} ${values.length === 1 ? "sample" : "samples"}`;
  const summary = `${label}: now ${formatValue(latest)} (min ${formatValue(min)}, max ${formatValue(max)} across ${sampleCount}${sampleTimes && spanMs > 0 ? ` over ${formatDuration(spanMs)}` : ""})`;

  return (
    <svg
      role="img"
      aria-label={summary}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <title>{summary}</title>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={areaPath} className={FILL_CLASS[tone]} />
        <path
          d={linePath}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          className={STROKE_CLASS[tone]}
        />
        <circle cx={last.x} cy={last.y} r={2} className={DOT_CLASS[tone]} />
      </g>
    </svg>
  );
}

/** Compact metric tile with a live number and rolling 5-minute sparkline. */
export function TemporalSparklineCard(props: {
  formatValue?: (value: number) => string;
  label: string;
  times?: readonly number[];
  tone?: SparklineTone;
  value: string;
  values: readonly number[];
  windowMs?: number;
}) {
  const {
    formatValue,
    label,
    times,
    tone = "info",
    value,
    values,
    windowMs,
  } = props;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-2xs text-muted-foreground">{label}</span>
        <span className="font-mono text-sm font-medium tabular-nums text-foreground">
          {value}
        </span>
      </div>
      <TemporalSparkline
        formatValue={formatValue}
        height={26}
        label={label}
        times={times}
        tone={tone}
        values={values}
        width={80}
        windowMs={windowMs}
      />
    </div>
  );
}
