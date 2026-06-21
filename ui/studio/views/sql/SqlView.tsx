import { sql } from "@codemirror/lang-sql";
import { linter, lintGutter } from "@codemirror/lint";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type {
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2, Play, Sparkles, Square } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type {
  Adapter,
  AdapterError,
  AdapterRawResult,
  AdapterSqlLintDiagnostic,
  Column,
  DataTypeGroup,
} from "../../../../data/adapter";
import { consumeBffRequestDurationMsForSignal } from "../../../../data/bff";
import { createSqlEditorSchemaFromIntrospection } from "../../../../data/sql-editor-schema";
import { getTopLevelSqlStatementAtCursor } from "../../../../data/sql-statements";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { cn } from "../../../lib/utils";
import { TableHead, TableRow } from "../../../components/ui/table";
import { useColumnPinning } from "../../../hooks/use-column-pinning";
import { useIntrospection } from "../../../hooks/use-introspection";
import { useNavigation } from "../../../hooks/use-navigation";
import type { CellProps } from "../../cell/Cell";
import { Cell } from "../../cell/Cell";
import { getCell } from "../../cell/get-cell";
import { useStudio } from "../../context";
import { DataGrid, type DataGridProps } from "../../grid/DataGrid";
import { DataGridDraggableHeaderCell } from "../../grid/DataGridDraggableHeaderCell";
import { DataGridHeader } from "../../grid/DataGridHeader";
import { StudioHeader } from "../../StudioHeader";
import type { ViewProps } from "../View";
import { resolveAiSqlGeneration } from "./sql-ai-generation";
import {
  getCodeMirrorDialect,
  toCodeMirrorSqlNamespace,
} from "./sql-editor-config";
import { createSqlEditorKeybindings } from "./sql-editor-keybindings";
import { createSqlLintSource } from "./sql-lint-source";
import {
  SqlResultVisualizationChart,
  useSqlResultVisualization,
} from "./SqlResultVisualization";

interface SqlResultState {
  aiQueryRequest: string | null;
  durationMs: number;
  querySql: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  shouldAutoGenerateVisualization: boolean;
}

interface SqlExecutionOutcome {
  aiQueryRequest: string | null;
  durationMs: number;
  error: AdapterError | null;
  rawResult: AdapterRawResult | null;
  shouldAutoGenerateVisualization: boolean;
}

interface PendingAiSqlExecutionState {
  aiQueryRequest: string;
  shouldAutoGenerateVisualization: boolean;
  sql: string;
}

type SqlGridRow = Record<string, unknown> & {
  __ps_rowid: string;
};

const DEFAULT_SQL = "select * from ";
const DEFAULT_AI_PROMPT_PLACEHOLDER = "Generate SQL with AI ...";
const MAX_AI_PROMPT_HISTORY_ITEMS = 20;
const SQL_EDITOR_DRAFT_ID = "sql-editor:draft";
const SQL_AI_PROMPT_HISTORY_ID = "sql-editor:ai-prompt-history";
const SQL_EDITOR_STORAGE_KEY = "prisma-studio-sql-editor-state-v1";
const SQL_EDITOR_PERSIST_DEBOUNCE_MS = 250;
const SQL_VIEW_GRID_SCOPE = "sql:view:grid";
const SQL_VIEW_TABLE_NAME = "__sql_result__";
const SQL_VIEW_SCHEMA = "__sql_result__";
const EMPTY_SQL_RESULT_ROWS: Record<string, unknown>[] = [];
const MAX_AI_SQL_VALIDATION_CORRECTIONS = 1;
const DEFAULT_PAGINATION_STATE: PaginationState = {
  pageIndex: 0,
  pageSize: 25,
};

const SQL_ROW_SELECTION_COLUMN_DEF = {
  id: "__ps_select",
  accessorKey: "__ps_select",
  enablePinning: true,
  enableResizing: false,
  enableSorting: false,
  size: 35,
  minSize: 35,
  header({ table }) {
    void table;
    return (props: Omit<CellProps, "children" | "ref">) => {
      return <TableHead {...props} aria-label="Row selection spacer" />;
    };
  },
  cell({ row }) {
    void row;
    return (props: Omit<CellProps, "children" | "ref">) => {
      return <Cell data-select="true" {...props} />;
    };
  },
} satisfies ColumnDef<Record<string, unknown>>;

interface SqlResultGridProps {
  isRunning: boolean;
  paginationState: DataGridProps["paginationState"];
  pinnedColumnIds: NonNullable<DataGridProps["pinnedColumnIds"]>;
  result: SqlResultState;
  rowSelectionState: DataGridProps["rowSelectionState"];
  setPaginationState: DataGridProps["onPaginationChange"];
  setPinnedColumnIds: NonNullable<DataGridProps["onPinnedColumnIdsChange"]>;
  setRowSelectionState: DataGridProps["onRowSelectionChange"];
  visualizationState: ReturnType<typeof useSqlResultVisualization>["state"];
}

const SqlResultGrid = memo(function SqlResultGrid(props: SqlResultGridProps) {
  const {
    isRunning,
    paginationState,
    pinnedColumnIds,
    result,
    rowSelectionState,
    setPaginationState,
    setPinnedColumnIds,
    setRowSelectionState,
    visualizationState,
  } = props;
  const resultRows = useMemo(() => result.rows, [result]);
  const rows = useMemo<SqlGridRow[]>(() => {
    return resultRows.map((row, index) => {
      return {
        ...row,
        __ps_rowid: `sql-row-${index}`,
      };
    });
  }, [resultRows]);
  const resultColumnIds = useMemo(() => {
    const ids: string[] = [];
    const seenIds = new Set<string>();

    for (const row of resultRows) {
      for (const key of Object.keys(row)) {
        if (seenIds.has(key)) {
          continue;
        }

        seenIds.add(key);
        ids.push(key);
      }
    }

    return ids;
  }, [resultRows]);
  const columnMetadataById = useMemo<Record<string, Column>>(() => {
    const metadata: Record<string, Column> = {};

    for (const columnId of resultColumnIds) {
      const sampleValue = findFirstDefinedValue(resultRows, columnId);
      metadata[columnId] = createSqlResultColumnMetadata(columnId, sampleValue);
    }

    return metadata;
  }, [resultColumnIds, resultRows]);
  const columnDefs = useMemo(() => {
    const dataColumnDefs = resultColumnIds.map((columnId) => {
      const column = columnMetadataById[columnId]!;

      return {
        accessorKey: columnId,
        enableSorting: false,
        header({ table, header }) {
          return (props: Omit<CellProps, "children" | "ref">) => {
            return (
              <DataGridDraggableHeaderCell
                table={table}
                header={header}
                {...props}
              >
                <DataGridHeader header={header} column={column} />
              </DataGridDraggableHeaderCell>
            );
          };
        },
        id: columnId,
        meta: column,
        cell({ cell }) {
          return (props: Omit<CellProps, "children" | "ref">) => {
            return (
              <Cell {...props} withContextMenu={false}>
                {getCell({ cell, column })}
              </Cell>
            );
          };
        },
      } satisfies ColumnDef<Record<string, unknown>>;
    });

    return [...dataColumnDefs, SQL_ROW_SELECTION_COLUMN_DEF];
  }, [columnMetadataById, resultColumnIds]);

  return (
    <DataGrid
      columnDefs={columnDefs}
      getBeforeHeaderRows={
        visualizationState.status === "ready"
          ? (table) => {
              return (
                <TableRow data-testid="sql-result-visualization-row">
                  <TableHead
                    className="h-auto p-0 align-top"
                    colSpan={Math.max(table.getAllLeafColumns().length, 1)}
                  >
                    <div
                      className="sticky left-0 box-border w-[100cqw] overflow-hidden border-b border-border/70 bg-background px-4 pt-4 pb-5"
                      data-testid="sql-result-visualization-band"
                    >
                      <SqlResultVisualizationChart
                        config={visualizationState.config}
                      />
                    </div>
                  </TableHead>
                </TableRow>
              );
            }
          : undefined
      }
      isFetching={isRunning}
      isProcessing={false}
      onPinnedColumnIdsChange={setPinnedColumnIds}
      onPaginationChange={setPaginationState}
      onRowSelectionChange={setRowSelectionState}
      pageCount={undefined}
      paginationState={paginationState}
      pinnedColumnIds={pinnedColumnIds}
      rowSelectionState={rowSelectionState}
      rows={rows}
      selectionScopeKey={SQL_VIEW_GRID_SCOPE}
    />
  );
});

export function SqlView(_props: ViewProps) {
  const {
    adapter,
    hasAiSql,
    isDarkMode,
    onEvent,
    requestLlm,
    sqlEditorStateCollection,
  } = useStudio();
  const { data: introspection } = useIntrospection();
  const { schemaParam } = useNavigation();
  const { pinnedColumnIds, setPinnedColumnIds } = useColumnPinning();
  const initialPersistedSqlDraft = readPersistedSqlDraft({
    sqlEditorStateCollection,
  });
  const initialPersistedAiPromptHistory = readPersistedAiPromptHistory({
    sqlEditorStateCollection,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const sqlValidationAbortControllerRef = useRef<AbortController | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const aiPromptInputRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef(true);
  const runCurrentSqlRef = useRef<() => void>(() => undefined);
  const persistedSqlDraftRef = useRef<string | null>(initialPersistedSqlDraft);
  const [editorValue, setEditorValue] = useState(() => {
    return initialPersistedSqlDraft ?? DEFAULT_SQL;
  });
  const hasUserEditedEditorValueRef = useRef(false);
  const latestEditorValueRef = useRef(editorValue);
  const [isRunning, setIsRunning] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPromptHistory, setAiPromptHistory] = useState<string[]>(
    initialPersistedAiPromptHistory,
  );
  const [aiPromptHistoryPreviewIndex, setAiPromptHistoryPreviewIndex] =
    useState<number | null>(null);
  const [aiGenerationErrorMessage, setAiGenerationErrorMessage] = useState<
    string | null
  >(null);
  const [aiCorrectionErrorMessage, setAiCorrectionErrorMessage] = useState<
    string | null
  >(null);
  const [aiGenerationRationale, setAiGenerationRationale] = useState<
    string | null
  >(null);
  const [isGeneratingSql, setIsGeneratingSql] = useState(false);
  const [isCorrectingSql, setIsCorrectingSql] = useState(false);
  const [pendingAiSqlExecution, setPendingAiSqlExecution] =
    useState<PendingAiSqlExecutionState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResultState | null>(null);
  const [visualizationResetKey, setVisualizationResetKey] = useState(0);
  const [rowSelectionState, setRowSelectionState] = useState<RowSelectionState>(
    {},
  );
  const [paginationState, setPaginationState] = useState<PaginationState>(
    DEFAULT_PAGINATION_STATE,
  );
  const aiPromptHistoryRef = useRef(aiPromptHistory);

  const persistEditorDraft = useCallback(
    (queryText: string) => {
      if (persistedSqlDraftRef.current === queryText) {
        return;
      }

      const existingState = sqlEditorStateCollection.get(SQL_EDITOR_DRAFT_ID);

      if (!existingState) {
        sqlEditorStateCollection.insert({
          id: SQL_EDITOR_DRAFT_ID,
          queryText,
        });
        persistedSqlDraftRef.current = queryText;
        return;
      }

      if (existingState.queryText === queryText) {
        persistedSqlDraftRef.current = queryText;
        return;
      }

      sqlEditorStateCollection.update(SQL_EDITOR_DRAFT_ID, (draft) => {
        draft.queryText = queryText;
      });
      persistedSqlDraftRef.current = queryText;
    },
    [sqlEditorStateCollection],
  );

  const persistAiPromptHistory = useCallback(
    (prompt: string) => {
      const nextHistory = buildNextAiPromptHistory(
        aiPromptHistoryRef.current,
        prompt,
      );

      if (
        nextHistory.length === aiPromptHistoryRef.current.length &&
        nextHistory.every(
          (item, index) => item === aiPromptHistoryRef.current[index],
        )
      ) {
        return;
      }

      setAiPromptHistory(nextHistory);
      const existingState = sqlEditorStateCollection.get(
        SQL_AI_PROMPT_HISTORY_ID,
      );

      if (!existingState) {
        sqlEditorStateCollection.insert({
          aiPromptHistory: nextHistory,
          id: SQL_AI_PROMPT_HISTORY_ID,
        });
        return;
      }

      sqlEditorStateCollection.update(SQL_AI_PROMPT_HISTORY_ID, (draft) => {
        draft.aiPromptHistory = nextHistory;
      });
    },
    [sqlEditorStateCollection],
  );

  const aiPromptHistoryPreview =
    aiPrompt.length === 0 && aiPromptHistoryPreviewIndex != null
      ? (aiPromptHistory[aiPromptHistoryPreviewIndex] ?? null)
      : null;

  const materializeAiPromptHistoryPreview = useCallback(() => {
    if (!aiPromptHistoryPreview) {
      return false;
    }

    flushSync(() => {
      setAiPrompt(aiPromptHistoryPreview);
      setAiPromptHistoryPreviewIndex(null);
    });

    const input = aiPromptInputRef.current;

    if (input) {
      const cursorIndex = aiPromptHistoryPreview.length;
      input.setSelectionRange(cursorIndex, cursorIndex);
    }

    return true;
  }, [aiPromptHistoryPreview]);

  const cycleAiPromptHistoryPreview = useCallback(
    (direction: "newer" | "older") => {
      if (aiPrompt.length > 0 || aiPromptHistory.length === 0) {
        return;
      }

      setAiPromptHistoryPreviewIndex((currentIndex) => {
        if (currentIndex == null) {
          return direction === "older" ? 0 : aiPromptHistory.length - 1;
        }

        if (direction === "older") {
          return (currentIndex + 1) % aiPromptHistory.length;
        }

        return (
          (currentIndex - 1 + aiPromptHistory.length) % aiPromptHistory.length
        );
      });
    },
    [aiPrompt.length, aiPromptHistory],
  );

  useEffect(() => {
    latestEditorValueRef.current = editorValue;
  }, [editorValue]);

  useEffect(() => {
    aiPromptHistoryRef.current = aiPromptHistory;
  }, [aiPromptHistory]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      sqlValidationAbortControllerRef.current?.abort();
      sqlValidationAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hasUserEditedEditorValueRef.current) {
      return;
    }

    if (persistedSqlDraftRef.current === editorValue) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      persistEditorDraft(editorValue);
    }, SQL_EDITOR_PERSIST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [editorValue, persistEditorDraft]);

  useEffect(() => {
    return () => {
      const pendingEditorValue =
        editorViewRef.current?.state.doc.toString() ??
        latestEditorValueRef.current;
      const hasUnsyncedEditorDocChange =
        pendingEditorValue !== latestEditorValueRef.current;

      if (!hasUserEditedEditorValueRef.current && !hasUnsyncedEditorDocChange) {
        return;
      }

      persistEditorDraft(pendingEditorValue);
    };
  }, [persistEditorDraft]);

  const activeSqlSchema = getActiveSqlSchema({
    adapterDefaultSchema: adapter.defaultSchema,
    schemaParam,
  });
  const sqlEditorSchema = useMemo(() => {
    return createSqlEditorSchemaFromIntrospection({
      defaultSchema: activeSqlSchema,
      dialect: adapter.capabilities?.sqlDialect ?? "postgresql",
      introspection,
    });
  }, [adapter.capabilities?.sqlDialect, activeSqlSchema, introspection]);
  const sqlEditorNamespace = useMemo(() => {
    return toCodeMirrorSqlNamespace(sqlEditorSchema.namespace);
  }, [sqlEditorSchema.namespace]);
  const sqlEditorDialect = useMemo(() => {
    return getCodeMirrorDialect(sqlEditorSchema.dialect);
  }, [sqlEditorSchema.dialect]);
  const sqlLanguageExtension = useMemo(() => {
    return sql({
      defaultSchema: sqlEditorSchema.defaultSchema,
      dialect: sqlEditorDialect,
      schema: sqlEditorNamespace,
    });
  }, [sqlEditorDialect, sqlEditorNamespace, sqlEditorSchema.defaultSchema]);
  const lintSourceBundle = useMemo(() => {
    if (
      !adapter.capabilities?.sqlEditorLint ||
      !adapterSupportsSqlLint(adapter)
    ) {
      return null;
    }

    return createSqlLintSource({
      lintSql: (details, options) => adapter.sqlLint(details, options),
      schema: activeSqlSchema,
      schemaVersion: sqlEditorSchema.version,
    });
  }, [activeSqlSchema, adapter, sqlEditorSchema.version]);

  useEffect(() => {
    return () => {
      lintSourceBundle?.dispose();
    };
  }, [lintSourceBundle]);

  const sqlLintExtensions = useMemo(() => {
    if (!lintSourceBundle) {
      return [];
    }

    return [lintGutter(), linter(lintSourceBundle.source, { delay: 500 })];
  }, [lintSourceBundle]);
  const sqlEditorExtensions = useMemo(() => {
    return [
      sqlLanguageExtension,
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of(
          createSqlEditorKeybindings({
            runSql: () => {
              runCurrentSqlRef.current();
            },
          }),
        ),
      ),
      ...sqlLintExtensions,
    ];
  }, [sqlLanguageExtension, sqlLintExtensions]);
  const databaseEngine = useMemo(() => {
    return getDatabaseEngineName(
      adapter.capabilities?.sqlDialect ?? "postgresql",
    );
  }, [adapter.capabilities?.sqlDialect]);
  const requestAiSqlGeneration = useCallback(
    async (prompt: string) => {
      return await requestLlm({
        prompt,
        task: "sql-generation",
      });
    },
    [requestLlm],
  );
  const requestAiVisualization = useCallback(
    async (prompt: string) => {
      return await requestLlm({
        prompt,
        task: "sql-visualization",
      });
    },
    [requestLlm],
  );
  const visualization = useSqlResultVisualization({
    requestAiVisualization: hasAiSql ? requestAiVisualization : undefined,
    aiQueryRequest: result?.aiQueryRequest ?? null,
    autoGenerate: result?.shouldAutoGenerateVisualization ?? false,
    databaseEngine,
    querySql: result?.querySql ?? null,
    resetKey: visualizationResetKey,
    rows: result?.rows ?? EMPTY_SQL_RESULT_ROWS,
  });

  function applyAiSqlGenerationResult(args: {
    aiQueryRequest: string;
    rationale: string | null;
    shouldGenerateVisualization: boolean;
    sql: string;
  }) {
    flushSync(() => {
      hasUserEditedEditorValueRef.current = true;
      latestEditorValueRef.current = args.sql;
      setEditorValue(args.sql);
      setAiGenerationRationale(args.rationale);
      setPendingAiSqlExecution({
        aiQueryRequest: args.aiQueryRequest,
        shouldAutoGenerateVisualization: args.shouldGenerateVisualization,
        sql: args.sql,
      });
    });
    focusSqlEditorAtEnd(args.sql);
  }

  async function resolveValidatedAiSqlGeneration(args: {
    previousSql?: string;
    queryErrorMessage?: string;
    request: string;
  }) {
    const generationIntrospection = introspection;

    if (!generationIntrospection) {
      throw new Error(
        "Schema metadata is still loading. Try again in a moment.",
      );
    }

    let generation = await resolveAiSqlGeneration({
      activeSchema: activeSqlSchema,
      requestAiSqlGeneration,
      dialect: adapter.capabilities?.sqlDialect ?? "postgresql",
      introspection: generationIntrospection,
      previousSql: args.previousSql,
      queryErrorMessage: args.queryErrorMessage,
      request: args.request,
    });

    for (
      let correctionCount = 0;
      correctionCount <= MAX_AI_SQL_VALIDATION_CORRECTIONS;
      correctionCount += 1
    ) {
      const validationMessage = await validateGeneratedSqlBeforeDisplay(
        generation.sql,
      );

      if (!validationMessage) {
        return generation;
      }

      if (correctionCount === MAX_AI_SQL_VALIDATION_CORRECTIONS) {
        throw new Error(
          `AI-generated SQL did not pass validation: ${validationMessage}`,
        );
      }

      generation = await resolveAiSqlGeneration({
        activeSchema: activeSqlSchema,
        requestAiSqlGeneration,
        dialect: adapter.capabilities?.sqlDialect ?? "postgresql",
        introspection: generationIntrospection,
        previousSql: generation.sql,
        queryErrorMessage: validationMessage,
        request: args.request,
      });
    }

    return generation;
  }

  async function validateGeneratedSqlBeforeDisplay(
    sql: string,
  ): Promise<string | null> {
    if (
      !adapter.capabilities?.sqlEditorLint ||
      !adapterSupportsSqlLint(adapter)
    ) {
      return null;
    }

    const abortController = new AbortController();
    sqlValidationAbortControllerRef.current = abortController;
    const [error, result] = await adapter.sqlLint(
      {
        schema: activeSqlSchema,
        schemaVersion: sqlEditorSchema.version,
        sql,
      },
      { abortSignal: abortController.signal },
    );

    if (sqlValidationAbortControllerRef.current === abortController) {
      sqlValidationAbortControllerRef.current = null;
    }

    if (!isMountedRef.current) {
      return null;
    }

    if (error) {
      throw new Error(`AI SQL validation failed: ${error.message}`);
    }

    const blockingDiagnostics = result.diagnostics.filter((diagnostic) => {
      return diagnostic.severity === "error";
    });

    if (blockingDiagnostics.length === 0) {
      return null;
    }

    return blockingDiagnostics
      .map(formatSqlLintDiagnosticForAiCorrection)
      .join("\n");
  }

  async function runSqlRequest(args: {
    aiQueryRequest?: string | null;
    sql: string;
    shouldAutoGenerateVisualization?: boolean;
  }): Promise<SqlExecutionOutcome | null> {
    const sql = args.sql.trim();

    if (sql.length === 0 || isRunning) {
      return null;
    }

    const startedAt = performance.now();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsRunning(true);
    setErrorMessage(null);
    setAiCorrectionErrorMessage(null);
    setVisualizationResetKey((currentValue) => currentValue + 1);

    const [error, rawResult] = await adapter.raw(
      {
        schema: activeSqlSchema,
        sql,
      },
      { abortSignal: abortController.signal },
    );

    const durationMs =
      consumeBffRequestDurationMsForSignal(abortController.signal) ??
      Math.round(performance.now() - startedAt);

    if (abortControllerRef.current === abortController) {
      abortControllerRef.current = null;
    }

    if (!isMountedRef.current) {
      return null;
    }

    setIsRunning(false);

    return {
      aiQueryRequest: args.aiQueryRequest ?? null,
      durationMs,
      error: error ?? null,
      rawResult: rawResult ?? null,
      shouldAutoGenerateVisualization:
        args.shouldAutoGenerateVisualization ?? false,
    };
  }

  function applySqlExecutionOutcome(
    outcome: SqlExecutionOutcome,
    args?: { reportEvents?: boolean },
  ) {
    const { durationMs, error, rawResult, shouldAutoGenerateVisualization } =
      outcome;
    const { aiQueryRequest } = outcome;
    const reportEvents = args?.reportEvents ?? true;

    if (error) {
      const isAbort = error.name === "AbortError";
      const message = isAbort ? "Query cancelled." : error.message;
      setErrorMessage(message);
      if (!isAbort) {
        setResult(null);
      }

      if (!isAbort && reportEvents) {
        onEvent({
          name: "studio_operation_error",
          payload: {
            operation: "raw-query",
            query: error.query,
            error,
          },
        });
      }
      return;
    }

    if (!rawResult) {
      return;
    }

    setResult({
      aiQueryRequest,
      durationMs,
      querySql: rawResult.query.sql,
      rowCount: rawResult.rowCount,
      rows: rawResult.rows,
      shouldAutoGenerateVisualization,
    });
    setRowSelectionState({});
    setPaginationState(DEFAULT_PAGINATION_STATE);
    setErrorMessage(null);
    setAiCorrectionErrorMessage(null);

    if (reportEvents) {
      onEvent({
        name: "studio_operation_success",
        payload: {
          error: undefined,
          operation: "raw-query",
          query: rawResult.query,
        },
      });
    }
  }

  async function executeSql(args?: { sqlOverride?: string }) {
    const sql = args?.sqlOverride ?? editorValue;
    const aiExecutionContext = getPendingAiSqlExecutionContext({
      pendingAiSqlExecution,
      sql,
    });
    const outcome = await runSqlRequest({
      aiQueryRequest: aiExecutionContext.aiQueryRequest,
      shouldAutoGenerateVisualization:
        aiExecutionContext.shouldAutoGenerateVisualization,
      sql,
    });

    if (!outcome) {
      return;
    }

    applySqlExecutionOutcome(outcome);

    if (outcome.error && outcome.error.name !== "AbortError") {
      await correctAiGeneratedSqlAfterQueryError({
        aiQueryRequest: aiExecutionContext.aiQueryRequest,
        failedSql: sql.trim(),
        queryErrorMessage: outcome.error.message,
      });
    }
  }

  function getSqlForExecutionFromCursor(): string {
    const view = editorViewRef.current;
    const fallbackSql = editorValue.trim();

    if (!view || fallbackSql.length === 0) {
      return fallbackSql;
    }

    const statementAtCursor = getTopLevelSqlStatementAtCursor({
      cursorIndex: view.state.selection.main.head,
      sql: editorValue,
    });

    return statementAtCursor?.statement ?? fallbackSql;
  }

  runCurrentSqlRef.current = () => {
    void executeSql({ sqlOverride: getSqlForExecutionFromCursor() });
  };

  function cancelExecution() {
    const controller = abortControllerRef.current;

    if (!controller) {
      return;
    }

    controller.abort();
  }

  async function generateSqlFromPrompt() {
    if (!hasAiSql || isGeneratingSql || isCorrectingSql) {
      return;
    }

    if (!introspection) {
      setAiGenerationErrorMessage(
        "Schema metadata is still loading. Try again in a moment.",
      );
      return;
    }

    const trimmedPrompt = aiPrompt.trim();

    if (trimmedPrompt.length === 0) {
      return;
    }

    persistAiPromptHistory(trimmedPrompt);
    setAiPromptHistoryPreviewIndex(null);
    setIsGeneratingSql(true);
    setAiGenerationErrorMessage(null);
    setAiCorrectionErrorMessage(null);
    setAiGenerationRationale(null);
    setErrorMessage(null);
    setPendingAiSqlExecution(null);
    setResult(null);

    try {
      const generation = await resolveValidatedAiSqlGeneration({
        request: trimmedPrompt,
      });

      if (!isMountedRef.current) {
        return;
      }

      applyAiSqlGenerationResult({
        aiQueryRequest: trimmedPrompt,
        rationale: generation.rationale,
        shouldGenerateVisualization: generation.shouldGenerateVisualization,
        sql: generation.sql,
      });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      setAiGenerationErrorMessage(
        error instanceof Error ? error.message : "AI SQL generation failed.",
      );
    } finally {
      if (isMountedRef.current) {
        setIsGeneratingSql(false);
      }
    }
  }

  async function correctAiGeneratedSqlAfterQueryError(args: {
    aiQueryRequest: string | null;
    failedSql: string;
    queryErrorMessage: string;
  }) {
    if (
      !hasAiSql ||
      !args.aiQueryRequest ||
      args.failedSql.length === 0 ||
      isCorrectingSql ||
      !introspection
    ) {
      return;
    }

    setIsCorrectingSql(true);
    setAiGenerationErrorMessage(null);
    setAiCorrectionErrorMessage(null);

    try {
      const generation = await resolveValidatedAiSqlGeneration({
        previousSql: args.failedSql,
        queryErrorMessage: args.queryErrorMessage,
        request: args.aiQueryRequest,
      });

      if (!isMountedRef.current) {
        return;
      }

      setResult(null);
      setErrorMessage(null);
      applyAiSqlGenerationResult({
        aiQueryRequest: args.aiQueryRequest,
        rationale: generation.rationale,
        shouldGenerateVisualization: generation.shouldGenerateVisualization,
        sql: generation.sql,
      });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      setAiCorrectionErrorMessage(
        error instanceof Error ? error.message : "AI SQL correction failed.",
      );
    } finally {
      if (isMountedRef.current) {
        setIsCorrectingSql(false);
      }
    }
  }

  function focusSqlEditorAtEnd(sql: string) {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    const cursorIndex = sql.length;
    view.dispatch({
      selection: {
        anchor: cursorIndex,
        head: cursorIndex,
      },
    });
    view.focus();
  }

  const runSqlButton = (
    <Button
      onClick={() => {
        if (isRunning) {
          cancelExecution();
          return;
        }

        void executeSql({ sqlOverride: getSqlForExecutionFromCursor() });
      }}
      disabled={!isRunning && editorValue.trim().length === 0}
      size="sm"
      variant={isRunning ? "outline" : "default"}
    >
      {isRunning ? <Square className="size-4" /> : <Play className="size-4" />}
      {isRunning ? "Cancel" : "Run SQL"}
    </Button>
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col h-full overflow-hidden">
      <StudioHeader endContent={runSqlButton}>
        {hasAiSql ? (
          <div className="flex min-w-0 grow items-center gap-2">
            <Input
              aria-label="Generate SQL with AI"
              className="min-w-0 grow"
              disabled={isGeneratingSql || isCorrectingSql}
              onMouseDown={() => {
                void materializeAiPromptHistoryPreview();
              }}
              onChange={(event) => {
                setAiPromptHistoryPreviewIndex(null);
                setAiPrompt(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  if (aiPrompt.length === 0 && aiPromptHistory.length > 0) {
                    event.preventDefault();
                    cycleAiPromptHistoryPreview(
                      event.key === "ArrowUp" ? "older" : "newer",
                    );
                  }
                  return;
                }

                if (aiPromptHistoryPreview) {
                  if (isIgnoredAiPromptHistoryCommitKey(event.key)) {
                    return;
                  }

                  const didMaterializeHistory =
                    materializeAiPromptHistoryPreview();

                  if (didMaterializeHistory && event.key === "Enter") {
                    event.preventDefault();
                    return;
                  }
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  void generateSqlFromPrompt();
                }
              }}
              placeholder={
                aiPromptHistoryPreview ?? DEFAULT_AI_PROMPT_PLACEHOLDER
              }
              ref={aiPromptInputRef}
              value={aiPrompt}
            />
            <Button
              disabled={
                aiPrompt.trim().length === 0 ||
                isGeneratingSql ||
                isCorrectingSql
              }
              onClick={() => {
                void generateSqlFromPrompt();
              }}
              size="sm"
              variant="outline"
            >
              {isGeneratingSql ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate SQL
            </Button>
          </div>
        ) : null}
      </StudioHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden border-b border-border bg-background p-3">
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background"
            data-testid="sql-editor-scroll-container"
          >
            <CodeMirror
              aria-label="SQL editor"
              basicSetup={{
                foldGutter: false,
              }}
              className={[
                "min-h-0 flex-1",
                "[&_.cm-editor]:!border-0 [&_.cm-editor]:font-mono",
                "[&_.cm-gutters]:border-r [&_.cm-gutters]:border-border [&_.cm-gutters]:bg-muted/30",
                "[&_.cm-line]:text-[15px] [&_.cm-scroller]:font-mono",
              ].join(" ")}
              extensions={sqlEditorExtensions}
              height="100%"
              minHeight="128px"
              onCreateEditor={(view) => {
                editorViewRef.current = view;
                const cursorIndex = view.state.doc.length;
                view.dispatch({
                  selection: {
                    anchor: cursorIndex,
                    head: cursorIndex,
                  },
                });
                view.focus();
              }}
              onChange={(value) => {
                hasUserEditedEditorValueRef.current = true;
                latestEditorValueRef.current = value;
                setEditorValue(value);
              }}
              placeholder="Write SQL..."
              theme={isDarkMode ? "dark" : "light"}
              value={editorValue}
            />
          </div>
        {aiGenerationErrorMessage ? (
          <div className="text-sm text-destructive">
            <strong>AI SQL generation error:</strong> {aiGenerationErrorMessage}
          </div>
        ) : null}
        {isCorrectingSql ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Correcting SQL with AI...
          </div>
        ) : null}
        {aiCorrectionErrorMessage ? (
          <div className="text-sm text-destructive">
            <strong>AI SQL correction error:</strong> {aiCorrectionErrorMessage}
          </div>
        ) : null}
        {aiGenerationRationale ? (
          <div className="text-xs text-muted-foreground">
            <strong>AI rationale:</strong> {aiGenerationRationale}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="text-sm text-destructive">
            <strong>Query error:</strong> {errorMessage}
          </div>
        ) : null}
        {result ? (
          <div
            className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
            data-testid="sql-result-summary"
          >
            <div>
              {result.rowCount} row(s) returned in {result.durationMs}ms
            </div>
            {hasAiSql ? (
              <div className="flex min-w-0 items-center justify-end">
                {visualization.state.status === "idle" &&
                visualization.canGenerate ? (
                  <Button
                    className="h-auto rounded-none px-0 py-0 text-xs text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
                    data-testid="sql-result-visualization-action"
                    onClick={visualization.generateVisualization}
                    size="sm"
                    variant="ghost"
                  >
                    <Sparkles data-icon="inline-start" />
                    Visualize data with AI
                  </Button>
                ) : null}
                {visualization.state.status === "loading" ? (
                  <div
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    data-testid="sql-result-visualization-action"
                  >
                    <Loader2 className="size-4 animate-spin" />
                    Generating graph...
                  </div>
                ) : null}
                {visualization.state.status === "error" ? (
                  <div
                    className="max-w-[32rem] text-right text-xs text-destructive"
                    data-testid="sql-result-visualization-action"
                  >
                    {visualization.state.message}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        </div>

        <div
          data-testid="sql-result-grid-container"
          className={cn(
            "flex min-h-0 flex-col",
            result != null ? "flex-1" : "flex-none",
          )}
        >
          {result == null ? null : (
            <SqlResultGrid
              isRunning={isRunning}
              paginationState={paginationState}
              pinnedColumnIds={pinnedColumnIds}
              result={result}
              rowSelectionState={rowSelectionState}
              setPaginationState={setPaginationState}
              setPinnedColumnIds={setPinnedColumnIds}
              setRowSelectionState={setRowSelectionState}
              visualizationState={visualization.state}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function findFirstDefinedValue(
  rows: Record<string, unknown>[],
  columnId: string,
): unknown {
  for (const row of rows) {
    const value = row[columnId];
    if (value !== null && value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function getPendingAiSqlExecutionContext(args: {
  pendingAiSqlExecution: PendingAiSqlExecutionState | null;
  sql: string;
}): {
  aiQueryRequest: string | null;
  shouldAutoGenerateVisualization: boolean;
} {
  const { pendingAiSqlExecution } = args;
  const trimmedSql = normalizeSqlForAiExecutionContext(args.sql);

  if (!pendingAiSqlExecution || trimmedSql.length === 0) {
    return {
      aiQueryRequest: null,
      shouldAutoGenerateVisualization: false,
    };
  }

  if (
    normalizeSqlForAiExecutionContext(pendingAiSqlExecution.sql) !== trimmedSql
  ) {
    return {
      aiQueryRequest: null,
      shouldAutoGenerateVisualization: false,
    };
  }

  return {
    aiQueryRequest: pendingAiSqlExecution.aiQueryRequest,
    shouldAutoGenerateVisualization:
      pendingAiSqlExecution.shouldAutoGenerateVisualization,
  };
}

function normalizeSqlForAiExecutionContext(sql: string): string {
  return sql.trim().replace(/;+$/, "");
}

function createSqlResultColumnMetadata(
  name: string,
  sampleValue: unknown,
): Column {
  const isArray = Array.isArray(sampleValue);
  const dataTypeGroup = inferDataTypeGroup(sampleValue);
  const dataTypeName = inferDataTypeName(sampleValue);

  return {
    datatype: {
      affinity: dataTypeName,
      format: undefined,
      group: dataTypeGroup,
      isArray,
      isNative: false,
      name: dataTypeName,
      options: [],
      schema: SQL_VIEW_SCHEMA,
    },
    defaultValue: null,
    fkColumn: null,
    fkSchema: null,
    fkTable: null,
    isAutoincrement: false,
    isComputed: false,
    isRequired: false,
    name,
    nullable: true,
    pkPosition: null,
    schema: SQL_VIEW_SCHEMA,
    table: SQL_VIEW_TABLE_NAME,
  };
}

function inferDataTypeGroup(value: unknown): DataTypeGroup {
  if (Array.isArray(value)) {
    return "json";
  }

  if (value instanceof Date) {
    return "datetime";
  }

  switch (typeof value) {
    case "bigint":
    case "number":
      return "numeric";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    case "object":
      return "json";
    default:
      return "raw";
  }
}

function inferDataTypeName(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value instanceof Date) {
    return "timestamp";
  }

  switch (typeof value) {
    case "bigint":
      return "bigint";
    case "number":
      return "numeric";
    case "boolean":
      return "boolean";
    case "string":
      return "text";
    case "object":
      return "json";
    case "undefined":
      return "unknown";
    default:
      return "raw";
  }
}

function adapterSupportsSqlLint(adapter: Adapter): adapter is Adapter & {
  sqlLint: NonNullable<Adapter["sqlLint"]>;
} {
  return typeof adapter.sqlLint === "function";
}

function getActiveSqlSchema(args: {
  adapterDefaultSchema?: string;
  schemaParam: string | null | undefined;
}): string {
  return args.schemaParam ?? args.adapterDefaultSchema ?? "public";
}

function formatSqlLintDiagnosticForAiCorrection(
  diagnostic: AdapterSqlLintDiagnostic,
): string {
  const code = diagnostic.code ? ` (${diagnostic.code})` : "";
  return `${diagnostic.message}${code}`;
}

function getDatabaseEngineName(dialect: "postgresql" | "mysql" | "sqlite") {
  switch (dialect) {
    case "mysql":
      return "MySQL";
    case "sqlite":
      return "SQLite";
    case "postgresql":
    default:
      return "PostgreSQL";
  }
}

function readPersistedSqlDraft(args: {
  sqlEditorStateCollection: ReturnType<
    typeof useStudio
  >["sqlEditorStateCollection"];
}): string | null {
  const draftRow = readPersistedSqlEditorStateRow({
    rowId: SQL_EDITOR_DRAFT_ID,
    sqlEditorStateCollection: args.sqlEditorStateCollection,
  });
  const queryText = draftRow?.queryText;

  return typeof queryText === "string" ? queryText : null;
}

function readPersistedAiPromptHistory(args: {
  sqlEditorStateCollection: ReturnType<
    typeof useStudio
  >["sqlEditorStateCollection"];
}): string[] {
  const historyRow = readPersistedSqlEditorStateRow({
    rowId: SQL_AI_PROMPT_HISTORY_ID,
    sqlEditorStateCollection: args.sqlEditorStateCollection,
  });

  return normalizeAiPromptHistory(historyRow?.aiPromptHistory);
}

function readPersistedSqlEditorStateRow(args: {
  rowId: string;
  sqlEditorStateCollection: ReturnType<
    typeof useStudio
  >["sqlEditorStateCollection"];
}): { aiPromptHistory?: unknown; queryText?: unknown } | null {
  const { rowId, sqlEditorStateCollection } = args;
  const inCollection = sqlEditorStateCollection.get(rowId);

  if (inCollection != null) {
    return inCollection;
  }

  if (typeof window === "undefined") {
    return null;
  }

  const rawStorageState = window.localStorage.getItem(SQL_EDITOR_STORAGE_KEY);

  if (!rawStorageState) {
    return null;
  }

  try {
    const parsedStorageState: unknown = JSON.parse(rawStorageState);

    if (
      typeof parsedStorageState !== "object" ||
      parsedStorageState == null ||
      Array.isArray(parsedStorageState)
    ) {
      return null;
    }

    const draftRow = (parsedStorageState as Record<string, unknown>)[
      `s:${rowId}`
    ];

    if (typeof draftRow !== "object" || draftRow == null) {
      return null;
    }

    const draftData = (draftRow as { data?: unknown }).data;

    if (typeof draftData !== "object" || draftData == null) {
      return null;
    }

    return draftData as { aiPromptHistory?: unknown; queryText?: unknown };
  } catch {
    return null;
  }
}

function normalizeAiPromptHistory(history: unknown): string[] {
  if (!Array.isArray(history)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of history) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmedItem = item.trim();

    if (trimmedItem.length === 0 || seen.has(trimmedItem)) {
      continue;
    }

    seen.add(trimmedItem);
    normalized.push(trimmedItem);

    if (normalized.length >= MAX_AI_PROMPT_HISTORY_ITEMS) {
      break;
    }
  }

  return normalized;
}

function buildNextAiPromptHistory(
  history: string[],
  nextPrompt: string,
): string[] {
  const trimmedPrompt = nextPrompt.trim();

  if (trimmedPrompt.length === 0) {
    return normalizeAiPromptHistory(history);
  }

  return normalizeAiPromptHistory([trimmedPrompt, ...history]);
}

function isIgnoredAiPromptHistoryCommitKey(key: string): boolean {
  return (
    key === "Alt" ||
    key === "CapsLock" ||
    key === "Control" ||
    key === "Meta" ||
    key === "Shift"
  );
}
