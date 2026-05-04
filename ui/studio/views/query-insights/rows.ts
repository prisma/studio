import {
  QUERY_INSIGHTS_MAX_QUERIES,
  QUERY_INSIGHTS_PAUSE_BUFFER_LIMIT,
  type QueryInsightsDisplayRow,
  type QueryInsightsGroup,
  type QueryInsightsQuery,
  type QueryInsightsSortField,
  type QueryInsightsSortState,
  type QueryInsightsStreamQuery,
} from "./types";

export function getQueryInsightKey(
  query: Pick<QueryInsightsStreamQuery, "groupKey" | "queryId" | "sql">,
): string {
  return query.queryId && query.groupKey
    ? `${query.queryId}:${query.groupKey}`
    : query.sql;
}

export function toQueryInsight(
  query: QueryInsightsStreamQuery,
): QueryInsightsQuery {
  return {
    count: query.count,
    duration: query.durationMs,
    groupKey: query.groupKey,
    id: getQueryInsightKey(query),
    lastSeen: query.ts,
    maxDurationMs: query.maxDurationMs,
    minDurationMs: query.minDurationMs,
    prismaQueryInfo: query.prismaQueryInfo,
    query: query.sql,
    queryId: query.queryId,
    reads: query.reads,
    rowsReturned: query.rowsReturned,
    tables: query.tables,
  };
}

function mergeQueryInsight(
  existing: QueryInsightsQuery | undefined,
  incoming: QueryInsightsQuery,
): QueryInsightsQuery {
  if (!existing) {
    return incoming;
  }

  const count = existing.count + incoming.count;
  const duration =
    count > 0
      ? (existing.duration * existing.count +
          incoming.duration * incoming.count) /
        count
      : incoming.duration;
  const tables = new Set([...existing.tables, ...incoming.tables]);

  return {
    ...existing,
    count,
    duration,
    groupKey: incoming.groupKey,
    lastSeen: Math.max(existing.lastSeen, incoming.lastSeen),
    maxDurationMs: Math.max(
      existing.maxDurationMs ?? existing.duration,
      incoming.maxDurationMs ?? incoming.duration,
    ),
    minDurationMs: Math.min(
      existing.minDurationMs ?? existing.duration,
      incoming.minDurationMs ?? incoming.duration,
    ),
    prismaQueryInfo: incoming.prismaQueryInfo,
    queryId: incoming.queryId,
    reads: existing.reads + incoming.reads,
    rowsReturned: existing.rowsReturned + incoming.rowsReturned,
    tables: Array.from(tables).sort(),
  };
}

export function upsertQueryInsights(
  current: Map<string, QueryInsightsQuery>,
  incomingRows: QueryInsightsStreamQuery[],
  limit = QUERY_INSIGHTS_MAX_QUERIES,
): {
  next: Map<string, QueryInsightsQuery>;
  newIds: string[];
} {
  const next = new Map(current);
  const newIds: string[] = [];

  for (const incomingRow of incomingRows) {
    const incoming = toQueryInsight(incomingRow);
    const existing = next.get(incoming.id);

    if (!existing) {
      newIds.push(incoming.id);
    }

    next.set(incoming.id, mergeQueryInsight(existing, incoming));
  }

  if (next.size <= limit) {
    return { next, newIds };
  }

  return {
    next: new Map(
      Array.from(next.entries())
        .sort((left, right) => right[1].lastSeen - left[1].lastSeen)
        .slice(0, limit),
    ),
    newIds,
  };
}

export function upsertQueryInsightsPauseBuffer(
  current: Map<string, QueryInsightsQuery>,
  incomingRows: QueryInsightsStreamQuery[],
  limit = QUERY_INSIGHTS_PAUSE_BUFFER_LIMIT,
): Map<string, QueryInsightsQuery> {
  const next = new Map(current);

  for (const incomingRow of incomingRows) {
    const incoming = toQueryInsight(incomingRow);
    next.set(incoming.id, mergeQueryInsight(next.get(incoming.id), incoming));
  }

  if (next.size <= limit) {
    return next;
  }

  return new Map(
    Array.from(next.entries())
      .sort((left, right) => right[1].lastSeen - left[1].lastSeen)
      .slice(0, limit),
  );
}

function getQuerySortValue(
  query: QueryInsightsQuery,
  field: QueryInsightsSortField,
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

function getGroupSortValue(
  group: QueryInsightsGroup,
  field: QueryInsightsSortField,
): number {
  switch (field) {
    case "executions":
      return group.totalCount;
    case "lastSeen":
      return group.lastSeen;
    case "latency":
      return group.avgDuration;
    case "reads":
      return group.totalReads;
  }
}

export function buildQueryInsightsDisplayRows(
  queries: QueryInsightsQuery[],
  sort: QueryInsightsSortState,
): QueryInsightsDisplayRow[] {
  const groups = new Map<string, QueryInsightsQuery[]>();
  const standalone: QueryInsightsQuery[] = [];

  for (const query of queries) {
    if (query.groupKey) {
      groups.set(query.groupKey, [
        ...(groups.get(query.groupKey) ?? []),
        query,
      ]);
      continue;
    }

    standalone.push(query);
  }

  const multiplier = sort.direction === "desc" ? -1 : 1;
  const entries: Array<
    | { group: QueryInsightsGroup; kind: "group" }
    | { kind: "standalone"; query: QueryInsightsQuery }
  > = [];

  for (const [groupKey, children] of groups) {
    const sortedChildren = [...children].sort(
      (left, right) =>
        multiplier *
        (getQuerySortValue(left, sort.field) -
          getQuerySortValue(right, sort.field)),
    );
    const firstChild = sortedChildren[0];

    if (!firstChild?.prismaQueryInfo) {
      standalone.push(...sortedChildren);
      continue;
    }

    const tableSet = new Set<string>();
    let totalCount = 0;
    let totalDuration = 0;
    let totalReads = 0;
    let totalRows = 0;
    let lastSeen = 0;
    let minDuration = Number.POSITIVE_INFINITY;
    let maxDuration = 0;

    for (const child of sortedChildren) {
      totalCount += child.count;
      totalDuration += child.duration * child.count;
      totalReads += child.reads;
      totalRows += child.rowsReturned;
      lastSeen = Math.max(lastSeen, child.lastSeen);
      minDuration = Math.min(
        minDuration,
        child.minDurationMs ?? child.duration,
      );
      maxDuration = Math.max(
        maxDuration,
        child.maxDurationMs ?? child.duration,
      );

      for (const table of child.tables) {
        tableSet.add(table);
      }
    }

    entries.push({
      group: {
        avgDuration: totalCount > 0 ? totalDuration / totalCount : 0,
        children: sortedChildren,
        groupKey,
        lastSeen,
        maxDuration,
        minDuration: minDuration === Number.POSITIVE_INFINITY ? 0 : minDuration,
        prismaQueryInfo: firstChild.prismaQueryInfo,
        tables: Array.from(tableSet).sort(),
        totalCount,
        totalReads,
        totalRows,
      },
      kind: "group",
    });
  }

  for (const query of standalone) {
    entries.push({ kind: "standalone", query });
  }

  entries.sort((left, right) => {
    const leftValue =
      left.kind === "group"
        ? getGroupSortValue(left.group, sort.field)
        : getQuerySortValue(left.query, sort.field);
    const rightValue =
      right.kind === "group"
        ? getGroupSortValue(right.group, sort.field)
        : getQuerySortValue(right.query, sort.field);

    return multiplier * (leftValue - rightValue);
  });

  return entries.map((entry) =>
    entry.kind === "group"
      ? { group: entry.group, type: "group" }
      : { query: entry.query, type: "standalone" },
  );
}

export function filterQueryInsightsByTable(
  queries: QueryInsightsQuery[],
  table: string | null,
): QueryInsightsQuery[] {
  if (!table) {
    return queries;
  }

  return queries.filter((query) => query.tables.includes(table));
}

export function getAvailableQueryInsightTables(
  queries: QueryInsightsQuery[],
): string[] {
  const tables = new Set<string>();

  for (const query of queries) {
    for (const table of query.tables) {
      tables.add(table);
    }
  }

  return Array.from(tables).sort();
}
