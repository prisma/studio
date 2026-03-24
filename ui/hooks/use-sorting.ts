import { useCallback, useMemo } from "react";

import type { SortOrderItem, Table } from "../../data/adapter";
import { useLatestAsyncParam } from "./use-latest-async-param";
import { useNavigation } from "./use-navigation";

export function useSorting() {
  const {
    metadata: { activeTable },
    pageIndexParam,
    setPageIndexParam,
    sortParam,
    setSortParam,
  } = useNavigation();
  const {
    value: effectiveSortParam,
    writeLatestValue: writeLatestSortParam,
  } = useLatestAsyncParam({
    value: sortParam,
    write: setSortParam,
  });

  // Parse sorting from URL parameter
  const parseSorting = (sortParam: string | null): SortOrderItem[] => {
    if (!sortParam) return [];

    try {
      // Format: column:direction,column:direction
      return sortParam
        .split(",")
        .map((item) => {
          const [column, direction] = item.split(":");
          if (!column || !direction || !["asc", "desc"].includes(direction)) {
            return null;
          }
          return { column, direction: direction as "asc" | "desc" };
        })
        .filter(Boolean) as SortOrderItem[];
    } catch (e) {
      console.error("Failed to parse sorting parameter:", e);
      return [];
    }
  };

  const sortingState = useMemo(() => {
    const parsedSorting = parseSorting(effectiveSortParam);

    if (parsedSorting.length > 0) {
      return parsedSorting;
    }

    return getPrimaryKeyDefaultSorting(activeTable);
  }, [activeTable, effectiveSortParam]);

  // Update URL when sorting changes from the UI
  const handleSortingChange = useCallback(
    (
      newState: SortOrderItem[] | ((old: SortOrderItem[]) => SortOrderItem[]),
    ) => {
      const resolvedState =
        typeof newState === "function" ? newState(sortingState) : newState;

      // Serialize sorting state to URL parameter
      const sortString =
        resolvedState.length > 0
          ? resolvedState
              .map((item) => `${item.column}:${item.direction}`)
              .join(",")
          : null;

      void (async () => {
        await writeLatestSortParam(sortString);

        if (pageIndexParam !== "0") {
          await setPageIndexParam("0");
        }
      })();
    },
    [pageIndexParam, setPageIndexParam, sortingState, writeLatestSortParam],
  );

  return {
    sortingState,
    setSortingState: handleSortingChange,
  };
}

function getPrimaryKeyDefaultSorting(
  activeTable: Table | undefined,
): SortOrderItem[] {
  if (!activeTable) {
    return [];
  }

  return Object.values(activeTable.columns)
    .filter((column) => column.pkPosition != null)
    .sort((a, b) => {
      const aPkPosition = a.pkPosition ?? Number.POSITIVE_INFINITY;
      const bPkPosition = b.pkPosition ?? Number.POSITIVE_INFINITY;

      return aPkPosition - bPkPosition;
    })
    .map((column) => ({
      column: column.name,
      direction: "asc" as const,
    }));
}
