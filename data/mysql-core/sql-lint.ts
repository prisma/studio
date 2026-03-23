import type {
  Adapter,
  AdapterError,
  AdapterSqlLintDetails,
  AdapterSqlLintDiagnostic,
  AdapterSqlLintResult,
} from "../adapter";
import type { Executor } from "../executor";
import { validateSqlForLint } from "../postgres-core/sql-lint";
import { asQuery } from "../query";
import type { Either } from "../type-utils";

export function createLintDiagnosticsFromMySQLError(args: {
  error: unknown;
  positionOffset?: number;
  sql: string;
}): AdapterSqlLintDiagnostic[] {
  const { error, sql } = args;
  const positionOffset = Math.max(0, args.positionOffset ?? 0);
  const fallbackRange = getFallbackRange(sql.length);

  if (!(error instanceof Error)) {
    return [
      {
        from: fallbackRange.from + positionOffset,
        message: "SQL lint failed.",
        severity: "error",
        source: "mysql",
        to: fallbackRange.to + positionOffset,
      },
    ];
  }

  const code = getMySQLErrorCode(error);
  const inferredRange =
    inferRangeFromMessage(sql, error.message) ?? fallbackRange;

  return [
    {
      code,
      from: inferredRange.from + positionOffset,
      message: toMySQLLintMessage({ code, message: error.message }),
      severity: "error",
      source: "mysql",
      to: inferredRange.to + positionOffset,
    },
  ];
}

export async function lintMySQLWithExplainFallback(
  executor: Executor,
  details: AdapterSqlLintDetails,
  options: Parameters<NonNullable<Adapter["sqlLint"]>>[1],
): Promise<Either<AdapterError, AdapterSqlLintResult>> {
  const validation = validateSqlForLint(details.sql);

  if (!validation.ok) {
    return [
      null,
      {
        diagnostics: [validation.diagnostic],
        schemaVersion: details.schemaVersion,
      },
    ];
  }

  const diagnostics: AdapterSqlLintResult["diagnostics"] = [];

  for (const statement of validation.statements) {
    try {
      const explainQuery = asQuery<Record<string, unknown>>(
        `EXPLAIN ${statement.statement}`,
      );
      const [error] = await executor.execute(explainQuery, options);

      if (!error) {
        continue;
      }

      diagnostics.push(
        ...createLintDiagnosticsFromMySQLError({
          error,
          positionOffset: statement.from,
          sql: statement.statement,
        }),
      );
    } catch (error: unknown) {
      diagnostics.push(
        ...createLintDiagnosticsFromMySQLError({
          error,
          positionOffset: statement.from,
          sql: statement.statement,
        }),
      );
    }
  }

  return [
    null,
    {
      diagnostics,
      schemaVersion: details.schemaVersion,
    },
  ];
}

function getMySQLErrorCode(error: Error): string | undefined {
  const withCode = error as Error & { code?: unknown };
  return typeof withCode.code === "string" ? withCode.code : undefined;
}

function toMySQLLintMessage(args: { code?: string; message: string }): string {
  const { code, message } = args;

  if (
    code === "ER_QUERY_TIMEOUT" ||
    code === "ER_QUERY_INTERRUPTED" ||
    message.toLowerCase().includes("maximum statement execution time exceeded")
  ) {
    return "Lint query timed out. Simplify the statement and try again.";
  }

  return message;
}

function getFallbackRange(sqlLength: number): { from: number; to: number } {
  if (sqlLength <= 0) {
    return { from: 0, to: 0 };
  }

  return { from: 0, to: 1 };
}

function inferRangeFromMessage(
  sql: string,
  message: string,
): { from: number; to: number } | null {
  const tokenCandidates = new Set<string>();

  const quotedMatch = /'([^']+)'/.exec(message);
  if (quotedMatch?.[1]) {
    tokenCandidates.add(quotedMatch[1]);
  }

  const backtickMatch = /`([^`]+)`/.exec(message);
  if (backtickMatch?.[1]) {
    tokenCandidates.add(backtickMatch[1]);
  }

  const doubleQuotedMatch = /"([^"]+)"/.exec(message);
  if (doubleQuotedMatch?.[1]) {
    tokenCandidates.add(doubleQuotedMatch[1]);
  }

  const missingTableMatch = /table\s+'([^']+)'\s+doesn't exist/i.exec(message);
  if (missingTableMatch?.[1]) {
    tokenCandidates.add(missingTableMatch[1]);
  }

  const lowerSql = sql.toLowerCase();

  for (const token of tokenCandidates) {
    const normalizedToken = token.toLowerCase();
    const directIndex = lowerSql.indexOf(normalizedToken);

    if (directIndex >= 0) {
      return {
        from: directIndex,
        to: Math.min(sql.length, directIndex + token.length),
      };
    }

    const splitToken = normalizedToken.split(".").at(-1);

    if (!splitToken) {
      continue;
    }

    const splitIndex = lowerSql.indexOf(splitToken);

    if (splitIndex >= 0) {
      return {
        from: splitIndex,
        to: Math.min(sql.length, splitIndex + splitToken.length),
      };
    }
  }

  return null;
}
