import type { AdapterSqlLintDiagnostic } from "../adapter";
import type { ExecuteOptions, SequenceExecutor } from "../executor";
import type { Query, QueryResult } from "../query";
import type { Either } from "../type-utils";

type FetchLike = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

const bffRequestDurationByAbortSignal = new WeakMap<AbortSignal, number>();

export function consumeBffRequestDurationMsForSignal(
  abortSignal: AbortSignal,
): number | null {
  const duration = bffRequestDurationByAbortSignal.get(abortSignal);

  if (duration == null) {
    return null;
  }

  bffRequestDurationByAbortSignal.delete(abortSignal);
  return duration;
}

function recordBffRequestDuration(args: {
  abortSignal: AbortSignal | undefined;
  durationMs: number;
}): void {
  const { abortSignal, durationMs } = args;

  if (!abortSignal) {
    return;
  }

  bffRequestDurationByAbortSignal.set(abortSignal, durationMs);
}

function getBffNetworkDurationMs(args: {
  requestStartedAt: number;
  requestUrl: string;
}): number | null {
  if (typeof performance.getEntriesByType !== "function") {
    return null;
  }

  const entries = performance.getEntriesByType(
    "resource",
  ) as PerformanceEntry[];
  const normalizedRequestUrl = normalizeComparableResourceUrl(args.requestUrl);

  let bestDurationMs: number | null = null;
  let bestStartDelta = Number.POSITIVE_INFINITY;

  for (const entry of entries) {
    const fetchEntry = entry as PerformanceResourceTiming;

    if (fetchEntry.initiatorType !== "fetch") {
      continue;
    }

    if (
      !matchesComparableResourceUrl(
        normalizedRequestUrl,
        fetchEntry.name,
        args.requestUrl,
      )
    ) {
      continue;
    }

    if (fetchEntry.startTime + 1 < args.requestStartedAt) {
      continue;
    }

    const startDelta = Math.abs(fetchEntry.startTime - args.requestStartedAt);

    if (startDelta > bestStartDelta) {
      continue;
    }

    bestStartDelta = startDelta;
    bestDurationMs = Math.round(fetchEntry.duration);
  }

  return bestDurationMs;
}

function normalizeComparableResourceUrl(url: string): {
  origin: string;
  pathname: string;
} | null {
  try {
    const normalizedUrl = new URL(url);

    return {
      origin: normalizedUrl.origin,
      pathname: trimTrailingSlash(normalizedUrl.pathname),
    };
  } catch {
    return null;
  }
}

function matchesComparableResourceUrl(
  normalizedRequestUrl: {
    origin: string;
    pathname: string;
  } | null,
  candidateUrl: string,
  fallbackRequestUrl: string,
): boolean {
  if (!normalizedRequestUrl) {
    return candidateUrl === fallbackRequestUrl;
  }

  try {
    const normalizedCandidateUrl = new URL(candidateUrl);

    return (
      normalizedCandidateUrl.origin === normalizedRequestUrl.origin &&
      trimTrailingSlash(normalizedCandidateUrl.pathname) ===
        normalizedRequestUrl.pathname
    );
  } catch {
    return false;
  }
}

function trimTrailingSlash(pathname: string): string {
  if (pathname.endsWith("/") && pathname.length > 1) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

async function getBffRequestDurationMs(args: {
  requestStartedAt: number;
  responseUrl: string;
}): Promise<number> {
  const immediateDurationMs = getBffNetworkDurationMs({
    requestStartedAt: args.requestStartedAt,
    requestUrl: args.responseUrl,
  });

  if (immediateDurationMs != null) {
    return immediateDurationMs;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

  const delayedDurationMs = getBffNetworkDurationMs({
    requestStartedAt: args.requestStartedAt,
    requestUrl: args.responseUrl,
  });

  if (delayedDurationMs != null) {
    return delayedDurationMs;
  }

  return Math.round(performance.now() - args.requestStartedAt);
}

export interface StudioBFFClientProps {
  /**
   * Allows passing custom headers to the BFF.
   *
   * e.g. authorization token.
   */
  customHeaders?: Record<string, string>;

  /**
   * Allows passing custom payload to the BFF via `body.customPayload`.
   *
   * e.g. tenant id.
   */
  customPayload?: Record<string, unknown>;

  /**
   * Allows overriding the fetch function implementation.
   *
   * e.g. for testing, or older Node.js versions.
   */
  fetch?: FetchLike;

  /**
   * Function used to deserialize the results of queries.
   *
   * By default, the results are returned as is without any additional processing.
   */
  resultDeserializerFn?(this: void, results: unknown): unknown[];

  /**
   * BFF endpoint URL.
   *
   * e.g. `https://api.example.com/studio`
   */
  url: string | URL;
}

export interface StudioBFFClient extends SequenceExecutor {
  /**
   * Requests BFF to query the database.
   *
   * The query is sent as `body.query`.
   */
  execute<T>(
    this: void,
    query: Query<T>,
    options?: ExecuteOptions,
  ): Promise<Either<Error, QueryResult<Query<T>>>>;

  /**
   * Requests BFF to execute a sequence of queries.
   *
   * The sequence is sent as `body.sequence`.
   */
  executeSequence<T, S>(
    this: void,
    sequence: readonly [Query<T>, Query<S>],
    options?: ExecuteOptions,
  ): Promise<
    | [[Error]]
    | [[null, QueryResult<Query<T>>], Either<Error, QueryResult<Query<S>>>]
  >;

  /**
   * Requests BFF to execute a transactional batch of queries.
   *
   * The queries are sent as `body.queries`.
   */
  executeTransaction(
    this: void,
    queries: readonly Query<unknown>[],
    options?: ExecuteOptions,
  ): Promise<Either<Error, QueryResult<Query<unknown>>[]>>;

  /**
   * Requests BFF to lint SQL via parse/plan diagnostics.
   */
  lintSql(
    this: void,
    details: StudioBFFSqlLintDetails,
    options?: ExecuteOptions,
  ): Promise<Either<Error, StudioBFFSqlLintResult>>;
}

export type StudioBFFRequest =
  | StudioBFFQueryRequest
  | StudioBFFSequenceRequest
  | StudioBFFTransactionRequest
  | StudioBFFSqlLintRequest;

export interface StudioBFFQueryRequest {
  customPayload?: Record<string, unknown>;
  procedure: "query";
  query: Query<unknown>;
}

export interface StudioBFFSequenceRequest {
  customPayload?: Record<string, unknown>;
  procedure: "sequence";
  sequence: readonly [Query<unknown>, Query<unknown>];
}

export interface StudioBFFTransactionRequest {
  customPayload?: Record<string, unknown>;
  procedure: "transaction";
  queries: readonly Query<unknown>[];
}

export interface StudioBFFSqlLintDetails {
  schemaVersion?: string;
  sql: string;
}

export interface StudioBFFSqlLintResult {
  diagnostics: AdapterSqlLintDiagnostic[];
  schemaVersion?: string;
}

export interface StudioBFFSqlLintRequest {
  customPayload?: Record<string, unknown>;
  procedure: "sql-lint";
  schemaVersion?: string;
  sql: string;
}

/**
 * Creates a Studio BFF client. BFF stands for "Backend For Frontend" btw.
 */
export function createStudioBFFClient(
  props: StudioBFFClientProps,
): StudioBFFClient {
  const { customHeaders, customPayload, resultDeserializerFn, url } = props;
  const fetchFn = props.fetch || fetch;

  return {
    async execute(query, options) {
      try {
        const requestStartedAt = performance.now();
        const response = await fetchFn(url, {
          body: JSON.stringify({
            customPayload,
            procedure: "query",
            query,
          } satisfies StudioBFFQueryRequest),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...customHeaders,
          },
          method: "POST",
          signal: options?.abortSignal,
        });
        const requestDurationMs = await getBffRequestDurationMs({
          requestStartedAt,
          responseUrl: response.url,
        });
        recordBffRequestDuration({
          abortSignal: options?.abortSignal,
          durationMs: requestDurationMs,
        });

        if (!response.ok) {
          let errorText: string;

          try {
            errorText = await response.text();
          } catch {
            errorText = "unknown error";
          }

          return [new Error(errorText)];
        }

        const [error, results] = (await response.json()) as [
          SerializedError,
          unknown,
        ];

        if (error) {
          return [deserializeError(error)];
        }

        return [null, (resultDeserializerFn?.(results) || results) as never];
      } catch (error: unknown) {
        return [error as Error];
      }
    },

    async executeSequence(sequence, options) {
      try {
        const requestStartedAt = performance.now();
        const response = await fetchFn(url, {
          body: JSON.stringify({
            customPayload,
            procedure: "sequence",
            sequence,
          } satisfies StudioBFFSequenceRequest),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...customHeaders,
          },
          method: "POST",
          signal: options?.abortSignal,
        });
        const requestDurationMs = await getBffRequestDurationMs({
          requestStartedAt,
          responseUrl: response.url,
        });
        recordBffRequestDuration({
          abortSignal: options?.abortSignal,
          durationMs: requestDurationMs,
        });

        if (!response.ok) {
          let errorText: string;

          try {
            errorText = await response.text();
          } catch {
            errorText = "unknown error";
          }

          return [[new Error(errorText)]];
        }

        const [[firstError, firstResult], maybeSecondResult] =
          (await response.json()) as [
            [SerializedError, unknown],
            ...[SerializedError, unknown][],
          ];

        if (firstError) {
          return [[deserializeError(firstError)]];
        }

        const firstDeserializedResult = (resultDeserializerFn?.(firstResult) ||
          firstResult) as never;

        const [secondError, secondResult] = maybeSecondResult || [];

        if (secondError) {
          return [
            [null, firstDeserializedResult],
            [deserializeError(secondError)],
          ];
        }

        return [
          [null, firstDeserializedResult],
          [
            null,
            (resultDeserializerFn?.(secondResult) || secondResult) as never,
          ],
        ];
      } catch (error: unknown) {
        return [[error as Error]];
      }
    },

    async executeTransaction(queries, options) {
      try {
        const requestStartedAt = performance.now();
        const response = await fetchFn(url, {
          body: JSON.stringify({
            customPayload,
            procedure: "transaction",
            queries,
          } satisfies StudioBFFTransactionRequest),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...customHeaders,
          },
          method: "POST",
          signal: options?.abortSignal,
        });
        const requestDurationMs = await getBffRequestDurationMs({
          requestStartedAt,
          responseUrl: response.url,
        });
        recordBffRequestDuration({
          abortSignal: options?.abortSignal,
          durationMs: requestDurationMs,
        });

        if (!response.ok) {
          let errorText: string;

          try {
            errorText = await response.text();
          } catch {
            errorText = "unknown error";
          }

          return [new Error(errorText)];
        }

        const [error, results] = (await response.json()) as [
          SerializedError,
          unknown[],
        ];

        if (error) {
          return [deserializeError(error)];
        }

        const deserializedResults = (results ?? []).map((result) =>
          (resultDeserializerFn?.(result) || result) as never,
        );

        return [null, deserializedResults];
      } catch (error: unknown) {
        return [error as Error];
      }
    },

    async lintSql(details, options) {
      try {
        const requestStartedAt = performance.now();
        const response = await fetchFn(url, {
          body: JSON.stringify({
            customPayload,
            procedure: "sql-lint",
            schemaVersion: details.schemaVersion,
            sql: details.sql,
          } satisfies StudioBFFSqlLintRequest),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...customHeaders,
          },
          method: "POST",
          signal: options?.abortSignal,
        });
        const requestDurationMs = await getBffRequestDurationMs({
          requestStartedAt,
          responseUrl: response.url,
        });
        recordBffRequestDuration({
          abortSignal: options?.abortSignal,
          durationMs: requestDurationMs,
        });

        if (!response.ok) {
          let errorText: string;

          try {
            errorText = await response.text();
          } catch {
            errorText = "unknown error";
          }

          return [new Error(errorText)];
        }

        const [error, result] = (await response.json()) as [
          SerializedError,
          StudioBFFSqlLintResult,
        ];

        if (error) {
          return [deserializeError(error)];
        }

        return [null, result];
      } catch (error: unknown) {
        return [error as Error];
      }
    },
  };
}

export interface SerializedError {
  message: string;
  name: string;
  errors?: SerializedError[];
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof AggregateError) {
    const { name, message } = error;
    const errors = error.errors.map(serializeError);
    return { name, message, errors };
  }

  if (error instanceof Error) {
    const { name, message } = error;
    return { name, message };
  }

  return { name: `UnknownError`, message: JSON.stringify(error) };
}

export function deserializeError(error: SerializedError): Error {
  const { name, message } = error;

  if (error.errors !== undefined) {
    const errors = error.errors.map(deserializeError);
    const aggregateError = new AggregateError(errors, message);
    aggregateError.name = error.name;
    return aggregateError;
  }

  const regularError = new Error(error.message);
  error.name = name;
  return regularError;
}
