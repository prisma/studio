import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";

import { Adapter, AdapterIntrospectResult } from "@/data";

import { useStudio } from "../studio/context";
import { defaultFilter } from "./filter-utils";
import { useQueryState } from "./nuqs";
import { useIntrospection } from "./use-introspection";
export type * from "./nuqs";

// this type is necessary because nuqs causes issues with our type bundling
type NuqsSetNullableValue<T> = (
  value: T | null | ((prev: T | null) => T | null),
) => Promise<URLSearchParams>;

type ParamName = Exclude<
  Extract<keyof ReturnType<typeof useNavigationInternal>, `${string}Param`>,
  `set${string}`
>;
type UrlValues = Partial<Record<ParamName, string>>;

function getUrlParamName(name: string) {
  if (name === "streamAggregations") {
    return "aggregations";
  }

  return name;
}

export function createUrl(values: UrlValues) {
  const params = Object.entries(values)
    .map(([key, value]) => {
      const name = getUrlParamName(
        key.endsWith("Param") ? key.slice(0, -5) : key,
      );

      if (name === "aggregations" && value.length === 0) {
        return encodeURIComponent(name);
      }

      return `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    })
    .join("&");
  return `#${params}`;
}

function getDefaultParams(args: {
  adapter: Adapter;
  hasDatabase: boolean;
  hasStreamsServer: boolean;
  introspection: AdapterIntrospectResult;
}) {
  const { adapter, hasDatabase, hasStreamsServer, introspection } = args;
  const { schemas } = introspection;
  const { defaultSchema } = adapter;

  const schema = defaultSchema ?? Object.keys(schemas)[0] ?? "public";
  const table = Object.keys(schemas[schema]?.tables ?? {})[0] ?? "";
  const filter = JSON.stringify(defaultFilter);
  const pageIndex = "0";
  const pageSize = "25";
  const search = "";
  const searchScope = "table";
  const view = !hasDatabase && hasStreamsServer ? "stream" : "table";

  return {
    schema,
    table,
    filter,
    pageIndex,
    pageSize,
    search,
    searchScope,
    view,
  };
}

function buildNavigationTableNames(introspection: AdapterIntrospectResult) {
  const rows: Array<{
    id: string;
    schema: string;
    table: string;
    qualifiedName: string;
  }> = [];

  for (const [schemaName, schema] of Object.entries(introspection.schemas)) {
    for (const tableName of Object.keys(schema.tables)) {
      rows.push({
        id: `${schemaName}.${tableName}`,
        schema: schemaName,
        table: tableName,
        qualifiedName: `${schemaName}.${tableName}`,
      });
    }
  }

  return rows;
}

/**
 * Deals with managing the URLS in *their raw form*, and does not deal with
 * sezialization.  This is emant to be a centralized hook for the url
 * management, if there are extra needs beyond simple read an writes, then
 * implement a specialized hook instead.
 */
function useNavigationInternal() {
  const {
    adapter,
    hasDatabase,
    navigationTableNamesCollection,
    queryInsights,
    streamsUrl,
  } = useStudio();
  const { data: introspection, isFetching } = useIntrospection();

  const { schemas } = introspection;
  const defaults = useMemo(
    () =>
      getDefaultParams({
        adapter,
        hasDatabase,
        hasStreamsServer: typeof streamsUrl === "string",
        introspection,
      }),
    [adapter, hasDatabase, introspection, streamsUrl],
  );

  useEffect(() => {
    const nextRows = buildNavigationTableNames(introspection);
    const nextRowsById = new Map(nextRows.map((row) => [row.id, row]));
    const existingRows = Array.from(navigationTableNamesCollection.toArray);
    const staleIds = existingRows
      .map((row) => row.id)
      .filter((id) => !nextRowsById.has(id));

    if (staleIds.length > 0) {
      navigationTableNamesCollection.delete(staleIds);
    }

    for (const row of nextRows) {
      const existing = navigationTableNamesCollection.get(row.id);

      if (!existing) {
        navigationTableNamesCollection.insert(row);
        continue;
      }

      if (
        existing.schema === row.schema &&
        existing.table === row.table &&
        existing.qualifiedName === row.qualifiedName
      ) {
        continue;
      }

      navigationTableNamesCollection.update(row.id, (draft) => {
        draft.schema = row.schema;
        draft.table = row.table;
        draft.qualifiedName = row.qualifiedName;
      });
    }
  }, [introspection, navigationTableNamesCollection]);

  const [filterParam, setFilterParam] = useQueryState("filter", {
    defaultValue: defaults.filter,
  });
  const [pageIndexParam, setPageIndexParam] = useQueryState("pageIndex", {
    defaultValue: defaults.pageIndex,
  });
  const [pageSizeParam, setPageSizeParam] = useQueryState("pageSize", {
    defaultValue: defaults.pageSize,
  });
  const [pinParam, setPinParam] = useQueryState("pin");
  const [queryInsightsSortParam, setQueryInsightsSortParam] =
    useQueryState("queryInsightsSort");
  const [queryInsightsTableParam, setQueryInsightsTableParam] =
    useQueryState("queryInsightsTable");
  const [schemaParam, setSchemaParam] = useQueryState("schema", {
    defaultValue: defaults.schema,
  });
  const [searchParam, setSearchParam] = useQueryState("search", {
    defaultValue: defaults.search,
  });
  const [searchScopeParam, setSearchScopeParam] = useQueryState("searchScope", {
    defaultValue: defaults.searchScope,
  });
  const [sortParam, setSortParam] = useQueryState("sort");
  const [streamAggregationRangeParam, setStreamAggregationRangeParam] =
    useQueryState("streamAggregationRange");
  const [streamAggregationsParam, setStreamAggregationsParam] =
    useQueryState("aggregations");
  const [streamFollowParam, setStreamFollowParam] =
    useQueryState("streamFollow");
  const [streamRoutingKeyParam, setStreamRoutingKeyParam] =
    useQueryState("streamRoutingKey");
  const [streamParam, setStreamParam] = useQueryState("stream");
  const [tableParam, setTableParam] = useQueryState("table", {
    defaultValue: defaults.table,
  });
  const [viewParam, setViewParam] = useQueryState("view", {
    defaultValue: defaults.view,
  });

  // If URL params are stale from a previous database, fall back to current defaults.
  const resolvedSchemaParam =
    hasDatabase && schemaParam && schemas[schemaParam]
      ? schemaParam
      : defaults.schema;
  const activeSchema = resolvedSchemaParam
    ? schemas[resolvedSchemaParam]
    : undefined;
  const activeTables = activeSchema ? activeSchema.tables : undefined;
  const resolvedTableParam =
    tableParam && activeTables?.[tableParam]
      ? tableParam
      : Object.keys(activeTables ?? {})[0];
  const activeTable =
    activeTables && resolvedTableParam
      ? activeTables[resolvedTableParam]
      : undefined;
  const resolvedViewParam =
    !hasDatabase && typeof streamsUrl === "string"
      ? "stream"
      : viewParam === "query-insights" && (!hasDatabase || !queryInsights)
        ? defaults.view
        : viewParam;

  const metadata = useMemo(
    () => ({
      activeSchema,
      activeTables,
      activeTable,
      isFetching,
    }),
    [activeSchema, activeTables, activeTable, isFetching],
  );

  return {
    metadata,
    createUrl,
    filterParam,
    pageIndexParam,
    pageSizeParam,
    pinParam,
    queryInsightsSortParam,
    queryInsightsTableParam,
    schemaParam,
    searchParam,
    searchScopeParam,
    sortParam,
    streamAggregationRangeParam,
    streamAggregationsParam,
    streamFollowParam,
    streamRoutingKeyParam,
    streamParam,
    tableParam,
    viewParam: resolvedViewParam,
    setFilterParam: setFilterParam as NuqsSetNullableValue<string>,
    setPageIndexParam: setPageIndexParam as NuqsSetNullableValue<string>,
    setPageSizeParam: setPageSizeParam as NuqsSetNullableValue<string>,
    setPinParam: setPinParam as NuqsSetNullableValue<string>,
    setQueryInsightsSortParam:
      setQueryInsightsSortParam as NuqsSetNullableValue<string>,
    setQueryInsightsTableParam:
      setQueryInsightsTableParam as NuqsSetNullableValue<string>,
    setSchemaParam: setSchemaParam as NuqsSetNullableValue<string>,
    setSearchParam: setSearchParam as NuqsSetNullableValue<string>,
    setSearchScopeParam: setSearchScopeParam as NuqsSetNullableValue<string>,
    setSortParam: setSortParam as NuqsSetNullableValue<string>,
    setStreamAggregationRangeParam:
      setStreamAggregationRangeParam as NuqsSetNullableValue<string>,
    setStreamAggregationsParam:
      setStreamAggregationsParam as NuqsSetNullableValue<string>,
    setStreamFollowParam: setStreamFollowParam as NuqsSetNullableValue<string>,
    setStreamRoutingKeyParam:
      setStreamRoutingKeyParam as NuqsSetNullableValue<string>,
    setStreamParam: setStreamParam as NuqsSetNullableValue<string>,
    setTableParam: setTableParam as NuqsSetNullableValue<string>,
    setViewParam: setViewParam as NuqsSetNullableValue<string>,
  };
}

const NavigationContext = createContext<
  ReturnType<typeof useNavigationInternal> | undefined
>(undefined);

/**
 * useNavigationInternal is placed into a single context to minimize re-renders.
 */
export function NavigationContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const navigation = useNavigationInternal();

  return (
    <NavigationContext.Provider value={navigation}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error(
      "useNavigationContext must be used within a NavigationContextProvider",
    );
  }
  return context;
}
