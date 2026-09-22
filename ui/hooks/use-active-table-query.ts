import type {
  AdapterQueryResult,
  FilterGroup,
  SortOrderItem,
  Table,
} from "../../data/adapter";
import {
  type ActiveTableRowsCollectionState,
  useActiveTableRowsCollection,
} from "./use-active-table-rows-collection";
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
  /**
   * Identity of the query scope the rows were loaded from. Consumers that
   * need to reset per-scope state (for example the table reload error) can
   * use it as a reset key.
   */
  queryScopeKey: string;
  refetch: () => Promise<void>;
}

/**
 * Resolves the rows-collection state for the exact query scope described by
 * `props`. Row mutation hooks must resolve their collection through this hook
 * with the same query props the view uses for display, so mutations target the
 * collection that actually contains the visible rows (for example the grown
 * `pageIndex: 0` window used by infinite scroll).
 */
export function useActiveTableQueryCollection(
  props: UseActiveTableQueryProps,
): ActiveTableRowsCollectionState {
  const { filter, pageIndex, pageSize, sortOrder } = props;
  const {
    metadata: { activeTable },
  } = useNavigation();
  const fullTableSearchTerm = resolveFullTableSearchTerm({
    activeTable,
    searchScope: props.searchScope ?? "table",
    searchTerm: props.searchTerm ?? "",
  });

  return useActiveTableRowsCollection({
    filter,
    fullTableSearchTerm,
    pageIndex,
    pageSize,
    sortOrder,
  });
}

export function useActiveTableQuery(
  props: UseActiveTableQueryProps,
): UseActiveTableQueryResult {
  const state = useActiveTableQueryCollection(props);

  return {
    data: state.activeTable
      ? {
          filteredRowCount: state.filteredRowCount,
          rows: state.rows,
        }
      : undefined,
    isFetching: state.isFetching,
    queryScopeKey: state.queryScopeKey,
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
