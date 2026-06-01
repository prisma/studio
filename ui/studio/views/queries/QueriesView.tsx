import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Info,
  Loader2,
  Pause,
  Play,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  StudioQueryInsightQuery,
  StudioQueryInsights,
} from "@/data/query-insights";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../../components/ui/sheet";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../../components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import { cn } from "../../../lib/utils";
import { useStudio } from "../../context";
import { StudioHeader } from "../../StudioHeader";
import type { ViewProps } from "../View";
import {
  buildQueryInsightAnalysisPrompt,
  parseQueryInsightAnalysisResponse,
  type QueryInsightAnalysis,
  type QueryInsightAnalysisLevel,
} from "./query-insights-ai";

const DEFAULT_QUERY_LIMIT = 500;
const DEFAULT_POLLING_INTERVAL_MS = 1000;
const ALL_TABLES_VALUE = "__all__";
const AUTOMATIC_QUERY_ANALYSIS_LIMIT = 5;

type SortField = "rowsReturned" | "latency" | "executions" | "lastSeen";
type SortDirection = "asc" | "desc";
type QueryActivityWindowSeconds = 60 | 300 | 900 | 3600;
type QueryActivitySampleKind = "context" | "measured";

interface SortState {
  direction: SortDirection;
  field: SortField;
}

interface QueryActivitySample {
  averageLatencyMs: number | null;
  elapsedSeconds: number;
  executionCount: number;
  kind: QueryActivitySampleKind;
  queriesPerSecond: number | null;
  time: number;
  totalDurationMs: number;
}

interface QueryMetricSample {
  averageLatencyMs: number;
  elapsedSeconds: number;
  executionCount: number;
  kind: QueryActivitySampleKind;
  query: StudioQueryInsightQuery;
  reads: number;
  rowsReturned: number;
  time: number;
  totalDurationMs: number;
}

interface QueryActivityTotals {
  count: number;
  time: number;
  totalDurationMs: number;
}

interface QueryActivitySummary {
  averageLatencyMs: number | null;
  queriesPerSecond: number | null;
}

interface QueryActivityCache {
  pollingIntervalMs: number;
  querySamples: QueryMetricSample[];
  queriesById: Map<string, StudioQueryInsightQuery>;
  samples: QueryActivitySample[];
  totals: QueryActivityTotals | null;
}

const DEFAULT_SORT: SortState = {
  direction: "desc",
  field: "rowsReturned",
};

const DEFAULT_QUERY_ACTIVITY_WINDOW_SECONDS =
  300 satisfies QueryActivityWindowSeconds;
const MAX_QUERY_ACTIVITY_WINDOW_SECONDS =
  3600 satisfies QueryActivityWindowSeconds;

const QUERY_ACTIVITY_WINDOWS: Array<{
  label: string;
  value: QueryActivityWindowSeconds;
}> = [
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "15m", value: 900 },
  { label: "1h", value: 3600 },
];

const SORT_OPTIONS: Array<{
  label: string;
  value: `${SortField}:${SortDirection}`;
}> = [
  { label: "Rows returned high to low", value: "rowsReturned:desc" },
  { label: "Rows returned low to high", value: "rowsReturned:asc" },
  { label: "Latency high to low", value: "latency:desc" },
  { label: "Latency low to high", value: "latency:asc" },
  { label: "Executions high to low", value: "executions:desc" },
  { label: "Executions low to high", value: "executions:asc" },
  { label: "Last seen newest", value: "lastSeen:desc" },
  { label: "Last seen oldest", value: "lastSeen:asc" },
];

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

const TOOLBAR_SELECT_TRIGGER_CLASS =
  "h-7 min-w-0 rounded-md border-border/70 bg-muted/20 px-2.5 py-1 text-xs font-medium shadow-none transition-colors hover:bg-muted/30 data-[state=open]:border-border data-[state=open]:bg-background [&>div]:min-w-0 [&>div]:gap-0 [&>div]:overflow-hidden [&>div>span]:truncate";

const DEFAULT_QUERY_ACTIVITY_CHART_WIDTH = 640;
const MIN_QUERY_ACTIVITY_CHART_WIDTH = 320;
const QUERY_ACTIVITY_CHART_HEIGHT = 144;
const QUERY_ACTIVITY_CHART_PADDING = {
  bottom: 24,
  left: 28,
  right: 12,
  top: 10,
};
const QUERY_ACTIVITY_CHART_PLOT_HEIGHT =
  QUERY_ACTIVITY_CHART_HEIGHT -
  QUERY_ACTIVITY_CHART_PADDING.top -
  QUERY_ACTIVITY_CHART_PADDING.bottom;
const QUERY_ACTIVITY_GRID_LINES = [0, 0.25, 0.5, 0.75, 1] as const;
const QUERY_ACTIVITY_BUCKET_SECONDS = 1;
const QUERY_ACTIVITY_MAX_CONNECTED_GAP_SECONDS = 30;
const QUERY_ACTIVITY_SAMPLE_GAP_TOLERANCE_SECONDS = 2;
const QUERY_ACTIVITY_LATENCY_VISUAL_HEADROOM = 1.14;
const queryActivityCacheByProvider = new WeakMap<
  StudioQueryInsights,
  QueryActivityCache
>();

export function QueriesView(_props: ViewProps) {
  const { hasAiQueryRecommendations, queryInsights, requestLlm } = useStudio();
  const queryActivityCache = useMemo(
    () => (queryInsights ? getQueryActivityCache(queryInsights) : null),
    [queryInsights],
  );
  const [queries, setQueries] = useState<StudioQueryInsightQuery[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [pollingIntervalMs, setPollingIntervalMs] = useState(
    () => queryActivityCache?.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS,
  );
  const [activityWindowSeconds, setActivityWindowSeconds] =
    useState<QueryActivityWindowSeconds>(DEFAULT_QUERY_ACTIVITY_WINDOW_SECONDS);
  const [activitySamples, setActivitySamples] = useState<QueryActivitySample[]>(
    () => queryActivityCache?.samples ?? [],
  );
  const [queryMetricSamples, setQueryMetricSamples] = useState<
    QueryMetricSample[]
  >(() => queryActivityCache?.querySamples ?? []);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
  const [analysisByQueryId, setAnalysisByQueryId] = useState<
    Record<string, QueryInsightAnalysis | undefined>
  >({});
  const [analysisErrorByQueryId, setAnalysisErrorByQueryId] = useState<
    Record<string, string | undefined>
  >({});
  const [analysisLoadingQueryId, setAnalysisLoadingQueryId] = useState<
    string | null
  >(null);
  const [analysisQueuedQueryIds, setAnalysisQueuedQueryIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const analysisByQueryIdRef = useRef(analysisByQueryId);
  const analysisQueueRef = useRef<StudioQueryInsightQuery[]>([]);
  const analysisRunningRef = useRef(false);
  const analysisScheduledQueryIdsRef = useRef(new Set<string>());
  const automaticAnalysisCountRef = useRef(0);
  const automaticallySeenQueryIdsRef = useRef(new Set<string>());
  const isMountedRef = useRef(false);
  const latestActivityTotalsRef = useRef<QueryActivityTotals | null>(
    queryActivityCache?.totals ?? null,
  );
  const latestActivityQueriesRef = useRef<Map<string, StudioQueryInsightQuery>>(
    queryActivityCache?.queriesById ??
      new Map<string, StudioQueryInsightQuery>(),
  );
  const queryActivityCacheRef = useRef<QueryActivityCache | null>(
    queryActivityCache,
  );
  const latestAbortControllerRef = useRef<AbortController | null>(null);

  const syncQueuedAnalysisIds = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    setAnalysisQueuedQueryIds(
      new Set(analysisQueueRef.current.map((query) => query.id)),
    );
  }, []);

  const runNextQueryAnalysis = useCallback(() => {
    if (analysisRunningRef.current || !hasAiQueryRecommendations) {
      return;
    }

    const query = analysisQueueRef.current.shift();

    if (!query) {
      syncQueuedAnalysisIds();
      return;
    }

    syncQueuedAnalysisIds();
    analysisRunningRef.current = true;
    setAnalysisLoadingQueryId(query.id);
    setAnalysisErrorByQueryId((current) => ({
      ...current,
      [query.id]: undefined,
    }));

    void requestLlm({
      prompt: buildQueryInsightAnalysisPrompt(query),
      task: "query-insights",
    })
      .then((responseText) => {
        if (!isMountedRef.current) {
          return;
        }

        const analysis = parseQueryInsightAnalysisResponse(responseText);
        setAnalysisByQueryId((current) => {
          const next = {
            ...current,
            [query.id]: analysis,
          };
          analysisByQueryIdRef.current = next;

          return next;
        });
      })
      .catch((error: unknown) => {
        if (!isMountedRef.current) {
          return;
        }

        setAnalysisErrorByQueryId((current) => ({
          ...current,
          [query.id]: error instanceof Error ? error.message : String(error),
        }));
      })
      .finally(() => {
        analysisScheduledQueryIdsRef.current.delete(query.id);
        analysisRunningRef.current = false;

        if (!isMountedRef.current) {
          return;
        }

        setAnalysisLoadingQueryId((current) =>
          current === query.id ? null : current,
        );
        runNextQueryAnalysis();
      });
  }, [hasAiQueryRecommendations, requestLlm, syncQueuedAnalysisIds]);

  const enqueueQueryAnalysis = useCallback(
    (query: StudioQueryInsightQuery): boolean => {
      if (!hasAiQueryRecommendations) {
        return false;
      }

      if (
        analysisByQueryIdRef.current[query.id] ||
        analysisScheduledQueryIdsRef.current.has(query.id)
      ) {
        return false;
      }

      analysisScheduledQueryIdsRef.current.add(query.id);
      analysisQueueRef.current.push(query);
      syncQueuedAnalysisIds();
      runNextQueryAnalysis();
      return true;
    },
    [hasAiQueryRecommendations, runNextQueryAnalysis, syncQueuedAnalysisIds],
  );

  const fetchSnapshot = useCallback(async () => {
    if (!queryInsights || isPaused) {
      return;
    }

    latestAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    latestAbortControllerRef.current = abortController;

    try {
      const [snapshotError, snapshot] = await queryInsights.getSnapshot(
        { limit: DEFAULT_QUERY_LIMIT },
        { abortSignal: abortController.signal },
      );

      if (abortController.signal.aborted) {
        return;
      }

      if (snapshotError) {
        return;
      }

      setQueries(snapshot.queries);
      const nextPollingIntervalMs =
        snapshot.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS;
      const previousActivityTotals = latestActivityTotalsRef.current;
      const activity = createQueryActivitySamples({
        previousQueriesById: latestActivityQueriesRef.current,
        previousTotals: previousActivityTotals,
        queries: snapshot.queries,
        time: snapshot.generatedAt,
      });
      const cache = queryActivityCacheRef.current;
      const nextQueriesById = getQueriesById(snapshot.queries);
      const didAdvanceActivity = activity.totals !== previousActivityTotals;

      if (didAdvanceActivity) {
        latestActivityTotalsRef.current = activity.totals;
        latestActivityQueriesRef.current = nextQueriesById;
        if (cache) {
          cache.queriesById = nextQueriesById;
          cache.totals = activity.totals;
        }
      }

      setActivitySamples((current) => {
        const nextSamples = appendQueryActivitySamples(
          current,
          activity.samples,
        );

        if (cache) {
          cache.samples = nextSamples;
        }

        return nextSamples;
      });
      setQueryMetricSamples((current) => {
        const nextSamples = appendQueryMetricSamples(
          current,
          activity.querySamples,
        );

        if (cache) {
          cache.querySamples = nextSamples;
        }

        return nextSamples;
      });
      setPollingIntervalMs(nextPollingIntervalMs);
      if (cache) {
        cache.pollingIntervalMs = nextPollingIntervalMs;
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [isPaused, queryInsights]);

  useEffect(() => {
    queryActivityCacheRef.current = queryActivityCache;
    latestActivityTotalsRef.current = queryActivityCache?.totals ?? null;
    latestActivityQueriesRef.current =
      queryActivityCache?.queriesById ??
      new Map<string, StudioQueryInsightQuery>();
    setActivitySamples(queryActivityCache?.samples ?? []);
    setQueryMetricSamples(queryActivityCache?.querySamples ?? []);
    setPollingIntervalMs(
      queryActivityCache?.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS,
    );
  }, [queryActivityCache]);

  useEffect(() => {
    void fetchSnapshot();

    return () => {
      latestAbortControllerRef.current?.abort();
    };
  }, [fetchSnapshot]);

  useEffect(() => {
    if (isPaused || pollingIntervalMs <= 0) {
      return;
    }

    const interval = setInterval(() => {
      void fetchSnapshot();
    }, pollingIntervalMs);

    return () => clearInterval(interval);
  }, [fetchSnapshot, isPaused, pollingIntervalMs]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    analysisByQueryIdRef.current = analysisByQueryId;
  }, [analysisByQueryId]);

  useEffect(() => {
    if (hasAiQueryRecommendations) {
      return;
    }

    analysisQueueRef.current = [];
    analysisScheduledQueryIdsRef.current.clear();
    analysisRunningRef.current = false;
    setAnalysisLoadingQueryId(null);
    setAnalysisQueuedQueryIds(new Set());
  }, [hasAiQueryRecommendations]);

  const activityWindowRange = useMemo(
    () => getQueryActivityWindowRange(activitySamples, activityWindowSeconds),
    [activitySamples, activityWindowSeconds],
  );
  const timeScopedQueries = useMemo(
    () =>
      getWindowScopedQueries({
        queries,
        querySamples: queryMetricSamples,
        range: activityWindowRange,
      }),
    [activityWindowRange, queries, queryMetricSamples],
  );

  const availableTables = useMemo(() => {
    const tables = new Set<string>();

    for (const query of timeScopedQueries) {
      for (const table of query.tables) {
        tables.add(table);
      }
    }

    return [...tables].sort((left, right) => left.localeCompare(right));
  }, [timeScopedQueries]);

  useEffect(() => {
    if (selectedTable && !availableTables.includes(selectedTable)) {
      setSelectedTable(null);
    }
  }, [availableTables, selectedTable]);

  const visibleQueries = useMemo(() => {
    const filtered = selectedTable
      ? timeScopedQueries.filter((query) =>
          query.tables.includes(selectedTable),
        )
      : timeScopedQueries;
    const multiplier = sort.direction === "desc" ? -1 : 1;

    return [...filtered].sort((left, right) => {
      return (
        multiplier *
        (getSortValue(left, sort.field) - getSortValue(right, sort.field))
      );
    });
  }, [selectedTable, sort, timeScopedQueries]);

  const selectedQuery = useMemo(
    () =>
      visibleQueries.find((query) => query.id === selectedQueryId) ??
      timeScopedQueries.find((query) => query.id === selectedQueryId) ??
      null,
    [selectedQueryId, timeScopedQueries, visibleQueries],
  );
  const selectedQueryIndex = useMemo(
    () =>
      selectedQueryId
        ? visibleQueries.findIndex((query) => query.id === selectedQueryId)
        : -1,
    [selectedQueryId, visibleQueries],
  );

  useEffect(() => {
    if (!hasAiQueryRecommendations) {
      return;
    }

    for (const query of timeScopedQueries) {
      if (automaticallySeenQueryIdsRef.current.has(query.id)) {
        continue;
      }

      automaticallySeenQueryIdsRef.current.add(query.id);

      if (automaticAnalysisCountRef.current >= AUTOMATIC_QUERY_ANALYSIS_LIMIT) {
        continue;
      }

      if (enqueueQueryAnalysis(query)) {
        automaticAnalysisCountRef.current += 1;
      }
    }
  }, [enqueueQueryAnalysis, hasAiQueryRecommendations, timeScopedQueries]);

  useEffect(() => {
    if (!selectedQuery || !hasAiQueryRecommendations) {
      return;
    }

    enqueueQueryAnalysis(selectedQuery);
  }, [enqueueQueryAnalysis, hasAiQueryRecommendations, selectedQuery]);

  const selectPreviousQuery = useCallback(() => {
    if (selectedQueryIndex <= 0) {
      return;
    }

    setSelectedQueryId(visibleQueries[selectedQueryIndex - 1]?.id ?? null);
  }, [selectedQueryIndex, visibleQueries]);

  const selectNextQuery = useCallback(() => {
    if (
      selectedQueryIndex < 0 ||
      selectedQueryIndex >= visibleQueries.length - 1
    ) {
      return;
    }

    setSelectedQueryId(visibleQueries[selectedQueryIndex + 1]?.id ?? null);
  }, [selectedQueryIndex, visibleQueries]);

  if (!queryInsights) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <StudioHeader />
        <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
          Queries are not configured for this Studio embed.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <StudioHeader />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-lg font-semibold text-foreground">Queries</h1>
            <p className="max-w-5xl text-sm text-muted-foreground">
              Monitor database activity and identify and fix poorly-performing
              queries in your application.{" "}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://www.prisma.io/docs/orm/prisma-client/queries/advanced/query-optimization-performance#enabling-prisma-orm-attribution"
                rel="noopener noreferrer"
                target="_blank"
              >
                Find out how to see your Prisma ORM calls.
              </a>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={() => setIsPaused((current) => !current)}
              className="shadow-none"
              size="sm"
              type="button"
              variant="outline"
            >
              {isPaused ? (
                <Play data-icon="inline-start" />
              ) : (
                <Pause data-icon="inline-start" />
              )}
              {isPaused ? "Resume" : "Pause"}
            </Button>
          </div>
        </div>

        <QueryActivityChart
          samples={activitySamples}
          windowSeconds={activityWindowSeconds}
          onWindowChange={setActivityWindowSeconds}
        />

        <div className="flex shrink-0 justify-end">
          <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:w-auto sm:justify-end">
            <Select
              value={selectedTable ?? ALL_TABLES_VALUE}
              onValueChange={(value) => {
                setSelectedTable(value === ALL_TABLES_VALUE ? null : value);
              }}
            >
              <ToolbarSelectControl label="Table">
                <SelectTrigger
                  aria-label="Filter queries by table"
                  className={cn(
                    TOOLBAR_SELECT_TRIGGER_CLASS,
                    "w-full flex-1 sm:w-28 sm:flex-none",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
              </ToolbarSelectControl>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL_TABLES_VALUE}>All</SelectItem>
                  {availableTables.map((table) => (
                    <SelectItem key={table} value={table}>
                      {table}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={`${sort.field}:${sort.direction}`}
              onValueChange={(value) => {
                const [field, direction] = value.split(":") as [
                  SortField,
                  SortDirection,
                ];
                setSort({ direction, field });
              }}
            >
              <ToolbarSelectControl label="Sort">
                <SelectTrigger
                  aria-label="Sort queries"
                  className={cn(
                    TOOLBAR_SELECT_TRIGGER_CLASS,
                    "w-full flex-1 sm:w-44 sm:flex-none",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
              </ToolbarSelectControl>
              <SelectContent>
                <SelectGroup>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/70 bg-card/60"
          data-testid="queries-table-shell"
        >
          {isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : visibleQueries.length > 0 ? (
            <QueryTable
              analysisByQueryId={analysisByQueryId}
              analysisErrorByQueryId={analysisErrorByQueryId}
              analysisLoadingQueryId={analysisLoadingQueryId}
              analysisQueuedQueryIds={analysisQueuedQueryIds}
              canShowAnalysis={hasAiQueryRecommendations}
              queries={visibleQueries}
              selectedQueryId={selectedQueryId}
              sortField={sort.field}
              onAnalyzeQuery={enqueueQueryAnalysis}
              onSelectQuery={setSelectedQueryId}
            />
          ) : (
            <div className="flex h-full min-h-56 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {queries.length > 0
                ? "No query activity in this time range."
                : "Waiting for query activity."}
            </div>
          )}
        </div>
      </div>

      <QueryDetailsSheet
        analysis={
          selectedQuery ? analysisByQueryId[selectedQuery.id] : undefined
        }
        analysisError={
          selectedQuery ? analysisErrorByQueryId[selectedQuery.id] : undefined
        }
        canShowAnalysis={hasAiQueryRecommendations}
        hasNext={
          selectedQueryIndex >= 0 &&
          selectedQueryIndex < visibleQueries.length - 1
        }
        hasPrevious={selectedQueryIndex > 0}
        isAnalysisLoading={analysisLoadingQueryId === selectedQuery?.id}
        isAnalysisQueued={
          selectedQuery ? analysisQueuedQueryIds.has(selectedQuery.id) : false
        }
        onClose={() => setSelectedQueryId(null)}
        onAnalyze={() => {
          if (selectedQuery) {
            enqueueQueryAnalysis(selectedQuery);
          }
        }}
        onNext={selectNextQuery}
        onPrevious={selectPreviousQuery}
        query={selectedQuery}
      />
    </div>
  );
}

function ToolbarSelectControl(props: { children: ReactNode; label: string }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
        {props.label}
      </span>
      {props.children}
    </div>
  );
}

function QueryActivityChart(props: {
  onWindowChange: (windowSeconds: QueryActivityWindowSeconds) => void;
  samples: QueryActivitySample[];
  windowSeconds: QueryActivityWindowSeconds;
}) {
  const { onWindowChange, samples, windowSeconds } = props;
  const chartFrameRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(
    DEFAULT_QUERY_ACTIVITY_CHART_WIDTH,
  );
  const [hoveredSampleTime, setHoveredSampleTime] = useState<number | null>(
    null,
  );
  const visibleSamples = getVisibleActivitySamples(samples, windowSeconds);
  const activitySummary = getQueryActivitySummary(visibleSamples);
  const activityWindowRange = getQueryActivityWindowRange(
    samples,
    windowSeconds,
  );
  const domainStart = activityWindowRange.start;
  const domainEnd = activityWindowRange.end;
  const chartPlotWidth = getQueryActivityPlotWidth(chartWidth);
  const queriesPerSecondMax = getSeriesMax(
    visibleSamples,
    (sample) => sample.queriesPerSecond,
  );
  const latencyMax =
    getSeriesMax(visibleSamples, (sample) => sample.averageLatencyMs) *
    QUERY_ACTIVITY_LATENCY_VISUAL_HEADROOM;
  const queriesPerSecondPath = buildQueryActivityPath({
    chartWidth,
    domainEnd,
    domainStart,
    getValue: (sample) => sample.queriesPerSecond,
    maxValue: queriesPerSecondMax,
    samples: visibleSamples,
  });
  const latencyPath = buildQueryActivityPath({
    chartWidth,
    domainEnd,
    domainStart,
    getValue: (sample) => sample.averageLatencyMs,
    maxValue: latencyMax,
    samples: visibleSamples,
  });
  const isolatedSamples = getIsolatedQueryActivitySamples(visibleSamples);
  const xTicks = getQueryActivityTicks(domainStart, domainEnd);
  const hasVisibleActivity = visibleSamples.some(hasQueryActivitySampleValue);
  const hoveredSample =
    hoveredSampleTime === null
      ? null
      : (visibleSamples.find((sample) => sample.time === hoveredSampleTime) ??
        null);
  const hoveredX = hoveredSample
    ? getQueryActivityX({
        chartWidth,
        domainEnd,
        domainStart,
        time: hoveredSample.time,
      })
    : null;
  const hoveredQueriesPerSecondY = hoveredSample
    ? getNullableQueryActivityY(
        hoveredSample.queriesPerSecond,
        queriesPerSecondMax,
      )
    : null;
  const hoveredLatencyY = hoveredSample
    ? getNullableQueryActivityY(hoveredSample.averageLatencyMs, latencyMax)
    : null;
  const tooltipTransform =
    hoveredX === null
      ? "translateX(-50%)"
      : hoveredX < 96
        ? "translateX(0)"
        : hoveredX > chartWidth - 96
          ? "translateX(-100%)"
          : "translateX(-50%)";
  const handleChartPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const hoverableSamples = visibleSamples.filter(hasQueryActivitySampleValue);

    if (hoverableSamples.length === 0) {
      setHoveredSampleTime(null);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerProgress = Math.min(
      1,
      Math.max(
        0,
        (pointerX - QUERY_ACTIVITY_CHART_PADDING.left) / chartPlotWidth,
      ),
    );
    const pointerTime =
      domainStart + pointerProgress * (domainEnd - domainStart);
    const nearestSample = hoverableSamples.reduce((nearest, sample) => {
      return Math.abs(sample.time - pointerTime) <
        Math.abs(nearest.time - pointerTime)
        ? sample
        : nearest;
    });

    setHoveredSampleTime(nearestSample.time);
  };

  useEffect(() => {
    const element = chartFrameRef.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.max(
        MIN_QUERY_ACTIVITY_CHART_WIDTH,
        Math.round(entry?.contentRect.width ?? 0),
      );

      setChartWidth(nextWidth);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="shrink-0 rounded-lg border border-border/70 bg-card/60 p-3"
      data-testid="queries-activity-chart"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <QueryActivityLegend
            colorClassName="bg-sky-500"
            label="Queries/s"
            value={formatQueriesPerSecond(activitySummary.queriesPerSecond)}
          />
          <QueryActivityLegend
            colorClassName="bg-emerald-500"
            label="Avg latency"
            value={formatActivityLatency(activitySummary.averageLatencyMs)}
          />
        </div>

        <ToggleGroup
          aria-label="Select activity time range"
          className="rounded-md border border-border/70 bg-muted/20 p-0.5"
          onValueChange={(value) => {
            const nextWindow = Number(value);

            if (isQueryActivityWindowSeconds(nextWindow)) {
              onWindowChange(nextWindow);
            }
          }}
          type="single"
          value={String(windowSeconds)}
        >
          {QUERY_ACTIVITY_WINDOWS.map((windowOption) => (
            <ToggleGroupItem
              aria-label={`Show the last ${windowOption.label}`}
              className="h-6 min-w-8 rounded-sm px-2 text-[11px] data-[state=on]:bg-background data-[state=on]:shadow-sm"
              key={windowOption.value}
              value={String(windowOption.value)}
            >
              {windowOption.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div
        className={cn(
          "relative h-36 w-full overflow-hidden rounded-md bg-background/50",
          !hasVisibleActivity && "bg-muted/10",
        )}
        data-testid="queries-activity-plot"
        onPointerLeave={() => setHoveredSampleTime(null)}
        onPointerMove={handleChartPointerMove}
        ref={chartFrameRef}
      >
        <svg
          aria-label="Live chart of queries per second and average latency"
          className="h-full w-full"
          data-testid="queries-activity-svg"
          role="img"
          viewBox={`0 0 ${chartWidth} ${QUERY_ACTIVITY_CHART_HEIGHT}`}
        >
          {hasVisibleActivity && (
            <>
              {QUERY_ACTIVITY_GRID_LINES.map((line) => {
                const y =
                  QUERY_ACTIVITY_CHART_PADDING.top +
                  line * QUERY_ACTIVITY_CHART_PLOT_HEIGHT;

                return (
                  <line
                    className="stroke-border/70"
                    key={line}
                    vectorEffect="non-scaling-stroke"
                    x1={QUERY_ACTIVITY_CHART_PADDING.left}
                    x2={chartWidth - QUERY_ACTIVITY_CHART_PADDING.right}
                    y1={y}
                    y2={y}
                  />
                );
              })}
              {xTicks.map((tick) => {
                const x = getQueryActivityX({
                  chartWidth,
                  domainEnd,
                  domainStart,
                  time: tick,
                });

                return (
                  <g key={tick}>
                    <line
                      className="stroke-border/40"
                      vectorEffect="non-scaling-stroke"
                      x1={x}
                      x2={x}
                      y1={QUERY_ACTIVITY_CHART_PADDING.top}
                      y2={
                        QUERY_ACTIVITY_CHART_HEIGHT -
                        QUERY_ACTIVITY_CHART_PADDING.bottom
                      }
                    />
                    <text
                      className="fill-muted-foreground text-[10px]"
                      textAnchor={tick === domainEnd ? "end" : "middle"}
                      x={tick === domainEnd ? x - 2 : x}
                      y={QUERY_ACTIVITY_CHART_HEIGHT - 8}
                    >
                      {formatQueryActivityTick(tick, domainEnd)}
                    </text>
                  </g>
                );
              })}
              <path
                className="stroke-sky-500"
                data-testid="queries-activity-queries-path"
                d={queriesPerSecondPath}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <path
                className="stroke-emerald-500"
                data-testid="queries-activity-latency-path"
                d={latencyPath}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {isolatedSamples.map((sample) => {
                const x = getQueryActivityX({
                  chartWidth,
                  domainEnd,
                  domainStart,
                  time: sample.time,
                });
                const queriesPerSecondY = getNullableQueryActivityY(
                  sample.queriesPerSecond,
                  queriesPerSecondMax,
                );
                const latencyY = getNullableQueryActivityY(
                  sample.averageLatencyMs,
                  latencyMax,
                );

                return (
                  <g key={sample.time}>
                    {sample.queriesPerSecond !== null &&
                      sample.queriesPerSecond > 0 &&
                      queriesPerSecondY !== null && (
                        <circle
                          className="fill-sky-500 stroke-background"
                          cx={x}
                          cy={queriesPerSecondY}
                          data-testid="queries-activity-queries-point"
                          r="3"
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    {sample.averageLatencyMs !== null &&
                      sample.averageLatencyMs > 0 &&
                      latencyY !== null && (
                        <circle
                          className="fill-emerald-500 stroke-background"
                          cx={x}
                          cy={latencyY}
                          data-testid="queries-activity-latency-point"
                          r="3"
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                  </g>
                );
              })}
            </>
          )}
          {hoveredSample &&
            hoveredX !== null &&
            (hoveredQueriesPerSecondY !== null || hoveredLatencyY !== null) && (
              <g>
                <line
                  className="stroke-foreground/25"
                  vectorEffect="non-scaling-stroke"
                  x1={hoveredX}
                  x2={hoveredX}
                  y1={QUERY_ACTIVITY_CHART_PADDING.top}
                  y2={
                    QUERY_ACTIVITY_CHART_HEIGHT -
                    QUERY_ACTIVITY_CHART_PADDING.bottom
                  }
                />
                {hoveredQueriesPerSecondY !== null && (
                  <circle
                    className="fill-background stroke-sky-500"
                    cx={hoveredX}
                    cy={hoveredQueriesPerSecondY}
                    r="3"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {hoveredLatencyY !== null && (
                  <circle
                    className="fill-background stroke-emerald-500"
                    cx={hoveredX}
                    cy={hoveredLatencyY}
                    r="3"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            )}
        </svg>

        {hoveredSample && hoveredX !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-md border border-border/70 bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
            data-testid="queries-activity-tooltip"
            style={{
              left: hoveredX,
              transform: tooltipTransform,
            }}
          >
            <div className="mb-1 font-medium">
              {formatTime(hoveredSample.time * 1000)}
            </div>
            <QueryActivityTooltipMetric
              colorClassName="bg-sky-500"
              label="Queries/s"
              testId="queries-activity-tooltip-queries"
              value={formatQueriesPerSecond(hoveredSample.queriesPerSecond)}
              valueClassName="text-sky-600 dark:text-sky-400"
            />
            <QueryActivityTooltipMetric
              colorClassName="bg-emerald-500"
              label="Avg latency"
              testId="queries-activity-tooltip-latency"
              value={formatActivityLatency(hoveredSample.averageLatencyMs)}
              valueClassName="text-emerald-600 dark:text-emerald-400"
            />
          </div>
        )}

        {!hasVisibleActivity && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground/80">
            Waiting for query activity
          </div>
        )}
      </div>
    </section>
  );
}

function QueryActivityTooltipMetric(props: {
  colorClassName: string;
  label: string;
  testId: string;
  value: string;
  valueClassName: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4"
      data-testid={props.testId}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", props.colorClassName)} />
        {props.label}
      </span>
      <span className={cn("font-medium", props.valueClassName)}>
        {props.value}
      </span>
    </div>
  );
}

function QueryActivityLegend(props: {
  colorClassName: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={cn("size-2 rounded-full", props.colorClassName)} />
      <span className="text-muted-foreground">{props.label}</span>
      <span className="font-medium text-foreground">{props.value}</span>
    </div>
  );
}

function QueryTable(props: {
  analysisByQueryId: Record<string, QueryInsightAnalysis | undefined>;
  analysisErrorByQueryId: Record<string, string | undefined>;
  analysisLoadingQueryId: string | null;
  analysisQueuedQueryIds: ReadonlySet<string>;
  canShowAnalysis: boolean;
  onAnalyzeQuery: (query: StudioQueryInsightQuery) => void;
  onSelectQuery: (queryId: string) => void;
  queries: StudioQueryInsightQuery[];
  selectedQueryId: string | null;
  sortField: SortField;
}) {
  const {
    analysisByQueryId,
    analysisErrorByQueryId,
    analysisLoadingQueryId,
    analysisQueuedQueryIds,
    canShowAnalysis,
    onAnalyzeQuery,
    onSelectQuery,
    queries,
    selectedQueryId,
    sortField,
  } = props;

  return (
    <TooltipProvider delayDuration={200}>
      <Table className="table-fixed" containerProps={{ className: "h-full" }}>
        <colgroup>
          <col className="w-24" />
          <col />
          <col className="w-28" />
          <col className="w-24" />
          <col className="w-32" />
          {canShowAnalysis && <col className="w-28" />}
        </colgroup>
        <TableHeader className="sticky top-0 z-10 bg-background/95">
          <TableRow className="border-border/70 bg-muted/20 hover:bg-muted/20">
            <TableHead className="h-9 text-[11px] font-medium uppercase tracking-[0.12em]">
              <SortLabel active={sortField === "latency"}>Latency</SortLabel>
            </TableHead>
            <TableHead className="h-9 text-[11px] font-medium uppercase tracking-[0.12em]">
              Query
            </TableHead>
            <TableHead className="h-9 text-right text-[11px] font-medium uppercase tracking-[0.12em]">
              <SortLabel active={sortField === "executions"}>
                Executions
              </SortLabel>
            </TableHead>
            <TableHead className="h-9 text-right text-[11px] font-medium uppercase tracking-[0.12em]">
              <SortLabel active={sortField === "rowsReturned"}>
                Rows Returned
              </SortLabel>
            </TableHead>
            <TableHead className="h-9 text-right text-[11px] font-medium uppercase tracking-[0.12em]">
              <SortLabel active={sortField === "lastSeen"}>Last Seen</SortLabel>
            </TableHead>
            {canShowAnalysis && (
              <TableHead className="h-9 text-right text-[11px] font-medium uppercase tracking-[0.12em]">
                Analysis
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {queries.map((query) => (
            <TableRow
              key={query.id}
              className="border-border/60 align-top hover:bg-muted/30 data-[state=selected]:bg-muted/50"
              data-state={selectedQueryId === query.id ? "selected" : undefined}
            >
              <TableCell className="px-3 py-3">
                <LatencyBadge duration={query.duration} />
              </TableCell>
              <TableCell className="min-w-0 px-2 py-2.5">
                <button
                  className="group flex w-full min-w-0 flex-col items-start gap-1 rounded-sm px-1.5 py-1 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => onSelectQuery(query.id)}
                  title={query.query}
                  type="button"
                >
                  <code className="block max-w-full truncate font-mono text-xs text-foreground group-hover:text-foreground">
                    {query.query}
                  </code>
                  {query.tables.length > 0 && (
                    <span className="block max-w-full truncate text-xs text-muted-foreground">
                      {query.tables.join(", ")}
                    </span>
                  )}
                </button>
              </TableCell>
              <TableCell className="px-3 py-3 text-right">
                <Badge variant="secondary">
                  {numberFormatter.format(query.count)}
                </Badge>
              </TableCell>
              <TableCell className="px-3 py-3 text-right">
                {numberFormatter.format(query.rowsReturned)}
              </TableCell>
              <TableCell className="px-3 py-3 text-right text-muted-foreground">
                {formatTime(query.lastSeen)}
              </TableCell>
              {canShowAnalysis && (
                <TableCell className="px-3 py-2.5 text-right">
                  <QueryAnalysisCell
                    analysis={analysisByQueryId[query.id]}
                    error={analysisErrorByQueryId[query.id]}
                    isLoading={analysisLoadingQueryId === query.id}
                    isQueued={analysisQueuedQueryIds.has(query.id)}
                    query={query}
                    onAnalyzeQuery={onAnalyzeQuery}
                    onOpenQuery={onSelectQuery}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}

function QueryAnalysisCell(props: {
  analysis?: QueryInsightAnalysis;
  error?: string;
  isLoading: boolean;
  isQueued: boolean;
  onAnalyzeQuery: (query: StudioQueryInsightQuery) => void;
  onOpenQuery: (queryId: string) => void;
  query: StudioQueryInsightQuery;
}) {
  const {
    analysis,
    error,
    isLoading,
    isQueued,
    onAnalyzeQuery,
    onOpenQuery,
    query,
  } = props;

  if (isLoading) {
    return (
      <span
        aria-label="Analyzing query"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground"
        data-testid="queries-analysis-loading"
        title="Analyzing query"
      >
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  }

  if (analysis) {
    const metadata = getQueryAnalysisLevelMetadata(analysis.level);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={metadata.actionAriaLabel}
            className={cn(
              "h-6 gap-1 rounded-md border px-1.5 text-[11px] shadow-none",
              metadata.interactiveClassName,
            )}
            onClick={() => onOpenQuery(query.id)}
            type="button"
            variant="ghost"
          >
            <QueryAnalysisLevelIcon level={analysis.level} />
            <span>{metadata.shortLabel}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-80 px-3.5 py-2 text-sm leading-6"
          side="left"
        >
          <div className="font-medium">
            {metadata.label}: {analysis.summary}
          </div>
          <div className="mt-1 opacity-85">{metadata.tooltipAction}</div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isQueued) {
    return (
      <span
        aria-label="Query analysis queued"
        className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground"
        data-testid="queries-analysis-queued"
        title="Query analysis queued"
      >
        <Sparkles className="size-3" />
        Queued
      </span>
    );
  }

  return (
    <Button
      aria-label={error ? "Retry query analysis" : "Analyze query"}
      className={cn(
        "h-6 border-border/70 px-2 text-[11px] shadow-none",
        error && "border-amber-400/50 text-amber-700 dark:text-amber-300",
      )}
      onClick={() => onAnalyzeQuery(query)}
      size="xs"
      title={error ? `Retry analysis: ${error}` : "Analyze query"}
      type="button"
      variant="outline"
    >
      {error && <TriangleAlert data-icon="inline-start" />}
      Analyze
    </Button>
  );
}

function QueryAnalysisLevelIcon(props: { level: QueryInsightAnalysisLevel }) {
  if (props.level === "warning") {
    return <TriangleAlert className="size-3.5" />;
  }

  if (props.level === "info") {
    return <Info className="size-3.5" />;
  }

  return <CircleCheck className="size-3.5" />;
}

function getQueryAnalysisLevelMetadata(level: QueryInsightAnalysisLevel): {
  actionAriaLabel: string;
  badgeClassName: string;
  interactiveClassName: string;
  label: string;
  shortLabel: string;
  tooltipAction: string;
} {
  if (level === "warning") {
    return {
      actionAriaLabel:
        "Open warning analysis for suggested fix and complete fix prompt",
      badgeClassName:
        "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      interactiveClassName:
        "border-amber-500/25 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300",
      label: "Warning",
      shortLabel: "Warn",
      tooltipAction: "Open for a suggested fix and complete fix prompt.",
    };
  }

  if (level === "info") {
    return {
      actionAriaLabel:
        "Open info analysis for suggested fix and complete fix prompt",
      badgeClassName:
        "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      interactiveClassName:
        "border-sky-500/20 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 hover:text-sky-800 dark:text-sky-300",
      label: "Info",
      shortLabel: "Info",
      tooltipAction: "Open for a suggested fix and complete fix prompt.",
    };
  }

  return {
    actionAriaLabel: "Open all good analysis details",
    badgeClassName:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    interactiveClassName:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-800 dark:text-emerald-300",
    label: "All good",
    shortLabel: "Good",
    tooltipAction: "Open to review why this query looks healthy.",
  };
}

function SortLabel(props: { active: boolean; children: string }) {
  return (
    <span className={cn(props.active && "text-foreground")}>
      {props.children}
    </span>
  );
}

function LatencyBadge(props: { duration: number }) {
  const variant =
    props.duration >= 500
      ? "destructive"
      : props.duration >= 100
        ? "outline"
        : "success";

  return <Badge variant={variant}>{formatLatency(props.duration)}</Badge>;
}

function QueryDetailsSheet(props: {
  analysis?: QueryInsightAnalysis;
  analysisError?: string;
  canShowAnalysis: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  isAnalysisLoading: boolean;
  isAnalysisQueued: boolean;
  onAnalyze: () => void;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  query: StudioQueryInsightQuery | null;
}) {
  const {
    analysis,
    analysisError,
    canShowAnalysis,
    hasNext,
    hasPrevious,
    isAnalysisLoading,
    isAnalysisQueued,
    onAnalyze,
    onClose,
    onNext,
    onPrevious,
    query,
  } = props;

  return (
    <Sheet open={query !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-hidden sm:max-w-2xl">
        {query && (
          <>
            <SheetHeader className="shrink-0 pr-8">
              <div className="flex items-center gap-2">
                <Button
                  aria-label="Previous query"
                  disabled={!hasPrevious}
                  onClick={onPrevious}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  aria-label="Next query"
                  disabled={!hasNext}
                  onClick={onNext}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronRight />
                </Button>
              </div>
              <SheetTitle>Query Details</SheetTitle>
              <SheetDescription>
                {numberFormatter.format(query.count)} executions, average{" "}
                {formatLatency(query.duration)} latency.
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap gap-2">
                  {query.tables.map((table) => (
                    <Badge key={table} variant="outline">
                      {table}
                    </Badge>
                  ))}
                </div>

                <pre className="max-h-72 overflow-auto rounded-md border border-border/70 bg-muted/40 p-3 text-xs text-foreground">
                  <code>{query.query}</code>
                </pre>

                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <MetricInline label="Executions" value={query.count} />
                  <MetricInline
                    label="Latency"
                    value={formatLatency(query.duration)}
                  />
                  <MetricInline
                    label="Rows Returned"
                    value={query.rowsReturned}
                  />
                </div>

                {canShowAnalysis && (
                  <div className="flex flex-col gap-3 border-t border-border/70 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles data-icon="inline-start" />
                        Recommendations
                      </div>
                      {analysis && (
                        <QueryAnalysisStatusBadge level={analysis.level} />
                      )}
                      {!analysis && !isAnalysisLoading && !isAnalysisQueued && (
                        <Button
                          className="h-7 shadow-none"
                          onClick={onAnalyze}
                          size="xs"
                          type="button"
                          variant="outline"
                        >
                          {analysisError ? "Retry" : "Analyze"}
                        </Button>
                      )}
                    </div>

                    {isAnalysisLoading ? (
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-4/5" />
                      </div>
                    ) : isAnalysisQueued ? (
                      <p className="text-sm text-muted-foreground">
                        Waiting for the current analysis to finish.
                      </p>
                    ) : analysisError ? (
                      <p className="text-sm text-muted-foreground">
                        {analysisError}
                      </p>
                    ) : analysis ? (
                      <QueryAnalysis analysis={analysis} />
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MetricInline(props: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border/70 bg-background/60 p-2">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="font-medium">
        {typeof props.value === "number"
          ? numberFormatter.format(props.value)
          : props.value}
      </div>
    </div>
  );
}

function QueryAnalysisStatusBadge(props: { level: QueryInsightAnalysisLevel }) {
  const metadata = getQueryAnalysisLevelMetadata(props.level);

  return (
    <Badge
      className={cn("gap-1.5 px-2 py-0.5", metadata.badgeClassName)}
      variant="outline"
    >
      <QueryAnalysisLevelIcon level={props.level} />
      {metadata.label}
    </Badge>
  );
}

function QueryAnalysis(props: { analysis: QueryInsightAnalysis }) {
  const { analysis } = props;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">{analysis.summary}</p>

      {analysis.recommendations.length > 0 && (
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {analysis.recommendations.map((recommendation) => (
            <li key={recommendation}>{recommendation}</li>
          ))}
        </ul>
      )}

      {analysis.improvedSql && (
        <CodeSuggestion label="SQL" value={analysis.improvedSql} />
      )}
      {analysis.improvedPrisma && (
        <CodeSuggestion label="Prisma" value={analysis.improvedPrisma} />
      )}
    </div>
  );
}

function CodeSuggestion(props: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-muted-foreground">
        {props.label}
      </div>
      <pre className="max-h-56 overflow-auto rounded-md border border-border/70 bg-muted/40 p-3 text-xs">
        <code>{props.value}</code>
      </pre>
    </div>
  );
}

function createQueryActivitySamples(args: {
  previousQueriesById: Map<string, StudioQueryInsightQuery>;
  previousTotals: QueryActivityTotals | null;
  queries: StudioQueryInsightQuery[];
  time: number;
}): {
  querySamples: QueryMetricSample[];
  samples: QueryActivitySample[];
  totals: QueryActivityTotals;
} {
  const { previousQueriesById, previousTotals, queries, time } = args;
  const count = queries.reduce((sum, query) => sum + query.count, 0);
  const totalDurationMs = queries.reduce(
    (sum, query) => sum + query.duration * query.count,
    0,
  );
  const totals = {
    count,
    time,
    totalDurationMs,
  };

  if (!previousTotals) {
    const seededSamples = createInitialQueryActivitySamples({
      queries,
      time,
    });
    const seededQuerySamples = createInitialQueryMetricSamples({
      queries,
      time,
    });

    return {
      querySamples: seededQuerySamples,
      samples: seededSamples,
      totals,
    };
  }

  const elapsedSeconds = (time - previousTotals.time) / 1000;
  if (elapsedSeconds <= 0) {
    return {
      querySamples: [],
      samples: [],
      totals: previousTotals,
    };
  }

  const querySamples = createQueryMetricSamples({
    elapsedSeconds,
    previousQueriesById,
    previousTotals,
    queries,
    time,
  });
  return {
    querySamples,
    samples: createMeasuredQueryActivitySamples({
      elapsedSeconds,
      querySamples,
      time,
    }),
    totals,
  };
}

function createMeasuredQueryActivitySamples(args: {
  elapsedSeconds: number;
  querySamples: QueryMetricSample[];
  time: number;
}): QueryActivitySample[] {
  const { elapsedSeconds, querySamples, time } = args;
  const samplesByTime = new Map<number, QueryActivitySample>();
  const snapshotTime = time / 1000;

  for (const querySample of querySamples) {
    const existingSample = samplesByTime.get(querySample.time);
    const executionCount =
      (existingSample?.executionCount ?? 0) + querySample.executionCount;
    const totalDurationMs =
      (existingSample?.totalDurationMs ?? 0) + querySample.totalDurationMs;

    samplesByTime.set(querySample.time, {
      averageLatencyMs:
        executionCount > 0 ? totalDurationMs / executionCount : 0,
      elapsedSeconds: existingSample?.elapsedSeconds ?? 0,
      executionCount,
      kind: "measured",
      queriesPerSecond: executionCount / QUERY_ACTIVITY_BUCKET_SECONDS,
      time: querySample.time,
      totalDurationMs,
    });
  }

  const existingSnapshotSample = samplesByTime.get(snapshotTime);

  samplesByTime.set(snapshotTime, {
    averageLatencyMs: existingSnapshotSample?.averageLatencyMs ?? 0,
    elapsedSeconds:
      (existingSnapshotSample?.elapsedSeconds ?? 0) + elapsedSeconds,
    executionCount: existingSnapshotSample?.executionCount ?? 0,
    kind: "measured",
    queriesPerSecond: existingSnapshotSample?.queriesPerSecond ?? 0,
    time: snapshotTime,
    totalDurationMs: existingSnapshotSample?.totalDurationMs ?? 0,
  });

  return [...samplesByTime.values()].sort(
    (left, right) => left.time - right.time,
  );
}

function createQueryMetricSamples(args: {
  elapsedSeconds: number;
  previousQueriesById: Map<string, StudioQueryInsightQuery>;
  previousTotals: QueryActivityTotals;
  queries: StudioQueryInsightQuery[];
  time: number;
}): QueryMetricSample[] {
  const { elapsedSeconds, previousQueriesById, previousTotals, queries, time } =
    args;

  return queries.flatMap((query) => {
    const previousQuery = previousQueriesById.get(query.id);
    const hasRecentExecution = query.lastSeen >= previousTotals.time;
    const countersAreContinuous =
      previousQuery !== undefined &&
      query.count >= previousQuery.count &&
      query.rowsReturned >= previousQuery.rowsReturned &&
      query.reads >= previousQuery.reads;
    const executionCount = countersAreContinuous
      ? query.count - previousQuery.count
      : hasRecentExecution
        ? query.count
        : 0;

    if (executionCount <= 0) {
      return [];
    }

    const rowsReturned = countersAreContinuous
      ? query.rowsReturned - previousQuery.rowsReturned
      : query.rowsReturned;
    const reads = countersAreContinuous
      ? query.reads - previousQuery.reads
      : query.reads;
    const totalDurationMs = countersAreContinuous
      ? Math.max(
          0,
          query.duration * query.count -
            previousQuery.duration * previousQuery.count,
        )
      : query.duration * executionCount;

    return [
      {
        averageLatencyMs:
          executionCount > 0 ? totalDurationMs / executionCount : 0,
        elapsedSeconds,
        executionCount,
        kind: "measured",
        query,
        reads,
        rowsReturned,
        time: getMeasuredQuerySampleTime({
          lastSeen: query.lastSeen,
          previousTime: previousTotals.time,
          time,
        }),
        totalDurationMs,
      },
    ];
  });
}

function getMeasuredQuerySampleTime(args: {
  lastSeen: number;
  previousTime: number;
  time: number;
}): number {
  const { lastSeen, previousTime, time } = args;
  const observedTime = Number.isFinite(lastSeen) ? lastSeen : time;
  const clampedObservedTime = Math.min(
    time,
    Math.max(previousTime, observedTime),
  );

  return Math.floor(clampedObservedTime / 1000);
}

function createInitialQueryActivitySamples(args: {
  queries: StudioQueryInsightQuery[];
  time: number;
}): QueryActivitySample[] {
  const { queries, time } = args;
  const snapshotTime = time / 1000;
  const cutoff = snapshotTime - MAX_QUERY_ACTIVITY_WINDOW_SECONDS;
  const samplesByTime = new Map<number, QueryActivitySample>();

  for (const query of queries) {
    const sampleTime = Math.floor(query.lastSeen / 1000);

    if (sampleTime < cutoff || query.count <= 0) {
      continue;
    }

    const existingSample = samplesByTime.get(sampleTime);
    const executionCount = 1;
    const totalDurationMs = query.duration;
    const nextExecutionCount =
      (existingSample?.executionCount ?? 0) + executionCount;
    const nextTotalDurationMs =
      (existingSample?.totalDurationMs ?? 0) + totalDurationMs;

    samplesByTime.set(sampleTime, {
      averageLatencyMs:
        nextExecutionCount > 0 ? nextTotalDurationMs / nextExecutionCount : 0,
      elapsedSeconds: 0,
      executionCount: nextExecutionCount,
      kind: "context",
      queriesPerSecond: null,
      time: sampleTime,
      totalDurationMs: nextTotalDurationMs,
    });
  }

  const samples = [...samplesByTime.values()].sort(
    (left, right) => left.time - right.time,
  );

  if (samples.at(-1)?.time !== snapshotTime) {
    samples.push({
      averageLatencyMs: null,
      elapsedSeconds: 0,
      executionCount: 0,
      kind: "context",
      queriesPerSecond: null,
      time: snapshotTime,
      totalDurationMs: 0,
    });
  }

  return samples;
}

function createInitialQueryMetricSamples(args: {
  queries: StudioQueryInsightQuery[];
  time: number;
}): QueryMetricSample[] {
  const { queries, time } = args;
  const snapshotTime = time / 1000;
  const cutoff = snapshotTime - MAX_QUERY_ACTIVITY_WINDOW_SECONDS;

  return queries
    .flatMap((query) => {
      const sampleTime = Math.floor(query.lastSeen / 1000);

      if (sampleTime < cutoff || query.count <= 0) {
        return [];
      }

      return [
        {
          averageLatencyMs: query.duration,
          elapsedSeconds: 0,
          executionCount: 1,
          kind: "context",
          query,
          reads: getAverageCounterPerExecution(query.reads, query.count),
          rowsReturned: getAverageCounterPerExecution(
            query.rowsReturned,
            query.count,
          ),
          time: sampleTime,
          totalDurationMs: query.duration,
        },
      ] satisfies QueryMetricSample[];
    })
    .sort((left, right) => left.time - right.time);
}

function appendQueryActivitySamples(
  samples: QueryActivitySample[],
  nextSamples: QueryActivitySample[],
): QueryActivitySample[] {
  if (nextSamples.length === 0) {
    return samples;
  }

  const samplesByTime = new Map<number, QueryActivitySample>();

  for (const sample of samples) {
    samplesByTime.set(sample.time, sample);
  }

  for (const sample of nextSamples) {
    const existingSample = samplesByTime.get(sample.time);
    samplesByTime.set(
      sample.time,
      existingSample
        ? mergeQueryActivitySamples(existingSample, sample)
        : sample,
    );
  }

  const latestTime =
    nextSamples.at(-1)?.time ?? samples.at(-1)?.time ?? Date.now() / 1000;
  const cutoff = latestTime - MAX_QUERY_ACTIVITY_WINDOW_SECONDS;

  return [...samplesByTime.values()]
    .filter((sample) => sample.time >= cutoff)
    .sort((left, right) => left.time - right.time);
}

function mergeQueryActivitySamples(
  existingSample: QueryActivitySample,
  nextSample: QueryActivitySample,
): QueryActivitySample {
  const executionCount =
    existingSample.executionCount + nextSample.executionCount;
  const totalDurationMs =
    existingSample.totalDurationMs + nextSample.totalDurationMs;
  const elapsedSeconds =
    existingSample.elapsedSeconds + nextSample.elapsedSeconds;
  const kind =
    existingSample.kind === "measured" || nextSample.kind === "measured"
      ? "measured"
      : "context";

  return {
    averageLatencyMs: executionCount > 0 ? totalDurationMs / executionCount : 0,
    elapsedSeconds,
    executionCount,
    kind,
    queriesPerSecond:
      kind === "measured"
        ? executionCount / QUERY_ACTIVITY_BUCKET_SECONDS
        : null,
    time: nextSample.time,
    totalDurationMs,
  };
}

function appendQueryMetricSamples(
  samples: QueryMetricSample[],
  nextSamples: QueryMetricSample[],
): QueryMetricSample[] {
  if (nextSamples.length === 0) {
    return samples;
  }

  const latestTime =
    nextSamples.at(-1)?.time ?? samples.at(-1)?.time ?? Date.now() / 1000;
  const cutoff = latestTime - MAX_QUERY_ACTIVITY_WINDOW_SECONDS;

  return [...samples, ...nextSamples]
    .filter((sample) => sample.time >= cutoff)
    .sort((left, right) => {
      if (left.time !== right.time) {
        return left.time - right.time;
      }

      return left.query.id.localeCompare(right.query.id);
    });
}

function getVisibleActivitySamples(
  samples: QueryActivitySample[],
  windowSeconds: QueryActivityWindowSeconds,
): QueryActivitySample[] {
  const range = getQueryActivityWindowRange(samples, windowSeconds);

  return samples.filter(
    (sample) => sample.time >= range.start && sample.time <= range.end,
  );
}

function getQueryActivityWindowRange(
  samples: QueryActivitySample[],
  windowSeconds: QueryActivityWindowSeconds,
): { end: number; start: number } {
  const end = samples.at(-1)?.time ?? Date.now() / 1000;

  return {
    end,
    start: end - windowSeconds,
  };
}

function getWindowScopedQueries(args: {
  queries: StudioQueryInsightQuery[];
  querySamples: QueryMetricSample[];
  range: { end: number; start: number };
}): StudioQueryInsightQuery[] {
  const { queries, querySamples, range } = args;
  const latestQueriesById = getQueriesById(queries);
  const samplesByQueryId = new Map<string, QueryMetricSample[]>();

  for (const sample of querySamples) {
    if (
      sample.executionCount <= 0 ||
      sample.time < range.start ||
      sample.time > range.end
    ) {
      continue;
    }

    const samples = samplesByQueryId.get(sample.query.id) ?? [];
    samples.push(sample);
    samplesByQueryId.set(sample.query.id, samples);
  }

  return [...samplesByQueryId.entries()].map(([queryId, samples]) => {
    const latestSample = samples.at(-1);
    const baseQuery =
      latestQueriesById.get(queryId) ?? latestSample?.query ?? null;

    if (!baseQuery) {
      throw new Error(`Missing query for Query Insights sample: ${queryId}`);
    }

    const count = samples.reduce(
      (sum, sample) => sum + sample.executionCount,
      0,
    );
    const totalDurationMs = samples.reduce(
      (sum, sample) => sum + sample.totalDurationMs,
      0,
    );

    return {
      ...baseQuery,
      count,
      duration: count > 0 ? totalDurationMs / count : baseQuery.duration,
      lastSeen: Math.max(...samples.map((sample) => sample.query.lastSeen)),
      reads: samples.reduce((sum, sample) => sum + sample.reads, 0),
      rowsReturned: samples.reduce(
        (sum, sample) => sum + sample.rowsReturned,
        0,
      ),
    };
  });
}

function getQueriesById(
  queries: StudioQueryInsightQuery[],
): Map<string, StudioQueryInsightQuery> {
  return new Map(queries.map((query) => [query.id, query]));
}

function getAverageCounterPerExecution(total: number, count: number): number {
  if (!Number.isFinite(total) || count <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(total / count));
}

function getSeriesMax(
  samples: QueryActivitySample[],
  getValue: (sample: QueryActivitySample) => number | null,
): number {
  const values = samples
    .map(getValue)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const max = Math.max(0, ...values);

  return max > 0 ? max : 1;
}

function getQueryActivitySummary(
  samples: QueryActivitySample[],
): QueryActivitySummary {
  const measuredSamples = samples.filter(isMeasuredQueryActivitySample);
  const contextSamples = samples.filter(
    (sample) => sample.kind === "context" && sample.executionCount > 0,
  );
  const measuredSeconds = measuredSamples.reduce(
    (sum, sample) => sum + sample.elapsedSeconds,
    0,
  );
  const executionCount = measuredSamples.reduce(
    (sum, sample) => sum + sample.executionCount,
    0,
  );
  const totalDurationMs = measuredSamples.reduce(
    (sum, sample) => sum + sample.totalDurationMs,
    0,
  );
  const contextExecutionCount = contextSamples.reduce(
    (sum, sample) => sum + sample.executionCount,
    0,
  );
  const contextDurationMs = contextSamples.reduce(
    (sum, sample) => sum + sample.totalDurationMs,
    0,
  );

  return {
    averageLatencyMs:
      executionCount > 0
        ? totalDurationMs / executionCount
        : contextExecutionCount > 0
          ? contextDurationMs / contextExecutionCount
          : null,
    queriesPerSecond:
      measuredSeconds > 0 ? executionCount / measuredSeconds : null,
  };
}

function buildQueryActivityPath(args: {
  chartWidth: number;
  domainEnd: number;
  domainStart: number;
  getValue: (sample: QueryActivitySample) => number | null;
  maxValue: number;
  samples: QueryActivitySample[];
}): string {
  const { chartWidth, domainEnd, domainStart, getValue, maxValue, samples } =
    args;
  const measuredSamples = samples.filter((sample) => {
    return isMeasuredQueryActivitySample(sample) && getValue(sample) !== null;
  });

  if (measuredSamples.length === 0) {
    return "";
  }

  let previousSample: QueryActivitySample | null = null;

  return measuredSamples
    .map((sample) => {
      const x = getQueryActivityX({
        chartWidth,
        domainEnd,
        domainStart,
        time: sample.time,
      });
      const value = getValue(sample);

      if (value === null) {
        return "";
      }

      const y = getQueryActivityY(value, maxValue);
      const command =
        previousSample &&
        areQueryActivitySamplesContinuous(previousSample, sample)
          ? "L"
          : "M";

      previousSample = sample;

      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function areQueryActivitySamplesContinuous(
  previousSample: QueryActivitySample,
  nextSample: QueryActivitySample,
): boolean {
  if (
    !isMeasuredQueryActivitySample(previousSample) ||
    !isMeasuredQueryActivitySample(nextSample)
  ) {
    return false;
  }

  const gapSeconds = nextSample.time - previousSample.time;

  return (
    gapSeconds <=
    QUERY_ACTIVITY_MAX_CONNECTED_GAP_SECONDS +
      QUERY_ACTIVITY_SAMPLE_GAP_TOLERANCE_SECONDS
  );
}

function getIsolatedQueryActivitySamples(
  samples: QueryActivitySample[],
): QueryActivitySample[] {
  const activitySamples = samples.filter(hasQueryActivitySampleValue);

  return activitySamples.filter((sample, index) => {
    const previousSample = activitySamples[index - 1];
    const nextSample = activitySamples[index + 1];
    const isConnectedToPrevious =
      previousSample &&
      areQueryActivitySamplesContinuous(previousSample, sample);
    const isConnectedToNext =
      nextSample && areQueryActivitySamplesContinuous(sample, nextSample);

    return !isConnectedToPrevious && !isConnectedToNext;
  });
}

function getQueryActivityCache(
  queryInsights: StudioQueryInsights,
): QueryActivityCache {
  const existingCache = queryActivityCacheByProvider.get(queryInsights);

  if (existingCache) {
    return existingCache;
  }

  const cache = {
    pollingIntervalMs: DEFAULT_POLLING_INTERVAL_MS,
    queriesById: new Map<string, StudioQueryInsightQuery>(),
    querySamples: [],
    samples: [],
    totals: null,
  };

  queryActivityCacheByProvider.set(queryInsights, cache);

  return cache;
}

function isMeasuredQueryActivitySample(sample: QueryActivitySample): boolean {
  return sample.kind === "measured";
}

function hasQueryActivitySampleValue(sample: QueryActivitySample): boolean {
  return (
    (sample.queriesPerSecond !== null && sample.queriesPerSecond > 0) ||
    (sample.averageLatencyMs !== null && sample.averageLatencyMs > 0)
  );
}

function getQueryActivityX(args: {
  chartWidth: number;
  domainEnd: number;
  domainStart: number;
  time: number;
}): number {
  const { chartWidth, domainEnd, domainStart, time } = args;
  const domainWidth = Math.max(1, domainEnd - domainStart);
  const progress = Math.min(1, Math.max(0, (time - domainStart) / domainWidth));

  return (
    QUERY_ACTIVITY_CHART_PADDING.left +
    progress * getQueryActivityPlotWidth(chartWidth)
  );
}

function getQueryActivityPlotWidth(chartWidth: number): number {
  return Math.max(
    1,
    chartWidth -
      QUERY_ACTIVITY_CHART_PADDING.left -
      QUERY_ACTIVITY_CHART_PADDING.right,
  );
}

function getQueryActivityY(value: number, maxValue: number): number {
  const progress = Math.min(1, Math.max(0, value / Math.max(1, maxValue)));

  return (
    QUERY_ACTIVITY_CHART_PADDING.top +
    (1 - progress) * QUERY_ACTIVITY_CHART_PLOT_HEIGHT
  );
}

function getNullableQueryActivityY(
  value: number | null,
  maxValue: number,
): number | null {
  return value === null ? null : getQueryActivityY(value, maxValue);
}

function getQueryActivityTicks(domainStart: number, domainEnd: number) {
  const tickCount = 5;
  const step = (domainEnd - domainStart) / (tickCount - 1);

  return Array.from({ length: tickCount }, (_, index) =>
    index === tickCount - 1 ? domainEnd : domainStart + step * index,
  );
}

function formatQueryActivityTick(tick: number, domainEnd: number): string {
  const secondsAgo = Math.max(0, domainEnd - tick);

  if (secondsAgo < 1) {
    return "now";
  }

  if (secondsAgo < 60) {
    return `-${secondsAgo.toFixed(0)}s`;
  }

  if (secondsAgo < 3600) {
    return `-${Math.round(secondsAgo / 60)}m`;
  }

  return `-${Math.round(secondsAgo / 3600)}h`;
}

function formatQueriesPerSecond(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  if (value <= 0) {
    return "0/s";
  }

  if (value < 0.01) {
    return "< 0.01/s";
  }

  if (value < 1) {
    return `${value.toFixed(2)}/s`;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}/s`;
}

function formatActivityLatency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  if (value <= 0) {
    return "0ms";
  }

  return formatLatency(value);
}

function isQueryActivityWindowSeconds(
  value: number,
): value is QueryActivityWindowSeconds {
  return QUERY_ACTIVITY_WINDOWS.some((option) => option.value === value);
}

function getSortValue(
  query: StudioQueryInsightQuery,
  field: SortField,
): number {
  switch (field) {
    case "executions":
      return query.count;
    case "lastSeen":
      return query.lastSeen;
    case "latency":
      return query.duration;
    case "rowsReturned":
      return query.rowsReturned;
  }
}

function formatLatency(durationMs: number): string {
  if (!Number.isFinite(durationMs)) {
    return "n/a";
  }

  if (durationMs < 1) {
    return "< 1ms";
  }

  return `${durationMs.toFixed(0)}ms`;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}
