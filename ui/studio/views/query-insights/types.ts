export const QUERY_INSIGHTS_MAX_QUERIES = 500;
export const QUERY_INSIGHTS_PAUSE_BUFFER_LIMIT = 500;
export const QUERY_INSIGHTS_CHART_BUFFER_LIMIT = 100;
export const QUERY_INSIGHTS_CHART_BUCKET_MS = 1_000;

export interface QueryInsightsPrismaInfo {
  action: string;
  isRaw: boolean;
  model?: string;
  payload?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export interface QueryInsightsQuery {
  count: number;
  duration: number;
  groupKey?: string | null;
  id: string;
  lastSeen: number;
  maxDurationMs?: number | null;
  minDurationMs?: number | null;
  prismaQueryInfo?: QueryInsightsPrismaInfo | null;
  query: string;
  queryId?: string | null;
  reads: number;
  rowsReturned: number;
  tables: string[];
}

export interface QueryInsightsStreamQuery {
  count: number;
  durationMs: number;
  groupKey?: string | null;
  maxDurationMs?: number | null;
  minDurationMs?: number | null;
  prismaQueryInfo: QueryInsightsPrismaInfo | null;
  queryId?: string | null;
  reads: number;
  rowsReturned: number;
  sql: string;
  tables: string[];
  ts: number;
}

export interface QueryInsightsChartPoint {
  avgDurationMs: number;
  queryCount: number;
  ts: number;
}

export interface QueryInsightsGroup {
  avgDuration: number;
  children: QueryInsightsQuery[];
  groupKey: string;
  lastSeen: number;
  maxDuration: number;
  minDuration: number;
  prismaQueryInfo: QueryInsightsPrismaInfo;
  tables: string[];
  totalCount: number;
  totalReads: number;
  totalRows: number;
}

export type QueryInsightsDisplayRow =
  | { group: QueryInsightsGroup; type: "group" }
  | { query: QueryInsightsQuery; type: "standalone" };

export type QueryInsightsSortField =
  | "executions"
  | "lastSeen"
  | "latency"
  | "reads";
export type QueryInsightsSortDirection = "asc" | "desc";

export interface QueryInsightsSortState {
  direction: QueryInsightsSortDirection;
  field: QueryInsightsSortField;
}

export const QUERY_INSIGHTS_DEFAULT_SORT: QueryInsightsSortState = {
  direction: "desc",
  field: "reads",
};

export interface QueryInsightsAnalyzeInput {
  explainPlan?: string | null;
  groupChildren?: Array<{
    queryStats?: QueryInsightsAnalyzeStats | null;
    rawQuery: string;
  }> | null;
  prismaQuery?: string | null;
  prismaQueryInfo?: string | null;
  queryStats?: QueryInsightsAnalyzeStats | null;
  rawQuery: string;
}

export interface QueryInsightsAnalyzeStats {
  count: number;
  duration: number;
  reads: number;
  rowsReturned: number;
}

export interface QueryInsightsAnalysisResult {
  analysisMarkdown: string;
  confidenceScore?: number;
  improvedPrisma?: string;
  improvedSql?: string;
  isOptimal: boolean;
  issuesFound: string[];
  recommendations: string[];
}

export interface QueryInsightsAnalyzeResponse {
  error?: string | null;
  result: QueryInsightsAnalysisResult | null;
}

export interface QueryInsightsUiEvent {
  name:
    | "studio:query_insights:ai_consent_accepted"
    | "studio:query_insights:ai_consent_callout_viewed"
    | "studio:query_insights:filter_applied"
    | "studio:query_insights:output_copied"
    | "studio:query_insights:query_detail_opened"
    | "studio:query_insights:query_displayed"
    | "studio:query_insights:sort_changed"
    | "studio:query_insights:stream_error"
    | "studio:query_insights:table_paused"
    | "studio:query_insights:table_resumed"
    | "studio:query_insights:viewed";
  payload?: Record<string, unknown>;
}
