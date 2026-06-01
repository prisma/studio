import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Bar } from "../../../components/charts/bar";
import { BarChart } from "../../../components/charts/bar-chart";
import { BarXAxis } from "../../../components/charts/bar-x-axis";
import { BarYAxis } from "../../../components/charts/bar-y-axis";
import { Grid } from "../../../components/charts/grid";
import { Line } from "../../../components/charts/line";
import { LineChart } from "../../../components/charts/line-chart";
import { PieChart } from "../../../components/charts/pie-chart";
import { PieSlice } from "../../../components/charts/pie-slice";
import { ChartTooltip } from "../../../components/charts/tooltip";
import { XAxis } from "../../../components/charts/x-axis";
import { cn } from "../../../lib/utils";
import {
  resolveSqlResultVisualization,
  type SqlResultVisualizationConfig,
  type SqlResultVisualizationSeries,
} from "./sql-result-visualization";

const SQL_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

interface ResolvedSqlResultVisualizationSeries {
  color: string;
  key: string;
  label?: string;
}

export type SqlResultVisualizationState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      config: SqlResultVisualizationConfig;
      status: "ready";
    }
  | { message: string; status: "error" };

interface UseSqlResultVisualizationArgs {
  requestAiVisualization?: (input: string) => Promise<string>;
  aiQueryRequest?: string | null;
  autoGenerate: boolean;
  databaseEngine: string;
  querySql: string | null;
  resetKey: number;
  rows: Record<string, unknown>[];
}

interface SqlResultVisualizationChartProps {
  className?: string;
  config: SqlResultVisualizationConfig;
}

export function useSqlResultVisualization(args: UseSqlResultVisualizationArgs) {
  const {
    requestAiVisualization,
    aiQueryRequest,
    autoGenerate,
    databaseEngine,
    querySql,
    resetKey,
    rows,
  } = args;
  const requestVersionRef = useRef(0);
  const [state, setState] = useState<SqlResultVisualizationState>({
    status: "idle",
  });
  const canGenerate =
    typeof requestAiVisualization === "function" &&
    typeof querySql === "string";

  const startVisualizationGeneration = useCallback(async () => {
    if (!requestAiVisualization || !querySql) {
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setState({ status: "loading" });

    try {
      const visualization = await resolveSqlResultVisualization({
        requestAiVisualization,
        aiQueryRequest,
        databaseEngine,
        querySql,
        rows,
      });

      if (requestVersionRef.current !== requestVersion) {
        return;
      }

      setState({
        config: visualization.config,
        status: "ready",
      });
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) {
        return;
      }

      setState({
        message:
          error instanceof Error
            ? error.message
            : "AI visualization generation failed.",
        status: "error",
      });
    }
  }, [aiQueryRequest, databaseEngine, querySql, requestAiVisualization, rows]);

  const generateVisualization = useCallback(() => {
    if (state.status !== "idle") {
      return;
    }

    void startVisualizationGeneration();
  }, [startVisualizationGeneration, state.status]);

  useEffect(() => {
    requestVersionRef.current += 1;

    if (!canGenerate) {
      setState((currentState) => {
        return currentState.status === "idle"
          ? currentState
          : { status: "idle" };
      });
      return;
    }

    if (autoGenerate) {
      void startVisualizationGeneration();
      return;
    }

    setState((currentState) => {
      return currentState.status === "idle" ? currentState : { status: "idle" };
    });
  }, [
    autoGenerate,
    canGenerate,
    querySql,
    resetKey,
    startVisualizationGeneration,
  ]);

  return {
    canGenerate,
    generateVisualization,
    state,
  };
}

export function SqlResultVisualizationChart(
  props: SqlResultVisualizationChartProps,
) {
  const { className, config } = props;

  return (
    <div
      className={cn(
        "mx-auto flex min-h-72 w-[clamp(300px,calc(100cqw-2rem),1200px)] min-w-[300px] max-w-[1200px] flex-col gap-3",
        className,
      )}
      data-testid="sql-result-visualization-chart"
    >
      {config.title ? (
        <div className="truncate text-sm font-medium text-foreground">
          {config.title}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <SqlResultVisualizationChartBody config={config} />
      </div>
    </div>
  );
}

function SqlResultVisualizationChartBody({
  config,
}: {
  config: SqlResultVisualizationConfig;
}) {
  if (config.type === "pie" || config.type === "doughnut") {
    return <SqlResultPieChart config={config} />;
  }

  if (config.type === "line") {
    return <SqlResultLineChart config={config} />;
  }

  return <SqlResultBarChart config={config} />;
}

function SqlResultBarChart({
  config,
}: {
  config: SqlResultVisualizationConfig;
}) {
  const series = useResolvedSeries(config.series);
  const isHorizontal = config.type === "horizontal-bar";

  return (
    <BarChart
      aspectRatio={isHorizontal ? "3 / 1" : "4 / 1"}
      barGap={isHorizontal ? 0.3 : 0.35}
      className="h-full min-h-64"
      data={config.data}
      margin={
        isHorizontal
          ? { bottom: 20, left: 112, right: 28, top: 12 }
          : { bottom: 38, left: 40, right: 24, top: 12 }
      }
      orientation={isHorizontal ? "horizontal" : "vertical"}
      stacked={config.stacked === true}
      stackGap={config.stacked === true ? 1 : 0}
      xDataKey={config.xKey}
    >
      <Grid
        fadeHorizontal={!isHorizontal}
        fadeVertical={isHorizontal}
        horizontal={!isHorizontal}
        strokeDasharray="0"
        vertical={isHorizontal}
      />
      {series.map((item) => (
        <Bar
          dataKey={item.key}
          fill={item.color}
          key={item.key}
          lineCap={4}
          stroke={item.color}
        />
      ))}
      <ChartTooltip
        rows={(point) => {
          return series.map((item) => ({
            color: item.color,
            label: item.label ?? item.key,
            value: formatTooltipValue(point[item.key]),
          }));
        }}
        showDatePill={false}
      />
      {isHorizontal ? (
        <BarYAxis maxLabels={10} showAllLabels={false} />
      ) : (
        <BarXAxis maxLabels={10} />
      )}
    </BarChart>
  );
}

function SqlResultLineChart({
  config,
}: {
  config: SqlResultVisualizationConfig;
}) {
  const series = useResolvedSeries(config.series);

  return (
    <LineChart
      aspectRatio="4 / 1"
      className="h-full min-h-64"
      data={config.data}
      margin={{ bottom: 38, left: 40, right: 24, top: 12 }}
      xDataKey={config.xKey}
    >
      <Grid strokeDasharray="0" vertical />
      {series.map((item) => (
        <Line
          dataKey={item.key}
          key={item.key}
          showMarkers
          stroke={item.color}
          strokeWidth={2.5}
        />
      ))}
      <ChartTooltip
        rows={(point) => {
          return series.map((item) => ({
            color: item.color,
            label: item.label ?? item.key,
            value: formatTooltipValue(point[item.key]),
          }));
        }}
      />
      <XAxis numTicks={5} />
    </LineChart>
  );
}

function SqlResultPieChart({
  config,
}: {
  config: SqlResultVisualizationConfig;
}) {
  const pieData = useMemo(() => {
    const labelKey = config.labelKey ?? "";
    const valueKey = config.valueKey ?? "";

    return config.data.reduce<
      { color: string; label: string; value: number }[]
    >((items, row, index) => {
      const value = row[valueKey];

      if (typeof value !== "number" || value <= 0) {
        return items;
      }

      items.push({
        color: getSqlChartColor(index),
        label: String(row[labelKey] ?? "Unknown"),
        value,
      });
      return items;
    }, []);
  }, [config.data, config.labelKey, config.valueKey]);

  if (pieData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No positive numeric values to visualize.
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-64 grid-cols-[minmax(14rem,1fr)_minmax(10rem,14rem)] items-center gap-6">
      <PieChart
        className="mx-auto"
        cornerRadius={4}
        data={pieData}
        innerRadius={config.type === "doughnut" ? 58 : 0}
        padAngle={0.012}
        size={240}
      >
        {pieData.map((item, index) => (
          <PieSlice
            color={item.color}
            hoverEffect="grow"
            index={index}
            key={`${item.label}-${index}`}
          />
        ))}
      </PieChart>
      <div className="flex min-w-0 flex-col gap-2 text-sm">
        {pieData.slice(0, 8).map((item, index) => (
          <div
            className="flex min-w-0 items-center justify-between gap-3"
            key={`${item.label}-${index}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-muted-foreground">
                {item.label}
              </span>
            </div>
            <span className="shrink-0 tabular-nums text-foreground">
              {formatNumber(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function useResolvedSeries(
  series: SqlResultVisualizationSeries[] | undefined,
): ResolvedSqlResultVisualizationSeries[] {
  return useMemo(() => {
    return (series ?? []).map((item, index) => {
      return {
        ...(item.label ? { label: item.label } : {}),
        color: item.color ?? getSqlChartColor(index),
        key: item.key,
      };
    });
  }, [series]);
}

function getSqlChartColor(index: number): string {
  return SQL_CHART_COLORS[index % SQL_CHART_COLORS.length] ?? "var(--chart-1)";
}

function formatTooltipValue(value: unknown): string | number {
  if (typeof value === "number") {
    return formatNumber(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return "n/a";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}
