import { Slot } from "@radix-ui/react-slot";
import {
  Activity,
  CalendarClock,
  Code2,
  Cpu,
  Database,
  History,
  Layers,
  type LucideIcon,
  Network,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Table2,
  Waves,
  Waypoints,
  Workflow,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import PrismaWordmark from "../../assets/prisma-wordmark.svg";
import PrismaWordmarkWhite from "../../assets/prisma-wordmark-white.svg";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { useIntrospection } from "../hooks/use-introspection";
import { useHasMigrationHistory } from "../hooks/use-migrations";
import { useNavigation } from "../hooks/use-navigation";
import { useNavigationTableList } from "../hooks/use-navigation-table-list";
import { useStreams } from "../hooks/use-streams";
import {
  useTemporalAttention,
  useTemporalCapabilities,
  useTemporalNamespaces,
  useTemporalWorkflows,
} from "../hooks/use-temporal";
import { useUiState } from "../hooks/use-ui-state";
import { isMacPlatform } from "../lib/platform";
import { cn } from "../lib/utils";
import { useCommandPalette } from "./CommandPalette";
import {
  MAX_NAVIGATION_WIDTH,
  MIN_NAVIGATION_WIDTH,
  useStudio,
} from "./context";
import { IntrospectionStatusNotice } from "./IntrospectionStatusNotice";
import {
  getStudioServiceForView,
  SERVICE_LOCATIONS_UI_STATE_KEY,
  STREAM_SEARCH_UI_STATE_KEY,
  type StreamSearchUiState,
  type StudioService,
  type StudioServiceLocations,
  TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY,
  TABLE_SEARCH_UI_STATE_KEY,
  type TableGridFocusRequestUiState,
  type TableSearchUiState,
} from "./navigation-ui-state";
import {
  TEMPORAL_BUILT_IN_VIEWS,
  useTemporalSavedViews,
} from "./views/temporal/temporal-saved-views";

const NO_SERVICE_LOCATIONS: StudioServiceLocations = {};
const DATABASE_SERVICE_LABELS = {
  mysql: "MySQL",
  postgresql: "Postgres",
  sqlite: "SQLite",
};
// Thin scrollbar that only appears on hover, so it never sits against the page edge.
const hoverScrollbarClasses =
  "[scrollbar-width:thin] [scrollbar-color:transparent_transparent] hover:[scrollbar-color:var(--border)_transparent]";
const zoneHeadingClasses =
  "font-mono text-2xs font-normal uppercase tracking-loose text-muted-foreground";

interface ServiceLink {
  attention: string | null;
  href: string;
  icon: LucideIcon;
  id: StudioService;
  label: string;
}

type NavigationProps = {
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Navigation({ className }: NavigationProps) {
  const { metadata, createUrl, streamParam, viewParam, schemaParam } =
    useNavigation();
  const {
    adapter,
    hasDatabase,
    hasQueryInsights,
    isDarkMode,
    navigationWidth,
    setNavigationWidth,
    temporalUrl,
  } = useStudio();
  const [serviceLocations] = useUiState<StudioServiceLocations>(
    SERVICE_LOCATIONS_UI_STATE_KEY,
    NO_SERVICE_LOCATIONS,
  );
  const temporalNavigation = useTemporalNavigation();
  const { isFetching, activeTable } = metadata;
  const { errorState, hasResolvedIntrospection, isRefetching, refetch } =
    useIntrospection();
  const hasMigrationHistory = useHasMigrationHistory();
  const [tableSearchUiState, setTableSearchUiState] =
    useUiState<TableSearchUiState>(TABLE_SEARCH_UI_STATE_KEY, {
      isOpen: false,
      term: "",
    });
  const [streamSearchUiState, setStreamSearchUiState] =
    useUiState<StreamSearchUiState>(STREAM_SEARCH_UI_STATE_KEY, {
      isOpen: false,
      term: "",
    });
  const [, setTableGridFocusRequest] = useUiState<TableGridFocusRequestUiState>(
    TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY,
    {
      requestId: 0,
      tableId: null,
    },
  );
  const [highlightedTableIndex, setHighlightedTableIndex] = useState(-1);
  const [highlightedStreamIndex, setHighlightedStreamIndex] = useState(-1);
  const [draftNavigationWidth, setDraftNavigationWidth] = useState<
    number | null
  >(null);
  const [isNavigationResizing, setIsNavigationResizing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const streamSearchInputRef = useRef<HTMLInputElement | null>(null);
  const navigationResizeStateRef = useRef<{
    lastClientX: number;
    startWidth: number;
    startX: number;
  } | null>(null);
  const { tables, isSearchActive: tableSearchActive } = useNavigationTableList({
    schema: schemaParam,
    searchTerm: tableSearchUiState.term,
  });
  const tableListKey = useMemo(
    () => tables.map((table) => table.id).join("|"),
    [tables],
  );
  const activeTableId = activeTable
    ? `${activeTable.schema}.${activeTable.name}`
    : null;
  const isInitialIntrospectionLoad = isFetching && !hasResolvedIntrospection;
  const hasStartupIntrospectionFailure =
    errorState != null && !hasResolvedIntrospection;
  const hasRecoverableIntrospectionWarning =
    errorState != null && hasResolvedIntrospection;
  const resolvedNavigationWidth = draftNavigationWidth ?? navigationWidth;
  const {
    hasStreamsServer,
    isError: hasStreamsError,
    isLoading: isStreamsLoading,
    refetch: refetchStreams,
    streams,
  } = useStreams();
  const filteredStreams = useMemo(() => {
    const term = streamSearchUiState.term.trim().toLowerCase();

    if (term.length === 0) {
      return streams;
    }

    return streams.filter((stream) => stream.name.toLowerCase().includes(term));
  }, [streamSearchUiState.term, streams]);
  const streamListKey = useMemo(
    () => filteredStreams.map((stream) => stream.name).join("|"),
    [filteredStreams],
  );
  const isStreamSearchActive = streamSearchUiState.term.trim().length > 0;

  const clampNavigationWidth = useCallback((width: number) => {
    const viewportMaxWidth =
      typeof window === "undefined"
        ? MAX_NAVIGATION_WIDTH
        : Math.max(
            MIN_NAVIGATION_WIDTH,
            Math.min(MAX_NAVIGATION_WIDTH, Math.floor(window.innerWidth * 0.6)),
          );

    return Math.min(
      viewportMaxWidth,
      Math.max(MIN_NAVIGATION_WIDTH, Math.round(width)),
    );
  }, []);

  useEffect(() => {
    if (!tableSearchUiState.isOpen) {
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [tableSearchUiState.isOpen]);

  useEffect(() => {
    if (!streamSearchUiState.isOpen) {
      return;
    }

    streamSearchInputRef.current?.focus();
    streamSearchInputRef.current?.select();
  }, [streamSearchUiState.isOpen]);

  useEffect(() => {
    if (!tableSearchUiState.isOpen) {
      setHighlightedTableIndex(-1);
      return;
    }

    const tableIds = tableListKey.length > 0 ? tableListKey.split("|") : [];
    const activeIndex =
      viewParam === "table" && activeTableId
        ? tableIds.indexOf(activeTableId)
        : -1;

    setHighlightedTableIndex(
      activeIndex >= 0 ? activeIndex : tableIds.length > 0 ? 0 : -1,
    );
  }, [
    activeTableId,
    tableListKey,
    tableSearchUiState.isOpen,
    tableSearchUiState.term,
    viewParam,
  ]);

  useEffect(() => {
    if (!streamSearchUiState.isOpen) {
      setHighlightedStreamIndex(-1);
      return;
    }

    const streamNames =
      streamListKey.length > 0 ? streamListKey.split("|") : [];
    const activeIndex =
      viewParam === "stream" && streamParam
        ? streamNames.indexOf(streamParam)
        : -1;

    setHighlightedStreamIndex(
      activeIndex >= 0 ? activeIndex : streamNames.length > 0 ? 0 : -1,
    );
  }, [streamListKey, streamParam, streamSearchUiState.isOpen, viewParam]);

  useEffect(() => {
    if (
      !isNavigationResizing &&
      draftNavigationWidth !== null &&
      draftNavigationWidth === navigationWidth
    ) {
      setDraftNavigationWidth(null);
    }
  }, [draftNavigationWidth, isNavigationResizing, navigationWidth]);

  useEffect(() => {
    if (!isNavigationResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = navigationResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      resizeState.lastClientX = event.clientX;
      setDraftNavigationWidth(
        clampNavigationWidth(
          resizeState.startWidth + (event.clientX - resizeState.startX),
        ),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const resizeState = navigationResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      const nextWidth = clampNavigationWidth(
        resizeState.startWidth + (event.clientX - resizeState.startX),
      );

      navigationResizeStateRef.current = null;
      setDraftNavigationWidth(nextWidth);
      setIsNavigationResizing(false);
      setNavigationWidth(nextWidth);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [clampNavigationWidth, isNavigationResizing, setNavigationWidth]);

  function openTableSearch() {
    setTableSearchUiState((previous) => ({
      ...previous,
      isOpen: true,
    }));
  }

  function closeTableSearch() {
    searchInputRef.current?.blur();
    setTableSearchUiState({
      isOpen: false,
      term: "",
    });
  }

  function setTableSearchTerm(term: string) {
    setTableSearchUiState((previous) => ({
      ...previous,
      term,
    }));
  }

  function openStreamSearch() {
    setStreamSearchUiState((previous) => ({
      ...previous,
      isOpen: true,
    }));
  }

  function closeStreamSearch() {
    streamSearchInputRef.current?.blur();
    setStreamSearchUiState({
      isOpen: false,
      term: "",
    });
  }

  function setStreamSearchTerm(term: string) {
    setStreamSearchUiState((previous) => ({
      ...previous,
      term,
    }));
  }

  function navigateToTable(args: { schema: string; table: string }) {
    window.location.hash = createUrl({
      schemaParam: args.schema,
      tableParam: args.table,
      viewParam: "table",
    });
  }

  function requestTableGridFocus(args: { schema: string; table: string }) {
    setTableGridFocusRequest((previous) => ({
      requestId: previous.requestId + 1,
      tableId: `${args.schema}.${args.table}`,
    }));
  }

  function selectTable(args: { schema: string; table: string }) {
    requestTableGridFocus(args);
    closeTableSearch();
    navigateToTable(args);
  }

  function navigateToStream(name: string) {
    window.location.hash = createUrl({
      streamParam: name,
      viewParam: "stream",
    });
  }

  function selectStream(name: string) {
    closeStreamSearch();
    navigateToStream(name);
  }

  function handleTableSearchKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTableSearch();
      return;
    }

    if (tables.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedTableIndex((current) => {
        if (current < 0) {
          return 0;
        }

        return Math.min(current + 1, tables.length - 1);
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedTableIndex((current) => {
        if (current < 0) {
          return tables.length - 1;
        }

        return Math.max(current - 1, 0);
      });
      return;
    }

    if (event.key === "Enter" && highlightedTableIndex >= 0) {
      event.preventDefault();
      const selectedTable = tables[highlightedTableIndex];

      if (!selectedTable) {
        return;
      }

      selectTable({
        schema: selectedTable.schema,
        table: selectedTable.table,
      });
    }
  }

  function handleStreamSearchKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeStreamSearch();
      return;
    }

    if (filteredStreams.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedStreamIndex((current) => {
        if (current < 0) {
          return 0;
        }

        return Math.min(current + 1, filteredStreams.length - 1);
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedStreamIndex((current) => {
        if (current < 0) {
          return filteredStreams.length - 1;
        }

        return Math.max(current - 1, 0);
      });
      return;
    }

    if (event.key === "Enter" && highlightedStreamIndex >= 0) {
      event.preventDefault();
      const selectedStream = filteredStreams[highlightedStreamIndex];

      if (!selectedStream) {
        return;
      }

      selectStream(selectedStream.name);
    }
  }

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      navigationResizeStateRef.current = {
        lastClientX: event.clientX,
        startWidth: resolvedNavigationWidth,
        startX: event.clientX,
      };
      setDraftNavigationWidth(resolvedNavigationWidth);
      setIsNavigationResizing(true);
      event.preventDefault();
    },
    [resolvedNavigationWidth],
  );

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setNavigationWidth(clampNavigationWidth(navigationWidth - 16));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setNavigationWidth(clampNavigationWidth(navigationWidth + 16));
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setNavigationWidth(MIN_NAVIGATION_WIDTH);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setNavigationWidth(
          clampNavigationWidth(
            typeof window === "undefined"
              ? MAX_NAVIGATION_WIDTH
              : Math.floor(window.innerWidth * 0.6),
          ),
        );
      }
    },
    [clampNavigationWidth, navigationWidth, setNavigationWidth],
  );

  const databaseLabel =
    DATABASE_SERVICE_LABELS[adapter.capabilities?.sqlDialect ?? "postgresql"];
  const failedWorkflowCount =
    temporalNavigation.workflowList?.countsByStatus.Failed ?? 0;
  const services: ServiceLink[] = [];

  if (hasDatabase) {
    services.push({
      attention: null,
      href:
        serviceLocations.database ??
        createUrl({ schemaParam, viewParam: "table" }),
      icon: Database,
      id: "database",
      label: databaseLabel,
    });
  }

  if (hasStreamsServer) {
    services.push({
      attention: null,
      href:
        serviceLocations.streams ??
        createUrl({
          ...(streams[0] ? { streamParam: streams[0].name } : {}),
          viewParam: "stream",
        }),
      icon: Waves,
      id: "streams",
      label: "Streams",
    });
  }

  if (typeof temporalUrl === "string") {
    services.push({
      attention:
        failedWorkflowCount > 0
          ? `${failedWorkflowCount} failed ${failedWorkflowCount === 1 ? "workflow" : "workflows"}`
          : null,
      href:
        serviceLocations.temporal ??
        createUrl({
          temporalNsParam: temporalNavigation.activeNamespace,
          temporalSectionParam: "workflows",
          viewParam: "temporal",
        }),
      icon: Workflow,
      id: "temporal",
      label: "Temporal",
    });
  }

  const viewService = getStudioServiceForView(viewParam);
  const openService = services.some((service) => service.id === viewService)
    ? viewService
    : services[0]?.id;
  const revealTableId =
    viewParam === "table" &&
    activeTableId != null &&
    tables.some((table) => table.id === activeTableId)
      ? activeTableId
      : null;
  const revealStreamName =
    streamParam != null &&
    filteredStreams.some((stream) => stream.name === streamParam)
      ? streamParam
      : null;

  // The whole sidebar scrolls only when the window is too short for the fixed
  // parts plus a minimum list height. Normally just the object list scrolls.
  const sideBarClasses = cn(
    "relative flex shrink-0 flex-col overflow-y-auto min-h-full h-0 text-card-foreground",
    hoverScrollbarClasses,
    className,
  );
  // Views read as product chrome (sans + icon); tables are data identifiers (mono).
  const navigationItemClasses =
    "py-1.5 font-sans text-sm font-normal text-muted-foreground hover:bg-sidebar-active/50 hover:text-foreground transition-colors cursor-pointer data-[active=true]:bg-sidebar-active data-[active=true]:text-foreground data-[active=true]:font-medium outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-[active=true]:[&_svg]:text-foreground";
  const tableItemClasses =
    "py-1 font-mono text-sm font-normal text-muted-foreground hover:bg-sidebar-active/50 hover:text-foreground transition-colors cursor-pointer data-[active=true]:bg-sidebar-active data-[active=true]:text-foreground data-[active=true]:font-medium outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <div
      className={sideBarClasses}
      data-testid="studio-navigation"
      style={{ width: `${resolvedNavigationWidth}px` }}
    >
      {/*
        Product lockup: the official wordmark (prisma.io/brand; white variant on dark)
        followed by the product name, sized off the wordmark's own geometry so the
        two read as one line. At a 20px wordmark (67-unit viewBox, k = 20/67):
        - cap height 38.8k = 11.6px -> DM Sans (cap 0.7em) at 16.5px matches "P"
        - baseline 52.7k = 15.7px -> 16.5px text on a 20px line box lands at 15.6px
        - word space ~0.3em = 5px, weight 500 in the same ink as "Prisma"
      */}
      <div className="flex min-w-0 shrink-0 items-start gap-[5px] px-4 pt-4 pb-1">
        <img
          src={isDarkMode ? PrismaWordmarkWhite : PrismaWordmark}
          alt="Prisma"
          className="h-5 w-auto shrink-0"
          data-testid="studio-logo"
        />
        <span className="truncate font-sans text-[16.5px] leading-5 font-medium tracking-[-0.01em] text-foreground">
          Studio
        </span>
      </div>

      {services.length > 1 && openService ? (
        <ServiceSwitcher
          openService={openService}
          services={services}
          width={resolvedNavigationWidth}
        />
      ) : null}

      {openService === "database" ? (
        <>
          <Navigation.SchemaSelector />

          <Navigation.Block label={`${databaseLabel} views`}>
            <Navigation.Item
              asChild
              isActive={viewParam === "schema"}
              className={navigationItemClasses}
            >
              <a
                href={createUrl({
                  schemaParam,
                  viewParam: "schema",
                })}
                className="w-full"
              >
                <Network aria-hidden />
                Visualizer
              </a>
            </Navigation.Item>
            {hasQueryInsights && (
              <Navigation.Item
                asChild
                isActive={viewParam === "queries"}
                className={navigationItemClasses}
              >
                <a
                  href={createUrl({
                    schemaParam,
                    viewParam: "queries",
                  })}
                  className="w-full"
                >
                  <Activity aria-hidden />
                  Queries
                </a>
              </Navigation.Item>
            )}
            <Navigation.Item
              asChild
              isActive={viewParam === "console"}
              className={navigationItemClasses}
            >
              <a
                href={createUrl({
                  schemaParam,
                  viewParam: "console",
                })}
                className="w-full"
              >
                <ScrollText aria-hidden />
                Console
              </a>
            </Navigation.Item>
            <Navigation.Item
              asChild
              isActive={viewParam === "sql"}
              className={navigationItemClasses}
            >
              <a
                href={createUrl({
                  schemaParam,
                  viewParam: "sql",
                })}
                className="w-full"
              >
                <Code2 aria-hidden />
                SQL
              </a>
            </Navigation.Item>
            {hasMigrationHistory && (
              <Navigation.Item
                asChild
                isActive={viewParam === "migrations"}
                className={navigationItemClasses}
              >
                <a
                  href={createUrl({
                    schemaParam,
                    viewParam: "migrations",
                  })}
                  className="w-full"
                  data-testid="navigation-migrations-item"
                >
                  <History aria-hidden />
                  Migrations
                </a>
              </Navigation.Item>
            )}
          </Navigation.Block>

          <Navigation.SearchableBlock
            blockKey="tables"
            icon={Table2}
            isSearchOpen={tableSearchUiState.isOpen}
            onOpenSearch={openTableSearch}
            onCloseSearch={closeTableSearch}
            onRefresh={() => void refetch()}
            onSearchKeyDown={handleTableSearchKeyDown}
            refreshAriaLabel="Refresh tables"
            revealItemKey={revealTableId}
            searchAriaLabel="Search tables"
            searchPlaceholder="Search tables..."
            searchInputRef={searchInputRef}
            searchTerm={tableSearchUiState.term}
            setSearchTerm={setTableSearchTerm}
            title="Tables"
          >
            {hasStartupIntrospectionFailure ? (
              <IntrospectionStatusNotice
                className="mx-2 mb-2"
                compact
                description="Retry to reload schema and table metadata."
                isRetrying={isRefetching}
                message={errorState.message}
                onRetry={() => void refetch()}
                queryPreview={errorState.queryPreview}
                source={errorState.adapterSource}
                title="Schema metadata unavailable"
              />
            ) : (
              <>
                {hasRecoverableIntrospectionWarning && (
                  <IntrospectionStatusNotice
                    className="mx-2 mb-2"
                    compact
                    description="Studio is showing the last successful schema snapshot."
                    isRetrying={isRefetching}
                    message={errorState.message}
                    onRetry={() => void refetch()}
                    queryPreview={errorState.queryPreview}
                    source={errorState.adapterSource}
                    title="Schema refresh failed"
                    variant="warning"
                  />
                )}
                {isInitialIntrospectionLoad ? (
                  Array(4)
                    .fill(null)
                    .map((_, index) => (
                      <Navigation.Item key={index} wrapChildrenInSpan={false}>
                        <Skeleton className="h-3 w-full" />
                      </Navigation.Item>
                    ))
                ) : tables.length > 0 ? (
                  tables.map((table, index) => {
                    const isHighlighted =
                      tableSearchUiState.isOpen &&
                      index === highlightedTableIndex;
                    const isCurrentTable =
                      activeTable?.schema === table.schema &&
                      activeTable?.name === table.table &&
                      viewParam === "table";

                    return (
                      <Navigation.Item
                        key={table.id}
                        asChild
                        data-search-highlighted={
                          isHighlighted ? "true" : "false"
                        }
                        isActive={
                          tableSearchUiState.isOpen
                            ? isHighlighted
                            : isCurrentTable
                        }
                        className={tableItemClasses}
                        data-item-key={table.id}
                        onMouseEnter={() => {
                          if (!tableSearchUiState.isOpen) {
                            return;
                          }

                          setHighlightedTableIndex(index);
                        }}
                      >
                        <a
                          href={createUrl({
                            tableParam: table.table,
                            schemaParam: table.schema,
                            viewParam: "table",
                          })}
                          className="w-full"
                          onClick={(event) => {
                            if (
                              event.button !== 0 ||
                              event.altKey ||
                              event.ctrlKey ||
                              event.metaKey ||
                              event.shiftKey
                            ) {
                              return;
                            }

                            event.preventDefault();
                            selectTable({
                              schema: table.schema,
                              table: table.table,
                            });
                          }}
                        >
                          {table.table}
                        </a>
                      </Navigation.Item>
                    );
                  })
                ) : (
                  <Navigation.Item>
                    {tableSearchActive
                      ? "No matching tables"
                      : "No tables found"}
                  </Navigation.Item>
                )}
              </>
            )}
          </Navigation.SearchableBlock>
        </>
      ) : null}

      {openService === "streams" && (
        <Navigation.SearchableBlock
          blockKey="streams"
          icon={Waves}
          isSearchOpen={streamSearchUiState.isOpen}
          onCloseSearch={closeStreamSearch}
          onOpenSearch={openStreamSearch}
          onRefresh={() => void refetchStreams()}
          onSearchKeyDown={handleStreamSearchKeyDown}
          refreshAriaLabel="Refresh streams"
          revealItemKey={revealStreamName}
          searchAriaLabel="Search streams"
          searchInputRef={streamSearchInputRef}
          searchPlaceholder="Search streams..."
          searchTerm={streamSearchUiState.term}
          setSearchTerm={setStreamSearchTerm}
          title="Streams"
        >
          {isStreamsLoading ? (
            Array(2)
              .fill(null)
              .map((_, index) => (
                <Navigation.Item key={index} wrapChildrenInSpan={false}>
                  <Skeleton className="h-3 w-full" />
                </Navigation.Item>
              ))
          ) : hasStreamsError ? (
            <Navigation.Item>Streams unavailable</Navigation.Item>
          ) : filteredStreams.length > 0 ? (
            filteredStreams.map((stream, index) => (
              <Navigation.Item
                key={stream.name}
                asChild
                className={tableItemClasses}
                data-item-key={stream.name}
                data-search-highlighted={
                  streamSearchUiState.isOpen && index === highlightedStreamIndex
                    ? "true"
                    : "false"
                }
                isActive={
                  streamSearchUiState.isOpen
                    ? index === highlightedStreamIndex
                    : viewParam === "stream" && streamParam === stream.name
                }
                onMouseEnter={() => {
                  if (!streamSearchUiState.isOpen) {
                    return;
                  }

                  setHighlightedStreamIndex(index);
                }}
                wrapChildrenInSpan={false}
              >
                <a
                  href={createUrl({
                    streamParam: stream.name,
                    viewParam: "stream",
                  })}
                  className="w-full truncate"
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.altKey ||
                      event.ctrlKey ||
                      event.metaKey ||
                      event.shiftKey
                    ) {
                      return;
                    }

                    event.preventDefault();
                    selectStream(stream.name);
                  }}
                >
                  {stream.name}
                </a>
              </Navigation.Item>
            ))
          ) : (
            <Navigation.Item>
              {isStreamSearchActive
                ? "No matching streams"
                : "No streams found"}
            </Navigation.Item>
          )}
        </Navigation.SearchableBlock>
      )}

      {openService === "temporal" ? (
        <Navigation.TemporalSection itemClassName={navigationItemClasses} />
      ) : null}

      {/* Wide invisible grab area; only a hairline at the page edge shows on hover or drag. */}
      <button
        aria-label="Resize navigation"
        className={cn(
          "absolute top-[18px] bottom-[18px] right-0 flex w-3 cursor-col-resize touch-none items-stretch justify-end outline-none",
          "after:w-px after:bg-transparent after:transition-colors after:duration-150 after:content-['']",
          "hover:after:bg-foreground/20 focus-visible:after:bg-foreground/30",
          isNavigationResizing && "after:bg-foreground/30",
        )}
        data-testid="navigation-resize-handle"
        onKeyDown={handleResizeKeyDown}
        onPointerDown={handleResizePointerDown}
        type="button"
      />

      <CommandMenuHint />
    </div>
  );
}

/**
 * Quiet pointer to the command palette, pinned to the bottom of the sidebar.
 * The palette (themes, views, actions) is otherwise only reachable by shortcut.
 */
function CommandMenuHint() {
  const commandPalette = useCommandPalette();

  return (
    <div className="sticky bottom-0 mt-auto shrink-0 bg-canvas px-2 pt-2 pb-3">
      <Button
        aria-label="Open command menu"
        className="h-auto w-full justify-between px-2.5 py-1.5 font-normal text-muted-foreground hover:bg-sidebar-active/50 hover:text-foreground focus-visible:bg-sidebar-active/50 focus-visible:text-foreground"
        onClick={() => commandPalette.open()}
        type="button"
        variant="ghost"
      >
        <span className="truncate">Commands</span>
        <kbd className="shrink-0 rounded-sm border border-border bg-background px-1 py-px font-mono text-2xs text-muted-foreground">
          {isMacPlatform() ? "⌘K" : "Ctrl K"}
        </kbd>
      </Button>
    </div>
  );
}

/**
 * Shows one link per connected data service. Each link carries the last
 * location of its service, so switching away and back returns there.
 */
function ServiceSwitcher(props: {
  openService: StudioService;
  services: ServiceLink[];
  width: number;
}) {
  const { openService, services, width } = props;
  const switcherRef = useRef<HTMLElement | null>(null);
  const labelsKey = services.map((service) => service.label).join("|");

  // Picks the widest form that fits: icon and label, label only, then icons
  // with a label on the open service.
  useLayoutEffect(() => {
    const fitSwitcher = () => {
      const switcher = switcherRef.current;

      if (!switcher) {
        return;
      }

      for (const mode of ["full", "text", "compact"]) {
        switcher.dataset.mode = mode;

        if (switcher.scrollWidth <= switcher.clientWidth) {
          break;
        }
      }
    };

    fitSwitcher();

    // Label widths change when the web font replaces the fallback font.
    if ("fonts" in document) {
      void document.fonts.ready.then(fitSwitcher);
    }
  }, [labelsKey, openService, width]);

  return (
    <nav
      aria-label="Data services"
      className="group/switcher mx-2 mt-3 flex shrink-0 gap-0.5 overflow-hidden rounded-lg border border-border bg-foreground/5 p-0.5"
      data-testid="navigation-service-switcher"
      ref={switcherRef}
    >
      {services.map((service) => {
        const isOpen = service.id === openService;
        const Icon = service.icon;

        return (
          <a
            key={service.id}
            aria-current={isOpen ? "page" : undefined}
            className={cn(
              "relative flex h-7 flex-[1_0_auto] items-center justify-center gap-1.5 rounded-md px-2 font-sans text-xs whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              isOpen
                ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-border group-data-[mode=compact]/switcher:min-w-0 group-data-[mode=compact]/switcher:shrink"
                : "group-data-[mode=compact]/switcher:w-8 group-data-[mode=compact]/switcher:flex-none group-data-[mode=compact]/switcher:px-0",
            )}
            data-testid={`navigation-service-${service.id}`}
            href={service.href}
            title={
              service.attention
                ? `${service.label}: ${service.attention}`
                : service.label
            }
          >
            <Icon
              aria-hidden
              className="size-3.5 shrink-0 group-data-[mode=text]/switcher:hidden"
            />
            <span
              className={cn(
                "truncate",
                !isOpen && "group-data-[mode=compact]/switcher:sr-only",
              )}
            >
              {service.label}
            </span>
            {service.attention && !isOpen ? (
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive">
                <span className="sr-only">{service.attention}</span>
              </span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}

const Block = ({
  className,
  label,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  label: string;
}) => {
  return (
    <nav
      aria-label={label}
      className={cn("flex shrink-0 flex-col gap-px px-2 pt-1 pb-2", className)}
      {...props}
    >
      {children}
    </nav>
  );
};

const SearchableBlock = ({
  blockKey,
  className,
  children,
  icon: _icon,
  isSearchOpen,
  onCloseSearch,
  onOpenSearch,
  onRefresh,
  onSearchKeyDown,
  refreshAriaLabel,
  revealItemKey,
  searchAriaLabel,
  searchInputRef,
  searchPlaceholder,
  searchTerm,
  setSearchTerm,
  title,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  blockKey: "streams" | "tables";
  icon: React.ComponentType<{
    className?: string;
    size?: number;
  }>;
  isSearchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onRefresh: () => void;
  onSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  refreshAriaLabel: string;
  /** `data-item-key` of the open item, or null when the list does not hold it. */
  revealItemKey: string | null;
  searchAriaLabel: string;
  searchTerm: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchPlaceholder: string;
  setSearchTerm: (value: string) => void;
  title: string;
}) => {
  const listRef = useRef<HTMLElement | null>(null);

  // Scrolls only this list, so a link from another service shows its target
  // without moving the rest of the sidebar.
  useEffect(() => {
    const list = listRef.current;

    if (!list || revealItemKey == null) {
      return;
    }

    const revealItem = () => {
      const item = Array.from(list.children).find(
        (child) => child.getAttribute("data-item-key") === revealItemKey,
      );

      if (!item) {
        return;
      }

      const listBox = list.getBoundingClientRect();
      const itemBox = item.getBoundingClientRect();

      if (itemBox.top < listBox.top) {
        list.scrollTop -= listBox.top - itemBox.top;
      } else if (itemBox.bottom > listBox.bottom) {
        list.scrollTop += itemBox.bottom - listBox.bottom;
      }
    };

    revealItem();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    // The list gets shorter when parts above it load later, which can hide the item again.
    const listResizeObserver = new ResizeObserver(revealItem);
    listResizeObserver.observe(list);

    return () => listResizeObserver.disconnect();
  }, [revealItemKey]);

  return (
    <div
      className={cn(
        "group/navigation-search relative flex min-h-24 flex-1 basis-0 flex-col",
        className,
      )}
      data-search-open={isSearchOpen ? "true" : "false"}
      data-testid={`navigation-search-block-${blockKey}`}
      {...props}
    >
      <div className="relative flex min-h-10 shrink-0 items-center gap-1 px-4 pt-4 pb-1">
        <div
          className={cn(
            "flex items-center gap-1 transition-opacity duration-200",
            isSearchOpen && "opacity-0 pointer-events-none",
          )}
        >
          <h2 className={zoneHeadingClasses}>{title}</h2>
        </div>

        <div
          className={cn(
            "ml-auto flex items-center gap-0.5 pr-0.5 transition-opacity duration-200",
            isSearchOpen
              ? "opacity-0 pointer-events-none"
              : "opacity-0 group-hover/navigation-search:opacity-100 focus:opacity-100 focus-visible:opacity-100",
          )}
        >
          <button
            aria-label={searchAriaLabel}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={onOpenSearch}
            type="button"
          >
            <Search size={14} />
          </button>
          <button
            aria-label={refreshAriaLabel}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div
          data-testid={`navigation-search-input-wrapper-${blockKey}`}
          className={cn(
            "absolute right-4 top-1/2 -translate-y-1/2 origin-right transition-[opacity,transform] duration-200 ease-out will-change-transform w-[calc(100%-2rem)]",
            isSearchOpen
              ? "opacity-100 scale-x-100"
              : "opacity-0 scale-x-0 pointer-events-none",
          )}
        >
          {/* Same pill as the table search: round, with the icon inside. */}
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={searchAriaLabel}
            className="h-8 w-full rounded-full bg-background pl-8 shadow-none"
            onChange={(event) => {
              setSearchTerm(event.currentTarget.value);
            }}
            onKeyDown={onSearchKeyDown}
            onBlur={(event) => {
              if (event.currentTarget.value.trim().length > 0) {
                return;
              }

              onCloseSearch();
            }}
            placeholder={searchPlaceholder}
            ref={searchInputRef}
            value={searchTerm}
          />
        </div>
      </div>
      <nav
        aria-label={title}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pt-1 pb-2",
          hoverScrollbarClasses,
        )}
        ref={listRef}
      >
        {children}
      </nav>
    </div>
  );
};

const Item = ({
  className,
  asChild = false,
  isActive,
  size,
  children,
  wrapChildrenInSpan = true,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  size?: "default" | "sm";
  wrapChildrenInSpan?: boolean;
}) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-sidebar="menu-button"
      data-size={size}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium",
        className,
      )}
      {...props}
    >
      {wrapChildrenInSpan && !asChild ? (
        <span className="truncate">{children}</span>
      ) : (
        children
      )}
    </Comp>
  );
};

const SchemaSelector = () => {
  const {
    data: introspection,
    hasResolvedIntrospection,
    isFetching,
  } = useIntrospection();
  const { schemaParam, setSchemaParam, setTableParam } = useNavigation();

  // Extract schema names from introspection data
  const schemaNames = Object.keys(introspection.schemas || {});
  const isInitialIntrospectionLoad = isFetching && !hasResolvedIntrospection;

  return (
    <div className="flex shrink-0 items-center gap-1 px-2 pt-3 pb-1">
      <Select
        value={schemaParam}
        onValueChange={(schemaParam) => {
          const schema = introspection.schemas[schemaParam ?? ""];
          const tableParam = Object.keys(schema?.tables ?? {})[0] ?? null;
          void setSchemaParam(schemaParam);
          void setTableParam(tableParam);
        }}
      >
        <SelectTrigger className="text-xs" label="Schema">
          <SelectValue placeholder="Select schema" />
        </SelectTrigger>
        <SelectContent>
          {isInitialIntrospectionLoad ? (
            <SelectItem value="loading">Loading schemas...</SelectItem>
          ) : schemaNames.length > 0 ? (
            schemaNames.map((schema) => (
              <SelectItem key={schema} value={schema} className="text-xs">
                {schema}
              </SelectItem>
            ))
          ) : (
            <SelectItem value="no-schemas">No schemas found</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
};

/**
 * Temporal data the sidebar needs outside the Temporal section too: the
 * service switcher links to the namespace and marks failed workflows.
 */
function useTemporalNavigation() {
  const { temporalFollowParam, temporalNsParam, viewParam } = useNavigation();
  const { data: capabilities } = useTemporalCapabilities();
  const { data: namespaces = [] } = useTemporalNamespaces();
  const activeNamespace = temporalNsParam ?? namespaces[0]?.name ?? "default";
  const followMode =
    viewParam === "temporal" && temporalFollowParam === "paused"
      ? "paused"
      : "live";
  // Status counts for the whole namespace. The same request as the unfiltered
  // Workflows list, so the two share one response.
  const { data: workflowList } = useTemporalWorkflows({
    followMode,
    namespace: activeNamespace,
    query: "",
  });
  return {
    activeNamespace,
    capabilities,
    namespaces,
    workflowList,
  };
}

/**
 * The Temporal part of the menu. It holds only lists, the ways to find
 * things: Workflow Types, Workflows with its views beneath it (Needs
 * Attention, the built-in and saved views), Schedules, Task Queues, Workers
 * and Cluster & Shards. A workflow is a thing a list leads to, so its page is
 * not an entry: the menu marks Workflows while one is open.
 */
const TemporalSection = (props: { itemClassName: string }) => {
  const { itemClassName } = props;
  const viewItemClassName = cn(
    itemClassName,
    // Indented under Workflows with no icon, so the text lines up with "Workflows".
    "py-1 pl-8 text-xs",
  );
  const {
    createUrl,
    searchParam,
    setTemporalNsParam,
    setTemporalRunParam,
    setTemporalWfParam,
    setViewParam,
    temporalFollowParam,
    temporalSectionParam,
    temporalWfParam,
    viewParam,
  } = useNavigation();
  const { activeNamespace, capabilities, namespaces, workflowList } =
    useTemporalNavigation();
  const { removeView, saveView, views: userViews } = useTemporalSavedViews();

  const isTemporalOpen = viewParam === "temporal";
  const isWorkflowPage = isTemporalOpen && Boolean(temporalWfParam);
  // A link to a screen this server does not have opens Workflows, as `TemporalView` does.
  const activeSection = isWorkflowPage
    ? "workflows"
    : temporalSectionParam === "attention" ||
        temporalSectionParam === "queues" ||
        temporalSectionParam === "types" ||
        (temporalSectionParam === "schedules" &&
          capabilities?.supportsSchedules !== false) ||
        (temporalSectionParam === "workers" &&
          capabilities?.supportsDescribeTaskQueue === true) ||
        (temporalSectionParam === "cluster" &&
          capabilities?.supportsAdminApi === true)
      ? temporalSectionParam
      : "workflows";
  const savedViews = [...TEMPORAL_BUILT_IN_VIEWS, ...userViews];
  // The check describes every running run, so only the open service asks for it.
  const { data: attention } = useTemporalAttention({
    enabled: isTemporalOpen,
    followMode: temporalFollowParam === "paused" ? "paused" : "live",
    namespace: activeNamespace,
  });
  // One run can have several problems, and the Needs Attention page counts runs.
  const attentionCount = new Set(
    attention?.items
      .filter((item) => item.kind !== "failed")
      .map((item) => `${item.workflowId}\n${item.runId}`),
  ).size;
  const failedCount = workflowList?.countsByStatus.Failed ?? 0;
  const runningCount = workflowList?.countsByStatus.Running ?? 0;
  const namespaceOptions =
    namespaces.length > 0
      ? namespaces.map((namespace) => namespace.name)
      : [activeNamespace];
  const openSavedViewQuery =
    isTemporalOpen && activeSection === "workflows" && !temporalWfParam
      ? savedViews.find((view) => view.query === (searchParam ?? "").trim())
          ?.query
      : undefined;
  // Every link is a full URL, so it also works from another service.
  const temporalUrlBase = {
    ...(temporalFollowParam ? { temporalFollowParam } : {}),
    temporalNsParam: activeNamespace,
    viewParam: "temporal",
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 px-2 pt-3 pb-1">
        <Select
          value={activeNamespace}
          onValueChange={(nextNamespace) => {
            void setTemporalNsParam(nextNamespace);
            void setTemporalWfParam(null);
            void setTemporalRunParam(null);
            void setViewParam("temporal");
          }}
        >
          <SelectTrigger
            aria-label="Temporal namespace"
            className="text-xs"
            data-testid="navigation-temporal-namespace"
            label="Namespace"
          >
            <SelectValue placeholder="Select namespace" />
          </SelectTrigger>
          <SelectContent>
            {namespaceOptions.map((namespaceName) => (
              <SelectItem
                key={namespaceName}
                className="text-xs"
                value={namespaceName}
              >
                {namespaceName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Navigation.Block
        data-testid="navigation-temporal-block"
        label="Temporal views"
      >
        <Navigation.Item
          asChild
          className={itemClassName}
          isActive={isTemporalOpen && activeSection === "types"}
        >
          <a
            className="w-full"
            data-testid="navigation-temporal-types"
            href={createUrl({
              ...temporalUrlBase,
              temporalSectionParam: "types",
            })}
          >
            <Waypoints aria-hidden />
            Workflow Types
          </a>
        </Navigation.Item>

        <Navigation.Item
          asChild
          className={itemClassName}
          isActive={
            isWorkflowPage ||
            (isTemporalOpen &&
              activeSection === "workflows" &&
              openSavedViewQuery === undefined)
          }
        >
          <a
            className="w-full justify-between"
            data-testid="navigation-temporal-workflows"
            href={createUrl({
              ...temporalUrlBase,
              temporalSectionParam: "workflows",
            })}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Workflow aria-hidden />
              <span className="truncate">Workflows</span>
            </span>
            <span className="flex shrink-0 items-center gap-0.5 tabular-nums">
              {runningCount > 0 ? (
                <span
                  className="min-w-5 rounded-full bg-prism-cyan/20 px-[3px] py-0.5 text-center font-mono text-2xs font-medium text-foreground"
                  title={`${runningCount} running`}
                >
                  {runningCount}
                </span>
              ) : null}
              {failedCount > 0 ? (
                <span
                  className="min-w-5 rounded-full bg-destructive/15 px-[3px] py-0.5 text-center font-mono text-2xs font-medium text-foreground"
                  title={`${failedCount} failed`}
                >
                  {failedCount}
                </span>
              ) : null}
            </span>
          </a>
        </Navigation.Item>

        {/* The views of Workflows: lists of the same workflows, narrowed. */}
        <Navigation.Item
          asChild
          className={viewItemClassName}
          isActive={
            isTemporalOpen && !isWorkflowPage && activeSection === "attention"
          }
        >
          <a
            className="w-full justify-between"
            data-testid="navigation-temporal-attention"
            href={createUrl({
              ...temporalUrlBase,
              temporalSectionParam: "attention",
            })}
          >
            <span className="truncate">Needs Attention</span>
            {attentionCount > 0 ? (
              <span
                className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 font-mono text-2xs font-medium tabular-nums text-foreground"
                title={`${attentionCount} running workflows need attention`}
              >
                {attentionCount}
              </span>
            ) : null}
          </a>
        </Navigation.Item>

        {savedViews.map((view) => (
          <Navigation.Item
            key={view.id}
            asChild
            className={cn(viewItemClassName, "group/view")}
            isActive={openSavedViewQuery === view.query}
          >
            <div className="flex w-full items-center">
              <a
                className="flex min-w-0 flex-1 items-center gap-2"
                href={createUrl({
                  ...temporalUrlBase,
                  searchParam: view.query,
                  ...(view.sort ? { sortParam: view.sort } : {}),
                  temporalSectionParam: "workflows",
                })}
                title={view.query}
              >
                <span className="truncate">{view.name}</span>
              </a>
              {view.id.startsWith("built-in:") ? null : (
                <button
                  type="button"
                  aria-label={`Delete saved view ${view.name}`}
                  // Transparent, not hidden, so the Tab key reaches it.
                  className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/view:opacity-100"
                  onClick={() => {
                    removeView(view.id);
                    toast(`Deleted the saved view ${view.name}`, {
                      action: {
                        label: "Undo",
                        onClick: () =>
                          saveView({
                            name: view.name,
                            query: view.query,
                            ...(view.sort ? { sort: view.sort } : {}),
                          }),
                      },
                    });
                  }}
                >
                  <X aria-hidden className="size-3" />
                </button>
              )}
            </div>
          </Navigation.Item>
        ))}

        {capabilities?.supportsSchedules !== false ? (
          <Navigation.Item
            asChild
            className={itemClassName}
            isActive={isTemporalOpen && activeSection === "schedules"}
          >
            <a
              className="w-full"
              data-testid="navigation-temporal-schedules"
              href={createUrl({
                ...temporalUrlBase,
                temporalSectionParam: "schedules",
              })}
            >
              <CalendarClock aria-hidden />
              Schedules
            </a>
          </Navigation.Item>
        ) : null}

        <Navigation.Item
          asChild
          className={itemClassName}
          isActive={isTemporalOpen && activeSection === "queues"}
        >
          <a
            className="w-full"
            data-testid="navigation-temporal-queues"
            href={createUrl({
              ...temporalUrlBase,
              temporalSectionParam: "queues",
            })}
          >
            <Layers aria-hidden />
            Task Queues
          </a>
        </Navigation.Item>

        {/* Only a server that reports pollers has Workers to list. */}
        {capabilities?.supportsDescribeTaskQueue ? (
          <Navigation.Item
            asChild
            className={itemClassName}
            isActive={isTemporalOpen && activeSection === "workers"}
          >
            <a
              className="w-full"
              data-testid="navigation-temporal-workers"
              href={createUrl({
                ...temporalUrlBase,
                temporalSectionParam: "workers",
              })}
            >
              <Cpu aria-hidden />
              Workers
            </a>
          </Navigation.Item>
        ) : null}

        {capabilities?.supportsAdminApi ? (
          <Navigation.Item
            asChild
            className={itemClassName}
            isActive={isTemporalOpen && activeSection === "cluster"}
          >
            <a
              className="w-full"
              data-testid="navigation-temporal-cluster"
              href={createUrl({
                ...temporalUrlBase,
                temporalSectionParam: "cluster",
              })}
            >
              <Server aria-hidden />
              Cluster &amp; Shards
            </a>
          </Navigation.Item>
        ) : null}
      </Navigation.Block>
    </>
  );
};

Navigation.Block = Block;
Navigation.Item = Item;
Navigation.SchemaSelector = SchemaSelector;
Navigation.SearchableBlock = SearchableBlock;
Navigation.TemporalSection = TemporalSection;
