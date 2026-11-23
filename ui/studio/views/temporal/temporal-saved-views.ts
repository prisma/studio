import { useCallback } from "react";

import { useUiState } from "@/ui/hooks/use-ui-state";

export interface TemporalSavedView {
  id: string;
  name: string;
  /** What the Workflows search field holds: a List Filter or plain text. */
  query: string;
  /** The `sort` URL value, for example `StartTime:desc`. */
  sort?: string;
}

export const TEMPORAL_SAVED_VIEWS_UI_STATE_KEY = "temporal:saved-views";

/** The most views one browser keeps, as in the official Temporal UI. */
export const MAX_TEMPORAL_SAVED_VIEWS = 20;

/** Views every server can answer. The user's own views follow them in the sidebar. */
export const TEMPORAL_BUILT_IN_VIEWS: TemporalSavedView[] = [
  {
    id: "built-in:running",
    name: "Running",
    query: 'ExecutionStatus = "Running"',
  },
  {
    id: "built-in:failed",
    name: "Failed",
    query: 'ExecutionStatus = "Failed"',
  },
  {
    id: "built-in:timed-out",
    name: "Timed Out",
    query: 'ExecutionStatus = "TimedOut"',
  },
];

const NO_VIEWS: TemporalSavedView[] = [];

/**
 * The Workflows searches the user saved. They live in this browser, and a view
 * is shared by copying its link: the URL holds the whole search.
 */
export function useTemporalSavedViews() {
  const [views, setViews] = useUiState<TemporalSavedView[]>(
    TEMPORAL_SAVED_VIEWS_UI_STATE_KEY,
    NO_VIEWS,
    { persistent: true },
  );
  const saveView = useCallback(
    (view: Omit<TemporalSavedView, "id">) => {
      setViews((previous) => [
        // A view saved again under the same name replaces the earlier one.
        ...previous.filter((item) => item.name !== view.name),
        { ...view, id: `view:${Date.now().toString(36)}` },
      ]);
    },
    [setViews],
  );
  const removeView = useCallback(
    (id: string) => {
      setViews((previous) => previous.filter((item) => item.id !== id));
    },
    [setViews],
  );

  return { removeView, saveView, views };
}

export const TEMPORAL_RECENT_FILTERS_UI_STATE_KEY = "temporal:recent-filters";

/** The Workflows grid remembers this many filters. */
export const MAX_TEMPORAL_RECENT_FILTERS = 10;

const NO_FILTERS: string[] = [];

/** Puts a filter first in the list of recent filters, without a second copy of it. */
export function addRecentFilter(recent: string[], filter: string): string[] {
  return recent[0] === filter
    ? recent
    : [filter, ...recent.filter((item) => item !== filter)].slice(
        0,
        MAX_TEMPORAL_RECENT_FILTERS,
      );
}

/**
 * The filters and searches the user ran in the Workflows grid that are not one
 * of the status presets, newest first. They live in this browser.
 */
export function useTemporalRecentFilters() {
  const [recentFilters, setRecentFilters] = useUiState<string[]>(
    TEMPORAL_RECENT_FILTERS_UI_STATE_KEY,
    NO_FILTERS,
    { persistent: true },
  );
  const rememberFilter = useCallback(
    (filter: string) => {
      setRecentFilters((previous) => addRecentFilter(previous, filter));
    },
    [setRecentFilters],
  );
  const clearRecentFilters = useCallback(() => {
    setRecentFilters(NO_FILTERS);
  }, [setRecentFilters]);

  return { clearRecentFilters, recentFilters, rememberFilter };
}
