import { useExpandableSearchControl } from "../../../hooks/use-expandable-search-control";

interface UseActiveTableRowSearchArgs {
  scopeKey: string;
  searchTerm: string;
  setPageIndexParam: (value: string) => Promise<URLSearchParams>;
  setSearchParam: (value: string) => Promise<URLSearchParams>;
  supportsFullTableSearch: boolean;
}

export function useActiveTableRowSearch(args: UseActiveTableRowSearchArgs) {
  const {
    scopeKey,
    searchTerm,
    setPageIndexParam,
    setSearchParam,
    supportsFullTableSearch,
  } = args;
  const normalizedSearchTerm = searchTerm.trim();

  return useExpandableSearchControl({
    applySearchValue: (value) => {
      const normalizedValue = value.trim();

      if (normalizedValue === normalizedSearchTerm) {
        return;
      }

      void setSearchParam(normalizedValue);
      void setPageIndexParam("0");
    },
    scopeKey,
    searchTerm,
    supportsSearch: supportsFullTableSearch,
    uiStateKeyPrefix: "table-row-search",
  });
}
