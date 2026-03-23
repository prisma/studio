import type { Query, QueryResult } from "./query";
import type { Either } from "./type-utils";

export interface Executor {
  execute<T>(
    query: Query<T>,
    options?: ExecuteOptions,
  ): Promise<Either<Error, QueryResult<Query<T>>>>;

  executeTransaction?(
    queries: readonly Query<unknown>[],
    options?: ExecuteOptions,
  ): Promise<Either<Error, QueryResult<Query<unknown>>[]>>;

  /**
   * Optional SQL lint transport for parse/plan diagnostics.
   *
   * Executors that do not implement this capability can still be used by
   * adapters with fallback lint strategies.
   */
  lintSql?(
    details: SqlLintDetails,
    options?: ExecuteOptions,
  ): Promise<Either<Error, SqlLintResult>>;
}

export interface SequenceExecutor extends Executor {
  executeSequence<T, S>(
    sequence: readonly [Query<T>, Query<S>],
    options?: ExecuteOptions,
  ): Promise<
    | [[Error]]
    | [[null, QueryResult<Query<T>>], Either<Error, QueryResult<Query<S>>>]
  >;
}

export interface ExecuteOptions {
  abortSignal?: AbortSignal;
}

export interface SqlLintDetails {
  schemaVersion?: string;
  sql: string;
}

export interface SqlLintDiagnostic {
  code?: string;
  from: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
  to: number;
}

export interface SqlLintResult {
  diagnostics: SqlLintDiagnostic[];
  schemaVersion?: string;
}

export class AbortError extends Error {
  constructor() {
    super("This operation was aborted");
    this.name = "AbortError";
  }
}

export function getAbortResult(): [AbortError] {
  return [new AbortError()];
}
