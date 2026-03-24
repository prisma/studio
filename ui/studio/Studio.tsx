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
  const { adapter, llm, onEvent, streamsUrl, theme } = props;

  if (!adapter) {
    console.error("No adapter provided to Studio component");
    return <div>Error: No adapter provided</div>;
  }

  return (
    <StudioContextProvider
      adapter={adapter}
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
  console: ConsoleView,
  sql: SqlView,
  default: BasicView,
};

function StudioContent() {
  const { isNavigationOpen } = useStudio();
  const {
    metadata: { activeTable },
    viewParam,
  } = useNavigation();
  const { errorState, hasResolvedIntrospection, isRefetching, refetch } =
    useIntrospection();

  const containerClasses = cn("flex flex-col w-full h-full font-sans");

  const View = views[viewParam ?? "default"] ?? BasicView;
  const shouldShowStartupIntrospectionRecovery =
    viewParam === "table" &&
    activeTable == null &&
    errorState != null &&
    !hasResolvedIntrospection;

  return (
    <div className="ps" style={{ width: "100%", height: "100%" }}>
      <StudioCommandPaletteProvider>
        <div className={containerClasses}>
          <div className="flex gap-0 bg-background relative min-h-full rounded-lg">
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

            <motion.div
              className="flex w-full bg-secondary flex-col p-px rounded-lg self-start h-full min-h-full max-h-full overflow-clip"
              transition={{ duration: 0.14 }}
            >
              {shouldShowStartupIntrospectionRecovery ? (
                <StartupIntrospectionRecoveryView
                  errorState={errorState}
                  isRetrying={isRefetching}
                  onRetry={() => void refetch()}
                />
              ) : (
                <View />
              )}
            </motion.div>
          </div>
        </div>
      </StudioCommandPaletteProvider>
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
