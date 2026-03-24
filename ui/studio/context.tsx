import {
  type Collection,
  createCollection,
  localOnlyCollectionOptions,
  localStorageCollectionOptions,
  useLiveQuery,
} from "@tanstack/react-db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { hasWindow, isCI, process } from "std-env";

import type { Adapter, BigIntString, NumericString } from "@/data";
import {
  isStudioLlmResponse,
  type StudioLlm,
  StudioLlmError,
  type StudioLlmRequest,
} from "@/data/llm";

import { check } from "../../checkpoint";
import { Toaster } from "../components/ui/sonner";
import type { EditingFilterGroup } from "../hooks/filter-utils";
import { createUrl, NavigationContextProvider } from "../hooks/use-navigation";
import { CustomTheme, useTheme } from "../hooks/use-theme";
import shortUUID from "../lib/short-uuid";
import { NuqsHashAdapter } from "./NuqsHashAdapter";
import { StudioEvent, StudioEventBase, StudioOperationEvent } from "./Studio";
import { instrumentTanStackCollectionMutations } from "./tanstack-db-mutation-guard";

declare const VERSION_INJECTED_AT_BUILD_TIME: string;

const STUDIO_UI_STATE_ID = "studio-ui-state";
const STUDIO_UI_STORAGE_KEY = "prisma-studio-ui-state-v1";
const SQL_EDITOR_STATE_ID = "studio-sql-editor-state";
const SQL_EDITOR_STORAGE_KEY = "prisma-studio-sql-editor-state-v1";
const DEFAULT_TABLE_PAGE_SIZE = 25;
const SYSTEM_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

export type StudioThemeMode = "dark" | "light" | "system";

type DocumentWithViewTransition = Document & {
  startViewTransition?: (
    update: () => void | Promise<void>,
  ) => {
    finished: Promise<void>;
    ready: Promise<void>;
    skipTransition: () => void;
    updateCallbackDone: Promise<void>;
  };
};

function isCheckpointDisabled(): boolean {
  return process.env.CHECKPOINT_DISABLE?.trim() === "1";
}

function getDocumentDarkMode(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

function getSystemThemeMediaQueryList(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia(SYSTEM_THEME_MEDIA_QUERY);
}

function getSystemDarkMode(): boolean {
  return getSystemThemeMediaQueryList()?.matches ?? getDocumentDarkMode();
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches;
}

function getViewTransitionStarter():
  | DocumentWithViewTransition["startViewTransition"]
  | undefined {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    return undefined;
  }

  const documentWithViewTransition = document as DocumentWithViewTransition;
  const startViewTransition = documentWithViewTransition.startViewTransition;

  if (typeof startViewTransition !== "function") {
    return undefined;
  }

  return startViewTransition.bind(documentWithViewTransition);
}

function normalizeThemeMode(
  themeMode: unknown,
  isDarkMode: unknown,
): StudioThemeMode {
  if (themeMode === "dark" || themeMode === "light" || themeMode === "system") {
    return themeMode;
  }

  if (typeof isDarkMode === "boolean") {
    return isDarkMode ? "dark" : "light";
  }

  return "system";
}

export interface StudioUiState {
  id: string;
  isNavigationOpen: boolean;
  isDarkMode: boolean;
  themeMode: StudioThemeMode;
  tablePageSize: number;
  isInfiniteScrollEnabled: boolean;
}

export interface TableUiState {
  id: string;
  editingFilter: EditingFilterGroup;
  rowSelectionState: Record<string, boolean>;
  stagedRows: Record<string, unknown>[];
  stagedUpdates?: Array<{
    changes: Record<string, unknown>;
    row: Record<string, unknown>;
    rowId: string;
  }>;
}

export interface TableQueryMetaState {
  id: string;
  filteredRowCount: number | bigint | NumericString | BigIntString;
}

export interface TableQueryExecutionState {
  activeController: AbortController | null;
  latestRequestId: number;
}

export interface StudioLocalUiState {
  id: string;
  value: unknown;
}

export interface SqlEditorState {
  aiPromptHistory?: string[];
  id: string;
  queryText?: string;
}

export interface NavigationTableNameState {
  id: string;
  schema: string;
  table: string;
  qualifiedName: string;
}

interface SupportsCleanup {
  cleanup?: () => Promise<void>;
}

function hasCleanup(value: unknown): value is SupportsCleanup {
  return typeof value === "object" && value !== null && "cleanup" in value;
}

function getDefaultStudioUiState(): StudioUiState {
  return {
    id: STUDIO_UI_STATE_ID,
    isNavigationOpen: true,
    isDarkMode: getSystemDarkMode(),
    themeMode: "system",
    tablePageSize: DEFAULT_TABLE_PAGE_SIZE,
    isInfiniteScrollEnabled: false,
  };
}

function normalizeTablePageSize(pageSize: unknown): number {
  if (
    typeof pageSize === "number" &&
    Number.isInteger(pageSize) &&
    Number.isSafeInteger(pageSize) &&
    pageSize > 0
  ) {
    return pageSize;
  }

  return DEFAULT_TABLE_PAGE_SIZE;
}

function normalizeStudioUiState(
  state: Partial<StudioUiState> | StudioUiState | undefined,
): StudioUiState {
  const defaults = getDefaultStudioUiState();
  const themeMode = normalizeThemeMode(state?.themeMode, state?.isDarkMode);
  const isDarkMode =
    themeMode === "system" ? getSystemDarkMode() : themeMode === "dark";

  return {
    ...defaults,
    ...state,
    isDarkMode,
    themeMode,
    tablePageSize: normalizeTablePageSize(state?.tablePageSize),
    isInfiniteScrollEnabled: state?.isInfiniteScrollEnabled ?? false,
  };
}

/**
 * Studio context value interface
 */
interface StudioContextValue {
  adapter: Adapter;
  llm?: StudioLlm;
  hasAiFilter: boolean;
  hasAiSql: boolean;
  requestLlm: (request: StudioLlmRequest) => Promise<string>;
  onEvent: (event: StudioEventBase) => void;
  operationEvents: StudioOperationEvent[];
  isNavigationOpen: boolean;
  toggleNavigation: () => void;
  isDarkMode: boolean;
  themeMode: StudioThemeMode;
  setThemeMode: (themeMode: StudioThemeMode) => void;
  tablePageSize: number;
  setTablePageSize: (pageSize: number) => void;
  isInfiniteScrollEnabled: boolean;
  setInfiniteScrollEnabled: (enabled: boolean) => void;
  hasCustomTheme: boolean;
  queryClient: QueryClient;
  tableUiStateCollection: Collection<TableUiState, string | number>;
  tableQueryMetaCollection: Collection<TableQueryMetaState, string | number>;
  uiLocalStateCollection: Collection<StudioLocalUiState, string | number>;
  sqlEditorStateCollection: Collection<SqlEditorState, string | number>;
  navigationTableNamesCollection: Collection<
    NavigationTableNameState,
    string | number
  >;
  getOrCreateRowsCollection<T>(key: string, factory: () => T): T;
  getOrCreateTableQueryExecutionState: (key: string) => TableQueryExecutionState;
}

/**
 * Context for sharing Studio state across components
 */
const StudioContext = createContext<StudioContextValue | undefined>(undefined);

export type StudioContextProviderProps = PropsWithChildren<{
  adapter: Adapter;
  llm?: StudioLlm;
  onEvent?: (event: StudioEvent) => void;
  theme?: CustomTheme | string;
}>;

export function StudioContextProvider(props: StudioContextProviderProps) {
  const {
    children,
    onEvent: emitEvent,
    adapter,
    llm,
    theme,
  } = props;

  const queryClientRef = useRef(new QueryClient());
  const signatureRef = useRef(shortUUID.generate());
  const rowsCollectionCacheRef = useRef(new Map<string, unknown>());
  const tableQueryExecutionStateCacheRef = useRef(
    new Map<string, TableQueryExecutionState>(),
  );
  const lastObservedSystemDarkModeRef = useRef(getSystemDarkMode());
  const studioUiCollectionRef = useRef(
    instrumentTanStackCollectionMutations(
      createCollection(
        localStorageCollectionOptions<StudioUiState>({
          id: STUDIO_UI_STATE_ID,
          storageKey: STUDIO_UI_STORAGE_KEY,
          getKey(item) {
            return item.id;
          },
        }),
      ),
      { collectionName: "studio-ui-state" },
    ),
  );
  const operationEventsCollectionRef = useRef(
    instrumentTanStackCollectionMutations(
      createCollection(
        localOnlyCollectionOptions<StudioOperationEvent>({
          id: "studio-operation-events",
          getKey(item) {
            return item.eventId;
          },
          initialData: [],
        }),
      ),
      { collectionName: "studio-operation-events" },
    ),
  );
  const tableUiStateCollectionRef = useRef(
    instrumentTanStackCollectionMutations(
      createCollection(
        localOnlyCollectionOptions<TableUiState>({
          id: "studio-table-ui-state",
          getKey(item) {
            return item.id;
          },
          initialData: [],
        }),
      ),
      { collectionName: "studio-table-ui-state" },
    ),
  );
  const tableQueryMetaCollectionRef = useRef(
    instrumentTanStackCollectionMutations(
      createCollection(
        localOnlyCollectionOptions<TableQueryMetaState>({
          id: "studio-table-query-meta",
          getKey(item) {
            return item.id;
          },
          initialData: [],
        }),
      ),
      { collectionName: "studio-table-query-meta" },
    ),
  );
  const uiLocalStateCollectionRef = useRef(
    instrumentTanStackCollectionMutations(
      createCollection(
        localOnlyCollectionOptions<StudioLocalUiState>({
          id: "studio-local-ui-state",
          getKey(item) {
            return item.id;
          },
          initialData: [],
        }),
      ),
      { collectionName: "studio-local-ui-state" },
    ),
  );
  const sqlEditorStateCollectionRef = useRef(
    instrumentTanStackCollectionMutations(
      createCollection(
        localStorageCollectionOptions<SqlEditorState>({
          id: SQL_EDITOR_STATE_ID,
          storageKey: SQL_EDITOR_STORAGE_KEY,
          getKey(item) {
            return item.id;
          },
        }),
      ),
      { collectionName: "studio-sql-editor-state" },
    ),
  );
  const navigationTableNamesCollectionRef = useRef(
    instrumentTanStackCollectionMutations(
      createCollection(
        localOnlyCollectionOptions<NavigationTableNameState>({
          id: "studio-navigation-table-names",
          getKey(item) {
            return item.id;
          },
          initialData: [],
        }),
      ),
      { collectionName: "studio-navigation-table-names" },
    ),
  );

  const queryClient = queryClientRef.current;
  const studioUiCollection = studioUiCollectionRef.current;
  const operationEventsCollection = operationEventsCollectionRef.current;
  const tableUiStateCollection = tableUiStateCollectionRef.current;
  const tableQueryMetaCollection = tableQueryMetaCollectionRef.current;
  const uiLocalStateCollection = uiLocalStateCollectionRef.current;
  const sqlEditorStateCollection = sqlEditorStateCollectionRef.current;
  const navigationTableNamesCollection =
    navigationTableNamesCollectionRef.current;

  const { data: studioUiRows = [] } = useLiveQuery(studioUiCollection);
  const { data: operationEventsRows = [] } = useLiveQuery(
    operationEventsCollection,
  );

  const studioUiState = normalizeStudioUiState(
    studioUiRows.find((item) => item.id === STUDIO_UI_STATE_ID),
  );

  const operationEvents = useMemo(
    () =>
      [...operationEventsRows].sort(
        (left, right) =>
          new Date(left.timestamp).getTime() -
          new Date(right.timestamp).getTime(),
      ),
    [operationEventsRows],
  );

  const updateStudioUiState = useCallback(
    (updater: (draft: StudioUiState) => void) => {
      const existingState = studioUiCollection.get(STUDIO_UI_STATE_ID);

      if (!existingState) {
        const nextState = getDefaultStudioUiState();
        updater(nextState);
        studioUiCollection.insert(nextState);
        return;
      }

      studioUiCollection.update(STUDIO_UI_STATE_ID, updater);
    },
    [studioUiCollection],
  );

  const getOrCreateRowsCollection = useCallback(
    <T,>(key: string, factory: () => T): T => {
      const existingCollection = rowsCollectionCacheRef.current.get(key) as
        | T
        | undefined;

      if (existingCollection != null) {
        return existingCollection;
      }

      const newCollection = instrumentTanStackCollectionMutations(factory(), {
        collectionName: `rows:${key}`,
      });
      rowsCollectionCacheRef.current.set(key, newCollection);

      return newCollection;
    },
    [],
  );

  const clearRowsCollections = useCallback(() => {
    for (const collection of rowsCollectionCacheRef.current.values()) {
      if (hasCleanup(collection) && typeof collection.cleanup === "function") {
        void collection.cleanup().catch((error) => {
          console.error("Failed to cleanup cached rows collection", error);
        });
      }
    }

    rowsCollectionCacheRef.current.clear();
  }, []);

  const getOrCreateTableQueryExecutionState = useCallback((key: string) => {
    const existingState = tableQueryExecutionStateCacheRef.current.get(key);

    if (existingState != null) {
      return existingState;
    }

    const nextState: TableQueryExecutionState = {
      activeController: null,
      latestRequestId: 0,
    };

    tableQueryExecutionStateCacheRef.current.set(key, nextState);

    return nextState;
  }, []);

  // Ensure the persisted UI state row exists.
  useEffect(() => {
    if (studioUiCollection.has(STUDIO_UI_STATE_ID)) {
      return;
    }

    studioUiCollection.insert(getDefaultStudioUiState());
  }, [studioUiCollection]);

  useEffect(() => {
    // if the adapter has been changed, then we need to reload
    for (const state of tableQueryExecutionStateCacheRef.current.values()) {
      state.activeController?.abort();
    }

    tableQueryExecutionStateCacheRef.current.clear();
    clearRowsCollections();
    void queryClient.resetQueries({ exact: false, queryKey: [] });
  }, [adapter, clearRowsCollections, queryClient]);

  // Watch for changes to the HTML element's class attribute.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const systemThemeMediaQuery = getSystemThemeMediaQueryList();

    const syncDarkMode = () => {
      const isSystemDarkMode = getSystemDarkMode();
      const existingState = studioUiCollection.get(STUDIO_UI_STATE_ID);

      if (!existingState) {
        lastObservedSystemDarkModeRef.current = isSystemDarkMode;
        return;
      }

      if (
        normalizeThemeMode(
          existingState.themeMode,
          existingState.isDarkMode,
        ) !== "system"
      ) {
        lastObservedSystemDarkModeRef.current = isSystemDarkMode;
        return;
      }

      if (existingState.isDarkMode === isSystemDarkMode) {
        lastObservedSystemDarkModeRef.current = isSystemDarkMode;
        return;
      }

      updateStudioUiState((draft) => {
        draft.isDarkMode = isSystemDarkMode;
        draft.themeMode = "system";
      });
      lastObservedSystemDarkModeRef.current = isSystemDarkMode;
    };

    syncDarkMode();

    if (systemThemeMediaQuery) {
      const handleSystemThemeChange = () => {
        if (lastObservedSystemDarkModeRef.current === getSystemDarkMode()) {
          return;
        }

        syncDarkMode();
      };

      if (typeof systemThemeMediaQuery.addEventListener === "function") {
        systemThemeMediaQuery.addEventListener("change", handleSystemThemeChange);

        return () => {
          systemThemeMediaQuery.removeEventListener(
            "change",
            handleSystemThemeChange,
          );
        };
      }

      systemThemeMediaQuery.addListener(handleSystemThemeChange);

      return () => {
        systemThemeMediaQuery.removeListener(handleSystemThemeChange);
      };
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          if (lastObservedSystemDarkModeRef.current === getDocumentDarkMode()) {
            continue;
          }

          syncDarkMode();
          break;
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [studioUiCollection, updateStudioUiState]);

  // Use the theme hook to handle custom themes.
  const { hasCustomTheme } = useTheme(theme, studioUiState.isDarkMode);

  const onEvent = useCallback(
    (event: StudioEventBase) => {
      const { name, payload } = event;

      // Always forward the raw error to the user as a toast.
      if (name === "studio_operation_error") {
        // These can be emitted by our tanstack infra.
        if (payload.error.name === "AbortError") {
          return;
        }

        toast.error(`"${payload.operation}" operation failed`, {
          action: {
            label: "Console",
            onClick: () => {
              window.location.hash = createUrl({ viewParam: "console" });
            },
          },
        });
      }

      const eventId = shortUUID.generate();
      const timestamp = new Date().toISOString();

      const enrichedEvent = {
        ...event,
        eventId,
        timestamp,
      } as const satisfies StudioEvent;

      if (
        enrichedEvent.name === "studio_operation_success" ||
        enrichedEvent.name === "studio_operation_error"
      ) {
        operationEventsCollection.insert(enrichedEvent);

        const overflow = operationEventsCollection.size - 100;

        if (overflow > 0) {
          const staleEvents = [...operationEventsCollection.toArray]
            .sort(
              (left, right) =>
                new Date(left.timestamp).getTime() -
                new Date(right.timestamp).getTime(),
            )
            .slice(0, overflow)
            .map((event) => event.eventId);

          if (staleEvents.length > 0) {
            operationEventsCollection.delete(staleEvents);
          }
        }
      }

      emitEvent?.(enrichedEvent);

      // TODO: allow to opt-out in the future, on certain pricing plans.
      // TODO: unblock for all events in the future.
      if (
        name === "studio_launched" &&
        hasWindow &&
        !isCI &&
        !isCheckpointDisabled() &&
        !isPrismaVSCodeExtension() &&
        !isPrismaPlatform()
      ) {
        void check({
          additionalData: {
            eventPayload: payload,
            variant: "free",
          },
          command: name,
          eventId,
          product: "prisma-studio-embedded",
          signature: signatureRef.current,
          skipUpdateCheck: true,
          timestamp: new Date(timestamp),
          version: VERSION_INJECTED_AT_BUILD_TIME,
        }).catch((error) => {
          console.error(error);
        });
      }
    },
    [emitEvent, operationEventsCollection],
  );

  const toggleNavigation = useCallback(() => {
    updateStudioUiState((draft) => {
      draft.isNavigationOpen = !draft.isNavigationOpen;
    });
  }, [updateStudioUiState]);

  const setThemeMode = useCallback(
    (themeMode: StudioThemeMode) => {
      const applyThemeMode = () => {
        flushSync(() => {
          updateStudioUiState((draft) => {
            draft.themeMode = themeMode;
            draft.isDarkMode =
              themeMode === "system" ? getSystemDarkMode() : themeMode === "dark";
          });
        });
      };

      const startViewTransition = getViewTransitionStarter();

      if (typeof startViewTransition === "function") {
        startViewTransition(() => {
          applyThemeMode();
        });
        return;
      }

      applyThemeMode();
    },
    [updateStudioUiState],
  );

  const setTablePageSize = useCallback(
    (pageSize: number) => {
      const normalizedPageSize = normalizeTablePageSize(pageSize);

      updateStudioUiState((draft) => {
        draft.tablePageSize = normalizedPageSize;
      });
    },
    [updateStudioUiState],
  );

  const setInfiniteScrollEnabled = useCallback(
    (enabled: boolean) => {
      updateStudioUiState((draft) => {
        draft.isInfiniteScrollEnabled = enabled;
      });
    },
    [updateStudioUiState],
  );

  const requestLlm = useCallback(
    async (request: StudioLlmRequest): Promise<string> => {
      if (typeof llm === "function") {
        const response = await llm(request);

        if (!isStudioLlmResponse(response)) {
          throw new StudioLlmError({
            code: "request-failed",
            message: "Studio llm() returned an invalid response shape.",
          });
        }

        if (response.ok) {
          return response.text;
        }

        throw new StudioLlmError({
          code: response.code,
          message: response.message,
        });
      }

      throw new StudioLlmError({
        code: "not-configured",
        message: "Studio AI is not configured.",
      });
    },
    [llm],
  );

  const hasAiFilter = typeof llm === "function";
  const hasAiSql = typeof llm === "function";

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <StudioContext.Provider
        value={{
          adapter,
          llm,
          hasAiFilter,
          hasAiSql,
          requestLlm,
          onEvent,
          operationEvents,
          isNavigationOpen: studioUiState.isNavigationOpen,
          toggleNavigation,
          isDarkMode: studioUiState.isDarkMode,
          themeMode: studioUiState.themeMode,
          setThemeMode,
          tablePageSize: studioUiState.tablePageSize,
          setTablePageSize,
          isInfiniteScrollEnabled: studioUiState.isInfiniteScrollEnabled,
          setInfiniteScrollEnabled,
          hasCustomTheme,
          queryClient,
          tableUiStateCollection,
          tableQueryMetaCollection,
          uiLocalStateCollection,
          sqlEditorStateCollection,
          navigationTableNamesCollection,
          getOrCreateRowsCollection,
          getOrCreateTableQueryExecutionState,
        }}
      >
        <NuqsHashAdapter>
          <NavigationContextProvider>{children}</NavigationContextProvider>
        </NuqsHashAdapter>
      </StudioContext.Provider>
    </QueryClientProvider>
  );
}

export function useOptionalStudio(): StudioContextValue | undefined {
  return useContext(StudioContext);
}

/**
 * Hook to access Studio context
 * @throws Error if used outside of Studio.Provider
 */
export function useStudio(): StudioContextValue {
  const context = useOptionalStudio();

  if (!context) {
    throw new Error(
      "`useStudio` must be used within a `StudioContext.Provider`",
    );
  }

  return context;
}

function isPrismaVSCodeExtension(): boolean {
  return (
    isVSCodeExtension() && "__PVCE__" in window && window.__PVCE__ === true
  );
}

function isVSCodeExtension(): boolean {
  return (
    hasWindow &&
    "acquireVsCodeApi" in window &&
    typeof window.acquireVsCodeApi === "function"
  );
}

function isPrismaPlatform(): boolean {
  if (!hasWindow) {
    return false;
  }

  const { hostname } = window.location;

  return (
    ("__PDPCP__" in window && window.__PDPCP__ === true) ||
    hostname.includes("console.prisma.io") ||
    hostname.includes("datacdn.workers.dev")
  );
}
