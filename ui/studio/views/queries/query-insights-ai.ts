import type { StudioQueryInsightQuery } from "@/data/query-insights";

import { normalizeAiJsonResponseText } from "../sql/ai-json-response";

export interface QueryInsightAnalysis {
  improvedPrisma?: string;
  improvedSql?: string;
  recommendations: string[];
  summary: string;
}

interface ParsedQueryInsightAnalysis {
  improvedPrisma?: unknown;
  improvedSql?: unknown;
  recommendations?: unknown;
  summary?: unknown;
}

export function buildQueryInsightAnalysisPrompt(
  query: StudioQueryInsightQuery,
): string {
  const lines = [
    "You analyze SQL query performance for Prisma Studio.",
    "Return JSON only. Do not include markdown fences or commentary.",
    'Return this exact top-level shape: {"summary":"...","recommendations":["..."],"improvedSql":"...","improvedPrisma":"..."}',
    "Rules:",
    "- Keep the summary to one or two short sentences.",
    "- Recommendations must be concrete and actionable.",
    "- Include improvedSql only when a concrete SQL rewrite is useful.",
    "- Include improvedPrisma only when Prisma ORM context is present and a concrete Prisma Client rewrite is useful.",
    "- Do not mention query parameter values; they are intentionally unavailable.",
    "",
    "Query statistics:",
    `- Executions: ${query.count}`,
    `- Average latency: ${formatNumber(query.duration)} ms`,
    `- Reads: ${formatNumber(query.reads)}`,
    `- Rows returned: ${formatNumber(query.rowsReturned)}`,
    `- Tables: ${query.tables.length > 0 ? query.tables.join(", ") : "unknown"}`,
  ];

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

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(0) : "unknown";
}
