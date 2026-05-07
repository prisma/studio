import { AnimatePresence, motion } from "motion/react";
import { JSX } from "react";

import type { Adapter, AdapterError, Query } from "../../data";
import type { StudioLlm } from "../../data/llm";
import type { IntrospectionErrorState } from "../hooks/use-introspection";
import { useIntrospection } from "../hooks/use-introspection";
import { useNavigation } from "../hooks/use-navigation";
import { CustomTheme } from "../hooks/use-theme";
import { cn } from "../lib/utils";
import { StudioCommandPaletteProvider } from "./CommandPalette";
import { StudioContextProvider, useStudio } from "./context";
import { IntrospectionStatusNotice } from "./IntrospectionStatusNotice";
import { Navigation } from "./Navigation";
import { StudioHeader } from "./StudioHeader";
import { ConsoleView } from "./views/console/ConsoleView";
import { SchemaView } from "./views/schema/SchemaView";
import { SqlView } from "./views/sql/SqlView";
import { StreamView } from "./views/stream/StreamView";
import { ActiveTableView } from "./views/table/ActiveTableView";
import { BasicView, ViewProps } from "./views/View";

export type StudioLaunchedEventBase = {
  name: "studio_launched";
  payload: {
    embeddingType?: string;
    vendorId?: string;
    tableCount: number;
  };
};

export type StudioOperationErrorEventBase = {
  name: "studio_operation_error";
  payload: {
    operation: string;
    query: Query<unknown> | undefined;
    error: AdapterError;
  };
};

export type StudioOperationSuccessEventBase = {
  name: "studio_operation_success";
  payload: {
    operation: string;
    query: Query<unknown>;
    error: undefined;
  };
};

export type StudioOperationEventBase =
  | StudioOperationSuccessEventBase
  | StudioOperationErrorEventBase;
export type StudioOperationEvent = StudioOperationEventBase & {
  eventId: string;
  timestamp: string;
};

export type StudioEventBase =
  | StudioLaunchedEventBase
  | StudioOperationEventBase;
export type StudioEvent = StudioEventBase & {
  eventId: string;
  timestamp: string;
};

export interface StudioProps {
  adapter: Adapter;
  hasDatabase?: boolean;
  llm?: StudioLlm;
  onEvent?: (error: StudioEvent) => void;
  streamsUrl?: string;
  /**
   * Custom theme configuration or CSS string from shadcn
   * Supports both parsed theme object and raw CSS string
   */
  theme?: CustomTheme | string;
}

/**
 * Main Studio component that provides database visualization and management
 */
export function Studio(props: StudioProps) {
  const {
    adapter,
    hasDatabase = true,
    llm,
    onEvent,
    streamsUrl,
    theme,
  } = props;

  if (!adapter) {
    console.error("No adapter provided to Studio component");
    return <div>Error: No adapter provided</div>;
  }

  return (
    <StudioContextProvider
      adapter={adapter}
      hasDatabase={hasDatabase}
      llm={llm}
      onEvent={onEvent}
      streamsUrl={streamsUrl}
      theme={theme}
    >
      <StudioContent />
    </StudioContextProvider>
  );
}

const views: Record<string, (props: ViewProps) => JSX.Element | null> = {
  schema: SchemaView,
  table: ActiveTableView,
  stream: StreamView,
  console: ConsoleView,
  sql: SqlView,
  default: BasicView,
};

function StudioContent() {
  const { hasDatabase, isNavigationOpen, streamsUrl } = useStudio();
  const {
    metadata: { activeTable },
    viewParam,
  } = useNavigation();
  const { errorState, hasResolvedIntrospection, isRefetching, refetch } =
    useIntrospection();

  const containerClasses = cn(
    "flex min-w-0 max-w-full flex-col w-full h-full min-h-0 overflow-hidden font-sans",
  );

  const View = views[viewParam ?? "default"] ?? BasicView;
  const shouldShowStartupIntrospectionRecovery =
    hasDatabase &&
    viewParam === "table" &&
    activeTable == null &&
    errorState != null &&
    !hasResolvedIntrospection;
  const shouldShowDatabaseUnavailableView =
    !hasDatabase && viewParam !== "stream";

  return (
    <div
      className="ps min-h-0 min-w-0 max-w-full overflow-hidden"
      data-testid="studio-root"
      style={{ width: "100%", height: "100%" }}
    >
      <StudioCommandPaletteProvider>
        <div className={containerClasses}>
          <div
            className="relative flex h-full min-h-0 w-full min-w-0 gap-0 overflow-hidden rounded-lg bg-background"
            data-testid="studio-shell"
          >
            <AnimatePresence mode="wait">
              {isNavigationOpen && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.14 }}
                >
                  <Navigation />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="p-3 flex h-full min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden rounded-xl text-card-foreground">
              <motion.div
                className="flex h-full flex-col self-stretch overflow-hidden border border-table-border rounded-xl"
                data-testid="studio-main-pane"
                transition={{ duration: 0.14 }}
              >
                {shouldShowStartupIntrospectionRecovery ? (
                  <StartupIntrospectionRecoveryView
                    errorState={errorState}
                    isRetrying={isRefetching}
                    onRetry={() => void refetch()}
                  />
                ) : shouldShowDatabaseUnavailableView ? (
                  <DatabaseUnavailableView
                    hasStreamsServer={typeof streamsUrl === "string"}
                  />
                ) : (
                  <View />
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </StudioCommandPaletteProvider>
    </div>
  );
}

function DatabaseUnavailableView(props: { hasStreamsServer: boolean }) {
  const description = props.hasStreamsServer
    ? "This Studio session was started without a database URL. Select a stream from the sidebar to browse stream data."
    : "This Studio session was started without a database URL.";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <StudioHeader />
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
        {description}
      </div>
    </div>
  );
}

function StartupIntrospectionRecoveryView(props: {
  errorState: IntrospectionErrorState;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const { errorState, isRetrying, onRetry } = props;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <StudioHeader />
      <div className="flex flex-1 items-center justify-center p-6">
        <IntrospectionStatusNotice
          className="w-full max-w-2xl"
          description="Studio could not load schema and table metadata. Retry after checking database permissions or connectivity."
          isRetrying={isRetrying}
          message={errorState.message}
          onRetry={onRetry}
          queryPreview={errorState.queryPreview}
          source={errorState.adapterSource}
          title="Could not load schema metadata"
        />
      </div>
    </div>
  );
}
