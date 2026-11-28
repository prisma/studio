import type { AdapterSqlLintDiagnostic } from "../adapter";
import {
  readDollarQuoteDelimiter,
  splitTopLevelSqlStatements,
} from "../sql-statements";

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

/** SQL dialect rules that change how literals and quoting are read. */
export type SqlTokenDialect = "mysql" | "postgres" | "sqlite";

export interface SqlTokenSearchOptions {
  /** Defaults to "postgres". */
  dialect?: SqlTokenDialect;
  /**
   * Also match `token` right after a `.`, as the last part of a qualified
   * name whose qualifier is quoted, such as `"main".orders`.
   */
  qualified?: boolean;
}

/**
 * Returns the index just after the quoted run that opens at `start` with
 * `quote`. A doubled quote is an escaped quote; with `backslashEscapes`, a
 * backslash escapes the next character (MySQL strings).
 */
function skipQuoted(
  sql: string,
  start: number,
  quote: string,
  backslashEscapes: boolean,
): number {
  let index = start + 1;

  while (index < sql.length) {
    const char = sql[index];

    if (backslashEscapes && char === "\\") {
      index += 2;
      continue;
    }

    if (char === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }

      return index + 1;
    }

    index += 1;
  }

  return sql.length;
}

interface MaskedSql {
  masked: string;
  /** Start and end offsets of each quoted identifier, quotes included. */
  quotedIdentifiers: Array<{ from: number; to: number }>;
}

/**
 * Replaces comments, string literals and (Postgres) dollar-quoted strings with
 * spaces, keeping offsets intact, so identifier lookups only match real SQL
 * tokens. Quoted identifiers are skipped but left visible, so comment markers
 * inside them are not read as comments and the names stay matchable. MySQL
 * reads double-quoted text as a string, so only backticks quote names there.
 */
function maskCommentsAndStrings(
  sql: string,
  dialect: SqlTokenDialect,
): MaskedSql {
  const backslashEscapes = dialect === "mysql";
  const identifierQuotes = dialect === "mysql" ? ["`"] : ['"', "`"];
  const quotedIdentifiers: MaskedSql["quotedIdentifiers"] = [];
  let masked = "";
  let index = 0;

  while (index < sql.length) {
    const char = sql[index]!;
    let end = index;
    let mask = true;

    if (sql.startsWith("--", index)) {
      const lineEnd = sql.indexOf("\n", index);
      end = lineEnd < 0 ? sql.length : lineEnd;
    } else if (sql.startsWith("/*", index)) {
      end = skipBlockComment(sql, index);
    } else if (identifierQuotes.includes(char)) {
      end = skipQuoted(sql, index, char, false);
      mask = false;
      quotedIdentifiers.push({ from: index, to: end });
    } else if (char === "'" || char === '"') {
      end = skipQuoted(sql, index, char, backslashEscapes);
    } else if (
      char === "$" &&
      dialect === "postgres" &&
      !/[\p{L}\p{N}_$]/u.test(sql[index - 1] ?? "")
    ) {
      const delimiter = readDollarQuoteDelimiter(sql, index);

      if (delimiter) {
        const close = sql.indexOf(delimiter, index + delimiter.length);
        end = close < 0 ? sql.length : close + delimiter.length;
      }
    }

    if (end > index) {
      const run = sql.slice(index, end);
      masked += mask ? run.replace(/[^\n]/g, " ") : run;
      index = end;
      continue;
    }

    masked += char;
    index += 1;
  }

  return { masked, quotedIdentifiers };
}

/**
 * Finds `token` in `sql`, ignoring comments and string literals. Word-like
 * tokens must match whole words, so "orders" does not land on "orders_archive".
 * Case-insensitive; returns the first match.
 */
export function findSqlTokenRange(
  sql: string,
  token: string,
  options: SqlTokenSearchOptions = {},
): { from: number; to: number } | null {
  if (token.length === 0) {
    return null;
  }

  const escapedToken = token.replace(
    /[.*+?^${}()|[\]\\]/g,
    (char) => `\\${char}`,
  );
  const wordBoundary = options.qualified
    ? "(?<![A-Za-z0-9_$])"
    : "(?<![A-Za-z0-9_$.])";
  const before = /^[A-Za-z0-9_$]/.test(token) ? wordBoundary : "";
  const after = /[A-Za-z0-9_$]$/.test(token) ? "(?![A-Za-z0-9_$])" : "";
  const { masked, quotedIdentifiers } = maskCommentsAndStrings(
    sql,
    options.dialect ?? "postgres",
  );
  const pattern = new RegExp(`${before}${escapedToken}${after}`, "gi");

  for (const match of masked.matchAll(pattern)) {
    const from = match.index;
    const to = from + token.length;
    // A match may contain whole quoted identifiers or be exactly one quoted
    // name, but must not start or end inside one.
    const cutsQuotedIdentifier = quotedIdentifiers.some(
      (span) =>
        from < span.to &&
        to > span.from &&
        !(from <= span.from && to >= span.to) &&
        !(from === span.from + 1 && to === span.to - 1),
    );

    if (cutsQuotedIdentifier) {
      continue;
    }

    return { from, to: Math.min(sql.length, to) };
  }

  return null;
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
