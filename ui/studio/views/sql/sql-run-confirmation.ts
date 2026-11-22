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

/** Placeholder in `prompt` where the table or object name is rendered. */
export const SQL_RUN_CONFIRMATION_NAME_TOKEN = "{name}";

export interface SqlRunConfirmationCopy {
  /** Table or object name for `SQL_RUN_CONFIRMATION_NAME_TOKEN`, if any. */
  name: string | null;
  primaryLabel: string;
  promptDetail: string;
  primaryVariant: ButtonProps["variant"];
  prompt: string;
  title: string;
}

const NO_UNDO = "Studio can't undo this.";

/**
 * Plain-language dialog copy: say what will happen to the data, then why
 * Studio is asking (there is no undo). SQL keywords stay out of the prompt so
 * people who did not write the statement can still decide.
 */
export function getSqlRunConfirmationCopy(
  risk: SqlStatementRisk,
): SqlRunConfirmationCopy {
  const { statementType, target } = risk;
  const name = target ? SQL_RUN_CONFIRMATION_NAME_TOKEN : null;
  const table = name ?? "the table";

  if (risk.kind === "danger") {
    const danger = (prompt: string, primaryLabel: string) => ({
      name: target,
      primaryLabel,
      primaryVariant: "destructive" as const,
      prompt,
      promptDetail: NO_UNDO,
      title: "Confirm destructive SQL",
    });

    if (risk.reason === "no-where" && statementType === "UPDATE") {
      return danger(
        `This will change every row in ${table}.`,
        "change all rows",
      );
    }

    if (risk.reason === "no-where" || statementType === "TRUNCATE") {
      return danger(
        `This will delete every row in ${table}.`,
        "delete all rows",
      );
    }

    if (statementType?.startsWith("DROP ") && target) {
      const objectKind = statementType.slice("DROP ".length).toLowerCase();

      return danger(
        objectKind === "table"
          ? `This will delete the table ${table} and all of its data.`
          : `This will delete the ${objectKind} ${table}.`,
        `delete ${objectKind}`,
      );
    }

    if (statementType === "ALTER" && target) {
      return danger(
        `This will remove part of the table ${table}, along with the data in it.`,
        "remove it",
      );
    }

    return danger(`This will delete data.`, "run anyway");
  }

  const write = (prompt: string, primaryLabel = "run") => ({
    name: target,
    primaryLabel,
    primaryVariant: "default" as const,
    prompt,
    promptDetail: NO_UNDO,
    title: "Confirm SQL that changes data",
  });

  if (risk.kind === "write") {
    switch (statementType) {
      case "UPDATE":
        return write(`This will change data in ${table}.`, "change data");
      case "DELETE":
        return write(
          `This will delete some rows from ${table}.`,
          "delete rows",
        );
      case "INSERT":
      case "REPLACE":
        return write(`This will add rows to ${table}.`, "add rows");
      case "ALTER":
        return write(
          target
            ? `This will change the columns or settings of the table ${table}.`
            : "This will change how your database is set up.",
        );
      default:
        return write("This will change your database.");
    }
  }

  return {
    name: null,
    primaryLabel: "run anyway",
    primaryVariant: "default",
    prompt: "Studio can't tell what this SQL does.",
    promptDetail: "If it changes data, Studio can't undo it.",
    title: "Confirm SQL that changes data",
  };
}
