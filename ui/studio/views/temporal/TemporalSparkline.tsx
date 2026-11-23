import { useId } from "react";

import { cn } from "@/ui/lib/utils";

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
 */
export function TemporalSparkline(props: {
  className?: string;
  formatValue?: (value: number) => string;
  height?: number;
  label: string;
  tone?: SparklineTone;
  values: readonly number[];
  width?: number;
}) {
  const {
    className,
    formatValue = (v) => String(v),
    height = 22,
    label,
    tone = "info",
    values,
    width = 76,
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
  const range = max - min;
  const toY = (value: number) => {
    if (range === 0) {
      return value === 0 ? height - padY : padY + innerH / 2;
    }
    return padY + innerH - ((value - min) / range) * innerH;
  };

  const points =
    values.length === 1
      ? [
          { x: padX, y: toY(values[0]!) },
          { x: width - padX, y: toY(values[0]!) },
        ]
      : values.map((value, index) => ({
          x: padX + (index / (values.length - 1)) * innerW,
          y: toY(value),
        }));

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const areaPath = `${linePath} L${last.x.toFixed(1)},${(height - 1).toFixed(1)} L${first.x.toFixed(1)},${(height - 1).toFixed(1)} Z`;
  const summary = `${label}: now ${formatValue(latest)} (min ${formatValue(min)}, max ${formatValue(max)} across ${values.length} ${values.length === 1 ? "sample" : "samples"})`;

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
  tone?: SparklineTone;
  value: string;
  values: readonly number[];
}) {
  const { formatValue, label, tone = "info", value, values } = props;

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
        tone={tone}
        values={values}
        width={80}
      />
    </div>
  );
}
