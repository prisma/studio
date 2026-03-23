import {
  ChevronLeft,
  ChevronRight,
  FilterIcon,
  Plus,
  RefreshCw,
  Search,
  Save,
  Undo2,
} from "lucide-react";

import type { CommandPaletteContextAction } from "../../CommandPalette";

const SEARCH_ROWS_LABEL = "Search rows";
const FILTER_WITH_AI_LABEL = "Filter with AI";
const COMMAND_LOOKUP_LABELS = [SEARCH_ROWS_LABEL, FILTER_WITH_AI_LABEL];

interface CreateActiveTableCommandPaletteActionsArgs {
  canGoToNextPage: boolean;
  canGoToPreviousPage: boolean;
  hasAiFilter: boolean;
  hasStagedChanges: boolean;
  isInsertingDisabled: boolean;
  onDiscardStagedChanges: () => void;
  onFocusFilterWithAi: () => void;
  onFocusSearch: () => void;
  onGoToNextPage: () => void;
  onGoToPreviousPage: () => void;
  onInsertRow: () => void;
  onRefresh: () => void | Promise<void>;
  onRunFilterWithAi: (query: string) => void | Promise<void>;
  onRunSearch: (query: string) => void | Promise<void>;
  onSaveStagedChanges: () => void;
  saveStagedChangesLabel: string;
}

function resolveCommandQueryMode(args: { label: string; query: string }) {
  const { label, query } = args;
  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    return {
      kind: "focus" as const,
      payload: "",
    };
  }

  const normalizedLabel = label.toLowerCase();
  const normalizedQuery = trimmedQuery.toLowerCase();

  if (
    COMMAND_LOOKUP_LABELS.some((commandLabel) =>
      commandLabel.toLowerCase().startsWith(normalizedQuery),
    )
  ) {
    return {
      kind: "focus" as const,
      payload: "",
    };
  }

  if (normalizedQuery.startsWith(`${normalizedLabel} `)) {
    const payload = trimmedQuery.slice(label.length).trim();

    return {
      kind: payload.length > 0 ? ("execute" as const) : ("focus" as const),
      payload,
    };
  }

  return {
    kind: "execute" as const,
    payload: trimmedQuery,
  };
}

export function createActiveTableCommandPaletteActions(
  args: CreateActiveTableCommandPaletteActionsArgs,
): CommandPaletteContextAction[] {
  const {
    canGoToNextPage,
    canGoToPreviousPage,
    hasAiFilter,
    hasStagedChanges,
    isInsertingDisabled,
    onDiscardStagedChanges,
    onFocusFilterWithAi,
    onFocusSearch,
    onGoToNextPage,
    onGoToPreviousPage,
    onInsertRow,
    onRefresh,
    onRunFilterWithAi,
    onRunSearch,
    onSaveStagedChanges,
    saveStagedChangesLabel,
  } = args;

  const stagedEditActions: CommandPaletteContextAction[] = hasStagedChanges
    ? [
        {
          id: "table.save-staged-changes",
          icon: Save,
          keywords: ["save", "rows", "staged", "commit", "write to db"],
          label: saveStagedChangesLabel,
          onSelect: () => onSaveStagedChanges(),
        },
        {
          id: "table.discard-staged-changes",
          icon: Undo2,
          keywords: ["discard", "edits", "staged", "cancel"],
          label: "Discard edits",
          onSelect: () => onDiscardStagedChanges(),
        },
      ]
    : [];

  return [
    {
      disabled: hasStagedChanges,
      id: "table.search.focus",
      icon: Search,
      keywords: ["search", "rows"],
      label: SEARCH_ROWS_LABEL,
      onSelect: () => onFocusSearch(),
      shouldShow: (query) =>
        resolveCommandQueryMode({
          label: SEARCH_ROWS_LABEL,
          query,
        }).kind === "focus",
    },
    {
      disabled: hasStagedChanges,
      id: "table.search.execute",
      icon: Search,
      keywords: ["search", "rows"],
      label: (query) =>
        `Search rows: ${resolveCommandQueryMode({ label: SEARCH_ROWS_LABEL, query }).payload}`,
      onSelect: (query) =>
        onRunSearch(
          resolveCommandQueryMode({ label: SEARCH_ROWS_LABEL, query }).payload,
        ),
      shouldShow: (query) =>
        resolveCommandQueryMode({
          label: SEARCH_ROWS_LABEL,
          query,
        }).kind === "execute",
    },
    {
      disabled: hasStagedChanges,
      id: "table.filter-with-ai.focus",
      icon: FilterIcon,
      keywords: ["filter", "ai", "llm", "natural language"],
      label: FILTER_WITH_AI_LABEL,
      onSelect: () => onFocusFilterWithAi(),
      shouldShow: (query) =>
        hasAiFilter &&
        resolveCommandQueryMode({
          label: FILTER_WITH_AI_LABEL,
          query,
        }).kind === "focus",
    },
    {
      disabled: hasStagedChanges,
      id: "table.filter-with-ai.execute",
      icon: FilterIcon,
      keywords: ["filter", "ai", "llm", "natural language"],
      label: (query) =>
        `Filter with AI: ${resolveCommandQueryMode({ label: FILTER_WITH_AI_LABEL, query }).payload}`,
      onSelect: (query) =>
        onRunFilterWithAi(
          resolveCommandQueryMode({ label: FILTER_WITH_AI_LABEL, query })
            .payload,
        ),
      shouldShow: (query) =>
        hasAiFilter &&
        resolveCommandQueryMode({
          label: FILTER_WITH_AI_LABEL,
          query,
        }).kind === "execute",
    },
    ...stagedEditActions,
    {
      disabled: isInsertingDisabled,
      id: "table.insert-row",
      icon: Plus,
      keywords: ["insert", "new row", "create row"],
      label: "Insert row",
      onSelect: () => onInsertRow(),
    },
    {
      id: "table.refresh",
      icon: RefreshCw,
      keywords: ["refresh", "reload"],
      label: "Refresh table",
      onSelect: () => onRefresh(),
    },
    {
      disabled: hasStagedChanges || !canGoToNextPage,
      id: "table.next-page",
      icon: ChevronRight,
      keywords: ["next", "page", "pagination"],
      label: "Next page",
      onSelect: () => onGoToNextPage(),
    },
    {
      disabled: hasStagedChanges || !canGoToPreviousPage,
      id: "table.previous-page",
      icon: ChevronLeft,
      keywords: ["previous", "page", "pagination", "back"],
      label: "Previous page",
      onSelect: () => onGoToPreviousPage(),
    },
  ];
}
