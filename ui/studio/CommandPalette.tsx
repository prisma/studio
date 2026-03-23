import type { LucideIcon } from "lucide-react";
import {
  BetweenVerticalStart,
  Database,
  FileCode2,
  GalleryVerticalEnd,
  Laptop,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import {
  createContext,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog";
import { Switch } from "../components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { useNavigation } from "../hooks/use-navigation";
import { useNavigationTableList } from "../hooks/use-navigation-table-list";
import { useUiState } from "../hooks/use-ui-state";
import { cn } from "../lib/utils";
import { useStudio } from "./context";
import {
  TABLE_SEARCH_UI_STATE_KEY,
  type TableSearchUiState,
} from "./navigation-ui-state";

const COMMAND_PALETTE_UI_STATE_KEY = "studio:command-palette";

export interface CommandPaletteContextAction {
  id: string;
  icon: LucideIcon;
  keywords?: string[];
  disabled?: boolean | ((query: string) => boolean);
  label: string | ((query: string) => string);
  onSelect: (query: string) => void | Promise<void>;
  shouldShow?: (query: string) => boolean;
}

interface CommandPaletteActionRegistration {
  actions: CommandPaletteContextAction[];
  id: string;
}

interface CommandPaletteContextValue {
  registerContextActions: (
    id: string,
    actions: CommandPaletteContextAction[],
  ) => void;
  unregisterContextActions: (id: string) => void;
}

interface CommandPaletteStateContextValue {
  isOpen: boolean;
  setIsOpen: (next: boolean) => void;
  viewActions: CommandPaletteContextAction[];
}

interface CommandPaletteItem {
  disabled: boolean;
  icon: LucideIcon;
  id: string;
  keywords?: string[];
  label: string;
  onSelect: (query: string) => void | Promise<void>;
  section: "context" | "tables" | "views";
}

const CommandPaletteContext = createContext<
  CommandPaletteContextValue | undefined
>(undefined);
const CommandPaletteStateContext = createContext<
  CommandPaletteStateContextValue | undefined
>(undefined);

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function matchesCommandSearch(args: {
  label: string;
  keywords?: string[];
  query: string;
}): boolean {
  const normalizedQuery = normalizeQuery(args.query);

  if (normalizedQuery.length === 0) {
    return true;
  }

  return [args.label, ...(args.keywords ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function resolveActionLabel(
  label: CommandPaletteContextAction["label"],
  query: string,
) {
  return typeof label === "function" ? label(query) : label;
}

function resolveActionDisabled(
  disabled: CommandPaletteContextAction["disabled"],
  query: string,
) {
  return typeof disabled === "function" ? disabled(query) : Boolean(disabled);
}

function getContextActionsFromRegistrations(
  registrations: CommandPaletteActionRegistration[],
): CommandPaletteContextAction[] {
  return registrations[registrations.length - 1]?.actions ?? [];
}

function AppearanceCommandItem(props: {
  children: ReactNode;
  disabled?: boolean;
  icon: LucideIcon;
  keywords?: string[];
  label: string;
  onSelect: () => void;
  value: string;
}) {
  const {
    children,
    disabled = false,
    icon: Icon,
    keywords,
    label,
    onSelect,
    value,
  } = props;

  return (
    <CommandItem
      disabled={disabled}
      keywords={keywords}
      onSelect={onSelect}
      value={value}
      className={cn(
        "justify-between gap-3",
        disabled ? "text-muted-foreground/55" : "text-foreground hover:bg-secondary/85",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-center">{children}</span>
    </CommandItem>
  );
}

function useCommandPaletteContext() {
  const context = useContext(CommandPaletteContext);

  if (!context) {
    throw new Error(
      "useCommandPaletteContext must be used within StudioCommandPaletteProvider",
    );
  }

  return context;
}

function useCommandPaletteStateContext() {
  const context = useContext(CommandPaletteStateContext);

  if (!context) {
    throw new Error(
      "useCommandPaletteStateContext must be used within StudioCommandPaletteProvider",
    );
  }

  return context;
}

export function useCommandPalette() {
  const { isOpen, setIsOpen } = useCommandPaletteStateContext();

  return {
    close() {
      setIsOpen(false);
    },
    isOpen,
    open() {
      setIsOpen(true);
    },
    setIsOpen,
  };
}

export function useRegisterCommandPaletteActions(
  actions: CommandPaletteContextAction[],
) {
  const { registerContextActions, unregisterContextActions } =
    useCommandPaletteContext();
  const registrationId = useId();

  useEffect(() => {
    registerContextActions(registrationId, actions);

    return () => {
      unregisterContextActions(registrationId);
    };
  }, [
    actions,
    registerContextActions,
    registrationId,
    unregisterContextActions,
  ]);
}

export function StudioCommandPaletteProvider(props: PropsWithChildren) {
  const { children } = props;
  const [paletteUiState, setPaletteUiState] = useUiState(
    COMMAND_PALETTE_UI_STATE_KEY,
    {
      isOpen: false,
    },
  );
  const [registrations, setRegistrations] = useState<
    CommandPaletteActionRegistration[]
  >([]);
  const viewActions = useMemo(
    () => getContextActionsFromRegistrations(registrations),
    [registrations],
  );
  const setIsOpen = useCallback(
    (next: boolean) => {
      setPaletteUiState((previous) => ({
        ...previous,
        isOpen: next,
      }));
    },
    [setPaletteUiState],
  );
  const registerContextActions = useCallback(
    (id: string, actions: CommandPaletteContextAction[]) => {
      setRegistrations((previous) => {
        const next = previous.filter((registration) => registration.id !== id);

        next.push({
          actions,
          id,
        });

        return next;
      });
    },
    [],
  );
  const unregisterContextActions = useCallback((id: string) => {
    setRegistrations((previous) =>
      previous.filter((registration) => registration.id !== id),
    );
  }, []);
  const commandPaletteRegistryContextValue = useMemo(
    () => ({
      registerContextActions,
      unregisterContextActions,
    }),
    [registerContextActions, unregisterContextActions],
  );
  const commandPaletteStateContextValue = useMemo(
    () => ({
      isOpen: paletteUiState.isOpen,
      setIsOpen,
      viewActions,
    }),
    [paletteUiState.isOpen, setIsOpen, viewActions],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "k" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      setIsOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setIsOpen]);

  return (
    <CommandPaletteContext.Provider value={commandPaletteRegistryContextValue}>
      <CommandPaletteStateContext.Provider
        value={commandPaletteStateContextValue}
      >
        {children}
        <StudioCommandPalette />
      </CommandPaletteStateContext.Provider>
    </CommandPaletteContext.Provider>
  );
}

function StudioCommandPalette() {
  const {
    isDarkMode,
    isNavigationOpen,
    setThemeMode,
    themeMode,
    toggleNavigation,
  } = useStudio();
  const { createUrl, schemaParam } = useNavigation();
  const { isOpen, setIsOpen, viewActions } = useCommandPaletteStateContext();
  const [query, setQuery] = useState("");
  const [, setTableSearchUiState] = useUiState<TableSearchUiState>(
    TABLE_SEARCH_UI_STATE_KEY,
    {
      isOpen: false,
      term: "",
    },
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scopeRef = useRef<HTMLSpanElement | null>(null);
  const { tables } = useNavigationTableList({
    schema: schemaParam,
    searchTerm: query,
  });
  const visibleContextActions = useMemo(() => {
    return viewActions
      .filter((action) => action.shouldShow?.(query) ?? true)
      .map<CommandPaletteItem>((action) => {
        const label = resolveActionLabel(action.label, query);

        return {
          disabled: resolveActionDisabled(action.disabled, query),
          icon: action.icon,
          id: action.id,
          keywords: action.keywords,
          label,
          onSelect: action.onSelect,
          section: "context",
        };
      })
      .filter((item) =>
        matchesCommandSearch({
          label: item.label,
          keywords: item.keywords,
          query,
        }),
      );
  }, [query, viewActions]);
  const visibleTableItems = useMemo(() => {
    return tables.slice(0, 3).map<CommandPaletteItem>((table) => ({
      disabled: false,
      icon: Database,
      id: `table:${table.id}`,
      keywords: [table.qualifiedName, table.schema, "table"],
      label: table.table,
      onSelect: () => {
        window.location.hash = createUrl({
          schemaParam: table.schema,
          tableParam: table.table,
          viewParam: "table",
        });
      },
      section: "tables",
    }));
  }, [createUrl, tables]);
  const overflowTableCount = Math.max(
    tables.length - visibleTableItems.length,
    0,
  );
  const moreTablesItem = useMemo<CommandPaletteItem | null>(() => {
    if (overflowTableCount === 0) {
      return null;
    }

    return {
      disabled: false,
      icon: Search,
      id: "tables:more",
      keywords: ["filter tables", "more tables", "browse tables"],
      label: `${overflowTableCount} more...`,
      onSelect: (searchTerm) => {
        if (!isNavigationOpen) {
          toggleNavigation();
        }

        setTableSearchUiState({
          isOpen: true,
          term: searchTerm.trim(),
        });
      },
      section: "tables",
    };
  }, [
    isNavigationOpen,
    overflowTableCount,
    setTableSearchUiState,
    toggleNavigation,
  ]);
  const tableItems = useMemo(() => {
    return moreTablesItem
      ? [...visibleTableItems, moreTablesItem]
      : visibleTableItems;
  }, [moreTablesItem, visibleTableItems]);
  const explicitThemeMode = themeMode === "system" ? "" : themeMode;
  const isSystemThemeEnabled = themeMode === "system";
  const showSystemThemeControl = matchesCommandSearch({
    label: "Match system theme",
    keywords: [
      "appearance",
      "follow system",
      "match system",
      "system",
      "system theme",
      "theme",
    ],
    query,
  });
  const showExplicitThemeControl = matchesCommandSearch({
    label: "Studio theme",
    keywords: [
      "appearance",
      "dark",
      "dark mode",
      "light",
      "light mode",
      "theme",
    ],
    query,
  });
  const shouldShowAppearanceSection =
    showSystemThemeControl || showExplicitThemeControl;
  const handleSystemThemeToggle = useCallback(
    (checked: boolean) => {
      if (checked) {
        setThemeMode("system");
        return;
      }

      setThemeMode(isDarkMode ? "dark" : "light");
    },
    [isDarkMode, setThemeMode],
  );
  const handleExplicitThemeChange = useCallback(
    (nextThemeMode: string) => {
      if (nextThemeMode === "dark" || nextThemeMode === "light") {
        setThemeMode(nextThemeMode);
      }
    },
    [setThemeMode],
  );
  const handleExplicitThemeToggle = useCallback(() => {
    setThemeMode(isDarkMode ? "light" : "dark");
  }, [isDarkMode, setThemeMode]);
  const viewItems = useMemo(() => {
    const items: CommandPaletteItem[] = [
      {
        disabled: false,
        icon: GalleryVerticalEnd,
        id: "view:schema",
        keywords: ["visualizer", "schema", "diagram"],
        label: "Visualizer",
        onSelect: () => {
          window.location.hash = createUrl({ viewParam: "schema" });
        },
        section: "views",
      },
      {
        disabled: false,
        icon: BetweenVerticalStart,
        id: "view:console",
        keywords: ["console", "events", "operations"],
        label: "Console",
        onSelect: () => {
          window.location.hash = createUrl({ viewParam: "console" });
        },
        section: "views",
      },
      {
        disabled: false,
        icon: FileCode2,
        id: "view:sql",
        keywords: ["sql", "query", "editor"],
        label: "SQL",
        onSelect: () => {
          window.location.hash = createUrl({ viewParam: "sql" });
        },
        section: "views",
      },
    ];

    return items.filter((item) =>
      matchesCommandSearch({
        label: item.label,
        keywords: item.keywords,
        query,
      }),
    );
  }, [createUrl, query]);
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isOpen]);

  function closePalette() {
    setIsOpen(false);
  }

  function handleSelect(item: CommandPaletteItem) {
    if (item.disabled) {
      return;
    }

    const currentQuery = query;

    setQuery("");
    closePalette();
    void Promise.resolve(item.onSelect(currentQuery));
  }

  function renderSection(args: { items: CommandPaletteItem[]; label: string }) {
    const { items, label } = args;

    if (items.length === 0) {
      return null;
    }

    return (
      <CommandGroup heading={label}>
        {items.map((item) => {
          const ItemIcon = item.icon;

          return (
            <CommandItem
              key={item.id}
              disabled={item.disabled}
              keywords={item.keywords}
              onSelect={() => handleSelect(item)}
              value={item.id}
              className={cn(
                item.disabled
                  ? "text-muted-foreground/55"
                  : "text-foreground hover:bg-secondary/85",
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground transition-colors group-data-[selected=true]:border-border group-data-[selected=true]:bg-card">
                <ItemIcon className="size-3.5" />
              </span>
              <span className="min-w-0 truncate">{item.label}</span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    );
  }

  function renderAppearanceSection() {
    if (!shouldShowAppearanceSection) {
      return null;
    }

    return (
      <CommandGroup heading="Appearance">
        {showSystemThemeControl ? (
          <AppearanceCommandItem
            icon={Laptop}
            keywords={[
              "appearance",
              "follow system",
              "match system",
              "system",
              "system theme",
              "theme",
            ]}
            label="Match system theme"
            onSelect={() => handleSystemThemeToggle(!isSystemThemeEnabled)}
            value="appearance:system-theme"
          >
            <Switch
              aria-label="Match system theme"
              checked={isSystemThemeEnabled}
              onClick={(event) => {
                event.stopPropagation();
              }}
              onCheckedChange={handleSystemThemeToggle}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          </AppearanceCommandItem>
        ) : null}
        {showExplicitThemeControl ? (
          <AppearanceCommandItem
            disabled={isSystemThemeEnabled}
            icon={isDarkMode ? Moon : Sun}
            keywords={[
              "appearance",
              "dark",
              "dark mode",
              "light",
              "light mode",
              "theme",
            ]}
            label="Studio theme"
            onSelect={handleExplicitThemeToggle}
            value="appearance:studio-theme"
          >
            <ToggleGroup
              aria-label="Studio theme"
              className="gap-1 rounded-lg bg-muted/60 p-1"
              type="single"
              value={explicitThemeMode}
              onValueChange={handleExplicitThemeChange}
            >
              <ToggleGroupItem
                aria-label="Light mode"
                className="min-w-13 border-0 bg-transparent px-2.5 py-1 text-xs shadow-none hover:bg-background/80 hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                disabled={isSystemThemeEnabled}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                size="sm"
                value="light"
                variant="default"
              >
                Light
              </ToggleGroupItem>
              <ToggleGroupItem
                aria-label="Dark mode"
                className="min-w-13 border-0 bg-transparent px-2.5 py-1 text-xs shadow-none hover:bg-background/80 hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                disabled={isSystemThemeEnabled}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                size="sm"
                value="dark"
                variant="default"
              >
                Dark
              </ToggleGroupItem>
            </ToggleGroup>
          </AppearanceCommandItem>
        ) : null}
      </CommandGroup>
    );
  }

  const scopePortalContainer = scopeRef.current?.closest(".ps");
  const portalContainer =
    scopePortalContainer instanceof HTMLElement
      ? scopePortalContainer
      : typeof document === "undefined"
        ? null
        : document.body;

  return (
    <>
      <span ref={scopeRef} aria-hidden="true" className="hidden" />
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          container={portalContainer}
          className="w-[min(38rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-border bg-background p-0 font-sans shadow-[0_16px_36px_rgba(15,23,42,0.12)]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Search commands, tables, and Studio views.
          </DialogDescription>
          <Command className="font-sans" shouldFilter={false}>
            <CommandInput
              aria-label="Search commands"
              className="border-0 shadow-none focus-visible:ring-0"
              onValueChange={setQuery}
              placeholder="Search commands"
              ref={inputRef}
              value={query}
            />
            <CommandList className="px-1 py-1">
              {renderSection({
                items: visibleContextActions,
                label: "Suggested",
              })}
              {renderSection({
                items: tableItems,
                label: "Tables",
              })}
              {renderAppearanceSection()}
              {renderSection({
                items: viewItems,
                label: "Navigation",
              })}
              {!shouldShowAppearanceSection ? (
                <CommandEmpty>No matching commands.</CommandEmpty>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
