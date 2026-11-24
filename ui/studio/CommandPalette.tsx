import type { LucideIcon } from "lucide-react";
import {
  BetweenVerticalStart,
  CalendarClock,
  CircleAlert,
  Cpu,
  Database,
  FileCode2,
  GalleryVerticalEnd,
  Laptop,
  Layers,
  ListTree,
  Moon,
  Search,
  Server,
  Sun,
  Waypoints,
  Workflow,
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
import {
  useTemporalCapabilities,
  useTemporalSchedules,
  useTemporalWorkflows,
} from "../hooks/use-temporal";
import { useUiState } from "../hooks/use-ui-state";
import { cn } from "../lib/utils";
import { useStudio } from "./context";
import {
  TABLE_SEARCH_UI_STATE_KEY,
  type TableSearchUiState,
} from "./navigation-ui-state";
import { toVisibilityQuery } from "./views/temporal/temporal-utils";
import {
  TemporalTime,
  workflowStatusLabel,
} from "./views/temporal/TemporalPrimitives";

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
  /** Shown after the label, such as the time a run started. */
  detail?: ReactNode;
  disabled: boolean;
  icon: LucideIcon;
  id: string;
  keywords?: string[];
  label: string;
  onSelect: (query: string) => void | Promise<void>;
  section: "context" | "schedules" | "tables" | "views" | "workflows";
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

/** Orders matches: a label that starts with the query, then a label that holds it, then a keyword. */
function rankCommandMatch(item: { label: string }, query: string): number {
  const normalizedQuery = normalizeQuery(query);
  const label = item.label.toLowerCase();

  if (normalizedQuery.length === 0) {
    return 0;
  }

  if (
    label.startsWith(normalizedQuery) ||
    label.includes(` ${normalizedQuery}`)
  ) {
    return 0;
  }

  return label.includes(normalizedQuery) ? 1 : 2;
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
        disabled
          ? "text-muted-foreground/55"
          : "text-foreground hover:bg-secondary/85",
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
    hasDatabase,
    isDarkMode,
    isNavigationOpen,
    setThemeMode,
    streamsUrl,
    temporalUrl,
    themeMode,
    toggleNavigation,
  } = useStudio();
  const hasTemporal = typeof temporalUrl === "string";
  const isTemporalOnly =
    !hasDatabase && typeof streamsUrl !== "string" && hasTemporal;
  const { data: temporalCapabilities } = useTemporalCapabilities();
  const { createUrl, schemaParam, temporalFollowParam, temporalNsParam } =
    useNavigation();
  // A paused Temporal page stays paused when the palette opens another one.
  const temporalFollow = useMemo(
    () => (temporalFollowParam ? { temporalFollowParam } : {}),
    [temporalFollowParam],
  );
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
    if (!hasDatabase) {
      return [];
    }

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
  }, [createUrl, hasDatabase, tables]);
  const overflowTableCount = hasDatabase
    ? Math.max(tables.length - visibleTableItems.length, 0)
    : 0;
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
    const items: CommandPaletteItem[] = [];

    if (hasDatabase) {
      items.push(
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
      );
    }

    if (hasTemporal) {
      const ns = temporalNsParam ?? "default";
      const temporalLabel = (name: string) =>
        isTemporalOnly ? name : `Temporal ${name}`;

      items.push(
        {
          disabled: false,
          icon: Waypoints,
          id: "view:temporal:types",
          keywords: ["temporal", "workflow types", "diagram", "steps", "map"],
          label: temporalLabel("Workflow Types"),
          onSelect: () => {
            window.location.hash = createUrl({
              ...temporalFollow,
              temporalNsParam: ns,
              temporalSectionParam: "types",
              viewParam: "temporal",
            });
          },
          section: "views",
        },
        {
          disabled: false,
          icon: ListTree,
          id: "view:temporal:workflow-ids",
          keywords: [
            "temporal",
            "workflow id",
            "workflow ids",
            "chain",
            "runs",
            "continue as new",
            "cron",
            "retry",
          ],
          label: temporalLabel("Workflow IDs"),
          onSelect: () => {
            window.location.hash = createUrl({
              ...temporalFollow,
              temporalNsParam: ns,
              temporalSectionParam: "workflow",
              viewParam: "temporal",
            });
          },
          section: "views",
        },
        {
          disabled: false,
          icon: Workflow,
          id: "view:temporal:workflows",
          keywords: ["temporal", "executions", "workflows", "runs", "debugger"],
          label: temporalLabel("Executions"),
          onSelect: () => {
            window.location.hash = createUrl({
              ...temporalFollow,
              temporalNsParam: ns,
              temporalSectionParam: "workflows",
              viewParam: "temporal",
            });
          },
          section: "views",
        },
        {
          disabled: false,
          icon: CircleAlert,
          id: "view:temporal:attention",
          keywords: ["temporal", "attention", "stuck", "retrying", "failed"],
          label: temporalLabel("Attention"),
          onSelect: () => {
            window.location.hash = createUrl({
              ...temporalFollow,
              temporalNsParam: ns,
              temporalSectionParam: "attention",
              viewParam: "temporal",
            });
          },
          section: "views",
        },
      );

      if (temporalCapabilities?.supportsSchedules !== false) {
        items.push({
          disabled: false,
          icon: CalendarClock,
          id: "view:temporal:schedules",
          keywords: ["temporal", "schedules", "cron", "backfill"],
          label: temporalLabel("Schedules"),
          onSelect: () => {
            window.location.hash = createUrl({
              ...temporalFollow,
              temporalNsParam: ns,
              temporalSectionParam: "schedules",
              viewParam: "temporal",
            });
          },
          section: "views",
        });
      }

      items.push({
        disabled: false,
        icon: Layers,
        id: "view:temporal:queues",
        keywords: ["temporal", "task queues", "pollers", "workers"],
        label: temporalLabel("Task Queues"),
        onSelect: () => {
          window.location.hash = createUrl({
            ...temporalFollow,
            temporalNsParam: ns,
            temporalSectionParam: "queues",
            viewParam: "temporal",
          });
        },
        section: "views",
      });

      // The sidebar shows these two screens only on a server that has them.
      if (temporalCapabilities?.supportsDescribeTaskQueue) {
        items.push({
          disabled: false,
          icon: Cpu,
          id: "view:temporal:workers",
          keywords: ["temporal", "workers", "deployments", "nexus"],
          label: temporalLabel("Workers"),
          onSelect: () => {
            window.location.hash = createUrl({
              ...temporalFollow,
              temporalNsParam: ns,
              temporalSectionParam: "workers",
              viewParam: "temporal",
            });
          },
          section: "views",
        });
      }

      if (temporalCapabilities?.supportsAdminApi) {
        items.push({
          disabled: false,
          icon: Server,
          id: "view:temporal:cluster",
          keywords: ["temporal", "cluster", "shards", "admission", "slatedb"],
          label: temporalLabel("Cluster & Shards"),
          onSelect: () => {
            window.location.hash = createUrl({
              ...temporalFollow,
              temporalNsParam: ns,
              temporalSectionParam: "cluster",
              viewParam: "temporal",
            });
          },
          section: "views",
        });
      }
    }

    return (
      items
        .filter((item) =>
          matchesCommandSearch({
            label: item.label,
            keywords: item.keywords,
            query,
          }),
        )
        // Typing "workers" puts Workers above Task Queues, which only has it as a keyword.
        .sort((a, b) => rankCommandMatch(a, query) - rankCommandMatch(b, query))
    );
  }, [
    createUrl,
    hasDatabase,
    hasTemporal,
    isTemporalOnly,
    query,
    temporalCapabilities,
    temporalFollow,
    temporalNsParam,
  ]);
  // Workflows and schedules come from the Temporal server, so the palette asks
  // for them only once typing has paused.
  const temporalNamespace = temporalNsParam ?? "default";
  const [temporalSearch, setTemporalSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTemporalSearch(query.trim()), 200);

    return () => clearTimeout(timer);
  }, [query]);

  const isTemporalSearchActive =
    typeof temporalUrl === "string" && isOpen && temporalSearch.length >= 2;
  const {
    data: matchingWorkflows,
    isError: hasWorkflowSearchFailed,
    isPlaceholderData: isPreviousWorkflowSearch,
  } = useTemporalWorkflows({
    enabled: isTemporalSearchActive,
    followMode: "paused",
    includeCounts: false,
    namespace: temporalNamespace,
    pageSize: 6,
    query: toVisibilityQuery(temporalSearch),
  });
  const { data: scheduleList } = useTemporalSchedules({
    enabled: isTemporalSearchActive,
    followMode: "paused",
    namespace: temporalNamespace,
  });
  // The runs on screen must be the answer to the text in the field, never to an earlier text.
  const hasWorkflowAnswer =
    isTemporalSearchActive &&
    temporalSearch === query.trim() &&
    matchingWorkflows !== undefined &&
    !isPreviousWorkflowSearch;
  const isSearchingWorkflows =
    typeof temporalUrl === "string" &&
    isOpen &&
    query.trim().length >= 2 &&
    !hasWorkflowAnswer &&
    !hasWorkflowSearchFailed;
  const workflowItems = useMemo<CommandPaletteItem[]>(
    () =>
      hasWorkflowAnswer
        ? (matchingWorkflows?.executions ?? []).map((run) => ({
            detail: <TemporalTime iso={run.startTime} />,
            disabled: false,
            icon: Workflow,
            id: `workflow:${run.workflowId}:${run.runId}`,
            label: `${run.workflowId} · ${run.workflowType} · ${workflowStatusLabel(run.status)}`,
            onSelect: () => {
              window.location.hash = createUrl({
                ...temporalFollow,
                temporalNsParam: temporalNamespace,
                temporalRunParam: run.runId,
                temporalSectionParam: "workflows",
                temporalWfParam: run.workflowId,
                viewParam: "temporal",
              });
            },
            section: "workflows",
          }))
        : [],
    [
      createUrl,
      hasWorkflowAnswer,
      matchingWorkflows,
      temporalFollow,
      temporalNamespace,
    ],
  );
  const scheduleItems = useMemo<CommandPaletteItem[]>(
    () =>
      isTemporalSearchActive
        ? (scheduleList?.schedules ?? [])
            .filter((schedule) =>
              matchesCommandSearch({
                keywords: [schedule.workflowType],
                label: schedule.scheduleId,
                query,
              }),
            )
            .slice(0, 6)
            .map((schedule) => ({
              disabled: false,
              icon: CalendarClock,
              id: `schedule:${schedule.scheduleId}`,
              label: `${schedule.scheduleId} · ${schedule.cadenceSummary}`,
              onSelect: () => {
                window.location.hash = createUrl({
                  ...temporalFollow,
                  temporalNsParam: temporalNamespace,
                  temporalScheduleParam: schedule.scheduleId,
                  temporalSectionParam: "schedules",
                  viewParam: "temporal",
                });
              },
              section: "schedules",
            }))
        : [],
    [
      createUrl,
      isTemporalSearchActive,
      query,
      scheduleList,
      temporalFollow,
      temporalNamespace,
    ],
  );

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
              {item.detail ? (
                <span className="ml-auto shrink-0 pl-3 text-xs text-muted-foreground">
                  {item.detail}
                </span>
              ) : null}
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
          className="w-[min(38rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-border bg-background p-0 font-sans shadow-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            {isTemporalOnly
              ? "Search commands, executions, schedules, and views."
              : "Search commands, tables, and Studio views."}
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
              {isSearchingWorkflows ? (
                <CommandGroup heading="Executions">
                  <div
                    className="px-3 py-2 text-sm text-muted-foreground"
                    data-testid="command-palette-searching"
                    role="status"
                  >
                    Searching…
                  </div>
                </CommandGroup>
              ) : (
                renderSection({
                  items: workflowItems,
                  label: "Executions",
                })
              )}
              {renderSection({
                items: scheduleItems,
                label: "Schedules",
              })}
              {renderAppearanceSection()}
              {renderSection({
                items: viewItems,
                label: "Navigation",
              })}
              {!shouldShowAppearanceSection && !isSearchingWorkflows ? (
                <CommandEmpty>No matching commands.</CommandEmpty>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
