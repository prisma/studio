import type { AdapterIntrospectResult, SqlEditorDialect } from "@/data";

import {
  normalizeAiJsonResponseText,
  requestValidatedAiJsonResponse,
} from "./ai-json-response";

const DEFAULT_MAX_COLUMNS_PER_TABLE = 12;
const DEFAULT_MAX_TABLES = 20;

export interface AiSqlGenerationContextTableColumn {
  datatype: string;
  name: string;
}

export interface AiSqlGenerationContextTable {
  columns: AiSqlGenerationContextTableColumn[];
  name: string;
  schema: string;
}

export interface AiSqlGenerationContext {
  activeSchema: string;
  dialect: SqlEditorDialect;
  tables: AiSqlGenerationContextTable[];
  timeZone?: string;
}

export interface AiSqlGenerationIssue {
  code:
    | "invalid-json"
    | "invalid-response-shape"
    | "missing-sql"
    | "provider-output-limit";
  message: string;
  responseText?: string;
}

interface ParsedAiSqlGenerationResponse {
  rationale?: unknown;
  shouldGenerateVisualization?: unknown;
  sql?: unknown;
}

interface ResolveAiSqlGenerationArgs {
  activeSchema: string;
  requestAiSqlGeneration: (input: string) => Promise<string>;
  dialect: SqlEditorDialect;
  introspection: AdapterIntrospectResult;
  maxColumnsPerTable?: number;
  maxTables?: number;
  now?: Date;
  request: string;
}

export interface ResolveAiSqlGenerationResult {
  didRetry: boolean;
  rationale: string | null;
  responseText: string;
  shouldGenerateVisualization: boolean;
  sql: string;
}

export function buildAiSqlGenerationContext(args: {
  activeSchema: string;
  dialect: SqlEditorDialect;
  introspection: AdapterIntrospectResult;
  maxColumnsPerTable?: number;
  maxTables?: number;
}): AiSqlGenerationContext {
  const {
    activeSchema,
    dialect,
    introspection,
    maxColumnsPerTable = DEFAULT_MAX_COLUMNS_PER_TABLE,
    maxTables = DEFAULT_MAX_TABLES,
  } = args;
  const tables: AiSqlGenerationContextTable[] = [];
  const orderedSchemas = orderSchemasByActive(args.activeSchema, introspection);

  for (const schema of orderedSchemas) {
    for (const table of Object.values(schema.tables)) {
      tables.push({
        columns: Object.values(table.columns)
          .slice(0, maxColumnsPerTable)
          .map((column) => ({
            datatype: column.datatype.name,
            name: column.name,
          })),
        name: table.name,
        schema: table.schema,
      });

      if (tables.length >= maxTables) {
        break;
      }
    }

    if (tables.length >= maxTables) {
      break;
    }
  }

  return {
    activeSchema,
    dialect,
    tables,
    timeZone: introspection.timezone,
  };
}

export function buildAiSqlGenerationPrompt(args: {
  context: AiSqlGenerationContext;
  now?: Date;
  request: string;
}): string {
  const { context, now = new Date(), request } = args;
  const databaseEngine = getDatabaseEngineName(context.dialect);
  const promptTimeZone =
    context.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const tableLines = context.tables.flatMap((table) => {
    return [
      `- ${table.schema}.${table.name}`,
      ...table.columns.map((column) => {
        return `  - ${column.name}: ${column.datatype}`;
      }),
    ];
  });

  return [
    "You convert a user's natural-language request into a single SQL statement for Prisma Studio.",
    `Database engine: ${databaseEngine}`,
    `SQL dialect identifier: ${context.dialect}`,
    `Active schema: ${context.activeSchema}`,
    `Current local date and time: ${formatPromptLocalDateTime(now, promptTimeZone)} (timezone: ${promptTimeZone})`,
    `Current UTC date and time: ${now.toISOString()}`,
    "Available tables and columns:",
    ...tableLines,
    "Return JSON only. Do not add markdown fences or commentary.",
    'Return this exact top-level shape: {"sql":"...","rationale":"...","shouldGenerateVisualization":true}',
    "Rules:",
    "- Use only the listed schemas, tables, and columns.",
    "- Return exactly one SQL statement.",
    "- Prefer a read-only SELECT query unless the user explicitly requests a write or schema change.",
    "- If the query returns rows instead of a count or aggregate, include a reasonable LIMIT of 100 or less unless the user explicitly requests another limit.",
    `- Use only functions, operators, and casts supported by ${databaseEngine}.`,
    "- Use dialect-appropriate SQL syntax.",
    "- Decide whether the resulting dataset would make an interesting chart.",
    '- Set "shouldGenerateVisualization" to true only when the expected result is meaningfully visualizable as a simple chart such as a bar, line, pie, scatter, or time-series view.',
    '- Set "shouldGenerateVisualization" to false for results that are mostly free-form text, unstructured JSON, single values, or otherwise better inspected as a table.',
    ...getDialectSpecificPromptRules(context.dialect).map((rule) => {
      return `- ${rule}`;
    }),
    "- Never invent tables or columns that are not listed above.",
    `User request: ${request}`,
  ].join("\n");
}

export function buildAiSqlGenerationCorrectionPrompt(args: {
  context: AiSqlGenerationContext;
  issues: AiSqlGenerationIssue[];
  now?: Date;
  previousSql?: string;
  queryErrorMessage?: string;
  request: string;
  responseText: string;
}): string {
  const {
    context,
    issues,
    now,
    previousSql,
    queryErrorMessage,
    request,
    responseText,
  } = args;

  return [
    buildAiSqlGenerationPrompt({ context, now, request }),
    previousSql
      ? `Previous SQL statement: ${previousSql}`
      : null,
    queryErrorMessage
      ? `Database error from that SQL: ${queryErrorMessage}`
      : null,
    "Your previous response was invalid.",
    `Original user request: ${request}`,
    `Previous response: ${responseText}`,
    "Problems to fix:",
    ...issues.map((issue) => `- ${issue.message}`),
    "Return corrected JSON only. Do not add markdown fences or commentary.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export async function resolveAiSqlGeneration(
  args: ResolveAiSqlGenerationArgs,
): Promise<ResolveAiSqlGenerationResult> {
  const {
    activeSchema,
    requestAiSqlGeneration,
    dialect,
    introspection,
    maxColumnsPerTable,
    maxTables,
    now,
    request,
  } = args;
  const trimmedRequest = request.trim();

  if (trimmedRequest.length === 0) {
    throw new Error("Please enter a SQL generation request first.");
  }

  const context = buildAiSqlGenerationContext({
    activeSchema,
    dialect,
    introspection,
    maxColumnsPerTable,
    maxTables,
  });

  return requestValidatedAiSqlGeneration({
    requestAiSqlGeneration,
    buildRetryPrompt: ({ issues, responseText }) => {
      return buildAiSqlGenerationCorrectionPrompt({
        context,
        issues,
        now,
        request: trimmedRequest,
        responseText,
      });
    },
    prompt: buildAiSqlGenerationPrompt({
      context,
      now,
      request: trimmedRequest,
    }),
  });
}

function orderSchemasByActive(
  activeSchema: string,
  introspection: AdapterIntrospectResult,
) {
  const schemas = Object.values(introspection.schemas);
  const active = schemas.find((schema) => schema.name === activeSchema);

  if (!active) {
    return schemas;
  }

  return [active, ...schemas.filter((schema) => schema.name !== activeSchema)];
}

function parseAiSqlGenerationResponse(responseText: string): {
  issues: AiSqlGenerationIssue[];
  value: {
    rationale: string | null;
    shouldGenerateVisualization: boolean;
    sql: string;
  } | null;
} {
  let parsed: ParsedAiSqlGenerationResponse | null = null;
  const normalizedResponseText = normalizeAiJsonResponseText(responseText);

  try {
    parsed = JSON.parse(normalizedResponseText) as ParsedAiSqlGenerationResponse;
  } catch (error) {
    return {
      issues: [
        {
          code: "invalid-json",
          message:
            error instanceof Error
              ? `AI response was not valid JSON: ${error.message}`
              : "AI response was not valid JSON.",
          responseText,
        },
      ],
      value: null,
    };
  }

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      issues: [
        {
          code: "invalid-response-shape",
          message: "AI response must be a JSON object.",
          responseText,
        },
      ],
      value: null,
    };
  }

  if (typeof parsed.sql !== "string") {
    return {
      issues: [
        {
          code: "missing-sql",
          message: 'AI response must include a non-empty "sql" string.',
          responseText,
        },
      ],
      value: null,
    };
  }

  const sql = parsed.sql.trim();

  if (sql.length === 0) {
    return {
      issues: [
        {
          code: "missing-sql",
          message: 'AI response must include a non-empty "sql" string.',
          responseText,
        },
      ],
      value: null,
    };
  }

  return {
    issues: [],
    value: {
      rationale:
        typeof parsed.rationale === "string" && parsed.rationale.trim().length > 0
          ? parsed.rationale.trim()
          : null,
      shouldGenerateVisualization: coerceVisualizationDecision(
        parsed.shouldGenerateVisualization,
      ),
      sql,
    },
  };
}

async function requestValidatedAiSqlGeneration(args: {
  requestAiSqlGeneration: (input: string) => Promise<string>;
  buildRetryPrompt: (args: {
    issues: AiSqlGenerationIssue[];
    responseText: string;
  }) => string;
  prompt: string;
}): Promise<ResolveAiSqlGenerationResult> {
  const { requestAiSqlGeneration, buildRetryPrompt, prompt } = args;
  const validatedResponse = await requestValidatedAiJsonResponse({
    requestAiText: requestAiSqlGeneration,
    buildRetryPrompt: ({ issues, responseText }) => {
      return buildRetryPrompt({
        issues,
        responseText,
      });
    },
    createRetryIssueFromError: ({ message, responseText }) => {
      return {
        code: "provider-output-limit" as const,
        message: `AI response hit the provider output limit before finishing: ${message}`,
        responseText,
      };
    },
    invalidResponseMessage: "AI response did not include valid SQL.",
    maxCorrectionRetries: 1,
    parseResponse: parseAiSqlGenerationResponse,
    prompt,
  });

  return {
    didRetry: validatedResponse.didRetry,
    rationale: validatedResponse.value.rationale,
    responseText: validatedResponse.responseText,
    shouldGenerateVisualization:
      validatedResponse.value.shouldGenerateVisualization,
    sql: validatedResponse.value.sql,
  };
}

function coerceVisualizationDecision(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (
      normalizedValue === "true" ||
      normalizedValue === "yes" ||
      normalizedValue === "y"
    ) {
      return true;
    }

    if (
      normalizedValue === "false" ||
      normalizedValue === "no" ||
      normalizedValue === "n"
    ) {
      return false;
    }
  }

  return false;
}

function getDatabaseEngineName(dialect: SqlEditorDialect): string {
  switch (dialect) {
    case "mysql":
      return "MySQL";
    case "sqlite":
      return "SQLite";
    case "postgresql":
    default:
      return "PostgreSQL";
  }
}

function getDialectSpecificPromptRules(dialect: SqlEditorDialect): string[] {
  switch (dialect) {
    case "mysql":
      return [
        "Do not use PostgreSQL-only syntax like ILIKE or ::type casts.",
      ];
    case "sqlite":
      return [
        "Do not use PostgreSQL schemas, PostgreSQL casts, or MySQL-only functions.",
      ];
    case "postgresql":
    default:
      return [
        "Do not use SQLite-only functions such as TYPEOF() or MySQL-only functions such as JSON_TYPE().",
      ];
  }
}

function formatPromptLocalDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone,
  }).format(date);
}
