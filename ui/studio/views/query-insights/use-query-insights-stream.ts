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

function createBrowserUrl(
  rawUrl: string,
  updateSearchParams: (searchParams: URLSearchParams) => void,
): string {
  const baseUrl =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(rawUrl, `${baseUrl}/`);

  updateSearchParams(url.searchParams);

  if (/^https?:\/\//i.test(rawUrl)) {
    return url.toString();
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function createInitialSnapshotUrl(streamUrl: string): string {
  return createBrowserUrl(streamUrl, (searchParams) => {
    searchParams.delete("live");
    searchParams.delete("timeout");
  });
}

function createLiveStreamUrl(streamUrl: string, offset: string | null): string {
  if (!offset) {
    return streamUrl;
  }

  return createBrowserUrl(streamUrl, (searchParams) => {
    searchParams.set("offset", offset);
  });
}

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

    const abortController = new AbortController();
    let eventSource: EventSource | null = null;
    let isDisposed = false;

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

    const handlePrismaLogQueries = (queries: QueryInsightsStreamQuery[]) => {
      if (queries.length === 0) {
        return;
      }

      onQueries(queries);

      const chartTicks = createChartTicksFromQueries(queries);

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

    const openEventSource = (liveStreamUrl: string) => {
      if (isDisposed) {
        return;
      }

      eventSource = new EventSource(liveStreamUrl);

      eventSource.onopen = () => {
        setStatus("open");
      };
      eventSource.onerror = () => {
        setStatus("error");
        onError("The Query Insights stream disconnected.");
      };

      eventSource.addEventListener("queries", handleQueries);
      eventSource.addEventListener("chartTick", handleChartTick);
      eventSource.addEventListener("data", handlePrismaLogData);
      eventSource.addEventListener("error", handleStreamError);
    };

    void (async () => {
      let nextOffset: string | null = null;

      try {
        const response = await fetch(createInitialSnapshotUrl(streamUrl), {
          headers: {
            accept: "application/json",
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Could not load Query Insights snapshot (${response.status}).`,
          );
        }

        const text = await response.text();
        const decoded = safeDecodePrismaLogDataEvent(
          text.trim().length > 0 ? text : "[]",
        );

        if (!decoded.success || !decoded.data) {
          throw decoded.error ?? new Error("Could not decode prisma-log rows.");
        }

        if (!isDisposed) {
          handlePrismaLogQueries(decoded.data);
          nextOffset =
            response.headers.get("stream-next-offset") ??
            response.headers.get("Stream-Next-Offset");
        }
      } catch (error) {
        if (abortController.signal.aborted || isDisposed) {
          return;
        }

        onError(
          error instanceof Error
            ? error.message
            : "Could not load Query Insights snapshot.",
        );
      }

      openEventSource(createLiveStreamUrl(streamUrl, nextOffset));
    })();

    return () => {
      isDisposed = true;
      abortController.abort();

      eventSource?.removeEventListener("queries", handleQueries);
      eventSource?.removeEventListener("chartTick", handleChartTick);
      eventSource?.removeEventListener("data", handlePrismaLogData);
      eventSource?.removeEventListener("error", handleStreamError);
      eventSource?.close();
      setStatus("closed");
    };
  }, [onChartTicks, onError, onQueries, streamUrl]);

  return { status };
}
