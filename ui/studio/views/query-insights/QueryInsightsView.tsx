import {
  ChevronLeft,
  ChevronRight,
  Copy,
  DatabaseZap,
  Loader2,
  Pause,
  Play,
  SearchX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/ui/table";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { cn } from "@/ui/lib/utils";

import { useStudio } from "../../context";
import { StudioHeader } from "../../StudioHeader";
import { QueryInsightsChart } from "./QueryInsightsChart";
import {
  buildQueryInsightsDisplayRows,
  filterQueryInsightsByTable,
  getAvailableQueryInsightTables,
} from "./rows";
import {
  QUERY_INSIGHTS_CHART_BUFFER_LIMIT,
  QUERY_INSIGHTS_DEFAULT_SORT,
  QUERY_INSIGHTS_MAX_QUERIES,
  type QueryInsightsAnalysisResult,
  type QueryInsightsAnalyzeInput,
  type QueryInsightsChartPoint,
  type QueryInsightsDisplayRow,
  type QueryInsightsGroup,
  type QueryInsightsQuery,
  type QueryInsightsSortDirection,
  type QueryInsightsSortField,
  type QueryInsightsSortState,
} from "./types";
import { useQueryInsightsRows } from "./use-query-insights-rows";
import { useQueryInsightsStream } from "./use-query-insights-stream";

const SORT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Reads, high to low", value: "reads:desc" },
  { label: "Reads, low to high", value: "reads:asc" },
  { label: "Latency, high to low", value: "latency:desc" },
  { label: "Latency, low to high", value: "latency:asc" },
  { label: "Executions, high to low", value: "executions:desc" },
  { label: "Executions, low to high", value: "executions:asc" },
  { label: "Last seen, newest", value: "lastSeen:desc" },
  { label: "Last seen, oldest", value: "lastSeen:asc" },
];
const ALL_TABLES_VALUE = "__all__";

function parseSortParam(
  value: string | null | undefined,
): QueryInsightsSortState {
  if (!value) {
    return QUERY_INSIGHTS_DEFAULT_SORT;
  }

  const [field, direction] = value.split(":") as [
    QueryInsightsSortField | undefined,
    QueryInsightsSortDirection | undefined,
  ];

  if (
    (field === "latency" ||
      field === "reads" ||
      field === "executions" ||
      field === "lastSeen") &&
    (direction === "asc" || direction === "desc")
  ) {
    return { direction, field };
  }

  return QUERY_INSIGHTS_DEFAULT_SORT;
}

function serializeSort(sort: QueryInsightsSortState): string {
  return `${sort.field}:${sort.direction}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value);
}

function formatLatency(ms: number): string {
  if (ms < 1) {
    return "< 1ms";
  }

  if (ms >= 1_000) {
    return `${(ms / 1_000).toFixed(2)}s`;
  }

  return `${ms.toFixed(0)}ms`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function mergeChartPoints(
  existing: QueryInsightsChartPoint,
  incoming: QueryInsightsChartPoint,
): QueryInsightsChartPoint {
  const queryCount = existing.queryCount + incoming.queryCount;

  return {
    avgDurationMs:
      queryCount > 0
        ? (existing.avgDurationMs * existing.queryCount +
            incoming.avgDurationMs * incoming.queryCount) /
          queryCount
        : 0,
    queryCount,
    ts: existing.ts,
  };
}

function formatTableList(tables: string[]): string {
  if (tables.length === 0) {
    return "unknown tables";
  }

  if (tables.length === 1) {
    return tables[0] ?? "unknown table";
  }

  return `${tables.slice(0, -1).join(", ")} and ${tables.at(-1)}`;
}

function getRowKey(row: QueryInsightsDisplayRow): string {
  return row.type === "group"
    ? `group:${row.group.groupKey}`
    : `query:${row.query.id}`;
}

function getRowLabel(row: QueryInsightsDisplayRow): string {
  if (row.type === "group") {
    const { prismaQueryInfo } = row.group;
    return `${prismaQueryInfo.model ? `${prismaQueryInfo.model}.` : ""}${prismaQueryInfo.action}()`;
  }

  const { prismaQueryInfo } = row.query;

  if (prismaQueryInfo && !prismaQueryInfo.isRaw) {
    return `${prismaQueryInfo.model ? `${prismaQueryInfo.model}.` : ""}${prismaQueryInfo.action}()`;
  }

  return row.query.query;
}

function rowMatchesKey(
  row: QueryInsightsDisplayRow,
  key: string | null,
): boolean {
  return key !== null && getRowKey(row) === key;
}

function getRowMetrics(row: QueryInsightsDisplayRow) {
  if (row.type === "group") {
    return {
      count: row.group.totalCount,
      duration: row.group.avgDuration,
      lastSeen: row.group.lastSeen,
      reads: row.group.totalReads,
      rowsReturned: row.group.totalRows,
      tables: row.group.tables,
    };
  }

  return {
    count: row.query.count,
    duration: row.query.duration,
    lastSeen: row.query.lastSeen,
    reads: row.query.reads,
    rowsReturned: row.query.rowsReturned,
    tables: row.query.tables,
  };
}

function PrismaOperationCode(props: {
  info: NonNullable<QueryInsightsQuery["prismaQueryInfo"]>;
}) {
  const { info } = props;

  return (
    <code className="block truncate font-mono text-xs">
      {info.model ? `${info.model}.` : ""}
      <span className="font-semibold text-foreground">{info.action}</span>
      {info.payload ? `(${JSON.stringify(info.payload)})` : "()"}
    </code>
  );
}

function QueryLabel(props: { row: QueryInsightsDisplayRow }) {
  const { row } = props;

  if (row.type === "group") {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <PrismaOperationCode info={row.group.prismaQueryInfo} />
        <span className="truncate text-xs text-muted-foreground">
          {row.group.children.length} SQL statements
        </span>
      </div>
    );
  }

  if (row.query.prismaQueryInfo && !row.query.prismaQueryInfo.isRaw) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <PrismaOperationCode info={row.query.prismaQueryInfo} />
        <span className="truncate font-mono text-xs text-muted-foreground">
          {row.query.query}
        </span>
      </div>
    );
  }

  return (
    <code className="block truncate font-mono text-xs">{row.query.query}</code>
  );
}

function QueryInsightsTable(props: {
  displayRows: QueryInsightsDisplayRow[];
  flushedIds: Set<string>;
  isAtLimit: boolean;
  isPaused: boolean;
  onSelectRow: (row: QueryInsightsDisplayRow) => void;
  pauseBufferSize: number;
  recentlyAddedIds: Set<string>;
  selectedRowKey: string | null;
  sort: QueryInsightsSortState;
}) {
  const {
    displayRows,
    flushedIds,
    isAtLimit,
    isPaused,
    onSelectRow,
    pauseBufferSize,
    recentlyAddedIds,
    selectedRowKey,
    sort,
  } = props;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-transparent bg-background after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-sm after:border after:border-border">
      {isAtLimit ? (
        <div className="border-b border-border bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
          Showing the latest {formatNumber(QUERY_INSIGHTS_MAX_QUERIES)} unique
          query patterns.
        </div>
      ) : null}
      {isPaused && pauseBufferSize > 0 ? (
        <div className="border-b border-border bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
          Recorded {formatNumber(pauseBufferSize)} recent{" "}
          {pauseBufferSize === 1 ? "query" : "queries"} while paused.
        </div>
      ) : null}
      <Table
        className="min-w-[42rem] table-fixed"
        containerProps={{
          className: "relative min-h-0 flex-1 overflow-auto",
          "data-testid": "query-insights-table",
        }}
      >
        <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <TableRow className="border-border hover:bg-background">
            <TableHead className="h-9 w-28 px-3 text-xs">Latency</TableHead>
            <TableHead className="h-9 px-3 text-xs">Query</TableHead>
            <TableHead className="h-9 w-28 px-3 text-right text-xs">
              Executions
            </TableHead>
            <TableHead className="h-9 w-24 px-3 text-right text-xs">
              Reads
            </TableHead>
            <TableHead className="h-9 w-28 px-3 text-right text-xs">
              Last Seen
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayRows.map((row) => {
            const key = getRowKey(row);
            const metrics = getRowMetrics(row);
            const isSelected = key === selectedRowKey;
            const queryIds =
              row.type === "group"
                ? row.group.children.map((query) => query.id)
                : [row.query.id];
            const isFlushed = queryIds.some((id) => flushedIds.has(id));
            const isNew = queryIds.some((id) => recentlyAddedIds.has(id));

            return (
              <TableRow
                aria-label={getRowLabel(row)}
                className={cn(
                  "cursor-pointer border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isSelected && "bg-muted",
                  isFlushed && "bg-primary/10",
                  isNew && "bg-primary/5",
                )}
                data-state={isSelected ? "selected" : undefined}
                key={key}
                onClick={() => onSelectRow(row)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }

                  event.preventDefault();
                  onSelectRow(row);
                }}
                role="button"
                tabIndex={0}
              >
                <TableCell className="px-3 py-2">
                  <Badge
                    className="font-medium tabular-nums"
                    variant={
                      metrics.duration >= 500
                        ? "destructive"
                        : metrics.duration >= 100
                          ? "secondary"
                          : "success"
                    }
                  >
                    {formatLatency(metrics.duration)}
                  </Badge>
                </TableCell>
                <TableCell className="min-w-0 px-3 py-2">
                  <QueryLabel row={row} />
                </TableCell>
                <TableCell
                  className={cn(
                    "px-3 py-2 text-right font-mono text-xs",
                    sort.field === "executions" && "text-foreground",
                  )}
                >
                  {formatNumber(metrics.count)}
                </TableCell>
                <TableCell
                  className={cn(
                    "px-3 py-2 text-right font-mono text-xs",
                    sort.field === "reads" && "text-foreground",
                  )}
                >
                  {metrics.reads > 0 ? formatNumber(metrics.reads) : "-"}
                </TableCell>
                <TableCell
                  className={cn(
                    "px-3 py-2 text-right font-mono text-xs",
                    sort.field === "lastSeen" && "text-foreground",
                  )}
                >
                  {formatTime(metrics.lastSeen)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CopyButton(props: {
  className?: string;
  label: string;
  onCopied?: () => void;
  text: string;
}) {
  const { className, label, onCopied, text } = props;

  return (
    <Button
      aria-label={label}
      className={className}
      onClick={() => {
        void (navigator.clipboard?.writeText(text) ?? Promise.resolve()).then(
          () => onCopied?.(),
        );
      }}
      size="icon"
      type="button"
      variant="outline"
    >
      <Copy data-icon="inline-start" />
    </Button>
  );
}

function EmbeddedCodeBlock(props: {
  children: string;
  language: "sql" | "text" | "ts";
  lineClamp?: number;
  onCopied?: () => void;
}) {
  const { children, language, lineClamp, onCopied } = props;
  const clampStyle =
    lineClamp != null
      ? ({
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: lineClamp,
          display: "-webkit-box",
        } as const)
      : undefined;

  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-muted/30">
      <CopyButton
        className="absolute right-3 top-3 z-10 size-7 bg-background/90 shadow-none"
        label={`Copy ${language}`}
        onCopied={onCopied}
        text={children}
      />
      <pre
        className="overflow-auto whitespace-pre-wrap break-words p-4 pr-12 font-mono text-sm leading-6 text-foreground"
        style={clampStyle}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

function buildAnalysisInput(
  selectedRow: QueryInsightsDisplayRow,
): QueryInsightsAnalyzeInput {
  const target =
    selectedRow.type === "group"
      ? selectedRow.group.children[0]
      : selectedRow.query;

  return {
    explainPlan: null,
    groupChildren:
      selectedRow.type === "group"
        ? selectedRow.group.children.map((child) => ({
            queryStats: {
              count: child.count,
              duration: child.duration,
              reads: child.reads,
              rowsReturned: child.rowsReturned,
            },
            rawQuery: child.query,
          }))
        : null,
    prismaQueryInfo: target?.prismaQueryInfo
      ? JSON.stringify(target.prismaQueryInfo)
      : null,
    queryStats: target
      ? {
          count: target.count,
          duration: target.duration,
          reads: target.reads,
          rowsReturned: target.rowsReturned,
        }
      : null,
    rawQuery: target?.query ?? "",
  };
}

function useQueryInsightsAnalysis(selectedRow: QueryInsightsDisplayRow | null) {
  const { queryInsights } = useStudio();
  const [isAiEnabled, setIsAiEnabled] = useState(
    () => queryInsights?.aiRecommendationsEnabled === true,
  );
  const [isEnabling, setIsEnabling] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<QueryInsightsAnalysisResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (queryInsights?.aiRecommendationsEnabled) {
      setIsAiEnabled(true);
    }
  }, [queryInsights?.aiRecommendationsEnabled]);

  useEffect(() => {
    setAnalysis(null);
    setError(null);

    if (!selectedRow || !queryInsights || !isAiEnabled) {
      setIsAnalyzing(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsAnalyzing(true);

    const timer = setTimeout(() => {
      void queryInsights
        .analyze(buildAnalysisInput(selectedRow))
        .then((response) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setAnalysis(response.result);
          setError(response.error ?? null);
        })
        .catch((error: unknown) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setIsAnalyzing(false);
          }
        });
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [isAiEnabled, queryInsights, selectedRow]);

  const enable = useCallback(async () => {
    if (!queryInsights) {
      return;
    }

    setIsEnabling(true);
    setError(null);

    try {
      await queryInsights.enableAiRecommendations();
      setIsAiEnabled(true);
      queryInsights.onEvent?.({
        name: "studio:query_insights:ai_consent_accepted",
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setIsAiEnabled(false);
    } finally {
      setIsEnabling(false);
    }
  }, [queryInsights]);

  return {
    analysis,
    enable,
    error,
    isAiEnabled,
    isAnalyzing,
    isEnabling,
  };
}

function ProseSummary(props: { row: QueryInsightsDisplayRow }) {
  const { row } = props;
  const metrics = getRowMetrics(row);
  const tableText =
    metrics.tables.length > 0 ? formatTableList(metrics.tables) : null;

  if (row.type === "group") {
    return (
      <div className="flex flex-col gap-2">
        <p className="m-0 text-base leading-7 text-foreground">
          This Prisma ORM call had an average total latency of{" "}
          <span className="font-medium">{formatLatency(metrics.duration)}</span>
          , with a minimum of{" "}
          <span className="font-medium">
            {formatLatency(row.group.minDuration)}
          </span>{" "}
          and a maximum of{" "}
          <span className="font-medium">
            {formatLatency(row.group.maxDuration)}
          </span>
          .
        </p>
        <p className="m-0 text-base leading-7 text-foreground">
          The call generated{" "}
          <span className="font-medium">
            {row.group.children.length} SQL{" "}
            {row.group.children.length === 1 ? "query" : "queries"}
          </span>
          {tableText
            ? ` that read from ${tableText} ${
                metrics.tables.length === 1 ? "table" : "tables"
              }`
            : ""}{" "}
          with a total of{" "}
          <span className="font-medium">
            {formatNumber(row.group.totalRows)}
          </span>{" "}
          rows. It has been executed{" "}
          <span className="font-medium">{formatNumber(metrics.count)}</span>{" "}
          times in this session.
        </p>
      </div>
    );
  }

  const { prismaQueryInfo } = row.query;
  const isPrisma = prismaQueryInfo && !prismaQueryInfo.isRaw;

  return (
    <p className="m-0 text-base leading-7 text-foreground">
      {isPrisma ? (
        <>
          This{" "}
          <code className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-sm">
            {prismaQueryInfo.model ? `${prismaQueryInfo.model}.` : ""}
            {prismaQueryInfo.action}()
          </code>{" "}
          Prisma operation
          {tableText
            ? ` reads from ${tableText} ${
                metrics.tables.length === 1 ? "table" : "tables"
              }`
            : ""}
          .
        </>
      ) : (
        <>This SQL query{tableText ? ` reads from ${tableText}` : ""}.</>
      )}{" "}
      It has been executed{" "}
      <span className="font-medium">{formatNumber(metrics.count)}</span> times,
      averaging{" "}
      <span className="font-medium">{formatLatency(metrics.duration)}</span>{" "}
      latency and{" "}
      <span className="font-medium">{formatNumber(metrics.reads)}</span> block
      reads per call.
    </p>
  );
}

const SQL_LINE_CLAMP = 4;
const SQL_LENGTH_THRESHOLD = 160;

function CollapsibleSqlBlock(props: {
  onCopied: () => void;
  query: QueryInsightsQuery;
}) {
  const { onCopied, query } = props;
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
  }, [query.id]);

  const isLong =
    query.query.split("\n").length > SQL_LINE_CLAMP ||
    query.query.length > SQL_LENGTH_THRESHOLD;

  return (
    <div className="flex flex-col gap-2">
      <EmbeddedCodeBlock
        language="sql"
        lineClamp={!isExpanded && isLong ? SQL_LINE_CLAMP : undefined}
        onCopied={onCopied}
      >
        {query.query}
      </EmbeddedCodeBlock>
      {isLong ? (
        <Button
          className="h-auto w-fit p-0 text-sm font-normal text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
          onClick={() => setIsExpanded((current) => !current)}
          type="button"
          variant="ghost"
        >
          {isExpanded ? "Collapse query" : "Show full query"}
        </Button>
      ) : null}
    </div>
  );
}

function renderMarkdownText(text: string) {
  const blocks: Array<{
    text: string;
    type: "heading" | "paragraph";
  }> = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      text: paragraphLines.join(" ").replace(/\*\*/g, ""),
      type: "paragraph",
    });
    paragraphLines = [];
  };

  for (const line of text.split("\n")) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmedLine);

    if (heading) {
      flushParagraph();
      blocks.push({
        text: heading[2] ?? trimmedLine,
        type: "heading",
      });
      continue;
    }

    paragraphLines.push(trimmedLine);
  }

  flushParagraph();

  return blocks;
}

function buildRecommendationPrompt(
  recommendation: string,
  query: QueryInsightsQuery,
): string {
  const context =
    query.prismaQueryInfo && !query.prismaQueryInfo.isRaw
      ? `${query.prismaQueryInfo.model ? `${query.prismaQueryInfo.model}.` : ""}${query.prismaQueryInfo.action}()`
      : null;
  const parts = [
    context
      ? `My Prisma query (${context}) has a performance issue:`
      : "My query has a performance issue:",
    "",
    recommendation,
    "",
    `Query stats: avg latency ${formatLatency(query.duration)}, ${formatNumber(
      query.reads,
    )} block reads, ${formatNumber(query.rowsReturned)} rows returned.`,
    "",
    "SQL:",
    query.query,
    "",
    "Please help me fix this issue. Show the solution in both SQL and Prisma schema.prisma syntax where applicable.",
  ];

  return parts.join("\n");
}

function HighlightedText(props: { text: string }) {
  const parts = props.text.split(/(\d+(?:\.\d+)?%)/g);

  return (
    <p className="m-0 text-base leading-7 text-foreground">
      {parts.map((part, index) =>
        /^\d+(?:\.\d+)?%$/.test(part) ? (
          <span className="font-semibold text-primary" key={index}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

type RecommendationOutputTab = "prisma" | "prompt" | "sql";

function RecommendationBlock(props: {
  improvedPrisma?: string;
  improvedSql?: string;
  onCopied: (tab: "ai-prompt" | "prisma" | "sql") => void;
  query: QueryInsightsQuery;
  recommendation: string;
}) {
  const { improvedPrisma, improvedSql, onCopied, query, recommendation } =
    props;
  const [tab, setTab] = useState<RecommendationOutputTab>(
    improvedPrisma ? "prisma" : "prompt",
  );
  const content =
    tab === "prisma"
      ? (improvedPrisma ?? "")
      : tab === "sql"
        ? (improvedSql ?? "")
        : buildRecommendationPrompt(recommendation, query);

  return (
    <div className="flex flex-col gap-2">
      <HighlightedText text={recommendation} />
      <div className="overflow-hidden rounded-md border border-border bg-muted/20">
        <div className="flex items-center justify-end border-b border-border bg-background px-2 py-1.5">
          <Select
            onValueChange={(value) => setTab(value as RecommendationOutputTab)}
            value={tab}
          >
            <SelectTrigger className="h-8 w-32 font-sans" label="Copy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="prompt">Prompt</SelectItem>
                <SelectItem disabled={!improvedSql} value="sql">
                  SQL
                </SelectItem>
                <SelectItem disabled={!improvedPrisma} value="prisma">
                  Prisma
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <EmbeddedCodeBlock
          language={tab === "prisma" ? "ts" : tab === "sql" ? "sql" : "text"}
          onCopied={() =>
            onCopied(
              tab === "prisma" ? "prisma" : tab === "sql" ? "sql" : "ai-prompt",
            )
          }
        >
          {content}
        </EmbeddedCodeBlock>
      </div>
    </div>
  );
}

function AnalysisResult(props: {
  onCopied: (tab: "ai-prompt" | "prisma" | "sql") => void;
  query: QueryInsightsQuery;
  result: QueryInsightsAnalysisResult;
}) {
  const { onCopied, query, result } = props;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        {renderMarkdownText(result.analysisMarkdown).map((block, index) =>
          block.type === "heading" ? (
            <h3 className="text-xl font-semibold leading-7" key={index}>
              {block.text}
            </h3>
          ) : (
            <p className="m-0 text-base leading-7 text-foreground" key={index}>
              {block.text}
            </p>
          ),
        )}
      </div>

      {result.issuesFound.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold leading-7">Issues</h3>
          <ul className="flex flex-col gap-1 text-base leading-7 text-foreground">
            {result.issuesFound.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.recommendations.length > 0 ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-xl font-semibold leading-7">Recommendations</h3>
          <div className="flex flex-col gap-4">
            {result.recommendations.map((recommendation) => (
              <RecommendationBlock
                improvedPrisma={result.improvedPrisma}
                improvedSql={result.improvedSql}
                key={recommendation}
                onCopied={onCopied}
                query={query}
                recommendation={recommendation}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConsentPanel(props: {
  isEnabling: boolean;
  onEnable: () => Promise<void>;
}) {
  const { isEnabling, onEnable } = props;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed border-border p-8 text-center">
      <div className="flex max-w-lg flex-col items-center gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-xl font-semibold leading-7">
            Enable AI-powered recommendations
          </h3>
          <p className="m-0 text-sm leading-6 text-muted-foreground">
            Enabling this feature will pass query structure to generative AI to
            identify improvements in your queries. Query parameters are not used
            for this feature and are not visible, stored, or used for AI in any
            way.
          </p>
        </div>
        <Button
          disabled={isEnabling}
          onClick={() => {
            void onEnable();
          }}
          type="button"
        >
          {isEnabling ? "Enabling..." : "Show Query Insights"}
        </Button>
      </div>
    </div>
  );
}

function QueryAnalysisState(props: {
  analysis: QueryInsightsAnalysisResult | null;
  error: string | null;
  isAnalyzing: boolean;
  onCopied: (tab: "ai-prompt" | "prisma" | "sql") => void;
  query: QueryInsightsQuery | null | undefined;
}) {
  const { analysis, error, isAnalyzing, onCopied, query } = props;

  if (isAnalyzing) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="animate-spin" data-icon="inline-start" />
        <span className="text-lg">Analyzing query...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 p-4 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (analysis && query) {
    return (
      <AnalysisResult onCopied={onCopied} query={query} result={analysis} />
    );
  }

  return null;
}

function ChildSqlCard(props: {
  index: number;
  onCopied: () => void;
  query: QueryInsightsQuery;
}) {
  const { index, onCopied, query } = props;
  const tableText =
    query.tables.length > 0 ? formatTableList(query.tables) : null;
  const ordinal =
    index === 0
      ? "first"
      : index === 1
        ? "second"
        : index === 2
          ? "third"
          : `#${index + 1}`;

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-base leading-7 text-foreground">
        The {ordinal} SQL query had an average latency of{" "}
        <span className="font-medium">{formatLatency(query.duration)}</span>.
        {tableText
          ? ` It accessed ${tableText} ${
              query.tables.length === 1 ? "table" : "tables"
            }.`
          : ""}{" "}
        This query returned{" "}
        <span className="font-medium">{formatNumber(query.rowsReturned)}</span>{" "}
        rows.
      </p>
      <EmbeddedCodeBlock language="sql" onCopied={onCopied}>
        {query.query}
      </EmbeddedCodeBlock>
    </div>
  );
}

function DetailSheet(props: {
  hasNext: boolean;
  hasPrevious: boolean;
  onClose: () => void;
  onCopied: (tab: "ai-prompt" | "prisma" | "sql") => void;
  onNext: () => void;
  onPrevious: () => void;
  row: QueryInsightsDisplayRow | null;
}) {
  const { hasNext, hasPrevious, onClose, onCopied, onNext, onPrevious, row } =
    props;
  const { analysis, enable, error, isAiEnabled, isAnalyzing, isEnabling } =
    useQueryInsightsAnalysis(row);
  const { queryInsights } = useStudio();
  const scopeRef = useRef<HTMLSpanElement | null>(null);
  const isOpen = row !== null;
  const scopePortalContainer = scopeRef.current?.closest(".ps");
  const portalContainer =
    scopePortalContainer instanceof HTMLElement
      ? scopePortalContainer
      : typeof document === "undefined"
        ? null
        : document.body;

  useEffect(() => {
    if (isOpen && !isAiEnabled) {
      queryInsights?.onEvent?.({
        name: "studio:query_insights:ai_consent_callout_viewed",
      });
    }
  }, [isAiEnabled, isOpen, queryInsights]);

  return (
    <>
      <span ref={scopeRef} aria-hidden="true" className="hidden" />
      <Sheet
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onClose();
          }
        }}
      >
        <SheetContent
          className="inset-y-2 right-2 flex h-[calc(100dvh-1rem)] w-[min(42rem,calc(100vw-1rem))] max-w-none flex-col overflow-hidden rounded-xl border border-border bg-background p-0 font-sans text-foreground shadow-xl sm:max-w-none"
          container={portalContainer}
          showCloseButton={false}
        >
          {row ? (
            <>
              <SheetHeader className="sr-only">
                <SheetTitle>Query analysis</SheetTitle>
                <SheetDescription>
                  Query runtime summary and AI recommendations.
                </SheetDescription>
              </SheetHeader>

              <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-8">
                <div className="inline-flex items-stretch overflow-hidden rounded-md border border-border bg-background shadow-sm">
                  <Button
                    aria-label="Previous query"
                    className="size-9 rounded-none border-0 border-r border-border shadow-none"
                    disabled={!hasPrevious}
                    onClick={onPrevious}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronLeft data-icon="inline-start" />
                  </Button>
                  <Button
                    aria-label="Next query"
                    className="size-9 rounded-none border-0 shadow-none"
                    disabled={!hasNext}
                    onClick={onNext}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronRight data-icon="inline-start" />
                  </Button>
                </div>
                <div className="inline-flex items-stretch overflow-hidden rounded-md border border-border bg-background shadow-sm">
                  <Button
                    aria-label="Close panel"
                    className="size-9 rounded-none border-0 shadow-none"
                    onClick={onClose}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <X data-icon="inline-start" />
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
                {!isAiEnabled ? (
                  <div className="flex min-h-full flex-col">
                    <ConsentPanel isEnabling={isEnabling} onEnable={enable} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    <ProseSummary row={row} />

                    {row.type === "group" ? (
                      <>
                        <EmbeddedCodeBlock
                          language="ts"
                          onCopied={() => onCopied("prisma")}
                        >
                          {formatPrismaCall(row.group)}
                        </EmbeddedCodeBlock>
                        {row.group.children.map((child, index) => (
                          <ChildSqlCard
                            index={index}
                            key={child.id}
                            onCopied={() => onCopied("sql")}
                            query={child}
                          />
                        ))}
                      </>
                    ) : (
                      <CollapsibleSqlBlock
                        onCopied={() => onCopied("sql")}
                        query={row.query}
                      />
                    )}

                    <QueryAnalysisState
                      analysis={analysis}
                      error={error}
                      isAnalyzing={isAnalyzing}
                      onCopied={onCopied}
                      query={
                        row.type === "group" ? row.group.children[0] : row.query
                      }
                    />
                  </div>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function formatPrismaCall(group: QueryInsightsGroup): string {
  const { prismaQueryInfo } = group;
  const prefix = prismaQueryInfo.model
    ? `prisma.${prismaQueryInfo.model[0]?.toLowerCase()}${prismaQueryInfo.model.slice(1)}.`
    : "prisma.";

  if (!prismaQueryInfo.payload) {
    return `${prefix}${prismaQueryInfo.action}()`;
  }

  return `${prefix}${prismaQueryInfo.action}(${JSON.stringify(
    prismaQueryInfo.payload,
    null,
    2,
  )})`;
}

export function QueryInsightsView() {
  const { queryInsights } = useStudio();
  const {
    queryInsightsSortParam,
    queryInsightsTableParam,
    setQueryInsightsSortParam,
    setQueryInsightsTableParam,
  } = useNavigation();
  const [streamError, setStreamError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<QueryInsightsChartPoint[]>([]);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const wasAutoPausedRef = useRef(false);
  const rows = useQueryInsightsRows();
  const sort = parseSortParam(queryInsightsSortParam);
  const selectedTable = queryInsightsTableParam || null;
  const availableTables = useMemo(
    () => getAvailableQueryInsightTables(rows.queries),
    [rows.queries],
  );
  const filteredQueries = useMemo(
    () => filterQueryInsightsByTable(rows.queries, selectedTable),
    [rows.queries, selectedTable],
  );
  const displayRows = useMemo(
    () => buildQueryInsightsDisplayRows(filteredQueries, sort),
    [filteredQueries, sort],
  );
  const selectedRowIndex = displayRows.findIndex((row) =>
    rowMatchesKey(row, selectedRowKey),
  );
  const selectedRow =
    selectedRowIndex >= 0 ? (displayRows[selectedRowIndex] ?? null) : null;
  const canShowRows = rows.queries.length > 0;

  const addChartPoints = useCallback((points: QueryInsightsChartPoint[]) => {
    if (points.length === 0) {
      return;
    }

    setChartData((current) => {
      const nextByTimestamp = new Map<number, QueryInsightsChartPoint>();

      for (const point of current) {
        nextByTimestamp.set(point.ts, point);
      }

      for (const point of points) {
        const existing = nextByTimestamp.get(point.ts);
        nextByTimestamp.set(
          point.ts,
          existing ? mergeChartPoints(existing, point) : point,
        );
      }

      return Array.from(nextByTimestamp.values())
        .sort((left, right) => left.ts - right.ts)
        .slice(-QUERY_INSIGHTS_CHART_BUFFER_LIMIT);
    });
  }, []);
  const handleStreamError = useCallback(
    (message: string) => {
      setStreamError(message);
      queryInsights?.onEvent?.({
        name: "studio:query_insights:stream_error",
        payload: { message },
      });
    },
    [queryInsights],
  );
  const { status } = useQueryInsightsStream({
    onChartTicks: addChartPoints,
    onError: handleStreamError,
    onQueries: rows.ingestQueries,
    streamUrl: queryInsights?.streamUrl ?? "",
  });

  useEffect(() => {
    queryInsights?.onEvent?.({ name: "studio:query_insights:viewed" });
  }, [queryInsights]);

  useEffect(() => {
    if (canShowRows) {
      queryInsights?.onEvent?.({
        name: "studio:query_insights:query_displayed",
      });
    }
  }, [canShowRows, queryInsights]);

  if (!queryInsights) {
    return null;
  }

  function handleSelectRow(row: QueryInsightsDisplayRow) {
    setSelectedRowKey(getRowKey(row));

    if (!rows.isPaused) {
      wasAutoPausedRef.current = true;
      rows.pause();
    }

    queryInsights?.onEvent?.({
      name: "studio:query_insights:query_detail_opened",
      payload: {
        rowKey: getRowKey(row),
        type: row.type,
      },
    });
  }

  function closeDetail() {
    setSelectedRowKey(null);

    if (wasAutoPausedRef.current) {
      wasAutoPausedRef.current = false;
      rows.resume();
    }
  }

  function togglePause() {
    wasAutoPausedRef.current = false;

    if (rows.isPaused) {
      rows.resume();
      queryInsights?.onEvent?.({
        name: "studio:query_insights:table_resumed",
        payload: { bufferSize: rows.pauseBufferSize },
      });
      return;
    }

    rows.pause();
    queryInsights?.onEvent?.({
      name: "studio:query_insights:table_paused",
      payload: { queryCount: rows.queries.length },
    });
  }

  function navigateDetail(direction: -1 | 1) {
    const nextRow = displayRows[selectedRowIndex + direction];

    if (nextRow) {
      setSelectedRowKey(getRowKey(nextRow));
    }
  }

  function renderFilterControls() {
    return (
      <>
        <Select
          onValueChange={(value) => {
            const nextValue = value === ALL_TABLES_VALUE ? null : value;
            void setQueryInsightsTableParam(nextValue);
            queryInsights?.onEvent?.({
              name: "studio:query_insights:filter_applied",
              payload: { table: nextValue },
            });
          }}
          value={selectedTable ?? ALL_TABLES_VALUE}
        >
          <SelectTrigger className="w-full font-sans sm:w-44" label="Table">
            <SelectValue placeholder="All tables" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_TABLES_VALUE}>All tables</SelectItem>
              {availableTables.map((table) => (
                <SelectItem key={table} value={table}>
                  {table}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) => {
            const nextSort = parseSortParam(value);
            const serialized = serializeSort(nextSort);

            void setQueryInsightsSortParam(
              serialized === serializeSort(QUERY_INSIGHTS_DEFAULT_SORT)
                ? null
                : serialized,
            );
            queryInsights?.onEvent?.({
              name: "studio:query_insights:sort_changed",
              payload: { ...nextSort },
            });
          }}
          value={serializeSort(sort)}
        >
          <SelectTrigger className="w-full font-sans sm:w-52" label="Sort">
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
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <StudioHeader
        endContent={
          <div className="hidden items-center gap-2 lg:flex">
            {renderFilterControls()}
          </div>
        }
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden min-w-0 flex-col sm:flex">
            <span className="truncate text-sm font-medium text-foreground">
              Query Insights
            </span>
            <span className="truncate text-xs text-muted-foreground">
              Live query metrics
            </span>
          </div>
          <Button
            className="h-9 shrink-0 font-sans"
            onClick={togglePause}
            size="sm"
            type="button"
            variant={rows.isPaused ? "default" : "outline"}
          >
            {rows.isPaused ? (
              <Play data-icon="inline-start" />
            ) : (
              <Pause data-icon="inline-start" />
            )}
            {rows.isPaused ? "Resume" : "Pause"}
          </Button>
        </div>
      </StudioHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
          {renderFilterControls()}
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
          <QueryInsightsChart
            data={chartData}
            kind="latency"
            loading={status === "connecting" && chartData.length === 0}
            title="Average Latency"
          />
          <QueryInsightsChart
            data={chartData}
            kind="qps"
            loading={status === "connecting" && chartData.length === 0}
            title="Queries Per Second"
          />
        </div>

        {streamError ? (
          <div className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-muted-foreground">
            {streamError}
          </div>
        ) : null}

        {displayRows.length > 0 ? (
          <QueryInsightsTable
            displayRows={displayRows}
            flushedIds={rows.flushedIds}
            isAtLimit={rows.isAtLimit}
            isPaused={rows.isPaused}
            onSelectRow={handleSelectRow}
            pauseBufferSize={rows.pauseBufferSize}
            recentlyAddedIds={rows.recentlyAddedIds}
            selectedRowKey={selectedRowKey}
            sort={sort}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-border bg-background p-8 text-center">
            <div className="flex max-w-md flex-col items-center gap-3">
              {selectedTable ? (
                <SearchX className="text-muted-foreground" />
              ) : (
                <DatabaseZap className="text-muted-foreground" />
              )}
              <div className="text-sm font-medium">
                {selectedTable ? "No matching queries" : "Waiting for activity"}
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {selectedTable
                  ? "Queries for the selected table will appear here when they are observed."
                  : "Run SQL in Studio or append query events to prisma-log to populate Query Insights."}
              </p>
            </div>
          </div>
        )}
      </div>

      <DetailSheet
        hasNext={
          selectedRowIndex !== -1 && selectedRowIndex < displayRows.length - 1
        }
        hasPrevious={selectedRowIndex > 0}
        onClose={closeDetail}
        onCopied={(tab) => {
          queryInsights.onEvent?.({
            name: "studio:query_insights:output_copied",
            payload: { tab },
          });
        }}
        onNext={() => navigateDetail(1)}
        onPrevious={() => navigateDetail(-1)}
        row={selectedRow}
      />
    </div>
  );
}
