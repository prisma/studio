import { useCallback, useRef, useState } from "react";

import { upsertQueryInsights, upsertQueryInsightsPauseBuffer } from "./rows";
import {
  QUERY_INSIGHTS_MAX_QUERIES,
  QUERY_INSIGHTS_PAUSE_BUFFER_LIMIT,
  type QueryInsightsQuery,
  type QueryInsightsStreamQuery,
} from "./types";

export function useQueryInsightsRows() {
  const [queriesMap, setQueriesMap] = useState<Map<string, QueryInsightsQuery>>(
    new Map(),
  );
  const queriesMapRef = useRef(queriesMap);
  const pauseBufferRef = useRef<Map<string, QueryInsightsQuery>>(new Map());
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [pauseBufferSize, setPauseBufferSize] = useState(0);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(
    new Set(),
  );
  const [flushedIds, setFlushedIds] = useState<Set<string>>(new Set());
  const recentlyAddedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const flushedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRecentlyAdded = useCallback(() => {
    if (recentlyAddedTimeoutRef.current) {
      clearTimeout(recentlyAddedTimeoutRef.current);
    }

    recentlyAddedTimeoutRef.current = setTimeout(() => {
      setRecentlyAddedIds(new Set());
      recentlyAddedTimeoutRef.current = null;
    }, 600);
  }, []);

  const ingestQueries = useCallback(
    (queries: QueryInsightsStreamQuery[]) => {
      if (queries.length === 0) {
        return;
      }

      if (isPausedRef.current) {
        const nextBuffer = upsertQueryInsightsPauseBuffer(
          pauseBufferRef.current,
          queries,
          QUERY_INSIGHTS_PAUSE_BUFFER_LIMIT,
        );
        pauseBufferRef.current = nextBuffer;
        setPauseBufferSize(
          Array.from(nextBuffer.values()).reduce(
            (sum, query) => sum + query.count,
            0,
          ),
        );
        return;
      }

      setQueriesMap((current) => {
        const { next, newIds } = upsertQueryInsights(
          current,
          queries,
          QUERY_INSIGHTS_MAX_QUERIES,
        );
        queriesMapRef.current = next;

        if (newIds.length > 0) {
          setRecentlyAddedIds((previous) => {
            const nextIds = new Set(previous);

            for (const id of newIds) {
              nextIds.add(id);
            }

            return nextIds;
          });
          clearRecentlyAdded();
        }

        return next;
      });
    },
    [clearRecentlyAdded],
  );

  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    const bufferedIds = new Set(pauseBufferRef.current.keys());

    setQueriesMap((current) => {
      const incomingRows = Array.from(pauseBufferRef.current.values()).map(
        (query) => ({
          count: query.count,
          durationMs: query.duration,
          groupKey: query.groupKey,
          maxDurationMs: query.maxDurationMs,
          minDurationMs: query.minDurationMs,
          prismaQueryInfo: query.prismaQueryInfo ?? null,
          queryId: query.queryId,
          reads: query.reads,
          rowsReturned: query.rowsReturned,
          sql: query.query,
          tables: query.tables,
          ts: query.lastSeen,
        }),
      );
      const { next } = upsertQueryInsights(
        current,
        incomingRows,
        QUERY_INSIGHTS_MAX_QUERIES,
      );
      queriesMapRef.current = next;
      return next;
    });

    pauseBufferRef.current = new Map();
    setPauseBufferSize(0);
    isPausedRef.current = false;
    setIsPaused(false);
    setFlushedIds(bufferedIds);

    if (flushedTimeoutRef.current) {
      clearTimeout(flushedTimeoutRef.current);
    }

    flushedTimeoutRef.current = setTimeout(() => {
      setFlushedIds(new Set());
      flushedTimeoutRef.current = null;
    }, 1500);
  }, []);

  return {
    flushedIds,
    ingestQueries,
    isAtLimit: queriesMap.size >= QUERY_INSIGHTS_MAX_QUERIES,
    isPaused,
    pause,
    pauseBufferSize,
    queries: Array.from(queriesMap.values()),
    recentlyAddedIds,
    resume,
  };
}
