import type { StudioQueryInsightQuery } from "@/data/query-insights";

import { normalizeAiJsonResponseText } from "../sql/ai-json-response";

export interface QueryInsightAnalysis {
  level: QueryInsightAnalysisLevel;
  improvedPrisma?: string;
  improvedSql?: string;
  recommendations: string[];
  summary: string;
}

export type QueryInsightAnalysisLevel = "all-good" | "info" | "warning";

interface ParsedQueryInsightAnalysis {
  improvedPrisma?: unknown;
  improvedSql?: unknown;
  level?: unknown;
  recommendations?: unknown;
  summary?: unknown;
}

export function buildQueryInsightAnalysisPrompt(
  query: StudioQueryInsightQuery,
): string {
  const lines = [
    "You analyze SQL query performance for Prisma Studio.",
    "Return JSON only. Do not include markdown fences or commentary.",
    'Return this exact top-level shape: {"level":"all-good","summary":"...","recommendations":["..."],"improvedSql":"...","improvedPrisma":"..."}',
    "Rules:",
    "- level must be one of all-good, info, or warning.",
    "- Use all-good when the query looks healthy and no action is needed.",
    "- Use info for minor or situational improvements.",
    "- Use warning for likely performance issues, excessive work, or a risky query shape.",
    "- Keep the summary to one or two short sentences.",
    "- Recommendations must be concrete and actionable.",
    "- Include improvedSql only when a concrete SQL rewrite is useful.",
    "- Include improvedPrisma only when Prisma ORM context is present and a concrete Prisma Client rewrite is useful.",
    "- Do not mention query parameter values; they are intentionally unavailable.",
    '- Call the rowsReturned metric "rows returned" in user-facing text. Do not call rows returned "reads".',
    '- Treat read work as an optional provider estimate. Mention it only as "read work" when it is materially useful.',
    "",
    "Query statistics:",
    `- Executions: ${query.count}`,
    `- Average latency: ${formatNumber(query.duration)} ms`,
    `- Rows returned: ${formatNumber(query.rowsReturned)}`,
    `- Tables: ${query.tables.length > 0 ? query.tables.join(", ") : "unknown"}`,
  ];

  if (hasDistinctReadWorkEstimate(query)) {
    lines.push(`- Read work estimate: ${formatNumber(query.reads)}`);
  }

  if (query.prismaQueryInfo && !query.prismaQueryInfo.isRaw) {
    lines.push(
      "",
      "Prisma ORM context:",
      JSON.stringify(query.prismaQueryInfo, null, 2),
    );
  }

  lines.push("", "SQL:", query.query);

  return lines.join("\n");
}

export function parseQueryInsightAnalysisResponse(
  responseText: string,
): QueryInsightAnalysis {
  const normalizedResponseText = normalizeAiJsonResponseText(responseText);
  const parsed = JSON.parse(
    normalizedResponseText,
  ) as ParsedQueryInsightAnalysis;

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response must be a JSON object.");
  }

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim().length > 0
      ? parsed.summary.trim()
      : "";

  if (summary.length === 0) {
    throw new Error('AI response must include a non-empty "summary" string.');
  }

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .filter((recommendation): recommendation is string => {
          return (
            typeof recommendation === "string" &&
            recommendation.trim().length > 0
          );
        })
        .map((recommendation) => recommendation.trim())
    : [];

  return {
    level: normalizeAnalysisLevel(parsed.level, {
      hasImprovedPrisma:
        typeof parsed.improvedPrisma === "string" &&
        parsed.improvedPrisma.trim().length > 0,
      hasImprovedSql:
        typeof parsed.improvedSql === "string" &&
        parsed.improvedSql.trim().length > 0,
      recommendationCount: recommendations.length,
    }),
    improvedPrisma:
      typeof parsed.improvedPrisma === "string" &&
      parsed.improvedPrisma.trim().length > 0
        ? parsed.improvedPrisma.trim()
        : undefined,
    improvedSql:
      typeof parsed.improvedSql === "string" &&
      parsed.improvedSql.trim().length > 0
        ? parsed.improvedSql.trim()
        : undefined,
    recommendations,
    summary,
  };
}

function normalizeAnalysisLevel(
  level: unknown,
  fallback: {
    hasImprovedPrisma: boolean;
    hasImprovedSql: boolean;
    recommendationCount: number;
  },
): QueryInsightAnalysisLevel {
  if (level === "warning" || level === "info") {
    return level;
  }

  const hasActionableAdvice =
    fallback.recommendationCount > 0 ||
    fallback.hasImprovedSql ||
    fallback.hasImprovedPrisma;

  if (level === "all-good") {
    return hasActionableAdvice ? "info" : "all-good";
  }

  if (hasActionableAdvice) {
    return "info";
  }

  return "all-good";
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(0) : "unknown";
}

function hasDistinctReadWorkEstimate(query: StudioQueryInsightQuery): boolean {
  return (
    Number.isFinite(query.reads) &&
    query.reads > 0 &&
    query.reads !== query.rowsReturned
  );
}
