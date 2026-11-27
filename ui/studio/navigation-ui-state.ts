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

/**
 * A data service Studio can be connected to. The sidebar shows one at a time,
 * and the `view` URL param decides which.
 */
export type StudioService = "database" | "streams" | "temporal";

/** The last URL hash each service was open at, including the leading `#`. */
export type StudioServiceLocations = Partial<Record<StudioService, string>>;

export const SERVICE_LOCATIONS_UI_STATE_KEY = "navigation:service-locations";

export function getStudioServiceForView(
  view: string | null | undefined,
): StudioService {
  if (view === "stream") {
    return "streams";
  }

  if (view === "temporal") {
    return "temporal";
  }

  return "database";
}

/**
 * Records `rawHash` as the last location of the open service.
 * The hash and the resolved view update in separate renders, so a hash is
 * only recorded once it names the same service as the resolved view.
 * Returns `locations` itself when nothing changes.
 */
export function recordStudioServiceLocation(
  locations: StudioServiceLocations,
  args: {
    activeService: StudioService;
    hashService: StudioService;
    rawHash: string;
  },
): StudioServiceLocations {
  const { activeService, hashService, rawHash } = args;
  const location = `#${rawHash}`;

  if (hashService !== activeService || locations[activeService] === location) {
    return locations;
  }

  return { ...locations, [activeService]: location };
}
