import { describe, expect, it, vi } from "vitest";

import {
  ANTHROPIC_DEMO_MODEL,
  ANTHROPIC_MAX_TOKENS,
  runAnthropicLlmRequest,
} from "./anthropic";

type FetchLike = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

describe("runAnthropicLlmRequest", () => {
  it("calls Anthropic's Messages API directly and returns the first text block", async () => {
    const fetchImplementation = vi.fn<FetchLike>(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: [
              {
                text: '{"filters":[{"column":"email","operator":"ilike","value":"%abba%"}]}',
                type: "text",
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

    const responseText = await runAnthropicLlmRequest({
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
      "https://api.anthropic.com/v1/messages",
      expect.any(Object),
    );

    const requestInit = fetchImplementation.mock.calls[0]?.[1];

    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.body).toBe(
      JSON.stringify({
        max_tokens: ANTHROPIC_MAX_TOKENS,
        messages: [
          {
            content: "Filter rows where email contains abba",
            role: "user",
          },
        ],
        model: ANTHROPIC_DEMO_MODEL,
      }),
    );

    const headers = new Headers(requestInit?.headers);

    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-api-key")).toBe("test-key");
  });

  it("logs request metadata without leaking the API key or prompt", async () => {
    const fetchImplementation = vi.fn<FetchLike>(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: [
              {
                text: '{"filters":[]}',
                type: "text",
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

    await runAnthropicLlmRequest({
      apiKey: "test-key",
      fetchImplementation,
      request: {
        prompt: "Filter rows where email contains abba",
        task: "table-filter",
      },
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith("[demo][anthropic] request", {
      maxTokens: ANTHROPIC_MAX_TOKENS,
      method: "POST",
      model: ANTHROPIC_DEMO_MODEL,
      promptLength: 37,
      task: "table-filter",
      url: "https://api.anthropic.com/v1/messages",
    });

    consoleInfoSpy.mockRestore();
  });

  it("surfaces Anthropic API errors", async () => {
    const fetchImplementation = vi.fn<FetchLike>(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: "invalid x-api-key",
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
      runAnthropicLlmRequest({
        apiKey: "bad-key",
        fetchImplementation,
        request: {
          prompt: "Generate a SQL query",
          task: "sql-generation",
        },
      }),
    ).rejects.toThrow("invalid x-api-key");
  });

  it("surfaces an explicit error when Anthropic hits the output token limit", async () => {
    const fetchImplementation = vi.fn<FetchLike>(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: [
              {
                text: "```json\n{",
                type: "text",
              },
            ],
            stop_reason: "max_tokens",
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
      runAnthropicLlmRequest({
        apiKey: "test-key",
        fetchImplementation,
        request: {
          prompt: "Generate a chart",
          task: "sql-visualization",
        },
      }),
    ).rejects.toThrow(
      "Anthropic stopped because it reached the configured output limit of 2048 tokens before finishing the response.",
    );
  });
});
