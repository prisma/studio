export interface TableSearchUiState {
  isOpen: boolean;
  term: string;
}

export interface TableGridFocusRequestUiState {
  requestId: number;
  tableId: string | null;
}

export const TABLE_SEARCH_UI_STATE_KEY = "navigation:table-search";
export const TABLE_GRID_FOCUS_REQUEST_UI_STATE_KEY =
  "navigation:table-grid-focus-request";
