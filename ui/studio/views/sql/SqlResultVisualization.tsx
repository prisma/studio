import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../../../lib/utils";
import {
  createSqlResultVisualizationChart,
  resolveSqlResultVisualization,
  type SqlResultVisualizationChartType,
} from "./sql-result-visualization";

export type SqlResultVisualizationState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      config: import("chart.js").ChartConfiguration<SqlResultVisualizationChartType>;
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
  config: import("chart.js").ChartConfiguration<SqlResultVisualizationChartType>;
}

export function useSqlResultVisualization(
  args: UseSqlResultVisualizationArgs,
) {
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
    typeof requestAiVisualization === "function" && typeof querySql === "string";

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
  }, [autoGenerate, canGenerate, querySql, resetKey, startVisualizationGeneration]);

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const chart = createSqlResultVisualizationChart(canvasRef.current, config);

    return () => {
      chart.destroy();
    };
  }, [config]);

  return (
    <div
      className={cn(
        "h-72 mx-auto w-[clamp(300px,calc(100cqw-2rem),1200px)] min-w-[300px] max-w-[1200px]",
        className,
      )}
      data-testid="sql-result-visualization-chart"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
