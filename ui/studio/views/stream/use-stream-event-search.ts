import { useExpandableSearchControl } from "../../../hooks/use-expandable-search-control";
import type { StudioStreamSearchConfig } from "../../../hooks/use-stream-details";
import type { StudioStreamEvent } from "../../../hooks/use-stream-events";
import { validateStreamSearchQuery } from "./stream-search-query";
import { getStreamSearchSuggestions } from "./stream-search-suggestions";

interface UseStreamEventSearchArgs {
  searchConfig: StudioStreamSearchConfig | null | undefined;
  suggestionEvents: StudioStreamEvent[];
  scopeKey: string;
  searchTerm: string;
  setSearchParam: (value: string) => Promise<URLSearchParams>;
  supportsSearch: boolean;
}

function shouldDeferAutoApply(args: {
  input: string;
  searchConfig: StudioStreamSearchConfig | null | undefined;
  suggestionEvents: StudioStreamEvent[];
}): boolean {
  const trimmedInput = args.input.trim();

  if (
    trimmedInput.length === 0 ||
    /\s/.test(trimmedInput) ||
    trimmedInput.includes(":") ||
    trimmedInput.includes("(") ||
    trimmedInput.includes(")") ||
    trimmedInput.startsWith("-")
  ) {
    return false;
  }

  const suggestions = getStreamSearchSuggestions({
    events: args.suggestionEvents,
    input: trimmedInput,
    searchConfig: args.searchConfig,
  });

  return suggestions.some((suggestion) => {
    if (suggestion.group !== "Fields" || !suggestion.label.endsWith(":")) {
      return false;
    }

    const suggestedFieldName = suggestion.label.slice(0, -1);

    return (
      suggestedFieldName.length > trimmedInput.length &&
      suggestedFieldName.toLowerCase().startsWith(trimmedInput.toLowerCase())
    );
  });
}

export function useStreamEventSearch(args: UseStreamEventSearchArgs) {
  const {
    scopeKey,
    searchConfig,
    searchTerm,
    setSearchParam,
    suggestionEvents,
    supportsSearch,
  } = args;

  return useExpandableSearchControl({
    applySearchValue: (value) => {
      void setSearchParam(value);
    },
    freezeSuggestionsWhileOpen: true,
    getSearchSuggestions: (value) =>
      getStreamSearchSuggestions({
        events: suggestionEvents,
        input: value,
        searchConfig,
      }),
    scopeKey,
    searchTerm,
    supportsSearch,
    uiStateKeyPrefix: "stream-event-search",
    validateSearchValue: (value) => {
      const validationState = validateStreamSearchQuery(value, searchConfig);

      return {
        ...validationState,
        shouldApply:
          validationState.isValid &&
          !shouldDeferAutoApply({
            input: value,
            searchConfig,
            suggestionEvents,
          }),
      };
    },
  });
}
