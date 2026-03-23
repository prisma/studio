import {
  Chart,
  type ChartConfiguration,
  type ChartType,
  Colors,
} from "chart.js/auto";

import {
  normalizeAiJsonResponseText,
  requestValidatedAiJsonResponse,
} from "./ai-json-response";

const DEFAULT_MAX_VISUALIZATION_CORRECTIONS = 2;
const SUPPORTED_CHART_TYPES = [
  "bar",
  "bubble",
  "doughnut",
  "line",
  "pie",
  "polarArea",
  "radar",
  "scatter",
] as const;

Chart.register(Colors);

export type SqlResultVisualizationChartType =
  (typeof SUPPORTED_CHART_TYPES)[number];

interface ParsedSqlResultVisualizationResponse {
  config?: {
    data?: {
      datasets?: unknown;
      labels?: unknown;
    };
    options?: unknown;
    type?: unknown;
  };
}

export interface SqlResultVisualizationIssue {
  code:
    | "invalid-chart-type"
    | "invalid-config"
    | "invalid-data"
    | "invalid-json"
    | "invalid-options"
    | "provider-output-limit";
  message: string;
  responseText?: string;
}

export interface ResolveSqlResultVisualizationResult {
  config: ChartConfiguration<SqlResultVisualizationChartType>;
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
    "Generate an appropriate chart for the following data using the Chart.js library. Use no external libraries.",
    `Database engine: ${databaseEngine}`,
    `SQL: ${querySql}`,
    aiQueryRequest ? `AI query request: ${aiQueryRequest}` : null,
    `Row count: ${rows.length}`,
    "Full result rows JSON:",
    JSON.stringify(rows),
    "Return JSON only. Do not add markdown fences or commentary.",
    'Return this exact top-level shape: {"config":{"type":"bar","data":{"labels":["A"],"datasets":[{"label":"Series","data":[1]}]},"options":{}}}',
    `Supported chart types: ${SUPPORTED_CHART_TYPES.join(", ")}`,
    "The config must be valid for new Chart(canvas, config).",
    "Do not include functions, callbacks, plugins, dates, Maps, Sets, or references to external libraries.",
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
  const { aiQueryRequest, databaseEngine, issues, querySql, responseText, rows } =
    args;

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
      "AI visualization response did not contain a valid Chart.js config.",
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

export function createSqlResultVisualizationChart(
  canvas: HTMLCanvasElement,
  config: ChartConfiguration<SqlResultVisualizationChartType>,
) {
  return new Chart(canvas, {
    ...config,
    options: {
      maintainAspectRatio: false,
      ...config.options,
    },
  });
}

function parseSqlResultVisualizationResponse(responseText: string): {
  issues: SqlResultVisualizationIssue[];
  value: ChartConfiguration<SqlResultVisualizationChartType> | null;
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

  const config = parsed?.config;

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

  if (!isSupportedChartType(config.type)) {
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

  if (
    !config.data ||
    typeof config.data !== "object" ||
    Array.isArray(config.data) ||
    !Array.isArray(config.data.datasets)
  ) {
    return {
      issues: [
        {
          code: "invalid-data",
          message:
            'Chart config must include "data.datasets" as an array.',
          responseText,
        },
      ],
      value: null,
    };
  }

  if (
    config.options !== undefined &&
    (typeof config.options !== "object" ||
      config.options === null ||
      Array.isArray(config.options))
  ) {
    return {
      issues: [
        {
          code: "invalid-options",
          message: 'Chart config "options" must be a JSON object when present.',
          responseText,
        },
      ],
      value: null,
    };
  }

  return {
    issues: [],
    value: config as ChartConfiguration<SqlResultVisualizationChartType>,
  };
}

function isSupportedChartType(value: unknown): value is SqlResultVisualizationChartType {
  return (
    typeof value === "string" &&
    (SUPPORTED_CHART_TYPES as readonly string[]).includes(value)
  );
}
