import type { AdapterSqlLintDiagnostic } from "../adapter";
import { splitTopLevelSqlStatements } from "../sql-statements";

const BYTES_PER_KILOBYTE = 1024;

/** Prefix the Postgres lint paths put in front of each statement. */
export const SQL_LINT_EXPLAIN_PREFIX = "EXPLAIN (FORMAT JSON) ";

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

  // Leading comments are not part of the statement: skip them so the keyword
  // check and any fallback diagnostic land on the statement itself, and drop
  // segments that hold only comments (for example a note after the last `;`).
  const statements = splitTopLevelSqlStatements(sql).flatMap((segment) => {
    const skip = getLeadingTriviaLength(segment.statement);

    if (skip >= segment.statement.length) {
      return [];
    }

    return [
      {
        ...segment,
        from: segment.from + skip,
        statement: segment.statement.slice(skip),
      },
    ];
  });

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

/**
 * Maps a Postgres error to an editor diagnostic.
 *
 * `sql` is the statement that was linted and `positionOffset` is where it
 * starts in the editor. Postgres reports positions within the query it
 * received, so pass `queryPrefixLength` when the statement was sent wrapped
 * (for example after `EXPLAIN (FORMAT JSON) `).
 */
export function createLintDiagnosticsFromPostgresError(args: {
  error: unknown;
  positionOffset?: number;
  queryPrefixLength?: number;
  sql: string;
}): AdapterSqlLintDiagnostic[] {
  const { error, sql } = args;
  const positionOffset = Math.max(0, args.positionOffset ?? 0);
  const queryPrefixLength = Math.max(0, args.queryPrefixLength ?? 0);
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
    position: toStatementPosition(
      getPostgresErrorPosition(error),
      queryPrefixLength,
    ),
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

function toStatementPosition(
  position: number | undefined,
  queryPrefixLength: number,
): number | undefined {
  if (position == null) {
    return undefined;
  }

  const statementPosition = position - queryPrefixLength;

  // A position inside the prefix cannot be mapped onto the user's SQL.
  return statementPosition >= 1 ? statementPosition : undefined;
}

/**
 * Length of the whitespace and comments at the start of `sql`.
 */
function getLeadingTriviaLength(sql: string): number {
  let index = 0;

  while (index < sql.length) {
    if (/\s/.test(sql[index]!)) {
      index += 1;
      continue;
    }

    if (sql.startsWith("--", index)) {
      const lineEnd = sql.indexOf("\n", index);
      index = lineEnd < 0 ? sql.length : lineEnd + 1;
      continue;
    }

    if (sql.startsWith("/*", index)) {
      index = skipBlockComment(sql, index);
      continue;
    }

    break;
  }

  return index;
}

/**
 * Returns the index just after the (possibly nested) block comment at `start`.
 */
function skipBlockComment(sql: string, start: number): number {
  let depth = 0;
  let index = start;

  while (index < sql.length) {
    if (sql.startsWith("/*", index)) {
      depth += 1;
      index += 2;
      continue;
    }

    if (sql.startsWith("*/", index)) {
      depth -= 1;
      index += 2;

      if (depth === 0) {
        return index;
      }

      continue;
    }

    index += 1;
  }

  return sql.length;
}

/**
 * Replaces comments and string literals with spaces, keeping offsets intact,
 * so identifier lookups only match real SQL tokens.
 */
function maskCommentsAndStrings(sql: string): string {
  let masked = "";
  let index = 0;

  while (index < sql.length) {
    let end = index;

    if (sql.startsWith("--", index)) {
      const lineEnd = sql.indexOf("\n", index);
      end = lineEnd < 0 ? sql.length : lineEnd;
    } else if (sql.startsWith("/*", index)) {
      end = skipBlockComment(sql, index);
    } else if (sql[index] === "'") {
      end = index + 1;

      while (end < sql.length) {
        if (sql[end] === "'" && sql[end + 1] === "'") {
          end += 2;
          continue;
        }

        if (sql[end] === "'") {
          end += 1;
          break;
        }

        end += 1;
      }
    }

    if (end > index) {
      masked += sql.slice(index, end).replace(/[^\n]/g, " ");
      index = end;
      continue;
    }

    masked += sql[index];
    index += 1;
  }

  return masked;
}

/**
 * Finds `token` in `sql`, ignoring comments and string literals. Word-like
 * tokens must match whole words, so "orders" does not land on "orders_archive".
 * Case-insensitive; returns the first match.
 */
export function findSqlTokenRange(
  sql: string,
  token: string,
): { from: number; to: number } | null {
  if (token.length === 0) {
    return null;
  }

  const escapedToken = token.replace(
    /[.*+?^${}()|[\]\\]/g,
    (char) => `\\${char}`,
  );
  const before = /^[A-Za-z0-9_$]/.test(token) ? "(?<![A-Za-z0-9_$.])" : "";
  const after = /[A-Za-z0-9_$]$/.test(token) ? "(?![A-Za-z0-9_$])" : "";
  const match = new RegExp(`${before}${escapedToken}${after}`, "i").exec(
    maskCommentsAndStrings(sql),
  );

  if (!match) {
    return null;
  }

  return {
    from: match.index,
    to: Math.min(sql.length, match.index + token.length),
  };
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

  return { from, to: from + getTokenLengthAt(sql, from) };
}

const IDENTIFIER_PART = String.raw`(?:"(?:[^"]|"")*"|[A-Za-z0-9_$]+)`;
const IDENTIFIER_AT_POSITION = new RegExp(
  `${IDENTIFIER_PART}(?:\\.${IDENTIFIER_PART})*`,
  "y",
);

/**
 * Length of the (possibly qualified) identifier or word at `from`, or 1.
 */
function getTokenLengthAt(sql: string, from: number): number {
  IDENTIFIER_AT_POSITION.lastIndex = from;
  const match = IDENTIFIER_AT_POSITION.exec(sql);

  return match ? match[0].length : 1;
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

  return findSqlTokenRange(sql, token);
}
