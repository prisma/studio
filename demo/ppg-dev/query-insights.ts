import type { Query, QueryResult } from "../../data";
import type {
  StudioQueryInsightQuery,
  StudioQueryInsightsSnapshot,
  StudioQueryInsightsSnapshotRequest,
} from "../../data/query-insights";

const DEFAULT_DEMO_QUERY_INSIGHTS_LIMIT = 500;
const CTE_PATTERN =
  /(?:\bwith|,)\s+((?:"[^"]+"|[a-z_][a-z0-9_$]*))\s+as\s*\(/gi;
const TABLE_PATTERN =
  /\b(?:from|join|into|update)\s+((?:"[^"]+"|[a-z_][a-z0-9_$]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][a-z0-9_$]*))?)/gi;
const TIMEZONE_METADATA_PATTERN =
  /current_setting\s*\(\s*['"]time_?zone['"]\s*\)/i;

export interface DemoQueryInsightsStore {
  getSnapshot(
    request: StudioQueryInsightsSnapshotRequest,
  ): StudioQueryInsightsSnapshot;
  record<T>(args: {
    durationMs: number;
    query: Query<T>;
    result: QueryResult<Query<T>>;
  }): void;
}

export function createDemoQueryInsightsStore(args?: {
  now?: () => number;
}): DemoQueryInsightsStore {
  const now = args?.now ?? (() => Date.now());
  const queriesById = new Map<string, StudioQueryInsightQuery>();

  return {
    getSnapshot(request) {
      const limit = normalizeLimit(request.limit);
      const queries = [...queriesById.values()]
        .filter((query) => {
          return request.since == null || query.lastSeen >= request.since;
        })
        .sort((left, right) => right.lastSeen - left.lastSeen)
        .slice(0, limit);

      return {
        generatedAt: now(),
        pollingIntervalMs: 1000,
        queries,
      };
    },

    record({ durationMs, query, result }) {
      if (!shouldRecordQuery(query.sql)) {
        return;
      }

      const id = normalizeQueryId(query.sql);
      const lastSeen = now();
      const rowCount = Array.isArray(result) ? result.length : 0;
      // The demo can observe returned rows, not database read work.
      const reads = 0;
      const existing = queriesById.get(id);

      if (!existing) {
        queriesById.set(id, {
          count: 1,
          duration: durationMs,
          id,
          lastSeen,
          maxDurationMs: durationMs,
          minDurationMs: durationMs,
          query: query.sql,
          reads,
          rowsReturned: rowCount,
          tables: extractTablesFromSql(query.sql),
        });
        return;
      }

      const nextCount = existing.count + 1;

      queriesById.set(id, {
        ...existing,
        count: nextCount,
        duration: (existing.duration * existing.count + durationMs) / nextCount,
        lastSeen,
        maxDurationMs: Math.max(existing.maxDurationMs ?? 0, durationMs),
        minDurationMs: Math.min(
          existing.minDurationMs ?? durationMs,
          durationMs,
        ),
        reads: existing.reads + reads,
        rowsReturned: existing.rowsReturned + rowCount,
        tables: mergeTables(existing.tables, extractTablesFromSql(query.sql)),
      });
    },
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (
    typeof limit === "number" &&
    Number.isInteger(limit) &&
    Number.isSafeInteger(limit) &&
    limit > 0
  ) {
    return Math.min(limit, DEFAULT_DEMO_QUERY_INSIGHTS_LIMIT);
  }

  return DEFAULT_DEMO_QUERY_INSIGHTS_LIMIT;
}

function shouldRecordQuery(sql: string): boolean {
  const normalizedSql = sql.trim().toLowerCase();

  if (normalizedSql.length === 0) {
    return false;
  }

  return (
    !normalizedSql.startsWith("explain ") &&
    !normalizedSql.includes("information_schema.") &&
    !normalizedSql.includes('"information_schema"') &&
    !normalizedSql.includes("pg_catalog.") &&
    !normalizedSql.includes('"pg_catalog"') &&
    !TIMEZONE_METADATA_PATTERN.test(normalizedSql)
  );
}

function normalizeQueryId(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function extractTablesFromSql(sql: string): string[] {
  const tables = new Set<string>();
  const cteNames = extractCteNamesFromSql(sql);

  for (const match of sql.matchAll(TABLE_PATTERN)) {
    const rawIdentifier = match[1];

    if (!rawIdentifier) {
      continue;
    }

    const identifier = normalizeSqlIdentifier(rawIdentifier);

    if (!cteNames.has(identifier)) {
      tables.add(identifier);
    }
  }

  return [...tables].filter((table) => table.length > 0).sort();
}

function extractCteNamesFromSql(sql: string): Set<string> {
  if (!/\bwith\b/i.test(sql)) {
    return new Set();
  }

  const cteNames = new Set<string>();

  for (const match of sql.matchAll(CTE_PATTERN)) {
    const rawIdentifier = match[1];

    if (rawIdentifier) {
      cteNames.add(normalizeSqlIdentifier(rawIdentifier));
    }
  }

  return cteNames;
}

function normalizeSqlIdentifier(identifier: string): string {
  return identifier
    .split(".")
    .map((part) => part.trim().replace(/^"|"$/g, ""))
    .join(".");
}

function mergeTables(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])].sort();
}
