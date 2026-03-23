import type { Sql } from "postgres";

import type { StudioBFFSqlLintResult } from "../../data/bff";
import {
  createLintDiagnosticsFromPostgresError,
  validateSqlForLint,
} from "../../data/postgres-core/sql-lint";

const SQL_LINT_STATEMENT_TIMEOUT = "1000ms";
const SQL_LINT_LOCK_TIMEOUT = "100ms";
const SQL_LINT_IDLE_IN_TRANSACTION_TIMEOUT = "1000ms";

export async function lintPostgresSql(args: {
  postgresClient: Sql;
  schemaVersion?: string;
  sql: string;
}): Promise<StudioBFFSqlLintResult> {
  const { postgresClient, schemaVersion, sql } = args;
  const validation = validateSqlForLint(sql);

  if (!validation.ok) {
    return {
      diagnostics: [validation.diagnostic],
      schemaVersion,
    };
  }

  const diagnostics: StudioBFFSqlLintResult["diagnostics"] = [];

  for (const statement of validation.statements) {
    try {
      await postgresClient.begin(async (tx) => {
        await tx.unsafe(
          `set local statement_timeout = '${SQL_LINT_STATEMENT_TIMEOUT}'`,
        );
        await tx.unsafe(`set local lock_timeout = '${SQL_LINT_LOCK_TIMEOUT}'`);
        await tx.unsafe(
          `set local idle_in_transaction_session_timeout = '${SQL_LINT_IDLE_IN_TRANSACTION_TIMEOUT}'`,
        );
        await tx.unsafe(`EXPLAIN (FORMAT JSON) ${statement.statement}`);
      });
    } catch (error: unknown) {
      diagnostics.push(
        ...createLintDiagnosticsFromPostgresError({
          error,
          positionOffset: statement.from,
          sql: statement.statement,
        }),
      );
    }
  }

  return {
    diagnostics,
    schemaVersion,
  };
}
