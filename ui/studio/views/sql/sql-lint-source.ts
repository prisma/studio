import type { Diagnostic, LintSource } from "@codemirror/lint";

import type {
  AdapterSqlLintDetails,
  AdapterSqlLintDiagnostic,
  AdapterSqlLintOptions,
  AdapterSqlLintResult,
} from "../../../../data/adapter";
import type { Either } from "../../../../data/type-utils";

type SqlLintRunner = (
  details: AdapterSqlLintDetails,
  options: AdapterSqlLintOptions,
) => Promise<Either<Error, AdapterSqlLintResult>>;

interface LintState {
  abortController: AbortController | null;
  requestId: number;
}

export function createSqlLintSource(args: {
  lintSql: SqlLintRunner;
  schemaVersion?: string;
}): {
  dispose: () => void;
  source: LintSource;
} {
  const { lintSql, schemaVersion } = args;
  const state: LintState = {
    abortController: null,
    requestId: 0,
  };

  const source: LintSource = async (view) => {
    const sql = view.state.doc.toString();

    if (sql.trim().length === 0) {
      state.abortController?.abort();
      state.abortController = null;
      return [];
    }

    state.abortController?.abort();
    const abortController = new AbortController();
    state.abortController = abortController;
    const requestId = state.requestId + 1;
    state.requestId = requestId;

    const [error, result] = await lintSql(
      {
        schemaVersion,
        sql,
      },
      { abortSignal: abortController.signal },
    );

    if (abortController.signal.aborted || state.requestId !== requestId) {
      return [];
    }

    if (error) {
      return [
        {
          from: 0,
          message: error.message,
          severity: "warning",
          source: "studio",
          to: Math.min(1, sql.length),
        } satisfies Diagnostic,
      ];
    }

    return result.diagnostics.map((diagnostic) =>
      clampDiagnostic(diagnostic, sql.length),
    );
  };

  return {
    dispose() {
      state.abortController?.abort();
      state.abortController = null;
    },
    source,
  };
}

function clampDiagnostic(
  diagnostic: AdapterSqlLintDiagnostic,
  sqlLength: number,
): Diagnostic {
  if (sqlLength <= 0) {
    return {
      ...diagnostic,
      from: 0,
      to: 0,
    };
  }

  const maxFrom = Math.max(sqlLength - 1, 0);
  const from = clamp(diagnostic.from, 0, maxFrom);
  const to = clamp(Math.max(diagnostic.to, from + 1), from + 1, sqlLength);

  return {
    ...diagnostic,
    from,
    to,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
