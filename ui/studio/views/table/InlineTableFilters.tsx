import {
  Check,
  ChevronDown,
  Code2,
  Database,
  FilterIcon,
  Loader2,
  Search,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import type {
  AdapterSqlLintDetails,
  AdapterSqlLintOptions,
  AdapterSqlLintResult,
  Either,
  FilterOperator,
  SqlEditorDialect,
  Table,
} from "@/data";

import { coerceToString, coerceToValue } from "../../../../lib/conversionUtils";
import { Input } from "../../../components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import {
  countFiltersRecursive,
  createEditingColumnFilter,
  createEditingSqlFilter,
  type EditingColumnFilter,
  type EditingFilterGroup,
  type EditingFilterNode,
  type EditingSqlFilter,
  getEditingFilterIssue,
  getEditingFilterSyntaxIssue,
  getSupportedFilterOperatorsForColumn,
  isFilterOperator,
} from "../../../hooks/filter-utils";
import { cn } from "../../../lib/utils";
import {
  buildSqlFilterLintStatement,
  getSqlFilterLintFailureMessage,
} from "./sql-filter-lint";
import { applyAiTableFilterRequest } from "./table-ai-filter";

const DEFAULT_FILTER_OPERATORS: FilterOperator[] = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "is",
  "is not",
  "like",
  "not like",
  "ilike",
  "not ilike",
];

const FILTER_OPERATOR_OPTIONS: Array<{
  category: "Comparison" | "Text Search" | "Null Checks";
  label: string;
  value: FilterOperator;
}> = [
  { category: "Comparison", label: "Equal", value: "=" },
  { category: "Comparison", label: "Not equal", value: "!=" },
  { category: "Comparison", label: "Greater than", value: ">" },
  { category: "Comparison", label: "Greater than or equal", value: ">=" },
  { category: "Comparison", label: "Less than", value: "<" },
  { category: "Comparison", label: "Less than or equal", value: "<=" },
  { category: "Text Search", label: "Like", value: "like" },
  { category: "Text Search", label: "Not like", value: "not like" },
  { category: "Text Search", label: "Ilike", value: "ilike" },
  { category: "Text Search", label: "Not ilike", value: "not ilike" },
  { category: "Null Checks", label: "Is", value: "is" },
  { category: "Null Checks", label: "Is not", value: "is not" },
];

interface InlineTableFilterAddButtonProps {
  aiFilter?: (input: string) => Promise<string>;
  aiFocusRequestKey?: number;
  applyEditingFilter: (filter?: EditingFilterGroup) => void;
  disabled?: boolean;
  filterOperators?: FilterOperator[];
  editingFilter: EditingFilterGroup;
  onBlockedInteraction?: () => void;
  setEditingFilter: (filter: EditingFilterGroup) => void;
  table: Table;
  totalEditingFilters: number;
}

interface InlineTableFiltersHeaderRowProps {
  applyEditingFilter: (filter?: EditingFilterGroup) => void;
  disabled?: boolean;
  editingFilter: EditingFilterGroup;
  filterOperators?: FilterOperator[];
  onBlockedInteraction?: () => void;
  setEditingFilter: (filter: EditingFilterGroup) => void;
  sqlFilterLint?: SqlFilterLintSupport | null;
  table: Table;
}

interface SqlFilterLintSupport {
  dialect: SqlEditorDialect;
  lintSql: (
    details: AdapterSqlLintDetails,
    options: AdapterSqlLintOptions,
  ) => Promise<Either<Error, AdapterSqlLintResult>>;
  schemaVersion?: string;
}

function getFilterColumnDatatypeLabel(tableColumn: Table["columns"][string]) {
  return tableColumn.datatype.name;
}

const SQL_FILTER_OPTION_LABEL = "SQL WHERE clause";
const SQL_FILTER_OPTION_META = "Raw SQL";

function matchesSqlFilterOption(searchTerm: string) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  if (normalizedSearch.length === 0) {
    return true;
  }

  return [SQL_FILTER_OPTION_LABEL, SQL_FILTER_OPTION_META, "sql", "where"]
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch);
}

export function getFilterPillTooltipContent(args: {
  aiSourceQuery?: string;
  issueMessage?: string | null;
}): {
  isWarning: boolean;
  primaryMessage: string;
  secondaryMessage?: string;
} | null {
  const { aiSourceQuery, issueMessage } = args;
  const trimmedAiSourceQuery = aiSourceQuery?.trim();

  if (!issueMessage && !trimmedAiSourceQuery) {
    return null;
  }

  if (issueMessage) {
    return {
      isWarning: true,
      primaryMessage: issueMessage,
      secondaryMessage: trimmedAiSourceQuery,
    };
  }

  return {
    isWarning: false,
    primaryMessage: trimmedAiSourceQuery!,
  };
}

function wrapFilterPillTooltip(args: {
  aiSourceQuery?: string;
  issueMessage?: string | null;
  pillContent: ReactNode;
}) {
  const { pillContent } = args;
  const tooltipContent = getFilterPillTooltipContent(args);

  if (!tooltipContent) {
    return pillContent;
  }

  const { isWarning, primaryMessage, secondaryMessage } = tooltipContent;

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>{pillContent}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          className={cn(
            "max-w-[260px] px-2.5 py-1.5 text-xs shadow-sm",
            isWarning
              ? "border border-amber-300 bg-amber-100 text-amber-950"
              : "border border-emerald-300 bg-emerald-100 text-emerald-950",
          )}
        >
          <div className="space-y-1">
            <div>{primaryMessage}</div>
            {isWarning && secondaryMessage ? (
              <div className="border-t border-amber-300/80 pt-1 text-[11px] text-amber-900/85">
                {secondaryMessage}
              </div>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function InlineTableFilterAddButton(
  props: InlineTableFilterAddButtonProps,
) {
  const {
    aiFilter,
    aiFocusRequestKey = 0,
    applyEditingFilter,
    disabled = false,
    editingFilter,
    filterOperators,
    onBlockedInteraction,
    setEditingFilter,
    table,
    totalEditingFilters,
  } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const [isApplyingAiFilter, setIsApplyingAiFilter] = useState(false);
  const isAiFilterVisible = typeof aiFilter === "function";
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const aiInputRef = useRef<HTMLInputElement | null>(null);
  const columns = useMemo(() => Object.values(table.columns), [table.columns]);
  const visibleColumns = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (normalizedSearch.length === 0) {
      return columns;
    }

    return columns.filter((column) => {
      const datatype = getFilterColumnDatatypeLabel(column);

      return (
        column.name.toLowerCase().includes(normalizedSearch) ||
        datatype.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [columns, searchTerm]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [isOpen]);

  useEffect(() => {
    if (!isAiFilterVisible || aiFocusRequestKey === 0 || disabled) {
      return;
    }

    setIsAiExpanded(true);

    requestAnimationFrame(() => {
      aiInputRef.current?.focus();
      aiInputRef.current?.select();
    });
  }, [aiFocusRequestKey, disabled, isAiFilterVisible]);

  useEffect(() => {
    if (!disabled) {
      return;
    }

    setIsOpen(false);
    setIsAiExpanded(false);
  }, [disabled]);

  function handleBlockedInteraction() {
    onBlockedInteraction?.();
  }

  function handleBlockedMouseDown(event: ReactMouseEvent<HTMLElement>) {
    if (!disabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleBlockedInteraction();
  }

  function handlePopoverOpenChange(nextOpen: boolean) {
    if (disabled && nextOpen) {
      handleBlockedInteraction();
      return;
    }

    setIsOpen(nextOpen);
  }

  function handleColumnSelect(columnName: string) {
    const nextFilter = {
      ...editingFilter,
      filters: [
        ...editingFilter.filters,
        createEditingColumnFilter(columnName),
      ],
    };

    setEditingFilter(nextFilter);
    setSearchTerm("");
    setIsOpen(false);
  }

  function handleSqlFilterSelect() {
    const nextFilter = {
      ...editingFilter,
      filters: [...editingFilter.filters, createEditingSqlFilter()],
    };

    setEditingFilter(nextFilter);
    setSearchTerm("");
    setIsOpen(false);
  }

  const isAiPromptActive =
    isAiExpanded || aiPrompt.trim().length > 0 || isApplyingAiFilter;
  const showAiSubmitAction =
    aiPrompt.trim().length > 0 && !isApplyingAiFilter && isAiFilterVisible;

  const filterMenuTrigger = (
    <PopoverTrigger asChild>
      <button
        aria-disabled={disabled || undefined}
        aria-expanded={isOpen}
        aria-label="Add filter"
        type="button"
        className={cn(
          "flex h-9 shrink-0 items-center gap-1.5 bg-transparent px-3 text-sm text-foreground transition-colors focus-visible:outline-none",
          disabled && "opacity-70",
          isAiFilterVisible
            ? "border-r border-border/70 hover:bg-accent/50"
            : "rounded-md border border-input shadow-sm hover:bg-accent",
          !isAiFilterVisible &&
            totalEditingFilters > 0 &&
            "border-primary ring-1 ring-primary/15",
        )}
        onClick={(event) => {
          if (!disabled) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          handleBlockedInteraction();
        }}
        onMouseDown={handleBlockedMouseDown}
      >
        <FilterIcon className="size-4" />
        <ChevronDown
          data-testid="table-filter-menu-chevron"
          className="size-3.5 text-muted-foreground"
        />
      </button>
    </PopoverTrigger>
  );

  async function handleAiFilterSubmit() {
    if (!aiFilter || disabled) {
      return;
    }

    const trimmedPrompt = aiPrompt.trim();

    if (trimmedPrompt.length === 0 || isApplyingAiFilter) {
      return;
    }

    setIsApplyingAiFilter(true);

    try {
      await applyAiTableFilterRequest({
        aiFilter,
        applyEditingFilter,
        filterOperators,
        request: trimmedPrompt,
        setEditingFilter,
        table,
      });
      setAiPrompt("");
      setIsAiExpanded(false);
    } catch (error) {
      toast.error("AI filtering failed.", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsApplyingAiFilter(false);
    }
  }

  return (
    <div
      data-testid="table-ai-filter-control"
      className={cn(
        "flex min-w-0 items-center",
        isAiFilterVisible && isAiPromptActive && "flex-1",
      )}
    >
      <Popover open={isOpen} onOpenChange={handlePopoverOpenChange}>
        {isAiFilterVisible ? (
          <div
            data-testid="table-filter-combo-shell"
            className={cn(
              "flex min-w-0 items-center overflow-hidden rounded-md border bg-background shadow-sm transition-[border-color,box-shadow,width,flex-basis] duration-150 ease-out",
              disabled && "opacity-70",
              isAiPromptActive ? "flex-1" : "w-[252px]",
              totalEditingFilters > 0 || isOpen
                ? "border-primary ring-1 ring-primary/15"
                : "border-input",
              "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/15",
            )}
          >
            {filterMenuTrigger}
            <div
              className={cn(
                "flex min-w-0 items-center self-stretch",
                isAiPromptActive ? "flex-1" : "w-[196px]",
              )}
            >
              <Input
                aria-disabled={disabled || undefined}
                aria-label="Filter with AI"
                className="h-9 min-w-0 flex-1 border-0 rounded-none bg-transparent px-3 py-0 text-sm shadow-none focus-visible:ring-0"
                onBlur={() => {
                  if (disabled) {
                    return;
                  }

                  if (aiPrompt.trim().length === 0 && !isApplyingAiFilter) {
                    setIsAiExpanded(false);
                  }
                }}
                onChange={(event) => {
                  if (disabled) {
                    handleBlockedInteraction();
                    return;
                  }

                  setAiPrompt(event.currentTarget.value);
                }}
                onClick={() => {
                  if (disabled) {
                    handleBlockedInteraction();
                  }
                }}
                onMouseDown={handleBlockedMouseDown}
                onFocus={() => {
                  if (disabled) {
                    aiInputRef.current?.blur();
                    handleBlockedInteraction();
                    return;
                  }

                  setIsAiExpanded(true);
                }}
                onKeyDown={(event) => {
                  if (disabled) {
                    handleBlockedInteraction();
                    event.preventDefault();
                    return;
                  }

                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleAiFilterSubmit();
                  }

                  if (
                    event.key === "Escape" &&
                    aiPrompt.trim().length === 0 &&
                    !isApplyingAiFilter
                  ) {
                    setIsAiExpanded(false);
                    aiInputRef.current?.blur();
                  }
                }}
                placeholder="Filter with AI ..."
                ref={aiInputRef}
                readOnly={disabled}
                value={aiPrompt}
              />
              {isApplyingAiFilter ? (
                <Loader2 className="mr-3 size-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : showAiSubmitAction ? (
                <button
                  aria-label="Apply AI filter"
                  className="mr-2.5 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => {
                    void handleAiFilterSubmit();
                  }}
                  type="button"
                >
                  <Check className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          filterMenuTrigger
        )}
        <PopoverContent
          align="start"
          side="bottom"
          className="w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden p-0 font-sans"
        >
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <Search className="absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Select column to filter"
                className="h-8 border-0 pl-6 pr-0 text-sm shadow-none focus-visible:ring-0"
                onChange={(event) => {
                  setSearchTerm(event.currentTarget.value);
                }}
                placeholder="Select column to filter..."
                ref={searchInputRef}
                value={searchTerm}
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1.5">
            {visibleColumns.length === 0 &&
            !matchesSqlFilterOption(searchTerm) ? (
              <div className="px-2.5 py-4 text-xs text-muted-foreground">
                No columns match this search.
              </div>
            ) : (
              <>
                {matchesSqlFilterOption(searchTerm) ? (
                  <button
                    type="button"
                    className="mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={handleSqlFilterSelect}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Code2 className="size-3.5 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">
                        {SQL_FILTER_OPTION_LABEL}
                      </span>
                    </span>
                    <span className="truncate pl-3 text-xs text-muted-foreground">
                      {SQL_FILTER_OPTION_META}
                    </span>
                  </button>
                ) : null}
                {visibleColumns.map((column) => (
                  <button
                    key={column.name}
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={() => handleColumnSelect(column.name)}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Database className="size-3.5 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">
                        {column.name}
                      </span>
                    </span>
                    <span className="truncate pl-3 text-xs text-muted-foreground">
                      {getFilterColumnDatatypeLabel(column)}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function InlineTableFiltersHeaderRow(
  props: InlineTableFiltersHeaderRowProps,
) {
  const {
    applyEditingFilter,
    disabled = false,
    editingFilter,
    filterOperators,
    onBlockedInteraction,
    setEditingFilter,
    sqlFilterLint,
    table,
  } = props;

  if (editingFilter.filters.length === 0) {
    return null;
  }

  function updateNodeAtIndex(index: number, nextNode: EditingFilterNode) {
    const nextFilter = {
      ...editingFilter,
      filters: editingFilter.filters.map((filter, currentIndex) =>
        currentIndex === index ? nextNode : filter,
      ),
    };

    setEditingFilter(nextFilter);
  }

  function removeNodeAtIndex(index: number) {
    const nextFilter = {
      ...editingFilter,
      filters: editingFilter.filters.filter(
        (_filter, currentIndex) => currentIndex !== index,
      ),
    };

    setEditingFilter(nextFilter);
    applyEditingFilter(nextFilter);
  }

  function handleBlockedMouseCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!disabled || !isInteractiveFilterTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onBlockedInteraction?.();
  }

  function handleBlockedKeyCapture(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (
      !disabled ||
      event.key === "Tab" ||
      !isInteractiveFilterTarget(event.target)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onBlockedInteraction?.();
  }

  return (
    <div
      aria-disabled={disabled || undefined}
      data-testid="table-filter-row"
      className="shrink-0 border-b border-table-border bg-table-head px-2 pt-1 pb-3"
      onClickCapture={handleBlockedMouseCapture}
      onKeyDownCapture={handleBlockedKeyCapture}
      onMouseDownCapture={handleBlockedMouseCapture}
    >
      <div
        data-testid="table-filter-pill-list"
        className="flex flex-wrap items-center gap-1.5"
      >
        {editingFilter.filters.map((filterNode, index) =>
          filterNode.kind === "ColumnFilter" ? (
            <InlineTableFilterPill
              key={filterNode.id}
              applyEditingFilter={applyEditingFilter}
              availableOperators={filterOperators}
              filter={filterNode}
              onRemove={() => removeNodeAtIndex(index)}
              onUpdate={(nextNode) => updateNodeAtIndex(index, nextNode)}
              table={table}
            />
          ) : filterNode.kind === "SqlFilter" ? (
            <InlineTableSqlFilterPill
              key={filterNode.id}
              applyEditingFilter={applyEditingFilter}
              filter={filterNode}
              onRemove={() => removeNodeAtIndex(index)}
              onUpdate={(nextNode) => updateNodeAtIndex(index, nextNode)}
              sqlFilterLint={sqlFilterLint}
              table={table}
            />
          ) : (
            <InlineTableFilterGroupPill
              key={filterNode.id}
              filterGroup={filterNode}
              onRemove={() => removeNodeAtIndex(index)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function isInteractiveFilterTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(
      "button, input, textarea, [role='button'], [role='combobox']",
    ) != null
  );
}

function InlineTableFilterPill(props: {
  applyEditingFilter: (filter?: EditingFilterGroup) => void;
  availableOperators?: FilterOperator[];
  filter: EditingColumnFilter;
  onRemove: () => void;
  onUpdate: (filter: EditingColumnFilter) => void;
  table: Table;
}) {
  const {
    applyEditingFilter,
    availableOperators,
    filter,
    onRemove,
    onUpdate,
    table,
  } = props;
  const [isEditing, setIsEditing] = useState(filter.operator === "");
  const [isDraftFilter, setIsDraftFilter] = useState(filter.operator === "");
  const [isOperatorOpen, setIsOperatorOpen] = useState(false);
  const [operatorSearchTerm, setOperatorSearchTerm] = useState("");
  const operatorSearchInputRef = useRef<HTMLInputElement | null>(null);
  const operatorPopoverContentRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusValueInputOnCloseRef = useRef(false);
  const valueInputRef = useRef<HTMLInputElement | null>(null);
  const isOperatorUnset = filter.operator === "";
  const column = table.columns[filter.column];
  const syntaxIssue = getEditingFilterSyntaxIssue(filter, table.columns);
  const savedSyntaxIssue = !isEditing ? syntaxIssue : null;
  const filterValue =
    typeof filter.draftValue === "string"
      ? filter.draftValue
      : isFilterOperator(filter.operator) && column
        ? coerceToString(column, filter.operator, filter.value)
        : "";
  const displayValue = filterValue.length > 0 ? filterValue : "Empty";
  const supportedOperators =
    availableOperators && availableOperators.length > 0
      ? availableOperators
      : DEFAULT_FILTER_OPERATORS;
  const operatorOptions = useMemo(() => {
    const availableValues = new Set<FilterOperator>(
      column
        ? getSupportedFilterOperatorsForColumn(column, supportedOperators)
        : supportedOperators,
    );
    const normalizedSearch = operatorSearchTerm.trim().toLowerCase();

    return FILTER_OPERATOR_OPTIONS.filter((option) => {
      if (!availableValues.has(option.value)) {
        return false;
      }

      if (normalizedSearch.length === 0) {
        return true;
      }

      return (
        option.label.toLowerCase().includes(normalizedSearch) ||
        option.value.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [column, operatorSearchTerm, supportedOperators]);

  useEffect(() => {
    if (isOperatorUnset) {
      setIsEditing(true);
    }
  }, [isOperatorUnset]);

  useEffect(() => {
    if (!isOperatorUnset && !isOperatorOpen) {
      return;
    }

    operatorSearchInputRef.current?.focus();
    operatorSearchInputRef.current?.select();
  }, [isOperatorOpen, isOperatorUnset]);

  function focusValueInput() {
    requestAnimationFrame(() => {
      valueInputRef.current?.focus();
      valueInputRef.current?.select();
    });
  }

  const handleApply = useCallback(() => {
    if (!isFilterOperator(filter.operator)) {
      return;
    }

    applyEditingFilter();
    setIsDraftFilter(false);
    setIsEditing(false);
    setIsOperatorOpen(false);
  }, [applyEditingFilter, filter.operator]);

  const handleDismiss = useCallback(() => {
    shouldFocusValueInputOnCloseRef.current = false;

    if (isDraftFilter) {
      onRemove();
      return;
    }

    if (isFilterOperator(filter.operator)) {
      applyEditingFilter();
    }

    setIsEditing(false);
    setIsOperatorOpen(false);
  }, [applyEditingFilter, filter.operator, isDraftFilter, onRemove]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (pillRef.current?.contains(target)) {
        return;
      }

      if (operatorPopoverContentRef.current?.contains(target)) {
        return;
      }

      handleDismiss();
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      handleDismiss();
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [handleDismiss, isEditing]);

  function handleValueChange(event: ChangeEvent<HTMLInputElement>) {
    if (!column || !isFilterOperator(filter.operator)) {
      return;
    }

    onUpdate({
      ...filter,
      draftValue: event.currentTarget.value,
      value: coerceToValue(column, filter.operator, event.currentTarget.value),
    });
  }

  function handleValueKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    handleApply();
  }

  function handleOperatorSelect(operator: FilterOperator) {
    shouldFocusValueInputOnCloseRef.current = true;
    onUpdate({
      ...filter,
      operator,
    });
    setOperatorSearchTerm("");
    setIsEditing(true);
    setIsOperatorOpen(false);
  }

  const pillContent = (
    <div
      ref={pillRef}
      aria-invalid={savedSyntaxIssue ? true : undefined}
      className={cn(
        "inline-flex max-w-full items-stretch overflow-hidden rounded-full border bg-background text-xs leading-none text-foreground font-sans shadow-sm",
        savedSyntaxIssue
          ? "border-amber-400 ring-1 ring-amber-300/80"
          : "border-table-border",
      )}
      data-filter-ai-query={filter.aiSource?.query}
      data-filter-origin={filter.aiSource ? "ai" : "manual"}
      data-filter-syntax-state={savedSyntaxIssue ? "invalid" : "valid"}
      data-filter-syntax-message={savedSyntaxIssue?.message}
    >
      <div className="flex h-6 min-h-0 min-w-0 items-center gap-1.5 border-r border-table-border px-2 py-0 text-foreground">
        <Database
          className={cn(
            "size-3.5 shrink-0",
            savedSyntaxIssue ? "text-amber-500" : "text-primary",
          )}
        />
        <span className="truncate font-semibold leading-none">
          {filter.column}
        </span>
      </div>
      <Popover
        open={isOperatorUnset || isOperatorOpen}
        onOpenChange={(open) => {
          if (isOperatorUnset) {
            return;
          }

          setIsOperatorOpen(open);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Choose operator for ${filter.column}`}
            className="flex h-6 min-h-0 min-w-10 appearance-none items-center justify-center rounded-none border-0 border-r border-table-border bg-transparent px-2 py-0 text-[11px] leading-none font-sans font-medium text-foreground/80 shadow-none transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setIsEditing(true);
              setIsOperatorOpen(true);
            }}
          >
            {filter.operator || "Select operator..."}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden p-0 font-sans"
          ref={operatorPopoverContentRef}
          onCloseAutoFocus={(event) => {
            if (!shouldFocusValueInputOnCloseRef.current) {
              return;
            }

            event.preventDefault();
            shouldFocusValueInputOnCloseRef.current = false;
            focusValueInput();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <Search className="absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Select operator"
                className="h-8 border-0 pl-6 pr-0 text-sm shadow-none focus-visible:ring-0"
                onChange={(event) => {
                  setOperatorSearchTerm(event.currentTarget.value);
                }}
                placeholder="Select operator..."
                ref={operatorSearchInputRef}
                value={operatorSearchTerm}
              />
            </div>
          </div>
          <div className="max-h-[320px] overflow-y-auto p-1.5">
            {operatorOptions.length === 0 ? (
              <div className="px-2.5 py-4 text-xs text-muted-foreground">
                No operators match this search.
              </div>
            ) : (
              ["Comparison", "Text Search", "Null Checks"].map((category) => {
                const categoryOptions = operatorOptions.filter(
                  (option) => option.category === category,
                );

                if (categoryOptions.length === 0) {
                  return null;
                }

                return (
                  <div key={category} className="pb-1.5 last:pb-0">
                    <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {category}
                    </div>
                    {categoryOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                        onClick={() => handleOperatorSelect(option.value)}
                      >
                        <span className="text-sm font-medium">
                          {option.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {option.value.toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <div className="min-w-16 border-r border-table-border">
        {isEditing ? (
          <Input
            aria-label={`Filter value for ${filter.column}`}
            className="h-6 min-h-0 rounded-none border-0 bg-transparent px-2 py-0 text-xs leading-none text-foreground font-sans font-normal shadow-none focus-visible:ring-0"
            disabled={!isFilterOperator(filter.operator)}
            onChange={handleValueChange}
            onKeyDown={handleValueKeyDown}
            placeholder="Empty"
            ref={valueInputRef}
            value={filterValue}
          />
        ) : (
          <button
            type="button"
            className="flex h-6 min-h-0 w-full min-w-0 appearance-none items-center rounded-none border-0 bg-transparent px-2 py-0 text-left text-xs leading-none text-foreground font-sans shadow-none transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setIsEditing(true);
              focusValueInput();
            }}
          >
            <span className="truncate">{displayValue}</span>
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label={isEditing ? "Apply filter" : "Remove filter"}
        className={cn(
          "flex h-6 min-h-0 w-7 appearance-none items-center justify-center rounded-none border-0 bg-transparent px-1 py-0 leading-none font-sans shadow-none transition-colors",
          isEditing
            ? "text-foreground hover:bg-accent"
            : "text-foreground hover:bg-destructive/10 hover:text-destructive",
        )}
        disabled={isEditing && !isFilterOperator(filter.operator)}
        onClick={() => {
          if (isEditing) {
            handleApply();
            return;
          }

          onRemove();
        }}
      >
        {isEditing ? (
          <Check className="size-3.5" />
        ) : (
          <X className="size-3.5" />
        )}
      </button>
    </div>
  );

  return wrapFilterPillTooltip({
    aiSourceQuery: filter.aiSource?.query,
    issueMessage: savedSyntaxIssue?.message,
    pillContent,
  });
}

function InlineTableSqlFilterPill(props: {
  applyEditingFilter: (filter?: EditingFilterGroup) => void;
  filter: EditingSqlFilter;
  onRemove: () => void;
  onUpdate: (filter: EditingSqlFilter) => void;
  sqlFilterLint?: SqlFilterLintSupport | null;
  table: Table;
}) {
  const {
    applyEditingFilter,
    filter,
    onRemove,
    onUpdate,
    sqlFilterLint,
    table,
  } = props;
  const [isEditing, setIsEditing] = useState(filter.sql.trim().length === 0);
  const [isDraftFilter, setIsDraftFilter] = useState(
    filter.sql.trim().length === 0,
  );
  const pillRef = useRef<HTMLDivElement | null>(null);
  const lintRequestStateRef = useRef<{
    abortController: AbortController | null;
    requestId: number;
  }>({
    abortController: null,
    requestId: 0,
  });
  const latestFilterRef = useRef(filter);
  const valueInputRef = useRef<HTMLInputElement | null>(null);
  const syntaxIssue = getEditingFilterSyntaxIssue(filter, table.columns);
  const savedSyntaxIssue = !isEditing
    ? getEditingFilterIssue(filter, table.columns)
    : null;
  const displayValue = filter.sql.trim().length > 0 ? filter.sql : "Empty";
  const sqlLintRequestKey = useMemo(() => {
    if (!sqlFilterLint || syntaxIssue) {
      return null;
    }

    return [
      sqlFilterLint.schemaVersion ?? "",
      buildSqlFilterLintStatement({
        dialect: sqlFilterLint.dialect,
        table,
        whereClause: filter.sql,
      }),
    ].join("::");
  }, [filter.sql, sqlFilterLint, syntaxIssue, table]);

  function focusSqlInput() {
    requestAnimationFrame(() => {
      valueInputRef.current?.focus();
      valueInputRef.current?.select();
    });
  }

  const handleApply = useCallback(() => {
    applyEditingFilter();
    setIsDraftFilter(false);
    setIsEditing(false);
  }, [applyEditingFilter]);

  const handleDismiss = useCallback(() => {
    if (isDraftFilter) {
      onRemove();
      return;
    }

    applyEditingFilter();
    setIsEditing(false);
  }, [applyEditingFilter, isDraftFilter, onRemove]);

  useEffect(() => {
    latestFilterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    focusSqlInput();
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (pillRef.current?.contains(target)) {
        return;
      }

      handleDismiss();
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      handleDismiss();
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [handleDismiss, isEditing]);

  useEffect(() => {
    if (!sqlFilterLint || isEditing || syntaxIssue || !sqlLintRequestKey) {
      lintRequestStateRef.current.abortController?.abort();
      lintRequestStateRef.current.abortController = null;
      return;
    }

    if (
      filter.lint?.requestKey === sqlLintRequestKey &&
      (filter.lint.status === "invalid" ||
        filter.lint.status === "pending" ||
        filter.lint.status === "valid")
    ) {
      return;
    }

    lintRequestStateRef.current.abortController?.abort();
    const abortController = new AbortController();
    const requestId = lintRequestStateRef.current.requestId + 1;
    lintRequestStateRef.current.abortController = abortController;
    lintRequestStateRef.current.requestId = requestId;

    onUpdate(
      withSqlFilterLintState(filter, {
        issue: null,
        requestKey: sqlLintRequestKey,
        status: "pending",
      }),
    );

    const lintStatement = buildSqlFilterLintStatement({
      dialect: sqlFilterLint.dialect,
      table,
      whereClause: filter.sql,
    });

    void sqlFilterLint
      .lintSql(
        {
          schemaVersion: sqlFilterLint.schemaVersion,
          sql: lintStatement,
        },
        {
          abortSignal: abortController.signal,
        },
      )
      .then((result) => {
        if (
          abortController.signal.aborted ||
          lintRequestStateRef.current.requestId !== requestId
        ) {
          return;
        }

        if (lintRequestStateRef.current.abortController === abortController) {
          lintRequestStateRef.current.abortController = null;
        }

        const message = getSqlFilterLintFailureMessage({
          lintedSql: lintStatement,
          result,
          whereClause: filter.sql,
        });
        const nextFilter = withSqlFilterLintState(latestFilterRef.current, {
          issue: message
            ? {
                code: "sql-lint-error",
                message,
              }
            : null,
          requestKey: sqlLintRequestKey,
          status: message ? "invalid" : "valid",
        });
        onUpdate(nextFilter);
      });
  }, [
    applyEditingFilter,
    filter,
    isEditing,
    onUpdate,
    sqlFilterLint,
    sqlLintRequestKey,
    syntaxIssue,
    table,
  ]);

  useEffect(() => {
    const lintRequestState = lintRequestStateRef.current;

    return () => {
      const abortController = lintRequestState.abortController;

      abortController?.abort();

      if (lintRequestState.abortController === abortController) {
        lintRequestState.abortController = null;
      }
    };
  }, []);

  const pillContent = (
    <div
      ref={pillRef}
      aria-invalid={savedSyntaxIssue ? true : undefined}
      className={cn(
        "inline-flex max-w-full items-stretch overflow-hidden rounded-full border bg-background text-xs leading-none text-foreground font-sans shadow-sm",
        savedSyntaxIssue
          ? "border-amber-400 ring-1 ring-amber-300/80"
          : "border-table-border",
      )}
      data-filter-ai-query={filter.aiSource?.query}
      data-filter-origin={filter.aiSource ? "ai" : "manual"}
      data-filter-syntax-state={savedSyntaxIssue ? "invalid" : "valid"}
      data-filter-syntax-message={savedSyntaxIssue?.message}
    >
      <div className="flex h-6 min-h-0 items-center gap-1.5 border-r border-table-border px-2 py-0">
        <Code2
          className={cn(
            "size-3.5 shrink-0",
            savedSyntaxIssue ? "text-amber-500" : "text-primary",
          )}
        />
        <span className="font-semibold leading-none">SQL</span>
      </div>
      <div className="min-w-28 border-r border-table-border">
        {isEditing ? (
          <Input
            aria-label="SQL WHERE clause"
            className="h-6 min-h-0 rounded-none border-0 bg-transparent px-2 py-0 text-xs leading-none text-foreground font-sans font-normal shadow-none focus-visible:ring-0"
            onChange={(event) => {
              onUpdate(
                clearSqlFilterLintState({
                  ...filter,
                  sql: event.currentTarget.value,
                }),
              );
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return;
              }

              event.preventDefault();
              handleApply();
            }}
            placeholder="WHERE clause"
            ref={valueInputRef}
            value={filter.sql}
          />
        ) : (
          <button
            type="button"
            className="flex h-6 min-h-0 w-full min-w-0 appearance-none items-center rounded-none border-0 bg-transparent px-2 py-0 text-left text-xs leading-none text-foreground font-sans shadow-none transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setIsEditing(true);
              focusSqlInput();
            }}
          >
            <span className="truncate">{displayValue}</span>
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label={isEditing ? "Apply SQL filter" : "Remove SQL filter"}
        className={cn(
          "flex h-6 min-h-0 w-7 appearance-none items-center justify-center rounded-none border-0 bg-transparent px-1 py-0 leading-none font-sans shadow-none transition-colors",
          isEditing
            ? "text-foreground hover:bg-accent"
            : "text-foreground hover:bg-destructive/10 hover:text-destructive",
        )}
        onClick={() => {
          if (isEditing) {
            handleApply();
            return;
          }

          onRemove();
        }}
      >
        {isEditing ? (
          <Check className="size-3.5" />
        ) : (
          <X className="size-3.5" />
        )}
      </button>
    </div>
  );

  return wrapFilterPillTooltip({
    aiSourceQuery: filter.aiSource?.query,
    issueMessage: savedSyntaxIssue?.message,
    pillContent,
  });
}

function clearSqlFilterLintState(filter: EditingSqlFilter): EditingSqlFilter {
  const { lint: _lint, ...filterWithoutLint } = filter;

  return filterWithoutLint;
}

function withSqlFilterLintState(
  filter: EditingSqlFilter,
  lint: NonNullable<EditingSqlFilter["lint"]>,
): EditingSqlFilter {
  return {
    ...clearSqlFilterLintState(filter),
    lint,
  };
}

function InlineTableFilterGroupPill(props: {
  filterGroup: EditingFilterGroup;
  onRemove: () => void;
}) {
  const { filterGroup, onRemove } = props;
  const filterCount = countFiltersRecursive(filterGroup);

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-table-border bg-background/95 px-2 py-1 text-xs text-foreground shadow-sm">
      <FilterIcon className="size-3.5 text-muted-foreground" />
      <span className="font-medium">Grouped filter</span>
      <span className="text-muted-foreground">
        {filterCount} condition{filterCount === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        aria-label="Remove grouped filter"
        className="text-muted-foreground transition-colors hover:text-destructive"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
