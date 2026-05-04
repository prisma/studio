import type { Query } from "../../data/query";
import type {
  QueryInsightsAnalysisResult,
  QueryInsightsAnalyzeInput,
  QueryInsightsStreamQuery,
} from "../../ui/studio/views/query-insights/types";

export const STUDIO_SYSTEM_QUERY_SUFFIX = "-- prisma:studio";
export const QUERY_INSIGHTS_LOG_STREAM_NAME = "prisma-log";
const CONSOLE_SYSTEM_QUERY_SUFFIX = "-- prisma:console";

export interface QueryInsightsLogEvent extends QueryInsightsStreamQuery {
  type: "query";
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function stripKnownSystemSuffixes(sql: string): string {
  return sql
    .replaceAll(STUDIO_SYSTEM_QUERY_SUFFIX, "")
    .replaceAll(CONSOLE_SYSTEM_QUERY_SUFFIX, "")
    .trim();
}

export function isStudioSystemQuery(query: Query<unknown>): boolean {
  return (
    query.meta?.visibility === "studio-system" ||
    query.sql.includes(STUDIO_SYSTEM_QUERY_SUFFIX) ||
    query.sql.includes(CONSOLE_SYSTEM_QUERY_SUFFIX)
  );
}

export function appendStudioSystemQuerySuffix<T>(query: Query<T>): Query<T> {
  if (query.meta?.visibility !== "studio-system") {
    return query;
  }

  if (query.sql.includes(STUDIO_SYSTEM_QUERY_SUFFIX)) {
    return query;
  }

  return {
    ...query,
    sql: `${query.sql.trim()} ${STUDIO_SYSTEM_QUERY_SUFFIX}`,
  };
}

export function parseSqlTableNames(sql: string): string[] {
  const tables = new Set<string>();
  const patterns = [
    /\bfrom\s+("?[\w.]+"?)/gi,
    /\bjoin\s+("?[\w.]+"?)/gi,
    /\bupdate\s+("?[\w.]+"?)/gi,
    /\binsert\s+into\s+("?[\w.]+"?)/gi,
    /\bdelete\s+from\s+("?[\w.]+"?)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of sql.matchAll(pattern)) {
      const table = match[1]?.replaceAll('"', "").trim();

      if (table && !table.startsWith("pg_catalog.")) {
        tables.add(table);
      }
    }
  }

  return Array.from(tables).sort();
}

export function createQueryInsightsLogEvent(args: {
  durationMs: number;
  query: Query<unknown>;
  rows: unknown;
  ts?: number;
}): QueryInsightsLogEvent | null {
  if (isStudioSystemQuery(args.query)) {
    return null;
  }

  const cleanedSql = stripKnownSystemSuffixes(args.query.sql);
  const normalizedSql = normalizeSql(cleanedSql);

  if (normalizedSql.length === 0) {
    return null;
  }

  const durationMs = Math.max(0, args.durationMs);

  return {
    count: 1,
    durationMs,
    groupKey: null,
    maxDurationMs: durationMs,
    minDurationMs: durationMs,
    prismaQueryInfo: null,
    queryId: null,
    reads: 0,
    rowsReturned: Array.isArray(args.rows) ? args.rows.length : 0,
    sql: cleanedSql,
    tables: parseSqlTableNames(cleanedSql),
    ts: args.ts ?? Date.now(),
    type: "query",
  };
}

function createStreamsApiUrl(
  streamsServerUrl: string,
  streamName: string,
): string {
  const url = new URL(
    `v1/stream/${encodeURIComponent(streamName)}`,
    `${streamsServerUrl.replace(/\/+$/, "")}/`,
  );

  return url.toString();
}

async function getResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return response.statusText;
  }
}

export async function ensureQueryInsightsLogStream(args: {
  fetchFn?: typeof fetch;
  streamsServerUrl: string;
}): Promise<void> {
  const fetchFn = args.fetchFn ?? fetch;
  const response = await fetchFn(
    createStreamsApiUrl(args.streamsServerUrl, QUERY_INSIGHTS_LOG_STREAM_NAME),
    {
      body: "[]",
      headers: {
        "content-type": "application/json",
      },
      method: "PUT",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed ensuring ${QUERY_INSIGHTS_LOG_STREAM_NAME} stream (${response.status} ${await getResponseText(response)})`,
    );
  }
}

export async function appendQueryInsightsLogEvent(args: {
  event: QueryInsightsLogEvent;
  fetchFn?: typeof fetch;
  streamsServerUrl: string;
}): Promise<void> {
  const fetchFn = args.fetchFn ?? fetch;
  const url = createStreamsApiUrl(
    args.streamsServerUrl,
    QUERY_INSIGHTS_LOG_STREAM_NAME,
  );
  const append = () =>
    fetchFn(url, {
      body: JSON.stringify(args.event),
      headers: {
        "content-type": "application/json",
        "stream-timestamp": new Date(args.event.ts).toISOString(),
      },
      method: "POST",
    });
  let response = await append();

  if (response.status === 404) {
    await ensureQueryInsightsLogStream({
      fetchFn,
      streamsServerUrl: args.streamsServerUrl,
    });
    response = await append();
  }

  if (!response.ok) {
    throw new Error(
      `Failed appending ${QUERY_INSIGHTS_LOG_STREAM_NAME} event (${response.status} ${await getResponseText(response)})`,
    );
  }
}

export function analyzeDemoQueryInsight(
  input: QueryInsightsAnalyzeInput,
): QueryInsightsAnalysisResult {
  const stats = input.queryStats;
  const isSlow = (stats?.duration ?? 0) >= 100;
  const returnsManyRows = (stats?.rowsReturned ?? 0) >= 100;
  const selectWithoutLimit =
    /^\s*select\b/i.test(input.rawQuery) && !/\blimit\b/i.test(input.rawQuery);
  const recommendations: string[] = [];
  const issuesFound: string[] = [];

  if (isSlow) {
    issuesFound.push(
      "Average latency is high for an interactive Studio query.",
    );
    recommendations.push(
      "Inspect predicates and add an index for the most selective filter columns.",
    );
  }

  if (returnsManyRows || selectWithoutLimit) {
    issuesFound.push("The query can return more rows than an operator needs.");
    recommendations.push(
      "Add a LIMIT clause or narrow the selected columns to reduce transferred rows.",
    );
  }

  if (issuesFound.length === 0) {
    return {
      analysisMarkdown:
        "# Query looks healthy\n\nNo obvious issue was detected from the available demo runtime statistics.",
      confidenceScore: 0.72,
      isOptimal: true,
      issuesFound: [],
      recommendations: [],
    };
  }

  return {
    analysisMarkdown:
      "# Query can be tightened\n\n## What to do\nUse the recommendations below to reduce latency or returned rows.\n\n## Why this matters\nThe ppg-dev demo captures query timing from the Studio BFF path and flags high-latency or broad result-set patterns.",
    confidenceScore: 0.68,
    improvedSql: selectWithoutLimit
      ? `${input.rawQuery.replace(/;+\s*$/, "")}\nLIMIT 50;`
      : undefined,
    isOptimal: false,
    issuesFound,
    recommendations,
  };
}
