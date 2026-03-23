import { eq, useLiveQuery } from "@tanstack/react-db";

import { useStudio } from "../studio/context";

interface UseNavigationTableListArgs {
  schema: string | null | undefined;
  searchTerm: string;
}

export interface NavigationTableListItem {
  id: string;
  schema: string;
  table: string;
  qualifiedName: string;
}

export function useNavigationTableList(args: UseNavigationTableListArgs) {
  const { navigationTableNamesCollection } = useStudio();
  const schema = args.schema;
  const searchTerm = args.searchTerm.trim();
  const normalizedSearchTerm = searchTerm.toLowerCase();

  const { data: tables = [] } = useLiveQuery(
    (q) => {
      if (!schema) {
        return undefined;
      }

      const baseQuery = q
        .from({ table: navigationTableNamesCollection })
        .where(({ table }) => eq(table.schema, schema));

      const filteredQuery =
        normalizedSearchTerm.length === 0
          ? baseQuery
          : baseQuery.fn.where(({ table }) =>
              table.table.toLowerCase().includes(normalizedSearchTerm),
            );

      return filteredQuery
        .orderBy(({ table }) => table.table)
        .fn.select((row) => row.table);
    },
    [navigationTableNamesCollection, schema, normalizedSearchTerm],
  );

  return {
    tables,
    isSearchActive: searchTerm.length > 0,
  };
}
