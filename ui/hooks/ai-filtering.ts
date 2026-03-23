import type { FilterOperator, Table } from "../../data/adapter";
import { coerceToValue } from "../../lib/conversionUtils";
import shortUUID from "../lib/short-uuid";
import {
  attachAiSourceToEditingFilter,
  createEditingColumnFilter,
  createEditingSqlFilter,
  type EditingFilterGroup,
  type FilterSyntaxIssue,
  getEditingFilterSyntaxIssue,
  getSupportedFilterOperatorsForColumn,
  isFilterOperator,
} from "./filter-utils";

const DEFAULT_FILTER_OPERATORS: FilterOperator[] = [
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
];

interface AiFilterPromptArgs {
  filterOperators?: FilterOperator[];
  now?: Date;
  request: string;
  table: Table;
  timeZone?: string;
}

interface ParsedAiFilterResponse {
  filters?: Array<{
    kind?: unknown;
    column?: unknown;
    operator?: unknown;
    sql?: unknown;
    value?: unknown;
  }>;
}

export interface AiFilterIssue {
  code:
    | "invalid-column"
    | "invalid-filter-syntax"
    | "invalid-json"
    | "invalid-operator"
    | "invalid-response-shape"
    | "missing-filters"
    | "missing-value";
  column?: string;
  filterIndex?: number;
  message: string;
  operator?: string;
  responseText?: string;
  syntaxIssue?: FilterSyntaxIssue;
  value?: string;
}

export interface ParsedAiFilterResult {
  filterGroup: EditingFilterGroup;
  issues: AiFilterIssue[];
}

interface ResolveAiFilteringArgs extends AiFilterPromptArgs {
  aiFilter: (input: string) => Promise<string>;
}

export interface ResolveAiFilteringResult extends ParsedAiFilterResult {
  didRetry: boolean;
  responseText: string;
}

export function buildAiFilterPrompt(args: AiFilterPromptArgs): string {
  const { filterOperators, now = new Date(), request, table, timeZone } = args;
  const availableOperators =
    filterOperators && filterOperators.length > 0
      ? filterOperators
      : DEFAULT_FILTER_OPERATORS;
  const promptTimeZone =
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const columnLines = Object.values(table.columns).map((column) => {
    return `- ${column.name}: ${column.datatype.name} (group: ${column.datatype.group}; supported operators: ${getSupportedFilterOperatorsForColumn(column, availableOperators).join(", ")})`;
  });

  return [
    "You convert a user's natural-language table filtering request into Prisma Studio filter JSON.",
    `Table: ${table.schema}.${table.name}`,
    "Columns:",
    ...columnLines,
    `Allowed operators: ${availableOperators.join(", ")}`,
    `Current local date and time: ${formatPromptLocalDateTime(now, promptTimeZone)} (timezone: ${promptTimeZone})`,
    `Current UTC date and time: ${now.toISOString()}`,
    "Return JSON only. Do not add markdown fences or commentary.",
    'Return this exact top-level shape: {"filters":[...]}',
    'Each filter item must be either {"kind":"column","column":"column_name","operator":"=","value":"value"} or {"kind":"sql","sql":"raw SQL WHERE clause"}.',
    "Rules:",
    "- Use only the listed columns.",
    "- Use only the allowed operators.",
    "- Return one or more filters.",
    '- Prefer kind "column" filters whenever possible.',
    '- Use kind "sql" only as a fallback when the user\'s request cannot be fully expressed with the predefined column filters above.',
    '- Do not use kind "sql" as a shortcut for a request that can already be represented with the listed columns and operators.',
    '- Operators "is" and "is not" are only valid for null checks and MUST use value null.',
    "- Comparison operators >, >=, <, and <= are only valid for numeric, date/time, and time columns.",
    "- Text-search operators like, not like, ilike, and not ilike are only valid for text-like columns, enum columns, and text-like arrays.",
    "- Boolean filters must use true or false.",
    "- UUID filters must use valid UUID values.",
    "- JSON filters must use valid JSON values, and array equality filters must use valid JSON arrays.",
    "- SQL filters must be a single SQL WHERE clause fragment. A leading WHERE keyword is allowed but not required.",
    "- Prefer ilike for case-insensitive text matching when the user implies partial text search.",
    "- Resolve relative date phrases like today, yesterday, this month, and last year against the current timestamp above.",
    `User request: ${request}`,
  ].join("\n");
}

export function buildAiFilterCorrectionPrompt(args: {
  filterOperators?: FilterOperator[];
  issues: AiFilterIssue[];
  now?: Date;
  request: string;
  responseText: string;
  table: Table;
  timeZone?: string;
}): string {
  const { issues, request, responseText, ...promptArgs } = args;
  const issueLines =
    issues.length > 0
      ? issues.map((issue) => {
          const prefix =
            issue.filterIndex != null
              ? `- Filter ${issue.filterIndex + 1}`
              : "- Response";
          const detailParts = [
            issue.column ? `column=${issue.column}` : null,
            issue.operator ? `operator=${issue.operator}` : null,
            issue.value !== undefined ? `value=${issue.value}` : null,
          ].filter(Boolean);

          return detailParts.length > 0
            ? `${prefix} (${detailParts.join(", ")}): ${issue.message}`
            : `${prefix}: ${issue.message}`;
        })
      : ["- The response was invalid. Return corrected filter JSON."];

  return [
    buildAiFilterPrompt({ ...promptArgs, request }),
    "Your previous response was invalid.",
    `Original user request: ${request}`,
    `Previous response: ${responseText}`,
    "Problems to fix:",
    ...issueLines,
    "Return corrected JSON only. Do not add markdown fences or commentary.",
  ].join("\n");
}

export async function resolveAiFiltering(
  args: ResolveAiFilteringArgs,
): Promise<ResolveAiFilteringResult> {
  const { aiFilter, filterOperators, now, request, table, timeZone } = args;
  const promptArgs = {
    filterOperators,
    now,
    request,
    table,
    timeZone,
  } satisfies AiFilterPromptArgs;
  const initialResponseText = await aiFilter(buildAiFilterPrompt(promptArgs));
  const initialResult = parseAiFilterResponseToEditingFilter({
    filterOperators,
    responseText: initialResponseText,
    table,
  });

  if (initialResult.issues.length === 0) {
    return {
      ...initialResult,
      filterGroup: attachAiSourceToEditingFilter(
        initialResult.filterGroup,
        request,
      ),
      didRetry: false,
      responseText: initialResponseText,
    };
  }

  const retryResponseText = await aiFilter(
    buildAiFilterCorrectionPrompt({
      filterOperators,
      issues: initialResult.issues,
      now,
      request,
      responseText: initialResponseText,
      table,
      timeZone,
    }),
  );
  const retryResult = parseAiFilterResponseToEditingFilter({
    filterOperators,
    responseText: retryResponseText,
    table,
  });

  if (
    retryResult.filterGroup.filters.length === 0 &&
    initialResult.filterGroup.filters.length > 0
  ) {
    return {
      ...initialResult,
      filterGroup: attachAiSourceToEditingFilter(
        initialResult.filterGroup,
        request,
      ),
      didRetry: true,
      responseText: retryResponseText,
    };
  }

  return {
    ...retryResult,
    filterGroup: attachAiSourceToEditingFilter(
      retryResult.filterGroup,
      request,
    ),
    didRetry: true,
    responseText: retryResponseText,
  };
}

export function createEditingFilterFromAiResponse(args: {
  filterOperators?: FilterOperator[];
  responseText: string;
  table: Table;
}): EditingFilterGroup {
  const result = parseAiFilterResponseToEditingFilter(args);

  if (result.filterGroup.filters.length === 0) {
    throw new Error(
      result.issues[0]?.message ??
        "AI response did not contain any valid filters.",
    );
  }

  return result.filterGroup;
}

export function parseAiFilterResponseToEditingFilter(args: {
  filterOperators?: FilterOperator[];
  responseText: string;
  table: Table;
}): ParsedAiFilterResult {
  const { filterOperators, responseText, table } = args;
  const filterGroup = createEmptyEditingFilterGroup();
  const availableOperators = new Set<FilterOperator>(
    filterOperators && filterOperators.length > 0
      ? filterOperators
      : DEFAULT_FILTER_OPERATORS,
  );
  const parseResult = parseAiFilterResponse(responseText);

  if ("issues" in parseResult) {
    return {
      filterGroup,
      issues: parseResult.issues.map((issue) => ({
        ...issue,
        responseText,
      })),
    };
  }

  const issues: AiFilterIssue[] = [];

  for (const [filterIndex, candidate] of (
    parseResult.filters ?? []
  ).entries()) {
    if (
      candidate.kind === "sql" ||
      (candidate.kind === undefined &&
        typeof candidate.sql === "string" &&
        !Object.hasOwn(candidate, "column"))
    ) {
      if (typeof candidate.sql !== "string") {
        issues.push({
          code: "invalid-response-shape",
          filterIndex,
          message: 'SQL filters must include a string "sql" value.',
          responseText,
        });
        continue;
      }

      const filter = createEditingSqlFilter(candidate.sql);
      const syntaxIssue = getEditingFilterSyntaxIssue(filter, table.columns);

      if (syntaxIssue) {
        issues.push({
          code: "invalid-filter-syntax",
          filterIndex,
          message: syntaxIssue.message,
          responseText,
          syntaxIssue,
          value: candidate.sql,
        });
      }

      filterGroup.filters.push(filter);
      continue;
    }

    if (candidate.kind !== undefined && candidate.kind !== "column") {
      issues.push({
        code: "invalid-response-shape",
        filterIndex,
        message: 'Filter kind must be "column" or "sql".',
        responseText,
      });
      continue;
    }

    if (
      typeof candidate.column !== "string" ||
      !table.columns[candidate.column]
    ) {
      issues.push({
        code: "invalid-column",
        filterIndex,
        message: "Use one of the listed columns.",
        responseText,
        value:
          candidate.value === undefined
            ? undefined
            : serializeAiFilterValue(candidate.value),
      });
      continue;
    }

    if (
      typeof candidate.operator !== "string" ||
      !isFilterOperator(candidate.operator) ||
      !availableOperators.has(candidate.operator)
    ) {
      issues.push({
        code: "invalid-operator",
        column: candidate.column,
        filterIndex,
        message: "Use one of the allowed operators.",
        operator:
          typeof candidate.operator === "string"
            ? candidate.operator
            : undefined,
        responseText,
        value:
          candidate.value === undefined
            ? undefined
            : serializeAiFilterValue(candidate.value),
      });
      continue;
    }

    if (!Object.hasOwn(candidate, "value")) {
      issues.push({
        code: "missing-value",
        column: candidate.column,
        filterIndex,
        message: "Every filter must include a value.",
        operator: candidate.operator,
        responseText,
      });
      continue;
    }

    const column = table.columns[candidate.column];
    const rawValue = serializeAiFilterValue(candidate.value);
    const filter = createEditingColumnFilter(candidate.column);

    filter.draftValue = rawValue;
    filter.operator = candidate.operator;
    filter.value = coerceToValue(column, candidate.operator, rawValue);

    const syntaxIssue = getEditingFilterSyntaxIssue(filter, table.columns);

    if (syntaxIssue) {
      issues.push({
        code: "invalid-filter-syntax",
        column: candidate.column,
        filterIndex,
        message: syntaxIssue.message,
        operator: candidate.operator,
        responseText,
        syntaxIssue,
        value: rawValue,
      });
    }

    filterGroup.filters.push(filter);
  }

  if (filterGroup.filters.length === 0) {
    issues.push({
      code: "missing-filters",
      message: "AI response did not contain any valid filters.",
      responseText,
    });
  }

  return { filterGroup, issues };
}

function createEmptyEditingFilterGroup(): EditingFilterGroup {
  return {
    after: "and",
    filters: [],
    id: shortUUID.generate(),
    kind: "FilterGroup",
  };
}

function parseAiFilterResponse(responseText: string):
  | ParsedAiFilterResponse
  | {
      issues: AiFilterIssue[];
    } {
  const normalizedResponse = extractJsonObject(responseText.trim());

  let parsedResponse: unknown;

  try {
    parsedResponse = JSON.parse(normalizedResponse);
  } catch (error) {
    return {
      issues: [
        {
          code: "invalid-json",
          message:
            error instanceof Error
              ? `AI response was not valid JSON: ${error.message}`
              : "AI response was not valid JSON.",
        },
      ],
    };
  }

  if (
    typeof parsedResponse !== "object" ||
    parsedResponse == null ||
    Array.isArray(parsedResponse)
  ) {
    return {
      issues: [
        {
          code: "invalid-response-shape",
          message: "AI response must be a JSON object.",
        },
      ],
    };
  }

  if (
    "filters" in parsedResponse &&
    (parsedResponse.filters == null || !Array.isArray(parsedResponse.filters))
  ) {
    return {
      issues: [
        {
          code: "invalid-response-shape",
          message: 'AI response must include a "filters" array.',
        },
      ],
    };
  }

  return parsedResponse as ParsedAiFilterResponse;
}

function extractJsonObject(responseText: string): string {
  const fencedMatch = responseText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const withoutFences = fencedMatch ? fencedMatch[1]!.trim() : responseText;
  const firstBraceIndex = withoutFences.indexOf("{");
  const lastBraceIndex = withoutFences.lastIndexOf("}");

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return withoutFences.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  return withoutFences;
}

function serializeAiFilterValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatPromptLocalDateTime(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}
