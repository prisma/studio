import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import type { AdapterError, AdapterIntrospectResult } from "../../data/adapter";
import type { Query } from "../../data/query";
import { useStudio } from "../studio/context";

export interface IntrospectionErrorState {
  adapterSource: string;
  message: string;
  operation: "introspect";
  query: Query<unknown> | undefined;
  queryPreview: string | null;
}

function createInitialIntrospectionResult(
  defaultSchema: string | undefined,
): AdapterIntrospectResult {
  return {
    schemas: {
      [defaultSchema || "db"]: {
        name: defaultSchema || "db",
        tables: {},
      },
    },
    timezone: "UTC",
    filterOperators: [],
    query: { parameters: [], sql: "" },
  } satisfies AdapterIntrospectResult;
}

function getQueryPreview(query: Query<unknown> | undefined): string | null {
  if (!query?.sql) {
    return null;
  }

  const preview = query.sql.slice(0, 120);
  return query.sql.length > 120 ? `${preview}...` : preview;
}

export function useIntrospection() {
  const { adapter, onEvent } = useStudio();
  const hasEmittedLaunchEventRef = useRef(false);

  useEffect(() => {
    hasEmittedLaunchEventRef.current = false;
  }, [adapter]);

  const queryResult = useQuery<AdapterIntrospectResult, AdapterError>({
    queryKey: ["introspection"],
    queryFn: async ({ signal }) => {
      const [error, result] = await adapter.introspect({ abortSignal: signal });

      if (error) {
        onEvent({
          name: "studio_operation_error",
          payload: {
            operation: "introspect",
            query: error.query,
            error: error,
          },
        });

        throw error;
      }

      onEvent({
        name: "studio_operation_success",
        payload: {
          operation: "introspect",
          query: result.query,
          error: undefined,
        },
      });

      if (!hasEmittedLaunchEventRef.current) {
        const tableCount = Object.values(result.schemas).reduce(
          (sum, schema) => {
            return sum + Object.keys(schema.tables).length;
          },
          0,
        );

        onEvent({
          name: "studio_launched",
          payload: {
            tableCount,
          },
        });
        hasEmittedLaunchEventRef.current = true;
      }

      return result;
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    retryOnMount: false,
    staleTime: Infinity,
  });

  const fallbackData = useMemo(() => {
    return createInitialIntrospectionResult(adapter.defaultSchema);
  }, [adapter.defaultSchema]);
  const hasResolvedIntrospection = queryResult.data != null;
  const errorState = useMemo<IntrospectionErrorState | null>(() => {
    if (!queryResult.error) {
      return null;
    }

    return {
      adapterSource:
        queryResult.error.adapterSource ??
        adapter.capabilities?.sqlDialect ??
        adapter.defaultSchema ??
        "unknown",
      message: queryResult.error.message,
      operation: "introspect",
      query: queryResult.error.query,
      queryPreview: getQueryPreview(queryResult.error.query),
    };
  }, [
    adapter.capabilities?.sqlDialect,
    adapter.defaultSchema,
    queryResult.error,
  ]);

  return {
    ...queryResult,
    data: queryResult.data ?? fallbackData,
    errorState,
    hasResolvedIntrospection,
    isUsingLastKnownGoodData: queryResult.isError && queryResult.data != null,
    isUsingPlaceholderData: queryResult.data == null,
  };
}
