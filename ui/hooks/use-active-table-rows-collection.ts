import {
  queryCollectionOptions,
} from "@tanstack/query-db-collection";
import {
  type Collection,
  createCollection,
  useLiveQuery,
} from "@tanstack/react-db";
import { type QueryKey, useIsFetching } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type {
  AdapterQueryResult,
  AdapterUpdateManyResult,
  AdapterUpdateResult,
  FilterGroup,
  SortOrderItem,
  Table,
} from "../../data/adapter";
import { AbortError } from "../../data/executor";
import { useStudio } from "../studio/context";
import { useNavigation } from "./use-navigation";
import { addRowIdToResult } from "./utils/add-row-id-to-result";

export interface ActiveTableRowsCollectionQuery {
  fullTableSearchTerm?: string;
  pageIndex: number;
  pageSize: number;
  sortOrder: SortOrderItem[];
  filter: FilterGroup;
}

type RowRecord = Record<string, unknown>;
type RowCollection = Collection<RowRecord, string>;

function writeUpdatedRows(args: {
  activeTable: Table;
  writeUpdate: (row: RowRecord) => void;
  rows: AdapterUpdateResult["row"][] | AdapterUpdateManyResult["rows"];
}) {
  const { activeTable, rows, writeUpdate } = args;

  for (const row of rows) {
    writeUpdate(addRowIdToResult({ row }, activeTable).row!);
  }
}

function compareRowsByQueryOrder(left: RowRecord, right: RowRecord): number {
  const leftOrder =
    typeof left.__ps_order === "number" ? left.__ps_order : Infinity;
  const rightOrder =
    typeof right.__ps_order === "number" ? right.__ps_order : Infinity;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftRowId = String(left.__ps_rowid ?? "");
  const rightRowId = String(right.__ps_rowid ?? "");

  return leftRowId.localeCompare(rightRowId);
}

function mergeAbortSignals(signals: Array<AbortSignal | undefined>): {
  cleanup: () => void;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  const listeners: Array<{ listener: () => void; signal: AbortSignal }> = [];

  const abort = (signal: AbortSignal) => {
    if (controller.signal.aborted) {
      return;
    }

    controller.abort(signal.reason);
  };

  for (const signal of signals) {
    if (!signal) {
      continue;
    }

    if (signal.aborted) {
      abort(signal);
      continue;
    }

    const listener = () => abort(signal);
    signal.addEventListener("abort", listener);
    listeners.push({ listener, signal });
  }

  return {
    cleanup() {
      for (const { listener, signal } of listeners) {
        signal.removeEventListener("abort", listener);
      }
    },
    signal: controller.signal,
  };
}

export interface ActiveTableRowsCollectionState {
  activeTable: Table | undefined;
  collection: RowCollection | null;
  rows: RowRecord[];
  filteredRowCount: AdapterQueryResult["filteredRowCount"];
  isFetching: boolean;
  refetch: () => Promise<void>;
  queryScopeKey: string;
}

function getSortKey(sortOrder: SortOrderItem[]): string {
  return sortOrder.map((item) => `${item.column}:${item.direction}`).join(",");
}

function getFilterKey(filter: FilterGroup): string {
  return JSON.stringify(filter);
}

function getQueryScopeKey(
  table: Table | undefined,
  query: ActiveTableRowsCollectionQuery,
): string {
  if (!table) {
    return "";
  }

  const { filter, fullTableSearchTerm, pageIndex, pageSize, sortOrder } = query;

  return [
    table.schema,
    table.name,
    String(pageIndex),
    String(pageSize),
    getSortKey(sortOrder),
    getFilterKey(filter),
    fullTableSearchTerm ?? "",
  ].join("::");
}

function getFilteredRowCountKey(
  table: Table | undefined,
  query: Pick<ActiveTableRowsCollectionQuery, "filter" | "fullTableSearchTerm">,
): string {
  if (!table) {
    return "";
  }

  return [
    table.schema,
    table.name,
    getFilterKey(query.filter),
    query.fullTableSearchTerm ?? "",
  ].join("::");
}

function upsertFilteredRowCount(
  id: string,
  filteredRowCount: AdapterQueryResult["filteredRowCount"],
  tableQueryMetaCollection: ReturnType<
    typeof useStudio
  >["tableQueryMetaCollection"],
): void {
  const existing = tableQueryMetaCollection.get(id);

  if (!existing) {
    tableQueryMetaCollection.insert({
      id,
      filteredRowCount,
    });
    return;
  }

  if (existing.filteredRowCount === filteredRowCount) {
    return;
  }

  tableQueryMetaCollection.update(id, (draft) => {
    draft.filteredRowCount = filteredRowCount;
  });
}

export function useActiveTableRowsCollection(
  query: ActiveTableRowsCollectionQuery,
): ActiveTableRowsCollectionState {
  const { filter, fullTableSearchTerm, pageIndex, pageSize, sortOrder } = query;
  const studio = useStudio();
  const {
    adapter,
    getOrCreateTableQueryExecutionState,
    onEvent,
    queryClient,
    tableQueryMetaCollection,
  } = studio;
  const {
    metadata: { activeTable },
  } = useNavigation();
  const tableQueryExecutionStateKey = activeTable
    ? `${activeTable.schema}.${activeTable.name}`
    : "";
  const sortKey = useMemo(() => getSortKey(sortOrder), [sortOrder]);
  const filterKey = useMemo(
    () => `${getFilterKey(filter)}::${fullTableSearchTerm ?? ""}`,
    [filter, fullTableSearchTerm],
  );
  const queryScopeKey = useMemo(
    () =>
      getQueryScopeKey(activeTable, {
        fullTableSearchTerm,
        pageIndex,
        pageSize,
        sortOrder,
        filter,
      }),
    [activeTable, filter, fullTableSearchTerm, pageIndex, pageSize, sortOrder],
  );
  const filteredRowCountKey = useMemo(
    () =>
      getFilteredRowCountKey(activeTable, {
        filter,
        fullTableSearchTerm,
      }),
    [activeTable, filter, fullTableSearchTerm],
  );
  const queryKey = useMemo<QueryKey | null>(
    () =>
      activeTable
        ? [
            "schema",
            activeTable.schema,
            "table",
            activeTable.name,
            "query",
            "sortOrder",
            sortKey || "natural",
            "pageIndex",
            pageIndex,
            "pageSize",
            pageSize,
            "filter",
            filterKey,
          ]
        : null,
    [activeTable, filterKey, pageIndex, pageSize, sortKey],
  );

  const collection = useMemo<RowCollection | null>(() => {
    if (!activeTable || !queryScopeKey) {
      return null;
    }

    return studio.getOrCreateRowsCollection<RowCollection>(
      queryScopeKey,
      () => {
        return createCollection(
          queryCollectionOptions({
            compare: compareRowsByQueryOrder,
            gcTime: 0,
            id: `rows:${queryScopeKey}`,
            getKey(item) {
              return String(item.__ps_rowid);
            },
            onDelete: async ({ transaction }) => {
              const rows = transaction.mutations.map(
                (mutation) => mutation.original,
              );

              if (rows.length === 0) {
                return;
              }

              const [error, result] = await adapter.delete(
                { rows, table: activeTable },
                {},
              );

              if (error) {
                onEvent({
                  name: "studio_operation_error",
                  payload: {
                    operation: "delete",
                    query: error.query,
                    error,
                  },
                });

                throw error;
              }

              onEvent({
                name: "studio_operation_success",
                payload: {
                  operation: "delete",
                  query: result.query,
                  error: undefined,
                },
              });
            },
            onUpdate: async ({ collection, transaction }) => {
              if (
                transaction.mutations.length > 1 &&
                typeof adapter.updateMany === "function"
              ) {
                const [error, result] = await adapter.updateMany(
                  {
                    table: activeTable,
                    updates: transaction.mutations.map((mutation) => ({
                      changes: mutation.changes,
                      row: mutation.original,
                      table: activeTable,
                    })),
                  },
                  {},
                );

                if (error) {
                  onEvent({
                    name: "studio_operation_error",
                    payload: {
                      operation: "update",
                      query: error.query,
                      error,
                    },
                  });

                  throw error;
                }

                for (const query of result.queries) {
                  onEvent({
                    name: "studio_operation_success",
                    payload: {
                      operation: "update",
                      query,
                      error: undefined,
                    },
                  });
                }

                writeUpdatedRows({
                  activeTable,
                  writeUpdate: (collection as unknown as {
                    utils: {
                      writeUpdate: (row: RowRecord) => void;
                    };
                  }).utils.writeUpdate,
                  rows: result.rows,
                });

                return;
              }

              for (const mutation of transaction.mutations) {
                const [error, result] = await adapter.update(
                  {
                    changes: mutation.changes,
                    row: mutation.original,
                    table: activeTable,
                  },
                  {},
                );

                if (error) {
                  onEvent({
                    name: "studio_operation_error",
                    payload: {
                      operation: "update",
                      query: error.query,
                      error,
                    },
                  });

                  throw error;
                }

                onEvent({
                  name: "studio_operation_success",
                  payload: {
                    operation: "update",
                    query: result.query,
                    error: undefined,
                  },
                });

                writeUpdatedRows({
                  activeTable,
                  writeUpdate: (collection as unknown as {
                    utils: {
                      writeUpdate: (row: RowRecord) => void;
                    };
                  }).utils.writeUpdate,
                  rows: [result.row],
                });
              }
            },
            queryClient,
            queryFn: async ({ signal }) => {
              const executionState = getOrCreateTableQueryExecutionState(
                tableQueryExecutionStateKey,
              );
              const requestController = new AbortController();
              const requestId = executionState.latestRequestId + 1;

              executionState.latestRequestId = requestId;
              executionState.activeController?.abort();
              executionState.activeController = requestController;

              const mergedSignal = mergeAbortSignals([
                signal,
                requestController.signal,
              ]);

              try {
                const [error, result] = await adapter.query(
                  {
                    pageIndex,
                    pageSize,
                    sortOrder,
                    table: activeTable,
                    filter,
                    fullTableSearchTerm,
                  },
                  { abortSignal: mergedSignal.signal },
                );

                if (
                  mergedSignal.signal.aborted ||
                  requestController.signal.aborted ||
                  executionState.latestRequestId !== requestId
                ) {
                  throw new AbortError();
                }

                if (error) {
                  onEvent({
                    name: "studio_operation_error",
                    payload: {
                      operation: "query",
                      query: error.query,
                      error,
                    },
                  });

                  throw error;
                }

                onEvent({
                  name: "studio_operation_success",
                  payload: {
                    operation: "query",
                    query: result.query,
                    error: undefined,
                  },
                });

                upsertFilteredRowCount(
                  filteredRowCountKey,
                  result.filteredRowCount,
                  tableQueryMetaCollection,
                );

                return addRowIdToResult<AdapterQueryResult>(result, activeTable)
                  .rows;
              } finally {
                mergedSignal.cleanup();

                if (executionState.latestRequestId === requestId) {
                  executionState.activeController = null;
                }
              }
            },
            queryKey: () => [
              "schema",
              activeTable.schema,
              "table",
              activeTable.name,
              "query",
              "sortOrder",
              sortKey || "natural",
              "pageIndex",
              pageIndex,
              "pageSize",
              pageSize,
              "filter",
              filterKey,
            ],
            retry: false,
            staleTime: Infinity,
          }),
        );
      },
    );
  }, [
    activeTable,
    adapter,
    filter,
    filterKey,
    fullTableSearchTerm,
    onEvent,
    pageIndex,
    pageSize,
    queryClient,
    filteredRowCountKey,
    getOrCreateTableQueryExecutionState,
    queryScopeKey,
    sortKey,
    sortOrder,
    studio,
    tableQueryExecutionStateKey,
    tableQueryMetaCollection,
  ]);

  const { data: rows = [], isLoading } = useLiveQuery(
    (q) => {
      if (!collection) {
        return undefined;
      }

      return q
        .from({ row: collection })
        .orderBy(({ row }) => row.__ps_order, {
          direction: "asc",
          nulls: "last",
        })
        .orderBy(({ row }) => row.__ps_rowid)
        .fn.select((currentRow) => currentRow.row);
    },
    [collection],
  );
  const isQueryFetching = useIsFetching(
    queryKey ? { queryKey, exact: true } : undefined,
    queryClient,
  );

  const filteredRowCount =
    tableQueryMetaCollection.get(filteredRowCountKey)?.filteredRowCount ??
    Infinity;

  const refetch = useCallback(async () => {
    if (!collection) {
      return;
    }

    await collection.utils.refetch({ throwOnError: true });
  }, [collection]);

  return {
    activeTable,
    collection,
    rows,
    filteredRowCount,
    isFetching: isLoading || isQueryFetching > 0,
    refetch,
    queryScopeKey,
  };
}
