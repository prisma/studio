export function normalizeSqlWhereClause(input: string): string {
  const withoutLeadingWhere = input
    .trim()
    .replace(/^where\b/i, "")
    .trim();

  return withoutLeadingWhere.replace(/;+$/u, "").trim();
}

export function hasEmbeddedSqlStatementSeparator(input: string): boolean {
  return input.trim().replace(/;+$/u, "").includes(";");
}
