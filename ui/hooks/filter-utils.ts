import type {
  Column,
  ColumnFilter,
  FilterGroup,
  FilterOperator,
  SqlFilter,
  Table,
} from "../../data/adapter";
import { coerceToString } from "../../lib/conversionUtils";
import {
  hasEmbeddedSqlStatementSeparator,
  normalizeSqlWhereClause,
} from "../../lib/sql-filter";
import short from "../lib/short-uuid";

export type EditingFilterOperator = FilterOperator | "";

export interface EditingFilterAiSource {
  query: string;
}

export interface EditingColumnFilter extends Omit<ColumnFilter, "operator"> {
  aiSource?: EditingFilterAiSource;
  draftValue?: string;
  operator: EditingFilterOperator;
}

export interface EditingSqlFilterLintState {
  issue: FilterSyntaxIssue | null;
  requestKey: string;
  status: "invalid" | "pending" | "valid";
}

export interface EditingSqlFilter extends SqlFilter {
  aiSource?: EditingFilterAiSource;
  lint?: EditingSqlFilterLintState;
}

export interface EditingFilterGroup extends Omit<FilterGroup, "filters"> {
  filters: EditingFilterNode[];
}

export type EditingFilterNode =
  | EditingColumnFilter
  | EditingFilterGroup
  | EditingSqlFilter;

const FILTER_OPERATORS = new Set<FilterOperator>([
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "is",
  "is not",
  "like",
  "not like",
  "ilike",
  "not ilike",
]);

export function createDefaultFilter(): FilterGroup {
  return {
    kind: "FilterGroup",
    filters: [],
    after: "and",
    id: short.generate(),
  };
}

export const defaultFilter: FilterGroup = createDefaultFilter();

export function createEditingFilterFromApplied(
  filterGroup: FilterGroup,
): EditingFilterGroup {
  return JSON.parse(JSON.stringify(filterGroup)) as EditingFilterGroup;
}

export function cloneEditingFilter(
  filterGroup: EditingFilterGroup,
): EditingFilterGroup {
  return JSON.parse(JSON.stringify(filterGroup)) as EditingFilterGroup;
}

export function createEditingColumnFilter(column: string): EditingColumnFilter {
  return {
    after: "and",
    column,
    draftValue: "",
    id: short.generate(),
    kind: "ColumnFilter",
    operator: "",
    value: "",
  };
}

export function createEditingSqlFilter(sql = ""): EditingSqlFilter {
  return {
    after: "and",
    id: short.generate(),
    kind: "SqlFilter",
    sql,
  };
}

export function isFilterOperator(value: string): value is FilterOperator {
  return FILTER_OPERATORS.has(value as FilterOperator);
}

export function createAppliedFilterFromEditing(
  filterGroup: EditingFilterGroup,
  columns?: Table["columns"],
): FilterGroup {
  return {
    ...filterGroup,
    filters: filterGroup.filters.flatMap<
      ColumnFilter | FilterGroup | SqlFilter
    >((filter) => {
      if (filter.kind === "ColumnFilter") {
        if (
          !filter.column.trim() ||
          !isFilterOperator(filter.operator) ||
          (columns && getEditingFilterSyntaxIssue(filter, columns))
        ) {
          return [];
        }

        const {
          aiSource: _aiSource,
          draftValue: _draftValue,
          ...appliedFilter
        } = filter;

        return [{ ...appliedFilter, operator: filter.operator }];
      }

      if (filter.kind === "SqlFilter") {
        if (
          getEditingFilterSyntaxIssue(
            filter,
            columns ?? ({} as Table["columns"]),
          )
        ) {
          return [];
        }

        const { aiSource: _aiSource, lint: _lint, ...appliedFilter } = filter;

        return [appliedFilter];
      }

      const nextGroup = createAppliedFilterFromEditing(filter, columns);

      if (nextGroup.filters.length === 0) {
        return [];
      }

      return [nextGroup];
    }),
  };
}

export function countFiltersRecursive(
  filterGroup:
    | Pick<EditingFilterGroup, "filters">
    | Pick<FilterGroup, "filters">,
): number {
  let count = 0;

  for (const filter of filterGroup.filters) {
    if (filter.kind === "ColumnFilter") {
      if (filter.column.trim()) {
        count++;
      }
      continue;
    }

    if (filter.kind === "SqlFilter") {
      count++;
      continue;
    }

    count += countFiltersRecursive(filter);
  }

  return count;
}

export interface FilterSyntaxIssue {
  code:
    | "invalid-sql-fragment"
    | "invalid-array"
    | "invalid-boolean"
    | "invalid-datetime"
    | "invalid-enum"
    | "invalid-json"
    | "invalid-number"
    | "invalid-operator-for-type"
    | "invalid-time"
    | "invalid-uuid"
    | "missing-sql"
    | "missing-operator"
    | "null-check-only"
    | "sql-lint-error"
    | "unknown-column";
  message: string;
}

const COMPARISON_OPERATORS = new Set<FilterOperator>([">", ">=", "<", "<="]);
const EQUALITY_OPERATORS = new Set<FilterOperator>(["=", "!="]);
const TEXT_MATCH_OPERATORS = new Set<FilterOperator>([
  "ilike",
  "like",
  "not ilike",
  "not like",
]);
const UUID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

type ColumnSyntaxKind =
  | "array"
  | "binary"
  | "boolean"
  | "datetime"
  | "enum"
  | "json"
  | "numeric"
  | "text"
  | "time"
  | "unknown"
  | "uuid";

export function getSupportedFilterOperatorsForColumn(
  column: Column,
  availableOperators?: FilterOperator[],
): FilterOperator[] {
  const baseOperators: FilterOperator[] = ["=", "!=", "is", "is not"];
  const supportedOperators: FilterOperator[] = column.datatype.isArray
    ? supportsTextSearchOnArray(column)
      ? [...baseOperators, "like", "not like", "ilike", "not ilike"]
      : baseOperators
    : getSupportedScalarOperatorsForKind(getScalarColumnSyntaxKind(column));

  if (!availableOperators || availableOperators.length === 0) {
    return supportedOperators;
  }

  const availableOperatorSet = new Set(availableOperators);

  return supportedOperators.filter((operator) =>
    availableOperatorSet.has(operator),
  );
}

export function isFilterOperatorSupportedForColumn(
  column: Column,
  operator: FilterOperator,
): boolean {
  return getSupportedFilterOperatorsForColumn(column).includes(operator);
}

export function getEditingFilterSyntaxIssue(
  filter: EditingFilterNode,
  columns: Table["columns"],
): FilterSyntaxIssue | null {
  if (filter.kind === "SqlFilter") {
    const normalizedClause = normalizeSqlWhereClause(filter.sql);

    if (normalizedClause.length === 0) {
      return {
        code: "missing-sql",
        message: "Enter a SQL WHERE clause before saving this filter.",
      };
    }

    if (hasEmbeddedSqlStatementSeparator(filter.sql)) {
      return {
        code: "invalid-sql-fragment",
        message:
          "SQL filters must be a single WHERE clause fragment without embedded semicolons.",
      };
    }

    return null;
  }

  if (filter.kind === "FilterGroup") {
    return null;
  }

  if (!filter.column.trim() || !columns[filter.column]) {
    return {
      code: "unknown-column",
      message: "This filter references a column that is no longer available.",
    };
  }

  if (!isFilterOperator(filter.operator)) {
    return {
      code: "missing-operator",
      message: "Choose an operator before saving this filter.",
    };
  }

  const column = columns[filter.column]!;
  const rawValue = getEditingFilterRawValue(filter, column);
  const normalizedValue = rawValue.trim();

  if (filter.operator === "is" || filter.operator === "is not") {
    return normalizedValue.toLowerCase() === "null" || filter.value === null
      ? null
      : {
          code: "null-check-only",
          message: `"${filter.operator}" only supports null checks. Use value "null".`,
        };
  }

  if (!isFilterOperatorSupportedForColumn(column, filter.operator)) {
    return getUnsupportedOperatorIssue(column, filter.operator);
  }

  if (column.datatype.isArray) {
    if (TEXT_MATCH_OPERATORS.has(filter.operator)) {
      return null;
    }

    return isValidJsonArrayLiteral(normalizedValue)
      ? null
      : {
          code: "invalid-array",
          message: "Array filters must use a valid JSON array value.",
        };
  }

  switch (getScalarColumnSyntaxKind(column)) {
    case "binary":
      return null;
    case "boolean":
      return isBooleanLiteral(normalizedValue)
        ? null
        : {
            code: "invalid-boolean",
            message: 'Boolean filters must use "true" or "false".',
          };
    case "datetime":
      return isValidDateTimeLiteral(normalizedValue)
        ? null
        : {
            code: "invalid-datetime",
            message: "Date/time filters must use a valid date or timestamp.",
          };
    case "enum":
      if (
        EQUALITY_OPERATORS.has(filter.operator) &&
        column.datatype.options.length > 0 &&
        !column.datatype.options.includes(rawValue)
      ) {
        return {
          code: "invalid-enum",
          message: `Value must be one of: ${column.datatype.options.join(", ")}.`,
        };
      }

      return null;
    case "json":
      return isValidJsonLiteral(normalizedValue)
        ? null
        : {
            code: "invalid-json",
            message: "JSON filters must use valid JSON.",
          };
    case "numeric":
      return isValidNumberLiteral(normalizedValue)
        ? null
        : {
            code: "invalid-number",
            message: "Numeric filters must use a valid number.",
          };
    case "text":
      return null;
    case "time":
      return isValidTimeLiteral(normalizedValue)
        ? null
        : {
            code: "invalid-time",
            message: "Time filters must use a valid time value.",
          };
    case "unknown":
      return null;
    case "uuid":
      return isValidUuidLiteral(normalizedValue)
        ? null
        : {
            code: "invalid-uuid",
            message: "UUID filters must use a valid UUID value.",
          };
  }
}

export function getEditingFilterIssue(
  filter: EditingFilterNode,
  columns: Table["columns"],
): FilterSyntaxIssue | null {
  const syntaxIssue = getEditingFilterSyntaxIssue(filter, columns);

  if (syntaxIssue) {
    return syntaxIssue;
  }

  if (filter.kind === "SqlFilter" && filter.lint?.status === "invalid") {
    return filter.lint.issue;
  }

  return null;
}

export function isEditingFilterSyntacticallyValid(
  filter: EditingFilterNode,
  columns: Table["columns"],
): boolean {
  return getEditingFilterSyntaxIssue(filter, columns) == null;
}

export function attachAiSourceToEditingFilter(
  filterGroup: EditingFilterGroup,
  query: string,
): EditingFilterGroup {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    return filterGroup;
  }

  return {
    ...filterGroup,
    filters: filterGroup.filters.map((filter) => {
      if (filter.kind === "FilterGroup") {
        return attachAiSourceToEditingFilter(filter, trimmedQuery);
      }

      return {
        ...filter,
        aiSource: {
          query: trimmedQuery,
        },
      };
    }),
  };
}

export function mergeEditingFilterUiMetadata(args: {
  currentFilter: EditingFilterGroup;
  previousFilter?: EditingFilterGroup | null;
}): EditingFilterGroup {
  const { currentFilter, previousFilter } = args;

  if (!previousFilter) {
    return currentFilter;
  }

  const aiSourceByFilterId = new Map<string, EditingFilterAiSource>();

  function collectPreviousFilterMetadata(filterGroup: EditingFilterGroup) {
    for (const filter of filterGroup.filters) {
      if (filter.kind === "FilterGroup") {
        collectPreviousFilterMetadata(filter);
        continue;
      }

      if (filter.aiSource) {
        aiSourceByFilterId.set(filter.id, filter.aiSource);
      }
    }
  }

  function applyPreviousFilterMetadata(
    filterGroup: EditingFilterGroup,
  ): EditingFilterGroup {
    return {
      ...filterGroup,
      filters: filterGroup.filters.map((filter) => {
        if (filter.kind === "FilterGroup") {
          return applyPreviousFilterMetadata(filter);
        }

        const previousAiSource = aiSourceByFilterId.get(filter.id);

        if (!previousAiSource) {
          return filter;
        }

        return {
          ...filter,
          aiSource: previousAiSource,
        };
      }),
    };
  }

  collectPreviousFilterMetadata(previousFilter);

  if (aiSourceByFilterId.size === 0) {
    return currentFilter;
  }

  return applyPreviousFilterMetadata(currentFilter);
}

function getEditingFilterRawValue(
  filter: EditingColumnFilter,
  column: Column,
): string {
  if (typeof filter.draftValue === "string") {
    return filter.draftValue;
  }

  if (isFilterOperator(filter.operator)) {
    return coerceToString(column, filter.operator, filter.value);
  }

  return "";
}

function isBooleanLiteral(value: string): boolean {
  const normalizedValue = value.toLowerCase();

  return normalizedValue === "true" || normalizedValue === "false";
}

function isValidDateTimeLiteral(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

function isValidJsonArrayLiteral(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  try {
    return Array.isArray(JSON.parse(value) as unknown);
  } catch {
    return false;
  }
}

function isValidJsonLiteral(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function isValidNumberLiteral(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed);
}

function isValidTimeLiteral(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(
    value,
  );
}

function getSupportedScalarOperatorsForKind(
  kind: Exclude<ColumnSyntaxKind, "array">,
): FilterOperator[] {
  switch (kind) {
    case "datetime":
    case "numeric":
    case "time":
      return [
        "=",
        "!=",
        ">",
        ">=",
        "<",
        "<=",
        "is",
        "is not",
      ] as FilterOperator[];
    case "enum":
    case "text":
      return [
        "=",
        "!=",
        "is",
        "is not",
        "like",
        "not like",
        "ilike",
        "not ilike",
      ] as FilterOperator[];
    case "binary":
    case "boolean":
    case "json":
    case "unknown":
    case "uuid":
      return ["=", "!=", "is", "is not"] as FilterOperator[];
  }
}

function getScalarColumnSyntaxKind(
  column: Column,
): Exclude<ColumnSyntaxKind, "array"> {
  if (isUuidLikeColumn(column)) {
    return "uuid";
  }

  if (isBinaryLikeColumn(column)) {
    return "binary";
  }

  if (column.datatype.group === "raw") {
    if (isTextLikeRawColumn(column)) {
      return "text";
    }

    return "unknown";
  }

  switch (column.datatype.group) {
    case "boolean":
      return "boolean";
    case "datetime":
      return "datetime";
    case "enum":
      return "enum";
    case "json":
      return "json";
    case "numeric":
      return "numeric";
    case "string":
      return "text";
    case "time":
      return "time";
  }
}

function supportsTextSearchOnArray(column: Column): boolean {
  return ["enum", "text"].includes(
    getScalarColumnSyntaxKind(asScalarColumn(column)),
  );
}

function getUnsupportedOperatorIssue(
  column: Column,
  operator: FilterOperator,
): FilterSyntaxIssue {
  if (TEXT_MATCH_OPERATORS.has(operator)) {
    return {
      code: "invalid-operator-for-type",
      message: column.datatype.isArray
        ? `"${operator}" is only available for text-like scalar columns and text-like arrays.`
        : `"${operator}" is only available for text and enum columns.`,
    };
  }

  if (COMPARISON_OPERATORS.has(operator)) {
    return {
      code: "invalid-operator-for-type",
      message: `"${operator}" is only available for numeric, date/time, and time columns.`,
    };
  }

  return {
    code: "invalid-operator-for-type",
    message: `Operator "${operator}" is not supported for this column type.`,
  };
}

function asScalarColumn(column: Column): Column {
  return {
    ...column,
    datatype: {
      ...column.datatype,
      isArray: false,
    },
  };
}

function isBinaryLikeColumn(column: Column): boolean {
  const typeName = getNormalizedTypeName(column);

  return (
    typeName.includes("blob") ||
    typeName.includes("bytea") ||
    typeName.includes("binary")
  );
}

function isTextLikeRawColumn(column: Column): boolean {
  const typeName = getNormalizedTypeName(column);
  const affinity = column.datatype.affinity?.toLowerCase() ?? "";

  return (
    typeName.includes("char") ||
    typeName.includes("clob") ||
    typeName.includes("string") ||
    typeName.includes("text") ||
    typeName.includes("varchar") ||
    affinity === "text"
  );
}

function isUuidLikeColumn(column: Column): boolean {
  return getNormalizedTypeName(column) === "uuid";
}

function getNormalizedTypeName(column: Column): string {
  return column.datatype.name.toLowerCase();
}

function isValidUuidLiteral(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  return UUID_PATTERN.test(value);
}
