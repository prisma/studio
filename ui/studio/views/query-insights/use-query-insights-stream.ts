import { useEffect, useState } from "react";

import {
  createChartTicksFromQueries,
  safeDecodeChartTickEvent,
  safeDecodePrismaLogDataEvent,
  safeDecodeQueriesEvent,
} from "./codecs";
import type {
  QueryInsightsChartPoint,
  QueryInsightsStreamQuery,
} from "./types";

export type QueryInsightsStreamStatus =
  | "closed"
  | "connecting"
  | "error"
  | "open";

export function useQueryInsightsStream(args: {
  onChartTicks: (points: QueryInsightsChartPoint[]) => void;
  onError: (message: string) => void;
  onQueries: (queries: QueryInsightsStreamQuery[]) => void;
  streamUrl: string;
}) {
  const { onChartTicks, onError, onQueries, streamUrl } = args;
  const [status, setStatus] = useState<QueryInsightsStreamStatus>("connecting");

  useEffect(() => {
    if (streamUrl.trim().length === 0) {
      setStatus("closed");
      return;
    }

    if (typeof EventSource !== "function") {
      setStatus("error");
      onError("EventSource is not available in this browser.");
      return;
    }

    setStatus("connecting");

    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      setStatus("open");
    };
    eventSource.onerror = () => {
      setStatus("error");
      onError("The Query Insights stream disconnected.");
    };

    const handleQueries = (event: MessageEvent<string>) => {
      const decoded = safeDecodeQueriesEvent(event.data);

      if (!decoded.success || !decoded.data) {
        onError(decoded.error?.message ?? "Could not decode query events.");
        return;
      }

      onQueries(decoded.data);
    };

    const handleChartTick = (event: MessageEvent<string>) => {
      const decoded = safeDecodeChartTickEvent(event.data);

      if (!decoded.success || !decoded.data) {
        onError(decoded.error?.message ?? "Could not decode chart events.");
        return;
      }

      onChartTicks([decoded.data]);
    };

    const handlePrismaLogData = (event: MessageEvent<string>) => {
      const decoded = safeDecodePrismaLogDataEvent(event.data);

      if (!decoded.success || !decoded.data) {
        onError(
          decoded.error?.message ?? "Could not decode prisma-log events.",
        );
        return;
      }

      if (decoded.data.length === 0) {
        return;
      }

      onQueries(decoded.data);

      const chartTicks = createChartTicksFromQueries(decoded.data);

      if (chartTicks.length > 0) {
        onChartTicks(chartTicks);
      }
    };

    const handleStreamError = (event: Event) => {
      const message =
        event instanceof MessageEvent && typeof event.data === "string"
          ? event.data
          : "Query Insights backend reported an error.";

      onError(message);
    };

    eventSource.addEventListener("queries", handleQueries);
    eventSource.addEventListener("chartTick", handleChartTick);
    eventSource.addEventListener("data", handlePrismaLogData);
    eventSource.addEventListener("error", handleStreamError);

    return () => {
      eventSource.removeEventListener("queries", handleQueries);
      eventSource.removeEventListener("chartTick", handleChartTick);
      eventSource.removeEventListener("data", handlePrismaLogData);
      eventSource.removeEventListener("error", handleStreamError);
      eventSource.close();
      setStatus("closed");
    };
  }, [onChartTicks, onError, onQueries, streamUrl]);

  return { status };
}
