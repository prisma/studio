import type { AdapterSqlLintResult, SqlEditorDialect, Table } from "@/data";
import type { Either } from "@/data";

import { normalizeSqlWhereClause } from "../../../../lib/sql-filter";

export function buildSqlFilterLintStatement(args: {
  dialect: SqlEditorDialect;
  table: Pick<Table, "name" | "schema">;
  whereClause: string;
}): string {
  const { dialect, table, whereClause } = args;
  const normalizedClause = normalizeSqlWhereClause(whereClause);
  const qualifiedTableName = formatQualifiedTableName(dialect, table);

  return `select * from ${qualifiedTableName} where (${normalizedClause})`;
}

export function getSqlFilterLintFailureMessage(args: {
  lintedSql: string;
  result: Either<Error, AdapterSqlLintResult>;
  whereClause: string;
}): string | null {
  const { lintedSql, result, whereClause } = args;
  const [error, lintResult] = result;

  if (error) {
    return error.message;
  }

  const diagnostic = lintResult.diagnostics[0];

  if (!diagnostic) {
    return null;
  }

  return formatSqlFilterLintDiagnosticMessage({
    diagnosticFrom: diagnostic.from,
    lintedSql,
    message: diagnostic.message,
    whereClause,
  });
}

function formatQualifiedTableName(
  dialect: SqlEditorDialect,
  table: Pick<Table, "name" | "schema">,
): string {
  const quotedTableName = quoteIdentifier(dialect, table.name);

  if (!table.schema) {
    return quotedTableName;
  }

  return `${quoteIdentifier(dialect, table.schema)}.${quotedTableName}`;
}

function quoteIdentifier(
  dialect: SqlEditorDialect,
  identifier: string,
): string {
  if (dialect === "mysql") {
    return `\`${identifier.replaceAll("`", "``")}\``;
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}

function formatSqlFilterLintDiagnosticMessage(args: {
  diagnosticFrom: number;
  lintedSql: string;
  message: string;
  whereClause: string;
}): string {
  const { diagnosticFrom, lintedSql, message, whereClause } = args;

  if (!shouldAppendWhereClauseExcerpt(message)) {
    return message;
  }

  const excerpt = getWhereClauseExcerpt({
    diagnosticFrom,
    lintedSql,
    whereClause,
  });

  if (!excerpt) {
    return message;
  }

  return `${message}. Near: ${excerpt}`;
}

function shouldAppendWhereClauseExcerpt(message: string): boolean {
  return /end of input|unexpected end|unterminated/i.test(message);
}

function getWhereClauseExcerpt(args: {
  diagnosticFrom: number;
  lintedSql: string;
  whereClause: string;
}): string | null {
  const { diagnosticFrom, lintedSql, whereClause } = args;
  const normalizedClause = normalizeSqlWhereClause(whereClause);

  if (normalizedClause.length === 0) {
    return null;
  }

  const clauseToken = `(${normalizedClause})`;
  const clauseStart = lintedSql.lastIndexOf(clauseToken);
  const normalizedClauseStart = clauseStart >= 0 ? clauseStart + 1 : -1;
  const relativeOffset =
    normalizedClauseStart >= 0
      ? clamp(
          diagnosticFrom - normalizedClauseStart,
          0,
          normalizedClause.length,
        )
      : normalizedClause.length;
  const excerpt = createClauseExcerpt(normalizedClause, relativeOffset);

  return excerpt ? `WHERE ${excerpt}` : null;
}

function createClauseExcerpt(
  normalizedClause: string,
  relativeOffset: number,
): string | null {
  if (normalizedClause.length === 0) {
    return null;
  }

  if (normalizedClause.length <= 32) {
    return normalizedClause;
  }

  const anchor = clamp(relativeOffset, 0, normalizedClause.length);
  const start = Math.max(
    0,
    Math.min(anchor - 16, normalizedClause.length - 32),
  );
  const end = Math.min(normalizedClause.length, start + 32);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < normalizedClause.length ? "…" : "";

  return `${prefix}${normalizedClause.slice(start, end)}${suffix}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
