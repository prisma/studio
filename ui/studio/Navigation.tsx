import { Slot } from "@radix-ui/react-slot";
import { Search, Table2, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { useStudio } from "./context";
import { IntrospectionStatusNotice } from "./IntrospectionStatusNotice";
import {
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
  const { isDarkMode } = useStudio();
  const { isFetching, activeTable } = metadata;
  const { errorState, hasResolvedIntrospection, isRefetching, refetch } =
    useIntrospection();
  const [tableSearchUiState, setTableSearchUiState] =
    useUiState<TableSearchUiState>(TABLE_SEARCH_UI_STATE_KEY, {
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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
  const {
    hasStreamsServer,
    isError: hasStreamsError,
    isLoading: isStreamsLoading,
    streams,
  } = useStreams();

  useEffect(() => {
    if (!tableSearchUiState.isOpen) {
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [tableSearchUiState.isOpen]);

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

  const sideBarClasses = cn(
    "flex flex-col w-48 overflow-y-auto min-h-full h-0 text-card-foreground shadow-xs rounded-lg",
    className,
  );
  const navigationItemClasses =
    "py-1 font-mono text-xs text-foreground/60 hover:text-foreground transition-all cursor-pointer data-[active=true]:bg-accent data-[active=true]:foreground data-[active=true]:text-foreground";

  return (
    <div className={sideBarClasses}>
      <div className="flex items-center gap-2 pt-4 pb-0.5 px-4">
        <img src={prismaLogoSrc} alt="Prisma Logo" className="h-6 w-auto" />
        <span className="text-lg font-medium font-sans">Prisma Studio</span>
      </div>

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

      <Navigation.TablesBlock
        isSearchOpen={tableSearchUiState.isOpen}
        onOpenSearch={openTableSearch}
        onCloseSearch={closeTableSearch}
        onSearchKeyDown={handleTableSearchKeyDown}
        searchInputRef={searchInputRef}
        searchTerm={tableSearchUiState.term}
        setSearchTerm={setTableSearchTerm}
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
                  tableSearchUiState.isOpen && index === highlightedTableIndex;
                const isCurrentTable =
                  activeTable?.schema === table.schema &&
                  activeTable?.name === table.table &&
                  viewParam === "table";

                return (
                  <Navigation.Item
                    key={table.id}
                    asChild
                    data-search-highlighted={isHighlighted ? "true" : "false"}
                    isActive={
                      tableSearchUiState.isOpen ? isHighlighted : isCurrentTable
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
                {tableSearchActive ? "No matching tables" : "No tables found"}
              </Navigation.Item>
            )}
          </>
        )}
      </Navigation.TablesBlock>

      {hasStreamsServer && (
        <Navigation.Block icon={Waves} label="Streams">
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
          ) : streams.length > 0 ? (
            streams.map((stream) => (
              <Navigation.Item
                key={stream.name}
                asChild
                className={navigationItemClasses}
                isActive={viewParam === "stream" && streamParam === stream.name}
                wrapChildrenInSpan={false}
              >
                <a
                  href={createUrl({
                    streamParam: stream.name,
                    viewParam: "stream",
                  })}
                  className="w-full truncate"
                >
                  {stream.name}
                </a>
              </Navigation.Item>
            ))
          ) : (
            <Navigation.Item>No streams found</Navigation.Item>
          )}
        </Navigation.Block>
      )}
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

const TablesBlock = ({
  className,
  children,
  isSearchOpen,
  onCloseSearch,
  onOpenSearch,
  onSearchKeyDown,
  searchInputRef,
  searchTerm,
  setSearchTerm,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  isSearchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  searchTerm: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  setSearchTerm: (value: string) => void;
}) => {
  return (
    <div
      className={cn("group/tables relative", className)}
      data-search-open={isSearchOpen ? "true" : "false"}
      {...props}
    >
      <div className="relative flex items-center gap-1 pt-4 pb-2 px-4 sticky top-0 backdrop-blur-sm min-h-10">
        <div
          className={cn(
            "flex items-center gap-1 transition-opacity duration-200",
            isSearchOpen && "opacity-0 pointer-events-none",
          )}
        >
          <Table2 size={16} className="text-muted-foreground/60" />
          <h2 className="text-sm font-medium">Tables</h2>
        </div>

        <button
          aria-label="Search tables"
          className={cn(
            "ml-auto h-6 w-6 rounded-sm flex items-center justify-center text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity duration-200",
            isSearchOpen
              ? "opacity-0 pointer-events-none"
              : "opacity-0 group-hover/tables:opacity-100 focus:opacity-100 focus-visible:opacity-100",
          )}
          onClick={onOpenSearch}
          type="button"
        >
          <Search size={14} />
        </button>

        <div
          data-table-search-input-wrapper
          className={cn(
            "absolute right-4 top-1/2 -translate-y-1/2 origin-right transition-[opacity,transform] duration-200 ease-out will-change-transform w-[calc(100%-2rem)]",
            isSearchOpen
              ? "opacity-100 scale-x-100"
              : "opacity-0 scale-x-0 pointer-events-none",
          )}
        >
          <Input
            aria-label="Search tables"
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
            placeholder="Search tables..."
            ref={searchInputRef}
            value={searchTerm}
          />
        </div>
      </div>
      <nav aria-label="Tables" className="flex flex-col gap-px pb-3 p-2">
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
Navigation.TablesBlock = TablesBlock;
