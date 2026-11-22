import type { ButtonProps } from "@/ui/components/ui/button";

import type { SqlStatementRisk } from "../../../../data/sql-statement-risk";
import { useUiState } from "../../../hooks/use-ui-state";

/**
 * Persistent UI state key for "ask before running SQL that changes data".
 * Statements that wipe data broadly (`danger`) always ask, whatever this is.
 */
export const SQL_RUN_CONFIRMATION_UI_STATE_KEY = "sql:confirm-before-changes";

export function useSqlRunConfirmationSetting() {
  return useUiState<boolean>(SQL_RUN_CONFIRMATION_UI_STATE_KEY, true, {
    persistent: true,
  });
}

export function shouldConfirmSqlRun(args: {
  isConfirmationEnabled: boolean;
  risk: SqlStatementRisk;
}): boolean {
  const { isConfirmationEnabled, risk } = args;

  if (risk.kind === "safe") {
    return false;
  }

  return risk.kind === "danger" || isConfirmationEnabled;
}

export interface SqlRunConfirmationCopy {
  primaryLabel: string;
  primaryVariant: ButtonProps["variant"];
  prompt: string;
  title: string;
}

export function getSqlRunConfirmationCopy(
  risk: SqlStatementRisk,
): SqlRunConfirmationCopy {
  const { statementType, target } = risk;

  if (risk.kind === "danger") {
    const danger = (prompt: string, primaryLabel: string) => ({
      primaryLabel,
      primaryVariant: "destructive" as const,
      prompt,
      title: "Confirm destructive SQL",
    });

    if (risk.reason === "no-where" && statementType === "UPDATE") {
      return danger(
        `This UPDATE has no WHERE clause and will change every row in ${target ?? "the table"}.`,
        "update all rows",
      );
    }

    if (risk.reason === "no-where") {
      return danger(
        `This DELETE has no WHERE clause and will delete every row in ${target ?? "the table"}.`,
        "delete all rows",
      );
    }

    if (statementType === "TRUNCATE") {
      return danger(
        `This will remove every row from ${target ?? "the table"}.`,
        "empty table",
      );
    }

    if (statementType?.startsWith("DROP ") && target) {
      const objectKind = statementType.slice("DROP ".length).toLowerCase();

      return danger(
        `This will permanently drop the ${objectKind} ${target}.`,
        `drop ${objectKind}`,
      );
    }

    if (statementType === "ALTER" && target) {
      return danger(
        `This ALTER permanently removes part of ${target}.`,
        "run anyway",
      );
    }

    return danger("This statement cannot be undone.", "run anyway");
  }

  if (risk.kind === "write" && statementType) {
    return {
      primaryLabel: "run",
      primaryVariant: "default",
      prompt: target
        ? `Run this ${statementType} on ${target}?`
        : `Run this ${statementType} statement?`,
      title: "Confirm SQL that changes data",
    };
  }

  return {
    primaryLabel: "run",
    primaryVariant: "default",
    prompt: "Run this statement? Studio could not tell what it does.",
    title: "Confirm SQL that changes data",
  };
}
