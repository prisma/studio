import { describe, expect, it, vi } from "vitest";

import { StudioLlmError } from "@/data/llm";

import {
  buildSqlResultVisualizationPrompt,
  resolveSqlResultVisualization,
  validateSqlResultVisualizationConfig,
} from "./sql-result-visualization";

describe("sql-result-visualization", () => {
  it("builds a Bklit chart prompt from the full SQL result set", () => {
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
    expect(prompt).toContain("Bklit chart components");
    expect(prompt).toContain('"xKey":"label"');
    expect(prompt).toContain('"series":[{"key":"value","label":"Value"}]');
    expect(prompt).toContain('"stacked":false');
    expect(prompt).toContain("For stacked bar and horizontal-bar charts");
    expect(prompt).toContain("horizontal-bar");
    expect(prompt).toContain(
      "Use horizontal-bar for ranked categorical results",
    );
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

  it("validates supported Bklit chart configs", () => {
    expect(
      validateSqlResultVisualizationConfig({
        data: [
          { label: "A", value: 1 },
          { label: "B", value: 2 },
        ],
        series: [{ key: "value", label: "Value" }],
        type: "bar",
        xKey: "label",
      }).value,
    ).toMatchObject({ type: "bar", xKey: "label" });

    expect(
      validateSqlResultVisualizationConfig({
        data: [
          { organization: "Acme", design: 2, engineering: 3 },
          { organization: "Zen", design: 1, engineering: 5 },
        ],
        series: [
          { key: "engineering", label: "Engineering" },
          { key: "design", label: "Design" },
        ],
        stacked: true,
        type: "bar",
        xKey: "organization",
      }).value,
    ).toMatchObject({ stacked: true, type: "bar", xKey: "organization" });

    expect(
      validateSqlResultVisualizationConfig({
        data: [
          { organization: "Very Long Organization Name", members: 12 },
          { organization: "Another Long Organization", members: 8 },
        ],
        series: [{ key: "members", label: "Members" }],
        type: "horizontal-bar",
        xKey: "organization",
      }).value,
    ).toMatchObject({ type: "horizontal-bar", xKey: "organization" });

    expect(
      validateSqlResultVisualizationConfig({
        data: [
          { date: "2026-01-01", value: 1 },
          { date: "2026-01-02", value: 2 },
        ],
        series: [{ key: "value", label: "Value" }],
        type: "line",
        xKey: "date",
      }).value,
    ).toMatchObject({ type: "line", xKey: "date" });

    expect(
      validateSqlResultVisualizationConfig({
        data: [{ label: "A", value: 1 }],
        labelKey: "label",
        type: "doughnut",
        valueKey: "value",
      }).value,
    ).toMatchObject({ labelKey: "label", type: "doughnut", valueKey: "value" });
  });

  it("rejects configs that Bklit charts cannot render reliably", () => {
    expect(
      validateSqlResultVisualizationConfig({
        data: [{ label: "A", value: 1 }],
        series: [{ key: "value", label: "Value" }],
        type: "scatter",
        xKey: "label",
      }).issues[0]?.message,
    ).toContain("Chart type must be one of");

    expect(
      validateSqlResultVisualizationConfig({
        data: [{ label: "A", value: 1 }],
        series: [{ key: "value", label: "Value" }],
        type: "line",
        xKey: "label",
      }).issues[0]?.message,
    ).toContain("Line chart");
  });

  it("retries visualization generation up to two times with the latest validation error", async () => {
    const requestAiVisualization = vi
      .fn<(prompt: string) => Promise<string>>()
      .mockResolvedValueOnce("```json\n{")
      .mockResolvedValueOnce(
        JSON.stringify({
          config: {
            data: [{ label: "A", value: 1 }],
            series: [{ key: "value", label: "Series" }],
            type: "histogram",
            xKey: "label",
          },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          config: {
            data: [{ label: "A", value: 1 }],
            series: [{ key: "value", label: "Series" }],
            type: "bar",
            xKey: "label",
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
      "Chart type must be one of: bar, doughnut, horizontal-bar, line, pie.",
    );
    expect(result.didRetry).toBe(true);
    expect(result.config.type).toBe("bar");
    expect(result.config.series?.[0]?.key).toBe("value");
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
            data: [{ label: "A", value: 1 }],
            series: [{ key: "value", label: "Series" }],
            type: "bar",
            xKey: "label",
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
