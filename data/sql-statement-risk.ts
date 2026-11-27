import { splitTopLevelSqlStatements } from "./sql-statements";

/**
 * How risky running a SQL statement is.
 *
 * - `safe`: only reads data (SELECT, EXPLAIN, SHOW, ...).
 * - `write`: changes data or schema in a targeted way.
 * - `danger`: removes data broadly (DELETE/UPDATE without WHERE, DROP,
 *   TRUNCATE, ALTER ... DROP COLUMN).
 * - `unknown`: Studio cannot tell, so callers should treat it as a write.
 */
export type SqlStatementRiskKind = "safe" | "write" | "danger" | "unknown";

export interface SqlStatementRisk {
  kind: SqlStatementRiskKind;
  reason?: "no-where";
  /** Upper-case statement type, for example `DELETE` or `DROP TABLE`. */
  statementType: string | null;
  /** Name of the affected table or object, unquoted, or `null` if unclear. */
  target: string | null;
}

interface SqlToken {
  depth: number;
  kind: "identifier" | "string" | "symbol" | "word";
  upper: string;
  value: string;
}

const RISK_ORDER: Record<SqlStatementRiskKind, number> = {
  danger: 3,
  safe: 0,
  unknown: 2,
  write: 1,
};

const READ_ONLY_KEYWORDS = new Set([
  "DESC",
  "DESCRIBE",
  "SHOW",
  "TABLE",
  "VALUES",
]);

const WRITE_KEYWORDS = new Set([
  "CLUSTER",
  "COMMENT",
  "COPY",
  "CREATE",
  "GRANT",
  "LOAD",
  "MERGE",
  "REFRESH",
  "REINDEX",
  "RENAME",
  "REVOKE",
  "VACUUM",
]);

const WITH_MAIN_KEYWORDS = new Set([
  "DELETE",
  "INSERT",
  "MERGE",
  "SELECT",
  "TABLE",
  "UPDATE",
  "VALUES",
]);

const DATA_MODIFYING_KEYWORDS = new Set([
  "DELETE",
  "INSERT",
  "MERGE",
  "UPDATE",
]);

const NAME_MODIFIERS = new Set([
  "CONCURRENTLY",
  "DELAYED",
  "EXISTS",
  "HIGH_PRIORITY",
  "IF",
  "IGNORE",
  "LOW_PRIORITY",
  "ONLY",
  "QUICK",
]);

const ALTER_DROP_NON_DATA_TARGETS = new Set([
  "CHECK",
  "CONSTRAINT",
  "DEFAULT",
  "EXPRESSION",
  "FOREIGN",
  "IDENTITY",
  "INDEX",
  "KEY",
  "NOT",
  "PRIMARY",
  "TRIGGER",
]);

/**
 * Conservatively classifies what running `sql` would do. It understands
 * comments, string literals, quoted identifiers and parentheses, but it is not
 * a SQL parser: anything it does not recognise is `unknown`.
 *
 * When `sql` holds several statements, the riskiest one wins.
 */
export function classifySqlStatement(sql: string): SqlStatementRisk {
  const statements = splitTopLevelSqlStatements(sql);
  let riskiest: SqlStatementRisk | null = null;

  for (const { statement } of statements) {
    const risk = classifyTokens(tokenizeSql(statement));

    if (!riskiest || RISK_ORDER[risk.kind] > RISK_ORDER[riskiest.kind]) {
      riskiest = risk;
    }
  }

  return riskiest ?? unknown(null);
}

function classifyTokens(tokens: SqlToken[]): SqlStatementRisk {
  const first = tokens[0];

  if (!first || first.kind !== "word" || first.depth !== 0) {
    return unknown(null);
  }

  const keyword = first.upper;
  const hasTopLevelWord = (word: string) =>
    tokens.some((token) => isWord(token, word) && token.depth === 0);

  switch (keyword) {
    case "SELECT":
      return hasTopLevelWord("INTO")
        ? write("SELECT INTO", null)
        : safe(keyword);
    case "PRAGMA":
      return tokens.some(
        (token) => token.kind === "symbol" && token.value === "=",
      )
        ? write(keyword, null)
        : safe(keyword);
    case "EXPLAIN":
      return classifyExplain(tokens);
    case "WITH":
      return classifyWith(tokens);
    case "DELETE": {
      let index = skipModifiers(tokens, 1);
      index = isWord(tokens[index], "FROM") ? index + 1 : -1;
      const target =
        index < 0 ? null : readName(tokens, skipModifiers(tokens, index));

      return hasTopLevelWord("WHERE")
        ? write(keyword, target)
        : {
            kind: "danger",
            reason: "no-where",
            statementType: keyword,
            target,
          };
    }
    case "UPDATE": {
      const target = readName(tokens, skipModifiers(tokens, 1));

      return hasTopLevelWord("WHERE")
        ? write(keyword, target)
        : {
            kind: "danger",
            reason: "no-where",
            statementType: keyword,
            target,
          };
    }
    case "INSERT":
    case "REPLACE": {
      let index = skipModifiers(tokens, 1);

      if (isWord(tokens[index], "OR")) {
        index += 2;
      }

      index = isWord(tokens[index], "INTO") ? index + 1 : index;
      return write(keyword, readName(tokens, index));
    }
    case "DROP": {
      let index = 1;
      const kindWords: string[] = [];

      if (
        isWord(tokens[index], "MATERIALIZED") ||
        isWord(tokens[index], "FOREIGN")
      ) {
        kindWords.push(tokens[index]!.upper);
        index += 1;
      }

      if (tokens[index]?.kind === "word") {
        kindWords.push(tokens[index]!.upper);
        index += 1;
      }

      return {
        kind: "danger",
        statementType: ["DROP", ...kindWords].join(" "),
        target: readName(tokens, skipModifiers(tokens, index)),
      };
    }
    case "TRUNCATE": {
      const index = isWord(tokens[1], "TABLE") ? 2 : 1;

      return {
        kind: "danger",
        statementType: keyword,
        target: readName(tokens, skipModifiers(tokens, index)),
      };
    }
    case "ALTER": {
      if (!isWord(tokens[1], "TABLE")) {
        return write(keyword, null);
      }

      const target = readName(tokens, skipModifiers(tokens, 2));

      return dropsTableData(tokens)
        ? { kind: "danger", statementType: keyword, target }
        : write(keyword, target);
    }
    default:
      if (READ_ONLY_KEYWORDS.has(keyword)) {
        return safe(keyword);
      }

      if (WRITE_KEYWORDS.has(keyword)) {
        return write(keyword, null);
      }

      return unknown(keyword);
  }
}

function classifyExplain(tokens: SqlToken[]): SqlStatementRisk {
  let index = 1;
  let analyzes = false;

  if (tokens[index]?.kind === "symbol" && tokens[index]!.value === "(") {
    index += 1;

    while (index < tokens.length && tokens[index]!.depth > 0) {
      analyzes ||=
        isWord(tokens[index], "ANALYZE") || isWord(tokens[index], "ANALYSE");
      index += 1;
    }

    // Skip the closing parenthesis.
    index += 1;
  }

  while (
    isWord(tokens[index], "ANALYZE") ||
    isWord(tokens[index], "ANALYSE") ||
    isWord(tokens[index], "VERBOSE")
  ) {
    analyzes ||= !isWord(tokens[index], "VERBOSE");
    index += 1;
  }

  // EXPLAIN ANALYZE executes the statement it explains.
  return analyzes ? classifyTokens(tokens.slice(index)) : safe("EXPLAIN");
}

function classifyWith(tokens: SqlToken[]): SqlStatementRisk {
  const hasDataModifyingCte = tokens.some((token, index) => {
    const previous = tokens[index - 1];

    return (
      token.depth > 0 &&
      token.kind === "word" &&
      DATA_MODIFYING_KEYWORDS.has(token.upper) &&
      previous?.kind === "symbol" &&
      previous.value === "("
    );
  });

  if (hasDataModifyingCte) {
    return unknown("WITH");
  }

  const mainIndex = tokens.findIndex((token, index) => {
    return (
      index > 0 &&
      token.depth === 0 &&
      token.kind === "word" &&
      WITH_MAIN_KEYWORDS.has(token.upper)
    );
  });

  return mainIndex < 0
    ? unknown("WITH")
    : classifyTokens(tokens.slice(mainIndex));
}

function dropsTableData(tokens: SqlToken[]): boolean {
  return tokens.some((token, index) => {
    if (token.depth !== 0 || !isWord(token, "DROP")) {
      return false;
    }

    const next = tokens[index + 1];

    return (
      next?.kind !== "word" || !ALTER_DROP_NON_DATA_TARGETS.has(next.upper)
    );
  });
}

function skipModifiers(tokens: SqlToken[], start: number): number {
  let index = start;

  while (
    tokens[index]?.kind === "word" &&
    NAME_MODIFIERS.has(tokens[index]!.upper)
  ) {
    index += 1;
  }

  return index;
}

function readName(tokens: SqlToken[], start: number): string | null {
  const parts: string[] = [];

  for (let index = start; index < tokens.length; index += 2) {
    const token = tokens[index]!;

    if (token.kind !== "word" && token.kind !== "identifier") {
      return null;
    }

    parts.push(token.value);
    const separator = tokens[index + 1];

    if (separator?.kind !== "symbol" || separator.value !== ".") {
      return parts.join(".");
    }
  }

  return null;
}

function isWord(token: SqlToken | undefined, word: string): boolean {
  return token?.kind === "word" && token.upper === word;
}

function safe(statementType: string): SqlStatementRisk {
  return { kind: "safe", statementType, target: null };
}

function write(statementType: string, target: string | null): SqlStatementRisk {
  return { kind: "write", statementType, target };
}

function unknown(statementType: string | null): SqlStatementRisk {
  return { kind: "unknown", statementType, target: null };
}

/**
 * Splits one statement into tokens, dropping whitespace and comments. String
 * literal contents are kept opaque so keywords inside them never count.
 */
function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let depth = 0;
  let index = 0;

  const push = (kind: SqlToken["kind"], value: string) => {
    tokens.push({ depth, kind, upper: value.toUpperCase(), value });
  };

  while (index < sql.length) {
    const char = sql[index]!;
    const next = sql[index + 1];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      const end = sql.indexOf("\n", index);
      index = end < 0 ? sql.length : end + 1;
      continue;
    }

    if (char === "/" && next === "*") {
      index = skipBlockComment(sql, index);
      continue;
    }

    if (char === "'") {
      const end = findClosingQuote(sql, index, "'");
      push("string", sql.slice(index + 1, end));
      index = end + 1;
      continue;
    }

    if (char === '"' || char === "`") {
      const end = findClosingQuote(sql, index, char);
      push(
        "identifier",
        sql.slice(index + 1, end).replaceAll(char + char, char),
      );
      index = end + 1;
      continue;
    }

    if (char === "$") {
      const delimiter = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(
        sql.slice(index),
      )?.[0];

      if (delimiter) {
        const end = sql.indexOf(delimiter, index + delimiter.length);
        const stop = end < 0 ? sql.length : end;
        push("string", sql.slice(index + delimiter.length, stop));
        index = end < 0 ? sql.length : end + delimiter.length;
        continue;
      }
    }

    const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(index))?.[0];

    if (word) {
      push("word", word);
      index += word.length;
      continue;
    }

    if (char === "(") {
      push("symbol", char);
      depth += 1;
      index += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      push("symbol", char);
      index += 1;
      continue;
    }

    push("symbol", char);
    index += 1;
  }

  return tokens;
}

function skipBlockComment(sql: string, start: number): number {
  let depth = 0;
  let index = start;

  while (index < sql.length) {
    if (sql[index] === "/" && sql[index + 1] === "*") {
      depth += 1;
      index += 2;
      continue;
    }

    if (sql[index] === "*" && sql[index + 1] === "/") {
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

function findClosingQuote(sql: string, start: number, quote: string): number {
  let index = start + 1;

  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }

      return index;
    }

    index += 1;
  }

  return sql.length;
}
