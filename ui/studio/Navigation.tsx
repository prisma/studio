import { Slot } from "@radix-ui/react-slot";
import { RefreshCw, Search, Table2, Waves } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import PrismaLogo from "../../assets/prisma.svg";
import PrismaLightSymbol from "../../assets/prisma-light-symbol.svg";
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
import { useNavigation } from "../hooks/use-navigation";
import { useNavigationTableList } from "../hooks/use-navigation-table-list";
import { useStreams } from "../hooks/use-streams";
import { useUiState } from "../hooks/use-ui-state";
import { cn } from "../lib/utils";
import {
  MAX_NAVIGATION_WIDTH,
  MIN_NAVIGATION_WIDTH,
  useStudio,
} from "./context";
import { IntrospectionStatusNotice } from "./IntrospectionStatusNotice";
import {
  STREAM_SEARCH_UI_STATE_KEY,
  type StreamSearchUiState,
  TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY,
  TABLE_SEARCH_UI_STATE_KEY,
  type TableGridFocusRequestUiState,
  type TableSearchUiState,
} from "./navigation-ui-state";

type NavigationProps = {
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Navigation({ className }: NavigationProps) {
  const { metadata, createUrl, streamParam, viewParam, schemaParam } =
    useNavigation();
  const { hasDatabase, isDarkMode, navigationWidth, setNavigationWidth } =
    useStudio();
  const { isFetching, activeTable } = metadata;
  const { errorState, hasResolvedIntrospection, isRefetching, refetch } =
    useIntrospection();
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
  const prismaLogoSrc = isDarkMode ? PrismaLightSymbol : PrismaLogo;
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

  const sideBarClasses = cn(
    "relative flex shrink-0 flex-col overflow-y-auto min-h-full h-0 text-card-foreground shadow-xs rounded-lg",
    className,
  );
  const navigationItemClasses =
    "py-1 font-mono text-xs text-foreground/60 hover:text-foreground transition-all cursor-pointer data-[active=true]:bg-accent data-[active=true]:foreground data-[active=true]:text-foreground";

  return (
    <div
      className={sideBarClasses}
      data-testid="studio-navigation"
      style={{ width: `${resolvedNavigationWidth}px` }}
    >
      <div className="flex items-center gap-2 pt-4 pb-0.5 px-4">
        <img src={prismaLogoSrc} alt="Prisma Logo" className="h-6 w-auto" />
        <span className="text-lg font-medium font-sans">Prisma Studio</span>
      </div>

      {hasDatabase ? (
        <>
          <Navigation.SchemaSelector />

          <Navigation.Block label="Studio">
            <Navigation.Item
              asChild
              isActive={viewParam === "schema"}
              className={navigationItemClasses}
            >
              <a href={createUrl({ viewParam: "schema" })} className="w-full">
                Visualizer
              </a>
            </Navigation.Item>
            <Navigation.Item
              asChild
              isActive={viewParam === "console"}
              className={navigationItemClasses}
            >
              <a href={createUrl({ viewParam: "console" })} className="w-full">
                Console
              </a>
            </Navigation.Item>
            <Navigation.Item
              asChild
              isActive={viewParam === "sql"}
              className={navigationItemClasses}
            >
              <a href={createUrl({ viewParam: "sql" })} className="w-full">
                SQL
              </a>
            </Navigation.Item>
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
                        className={navigationItemClasses}
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

      {hasStreamsServer && (
        <Navigation.SearchableBlock
          blockKey="streams"
          icon={Waves}
          isSearchOpen={streamSearchUiState.isOpen}
          onCloseSearch={closeStreamSearch}
          onOpenSearch={openStreamSearch}
          onRefresh={() => void refetchStreams()}
          onSearchKeyDown={handleStreamSearchKeyDown}
          refreshAriaLabel="Refresh streams"
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
                className={navigationItemClasses}
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

      <button
        aria-label="Resize navigation"
        className={cn(
          "absolute inset-y-0 right-0 flex w-3 cursor-col-resize touch-none items-stretch justify-center outline-none",
          isNavigationResizing && "bg-foreground/5",
        )}
        data-testid="navigation-resize-handle"
        onKeyDown={handleResizeKeyDown}
        onPointerDown={handleResizePointerDown}
        type="button"
      />
    </div>
  );
}

const Block = ({
  className,
  label,
  children,
  icon: Icon = Table2,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ComponentType<{
    className?: string;
    size?: number;
  }>;
  label: string;
}) => {
  return (
    <div className={className} {...props}>
      <div className="flex items-center gap-1 pt-4 pb-2 px-4 sticky top-0  backdrop-blur-sm">
        <Icon size={16} className="text-muted-foreground/60" />
        <h2 className="text-sm font-medium">{label}</h2>
      </div>
      <nav aria-label={label} className="flex flex-col gap-px pb-3 p-2">
        {children}
      </nav>
    </div>
  );
};

const SearchableBlock = ({
  blockKey,
  className,
  children,
  icon: Icon,
  isSearchOpen,
  onCloseSearch,
  onOpenSearch,
  onRefresh,
  onSearchKeyDown,
  refreshAriaLabel,
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
  searchAriaLabel: string;
  searchTerm: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchPlaceholder: string;
  setSearchTerm: (value: string) => void;
  title: string;
}) => {
  return (
    <div
      className={cn("group/navigation-search relative", className)}
      data-search-open={isSearchOpen ? "true" : "false"}
      data-testid={`navigation-search-block-${blockKey}`}
      {...props}
    >
      <div className="relative flex items-center gap-1 pt-4 pb-2 px-4 sticky top-0 backdrop-blur-sm min-h-10">
        <div
          className={cn(
            "flex items-center gap-1 transition-opacity duration-200",
            isSearchOpen && "opacity-0 pointer-events-none",
          )}
        >
          <Icon size={16} className="text-muted-foreground/60" />
          <h2 className="text-sm font-medium">{title}</h2>
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
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpenSearch}
            type="button"
          >
            <Search size={14} />
          </button>
          <button
            aria-label={refreshAriaLabel}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <Input
            aria-label={searchAriaLabel}
            className="h-9 w-full bg-background shadow-none"
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
      <nav aria-label={title} className="flex flex-col gap-px pb-3 p-2">
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
      data-active={isActive}
      className={cn(
        "py-1.5 px-2 text-sm font-medium rounded-md flex gap-2 items-center border border-transparent bg-transparent",
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
    <div className="flex items-center gap-1 pt-4 pb-2 px-4 sticky top-0 backdrop-blur-sm">
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

Navigation.Block = Block;
Navigation.Item = Item;
Navigation.SchemaSelector = SchemaSelector;
Navigation.SearchableBlock = SearchableBlock;
