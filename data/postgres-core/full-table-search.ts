import type { Table } from "../adapter";
import {
  buildFullTableSearchPlan as buildBaseFullTableSearchPlan,
  createFullTableSearchExecutionState,
  executeQueryWithFullTableSearchGuardrails,
  FULL_TABLE_SEARCH_MAX_TEXT_COLUMNS,
  FULL_TABLE_SEARCH_MIN_QUERY_LENGTH,
  FULL_TABLE_SEARCH_MYSQL_LOCK_WAIT_TIMEOUT_SECONDS,
  FULL_TABLE_SEARCH_POSTGRES_LOCK_TIMEOUT_MS,
  FULL_TABLE_SEARCH_TIMEOUT_MESSAGE,
  FULL_TABLE_SEARCH_TIMEOUT_MS,
  type FullTableSearchPlan,
  type FullTableSearchPredicate,
  FullTableSearchTimeoutError,
  getFullTableSearchExpression,
  isFullTableSearchRequest,
} from "../full-table-search";

export {
  createFullTableSearchExecutionState,
  executeQueryWithFullTableSearchGuardrails,
  FULL_TABLE_SEARCH_MAX_TEXT_COLUMNS,
  FULL_TABLE_SEARCH_MIN_QUERY_LENGTH,
  FULL_TABLE_SEARCH_MYSQL_LOCK_WAIT_TIMEOUT_SECONDS,
  FULL_TABLE_SEARCH_POSTGRES_LOCK_TIMEOUT_MS,
  FULL_TABLE_SEARCH_TIMEOUT_MESSAGE,
  FULL_TABLE_SEARCH_TIMEOUT_MS,
  FullTableSearchTimeoutError,
  getFullTableSearchExpression,
  isFullTableSearchRequest,
};
export type {
  FullTableSearchDialect,
  FullTableSearchExecutionState,
  FullTableSearchPredicate,
} from "../full-table-search";

export function buildFullTableSearchPlan(args: {
  searchTerm: string | undefined;
  table: Table;
}): FullTableSearchPlan {
  const basePlan = buildBaseFullTableSearchPlan(args);
  const normalizedSearchTerm = basePlan.normalizedSearchTerm;

  if (normalizedSearchTerm.length < FULL_TABLE_SEARCH_MIN_QUERY_LENGTH) {
    return basePlan;
  }

  const existingTextColumns = new Set(
    basePlan.predicates.flatMap((predicate) =>
      predicate.kind === "text-like" ? [predicate.column] : [],
    ),
  );
  const remainingTextSlots =
    FULL_TABLE_SEARCH_MAX_TEXT_COLUMNS - existingTextColumns.size;

  if (remainingTextSlots <= 0) {
    return basePlan;
  }

  const pattern = `%${escapeLikePattern(normalizedSearchTerm)}%`;
  const supplementalPredicates: FullTableSearchPredicate[] = [];

  for (const column of Object.values(args.table.columns)) {
    if (existingTextColumns.has(column.name)) {
      continue;
    }

    supplementalPredicates.push({
      column: column.name,
      kind: "text-like",
      pattern,
    });

    if (supplementalPredicates.length >= remainingTextSlots) {
      break;
    }
  }

  if (supplementalPredicates.length === 0) {
    return basePlan;
  }

  return {
    ...basePlan,
    predicates: [...basePlan.predicates, ...supplementalPredicates],
  };
}

function escapeLikePattern(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}
