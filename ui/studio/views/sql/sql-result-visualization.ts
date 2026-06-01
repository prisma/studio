import {
  normalizeAiJsonResponseText,
  requestValidatedAiJsonResponse,
} from "./ai-json-response";

const DEFAULT_MAX_VISUALIZATION_CORRECTIONS = 2;
const SUPPORTED_CHART_TYPES = ["bar", "doughnut", "line", "pie"] as const;

export type SqlResultVisualizationChartType =
  (typeof SUPPORTED_CHART_TYPES)[number];

export interface SqlResultVisualizationSeries {
  color?: string;
  key: string;
  label?: string;
}

export interface SqlResultVisualizationConfig {
  data: Record<string, string | number | boolean | null>[];
  labelKey?: string;
  series?: SqlResultVisualizationSeries[];
  stacked?: boolean;
  title?: string;
  type: SqlResultVisualizationChartType;
  valueKey?: string;
  xKey?: string;
}

interface ParsedSqlResultVisualizationResponse {
  config?: unknown;
}

export interface SqlResultVisualizationIssue {
  code:
    | "invalid-chart-type"
    | "invalid-config"
    | "invalid-data"
    | "invalid-json"
    | "invalid-series"
    | "provider-output-limit";
  message: string;
  responseText?: string;
}

export interface ResolveSqlResultVisualizationResult {
  config: SqlResultVisualizationConfig;
  didRetry: boolean;
  responseText: string;
}

export function buildSqlResultVisualizationPrompt(args: {
  aiQueryRequest?: string | null;
  databaseEngine: string;
  querySql: string;
  rows: Record<string, unknown>[];
}): string {
  const { aiQueryRequest, databaseEngine, querySql, rows } = args;

  return [
    "Generate an appropriate chart for the following SQL result data using Prisma Studio's Bklit chart components.",
    `Database engine: ${databaseEngine}`,
    `SQL: ${querySql}`,
    aiQueryRequest ? `AI query request: ${aiQueryRequest}` : null,
    `Row count: ${rows.length}`,
    "Full result rows JSON:",
    JSON.stringify(rows),
    "Return JSON only. Do not add markdown fences or commentary.",
    'Return this exact top-level shape: {"config":{"type":"bar","title":"Optional short title","xKey":"label","series":[{"key":"value","label":"Value"}],"stacked":false,"data":[{"label":"A","value":1}]}}',
    `Supported chart types: ${SUPPORTED_CHART_TYPES.join(", ")}`,
    "For bar charts, provide xKey and one or more series keys with numeric values.",
    "For stacked bar charts, set stacked to true and provide one data row per category with separate numeric series fields for each segment. Use stacked bars when the user asks for bars broken down, split, or grouped by a second category.",
    "For line charts, provide xKey as an ISO date, ISO datetime, or epoch millisecond field, plus one or more series keys with numeric values.",
    "For pie and doughnut charts, provide labelKey and valueKey fields, where valueKey points to numeric values.",
    "Use compact, human-readable labels and at most 30 data points unless the result is already smaller.",
    "Do not include functions, callbacks, options, plugins, dates as Date objects, Maps, Sets, or references to external libraries.",
    "Use plain JSON values only.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildSqlResultVisualizationCorrectionPrompt(args: {
  aiQueryRequest?: string | null;
  databaseEngine: string;
  issues: SqlResultVisualizationIssue[];
  querySql: string;
  responseText: string;
  rows: Record<string, unknown>[];
}): string {
  const {
    aiQueryRequest,
    databaseEngine,
    issues,
    querySql,
    responseText,
    rows,
  } = args;

  return [
    buildSqlResultVisualizationPrompt({
      aiQueryRequest,
      databaseEngine,
      querySql,
      rows,
    }),
    "Your previous response was invalid.",
    `Previous response: ${responseText}`,
    "Problems to fix:",
    ...issues.map((issue) => `- ${issue.message}`),
    "Return corrected JSON only. Do not add markdown fences or commentary.",
  ].join("\n");
}

export async function resolveSqlResultVisualization(args: {
  requestAiVisualization: (input: string) => Promise<string>;
  aiQueryRequest?: string | null;
  databaseEngine: string;
  maxCorrectionRetries?: number;
  querySql: string;
  rows: Record<string, unknown>[];
}): Promise<ResolveSqlResultVisualizationResult> {
  const {
    requestAiVisualization,
    aiQueryRequest,
    databaseEngine,
    maxCorrectionRetries = DEFAULT_MAX_VISUALIZATION_CORRECTIONS,
    querySql,
    rows,
  } = args;
  const validatedResponse = await requestValidatedAiJsonResponse({
    requestAiText: requestAiVisualization,
    buildRetryPrompt: ({ issues, responseText }) => {
      return buildSqlResultVisualizationCorrectionPrompt({
        aiQueryRequest,
        databaseEngine,
        issues,
        querySql,
        responseText,
        rows,
      });
    },
    createRetryIssueFromError: ({ message, responseText }) => {
      return {
        code: "provider-output-limit" as const,
        message: `AI visualization response hit the provider output limit before finishing: ${message}`,
        responseText,
      };
    },
    invalidResponseMessage:
      "AI visualization response did not contain a valid Bklit chart config.",
    maxCorrectionRetries,
    parseResponse: parseSqlResultVisualizationResponse,
    prompt: buildSqlResultVisualizationPrompt({
      aiQueryRequest,
      databaseEngine,
      querySql,
      rows,
    }),
  });

  return {
    config: validatedResponse.value,
    didRetry: validatedResponse.didRetry,
    responseText: validatedResponse.responseText,
  };
}

function parseSqlResultVisualizationResponse(responseText: string): {
  issues: SqlResultVisualizationIssue[];
  value: SqlResultVisualizationConfig | null;
} {
  let parsed: ParsedSqlResultVisualizationResponse | null = null;
  const normalizedResponseText = normalizeAiJsonResponseText(responseText);

  try {
    parsed = JSON.parse(
      normalizedResponseText,
    ) as ParsedSqlResultVisualizationResponse;
  } catch (error) {
    return {
      issues: [
        {
          code: "invalid-json",
          message:
            error instanceof Error
              ? `AI visualization response was not valid JSON: ${error.message}`
              : "AI visualization response was not valid JSON.",
          responseText,
        },
      ],
      value: null,
    };
  }

  return validateSqlResultVisualizationConfig(parsed?.config, responseText);
}

export function validateSqlResultVisualizationConfig(
  config: unknown,
  responseText?: string,
): {
  issues: SqlResultVisualizationIssue[];
  value: SqlResultVisualizationConfig | null;
} {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {
      issues: [
        {
          code: "invalid-config",
          message: 'AI visualization response must include a "config" object.',
          responseText,
        },
      ],
      value: null,
    };
  }

  const candidate = config as Partial<SqlResultVisualizationConfig>;

  if (!isSupportedChartType(candidate.type)) {
    return {
      issues: [
        {
          code: "invalid-chart-type",
          message: `Chart type must be one of: ${SUPPORTED_CHART_TYPES.join(", ")}.`,
          responseText,
        },
      ],
      value: null,
    };
  }

  if (!Array.isArray(candidate.data)) {
    return {
      issues: [
        {
          code: "invalid-data",
          message: 'Chart config must include "data" as an array.',
          responseText,
        },
      ],
      value: null,
    };
  }

  const data = candidate.data
    .filter((row): row is Record<string, string | number | boolean | null> => {
      return row != null && typeof row === "object" && !Array.isArray(row);
    })
    .map((row) => {
      return Object.fromEntries(
        Object.entries(row).filter(([, value]) => {
          return (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            value === null
          );
        }),
      );
    });

  if (data.length === 0) {
    return {
      issues: [
        {
          code: "invalid-data",
          message: "Chart data must contain at least one object row.",
          responseText,
        },
      ],
      value: null,
    };
  }

  if (candidate.type === "pie" || candidate.type === "doughnut") {
    return validatePieLikeChartConfig({
      candidate,
      data,
      responseText,
      type: candidate.type,
    });
  }

  return validateCartesianChartConfig({
    candidate,
    data,
    responseText,
    type: candidate.type,
  });
}

function validateCartesianChartConfig(args: {
  candidate: Partial<SqlResultVisualizationConfig>;
  data: Record<string, string | number | boolean | null>[];
  responseText?: string;
  type: "bar" | "line";
}): {
  issues: SqlResultVisualizationIssue[];
  value: SqlResultVisualizationConfig | null;
} {
  const { candidate, data, responseText, type } = args;

  if (!isNonEmptyString(candidate.xKey)) {
    return {
      issues: [
        {
          code: "invalid-data",
          message: `${type} charts must include a non-empty "xKey".`,
          responseText,
        },
      ],
      value: null,
    };
  }

  if (!Array.isArray(candidate.series) || candidate.series.length === 0) {
    return {
      issues: [
        {
          code: "invalid-series",
          message: `${type} charts must include at least one series.`,
          responseText,
        },
      ],
      value: null,
    };
  }

  const series = normalizeSeries(candidate.series);
  if (series.length === 0) {
    return {
      issues: [
        {
          code: "invalid-series",
          message: "Every chart series must include a non-empty key.",
          responseText,
        },
      ],
      value: null,
    };
  }

  if (
    type === "line" &&
    !data.every((row) => isDateLike(row[candidate.xKey!]))
  ) {
    return {
      issues: [
        {
          code: "invalid-data",
          message:
            'Line chart "xKey" values must be ISO dates, ISO datetimes, or epoch milliseconds.',
          responseText,
        },
      ],
      value: null,
    };
  }

  const hasNumericSeriesValue = series.some((item) => {
    return data.some((row) => typeof row[item.key] === "number");
  });

  if (!hasNumericSeriesValue) {
    return {
      issues: [
        {
          code: "invalid-series",
          message: "At least one series key must reference numeric data.",
          responseText,
        },
      ],
      value: null,
    };
  }

  return {
    issues: [],
    value: {
      data,
      series,
      stacked: type === "bar" ? candidate.stacked === true : undefined,
      title: isNonEmptyString(candidate.title) ? candidate.title : undefined,
      type,
      xKey: candidate.xKey,
    },
  };
}

function validatePieLikeChartConfig(args: {
  candidate: Partial<SqlResultVisualizationConfig>;
  data: Record<string, string | number | boolean | null>[];
  responseText?: string;
  type: "doughnut" | "pie";
}): {
  issues: SqlResultVisualizationIssue[];
  value: SqlResultVisualizationConfig | null;
} {
  const { candidate, data, responseText, type } = args;

  if (!isNonEmptyString(candidate.labelKey)) {
    return {
      issues: [
        {
          code: "invalid-data",
          message: `${type} charts must include a non-empty "labelKey".`,
          responseText,
        },
      ],
      value: null,
    };
  }

  if (!isNonEmptyString(candidate.valueKey)) {
    return {
      issues: [
        {
          code: "invalid-data",
          message: `${type} charts must include a non-empty "valueKey".`,
          responseText,
        },
      ],
      value: null,
    };
  }

  const hasNumericValue = data.some(
    (row) => typeof row[candidate.valueKey!] === "number",
  );

  if (!hasNumericValue) {
    return {
      issues: [
        {
          code: "invalid-data",
          message: '"valueKey" must reference numeric data.',
          responseText,
        },
      ],
      value: null,
    };
  }

  return {
    issues: [],
    value: {
      data,
      labelKey: candidate.labelKey,
      title: isNonEmptyString(candidate.title) ? candidate.title : undefined,
      type,
      valueKey: candidate.valueKey,
    },
  };
}

function normalizeSeries(series: unknown[]): SqlResultVisualizationSeries[] {
  return series.reduce<SqlResultVisualizationSeries[]>((items, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return items;
    }

    const candidate = item as Partial<SqlResultVisualizationSeries>;
    if (!isNonEmptyString(candidate.key)) {
      return items;
    }

    items.push({
      ...(isNonEmptyString(candidate.color) ? { color: candidate.color } : {}),
      key: candidate.key,
      ...(isNonEmptyString(candidate.label) ? { label: candidate.label } : {}),
    });
    return items;
  }, []);
}

function isSupportedChartType(
  value: unknown,
): value is SqlResultVisualizationChartType {
  return (
    typeof value === "string" &&
    (SUPPORTED_CHART_TYPES as readonly string[]).includes(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDateLike(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}
