import { ChartColumn, ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/ui/components/ui/popover";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/components/ui/tooltip";
import { cn } from "@/ui/lib/utils";

import { useNavigation } from "../../../hooks/use-navigation";
import {
  STREAM_AGGREGATION_QUICK_RANGES,
  type StreamAggregationRangeSelection,
  type StreamAggregationRelativeDuration,
  useStreamAggregations,
} from "../../../hooks/use-stream-aggregations";
import {
  type StudioStreamDetails,
  type StudioStreamSearchConfig,
  useStreamDetails,
} from "../../../hooks/use-stream-details";
import {
  STREAM_EVENTS_PAGE_SIZE,
  type StudioStreamEvent,
  type StudioStreamEventIndexedField,
  useStreamEvents,
} from "../../../hooks/use-stream-events";
import { useUiState } from "../../../hooks/use-ui-state";
import { ExpandableSearchControl } from "../../input/ExpandableSearchControl";
import { StudioHeader } from "../../StudioHeader";
import { ViewProps } from "../View";
import {
  applyRoutingKeySearchSelection,
  resolveRoutingKeySearchField,
} from "./stream-routing-key-search";
import { HighlightedStreamEventJson } from "./stream-search-highlight";
import {
  mergeRememberedStreamSearchEvents,
  STREAM_SEARCH_SUGGESTION_EVENT_MEMORY_LIMIT,
} from "./stream-search-suggestions";
import { StreamAggregationsPanel } from "./StreamAggregationsPanel";
import { StreamDiagnosticsPopover } from "./StreamDiagnosticsPopover";
import { StreamRoutingKeySelector } from "./StreamRoutingKeySelector";
import { useStreamEventSearch } from "./use-stream-event-search";

const LOAD_MORE_THRESHOLD_PX = 160;
const NEW_EVENTS_BATCH_SIZE = 50n;
const NEW_EVENTS_HIGHLIGHT_DURATION_MS = 1_800;
const STREAM_FOLLOW_REFRESH_INTERVAL_MS = 100;
const STREAM_TAIL_PIN_THRESHOLD_PX = 16;
const DEFAULT_STREAM_AGGREGATION_RANGE_SELECTION = {
  duration: "1h",
  kind: "relative",
} as const satisfies StreamAggregationRangeSelection;
const STREAM_FOLLOW_MODE_DEFAULT = "tail" as const satisfies StreamFollowMode;
const STREAM_AGGREGATION_ABSOLUTE_RANGE_PREFIX = "absolute:";
const STREAM_AGGREGATION_ABSOLUTE_RANGE_SEPARATOR = "|";
const STREAM_AGGREGATION_RELATIVE_DURATIONS = new Set(
  STREAM_AGGREGATION_QUICK_RANGES.map((range) => range.duration),
);
type StreamFollowMode = "paused" | "live" | "tail";

const STREAM_FOLLOW_MODE_HELP_TEXT = {
  live: "Check for new events automatically.",
  paused: "Don't load new events.",
  tail: "Load and display new events in real time.",
} as const satisfies Record<StreamFollowMode, string>;

const STREAM_FOLLOW_MODE_OPTIONS = [
  {
    label: "Paused",
    value: "paused",
  },
  {
    label: "Live",
    value: "live",
  },
  {
    label: "Tail",
    value: "tail",
  },
] as const satisfies ReadonlyArray<{
  label: string;
  value: StreamFollowMode;
}>;

const STREAM_FOLLOW_MODE_ITEM_CLASS_NAME =
  "h-8 rounded-none border-0 px-2.5 shadow-none transition-colors data-[state=on]:bg-background data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:shadow-sm";
const PRISMA_WAL_STREAM_NAME = "prisma-wal";
const STATE_PROTOCOL_PROFILE = "state-protocol";
const PRISMA_WAL_HISTORY_CLAUSE_PATTERN =
  /^(?<field>table|type|key|rowKey):(?<value>"(?:\\.|[^"\\])*"|[^\s()]+)$/i;

interface ScrollAnchorSnapshot {
  anchorEventId: string | null;
  anchorTop: number;
  firstEventId: string | null;
  hasHiddenNewerEvents: boolean;
  scrollHeight: number;
  scrollTop: number;
  streamIdentity: string | null;
}

interface PendingScrollPositionRequest {
  position: "bottom" | "top";
  streamIdentity: string | null;
}

interface PrismaWalHistorySummary {
  rowKey: string | null;
  tableName: string;
}

function formatRelativeTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) {
    return "Unknown time";
  }

  const timestamp = Date.parse(isoTimestamp);

  if (Number.isNaN(timestamp)) {
    return "Unknown time";
  }

  const diffInSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [
    { limit: 60, unit: "second", value: diffInSeconds },
    { limit: 3600, unit: "minute", value: Math.round(diffInSeconds / 60) },
    { limit: 86_400, unit: "hour", value: Math.round(diffInSeconds / 3600) },
    { limit: 604_800, unit: "day", value: Math.round(diffInSeconds / 86_400) },
    {
      limit: 2_629_746,
      unit: "week",
      value: Math.round(diffInSeconds / 604_800),
    },
    {
      limit: 31_556_952,
      unit: "month",
      value: Math.round(diffInSeconds / 2_629_746),
    },
  ] as const;

  for (const candidate of units) {
    if (Math.abs(diffInSeconds) < candidate.limit) {
      return formatter.format(
        candidate.value,
        candidate.unit as Intl.RelativeTimeFormatUnit,
      );
    }
  }

  return formatter.format(Math.round(diffInSeconds / 31_556_952), "year");
}

function formatExactTimestamp(isoTimestamp: string | null): string {
  if (!isoTimestamp) {
    return "No event timestamp available";
  }

  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function formatBytes(sizeBytes: bigint | number): string {
  const numericValue =
    typeof sizeBytes === "bigint" ? Number(sizeBytes) : sizeBytes;

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = numericValue;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${Math.round(value)} ${units[unitIndex]}`;
  }

  const maximumFractionDigits = value < 10 ? 1 : 0;

  return `${value.toFixed(maximumFractionDigits)} ${units[unitIndex]}`;
}

function parseNonNegativeBigInt(value: string): bigint {
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

function normalizeRoutingKeySelection(value: string | null): string {
  return value?.trim() ?? "";
}

function formatNewEventsLabel(count: bigint): string {
  if (count > NEW_EVENTS_BATCH_SIZE) {
    return "50+ new events";
  }

  return `${count.toString()} new events`;
}

function formatCount(value: bigint): string {
  return value.toLocaleString("en-US");
}

function clampBigInt(value: bigint, min: bigint, max: bigint): bigint {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function getSearchScannedEventCount(args: {
  events: Pick<StudioStreamEvent, "sequence">[];
  hasMoreEvents: boolean;
  totalEventCount: bigint;
}): bigint {
  const totalEventCount =
    args.totalEventCount >= 0n ? args.totalEventCount : 0n;

  if (totalEventCount === 0n) {
    return 0n;
  }

  const oldestVisibleEvent = args.events.at(-1);

  if (!oldestVisibleEvent) {
    return args.hasMoreEvents ? 0n : totalEventCount;
  }

  if (!args.hasMoreEvents) {
    return totalEventCount;
  }

  const oldestVisibleSequence = parseNonNegativeBigInt(
    oldestVisibleEvent.sequence,
  );
  const scannedEventCount = totalEventCount - oldestVisibleSequence;

  return clampBigInt(scannedEventCount, 0n, totalEventCount);
}

function getSearchScanProgressWidth(scannedEventCount: bigint, total: bigint) {
  if (total <= 0n || scannedEventCount <= 0n) {
    return "0%";
  }

  const basisPoints = clampBigInt(
    (scannedEventCount * 10_000n) / total,
    0n,
    10_000n,
  );

  return `${(Number(basisPoints) / 100).toFixed(2)}%`;
}

function formatSearchSummary(args: {
  resultsLoadedCount: bigint;
  scannedEventCount: bigint;
  totalEventCount: bigint;
}) {
  return `${formatCount(args.resultsLoadedCount)} results, scanned ${formatCount(args.scannedEventCount)} of ${formatCount(args.totalEventCount)} events`;
}

function parseStreamFollowMode(
  value: string | null | undefined,
): StreamFollowMode | null {
  if (value === "paused" || value === "live" || value === "tail") {
    return value;
  }

  return null;
}

function parseAggregationPanelOpenState(
  value: string | null | undefined,
): boolean | null {
  if (value === "") {
    return true;
  }

  return null;
}

function serializeAggregationRangeSelection(
  selection: StreamAggregationRangeSelection,
): string {
  if (selection.kind === "relative") {
    return selection.duration;
  }

  return `${STREAM_AGGREGATION_ABSOLUTE_RANGE_PREFIX}${selection.fromIso}${STREAM_AGGREGATION_ABSOLUTE_RANGE_SEPARATOR}${selection.toIso}`;
}

function parseAggregationRangeSelection(
  value: string | null | undefined,
): StreamAggregationRangeSelection | null {
  if (!value) {
    return null;
  }

  if (
    STREAM_AGGREGATION_RELATIVE_DURATIONS.has(
      value as StreamAggregationRelativeDuration,
    )
  ) {
    return {
      duration: value as StreamAggregationRelativeDuration,
      kind: "relative",
    };
  }

  if (!value.startsWith(STREAM_AGGREGATION_ABSOLUTE_RANGE_PREFIX)) {
    return null;
  }

  const payload = value.slice(STREAM_AGGREGATION_ABSOLUTE_RANGE_PREFIX.length);
  const separatorIndex = payload.indexOf(
    STREAM_AGGREGATION_ABSOLUTE_RANGE_SEPARATOR,
  );

  if (separatorIndex <= 0 || separatorIndex >= payload.length - 1) {
    return null;
  }

  const fromIso = payload.slice(0, separatorIndex);
  const toIso = payload.slice(separatorIndex + 1);

  return fromIso && toIso
    ? {
        fromIso,
        kind: "absolute",
        toIso,
      }
    : null;
}

function getPageCountForTotalEventCount(
  totalEventCount: bigint,
  pageSize: number,
): number {
  const resolvedPageSize = Math.max(1, Math.trunc(pageSize));

  if (totalEventCount <= 0n) {
    return 1;
  }

  const totalPages =
    (totalEventCount + BigInt(resolvedPageSize) - 1n) /
    BigInt(resolvedPageSize);

  return totalPages > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(totalPages);
}

function getPageCountForRevealedTailWindow(args: {
  currentPageCount: number;
  hiddenNewerEventCount: bigint;
  pageSize: number;
  visibleEventCount: bigint;
}): number {
  const currentVisibleWindowEventCount =
    args.visibleEventCount < BigInt(args.currentPageCount * args.pageSize)
      ? args.visibleEventCount
      : BigInt(args.currentPageCount * args.pageSize);

  return getPageCountForTotalEventCount(
    currentVisibleWindowEventCount + args.hiddenNewerEventCount,
    args.pageSize,
  );
}

function scrollContainerToPosition(
  scrollContainer: HTMLDivElement,
  position: "bottom" | "top",
): void {
  const top = position === "top" ? 0 : scrollContainer.scrollHeight;

  if (typeof scrollContainer.scrollTo === "function") {
    scrollContainer.scrollTo({ top });
    return;
  }

  scrollContainer.scrollTop = top;
}

function formatIndexedField(field: StudioStreamEventIndexedField): string {
  return field.value ? `${field.label}: ${field.value}` : field.label;
}

function parsePrismaWalSearchLiteral(literal: string): string | null {
  if (!literal.startsWith('"')) {
    return literal;
  }

  try {
    const parsed: unknown = JSON.parse(literal);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function parsePrismaWalHistorySummary(
  searchQuery: string,
): PrismaWalHistorySummary | null {
  const trimmedQuery = searchQuery.trim();

  if (trimmedQuery.length === 0) {
    return null;
  }

  const clauses = trimmedQuery
    .split(/\s+AND\s+/i)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);

  if (clauses.length === 0 || clauses.length > 2) {
    return null;
  }

  let tableName: string | null = null;
  let rowKey: string | null = null;

  for (const clause of clauses) {
    const match = clause.match(PRISMA_WAL_HISTORY_CLAUSE_PATTERN);
    const field = match?.groups?.field?.toLowerCase() ?? null;
    const rawValue = match?.groups?.value ?? null;

    if (!field || !rawValue) {
      return null;
    }

    const value = parsePrismaWalSearchLiteral(rawValue);

    if (!value) {
      return null;
    }

    if (field === "table" || field === "type") {
      if (tableName !== null) {
        return null;
      }

      tableName = value;
      continue;
    }

    if (field === "key" || field === "rowkey") {
      if (rowKey !== null) {
        return null;
      }

      rowKey = value;
      continue;
    }

    return null;
  }

  if (tableName === null) {
    return null;
  }

  if (clauses.length === 2 && rowKey === null) {
    return null;
  }

  return {
    rowKey,
    tableName,
  };
}

function StreamEventRow(props: {
  event: StudioStreamEvent;
  expandedEventId: string | null;
  isNewlyRevealed: boolean;
  onToggle: (eventId: string) => void;
  searchConfig: StudioStreamSearchConfig | null | undefined;
  searchQuery: string;
}) {
  const {
    event,
    expandedEventId,
    isNewlyRevealed,
    onToggle,
    searchConfig,
    searchQuery,
  } = props;
  const isExpanded = expandedEventId === event.id;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        isExpanded && "shadow-sm",
      )}
    >
      <button
        className={cn(
          "grid w-full grid-cols-[minmax(8.5rem,10rem)_minmax(0,10rem)_minmax(0,14rem)_minmax(0,1fr)_5.5rem] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60",
          isExpanded && "bg-accent/40",
          isNewlyRevealed &&
            "motion-safe:animate-[ps-stream-new-event-flash_1.8s_ease-out]",
        )}
        data-stream-event-id={event.id}
        data-stream-event-newly-revealed={isNewlyRevealed ? "true" : undefined}
        data-testid={`stream-event-row-${event.sequence}`}
        onClick={() => {
          onToggle(event.id);
        }}
        type="button"
      >
        <div className="min-w-0 text-xs text-muted-foreground">
          <span
            className="block truncate"
            title={formatExactTimestamp(event.exactTimestamp)}
          >
            {formatRelativeTime(event.exactTimestamp)}
          </span>
        </div>

        <div className="min-w-0">
          {event.key ? (
            <Badge
              className="max-w-full truncate font-normal"
              variant="secondary"
            >
              {event.key}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          {event.indexedFields.length > 0 ? (
            event.indexedFields.map((field) => (
              <Badge
                key={field.id}
                className="max-w-full truncate font-normal"
                variant="outline"
              >
                {formatIndexedField(field)}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>

        <div className="min-w-0 truncate font-mono text-xs text-foreground">
          {event.preview || " "}
        </div>

        <div className="text-right font-mono text-xs text-muted-foreground">
          {formatBytes(event.sizeBytes)}
        </div>
      </button>

      {isExpanded ? (
        <div className="border-t border-border bg-background px-4 py-4">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-5 text-foreground">
            <HighlightedStreamEventJson
              searchConfig={searchConfig}
              searchQuery={searchQuery}
              value={event.body}
            />
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(8.5rem,10rem)_minmax(0,10rem)_minmax(0,14rem)_minmax(0,1fr)_5.5rem] gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="ml-auto h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

function HeaderRow() {
  return (
    <div
      className="sticky top-0 z-10 grid grid-cols-[minmax(8.5rem,10rem)_minmax(0,10rem)_minmax(0,14rem)_minmax(0,1fr)_5.5rem] gap-3 border-b border-border bg-background/95 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground backdrop-blur-sm"
      data-testid="stream-header-row"
    >
      <span className="pl-4">Time</span>
      <span className="pl-4">Key</span>
      <span className="pl-4">Indexed</span>
      <span className="pl-4">Preview</span>
      <span className="pr-4 text-right">Size</span>
    </div>
  );
}

function PrismaWalHistoryBanner(props: PrismaWalHistorySummary) {
  return (
    <div
      className="border-b border-border bg-muted/20 px-4 py-2.5"
      data-testid="prisma-wal-history-banner"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        <Badge
          className="rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]"
          variant="secondary"
        >
          WAL
        </Badge>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {props.rowKey === null ? (
            <>
              <span className="text-sm text-foreground">
                Showing wal events for{" "}
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-foreground">
                {props.tableName}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm text-foreground">
                Showing wal events for row key{" "}
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-foreground">
                {props.rowKey}
              </span>
              <span className="text-sm text-foreground"> in </span>
              <span className="min-w-0 truncate font-mono text-xs text-foreground">
                {props.tableName}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StreamSearchHeaderControl(props: {
  searchConfig: StudioStreamSearchConfig | null | undefined;
  searchTerm: string;
  setSearchParam: (value: string) => Promise<URLSearchParams>;
  streamName: string;
  suggestionEvents: StudioStreamEvent[];
}) {
  const streamSearch = useStreamEventSearch({
    scopeKey: props.streamName,
    searchConfig: props.searchConfig,
    searchTerm: props.searchTerm,
    setSearchParam: props.setSearchParam,
    suggestionEvents: props.suggestionEvents,
    supportsSearch: true,
  });

  return (
    <div className="min-w-0 flex-1" data-testid="stream-header-search-slot">
      <ExpandableSearchControl
        alignment="left"
        expandedWidthClassName="w-full"
        rowSearch={streamSearch}
        supportsSearch
      />
    </div>
  );
}

function getVisibleAnchorRow(
  scrollContainer: HTMLDivElement,
): HTMLElement | null {
  const containerTop = scrollContainer.getBoundingClientRect().top;

  for (const row of scrollContainer.querySelectorAll<HTMLElement>(
    "[data-stream-event-id]",
  )) {
    if (row.getBoundingClientRect().bottom > containerTop) {
      return row;
    }
  }

  return null;
}

function ActiveStreamView(props: {
  followMode: StreamFollowMode;
  isAggregationPanelOpen: boolean;
  rangeSelection: StreamAggregationRangeSelection;
  searchParam: string | null;
  selectedStream: StudioStreamDetails;
  setSearchParam: (value: string) => Promise<URLSearchParams>;
  setStreamAggregationRangeParam: (
    value: string | null | ((previous: string | null) => string | null),
  ) => Promise<URLSearchParams>;
  setStreamAggregationsParam: (
    value: string | null | ((previous: string | null) => string | null),
  ) => Promise<URLSearchParams>;
  setStreamFollowParam: (
    value: string | null | ((previous: string | null) => string | null),
  ) => Promise<URLSearchParams>;
  setStreamRoutingKeyParam: (
    value: string | null | ((previous: string | null) => string | null),
  ) => Promise<URLSearchParams>;
  streamAggregationRangeParam: string | null;
  streamRoutingKeyParam: string | null;
}) {
  const followMode = props.followMode;
  const isPollingEnabled = followMode !== "paused";
  const selectedStream = props.selectedStream;
  const selectedStreamDetails = props.selectedStream;
  const supportsStreamSearch = selectedStreamDetails?.search != null;
  const supportsRoutingKeySelection = selectedStreamDetails?.routingKey != null;
  const selectedRoutingKey = supportsRoutingKeySelection
    ? normalizeRoutingKeySelection(props.streamRoutingKeyParam)
    : "";
  const routingKeySearchField = useMemo(
    () =>
      resolveRoutingKeySearchField({
        routingKey: selectedStreamDetails?.routingKey,
        searchConfig: selectedStreamDetails?.search,
      }),
    [selectedStreamDetails?.routingKey, selectedStreamDetails?.search],
  );
  const activeSearchQuery = supportsStreamSearch
    ? (props.searchParam?.trim() ?? "")
    : "";
  const effectiveSearchQuery =
    selectedRoutingKey.length > 0 && routingKeySearchField
      ? applyRoutingKeySearchSelection({
          currentSearchTerm: activeSearchQuery,
          queryFieldName: routingKeySearchField.queryFieldName,
          routingKey: selectedRoutingKey,
        })
      : activeSearchQuery;
  const isSearchActive =
    supportsStreamSearch && effectiveSearchQuery.length > 0;
  const hasStandaloneRoutingKeyFilter =
    selectedRoutingKey.length > 0 && !isSearchActive;
  const prismaWalHistorySummary = useMemo(() => {
    if (
      selectedStream.name !== PRISMA_WAL_STREAM_NAME ||
      selectedStreamDetails?.indexStatus?.profile !== STATE_PROTOCOL_PROFILE
    ) {
      return null;
    }

    return parsePrismaWalHistorySummary(activeSearchQuery);
  }, [
    activeSearchQuery,
    selectedStream.name,
    selectedStreamDetails?.indexStatus?.profile,
  ]);
  const selectedStreamIdentity = `${selectedStream.name}:${selectedStream.epoch}`;
  const streamEventWindowResetKey = `${selectedStreamIdentity ?? "none"}::${selectedRoutingKey}::${effectiveSearchQuery}`;
  const [pageCount, setPageCount] = useState(1);
  const [searchVisibleResultCount, setSearchVisibleResultCount] = useState<
    bigint | null
  >(null);
  const [searchHeadMatchCountSnapshot, setSearchHeadMatchCountSnapshot] =
    useState<bigint | null>(null);
  const [
    searchHeadTotalEventCountSnapshot,
    setSearchHeadTotalEventCountSnapshot,
  ] = useState<bigint | null>(null);
  const [searchSuggestionEvents, setSearchSuggestionEvents] = useState<
    StudioStreamEvent[]
  >([]);
  const [
    pendingScrollTriggeredSearchVisibleResultCount,
    setPendingScrollTriggeredSearchVisibleResultCount,
  ] = useState<bigint | null>(null);
  const [visibleEventCount, setVisibleEventCount] = useState<bigint | null>(
    null,
  );
  const [isTailViewportPinned, setIsTailViewportPinned] = useState(true);
  const [recentlyRevealedEventIds, setRecentlyRevealedEventIds] = useState<
    string[]
  >([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastResetStreamIdentityRef = useRef<string | null>(null);
  const lastSuggestionStreamIdentityRef = useRef<string | null>(null);
  const pendingRevealRef = useRef<{
    batchSize: number;
    previousFirstEventId: string | null;
    streamIdentity: string | null;
  } | null>(null);
  const scrollAnchorSnapshotRef = useRef<ScrollAnchorSnapshot | null>(null);
  const pendingScrollPositionRef = useRef<PendingScrollPositionRequest | null>(
    null,
  );
  const suppressNextScrollPaginationRef = useRef(false);
  const expandedEventStateKey = `stream:${selectedStream.name}:expanded-event`;
  const [expandedEventId, setExpandedEventId] = useUiState<string | null>(
    expandedEventStateKey,
    null,
  );
  const isAggregationPanelOpen = props.isAggregationPanelOpen;
  const aggregationRangeSelection = props.rangeSelection;
  const isAggregationAutoRefreshEnabled = followMode !== "paused";
  const requestedSearchResultCount = isSearchActive
    ? (searchVisibleResultCount ?? BigInt(STREAM_EVENTS_PAGE_SIZE))
    : 0n;
  const isScrollTriggeredSearchLoadPending =
    pendingScrollTriggeredSearchVisibleResultCount !== null;
  const {
    events,
    hasHiddenNewerEvents: hookHasHiddenNewerEvents,
    hasMoreEvents,
    hiddenNewerEventCount: hookHiddenNewerEventCount,
    isFetching,
    matchedEventCount,
    totalEventCount,
  } = useStreamEvents({
    liveUpdatesEnabled: isPollingEnabled && !isScrollTriggeredSearchLoadPending,
    pageCount,
    routingKey: selectedRoutingKey,
    searchConfig: selectedStreamDetails?.search,
    searchQuery: effectiveSearchQuery,
    searchVisibleResultCount: isSearchActive
      ? requestedSearchResultCount
      : undefined,
    stream: selectedStream,
    visibleEventCount:
      visibleEventCount ??
      (selectedStream
        ? parseNonNegativeBigInt(selectedStream.nextOffset)
        : undefined),
  });
  const effectiveSearchHeadMatchCountSnapshot =
    isSearchActive &&
    searchHeadMatchCountSnapshot !== null &&
    matchedEventCount !== null
      ? clampBigInt(searchHeadMatchCountSnapshot, 0n, matchedEventCount)
      : searchHeadMatchCountSnapshot;
  const effectiveSearchHeadTotalEventCountSnapshot =
    isSearchActive && searchHeadTotalEventCountSnapshot !== null
      ? clampBigInt(searchHeadTotalEventCountSnapshot, 0n, totalEventCount)
      : searchHeadTotalEventCountSnapshot;
  const searchHiddenNewerEventCount =
    isSearchActive &&
    matchedEventCount !== null &&
    effectiveSearchHeadMatchCountSnapshot !== null &&
    matchedEventCount > effectiveSearchHeadMatchCountSnapshot
      ? matchedEventCount - effectiveSearchHeadMatchCountSnapshot
      : 0n;
  const hiddenNewerEventCount = isSearchActive
    ? searchHiddenNewerEventCount
    : hasStandaloneRoutingKeyFilter
      ? 0n
      : hookHiddenNewerEventCount;
  const hasHiddenNewerEvents = isSearchActive
    ? searchHiddenNewerEventCount > 0n
    : hasStandaloneRoutingKeyFilter
      ? false
      : hookHasHiddenNewerEvents;
  const aggregationRollups = selectedStreamDetails?.aggregationRollups ?? [];
  const { aggregations } = useStreamAggregations({
    aggregationRollups,
    enabled: isAggregationPanelOpen && aggregationRollups.length > 0,
    liveUpdatesEnabled: isAggregationAutoRefreshEnabled,
    rangeSelection: aggregationRangeSelection,
    streamName: selectedStream?.name,
  });
  const resolvedAggregationSeriesCount = useMemo(
    () => aggregations.flatMap((aggregation) => aggregation.series).length,
    [aggregations],
  );
  const aggregationCount =
    resolvedAggregationSeriesCount > 0
      ? resolvedAggregationSeriesCount
      : (selectedStreamDetails?.aggregationCount ?? 0);
  const searchResultsLoadedCount = isSearchActive
    ? isScrollTriggeredSearchLoadPending
      ? matchedEventCount === null
        ? pendingScrollTriggeredSearchVisibleResultCount
        : clampBigInt(
            pendingScrollTriggeredSearchVisibleResultCount,
            0n,
            matchedEventCount,
          )
      : BigInt(events.length)
    : 0n;
  const searchScannedEventCountBasis = isSearchActive
    ? hasMoreEvents
      ? (effectiveSearchHeadTotalEventCountSnapshot ?? totalEventCount)
      : totalEventCount
    : 0n;
  const searchScannedEventCount = isSearchActive
    ? getSearchScannedEventCount({
        events,
        hasMoreEvents,
        totalEventCount: searchScannedEventCountBasis,
      })
    : 0n;
  const searchScanProgressWidth = isSearchActive
    ? getSearchScanProgressWidth(searchScannedEventCount, totalEventCount)
    : "0%";
  const firstEventId = events[0]?.id ?? null;
  const recentlyRevealedEventIdSet = useMemo(
    () => new Set(recentlyRevealedEventIds),
    [recentlyRevealedEventIds],
  );
  const queuePendingScrollPosition = useCallback(
    (position: "bottom" | "top") => {
      pendingScrollPositionRef.current = {
        position,
        streamIdentity: selectedStreamIdentity,
      };
    },
    [selectedStreamIdentity],
  );
  const performProgrammaticScroll = useCallback(
    (position: "bottom" | "top") => {
      const scrollContainer = scrollContainerRef.current;

      if (!scrollContainer) {
        return;
      }

      const targetTop = position === "top" ? 0 : scrollContainer.scrollHeight;

      if (scrollContainer.scrollTop === targetTop) {
        return;
      }

      suppressNextScrollPaginationRef.current = true;
      scrollContainerToPosition(scrollContainer, position);
    },
    [],
  );

  useEffect(() => {
    if (!supportsStreamSearch) {
      lastSuggestionStreamIdentityRef.current = selectedStreamIdentity;
      setSearchSuggestionEvents((currentEvents) =>
        currentEvents.length === 0 ? currentEvents : [],
      );
      return;
    }

    if (lastSuggestionStreamIdentityRef.current !== selectedStreamIdentity) {
      lastSuggestionStreamIdentityRef.current = selectedStreamIdentity;
      setSearchSuggestionEvents(
        events.slice(0, STREAM_SEARCH_SUGGESTION_EVENT_MEMORY_LIMIT),
      );
      return;
    }

    if (events.length === 0) {
      return;
    }

    setSearchSuggestionEvents((currentEvents) => {
      const nextSearchSuggestionEvents = mergeRememberedStreamSearchEvents({
        limit: STREAM_SEARCH_SUGGESTION_EVENT_MEMORY_LIMIT,
        nextEvents: events,
        previousEvents: currentEvents,
      });

      const isUnchanged =
        nextSearchSuggestionEvents.length === currentEvents.length &&
        nextSearchSuggestionEvents.every(
          (event, index) => event.id === currentEvents[index]?.id,
        );

      return isUnchanged ? currentEvents : nextSearchSuggestionEvents;
    });
  }, [events, selectedStreamIdentity, supportsStreamSearch]);

  useEffect(() => {
    if (lastResetStreamIdentityRef.current === streamEventWindowResetKey) {
      return;
    }

    lastResetStreamIdentityRef.current = streamEventWindowResetKey;
    pendingRevealRef.current = null;
    pendingScrollPositionRef.current = null;
    setPendingScrollTriggeredSearchVisibleResultCount(null);
    setIsTailViewportPinned(true);
    setRecentlyRevealedEventIds([]);
    setExpandedEventId(null);
    setSearchHeadMatchCountSnapshot(null);
    setSearchHeadTotalEventCountSnapshot(null);
    suppressNextScrollPaginationRef.current = false;
    setSearchVisibleResultCount(
      isSearchActive ? BigInt(STREAM_EVENTS_PAGE_SIZE) : null,
    );
    setVisibleEventCount(
      isSearchActive
        ? null
        : selectedStream
          ? parseNonNegativeBigInt(selectedStream.nextOffset)
          : null,
    );
    setPageCount(1);
    if (scrollContainerRef.current) {
      scrollContainerToPosition(scrollContainerRef.current, "top");
    }
  }, [
    isSearchActive,
    selectedStream,
    setExpandedEventId,
    streamEventWindowResetKey,
  ]);

  useEffect(() => {
    if (
      !isSearchActive ||
      matchedEventCount === null ||
      (searchHeadMatchCountSnapshot !== null &&
        searchHeadTotalEventCountSnapshot !== null)
    ) {
      return;
    }

    if (searchHeadMatchCountSnapshot === null) {
      setSearchHeadMatchCountSnapshot(matchedEventCount);
    }

    if (searchHeadTotalEventCountSnapshot === null) {
      setSearchHeadTotalEventCountSnapshot(totalEventCount);
    }
  }, [
    isSearchActive,
    matchedEventCount,
    searchHeadMatchCountSnapshot,
    searchHeadTotalEventCountSnapshot,
    totalEventCount,
  ]);

  const revealNewerEvents = useCallback(() => {
    if (!selectedStream) {
      return;
    }

    if (isSearchActive) {
      const hiddenMatchCount = hiddenNewerEventCount;
      const revealBatchSize = Number(
        hiddenMatchCount > NEW_EVENTS_BATCH_SIZE
          ? NEW_EVENTS_BATCH_SIZE
          : hiddenMatchCount,
      );

      setSearchVisibleResultCount((currentValue) => {
        const resolvedCurrentValue =
          currentValue ?? BigInt(STREAM_EVENTS_PAGE_SIZE);

        if (hiddenMatchCount === 0n) {
          pendingRevealRef.current = null;
          return resolvedCurrentValue;
        }

        pendingRevealRef.current = {
          batchSize: revealBatchSize,
          previousFirstEventId: firstEventId,
          streamIdentity: selectedStreamIdentity,
        };

        return resolvedCurrentValue + BigInt(revealBatchSize);
      });
      setSearchHeadMatchCountSnapshot((currentValue) => {
        const resolvedCurrentValue =
          currentValue ??
          (matchedEventCount !== null
            ? matchedEventCount - hiddenMatchCount
            : 0n);

        if (matchedEventCount === null) {
          return resolvedCurrentValue + BigInt(revealBatchSize);
        }

        return clampBigInt(
          resolvedCurrentValue + BigInt(revealBatchSize),
          0n,
          matchedEventCount,
        );
      });
      setSearchHeadTotalEventCountSnapshot(totalEventCount);

      return;
    }

    const latestEventCount = parseNonNegativeBigInt(selectedStream.nextOffset);

    setVisibleEventCount((currentValue) => {
      const resolvedCurrentValue = currentValue ?? latestEventCount;
      const hiddenEventCount =
        latestEventCount > resolvedCurrentValue
          ? latestEventCount - resolvedCurrentValue
          : 0n;

      if (hiddenEventCount === 0n) {
        pendingRevealRef.current = null;
        return resolvedCurrentValue;
      }

      const revealBatchSize = Number(
        hiddenEventCount > NEW_EVENTS_BATCH_SIZE
          ? NEW_EVENTS_BATCH_SIZE
          : hiddenEventCount,
      );

      pendingRevealRef.current = {
        batchSize: revealBatchSize,
        previousFirstEventId: firstEventId,
        streamIdentity: selectedStreamIdentity,
      };

      return resolvedCurrentValue + BigInt(revealBatchSize);
    });
    setPageCount((currentPageCount) => currentPageCount + 1);
  }, [
    firstEventId,
    hiddenNewerEventCount,
    isSearchActive,
    matchedEventCount,
    selectedStream,
    selectedStreamIdentity,
    totalEventCount,
  ]);

  const revealAllNewerEvents = useCallback(() => {
    if (!selectedStream) {
      return;
    }

    if (isSearchActive) {
      const hiddenMatchCount = hiddenNewerEventCount;

      setSearchVisibleResultCount((currentValue) => {
        const resolvedCurrentValue =
          currentValue ?? BigInt(STREAM_EVENTS_PAGE_SIZE);

        if (hiddenMatchCount === 0n) {
          pendingRevealRef.current = null;
          return resolvedCurrentValue;
        }

        pendingRevealRef.current = {
          batchSize:
            hiddenMatchCount > BigInt(Number.MAX_SAFE_INTEGER)
              ? Number.MAX_SAFE_INTEGER
              : Number(hiddenMatchCount),
          previousFirstEventId: firstEventId,
          streamIdentity: selectedStreamIdentity,
        };

        return resolvedCurrentValue + hiddenMatchCount;
      });
      setSearchHeadMatchCountSnapshot((currentValue) => {
        if (matchedEventCount !== null) {
          return matchedEventCount;
        }

        return (currentValue ?? 0n) + hiddenMatchCount;
      });
      setSearchHeadTotalEventCountSnapshot(totalEventCount);

      return;
    }

    const latestEventCount = parseNonNegativeBigInt(selectedStream.nextOffset);
    const currentVisibleEventCount = visibleEventCount ?? latestEventCount;
    const hiddenEventCount =
      latestEventCount > currentVisibleEventCount
        ? latestEventCount - currentVisibleEventCount
        : 0n;

    setVisibleEventCount((currentValue) => {
      const resolvedCurrentValue = currentValue ?? latestEventCount;
      const hiddenEventCount =
        latestEventCount > resolvedCurrentValue
          ? latestEventCount - resolvedCurrentValue
          : 0n;

      if (hiddenEventCount === 0n) {
        pendingRevealRef.current = null;
        return resolvedCurrentValue;
      }

      pendingRevealRef.current = {
        batchSize:
          hiddenEventCount > BigInt(Number.MAX_SAFE_INTEGER)
            ? Number.MAX_SAFE_INTEGER
            : Number(hiddenEventCount),
        previousFirstEventId: firstEventId,
        streamIdentity: selectedStreamIdentity,
      };

      return latestEventCount;
    });
    setPageCount((currentPageCount) =>
      hiddenEventCount === 0n
        ? currentPageCount
        : getPageCountForRevealedTailWindow({
            currentPageCount,
            hiddenNewerEventCount: hiddenEventCount,
            pageSize: STREAM_EVENTS_PAGE_SIZE,
            visibleEventCount: totalEventCount,
          }),
    );
  }, [
    firstEventId,
    hiddenNewerEventCount,
    isSearchActive,
    matchedEventCount,
    selectedStream,
    selectedStreamIdentity,
    totalEventCount,
    visibleEventCount,
  ]);

  const jumpToLatestEvents = useCallback(() => {
    if (!selectedStream) {
      return;
    }

    pendingRevealRef.current = null;
    scrollAnchorSnapshotRef.current = null;
    setIsTailViewportPinned(true);
    queuePendingScrollPosition("top");
    setRecentlyRevealedEventIds([]);
    if (isSearchActive) {
      setSearchVisibleResultCount(BigInt(STREAM_EVENTS_PAGE_SIZE));
      setSearchHeadMatchCountSnapshot(matchedEventCount);
      setSearchHeadTotalEventCountSnapshot(totalEventCount);
      setPageCount(1);
      return;
    }

    setVisibleEventCount(parseNonNegativeBigInt(selectedStream.nextOffset));
    setPageCount(1);
  }, [
    isSearchActive,
    matchedEventCount,
    queuePendingScrollPosition,
    selectedStream,
    setIsTailViewportPinned,
    totalEventCount,
  ]);

  const jumpToStreamBeginning = useCallback(() => {
    if (!selectedStream) {
      return;
    }

    if (isSearchActive) {
      pendingRevealRef.current = null;
      scrollAnchorSnapshotRef.current = null;
      queuePendingScrollPosition("bottom");
      setRecentlyRevealedEventIds([]);
      setSearchVisibleResultCount(matchedEventCount ?? BigInt(events.length));
      setSearchHeadMatchCountSnapshot(matchedEventCount);
      setSearchHeadTotalEventCountSnapshot(totalEventCount);
      setPageCount(1);
      return;
    }

    const streamTotalEventCount = parseNonNegativeBigInt(
      selectedStream.nextOffset,
    );

    pendingRevealRef.current = null;
    scrollAnchorSnapshotRef.current = null;
    queuePendingScrollPosition("bottom");
    setRecentlyRevealedEventIds([]);
    setVisibleEventCount(streamTotalEventCount);
    setPageCount(
      getPageCountForTotalEventCount(
        streamTotalEventCount,
        STREAM_EVENTS_PAGE_SIZE,
      ),
    );
  }, [
    events.length,
    isSearchActive,
    matchedEventCount,
    queuePendingScrollPosition,
    selectedStream,
    totalEventCount,
  ]);

  useEffect(() => {
    const pendingReveal = pendingRevealRef.current;

    if (
      !pendingReveal ||
      pendingReveal.streamIdentity !== selectedStreamIdentity
    ) {
      return;
    }

    if (pendingReveal.previousFirstEventId === firstEventId) {
      return;
    }

    pendingRevealRef.current = null;
    setRecentlyRevealedEventIds(
      events.slice(0, pendingReveal.batchSize).map((event) => event.id),
    );
  }, [events, firstEventId, selectedStreamIdentity]);

  useEffect(() => {
    if (recentlyRevealedEventIds.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRecentlyRevealedEventIds([]);
    }, NEW_EVENTS_HIGHLIGHT_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [recentlyRevealedEventIds]);

  useEffect(() => {
    if (!isSearchActive) {
      if (pendingScrollTriggeredSearchVisibleResultCount !== null) {
        setPendingScrollTriggeredSearchVisibleResultCount(null);
      }

      return;
    }

    if (pendingScrollTriggeredSearchVisibleResultCount === null) {
      return;
    }

    if (
      BigInt(events.length) >= pendingScrollTriggeredSearchVisibleResultCount ||
      !hasMoreEvents
    ) {
      setPendingScrollTriggeredSearchVisibleResultCount(null);
    }
  }, [
    events.length,
    hasMoreEvents,
    isSearchActive,
    pendingScrollTriggeredSearchVisibleResultCount,
  ]);

  useEffect(() => {
    if (followMode !== "tail" || !selectedStream || !isTailViewportPinned) {
      return;
    }

    performProgrammaticScroll("top");
  }, [
    followMode,
    isTailViewportPinned,
    performProgrammaticScroll,
    selectedStream,
    selectedStreamIdentity,
  ]);

  useEffect(() => {
    if (followMode !== "tail" || !selectedStream || !hasHiddenNewerEvents) {
      return;
    }

    if (isFetching && events.length === 0) {
      return;
    }

    if (isTailViewportPinned) {
      queuePendingScrollPosition("top");
    }

    revealAllNewerEvents();
  }, [
    followMode,
    hasHiddenNewerEvents,
    isTailViewportPinned,
    isFetching,
    events.length,
    queuePendingScrollPosition,
    revealAllNewerEvents,
    selectedStream,
  ]);

  const recordScrollAnchorSnapshot = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer) {
      return;
    }
    const anchorRow = getVisibleAnchorRow(scrollContainer);

    scrollAnchorSnapshotRef.current = {
      anchorEventId: anchorRow?.dataset.streamEventId ?? null,
      anchorTop: anchorRow?.getBoundingClientRect().top ?? 0,
      firstEventId,
      hasHiddenNewerEvents,
      scrollHeight: scrollContainer.scrollHeight,
      scrollTop: scrollContainer.scrollTop,
      streamIdentity: selectedStreamIdentity,
    };
  }, [firstEventId, hasHiddenNewerEvents, selectedStreamIdentity]);

  const maybeLoadOlderEvents = useCallback(
    (trigger: "auto" | "scroll") => {
      const scrollContainer = scrollContainerRef.current;

      if (
        !scrollContainer ||
        !hasMoreEvents ||
        isFetching ||
        (isSearchActive && isScrollTriggeredSearchLoadPending)
      ) {
        return;
      }

      if (
        trigger === "auto" &&
        hasStandaloneRoutingKeyFilter &&
        events.length === 0
      ) {
        return;
      }

      if (scrollContainer.clientHeight <= 0) {
        return;
      }

      const distanceToBottom =
        scrollContainer.scrollHeight -
        (scrollContainer.scrollTop + scrollContainer.clientHeight);

      if (distanceToBottom <= LOAD_MORE_THRESHOLD_PX) {
        if (isSearchActive) {
          const nextVisibleResultCount =
            requestedSearchResultCount + BigInt(STREAM_EVENTS_PAGE_SIZE);

          if (trigger === "scroll") {
            setPendingScrollTriggeredSearchVisibleResultCount(
              nextVisibleResultCount,
            );
          }

          setSearchVisibleResultCount(nextVisibleResultCount);
          return;
        }

        setPageCount((currentPageCount) => currentPageCount + 1);
      }
    },
    [
      events.length,
      hasMoreEvents,
      hasStandaloneRoutingKeyFilter,
      isFetching,
      isScrollTriggeredSearchLoadPending,
      isSearchActive,
      requestedSearchResultCount,
    ],
  );

  useEffect(() => {
    if (isSearchActive) {
      return;
    }

    maybeLoadOlderEvents("auto");
  }, [events.length, isSearchActive, maybeLoadOlderEvents]);

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer) {
      return;
    }

    const currentSnapshot: ScrollAnchorSnapshot = {
      anchorEventId: null,
      anchorTop: 0,
      firstEventId,
      hasHiddenNewerEvents,
      scrollHeight: scrollContainer.scrollHeight,
      scrollTop: scrollContainer.scrollTop,
      streamIdentity: selectedStreamIdentity,
    };
    const previousSnapshot = scrollAnchorSnapshotRef.current;

    if (
      previousSnapshot &&
      previousSnapshot.streamIdentity === selectedStreamIdentity &&
      previousSnapshot.scrollTop > 0
    ) {
      const buttonVisibilityChanged =
        previousSnapshot.hasHiddenNewerEvents !== hasHiddenNewerEvents;
      const prependedEvents =
        previousSnapshot.firstEventId !== null &&
        firstEventId !== null &&
        previousSnapshot.firstEventId !== firstEventId;
      const scrollHeightDelta =
        scrollContainer.scrollHeight - previousSnapshot.scrollHeight;
      let didResolveFromAnchor = false;

      if (
        scrollHeightDelta !== 0 &&
        (buttonVisibilityChanged || prependedEvents)
      ) {
        if (
          previousSnapshot.anchorEventId &&
          previousSnapshot.anchorTop !== 0
        ) {
          const anchorRow = [
            ...scrollContainer.querySelectorAll<HTMLElement>(
              "[data-stream-event-id]",
            ),
          ].find(
            (row) =>
              row.dataset.streamEventId === previousSnapshot.anchorEventId,
          );

          if (anchorRow) {
            const anchorTopDelta =
              anchorRow.getBoundingClientRect().top -
              previousSnapshot.anchorTop;

            if (anchorTopDelta !== 0) {
              scrollContainer.scrollTop += anchorTopDelta;
            }

            didResolveFromAnchor = true;
          }
        }

        if (!didResolveFromAnchor) {
          scrollContainer.scrollTop =
            previousSnapshot.scrollTop + scrollHeightDelta;
        }

        currentSnapshot.scrollTop = scrollContainer.scrollTop;
      }
    }

    const pendingScrollPosition = pendingScrollPositionRef.current;

    if (
      pendingScrollPosition &&
      pendingScrollPosition.streamIdentity === selectedStreamIdentity
    ) {
      const targetTop =
        pendingScrollPosition.position === "top"
          ? 0
          : scrollContainer.scrollHeight;

      if (scrollContainer.scrollTop !== targetTop) {
        suppressNextScrollPaginationRef.current = true;
        scrollContainerToPosition(
          scrollContainer,
          pendingScrollPosition.position,
        );
      }

      currentSnapshot.scrollTop = scrollContainer.scrollTop;
      pendingScrollPositionRef.current = null;
    }

    const currentAnchorRow = getVisibleAnchorRow(scrollContainer);
    currentSnapshot.anchorEventId =
      currentAnchorRow?.dataset.streamEventId ?? null;
    currentSnapshot.anchorTop =
      currentAnchorRow?.getBoundingClientRect().top ?? 0;
    scrollAnchorSnapshotRef.current = currentSnapshot;
  }, [firstEventId, hasHiddenNewerEvents, selectedStreamIdentity]);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
      data-testid="stream-view-root"
    >
      <StudioHeader
        endContent={
          selectedStream ? (
            <div
              aria-label="Stream follow mode"
              className="inline-flex items-stretch gap-0 overflow-hidden rounded-sm border border-input bg-muted/60 shadow-none"
              data-testid="stream-follow-mode-toggle"
              role="group"
            >
              {STREAM_FOLLOW_MODE_OPTIONS.map((option, index) => {
                const isSelected = followMode === option.value;

                return (
                  <Button
                    aria-pressed={isSelected}
                    className={cn(
                      STREAM_FOLLOW_MODE_ITEM_CLASS_NAME,
                      index < STREAM_FOLLOW_MODE_OPTIONS.length - 1 &&
                        "border-r border-input",
                    )}
                    data-state={isSelected ? "on" : "off"}
                    data-testid={`stream-follow-mode-${option.value}`}
                    key={option.value}
                    onClick={() => {
                      if (followMode === option.value) {
                        return;
                      }

                      void props.setStreamFollowParam(option.value);
                    }}
                    size="sm"
                    title={STREAM_FOLLOW_MODE_HELP_TEXT[option.value]}
                    type="button"
                    variant="ghost"
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          ) : null
        }
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-2"
          data-testid="stream-header-start-controls"
        >
          {selectedStream && aggregationCount > 0 ? (
            <Button
              aria-label="Toggle aggregations"
              className="size-9"
              data-testid="stream-aggregations-button"
              onClick={() => {
                const nextIsOpen = !isAggregationPanelOpen;

                void props.setStreamAggregationsParam(nextIsOpen ? "" : null);

                if (!nextIsOpen) {
                  void props.setStreamAggregationRangeParam(null);
                  return;
                }

                const nextRangeSelection =
                  parseAggregationRangeSelection(
                    props.streamAggregationRangeParam,
                  ) ?? DEFAULT_STREAM_AGGREGATION_RANGE_SELECTION;

                void props.setStreamAggregationRangeParam(
                  serializeAggregationRangeSelection(nextRangeSelection),
                );
              }}
              size="icon"
              title="Aggregations"
              type="button"
              variant={isAggregationPanelOpen ? "secondary" : "outline"}
            >
              <ChartColumn />
            </Button>
          ) : null}
          {selectedStream && supportsRoutingKeySelection ? (
            <StreamRoutingKeySelector
              selectedRoutingKey={
                selectedRoutingKey.length > 0 ? selectedRoutingKey : null
              }
              setSelectedRoutingKeyParam={props.setStreamRoutingKeyParam}
              streamName={selectedStream.name}
            />
          ) : null}
          {supportsStreamSearch ? (
            <StreamSearchHeaderControl
              searchConfig={selectedStreamDetails?.search}
              searchTerm={activeSearchQuery}
              setSearchParam={props.setSearchParam}
              streamName={selectedStream.name}
              suggestionEvents={searchSuggestionEvents}
            />
          ) : null}
        </div>
      </StudioHeader>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="stream-view-content"
      >
        <>
          {prismaWalHistorySummary ? (
            <PrismaWalHistoryBanner
              rowKey={prismaWalHistorySummary.rowKey}
              tableName={prismaWalHistorySummary.tableName}
            />
          ) : null}
          {isAggregationPanelOpen && aggregationRollups.length > 0 ? (
            <StreamAggregationsPanel
              aggregationRollups={aggregationRollups}
              liveUpdatesEnabled={isAggregationAutoRefreshEnabled}
              onRangeSelectionChange={(nextSelection) => {
                void props.setStreamAggregationRangeParam(
                  serializeAggregationRangeSelection(nextSelection),
                );
              }}
              rangeSelection={aggregationRangeSelection}
              streamName={selectedStream.name}
            />
          ) : null}

          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto"
            data-testid="stream-events-scroll-container"
            onScroll={() => {
              if (followMode === "tail") {
                const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
                const shouldPinViewport =
                  scrollTop <= STREAM_TAIL_PIN_THRESHOLD_PX;

                setIsTailViewportPinned((currentValue) =>
                  currentValue === shouldPinViewport
                    ? currentValue
                    : shouldPinViewport,
                );
              }

              recordScrollAnchorSnapshot();
              if (suppressNextScrollPaginationRef.current) {
                suppressNextScrollPaginationRef.current = false;
                return;
              }

              maybeLoadOlderEvents("scroll");
            }}
          >
            {isFetching && events.length === 0 ? (
              <LoadingState />
            ) : events.length === 0 ? (
              <div className="flex min-h-full items-center justify-center px-6 py-10 text-sm text-muted-foreground">
                {isSearchActive
                  ? "No events match this search."
                  : hasStandaloneRoutingKeyFilter
                    ? "No recent events match this routing key."
                    : "This stream does not contain any events yet."}
              </div>
            ) : (
              <>
                <HeaderRow />

                {hasHiddenNewerEvents ? (
                  <div
                    className="flex justify-center px-4 py-3"
                    data-testid="stream-new-events-row"
                  >
                    <Button
                      className="rounded-2xl bg-background/95 px-4 shadow-sm"
                      data-testid="stream-new-events-button"
                      onClick={() => {
                        revealNewerEvents();
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {formatNewEventsLabel(hiddenNewerEventCount)}
                    </Button>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 p-4">
                  {events.map((event) => (
                    <StreamEventRow
                      key={event.id}
                      event={event}
                      expandedEventId={expandedEventId}
                      isNewlyRevealed={recentlyRevealedEventIdSet.has(event.id)}
                      onToggle={(eventId) => {
                        setExpandedEventId((currentValue) =>
                          currentValue === eventId ? null : eventId,
                        );
                      }}
                      searchConfig={selectedStreamDetails?.search}
                      searchQuery={activeSearchQuery}
                    />
                  ))}

                  {isFetching && (hasMoreEvents || hasHiddenNewerEvents) ? (
                    <div className="grid grid-cols-[minmax(8.5rem,10rem)_minmax(0,10rem)_minmax(0,14rem)_minmax(0,1fr)_5.5rem] gap-3 rounded-lg border border-border bg-card px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="ml-auto h-4 w-12" />
                    </div>
                  ) : null}

                  {!isFetching && !hasMoreEvents ? (
                    <div className="py-2 text-center text-xs text-muted-foreground">
                      Reached the beginning of the stream.
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <div
            className="border-t border-table-border bg-background/90 px-2 py-3 backdrop-blur-sm"
            data-testid="stream-footer"
          >
            <div className="flex flex-wrap items-center justify-start gap-2">
              <TooltipProvider>
                <div
                  aria-label="Stream navigation"
                  className="inline-flex items-stretch overflow-hidden rounded-md border border-input bg-background shadow-sm"
                  role="group"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Jump to beginning of stream"
                        className="h-9 w-9 rounded-none border-0 border-r border-input shadow-none"
                        data-testid="stream-jump-start-button"
                        onClick={jumpToStreamBeginning}
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <ChevronsLeft data-icon="inline-start" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Jump to beginning</TooltipContent>
                  </Tooltip>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        aria-label="Open stream diagnostics"
                        className={cn(
                          "relative flex min-w-[14rem] items-center justify-center overflow-hidden border-r border-input bg-background px-4 text-sm font-medium text-foreground tabular-nums transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        )}
                        data-testid="stream-summary-panel"
                        type="button"
                      >
                        {isSearchActive ? (
                          <>
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-y-0 left-0 bg-sky-500/8 transition-[width] duration-200 ease-out"
                              data-testid="stream-search-scan-progress"
                              style={{
                                width: searchScanProgressWidth,
                              }}
                            />
                            {isScrollTriggeredSearchLoadPending ? (
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 animate-pulse bg-foreground/5"
                                data-testid="stream-search-load-indicator"
                              />
                            ) : null}
                            <span className="relative z-10">
                              {formatSearchSummary({
                                resultsLoadedCount: searchResultsLoadedCount,
                                scannedEventCount: searchScannedEventCount,
                                totalEventCount,
                              })}
                            </span>
                          </>
                        ) : (
                          <>
                            {formatCount(totalEventCount)} events
                            {selectedStreamDetails
                              ? `, ${formatBytes(selectedStreamDetails.totalSizeBytes)} total`
                              : ""}
                          </>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="center"
                      className="w-[40rem] max-w-[calc(100vw-2rem)] p-0"
                      side="top"
                      sideOffset={8}
                    >
                      <StreamDiagnosticsPopover
                        details={selectedStreamDetails}
                      />
                    </PopoverContent>
                  </Popover>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Jump to end of stream"
                        className="h-9 w-9 rounded-none border-0 shadow-none"
                        data-testid="stream-jump-end-button"
                        onClick={jumpToLatestEvents}
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <ChevronsRight data-icon="inline-start" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Jump to end</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
          </div>
        </>
      </div>
    </div>
  );
}

export function StreamView(_props: ViewProps) {
  const {
    searchParam,
    setSearchParam,
    setStreamAggregationRangeParam,
    setStreamAggregationsParam,
    setStreamFollowParam,
    setStreamRoutingKeyParam,
    streamAggregationRangeParam,
    streamAggregationsParam,
    streamFollowParam,
    streamRoutingKeyParam,
    streamParam,
  } = useNavigation();
  const followMode =
    parseStreamFollowMode(streamFollowParam) ?? STREAM_FOLLOW_MODE_DEFAULT;
  const isPollingEnabled = followMode !== "paused";
  const selectedStreamName = streamParam?.trim() || null;
  const selectedRoutingKey = normalizeRoutingKeySelection(
    streamRoutingKeyParam,
  );
  const shouldEnableStreamDetailsLongPolling = useCallback(
    (details: StudioStreamDetails) => {
      if (selectedRoutingKey.length === 0) {
        return true;
      }

      const routingKeySearchField = resolveRoutingKeySearchField({
        routingKey: details.routingKey,
        searchConfig: details.search,
      });
      const activeSearchQuery =
        details.search != null ? (searchParam?.trim() ?? "") : "";
      const effectiveSearchQuery =
        routingKeySearchField != null
          ? applyRoutingKeySearchSelection({
              currentSearchTerm: activeSearchQuery,
              queryFieldName: routingKeySearchField.queryFieldName,
              routingKey: selectedRoutingKey,
            })
          : activeSearchQuery;

      return details.search != null && effectiveSearchQuery.length > 0;
    },
    [searchParam, selectedRoutingKey],
  );
  const {
    details: selectedStream,
    isError: isSelectedStreamDetailsError,
    isLoading: isSelectedStreamDetailsLoading,
  } = useStreamDetails({
    refreshIntervalMs:
      selectedStreamName && isPollingEnabled
        ? STREAM_FOLLOW_REFRESH_INTERVAL_MS
        : undefined,
    shouldEnableLongPolling:
      selectedRoutingKey.length > 0
        ? shouldEnableStreamDetailsLongPolling
        : undefined,
    streamName: selectedStreamName,
  });
  const isLoading =
    selectedStreamName != null &&
    isSelectedStreamDetailsLoading &&
    selectedStream == null;
  const isError = selectedStreamName != null && isSelectedStreamDetailsError;
  const isAggregationPanelOpen =
    parseAggregationPanelOpenState(streamAggregationsParam) ?? false;
  const parsedAggregationRangeSelection = useMemo(
    () => parseAggregationRangeSelection(streamAggregationRangeParam),
    [streamAggregationRangeParam],
  );
  const aggregationRangeSelection =
    parsedAggregationRangeSelection ??
    DEFAULT_STREAM_AGGREGATION_RANGE_SELECTION;

  useEffect(() => {
    if (!selectedStreamName) {
      return;
    }

    if (parseStreamFollowMode(streamFollowParam) !== null) {
      return;
    }

    void setStreamFollowParam(STREAM_FOLLOW_MODE_DEFAULT);
  }, [selectedStreamName, setStreamFollowParam, streamFollowParam]);

  useEffect(() => {
    if (!selectedStreamName) {
      return;
    }

    if (!isAggregationPanelOpen) {
      if (streamAggregationRangeParam != null) {
        void setStreamAggregationRangeParam(null);
      }

      return;
    }

    if (parsedAggregationRangeSelection !== null) {
      return;
    }

    void setStreamAggregationRangeParam(
      serializeAggregationRangeSelection(
        DEFAULT_STREAM_AGGREGATION_RANGE_SELECTION,
      ),
    );
  }, [
    isAggregationPanelOpen,
    selectedStreamName,
    setStreamAggregationRangeParam,
    parsedAggregationRangeSelection,
    streamAggregationRangeParam,
  ]);

  if (isLoading) {
    return (
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
        data-testid="stream-view-root"
      >
        <StudioHeader />
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          data-testid="stream-view-content"
        >
          <LoadingState />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
        data-testid="stream-view-root"
      >
        <StudioHeader />
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          data-testid="stream-view-content"
        >
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
            Stream metadata is unavailable right now.
          </div>
        </div>
      </div>
    );
  }

  if (streamParam == null) {
    return (
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
        data-testid="stream-view-root"
      >
        <StudioHeader />
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          data-testid="stream-view-content"
        >
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
            Select a stream from the sidebar to browse its events.
          </div>
        </div>
      </div>
    );
  }

  if (selectedStream == null) {
    return (
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
        data-testid="stream-view-root"
      >
        <StudioHeader />
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          data-testid="stream-view-content"
        >
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
            This stream could not be found. Refresh the Streams list and try
            again.
          </div>
        </div>
      </div>
    );
  }

  return (
    <ActiveStreamView
      followMode={followMode}
      isAggregationPanelOpen={isAggregationPanelOpen}
      rangeSelection={aggregationRangeSelection}
      searchParam={searchParam}
      selectedStream={selectedStream}
      setSearchParam={setSearchParam}
      setStreamAggregationRangeParam={setStreamAggregationRangeParam}
      setStreamAggregationsParam={setStreamAggregationsParam}
      setStreamFollowParam={setStreamFollowParam}
      setStreamRoutingKeyParam={setStreamRoutingKeyParam}
      streamAggregationRangeParam={streamAggregationRangeParam}
      streamRoutingKeyParam={streamRoutingKeyParam}
    />
  );
}
