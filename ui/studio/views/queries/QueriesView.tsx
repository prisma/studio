import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudioQueryInsightQuery } from "@/data/query-insights";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
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
import { cn } from "../../../lib/utils";
import { useStudio } from "../../context";
import { StudioHeader } from "../../StudioHeader";
import type { ViewProps } from "../View";
import {
  buildQueryInsightAnalysisPrompt,
  parseQueryInsightAnalysisResponse,
  type QueryInsightAnalysis,
} from "./query-insights-ai";

const DEFAULT_QUERY_LIMIT = 500;
const DEFAULT_POLLING_INTERVAL_MS = 1000;
const ALL_TABLES_VALUE = "__all__";

type SortField = "reads" | "latency" | "executions" | "lastSeen";
type SortDirection = "asc" | "desc";

interface SortState {
  direction: SortDirection;
  field: SortField;
}

const DEFAULT_SORT: SortState = {
  direction: "desc",
  field: "reads",
};

const SORT_OPTIONS: Array<{
  label: string;
  value: `${SortField}:${SortDirection}`;
}> = [
  { label: "Reads high to low", value: "reads:desc" },
  { label: "Reads low to high", value: "reads:asc" },
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

export function QueriesView(_props: ViewProps) {
  const { hasAiQueryRecommendations, queryInsights, requestLlm } = useStudio();
  const [queries, setQueries] = useState<StudioQueryInsightQuery[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [pollingIntervalMs, setPollingIntervalMs] = useState(
    DEFAULT_POLLING_INTERVAL_MS,
  );
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
  const latestAbortControllerRef = useRef<AbortController | null>(null);

  const selectedQuery = useMemo(
    () => queries.find((query) => query.id === selectedQueryId) ?? null,
    [queries, selectedQueryId],
  );
  const selectedQueryIndex = useMemo(
    () =>
      selectedQueryId
        ? queries.findIndex((query) => query.id === selectedQueryId)
        : -1,
    [queries, selectedQueryId],
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
        setErrorMessage(snapshotError.message);
        return;
      }

      setQueries(snapshot.queries);
      setPollingIntervalMs(
        snapshot.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS,
      );
      setErrorMessage(null);
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [isPaused, queryInsights]);

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
    if (!selectedQuery || !hasAiQueryRecommendations) {
      return;
    }

    if (analysisByQueryId[selectedQuery.id]) {
      return;
    }

    let cancelled = false;
    setAnalysisLoadingQueryId(selectedQuery.id);
    setAnalysisErrorByQueryId((current) => ({
      ...current,
      [selectedQuery.id]: undefined,
    }));

    void requestLlm({
      prompt: buildQueryInsightAnalysisPrompt(selectedQuery),
      task: "query-insights",
    })
      .then((responseText) => {
        if (cancelled) {
          return;
        }

        const analysis = parseQueryInsightAnalysisResponse(responseText);
        setAnalysisByQueryId((current) => ({
          ...current,
          [selectedQuery.id]: analysis,
        }));
        setAnalysisLoadingQueryId(null);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setAnalysisErrorByQueryId((current) => ({
          ...current,
          [selectedQuery.id]:
            error instanceof Error ? error.message : String(error),
        }));
        setAnalysisLoadingQueryId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [analysisByQueryId, hasAiQueryRecommendations, requestLlm, selectedQuery]);

  const availableTables = useMemo(() => {
    const tables = new Set<string>();

    for (const query of queries) {
      for (const table of query.tables) {
        tables.add(table);
      }
    }

    return [...tables].sort((left, right) => left.localeCompare(right));
  }, [queries]);

  const visibleQueries = useMemo(() => {
    const filtered = selectedTable
      ? queries.filter((query) => query.tables.includes(selectedTable))
      : queries;
    const multiplier = sort.direction === "desc" ? -1 : 1;

    return [...filtered].sort((left, right) => {
      return (
        multiplier *
        (getSortValue(left, sort.field) - getSortValue(right, sort.field))
      );
    });
  }, [queries, selectedTable, sort]);

  const summary = useMemo(() => {
    const totalExecutions = queries.reduce(
      (sum, query) => sum + query.count,
      0,
    );
    const totalDuration = queries.reduce(
      (sum, query) => sum + query.duration * query.count,
      0,
    );
    const totalReads = queries.reduce((sum, query) => sum + query.reads, 0);

    return {
      averageLatency: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
      totalExecutions,
      totalReads,
      uniqueQueries: queries.length,
    };
  }, [queries]);

  const selectPreviousQuery = useCallback(() => {
    if (selectedQueryIndex <= 0) {
      return;
    }

    setSelectedQueryId(queries[selectedQueryIndex - 1]?.id ?? null);
  }, [queries, selectedQueryIndex]);

  const selectNextQuery = useCallback(() => {
    if (selectedQueryIndex < 0 || selectedQueryIndex >= queries.length - 1) {
      return;
    }

    setSelectedQueryId(queries[selectedQueryIndex + 1]?.id ?? null);
  }, [queries, selectedQueryIndex]);

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
            <p className="max-w-3xl text-sm text-muted-foreground">
              Monitor database activity and inspect query patterns as they are
              observed by the embedder.
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
            <Button
              disabled={isPaused}
              onClick={() => void fetchSnapshot()}
              className="shadow-none"
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-2.5 md:grid-cols-4">
          <MetricCard
            label="Unique Queries"
            value={numberFormatter.format(summary.uniqueQueries)}
          />
          <MetricCard
            label="Executions"
            value={numberFormatter.format(summary.totalExecutions)}
          />
          <MetricCard
            label="Average Latency"
            value={`${formatLatency(summary.averageLatency)}`}
          />
          <MetricCard
            label="Reads"
            value={numberFormatter.format(summary.totalReads)}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "size-1.5 rounded-full",
                errorMessage
                  ? "bg-destructive"
                  : isPaused
                    ? "bg-muted-foreground/60"
                    : "bg-green-500/70",
              )}
            />
            {isPaused
              ? "Live updates paused"
              : errorMessage
                ? `Unable to refresh: ${errorMessage}`
                : "Live updates active"}
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Select
              value={selectedTable ?? ALL_TABLES_VALUE}
              onValueChange={(value) => {
                setSelectedTable(value === ALL_TABLES_VALUE ? null : value);
              }}
            >
              <SelectTrigger
                className="h-8 w-full border-border/70 bg-background shadow-none sm:w-44"
                label="Table"
              >
                <SelectValue />
              </SelectTrigger>
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
              <SelectTrigger
                className="h-8 w-full border-border/70 bg-background shadow-none sm:w-60"
                label="Sort"
              >
                <ArrowDownUp data-icon="inline-start" />
                <SelectValue />
              </SelectTrigger>
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
              queries={visibleQueries}
              selectedQueryId={selectedQueryId}
              sortField={sort.field}
              onSelectQuery={setSelectedQueryId}
            />
          ) : (
            <div className="flex h-full min-h-56 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Waiting for query activity.
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
          selectedQueryIndex >= 0 && selectedQueryIndex < queries.length - 1
        }
        hasPrevious={selectedQueryIndex > 0}
        isAnalysisLoading={analysisLoadingQueryId === selectedQuery?.id}
        onClose={() => setSelectedQueryId(null)}
        onNext={selectNextQuery}
        onPrevious={selectPreviousQuery}
        query={selectedQuery}
      />
    </div>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <Card
      className="rounded-lg border-border/70 bg-card/80 shadow-none"
      data-testid="queries-metric-card"
    >
      <CardHeader className="p-3 pb-1">
        <CardDescription className="text-xs font-medium">
          {props.label}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <CardTitle className="text-xl tracking-normal">{props.value}</CardTitle>
      </CardContent>
    </Card>
  );
}

function QueryTable(props: {
  onSelectQuery: (queryId: string) => void;
  queries: StudioQueryInsightQuery[];
  selectedQueryId: string | null;
  sortField: SortField;
}) {
  const { onSelectQuery, queries, selectedQueryId, sortField } = props;

  return (
    <Table className="table-fixed" containerProps={{ className: "h-full" }}>
      <colgroup>
        <col className="w-24" />
        <col />
        <col className="w-28" />
        <col className="w-24" />
        <col className="w-32" />
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
            <SortLabel active={sortField === "reads"}>Reads</SortLabel>
          </TableHead>
          <TableHead className="h-9 text-right text-[11px] font-medium uppercase tracking-[0.12em]">
            <SortLabel active={sortField === "lastSeen"}>Last Seen</SortLabel>
          </TableHead>
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
              {numberFormatter.format(query.reads)}
            </TableCell>
            <TableCell className="px-3 py-3 text-right text-muted-foreground">
              {formatTime(query.lastSeen)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
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
                  <MetricInline label="Reads" value={query.reads} />
                  <MetricInline label="Rows" value={query.rowsReturned} />
                </div>

                {canShowAnalysis && (
                  <div className="flex flex-col gap-3 border-t border-border/70 pt-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles data-icon="inline-start" />
                      Recommendations
                    </div>

                    {isAnalysisLoading ? (
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-4/5" />
                      </div>
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
    case "reads":
      return query.reads;
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
