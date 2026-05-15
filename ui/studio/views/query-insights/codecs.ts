import {
  QUERY_INSIGHTS_CHART_BUCKET_MS,
  type QueryInsightsChartPoint,
  type QueryInsightsPrismaInfo,
  type QueryInsightsQueryVisibility,
  type QueryInsightsStreamQuery,
} from "./types";

export interface SafeDecodeResult<T> {
  data?: T;
  error?: Error;
  success: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid Query Insights event: ${field} must be a number.`);
  }

  return value;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid Query Insights event: ${field} must be a string.`);
  }

  return value;
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Invalid Query Insights event: ${field} must be a string array.`,
    );
  }

  return value.map((item) => String(item));
}

function decodePrismaInfo(value: unknown): QueryInsightsPrismaInfo | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error(
      "Invalid Query Insights event: prismaQueryInfo must be an object or null.",
    );
  }

  const action = assertString(value.action, "prismaQueryInfo.action");

  if (typeof value.isRaw !== "boolean") {
    throw new Error(
      "Invalid Query Insights event: prismaQueryInfo.isRaw must be a boolean.",
    );
  }

  const model =
    typeof value.model === "string" && value.model.length > 0
      ? value.model
      : undefined;
  const payload =
    isRecord(value.payload) || Array.isArray(value.payload)
      ? (value.payload as QueryInsightsPrismaInfo["payload"])
      : undefined;

  return {
    action,
    isRaw: value.isRaw,
    model,
    payload,
  };
}

function decodeOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return assertNumber(value, "optional numeric field");
}

function decodeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return assertString(value, "optional string field");
}

function decodeOptionalVisibility(
  value: unknown,
): QueryInsightsQueryVisibility | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "studio-system" || value === "user") {
    return value;
  }

  throw new Error(
    "Invalid Query Insights event: visibility must be studio-system or user.",
  );
}

function decodeStreamQuery(value: unknown): QueryInsightsStreamQuery {
  if (!isRecord(value)) {
    throw new Error(
      "Invalid Query Insights event: query row must be an object.",
    );
  }

  const count = assertNumber(value.count, "count");
  const durationMs = assertNumber(value.durationMs, "durationMs");
  const sql = assertString(value.sql, "sql");
  const ts = assertNumber(value.ts, "ts");

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(
      "Invalid Query Insights event: count must be a positive integer.",
    );
  }

  if (!Number.isInteger(ts) || ts <= 0) {
    throw new Error(
      "Invalid Query Insights event: ts must be a positive integer.",
    );
  }

  return {
    count,
    durationMs,
    groupKey: decodeOptionalString(value.groupKey),
    maxDurationMs: decodeOptionalNumber(value.maxDurationMs),
    minDurationMs: decodeOptionalNumber(value.minDurationMs),
    prismaQueryInfo: decodePrismaInfo(value.prismaQueryInfo),
    queryId: decodeOptionalString(value.queryId),
    reads: assertNumber(value.reads, "reads"),
    rowsReturned: assertNumber(value.rowsReturned, "rowsReturned"),
    sql,
    tables: assertStringArray(value.tables, "tables"),
    ts,
    visibility: decodeOptionalVisibility(value.visibility),
  };
}

export function decodeQueriesEvent(
  jsonString: string,
): QueryInsightsStreamQuery[] {
  const parsed = JSON.parse(jsonString) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid Query Insights event: queries must be an array.");
  }

  return parsed.map(decodeStreamQuery);
}

export function decodePrismaLogDataEvent(
  jsonString: string,
): QueryInsightsStreamQuery[] {
  const parsed = JSON.parse(jsonString) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Invalid Query Insights stream event: prisma-log data must be an array.",
    );
  }

  return parsed
    .filter((value) => isRecord(value) && value.type === "query")
    .map(decodeStreamQuery);
}

export function decodeChartTickEvent(
  jsonString: string,
): QueryInsightsChartPoint {
  const parsed = JSON.parse(jsonString) as unknown;

  if (!isRecord(parsed)) {
    throw new Error(
      "Invalid Query Insights event: chartTick must be an object.",
    );
  }

  const ts = assertNumber(parsed.ts, "ts");
  const queryCount = assertNumber(parsed.queryCount, "queryCount");
  const avgDurationMs = assertNumber(parsed.avgDurationMs, "avgDurationMs");

  if (!Number.isInteger(ts) || ts <= 0) {
    throw new Error(
      "Invalid Query Insights event: ts must be a positive integer.",
    );
  }

  if (!Number.isInteger(queryCount) || queryCount < 0) {
    throw new Error(
      "Invalid Query Insights event: queryCount must be a non-negative integer.",
    );
  }

  return {
    avgDurationMs,
    queryCount,
    ts,
  };
}

export function safeDecodeQueriesEvent(
  jsonString: string,
): SafeDecodeResult<QueryInsightsStreamQuery[]> {
  try {
    return {
      data: decodeQueriesEvent(jsonString),
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      success: false,
    };
  }
}

export function safeDecodePrismaLogDataEvent(
  jsonString: string,
): SafeDecodeResult<QueryInsightsStreamQuery[]> {
  try {
    return {
      data: decodePrismaLogDataEvent(jsonString),
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      success: false,
    };
  }
}

export function safeDecodeChartTickEvent(
  jsonString: string,
): SafeDecodeResult<QueryInsightsChartPoint> {
  try {
    return {
      data: decodeChartTickEvent(jsonString),
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      success: false,
    };
  }
}

export function createChartTicksFromQueries(
  queries: QueryInsightsStreamQuery[],
  bucketMs = QUERY_INSIGHTS_CHART_BUCKET_MS,
): QueryInsightsChartPoint[] {
  if (queries.length === 0) {
    return [];
  }

  const buckets = new Map<
    number,
    {
      queryCount: number;
      totalDurationMs: number;
    }
  >();

  for (const query of queries) {
    const ts = Math.floor(query.ts / bucketMs) * bucketMs;
    const bucket = buckets.get(ts) ?? {
      queryCount: 0,
      totalDurationMs: 0,
    };

    bucket.queryCount += query.count;
    bucket.totalDurationMs += query.durationMs * query.count;
    buckets.set(ts, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([ts, bucket]) => ({
      avgDurationMs:
        bucket.queryCount > 0 ? bucket.totalDurationMs / bucket.queryCount : 0,
      queryCount: bucket.queryCount,
      ts,
    }));
}
