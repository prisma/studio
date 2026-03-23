import { readStudioLlmOutputLimitExceededMessage } from "@/data/llm";

export interface AiJsonResponseIssue {
  message: string;
}

export interface ValidatedAiJsonResponse<TValue> {
  correctionCount: number;
  didRetry: boolean;
  responseText: string;
  value: TValue;
}

export function normalizeAiJsonResponseText(responseText: string): string {
  const trimmedResponseText = responseText.trim();
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(
    trimmedResponseText,
  );

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return trimmedResponseText;
}

export async function requestValidatedAiJsonResponse<
  TValue,
  TIssue extends AiJsonResponseIssue,
>(args: {
  requestAiText: (input: string) => Promise<string>;
  buildRetryPrompt: (args: {
    correctionCount: number;
    issues: TIssue[];
    responseText: string;
  }) => string;
  createRetryIssueFromError?: (args: {
    error: unknown;
    message: string;
    responseText: string;
  }) => TIssue | null;
  invalidResponseMessage: string;
  maxCorrectionRetries?: number;
  parseResponse: (responseText: string) => {
    issues: TIssue[];
    value: TValue | null;
  };
  prompt: string;
}): Promise<ValidatedAiJsonResponse<TValue>> {
  const {
    requestAiText,
    buildRetryPrompt,
    createRetryIssueFromError,
    invalidResponseMessage,
    maxCorrectionRetries = 1,
    parseResponse,
    prompt,
  } = args;
  let responseText = "";
  let promptToSend = prompt;

  for (
    let correctionCount = 0;
    correctionCount <= maxCorrectionRetries;
    correctionCount += 1
  ) {
    try {
      responseText = await requestAiText(promptToSend);
    } catch (error) {
      const outputLimitMessage = readStudioLlmOutputLimitExceededMessage(error);

      if (!outputLimitMessage) {
        throw error;
      }

      const issue =
        createRetryIssueFromError?.({
          error,
          message: outputLimitMessage,
          responseText: outputLimitMessage,
        }) ?? null;

      if (!issue) {
        throw new Error(outputLimitMessage);
      }

      if (correctionCount >= maxCorrectionRetries) {
        throw new Error(issue.message);
      }

      responseText = outputLimitMessage;
      promptToSend = buildRetryPrompt({
        correctionCount: correctionCount + 1,
        issues: [issue],
        responseText,
      });
      continue;
    }

    const result = parseResponse(responseText);

    if (result.issues.length === 0 && result.value !== null) {
      return {
        correctionCount,
        didRetry: correctionCount > 0,
        responseText,
        value: result.value,
      };
    }

    if (correctionCount >= maxCorrectionRetries) {
      throw new Error(
        result.issues[0]?.message ?? invalidResponseMessage,
      );
    }

    promptToSend = buildRetryPrompt({
      correctionCount: correctionCount + 1,
      issues: result.issues,
      responseText,
    });
  }

  throw new Error(invalidResponseMessage);
}
