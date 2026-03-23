const LEGACY_OUTPUT_LIMIT_SIGNAL_PREFIX = "__PRISMA_STUDIO_AI_OUTPUT_LIMIT__:";

export const STUDIO_LLM_TASKS = [
  "table-filter",
  "sql-generation",
  "sql-visualization",
] as const;

export type StudioLlmTask = (typeof STUDIO_LLM_TASKS)[number];

export const STUDIO_LLM_ERROR_CODES = [
  "cancelled",
  "not-configured",
  "output-limit-exceeded",
  "request-failed",
] as const;

export type StudioLlmErrorCode = (typeof STUDIO_LLM_ERROR_CODES)[number];

export interface StudioLlmRequest {
  prompt: string;
  task: StudioLlmTask;
}

export interface StudioLlmSuccessResponse {
  ok: true;
  text: string;
}

export interface StudioLlmErrorResponse {
  code: StudioLlmErrorCode;
  message: string;
  ok: false;
}

export type StudioLlmResponse =
  | StudioLlmSuccessResponse
  | StudioLlmErrorResponse;

export type StudioLlm = (
  request: StudioLlmRequest,
) => Promise<StudioLlmResponse>;

export class StudioLlmError extends Error {
  code: StudioLlmErrorCode;

  constructor(args: { code: StudioLlmErrorCode; message: string }) {
    super(args.message);
    this.name = "StudioLlmError";
    this.code = args.code;
  }
}

export function buildStudioLlmOutputLimitExceededMessage(args: {
  maxTokens: number;
  provider: string;
}): string {
  const { maxTokens, provider } = args;

  return `${provider} stopped because it reached the configured output limit of ${maxTokens} tokens before finishing the response.`;
}

export function isStudioLlmResponse(
  value: unknown,
): value is StudioLlmResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as Partial<StudioLlmResponse>;

  if (response.ok === true) {
    return typeof response.text === "string";
  }

  return (
    response.ok === false &&
    typeof response.message === "string" &&
    typeof response.code === "string" &&
    STUDIO_LLM_ERROR_CODES.includes(response.code as StudioLlmErrorCode)
  );
}

export function readStudioLlmOutputLimitExceededMessage(
  value: unknown,
): string | null {
  if (
    value instanceof StudioLlmError &&
    value.code === "output-limit-exceeded"
  ) {
    return value.message.trim();
  }

  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : null;

  if (!message?.startsWith(LEGACY_OUTPUT_LIMIT_SIGNAL_PREFIX)) {
    return null;
  }

  return message.slice(LEGACY_OUTPUT_LIMIT_SIGNAL_PREFIX.length).trim();
}
