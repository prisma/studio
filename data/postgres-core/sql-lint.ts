import type { AdapterSqlLintDiagnostic } from "../adapter";
import { splitTopLevelSqlStatements } from "../sql-statements";

const BYTES_PER_KILOBYTE = 1024;

export const SQL_LINT_MAX_LENGTH = 50 * BYTES_PER_KILOBYTE;
export const SQL_LINT_ALLOWED_STATEMENT_KEYWORDS = new Set([
  "delete",
  "insert",
  "select",
  "update",
  "values",
  "with",
]);

export interface SqlLintValidatedStatement {
  from: number;
  statement: string;
  to: number;
}

export type SqlLintValidationResult =
  | { ok: true; statements: SqlLintValidatedStatement[] }
  | { diagnostic: AdapterSqlLintDiagnostic; ok: false };

export function validateSqlForLint(sql: string): SqlLintValidationResult {
  const normalizedSql = sql.trim();

  if (normalizedSql.length === 0) {
    return {
      diagnostic: {
        from: 0,
        message: "Type a SQL statement to lint.",
        severity: "info",
        to: 0,
      },
      ok: false,
    };
  }

  if (normalizedSql.length > SQL_LINT_MAX_LENGTH) {
    return {
      diagnostic: {
        from: 0,
        message: `SQL lint limit exceeded (${SQL_LINT_MAX_LENGTH} characters).`,
        severity: "error",
        to: Math.min(1, normalizedSql.length),
      },
      ok: false,
    };
  }

  const statements = splitTopLevelSqlStatements(sql);

  if (statements.length === 0) {
    return {
      diagnostic: {
        from: 0,
        message: "Type a SQL statement to lint.",
        severity: "info",
        to: 0,
      },
      ok: false,
    };
  }

  for (const statement of statements) {
    const firstKeyword = getStatementFirstKeyword(statement.statement);

    if (
      !firstKeyword ||
      !SQL_LINT_ALLOWED_STATEMENT_KEYWORDS.has(firstKeyword)
    ) {
      return {
        diagnostic: {
          from: statement.from,
          message:
            "SQL lint supports SELECT, WITH, VALUES, INSERT, UPDATE, and DELETE statements.",
          severity: "error",
          to: Math.min(sql.length, statement.from + 1),
        },
        ok: false,
      };
    }
  }

  return { ok: true, statements };
}

export function createLintDiagnosticsFromPostgresError(args: {
  error: unknown;
  positionOffset?: number;
  sql: string;
}): AdapterSqlLintDiagnostic[] {
  const { error, sql } = args;
  const positionOffset = Math.max(0, args.positionOffset ?? 0);
  const fallbackRange = getDiagnosticRange({
    sql,
    position: undefined,
    sqlLength: sql.length,
  });

  if (!(error instanceof Error)) {
    return [
      {
        from: fallbackRange.from,
        message: "SQL lint failed.",
        severity: "error",
        source: "postgres",
        to: fallbackRange.to,
      },
    ];
  }

  const code = getPostgresErrorCode(error);
  const severity = getPostgresErrorSeverity(error);
  const { from, to } = getDiagnosticRange({
    message: error.message,
    position: getPostgresErrorPosition(error),
    sql,
    sqlLength: sql.length,
  });

  const message =
    code === "57014"
      ? "Lint query timed out. Simplify the statement and try again."
      : error.message;

  return [
    {
      code,
      from: from + positionOffset,
      message,
      severity,
      source: "postgres",
      to: to + positionOffset,
    },
  ];
}

function getStatementFirstKeyword(statement: string): string | null {
  const match = /^\s*([A-Za-z_]+)/.exec(statement);
  return match?.[1]?.toLowerCase() ?? null;
}

function getPostgresErrorCode(error: Error): string | undefined {
  const withCode = error as Error & { code?: unknown };
  return typeof withCode.code === "string" ? withCode.code : undefined;
}

function getPostgresErrorPosition(error: Error): number | undefined {
  const withPosition = error as Error & { position?: unknown };
  const { position } = withPosition;

  if (typeof position === "number" && Number.isFinite(position)) {
    return position;
  }

  if (typeof position === "string") {
    const parsed = Number.parseInt(position, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getPostgresErrorSeverity(
  error: Error,
): AdapterSqlLintDiagnostic["severity"] {
  const withSeverity = error as Error & { severity?: unknown };
  return withSeverity.severity === "WARNING" ? "warning" : "error";
}

function getDiagnosticRange(args: {
  message?: string;
  position: number | undefined;
  sql: string;
  sqlLength: number;
}): { from: number; to: number } {
  const { message, position, sql, sqlLength } = args;

  if (position == null && message) {
    const inferredRange = inferRangeFromMessage(sql, message);

    if (inferredRange) {
      return inferredRange;
    }
  }

  const maxFrom = Math.max(sqlLength - 1, 0);
  const from = Math.min(
    maxFrom,
    Math.max(0, (Number.isFinite(position) ? (position as number) : 1) - 1),
  );

  if (sqlLength === 0) {
    return { from: 0, to: 0 };
  }

  return { from, to: Math.max(from + 1, from) };
}

function inferRangeFromMessage(
  sql: string,
  message: string,
): { from: number; to: number } | null {
  const quotedTokenMatch = /"([^"]+)"/.exec(message);
  const token = quotedTokenMatch?.[1];

  if (!token) {
    return null;
  }

  const lowerSql = sql.toLowerCase();
  const lowerToken = token.toLowerCase();
  const from = lowerSql.indexOf(lowerToken);

  if (from < 0) {
    return null;
  }

  return {
    from,
    to: Math.min(sql.length, from + token.length),
  };
}
