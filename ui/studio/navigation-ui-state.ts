export interface NavigationSearchUiState {
  isOpen: boolean;
  term: string;
}

export type TableSearchUiState = NavigationSearchUiState;
export type StreamSearchUiState = NavigationSearchUiState;

export interface TableGridFocusRequestUiState {
  requestId: number;
  tableId: string | null;
}

export const TABLE_SEARCH_UI_STATE_KEY = "navigation:table-search";
export const STREAM_SEARCH_UI_STATE_KEY = "navigation:stream-search";
export const TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY =
  "navigation:table-grid-focus-request";
