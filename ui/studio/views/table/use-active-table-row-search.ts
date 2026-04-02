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
  return useExpandableSearchControl({
    applySearchValue: (value) => {
      void setSearchParam(value);
      void setPageIndexParam("0");
    },
    scopeKey,
    searchTerm,
    supportsSearch: supportsFullTableSearch,
    uiStateKeyPrefix: "table-row-search",
  });
}
