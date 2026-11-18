import {
  buildStudioLlmOutputLimitExceededMessage,
  type StudioLlmRequest,
} from "../../data/llm";

type FetchLike = (
  ...args: Parameters<typeof fetch>
) => ReturnType<typeof fetch>;

export const ORCAROUTER_DEMO_MODEL = "orcarouter/auto";
const ORCAROUTER_API_URL = "https://api.orcarouter.ai/v1/chat/completions";
export const ORCAROUTER_MAX_TOKENS = 2048;

interface OrcaRouterChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      role?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class OrcaRouterOutputLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrcaRouterOutputLimitError";
  }
}

export async function runOrcaRouterLlmRequest(args: {
  apiKey: string;
  fetchImplementation?: FetchLike;
  request: StudioLlmRequest;
}): Promise<string> {
  const { apiKey, fetchImplementation = fetch, request } = args;
  const httpRequest = {
    body: JSON.stringify({
      max_tokens: ORCAROUTER_MAX_TOKENS,
      messages: [
        {
          content: request.prompt,
          role: "user",
        },
      ],
      model: ORCAROUTER_DEMO_MODEL,
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  } satisfies RequestInit;

  console.info("[demo][orcarouter] request", {
    maxTokens: ORCAROUTER_MAX_TOKENS,
    method: httpRequest.method,
    model: ORCAROUTER_DEMO_MODEL,
    promptLength: request.prompt.length,
    task: request.task,
    url: ORCAROUTER_API_URL,
  });

  const response = await fetchImplementation(ORCAROUTER_API_URL, httpRequest);
  const payload = (await response.json()) as OrcaRouterChatCompletionResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `OrcaRouter request failed (${response.status} ${response.statusText}).`,
    );
  }

  if (payload.choices?.[0]?.finish_reason === "length") {
    throw new OrcaRouterOutputLimitError(
      buildStudioLlmOutputLimitExceededMessage({
        maxTokens: ORCAROUTER_MAX_TOKENS,
        provider: "OrcaRouter",
      }),
    );
  }

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OrcaRouter response did not include any text content.");
  }

  return content;
}
