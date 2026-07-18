export const INFINITE_SCROLL_BATCH_SIZE = 25;

export interface VisibleTableWindow<TData, TQueryProps> {
  data: TData | undefined;
  queryProps: TQueryProps;
}

/**
 * Resolves which table window is actually visible: the active query scope, or
 * the previously settled infinite-scroll window that stays on screen while a
 * grown window is still fetching.
 *
 * The returned `data` and `queryProps` always belong to the same query scope.
 * Row mutations must use the returned `queryProps`, so that saving or deleting
 * during an infinite-scroll window transition still targets the collection
 * that contains the rows the user is looking at, instead of the grown
 * collection that has not finished loading yet.
 */
export function resolveVisibleTableWindow<
  TData extends { rows: unknown[] },
  TQueryProps,
>(args: {
  activeData: TData | undefined;
  activeQueryProps: TQueryProps;
  isFetching: boolean;
  isInfiniteScrollEnabled: boolean;
  resetKey: string;
  stableWindow: {
    data: TData;
    key: string;
    queryProps: TQueryProps;
  } | null;
}): VisibleTableWindow<TData, TQueryProps> {
  const {
    activeData,
    activeQueryProps,
    isFetching,
    isInfiniteScrollEnabled,
    resetKey,
    stableWindow,
  } = args;
  const activeWindow = {
    data: activeData,
    queryProps: activeQueryProps,
  };

  if (!isInfiniteScrollEnabled) {
    return activeWindow;
  }

  if (
    isFetching &&
    (activeData == null || activeData.rows.length === 0) &&
    stableWindow?.key === resetKey
  ) {
    return {
      data: stableWindow.data,
      queryProps: stableWindow.queryProps,
    };
  }

  return activeWindow;
}

export function getNextInfinitePageRowTarget(args: {
  hasMoreInfiniteRows: boolean;
  isInfiniteScrollEnabled: boolean;
  loadedInfinitePageCount: number;
  loadedRowCount: number;
  pendingRowTarget: number | null;
}): number | null {
  const {
    hasMoreInfiniteRows,
    isInfiniteScrollEnabled,
    loadedInfinitePageCount,
    loadedRowCount,
    pendingRowTarget,
  } = args;

  if (!isInfiniteScrollEnabled || !hasMoreInfiniteRows) {
    return null;
  }

  if (pendingRowTarget != null && loadedRowCount < pendingRowTarget) {
    return null;
  }

  return INFINITE_SCROLL_BATCH_SIZE * (loadedInfinitePageCount + 1);
}
