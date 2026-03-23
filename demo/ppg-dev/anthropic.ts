import {
  buildStudioLlmOutputLimitExceededMessage,
  type StudioLlmRequest,
} from "../../data/llm";

type FetchLike = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

export const ANTHROPIC_DEMO_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
export const ANTHROPIC_MAX_TOKENS = 2048;

interface AnthropicMessageResponse {
  content?: Array<{
    text?: string;
    type?: string;
  }>;
  error?: {
    message?: string;
  };
  stop_reason?: string | null;
}

export class AnthropicOutputLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnthropicOutputLimitError";
  }
}

export async function runAnthropicLlmRequest(args: {
  apiKey: string;
  fetchImplementation?: FetchLike;
  request: StudioLlmRequest;
}): Promise<string> {
  const { apiKey, fetchImplementation = fetch, request } = args;
  const httpRequest = {
    body: JSON.stringify({
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [
        {
          content: request.prompt,
          role: "user",
        },
      ],
      model: ANTHROPIC_DEMO_MODEL,
    }),
    headers: {
      "anthropic-version": ANTHROPIC_API_VERSION,
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    method: "POST",
  } satisfies RequestInit;

  console.info("[demo][anthropic] request", {
    maxTokens: ANTHROPIC_MAX_TOKENS,
    method: httpRequest.method,
    model: ANTHROPIC_DEMO_MODEL,
    promptLength: request.prompt.length,
    task: request.task,
    url: ANTHROPIC_API_URL,
  });

  const response = await fetchImplementation(ANTHROPIC_API_URL, httpRequest);
  const payload = (await response.json()) as AnthropicMessageResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `Anthropic request failed (${response.status} ${response.statusText}).`,
    );
  }

  if (payload.stop_reason === "max_tokens") {
    throw new AnthropicOutputLimitError(
      buildStudioLlmOutputLimitExceededMessage({
        maxTokens: ANTHROPIC_MAX_TOKENS,
        provider: "Anthropic",
      }),
    );
  }

  const firstTextBlock = payload.content?.find(
    (block) => block.type === "text",
  );

  if (!firstTextBlock?.text) {
    throw new Error("Anthropic response did not include any text content.");
  }

  return firstTextBlock.text;
}
