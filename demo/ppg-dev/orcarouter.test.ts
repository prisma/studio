import { describe, expect, it, vi } from "vitest";

import {
  ORCAROUTER_DEMO_MODEL,
  ORCAROUTER_MAX_TOKENS,
  runOrcaRouterLlmRequest,
} from "./orcarouter";

type FetchLike = (
  ...args: Parameters<typeof fetch>
) => ReturnType<typeof fetch>;

describe("runOrcaRouterLlmRequest", () => {
  it("calls OrcaRouter's OpenAI-compatible endpoint and returns the first text choice", async () => {
    const fetchImplementation = vi.fn<FetchLike>(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content:
                    '{"filters":[{"column":"email","operator":"ilike","value":"%abba%"}]}',
                  role: "assistant",
                },
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    });

    const responseText = await runOrcaRouterLlmRequest({
      apiKey: "test-key",
      fetchImplementation,
      request: {
        prompt: "Filter rows where email contains abba",
        task: "table-filter",
      },
    });

    expect(responseText).toContain('"column":"email"');
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.orcarouter.ai/v1/chat/completions",
      expect.any(Object),
    );

    const requestInit = fetchImplementation.mock.calls[0]?.[1];

    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.body).toBe(
      JSON.stringify({
        max_tokens: ORCAROUTER_MAX_TOKENS,
        messages: [
          {
            content: "Filter rows where email contains abba",
            role: "user",
          },
        ],
        model: ORCAROUTER_DEMO_MODEL,
      }),
    );

    const headers = new Headers(requestInit?.headers);

    expect(headers.get("authorization")).toBe("Bearer test-key");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("logs request metadata without leaking the API key or prompt", async () => {
    const fetchImplementation = vi.fn<FetchLike>(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: '{"filters":[]}',
                  role: "assistant",
                },
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    });
    const consoleInfoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    await runOrcaRouterLlmRequest({
      apiKey: "test-key",
      fetchImplementation,
      request: {
        prompt: "Filter rows where email contains abba",
        task: "table-filter",
      },
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith("[demo][orcarouter] request", {
      maxTokens: ORCAROUTER_MAX_TOKENS,
      method: "POST",
      model: ORCAROUTER_DEMO_MODEL,
      promptLength: 37,
      task: "table-filter",
      url: "https://api.orcarouter.ai/v1/chat/completions",
    });

    consoleInfoSpy.mockRestore();
  });

  it("surfaces OrcaRouter API errors", async () => {
    const fetchImplementation = vi.fn<FetchLike>(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: "invalid api key",
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 401,
            statusText: "Unauthorized",
          },
        ),
      );
    });

    await expect(
      runOrcaRouterLlmRequest({
        apiKey: "bad-key",
        fetchImplementation,
        request: {
          prompt: "Generate a SQL query",
          task: "sql-generation",
        },
      }),
    ).rejects.toThrow("invalid api key");
  });

  it("surfaces an explicit error when OrcaRouter hits the output token limit", async () => {
    const fetchImplementation = vi.fn<FetchLike>(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "length",
                message: {
                  content: "```json\n{",
                  role: "assistant",
                },
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    });

    await expect(
      runOrcaRouterLlmRequest({
        apiKey: "test-key",
        fetchImplementation,
        request: {
          prompt: "Generate a chart",
          task: "sql-visualization",
        },
      }),
    ).rejects.toThrow(
      "OrcaRouter stopped because it reached the configured output limit of 2048 tokens before finishing the response.",
    );
  });
});
