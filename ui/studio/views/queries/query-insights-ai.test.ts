import { describe, expect, it } from "vitest";

import type { StudioQueryInsightQuery } from "@/data/query-insights";

import {
  buildQueryInsightAnalysisPrompt,
  parseQueryInsightAnalysisResponse,
} from "./query-insights-ai";

const BASE_QUERY: StudioQueryInsightQuery = {
  count: 3,
  duration: 18,
  id: "query-1",
  lastSeen: 1_779_963_199_000,
  query: "select * from users where email = $1",
  reads: 9,
  rowsReturned: 3,
  tables: ["users"],
};

describe("query insights AI helpers", () => {
  it("parses explicit analysis severity levels and trims useful text", () => {
    expect(
      parseQueryInsightAnalysisResponse(
        JSON.stringify({
          improvedPrisma: " prisma.user.findMany({ select: { id: true } }) ",
          improvedSql: " select id from users ",
          level: "warning",
          recommendations: [" Add a narrower projection. ", "", 3],
          summary: "  This query over-fetches.  ",
        }),
      ),
    ).toEqual({
      improvedPrisma: "prisma.user.findMany({ select: { id: true } })",
      improvedSql: "select id from users",
      level: "warning",
      recommendations: ["Add a narrower projection."],
      summary: "This query over-fetches.",
    });
  });

  it("keeps older AI responses compatible by inferring a useful severity", () => {
    expect(
      parseQueryInsightAnalysisResponse(
        JSON.stringify({
          recommendations: ["Project only columns that the UI needs."],
          summary: "The query can be tightened.",
        }),
      ).level,
    ).toBe("info");

    expect(
      parseQueryInsightAnalysisResponse(
        JSON.stringify({
          recommendations: [],
          summary: "The query looks healthy.",
        }),
      ).level,
    ).toBe("all-good");
  });

  it("does not keep all-good severity when the response includes fix content", () => {
    expect(
      parseQueryInsightAnalysisResponse(
        JSON.stringify({
          improvedSql: "select id from users",
          level: "all-good",
          recommendations: ["Project only columns that the UI needs."],
          summary: "This can be improved.",
        }),
      ).level,
    ).toBe("info");
  });

  it("rejects malformed AI responses instead of rendering empty advice", () => {
    expect(() =>
      parseQueryInsightAnalysisResponse(
        JSON.stringify({
          level: "info",
          recommendations: ["Use a smaller select list."],
        }),
      ),
    ).toThrow('AI response must include a non-empty "summary" string.');
  });

  it("builds a severity-aware prompt and only includes structured Prisma ORM context", () => {
    const prompt = buildQueryInsightAnalysisPrompt({
      ...BASE_QUERY,
      prismaQueryInfo: {
        action: "findMany",
        isRaw: false,
        model: "User",
        payload: { select: { id: true } },
      },
    });

    expect(prompt).toContain('"level":"all-good"');
    expect(prompt).toContain("level must be one of all-good, info, or warning");
    expect(prompt).toContain("Prisma ORM context:");
    expect(prompt).toContain('"model": "User"');
    expect(prompt).toContain("select * from users where email = $1");

    const rawPrompt = buildQueryInsightAnalysisPrompt({
      ...BASE_QUERY,
      prismaQueryInfo: {
        action: "queryRaw",
        isRaw: true,
      },
    });

    expect(rawPrompt).not.toContain("Prisma ORM context:");
  });
});
