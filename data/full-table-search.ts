import type { Expression, ExpressionBuilder, SqlBool } from "kysely";

import type {
  AdapterQueryOptions,
  AdapterRequirements,
  Column,
  Table,
} from "./adapter";
import type { Query, QueryResult } from "./query";
import type { Either } from "./type-utils";

export const FULL_TABLE_SEARCH_TIMEOUT_MS = 5_000;
export const FULL_TABLE_SEARCH_POSTGRES_LOCK_TIMEOUT_MS = 100;
export const FULL_TABLE_SEARCH_MYSQL_LOCK_WAIT_TIMEOUT_SECONDS = 1;
export const FULL_TABLE_SEARCH_MIN_QUERY_LENGTH = 2;
export const FULL_TABLE_SEARCH_MAX_TEXT_COLUMNS = 64;
export const FULL_TABLE_SEARCH_TIMEOUT_MESSAGE =
  "Search timed out after 5 seconds. This kind of search is expensive, and your table might be too large.";

export class FullTableSearchTimeoutError extends Error {
  constructor() {
    super(FULL_TABLE_SEARCH_TIMEOUT_MESSAGE);
    this.name = "FullTableSearchTimeoutError";
  }
}

const UUID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const NUMERIC_PATTERN = /^[+-]?(?:\d+|\d*\.\d+)$/;
const DATE_YEAR_PATTERN = /^(\d{4})$/;
const DATE_YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_YEAR_MONTH_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_PARTIAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]?([01]\d|2[0-3])(?::([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?)?)(?:[Zz])?$/;
const TIME_PATTERN =
  /^([01]\d|2[0-3])(?::([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,6}))?)?)?$/;

interface DatetimeDayRange {
  endExclusive: string;
  startInclusive: string;
}

export type FullTableSearchDialect = "postgres" | "mysql" | "sqlite";

export type FullTableSearchPredicate =
  | {
      column: string;
      kind: "text-like";
      pattern: string;
    }
  | {
      column: string;
      kind: "numeric-equals";
      value: string;
    }
  | {
      column: string;
      kind: "boolean-equals";
      value: boolean;
    }
  | {
      column: string;
      kind: "uuid-equals";
      value: string;
    }
  | {
      column: string;
      kind: "datetime-day-range";
      endExclusive: string;
      startInclusive: string;
    }
  | {
      column: string;
      kind: "time-equals";
      value: string;
    };

export interface FullTableSearchPlan {
  normalizedSearchTerm: string;
  predicates: FullTableSearchPredicate[];
}

export interface FullTableSearchExecutionState {
  activeController: AbortController | null;
  latestRequestId: number;
}

export function createFullTableSearchExecutionState(): FullTableSearchExecutionState {
  return {
    activeController: null,
    latestRequestId: 0,
  };
}

export function isFullTableSearchRequest(
  searchTerm: string | undefined,
): boolean {
  return (searchTerm?.trim().length ?? 0) > 0;
}

export async function executeQueryWithFullTableSearchGuardrails<T>(args: {
  executor: AdapterRequirements["executor"];
  options: AdapterQueryOptions;
  query: Query<T>;
  searchTerm: string | undefined;
  state: FullTableSearchExecutionState;
}): Promise<Either<Error, QueryResult<Query<T>>>> {
  const { executor, options, query, searchTerm, state } = args;

  if (!isFullTableSearchRequest(searchTerm)) {
    return await executor.execute(query, options);
  }

  const requestController = new AbortController();
  const timeoutController = new AbortController();
  state.latestRequestId += 1;
  const requestId = state.latestRequestId;
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, FULL_TABLE_SEARCH_TIMEOUT_MS);

  state.activeController?.abort();
  state.activeController = requestController;

  const merged = mergeAbortSignals([
    options.abortSignal,
    requestController.signal,
    timeoutController.signal,
  ]);

  try {
    const [error, result] = await executor.execute(query, {
      abortSignal: merged.signal,
    });

    if (error && timeoutController.signal.aborted) {
      return [new FullTableSearchTimeoutError()];
    }

    if (error) {
      return [error];
    }

    return [null, result];
  } finally {
    clearTimeout(timeoutId);
    merged.cleanup();

    if (state.latestRequestId === requestId) {
      state.activeController = null;
    }
  }
}

export function buildFullTableSearchPlan(args: {
  searchTerm: string | undefined;
  table: Table;
}): FullTableSearchPlan {
  const normalizedSearchTerm = args.searchTerm?.trim() ?? "";

  if (normalizedSearchTerm.length === 0) {
    return {
      normalizedSearchTerm,
      predicates: [],
    };
  }

  const columns = Object.values(args.table.columns);
  const predicates: FullTableSearchPredicate[] = [];
  const parsedBoolean = parseBooleanTerm(normalizedSearchTerm);
  const parsedNumeric = parseNumericTerm(normalizedSearchTerm);
  const parsedUuid = parseUuidTerm(normalizedSearchTerm);
  const parsedDayRange = parseDateOnlyTerm(normalizedSearchTerm);
  const parsedTime = parseTimeTerm(normalizedSearchTerm);

  if (normalizedSearchTerm.length >= FULL_TABLE_SEARCH_MIN_QUERY_LENGTH) {
    const escapedTerm = escapeLikePattern(normalizedSearchTerm);
    const pattern = `%${escapedTerm}%`;
    const textColumns = columns
      .filter((column) => isTextSearchColumn(column))
      .slice(0, FULL_TABLE_SEARCH_MAX_TEXT_COLUMNS);

    for (const column of textColumns) {
      predicates.push({
        column: column.name,
        kind: "text-like",
        pattern,
      });
    }
  }

  if (parsedBoolean !== undefined) {
    for (const column of columns) {
      if (column.datatype.group !== "boolean" || column.datatype.isArray) {
        continue;
      }

      predicates.push({
        column: column.name,
        kind: "boolean-equals",
        value: parsedBoolean,
      });
    }
  }

  if (parsedNumeric !== null) {
    for (const column of columns) {
      if (column.datatype.group !== "numeric" || column.datatype.isArray) {
        continue;
      }

      predicates.push({
        column: column.name,
        kind: "numeric-equals",
        value: parsedNumeric,
      });
    }
  }

  if (parsedUuid !== null) {
    for (const column of columns) {
      if (!isUuidColumn(column)) {
        continue;
      }

      predicates.push({
        column: column.name,
        kind: "uuid-equals",
        value: parsedUuid,
      });
    }
  }

  if (parsedDayRange !== null) {
    for (const column of columns) {
      if (column.datatype.group !== "datetime" || column.datatype.isArray) {
        continue;
      }

      predicates.push({
        column: column.name,
        endExclusive: parsedDayRange.endExclusive,
        kind: "datetime-day-range",
        startInclusive: parsedDayRange.startInclusive,
      });
    }
  }

  if (parsedTime !== null) {
    for (const column of columns) {
      if (column.datatype.group !== "time" || column.datatype.isArray) {
        continue;
      }

      predicates.push({
        column: column.name,
        kind: "time-equals",
        value: parsedTime,
      });
    }
  }

  return {
    normalizedSearchTerm,
    predicates,
  };
}

export function getFullTableSearchExpression(
  plan: FullTableSearchPlan,
  args: {
    dialect: FullTableSearchDialect;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (eb: ExpressionBuilder<any, any>) => Expression<SqlBool> {
  const { dialect } = args;

  return (eb) => {
    if (plan.predicates.length === 0) {
      return eb.lit(true);
    }

    return eb.or(
      plan.predicates.map((predicate) => {
        switch (predicate.kind) {
          case "text-like": {
            if (dialect === "postgres") {
              return eb(
                eb.cast(predicate.column, "text"),
                "ilike",
                predicate.pattern,
              );
            }

            const textCastType = dialect === "mysql" ? "char" : "text";
            return eb(
              eb.fn("lower", [eb.cast(predicate.column, textCastType)]),
              "like",
              predicate.pattern.toLowerCase(),
            );
          }

          case "numeric-equals": {
            return eb(
              eb.cast(predicate.column, getNumericCastType(dialect)),
              "=",
              eb.cast(eb.val(predicate.value), getNumericCastType(dialect)),
            );
          }

          case "boolean-equals": {
            return eb(predicate.column, "=", predicate.value);
          }

          case "uuid-equals": {
            return eb(predicate.column, "=", predicate.value);
          }

          case "datetime-day-range": {
            return eb.and([
              eb(predicate.column, ">=", predicate.startInclusive),
              eb(predicate.column, "<", predicate.endExclusive),
            ]);
          }

          case "time-equals": {
            return eb(predicate.column, "=", predicate.value);
          }
        }
      }),
    );
  };
}

function getNumericCastType(
  dialect: FullTableSearchDialect,
): "decimal" | "numeric" {
  if (dialect === "mysql") {
    return "decimal";
  }

  return "numeric";
}

function escapeLikePattern(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function isTextSearchColumn(column: Column): boolean {
  if (column.datatype.isArray) {
    return false;
  }

  if (isBinaryLikeColumn(column)) {
    return false;
  }

  if (column.datatype.group === "enum") {
    return true;
  }

  if (column.datatype.group !== "string") {
    return false;
  }

  return !isUuidColumn(column);
}

function isBinaryLikeColumn(column: Column): boolean {
  const typeName = column.datatype.name.toLowerCase();

  return (
    typeName.includes("blob") ||
    typeName.includes("bytea") ||
    typeName.includes("binary")
  );
}

function isUuidColumn(column: Column): boolean {
  if (column.datatype.isArray) {
    return false;
  }

  return column.datatype.name.toLowerCase() === "uuid";
}

function parseBooleanTerm(value: string): boolean | undefined {
  const normalized = value.toLowerCase();

  if (["true", "t", "1", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "f", "0", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseNumericTerm(value: string): string | null {
  if (!NUMERIC_PATTERN.test(value)) {
    return null;
  }

  return value;
}

function parseUuidTerm(value: string): string | null {
  return UUID_PATTERN.test(value) ? value : null;
}

function parseDateOnlyTerm(value: string): DatetimeDayRange | null {
  const dateTimeRange = parseDateTimeTerm(value);

  if (dateTimeRange) {
    return dateTimeRange;
  }

  const yearMatch = value.match(DATE_YEAR_PATTERN);

  if (yearMatch) {
    const year = Number.parseInt(yearMatch[1]!, 10);
    const start = createUtcDate(year, 1, 1);
    const end = createUtcDate(year + 1, 1, 1);

    if (!start || !end) {
      return null;
    }

    return {
      endExclusive: end.toISOString(),
      startInclusive: start.toISOString(),
    };
  }

  const yearMonthMatch = value.match(DATE_YEAR_MONTH_PATTERN);

  if (yearMonthMatch) {
    const year = Number.parseInt(yearMonthMatch[1]!, 10);
    const month = Number.parseInt(yearMonthMatch[2]!, 10);
    const start = createUtcDate(year, month, 1);
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const end = createUtcDate(endYear, endMonth, 1);

    if (!start || !end) {
      return null;
    }

    return {
      endExclusive: end.toISOString(),
      startInclusive: start.toISOString(),
    };
  }

  const yearMonthDayMatch = value.match(DATE_YEAR_MONTH_DAY_PATTERN);

  if (!yearMonthDayMatch) {
    return null;
  }

  const year = Number.parseInt(yearMonthDayMatch[1]!, 10);
  const month = Number.parseInt(yearMonthDayMatch[2]!, 10);
  const day = Number.parseInt(yearMonthDayMatch[3]!, 10);
  const start = createUtcDate(year, month, day);

  if (!start) {
    return null;
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    endExclusive: end.toISOString(),
    startInclusive: start.toISOString(),
  };
}

function parseDateTimeTerm(value: string): DatetimeDayRange | null {
  const match = value.match(DATETIME_PARTIAL_PATTERN);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  const hour = Number.parseInt(match[4]!, 10);
  const minute = Number.parseInt(match[5] ?? "00", 10);
  const second = Number.parseInt(match[6] ?? "00", 10);
  const milliseconds = match[7]
    ? Number.parseInt(match[7].padEnd(3, "0"), 10)
    : 0;

  const start = createUtcDateTime({
    day,
    hour,
    milliseconds,
    minute,
    month,
    second,
    year,
  });

  if (!start) {
    return null;
  }

  const end = new Date(start);

  if (match[7] != null) {
    end.setUTCMilliseconds(end.getUTCMilliseconds() + 1);
  } else if (match[6] != null) {
    end.setUTCSeconds(end.getUTCSeconds() + 1);
  } else if (match[5] != null) {
    end.setUTCMinutes(end.getUTCMinutes() + 1);
  } else {
    end.setUTCHours(end.getUTCHours() + 1);
  }

  return {
    endExclusive: end.toISOString(),
    startInclusive: start.toISOString(),
  };
}

function parseTimeTerm(value: string): string | null {
  const match = value.match(TIME_PATTERN);

  if (!match) {
    return null;
  }

  const hour = match[1]!;
  const minute = match[2] ?? "00";
  const second = match[3] ?? "00";
  const milliseconds = match[4];

  if (!milliseconds) {
    return `${hour}:${minute}:${second}`;
  }

  return `${hour}:${minute}:${second}.${milliseconds}`;
}

function createUtcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function createUtcDateTime(args: {
  day: number;
  hour: number;
  milliseconds: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}): Date | null {
  const { day, hour, milliseconds, minute, month, second, year } = args;
  const date = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, milliseconds),
  );

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== milliseconds
  ) {
    return null;
  }

  return date;
}

function mergeAbortSignals(signals: Array<AbortSignal | undefined>): {
  cleanup: () => void;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  const listeners: Array<{ listener: () => void; signal: AbortSignal }> = [];

  const onAbort = (signal: AbortSignal) => {
    if (controller.signal.aborted) {
      return;
    }

    controller.abort(signal.reason);
  };

  for (const signal of signals) {
    if (!signal) {
      continue;
    }

    if (signal.aborted) {
      onAbort(signal);
      continue;
    }

    const listener = () => onAbort(signal);
    signal.addEventListener("abort", listener);
    listeners.push({ listener, signal });
  }

  return {
    cleanup() {
      for (const { listener, signal } of listeners) {
        signal.removeEventListener("abort", listener);
      }
    },
    signal: controller.signal,
  };
}
