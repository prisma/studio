import { Waves } from "lucide-react";
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
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/components/ui/tooltip";
import { cn } from "@/ui/lib/utils";

import { useNavigation } from "../../../hooks/use-navigation";
import { type StreamAggregationRangeSelection } from "../../../hooks/use-stream-aggregations";
import { useStreamDetails } from "../../../hooks/use-stream-details";
import {
  type StudioStreamEvent,
  type StudioStreamEventIndexedField,
  useStreamEvents,
} from "../../../hooks/use-stream-events";
import { useStreams } from "../../../hooks/use-streams";
import { useUiState } from "../../../hooks/use-ui-state";
import { StudioHeader } from "../../StudioHeader";
import { ViewProps } from "../View";
import { StreamAggregationsPanel } from "./StreamAggregationsPanel";

const LOAD_MORE_THRESHOLD_PX = 160;
const NEW_EVENTS_BATCH_SIZE = 50n;
const NEW_EVENTS_HIGHLIGHT_DURATION_MS = 1_800;
const STREAM_COUNT_REFRESH_INTERVAL_MS = 5000;
const DEFAULT_STREAM_AGGREGATION_RANGE_SELECTION = {
  duration: "1h",
  kind: "relative",
} as const satisfies StreamAggregationRangeSelection;

interface ScrollAnchorSnapshot {
  anchorEventId: string | null;
  anchorTop: number;
  firstEventId: string | null;
  hasHiddenNewerEvents: boolean;
  scrollHeight: number;
  scrollTop: number;
  streamIdentity: string | null;
}

function stringifyForExpandedView(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (value === undefined) {
    return "undefined";
  }

  const seen = new WeakSet<object>();

  return (
    JSON.stringify(
      value,
      (_key, currentValue: unknown) => {
        if (typeof currentValue === "bigint") {
          return currentValue.toString();
        }

        if (typeof currentValue === "object" && currentValue !== null) {
          if (seen.has(currentValue)) {
            return "[Circular]";
          }

          seen.add(currentValue);
        }

        return currentValue;
      },
      2,
    ) ?? String(value)
  );
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

function formatNewEventsLabel(count: bigint): string {
  if (count > NEW_EVENTS_BATCH_SIZE) {
    return "50+ new events";
  }

  return `${count.toString()} new events`;
}

function formatIndexedField(field: StudioStreamEventIndexedField): string {
  return field.value ? `${field.label}: ${field.value}` : field.label;
}

function StreamEventRow(props: {
  event: StudioStreamEvent;
  expandedEventId: string | null;
  isNewlyRevealed: boolean;
  onToggle: (eventId: string) => void;
}) {
  const { event, expandedEventId, isNewlyRevealed, onToggle } = props;
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
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate">
                {formatRelativeTime(event.exactTimestamp)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {formatExactTimestamp(event.exactTimestamp)}
            </TooltipContent>
          </Tooltip>
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
            {stringifyForExpandedView(event.body)}
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
      <span>Time</span>
      <span>Key</span>
      <span>Indexed</span>
      <span>Preview</span>
      <span className="text-right">Size</span>
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

export function StreamView(_props: ViewProps) {
  const { streamParam } = useNavigation();
  const { isError, isLoading, streams } = useStreams({
    refreshIntervalMs: streamParam
      ? STREAM_COUNT_REFRESH_INTERVAL_MS
      : undefined,
  });
  const selectedStream = useMemo(
    () => streams.find((stream) => stream.name === streamParam) ?? null,
    [streamParam, streams],
  );
  const selectedStreamIdentity = selectedStream
    ? `${selectedStream.name}:${selectedStream.epoch}`
    : null;
  const [pageCount, setPageCount] = useState(1);
  const [visibleEventCount, setVisibleEventCount] = useState<bigint | null>(
    null,
  );
  const [recentlyRevealedEventIds, setRecentlyRevealedEventIds] = useState<
    string[]
  >([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastResetStreamIdentityRef = useRef<string | null>(null);
  const pendingRevealRef = useRef<{
    batchSize: number;
    previousFirstEventId: string | null;
    streamIdentity: string | null;
  } | null>(null);
  const scrollAnchorSnapshotRef = useRef<ScrollAnchorSnapshot | null>(null);
  const expandedEventStateKey = selectedStream
    ? `stream:${selectedStream.name}:expanded-event`
    : undefined;
  const aggregationPanelStateKey = selectedStream
    ? `stream:${selectedStream.name}:aggregations-open`
    : undefined;
  const aggregationRangeStateKey = selectedStream
    ? `stream:${selectedStream.name}:aggregation-range`
    : undefined;
  const [expandedEventId, setExpandedEventId] = useUiState<string | null>(
    expandedEventStateKey,
    null,
  );
  const [isAggregationPanelOpen, setIsAggregationPanelOpen] =
    useUiState<boolean>(aggregationPanelStateKey, false);
  const [aggregationRangeSelection, setAggregationRangeSelection] =
    useUiState<StreamAggregationRangeSelection>(
      aggregationRangeStateKey,
      DEFAULT_STREAM_AGGREGATION_RANGE_SELECTION,
    );
  const {
    events,
    hasHiddenNewerEvents,
    hasMoreEvents,
    hiddenNewerEventCount,
    isFetching,
    totalEventCount,
  } = useStreamEvents({
    pageCount,
    stream: selectedStream,
    visibleEventCount:
      visibleEventCount ??
      (selectedStream
        ? parseNonNegativeBigInt(selectedStream.nextOffset)
        : undefined),
  });
  const { details: selectedStreamDetails } = useStreamDetails({
    refreshIntervalMs: STREAM_COUNT_REFRESH_INTERVAL_MS,
    streamName: selectedStream?.name,
  });
  const aggregationCount = selectedStreamDetails?.aggregationCount ?? 0;
  const aggregationRollups = selectedStreamDetails?.aggregationRollups ?? [];
  const firstEventId = events[0]?.id ?? null;
  const recentlyRevealedEventIdSet = useMemo(
    () => new Set(recentlyRevealedEventIds),
    [recentlyRevealedEventIds],
  );

  useEffect(() => {
    if (lastResetStreamIdentityRef.current === selectedStreamIdentity) {
      return;
    }

    lastResetStreamIdentityRef.current = selectedStreamIdentity;
    pendingRevealRef.current = null;
    setRecentlyRevealedEventIds([]);
    setVisibleEventCount(
      selectedStream ? parseNonNegativeBigInt(selectedStream.nextOffset) : null,
    );
    setPageCount(1);
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [selectedStream, selectedStreamIdentity]);

  const revealNewerEvents = useCallback(() => {
    if (!selectedStream) {
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
  }, [firstEventId, selectedStream, selectedStreamIdentity]);

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

  const maybeLoadOlderEvents = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer || !hasMoreEvents || isFetching) {
      return;
    }

    if (scrollContainer.clientHeight <= 0) {
      return;
    }

    const distanceToBottom =
      scrollContainer.scrollHeight -
      (scrollContainer.scrollTop + scrollContainer.clientHeight);

    if (distanceToBottom <= LOAD_MORE_THRESHOLD_PX) {
      setPageCount((currentPageCount) => currentPageCount + 1);
    }
  }, [hasMoreEvents, isFetching]);

  useEffect(() => {
    maybeLoadOlderEvents();
  }, [events.length, maybeLoadOlderEvents]);

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

    const currentAnchorRow = getVisibleAnchorRow(scrollContainer);
    currentSnapshot.anchorEventId =
      currentAnchorRow?.dataset.streamEventId ?? null;
    currentSnapshot.anchorTop =
      currentAnchorRow?.getBoundingClientRect().top ?? 0;
    scrollAnchorSnapshotRef.current = currentSnapshot;
  }, [firstEventId, hasHiddenNewerEvents, selectedStreamIdentity]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <StudioHeader
        endContent={
          selectedStream ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge data-testid="stream-summary-badge" variant="secondary">
                {totalEventCount.toString()} events
                {selectedStreamDetails
                  ? `, ${formatBytes(selectedStreamDetails.totalSizeBytes)} total`
                  : ""}
              </Badge>
              {aggregationCount > 0 ? (
                <Button
                  data-testid="stream-aggregations-button"
                  onClick={() => {
                    setIsAggregationPanelOpen((currentValue) => !currentValue);
                  }}
                  size="sm"
                  type="button"
                  variant={isAggregationPanelOpen ? "secondary" : "outline"}
                >
                  {aggregationCount} aggregations
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Waves className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {selectedStream?.name ?? "Stream events"}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedStream
                ? "Latest events from the selected stream"
                : "Select a stream from the sidebar"}
            </p>
          </div>
        </div>
      </StudioHeader>

      <TooltipProvider>
        <div className="flex min-h-0 flex-1 flex-col">
          {isLoading && !selectedStream ? (
            <LoadingState />
          ) : isError ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
              Stream metadata is unavailable right now.
            </div>
          ) : streamParam == null ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
              Select a stream from the sidebar to browse its events.
            </div>
          ) : selectedStream == null ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
              This stream could not be found. Refresh the Streams list and try
              again.
            </div>
          ) : (
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto"
              data-testid="stream-events-scroll-container"
              onScroll={() => {
                recordScrollAnchorSnapshot();
                maybeLoadOlderEvents();
              }}
            >
              {isAggregationPanelOpen && aggregationRollups.length > 0 ? (
                <StreamAggregationsPanel
                  aggregationRollups={aggregationRollups}
                  onRangeSelectionChange={setAggregationRangeSelection}
                  rangeSelection={aggregationRangeSelection}
                  streamName={selectedStream.name}
                />
              ) : null}

              {isFetching && events.length === 0 ? (
                <LoadingState />
              ) : events.length === 0 ? (
                <div className="flex min-h-full items-center justify-center px-6 py-10 text-sm text-muted-foreground">
                  This stream does not contain any events yet.
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
                        isNewlyRevealed={recentlyRevealedEventIdSet.has(
                          event.id,
                        )}
                        onToggle={(eventId) => {
                          setExpandedEventId((currentValue) =>
                            currentValue === eventId ? null : eventId,
                          );
                        }}
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

                    {!hasMoreEvents ? (
                      <div className="py-2 text-center text-xs text-muted-foreground">
                        Reached the beginning of the stream.
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
