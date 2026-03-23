// @vitest-environment happy-dom

import "vitest-canvas-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioLlmError } from "@/data/llm";

import {
  buildSqlResultVisualizationPrompt,
  createSqlResultVisualizationChart,
  resolveSqlResultVisualization,
} from "./sql-result-visualization";

describe("sql-result-visualization", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("builds a Chart.js prompt from the full SQL result set", () => {
    const prompt = buildSqlResultVisualizationPrompt({
      aiQueryRequest: "show me number labels",
      databaseEngine: "PostgreSQL",
      querySql: "select one from numbers",
      rows: [
        { one: 1, label: "first" },
        { one: 2, label: "second" },
      ],
    });

    expect(prompt).toContain("Generate an appropriate chart");
    expect(prompt).toContain("Chart.js");
    expect(prompt).toContain("Use no external libraries.");
    expect(prompt).toContain('"label":"first"');
    expect(prompt).toContain('"label":"second"');
    expect(prompt).toContain("Database engine: PostgreSQL");
    expect(prompt).toContain("SQL: select one from numbers");
    expect(prompt).toContain("AI query request: show me number labels");
  });

  it("omits the AI query request when the result did not come from AI SQL generation", () => {
    const prompt = buildSqlResultVisualizationPrompt({
      databaseEngine: "PostgreSQL",
      querySql: "select one from numbers",
      rows: [{ one: 1 }],
    });

    expect(prompt).toContain("SQL: select one from numbers");
    expect(prompt).not.toContain("AI query request:");
  });

  it("creates working Chart.js instances for a few basic chart types", () => {
    const chartTypes = ["bar", "line", "pie"] as const;

    for (const chartType of chartTypes) {
      const canvas = document.createElement("canvas");
      document.body.appendChild(canvas);

      const chart = createSqlResultVisualizationChart(canvas, {
        data: {
          datasets: [
            {
              data: [1, 2, 3],
              label: "Series",
            },
          ],
          labels: ["A", "B", "C"],
        },
        options: {
          responsive: false,
        },
        type: chartType,
      });

      expect((chart.config as { type?: string }).type).toBe(chartType);
      expect(chart.data.datasets).toHaveLength(1);

      chart.destroy();
    }
  });

  it("retries visualization generation up to two times with the latest validation error", async () => {
    const requestAiVisualization = vi
      .fn<(prompt: string) => Promise<string>>()
      .mockResolvedValueOnce("```json\n{")
      .mockResolvedValueOnce(
        JSON.stringify({
          config: {
            data: {
              datasets: [{ data: [1], label: "Series" }],
              labels: ["A"],
            },
            type: "histogram",
          },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          config: {
            data: {
              datasets: [{ data: [1], label: "Series" }],
              labels: ["A"],
            },
            options: {
              responsive: false,
            },
            type: "bar",
          },
        }),
      );

    const result = await resolveSqlResultVisualization({
      requestAiVisualization,
      databaseEngine: "PostgreSQL",
      querySql: "select one from numbers",
      rows: [{ one: 1 }],
    });

    expect(requestAiVisualization).toHaveBeenCalledTimes(3);
    expect(requestAiVisualization.mock.calls[1]?.[0]).toContain(
      "AI visualization response was not valid JSON",
    );
    expect(requestAiVisualization.mock.calls[2]?.[0]).toContain(
      "Chart type must be one of: bar, bubble, doughnut, line, pie, polarArea, radar, scatter.",
    );
    expect(result.didRetry).toBe(true);
    expect(result.config.type).toBe("bar");
  });

  it("retries visualization generation when the provider reports that the output token limit was reached", async () => {
    const requestAiVisualization = vi
      .fn<(prompt: string) => Promise<string>>()
      .mockRejectedValueOnce(
        new StudioLlmError({
          code: "output-limit-exceeded",
          message:
            "Anthropic stopped because it reached the configured output limit of 2048 tokens before finishing the response.",
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          config: {
            data: {
              datasets: [{ data: [1], label: "Series" }],
              labels: ["A"],
            },
            options: {
              responsive: false,
            },
            type: "bar",
          },
        }),
      );

    const result = await resolveSqlResultVisualization({
      requestAiVisualization,
      databaseEngine: "PostgreSQL",
      querySql: "select one from numbers",
      rows: [{ one: 1 }],
    });

    expect(requestAiVisualization).toHaveBeenCalledTimes(2);
    expect(requestAiVisualization.mock.calls[1]?.[0]).toContain(
      "AI visualization response hit the provider output limit before finishing: Anthropic stopped because it reached the configured output limit of 2048 tokens before finishing the response.",
    );
    expect(result.didRetry).toBe(true);
    expect(result.config.type).toBe("bar");
  });
});
