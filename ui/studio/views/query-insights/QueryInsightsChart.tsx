import { useEffect, useMemo, useRef } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/components/ui/card";

import type { QueryInsightsChartPoint } from "./types";

type ChartKind = "latency" | "qps";

function formatMetric(
  value: number,
  kind: ChartKind,
): {
  unit: string;
  value: string;
} {
  if (kind === "qps") {
    return {
      unit: "queries/sec",
      value: value.toFixed(1),
    };
  }

  if (value >= 1_000) {
    return {
      unit: "seconds",
      value: (value / 1_000).toFixed(2),
    };
  }

  if (value >= 1) {
    return {
      unit: "milliseconds",
      value: value.toFixed(0),
    };
  }

  return {
    unit: "milliseconds",
    value: value.toFixed(2),
  };
}

function getCssVariable(name: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value || fallback;
}

function getElementFontFamily(element: HTMLElement): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.getComputedStyle(element).fontFamily || undefined;
}

export function QueryInsightsChart(props: {
  data: QueryInsightsChartPoint[];
  kind: ChartKind;
  loading?: boolean;
  pollingIntervalMs?: number;
  title: string;
}) {
  const {
    data,
    kind,
    loading = false,
    pollingIntervalMs = 1_000,
    title,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<{ destroy(): void } | null>(null);
  const values = useMemo(() => {
    if (kind === "qps") {
      return data.map((point) =>
        Number((point.queryCount / (pollingIntervalMs / 1_000)).toFixed(2)),
      );
    }

    return data.map((point) => point.avgDurationMs);
  }, [data, kind, pollingIntervalMs]);
  const headlineValue = useMemo(() => {
    if (kind === "qps") {
      return values.at(-1) ?? 0;
    }

    const totalQueries = data.reduce(
      (total, point) => total + point.queryCount,
      0,
    );

    if (totalQueries === 0) {
      return 0;
    }

    return (
      data.reduce(
        (total, point) => total + point.avgDurationMs * point.queryCount,
        0,
      ) / totalQueries
    );
  }, [data, kind, values]);
  const headline = formatMetric(headlineValue, kind);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || loading) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    let isCanceled = false;

    void import("chart.js/auto")
      .then(({ default: Chart }) => {
        if (isCanceled) {
          return;
        }

        chartRef.current?.destroy();

        const labels = data.map((point) =>
          new Date(point.ts).toISOString().slice(11, 19),
        );
        const primary = getCssVariable(
          "--primary",
          "oklch(0.64 0.1423 268.56)",
        );
        const muted = getCssVariable(
          "--muted-foreground",
          "oklch(0.552 0.016 285.938)",
        );
        const border = getCssVariable("--border", "oklch(0.92 0.004 286.32)");
        const fontFamily = getElementFontFamily(canvas);

        chartRef.current = new Chart(context, {
          data: {
            datasets: [
              {
                ...(kind === "latency"
                  ? {
                      barPercentage: 0.7,
                      categoryPercentage: 0.75,
                      maxBarThickness: 48,
                    }
                  : {
                      pointHitRadius: 8,
                      pointHoverRadius: 4,
                    }),
                backgroundColor: kind === "latency" ? primary : "transparent",
                borderColor: primary,
                borderWidth: 2,
                data: values,
                fill: false,
                pointRadius: kind === "qps" ? 2 : 0,
                tension: 0.2,
              },
            ],
            labels,
          },
          options: {
            animation: false,
            font: {
              family: fontFamily,
              size: 11,
            },
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label(context) {
                    const value = Number(context.parsed.y ?? 0);
                    return kind === "qps"
                      ? `${value.toFixed(1)} QPS`
                      : `${value.toFixed(2)}ms`;
                  },
                },
              },
            },
            scales: {
              x: {
                display: false,
                grid: { display: false },
              },
              y: {
                beginAtZero: true,
                border: { display: false },
                grid: { color: border },
                ticks: {
                  color: muted,
                  maxTicksLimit: 3,
                },
              },
            },
          },
          type: kind === "latency" ? "bar" : "line",
        });
      })
      .catch(() => undefined);

    return () => {
      isCanceled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [data, kind, loading, values]);

  return (
    <Card className="min-h-0 rounded-md border-border bg-card shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-sm font-medium leading-5 tracking-normal">
            {title}
          </CardTitle>
          <CardDescription className="text-xs">{headline.unit}</CardDescription>
        </div>
        <div className="text-xl font-semibold leading-none tabular-nums">
          {headline.value}
        </div>
      </CardHeader>
      <CardContent className="h-32 p-4 pt-0">
        {loading ? (
          <div className="h-full rounded-md bg-muted" />
        ) : (
          <canvas
            aria-label={`${title} chart`}
            className="h-full w-full"
            ref={canvasRef}
          />
        )}
      </CardContent>
    </Card>
  );
}
