import type {
  AdapterQueryResult,
  FilterGroup,
  SortOrderItem,
  Table,
} from "../../data/adapter";
import { useActiveTableRowsCollection } from "./use-active-table-rows-collection";
import { useNavigation } from "./use-navigation";

export interface UseActiveTableQueryProps {
  pageIndex: number;
  pageSize: number;
  sortOrder: SortOrderItem[];
  filter: FilterGroup;
  searchTerm?: string;
  searchScope?: "table" | "row";
}

export interface ActiveTableQueryData {
  filteredRowCount: AdapterQueryResult["filteredRowCount"];
  rows: AdapterQueryResult["rows"];
}

export interface UseActiveTableQueryResult {
  data: ActiveTableQueryData | undefined;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

export function useActiveTableQuery(
  props: UseActiveTableQueryProps,
): UseActiveTableQueryResult {
  const { filter, pageIndex, pageSize, sortOrder } = props;
  const {
    metadata: { activeTable },
  } = useNavigation();
  const fullTableSearchTerm = resolveFullTableSearchTerm({
    activeTable,
    searchScope: props.searchScope ?? "table",
    searchTerm: props.searchTerm ?? "",
  });
  const state = useActiveTableRowsCollection({
    filter,
    fullTableSearchTerm,
    pageIndex,
    pageSize,
    sortOrder,
  });

  return {
    data: state.activeTable
      ? {
          filteredRowCount: state.filteredRowCount,
          rows: state.rows,
        }
      : undefined,
    isFetching: state.isFetching,
    refetch: state.refetch,
  };
}

interface ResolveFullTableSearchTermArgs {
  activeTable: Table | undefined;
  searchScope: "table" | "row";
  searchTerm: string;
}

export function resolveFullTableSearchTerm(
  args: ResolveFullTableSearchTermArgs,
): string | undefined {
  const { activeTable, searchScope } = args;
  const searchTerm = args.searchTerm.trim();

  if (searchScope !== "row" || searchTerm.length === 0 || activeTable == null) {
    return undefined;
  }

  return searchTerm;
}
