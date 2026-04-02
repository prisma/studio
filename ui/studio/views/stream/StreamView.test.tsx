import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioStreamDetails } from "../../../hooks/use-stream-details";
import { StreamView } from "./StreamView";

interface MockNavigationState {
  searchParam: string | null;
  streamAggregationRangeParam: string | null;
  streamAggregationsParam: string | null;
  streamFollowParam: string | null;
  streamParam: string | null;
}

const {
  useNavigationMock,
  useStreamAggregationsMock,
  useStreamDetailsMock,
  useStreamEventsMock,
  useStreamEventSearchMock,
  useStreamsMock,
} = vi.hoisted(() => ({
  useNavigationMock: vi.fn<() => Partial<MockNavigationState>>(),
  useStreamAggregationsMock: vi.fn<
    (args: {
      aggregationRollups?: Array<{
        dimensions: string[];
        intervals: string[];
        measures: Array<{
          kind: "count" | "summary" | "summary_parts";
          name: string;
        }>;
        name: string;
      }>;
      enabled?: boolean;
      liveUpdatesEnabled?: boolean;
      rangeSelection: {
        duration?: string;
        fromIso?: string;
        kind: "absolute" | "relative";
        toIso?: string;
      };
      streamName?: string | null;
    }) => {
      aggregations: Array<{
        coverage: {
          indexFamiliesUsed: string[];
          indexedSegments: number;
          scannedSegments: number;
          scannedTailDocs: number;
          usedRollups: boolean;
        };
        from: string;
        interval: string;
        rollupName: string;
        series: Array<{
          availableStatistics: Array<
            "avg" | "count" | "max" | "min" | "p50" | "p95" | "p99"
          >;
          id: string;
          kind: "count" | "summary" | "summary_parts";
          label: string;
          measureName: string;
          points: Array<{
            end: string;
            start: string;
            statistics: {
              avg: number | null;
              count: number | null;
              max: number | null;
              min: number | null;
              p50: number | null;
              p95: number | null;
              p99: number | null;
            };
          }>;
          rollupName: string;
          statisticValues: {
            avg: number | null;
            count: number | null;
            max: number | null;
            min: number | null;
            p50: number | null;
            p95: number | null;
            p99: number | null;
          };
          subtitle: string | null;
          unit: string | null;
        }>;
        to: string;
      }>;
      error: Error | null;
      isError: boolean;
      isFetching: boolean;
      isLoading: boolean;
      refetch: () => Promise<void>;
    }
  >(),
  useStreamDetailsMock: vi.fn<
    (args?: { refreshIntervalMs?: number; streamName?: string | null }) => {
      details: StudioStreamDetails | null;
    }
  >(),
  useStreamEventsMock: vi.fn<
    (args: {
      liveUpdatesEnabled?: boolean;
      pageCount: number;
      pageSize?: number;
      searchConfig?: unknown;
      searchQuery?: string;
      searchVisibleResultCount?: bigint;
      stream: { name: string; nextOffset: string } | null;
      visibleEventCount?: bigint;
    }) => {
      collection: null;
      events: Array<{
        body: unknown;
        exactTimestamp: string | null;
        id: string;
        indexedFields: Array<{ id: string; label: string; value?: string }>;
        key: string | null;
        offset: string;
        preview: string;
        sequence: string;
        sizeBytes: number;
        sortOffset: string;
        streamName: string;
      }>;
      hasHiddenNewerEvents: boolean;
      hasMoreEvents: boolean;
      hiddenNewerEventCount: bigint;
      isFetching: boolean;
      matchedEventCount: bigint | null;
      pageSize: number;
      queryScopeKey: string;
      refetch: () => Promise<void>;
      totalEventCount: bigint;
      visibleEventCount: bigint;
    }
  >(),
  useStreamEventSearchMock: vi.fn(),
  useStreamsMock: vi.fn<
    (args?: { refreshIntervalMs?: number }) => {
      isError: boolean;
      isLoading: boolean;
      streams: Array<{
        createdAt: string;
        epoch: number;
        expiresAt: string | null;
        name: string;
        nextOffset: string;
        sealedThrough: string;
        uploadedThrough: string;
      }>;
    }
  >(),
}));

const uiStateValues = new Map<string, unknown>();
const navigationStateValues = new Map<
  keyof MockNavigationState,
  string | null
>();

vi.mock("../../../hooks/use-navigation", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  function useMockNavigationParamState(key: keyof MockNavigationState) {
    const initialValue = useNavigationMock()[key] ?? null;
    const [value, setValue] = React.useState<string | null>(() => {
      if (!navigationStateValues.has(key)) {
        navigationStateValues.set(key, initialValue);
      }

      return navigationStateValues.get(key) ?? null;
    });

    const setSharedValue = (
      updater: string | null | ((previous: string | null) => string | null),
    ) => {
      const previousValue = navigationStateValues.get(key) ?? null;
      const nextValue =
        typeof updater === "function" ? updater(previousValue) : updater;

      navigationStateValues.set(key, nextValue);
      setValue(nextValue);

      return Promise.resolve(new URLSearchParams());
    };

    return [value, setSharedValue] as const;
  }

  return {
    useNavigation: () => {
      const [searchParam, setSearchParam] =
        useMockNavigationParamState("searchParam");
      const [streamAggregationRangeParam, setStreamAggregationRangeParam] =
        useMockNavigationParamState("streamAggregationRangeParam");
      const [streamAggregationsParam, setStreamAggregationsParam] =
        useMockNavigationParamState("streamAggregationsParam");
      const [streamFollowParam, setStreamFollowParam] =
        useMockNavigationParamState("streamFollowParam");
      const [streamParam, setStreamParam] =
        useMockNavigationParamState("streamParam");

      return {
        searchParam,
        setSearchParam,
        setStreamAggregationRangeParam,
        setStreamAggregationsParam,
        setStreamFollowParam,
        setStreamParam,
        streamAggregationRangeParam,
        streamAggregationsParam,
        streamFollowParam,
        streamParam,
      };
    },
  };
});

vi.mock("../../../hooks/use-stream-events", () => ({
  STREAM_EVENTS_PAGE_SIZE: 50,
  useStreamEvents: useStreamEventsMock,
}));

vi.mock("../../../hooks/use-stream-details", () => ({
  useStreamDetails: (args?: {
    refreshIntervalMs?: number;
    streamName?: string | null;
  }) => useStreamDetailsMock(args),
}));

vi.mock("../../../hooks/use-stream-aggregations", () => ({
  STREAM_AGGREGATION_QUICK_RANGES: [
    {
      duration: "5m",
      label: "Last 5 minutes",
    },
    {
      duration: "15m",
      label: "Last 15 minutes",
    },
    {
      duration: "30m",
      label: "Last 30 minutes",
    },
    {
      duration: "1h",
      label: "Last 1 hour",
    },
    {
      duration: "3h",
      label: "Last 3 hours",
    },
    {
      duration: "6h",
      label: "Last 6 hours",
    },
    {
      duration: "12h",
      label: "Last 12 hours",
    },
    {
      duration: "24h",
      label: "Last 24 hours",
    },
    {
      duration: "2d",
      label: "Last 2 days",
    },
    {
      duration: "7d",
      label: "Last 7 days",
    },
    {
      duration: "all",
      label: "All",
    },
  ] as const,
  useStreamAggregations: useStreamAggregationsMock,
}));

vi.mock("../../../hooks/use-streams", () => ({
  useStreams: (args?: { refreshIntervalMs?: number }) => useStreamsMock(args),
}));

vi.mock("./use-stream-event-search", () => ({
  useStreamEventSearch: useStreamEventSearchMock,
}));

vi.mock("../../../hooks/use-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useUiState: <T,>(key: string | undefined, initialValue: T) => {
      const [value, setValue] = React.useState<T>(() => {
        if (key && !uiStateValues.has(key)) {
          uiStateValues.set(key, initialValue);
        }

        return key
          ? ((uiStateValues.get(key) as T | undefined) ?? initialValue)
          : initialValue;
      });

      const setSharedValue = React.useCallback(
        (updater: T | ((previous: T) => T)) => {
          setValue((previous) => {
            const nextValue =
              typeof updater === "function"
                ? (updater as (previous: T) => T)(previous)
                : updater;

            if (key) {
              uiStateValues.set(key, nextValue);
            }

            return nextValue;
          });
        },
        [key],
      );

      const resetValue = React.useCallback(() => {
        if (key) {
          uiStateValues.set(key, initialValue);
        }

        setValue(initialValue);
      }, [initialValue, key]);

      return [value, setSharedValue, resetValue] as const;
    },
  };
});

vi.mock("../../StudioHeader", () => ({
  StudioHeader: ({
    children,
    endContent,
  }: {
    children?: React.ReactNode;
    endContent?: React.ReactNode;
  }) => (
    <div data-testid="studio-header">
      <div>{children}</div>
      <div>{endContent}</div>
    </div>
  ),
}));

vi.mock("@/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function click(element: Element) {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

function pointerDownLeft(element: Element) {
  const PointerEventConstructor =
    globalThis.PointerEvent ?? globalThis.MouseEvent;

  element.dispatchEvent(
    new PointerEventConstructor("pointerdown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      ctrlKey: false,
    }),
  );
}

function setInputValue(element: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(element, value);

  element.dispatchEvent(
    new Event("input", {
      bubbles: true,
    }),
  );
  element.dispatchEvent(
    new Event("change", {
      bubbles: true,
    }),
  );
}

function setStreamViewTestNextOffset(nextOffset: bigint) {
  (
    globalThis as unknown as {
      __streamViewTestSetNextOffset: (nextOffset: bigint) => void;
    }
  ).__streamViewTestSetNextOffset(nextOffset);
}

function getNavigationStateValue(key: keyof MockNavigationState) {
  return navigationStateValues.get(key) ?? null;
}

function createStreamDetails(
  overrides?: Partial<
    NonNullable<ReturnType<typeof useStreamDetailsMock>["details"]>
  >,
) {
  return {
    aggregationCount: 0,
    aggregationRollups: [],
    contentType: "application/json",
    createdAt: "2026-03-24T14:42:38.890Z",
    epoch: 0,
    expiresAt: null,
    indexStatus: null,
    lastAppendAt: "2026-03-24T14:42:39.890Z",
    lastSegmentCutAt: "2026-03-24T14:42:40.890Z",
    name: "prisma-wal",
    nextOffset: "2",
    objectStoreRequests: null,
    pendingBytes: 128n,
    pendingRows: 3n,
    search: null,
    sealedThrough: "-1",
    segmentCount: 0,
    storage: null,
    totalSizeBytes: 1_536n,
    uploadedSegmentCount: 0,
    uploadedThrough: "-1",
    walBytes: 256n,
    ...overrides,
  };
}

function createSearchDetails() {
  return createStreamDetails({
    search: {
      aliases: {
        req: "requestId",
      },
      defaultFields: [
        {
          field: "message",
        },
      ],
      fields: {
        eventTime: {
          aggregatable: false,
          bindings: [
            {
              jsonPointer: "/headers/timestamp",
              version: 1,
            },
          ],
          column: true,
          exact: true,
          exists: true,
          kind: "date",
          positions: false,
          prefix: false,
          sortable: true,
        },
        message: {
          aggregatable: false,
          bindings: [
            {
              jsonPointer: "/message",
              version: 1,
            },
          ],
          column: false,
          exact: false,
          exists: true,
          kind: "text",
          positions: true,
          prefix: false,
          sortable: false,
        },
        requestId: {
          aggregatable: false,
          bindings: [
            {
              jsonPointer: "/requestId",
              version: 1,
            },
          ],
          column: false,
          exact: true,
          exists: true,
          kind: "keyword",
          positions: false,
          prefix: true,
          sortable: false,
        },
        tenant: {
          aggregatable: false,
          bindings: [
            {
              jsonPointer: "/indexedFields/tenant",
              version: 1,
            },
          ],
          column: false,
          exact: true,
          exists: true,
          kind: "keyword",
          positions: false,
          prefix: false,
          sortable: false,
        },
      },
      primaryTimestampField: "eventTime",
    },
  });
}

function installDynamicScrollMetrics(
  container: HTMLElement,
  scrollContainer: HTMLDivElement,
  initialScrollTop: number,
) {
  Object.defineProperties(scrollContainer, {
    clientHeight: {
      configurable: true,
      value: 400,
    },
    scrollHeight: {
      configurable: true,
      get() {
        const eventRowCount = container.querySelectorAll(
          '[data-testid^="stream-event-row-"]',
        ).length;
        const buttonHeight = container.querySelector(
          '[data-testid="stream-new-events-row"]',
        )
          ? 48
          : 0;

        return 120 + buttonHeight + eventRowCount * 44;
      },
    },
    scrollTop: {
      configurable: true,
      value: initialScrollTop,
      writable: true,
    },
  });
}

describe("StreamView", () => {
  beforeEach(() => {
    uiStateValues.clear();
    navigationStateValues.clear();
    let currentNextOffset = 2n;
    let lastPolledNextOffset = currentNextOffset;
    useNavigationMock.mockReturnValue({
      searchParam: null,
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: null,
      streamParam: "prisma-wal",
    });
    useStreamsMock.mockReturnValue({
      isError: false,
      isLoading: false,
      streams: [],
    });
    useStreamDetailsMock.mockImplementation(
      (args?: { refreshIntervalMs?: number; streamName?: string | null }) => {
        if (!args?.streamName) {
          return {
            details: null,
          };
        }

        if (args.refreshIntervalMs) {
          lastPolledNextOffset = currentNextOffset;
        }

        return {
          details: createStreamDetails({
            name: args.streamName,
            nextOffset: lastPolledNextOffset.toString(),
          }),
        };
      },
    );
    useStreamAggregationsMock.mockReturnValue({
      aggregations: [],
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(() => Promise.resolve()),
    });
    useStreamEventsMock.mockImplementation(
      ({
        searchQuery,
        searchVisibleResultCount,
        pageCount,
        stream,
        visibleEventCount,
      }: {
        pageCount: number;
        searchQuery?: string;
        searchVisibleResultCount?: bigint;
        stream: { name: string; nextOffset: string } | null;
        visibleEventCount?: bigint;
      }) => {
        const latestEventCount = stream
          ? BigInt(stream.nextOffset)
          : currentNextOffset;
        const latestMatchedEventCount = searchQuery ? 2n : null;
        const resolvedVisibleEventCount = searchQuery
          ? (searchVisibleResultCount ?? 2n)
          : (visibleEventCount ?? latestEventCount);
        const hiddenNewerEventCount = searchQuery
          ? latestMatchedEventCount != null &&
            latestMatchedEventCount > resolvedVisibleEventCount
            ? latestMatchedEventCount - resolvedVisibleEventCount
            : 0n
          : latestEventCount > resolvedVisibleEventCount
            ? latestEventCount - resolvedVisibleEventCount
            : 0n;
        const eventCount = Number(
          searchQuery
            ? latestMatchedEventCount != null &&
              latestMatchedEventCount < resolvedVisibleEventCount
              ? latestMatchedEventCount
              : resolvedVisibleEventCount
            : resolvedVisibleEventCount,
        );
        const events = Array.from({ length: eventCount }, (_unused, index) => {
          const sequenceBase = searchQuery
            ? (latestMatchedEventCount ?? resolvedVisibleEventCount)
            : resolvedVisibleEventCount;
          const sequence = sequenceBase - BigInt(index);

          if (sequence === 2n) {
            return {
              body: {
                headers: {
                  timestamp: "2026-03-24T14:42:48.875Z",
                },
                message: "retry scheduled",
                requestId: "req_2",
                value: {
                  id: "org_skyline",
                },
              },
              exactTimestamp: "2026-03-24T14:42:48.875Z",
              id: `prisma-wal:event:${pageCount}:2`,
              indexedFields: [],
              key: null,
              offset: "offset-2",
              preview: '{"id":"org_skyline"}',
              sequence: "2",
              sizeBytes: 1200,
              sortOffset: "offset-2",
              streamName: "prisma-wal",
            };
          }

          if (sequence === 1n) {
            return {
              body: {
                headers: {
                  timestamp: "2026-03-24T14:42:39.098Z",
                },
                indexedFields: {
                  tenant: "acme",
                },
                key: "org_northwind",
                message: "card declined again",
                requestId: "req_1",
                value: {
                  id: "org_northwind",
                },
              },
              exactTimestamp: "2026-03-24T14:42:39.098Z",
              id: `prisma-wal:event:${pageCount}:1`,
              indexedFields: [
                {
                  id: "indexed:0:tenant:acme",
                  label: "tenant",
                  value: "acme",
                },
              ],
              key: "org_northwind",
              offset: "offset-1",
              preview: '{"id":"org_northwind"}',
              sequence: "1",
              sizeBytes: 48,
              sortOffset: "offset-1",
              streamName: "prisma-wal",
            };
          }

          return {
            body: {
              headers: {
                timestamp: "2026-03-24T14:42:48.875Z",
              },
              message: `synthetic-${sequence.toString()}`,
              requestId: `req_${sequence.toString()}`,
              value: {
                id: `synthetic-${sequence.toString()}`,
              },
            },
            exactTimestamp: "2026-03-24T14:42:48.875Z",
            id: `prisma-wal:event:${pageCount}:${sequence.toString()}`,
            indexedFields: [],
            key: null,
            offset: `offset-${sequence.toString()}`,
            preview: `{"id":"synthetic-${sequence.toString()}"}`,
            sequence: sequence.toString(),
            sizeBytes: 96,
            sortOffset: `offset-${sequence.toString()}`,
            streamName: "prisma-wal",
          };
        });

        return {
          collection: null,
          events,
          hasHiddenNewerEvents: hiddenNewerEventCount > 0n,
          hasMoreEvents: pageCount < 2,
          hiddenNewerEventCount,
          isFetching: false,
          matchedEventCount: latestMatchedEventCount,
          pageSize: 50,
          queryScopeKey: `scope:${pageCount}:${resolvedVisibleEventCount.toString()}`,
          refetch: vi.fn(() => Promise.resolve()),
          totalEventCount: latestEventCount,
          visibleEventCount: resolvedVisibleEventCount,
        };
      },
    );
    useStreamEventSearchMock.mockImplementation(
      (args: { searchTerm?: string | null }) => ({
        acceptSearchSuggestion: vi.fn(),
        closeRowSearch: vi.fn(),
        isRowSearchOpen: true,
        isSearchInputInvalid: false,
        openRowSearch: vi.fn(),
        rowSearchInputRef: {
          current: null,
        },
        searchInput: args.searchTerm ?? "",
        searchSuggestions: [],
        searchValidationMessage: null,
        setSearchInput: vi.fn(),
      }),
    );

    Object.assign(globalThis, {
      __streamViewTestSetNextOffset(nextOffset: bigint) {
        currentNextOffset = nextOffset;
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
    delete (
      globalThis as {
        __streamViewTestSetNextOffset?: (nextOffset: bigint) => void;
      }
    ).__streamViewTestSetNextOffset;
  });

  it("does not mount event or aggregation hooks when no stream is selected", () => {
    useNavigationMock.mockReturnValue({
      searchParam: null,
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: null,
      streamParam: null,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(container.textContent).toContain(
      "Select a stream from the sidebar to browse its events.",
    );
    expect(useStreamEventsMock).not.toHaveBeenCalled();
    expect(useStreamAggregationsMock).not.toHaveBeenCalled();
  });

  it("renders stream event summary columns and keeps only one row expanded at a time", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(container.textContent).toContain("Time");
    expect(container.textContent).toContain("Key");
    expect(container.textContent).toContain("Indexed");
    expect(container.textContent).toContain("Preview");
    expect(container.textContent).toContain("Size");
    expect(container.textContent).toContain("org_northwind");
    expect(container.textContent).toContain("tenant: acme");
    expect(container.textContent).toContain("1.2 KB");
    expect(container.textContent).not.toContain('"id": "org_skyline"');
    const headerCells = container.querySelectorAll(
      '[data-testid="stream-header-row"] > span',
    );

    expect(headerCells[0]?.className).toContain("pl-4");
    expect(headerCells[1]?.className).toContain("pl-4");
    expect(headerCells[2]?.className).toContain("pl-4");
    expect(headerCells[3]?.className).toContain("pl-4");
    expect(headerCells[4]?.className).toContain("pr-4");

    const newerRow = container.querySelector(
      '[data-testid="stream-event-row-2"]',
    );
    const olderRow = container.querySelector(
      '[data-testid="stream-event-row-1"]',
    );

    expect(newerRow).not.toBeNull();
    expect(olderRow).not.toBeNull();

    act(() => {
      if (newerRow) {
        click(newerRow);
      }
    });

    expect(container.textContent).toContain('"id": "org_skyline"');

    act(() => {
      if (olderRow) {
        click(olderRow);
      }
    });

    expect(container.textContent).toContain('"id": "org_northwind"');
    expect(container.textContent).not.toContain('"id": "org_skyline"');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the shared search control only for searchable streams and passes the query into stream events", () => {
    useNavigationMock.mockReturnValue({
      searchParam: "req:req_*",
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: null,
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createSearchDetails(),
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Global search"]',
    );

    expect(searchInput?.value).toBe("req:req_*");
    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        searchConfig: createSearchDetails().search,
        searchQuery: "req:req_*",
        searchVisibleResultCount: 50n,
      }),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not mount the stream search hook for streams without search support", () => {
    useNavigationMock.mockReturnValue({
      searchParam: "metric:test",
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "tail",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        search: null,
      }),
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(useStreamEventSearchMock).not.toHaveBeenCalled();
    expect(
      container.querySelector('button[aria-label="Global search"]'),
    ).toBeNull();
    expect(
      container.querySelector('input[aria-label="Global search"]'),
    ).toBeNull();
    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        searchConfig: null,
        searchQuery: "",
      }),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("highlights matched fields and values in the expanded event", () => {
    useNavigationMock.mockReturnValue({
      searchParam: "req:req_1 has:tenant",
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: null,
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createSearchDetails(),
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const row = container.querySelector('[data-testid="stream-event-row-1"]');

    act(() => {
      if (row) {
        click(row);
      }
    });

    const marks = Array.from(
      container.querySelectorAll("mark[data-search-match], mark"),
    ).map((mark) => mark.textContent);

    expect(marks).toContain('"requestId"');
    expect(marks).toContain("req_1");
    expect(marks).toContain('"tenant"');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("requests an older tail window when the list scrolls near the bottom", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 520,
      },
      scrollTop: {
        configurable: true,
        value: 200,
        writable: true,
      },
    });

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    const pageCounts = useStreamEventsMock.mock.calls.map(
      (call) => call[0]?.pageCount ?? 0,
    );

    expect(pageCounts).toContain(1);
    expect(pageCounts).toContain(2);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not yank a tailing stream back to the top after the user scrolls down", () => {
    useNavigationMock.mockReturnValue({
      searchParam: null,
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "tail",
      streamParam: "prisma-wal",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 900,
      },
      scrollTop: {
        configurable: true,
        value: 200,
        writable: true,
      },
    });

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    expect(scrollContainer.scrollTop).toBe(200);

    act(() => {
      root.render(<StreamView />);
    });

    expect(scrollContainer.scrollTop).toBe(200);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("requests more filtered results when a searched stream scrolls near the bottom", () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"process.rss.bytes"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "tail",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createSearchDetails(),
    });
    useStreamEventsMock.mockImplementation(
      ({
        searchQuery,
        searchVisibleResultCount,
        stream,
      }: {
        searchQuery?: string;
        searchVisibleResultCount?: bigint;
        stream: { name: string; nextOffset: string } | null;
      }) => {
        const resolvedVisibleResultCount = searchQuery
          ? (searchVisibleResultCount ?? 50n)
          : 0n;
        const eventCount = Number(resolvedVisibleResultCount);

        return {
          collection: null,
          events: Array.from({ length: eventCount }, (_unused, index) => ({
            body: {
              headers: {
                timestamp: "2026-03-24T14:42:48.875Z",
              },
              message: `synthetic-${index + 1}`,
              metric: "process.rss.bytes",
              value: {
                id: `synthetic-${index + 1}`,
              },
            },
            exactTimestamp: "2026-03-24T14:42:48.875Z",
            id: `${stream?.name ?? "prisma-wal"}:search:${index + 1}`,
            indexedFields: [],
            key: null,
            offset: `offset-${index + 1}`,
            preview: `{"id":"synthetic-${index + 1}"}`,
            sequence: String(eventCount - index),
            sizeBytes: 96,
            sortOffset: `offset-${index + 1}`,
            streamName: stream?.name ?? "prisma-wal",
          })),
          hasHiddenNewerEvents: false,
          hasMoreEvents: resolvedVisibleResultCount < 100n,
          hiddenNewerEventCount: 0n,
          isFetching: false,
          matchedEventCount: 150n,
          pageSize: 50,
          queryScopeKey: `search-scope:${resolvedVisibleResultCount.toString()}`,
          refetch: vi.fn(() => Promise.resolve()),
          totalEventCount: 150n,
          visibleEventCount: resolvedVisibleResultCount,
        };
      },
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 520,
      },
      scrollTop: {
        configurable: true,
        value: 200,
        writable: true,
      },
    });

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        pageCount: 1,
        searchQuery: 'metric:"process.rss.bytes"',
        searchVisibleResultCount: 100n,
      }),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not load older filtered pages from tail's programmatic pin-to-top scroll", async () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"process.rss.bytes"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "tail",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createSearchDetails(),
    });
    let hasHiddenNewMatches = false;
    useStreamEventsMock.mockImplementation(
      ({
        searchVisibleResultCount,
        stream,
      }: {
        searchVisibleResultCount?: bigint;
        stream: { name: string; nextOffset: string } | null;
      }) => {
        const resolvedVisibleResultCount = searchVisibleResultCount ?? 50n;
        const eventCount = Number(resolvedVisibleResultCount);

        return {
          collection: null,
          events: Array.from({ length: eventCount }, (_unused, index) => {
            const sequence = 300n - BigInt(index);

            return {
              body: {
                headers: {
                  timestamp: "2026-03-24T14:42:48.875Z",
                },
                metric: "process.rss.bytes",
                value: {
                  id: `synthetic-${sequence.toString()}`,
                },
              },
              exactTimestamp: "2026-03-24T14:42:48.875Z",
              id: `${stream?.name ?? "prisma-wal"}:search:${sequence.toString()}`,
              indexedFields: [],
              key: null,
              offset: `offset-${sequence.toString()}`,
              preview: `{"id":"synthetic-${sequence.toString()}"}`,
              sequence: sequence.toString(),
              sizeBytes: 96,
              sortOffset: `offset-${sequence.toString()}`,
              streamName: stream?.name ?? "prisma-wal",
            };
          }),
          hasHiddenNewerEvents: hasHiddenNewMatches,
          hasMoreEvents: true,
          hiddenNewerEventCount: hasHiddenNewMatches ? 1n : 0n,
          isFetching: false,
          matchedEventCount: hasHiddenNewMatches ? 231n : 230n,
          pageSize: 50,
          queryScopeKey: `search-scope:${resolvedVisibleResultCount.toString()}`,
          refetch: vi.fn(() => Promise.resolve()),
          totalEventCount: 230n,
          visibleEventCount: resolvedVisibleResultCount,
        };
      },
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 520,
      },
      scrollTop: {
        configurable: true,
        value: 200,
        writable: true,
      },
    });

    const scrollToMock = vi.fn(
      (optionsOrX?: ScrollToOptions | number, y?: number) => {
        if (typeof optionsOrX === "number") {
          scrollContainer.scrollTop = typeof y === "number" ? y : optionsOrX;
        } else if (typeof optionsOrX?.top === "number") {
          scrollContainer.scrollTop = optionsOrX.top;
        }

        scrollContainer.dispatchEvent(
          new Event("scroll", {
            bubbles: true,
          }),
        );
      },
    );
    scrollContainer.scrollTo = scrollToMock;

    await act(async () => {
      hasHiddenNewMatches = true;
      root.render(<StreamView />);
      await Promise.resolve();
    });

    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        searchVisibleResultCount: 51n,
      }),
    );
    expect(
      useStreamEventsMock.mock.calls.some(
        (call) => (call[0]?.searchVisibleResultCount ?? 0n) > 51n,
      ),
    ).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not show the stream-start message while older filtered results are still loading", () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"process.rss.bytes"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "tail",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createSearchDetails(),
    });
    useStreamEventsMock.mockImplementation(
      ({
        searchQuery,
        searchVisibleResultCount,
        stream,
      }: {
        searchQuery?: string;
        searchVisibleResultCount?: bigint;
        stream: { name: string; nextOffset: string } | null;
      }) => {
        const resolvedVisibleResultCount = searchQuery
          ? (searchVisibleResultCount ?? 50n)
          : 0n;
        const eventCount = 50;

        return {
          collection: null,
          events: Array.from({ length: eventCount }, (_unused, index) => ({
            body: {
              headers: {
                timestamp: "2026-03-24T14:42:48.875Z",
              },
              message: `synthetic-${index + 1}`,
              metric: "process.rss.bytes",
              value: {
                id: `synthetic-${index + 1}`,
              },
            },
            exactTimestamp: "2026-03-24T14:42:48.875Z",
            id: `${stream?.name ?? "prisma-wal"}:search:${index + 1}`,
            indexedFields: [],
            key: null,
            offset: `offset-${index + 1}`,
            preview: `{"id":"synthetic-${index + 1}"}`,
            sequence: String(eventCount - index),
            sizeBytes: 96,
            sortOffset: `offset-${index + 1}`,
            streamName: stream?.name ?? "prisma-wal",
          })),
          hasHiddenNewerEvents: false,
          hasMoreEvents: resolvedVisibleResultCount < 100n,
          hiddenNewerEventCount: 0n,
          isFetching: resolvedVisibleResultCount >= 100n,
          matchedEventCount: 150n,
          pageSize: 50,
          queryScopeKey: `search-scope:${resolvedVisibleResultCount.toString()}`,
          refetch: vi.fn(() => Promise.resolve()),
          totalEventCount: 150n,
          visibleEventCount: resolvedVisibleResultCount,
        };
      },
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 520,
      },
      scrollTop: {
        configurable: true,
        value: 200,
        writable: true,
      },
    });

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        pageCount: 1,
        searchQuery: 'metric:"process.rss.bytes"',
        searchVisibleResultCount: 100n,
      }),
    );
    expect(container.textContent).not.toContain("Reached the beginning");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the stream-start message after a filtered load resolves with no older results", () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"process.rss.bytes"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "tail",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createSearchDetails(),
    });
    useStreamEventsMock.mockImplementation(
      ({
        searchQuery,
        searchVisibleResultCount,
        stream,
      }: {
        searchQuery?: string;
        searchVisibleResultCount?: bigint;
        stream: { name: string; nextOffset: string } | null;
      }) => {
        const resolvedVisibleResultCount = searchQuery
          ? (searchVisibleResultCount ?? 50n)
          : 0n;
        const eventCount = 50;

        return {
          collection: null,
          events: Array.from({ length: eventCount }, (_unused, index) => ({
            body: {
              headers: {
                timestamp: "2026-03-24T14:42:48.875Z",
              },
              message: `synthetic-${index + 1}`,
              metric: "process.rss.bytes",
              value: {
                id: `synthetic-${index + 1}`,
              },
            },
            exactTimestamp: "2026-03-24T14:42:48.875Z",
            id: `${stream?.name ?? "prisma-wal"}:search:${index + 1}`,
            indexedFields: [],
            key: null,
            offset: `offset-${index + 1}`,
            preview: `{"id":"synthetic-${index + 1}"}`,
            sequence: String(eventCount - index),
            sizeBytes: 96,
            sortOffset: `offset-${index + 1}`,
            streamName: stream?.name ?? "prisma-wal",
          })),
          hasHiddenNewerEvents: false,
          hasMoreEvents: resolvedVisibleResultCount < 100n,
          hiddenNewerEventCount: 0n,
          isFetching: false,
          matchedEventCount: 150n,
          pageSize: 50,
          queryScopeKey: `search-scope:${resolvedVisibleResultCount.toString()}`,
          refetch: vi.fn(() => Promise.resolve()),
          totalEventCount: 150n,
          visibleEventCount: resolvedVisibleResultCount,
        };
      },
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 520,
      },
      scrollTop: {
        configurable: true,
        value: 200,
        writable: true,
      },
    });

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        pageCount: 1,
        searchQuery: 'metric:"process.rss.bytes"',
        searchVisibleResultCount: 100n,
      }),
    );
    expect(container.textContent).toContain("Reached the beginning");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("uses the active stream summary from _details instead of polling the streams list", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(useStreamsMock).not.toHaveBeenCalled();
    expect(useStreamDetailsMock.mock.calls.at(-1)?.[0]).toEqual({
      refreshIntervalMs: 100,
      streamName: "prisma-wal",
    });
    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]?.stream).toEqual(
      expect.objectContaining({
        epoch: 0,
        name: "prisma-wal",
        nextOffset: "2",
      }),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows a capped new-events button and reveals only 50 at a time", () => {
    useNavigationMock.mockReturnValue({
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "live",
      streamParam: "prisma-wal",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      container.querySelector('[data-testid="stream-new-events-button"]'),
    ).toBeNull();

    act(() => {
      setStreamViewTestNextOffset(59n);
      root.render(<StreamView />);
    });

    expect(container.textContent).toContain("50+ new events");
    const headerRow = container.querySelector(
      '[data-testid="stream-header-row"]',
    );
    const buttonRow = container.querySelector(
      '[data-testid="stream-new-events-row"]',
    );

    expect(headerRow).not.toBeNull();
    expect(buttonRow).not.toBeNull();
    expect(buttonRow?.className).toContain("justify-center");
    expect(buttonRow?.className).not.toContain("border-b");
    expect(headerRow?.compareDocumentPosition(buttonRow as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const newEventsButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("50+ new events"),
    );

    expect(newEventsButton).not.toBeUndefined();

    act(() => {
      newEventsButton?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(container.textContent).toContain("7 new events");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("reveals only newly matched filtered events and preserves the search state", () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"process.rss.bytes"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "live",
      streamParam: "__stream_metrics__",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        name: "__stream_metrics__",
        nextOffset: "600",
        search: createSearchDetails().search,
      }),
    });
    let newMatchesArrived = false;
    useStreamEventsMock.mockImplementation(
      ({
        searchQuery,
        searchVisibleResultCount,
        stream,
        visibleEventCount,
      }: {
        searchQuery?: string;
        searchVisibleResultCount?: bigint;
        stream: { name: string; nextOffset: string } | null;
        visibleEventCount?: bigint;
      }) => {
        const isFiltered = Boolean(searchQuery);
        const resolvedVisibleCount = isFiltered
          ? (searchVisibleResultCount ?? 50n)
          : (visibleEventCount ?? 0n);
        const newestSequence = isFiltered
          ? resolvedVisibleCount >= 54n
            ? 504n
            : 500n
          : resolvedVisibleCount;
        const events = Array.from(
          { length: Number(resolvedVisibleCount) },
          (_unused, index) => {
            const sequence = newestSequence - BigInt(index);

            return {
              body: {
                headers: {
                  timestamp: "2026-03-24T14:42:48.875Z",
                },
                message: `synthetic-${sequence.toString()}`,
                requestId: `req_${sequence.toString()}`,
                value: {
                  id: `synthetic-${sequence.toString()}`,
                },
              },
              exactTimestamp: "2026-03-24T14:42:48.875Z",
              id: `__stream_metrics__:event:${sequence.toString()}`,
              indexedFields: [],
              key: null,
              offset: `offset-${sequence.toString()}`,
              preview: `{"id":"synthetic-${sequence.toString()}"}`,
              sequence: sequence.toString(),
              sizeBytes: 96,
              sortOffset: `offset-${sequence.toString()}`,
              streamName: stream?.name ?? "__stream_metrics__",
            };
          },
        );

        return {
          collection: null,
          events,
          hasHiddenNewerEvents:
            isFiltered && newMatchesArrived && resolvedVisibleCount === 50n,
          hasMoreEvents: true,
          hiddenNewerEventCount:
            isFiltered && newMatchesArrived && resolvedVisibleCount === 50n
              ? 4n
              : 0n,
          isFetching: false,
          matchedEventCount: isFiltered
            ? newMatchesArrived
              ? 504n
              : 500n
            : null,
          pageSize: 50,
          queryScopeKey: `search-scope:${resolvedVisibleCount.toString()}`,
          refetch: vi.fn(() => Promise.resolve()),
          totalEventCount: 600n,
          visibleEventCount: resolvedVisibleCount,
        };
      },
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    act(() => {
      newMatchesArrived = true;
      root.render(<StreamView />);
    });

    expect(container.textContent).toContain("4 new events");
    expect(
      container.querySelector('[data-testid="stream-event-row-500"]'),
    ).not.toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-new-events-button"]',
        )
        ?.click();
    });

    expect(getNavigationStateValue("searchParam")).toBe(
      'metric:"process.rss.bytes"',
    );
    expect(
      useStreamEventsMock.mock.calls.at(-1)?.[0]?.searchVisibleResultCount,
    ).toBe(54n);
    expect(
      container.querySelector('[data-testid="stream-event-row-504"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("4 new events");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders compact stream header controls and a footer summary bar", () => {
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        aggregationCount: 1,
        aggregationRollups: [],
        nextOffset: "12345",
        search: createSearchDetails().search,
        totalSizeBytes: 1_610_612_736n,
      }),
    });
    useStreamEventsMock.mockReturnValue({
      collection: null,
      events: [
        {
          body: {
            headers: {
              timestamp: "2026-03-24T14:42:48.875Z",
            },
            message: "retry scheduled",
            requestId: "req_2",
            value: {
              id: "org_skyline",
            },
          },
          exactTimestamp: "2026-03-24T14:42:48.875Z",
          id: "prisma-wal:event:test:2",
          indexedFields: [],
          key: null,
          offset: "offset-2",
          preview: '{"id":"org_skyline"}',
          sequence: "2",
          sizeBytes: 1200,
          sortOffset: "offset-2",
          streamName: "prisma-wal",
        },
        {
          body: {
            headers: {
              timestamp: "2026-03-24T14:42:39.098Z",
            },
            key: "org_northwind",
            message: "card declined again",
            requestId: "req_1",
            value: {
              id: "org_northwind",
            },
          },
          exactTimestamp: "2026-03-24T14:42:39.098Z",
          id: "prisma-wal:event:test:1",
          indexedFields: [],
          key: "org_northwind",
          offset: "offset-1",
          preview: '{"id":"org_northwind"}',
          sequence: "1",
          sizeBytes: 1188,
          sortOffset: "offset-1",
          streamName: "prisma-wal",
        },
      ],
      hasHiddenNewerEvents: false,
      hasMoreEvents: true,
      hiddenNewerEventCount: 0n,
      isFetching: false,
      matchedEventCount: null,
      pageSize: 50,
      queryScopeKey: "stream-scope:compact-footer",
      refetch: vi.fn(() => Promise.resolve()),
      totalEventCount: 12_345n,
      visibleEventCount: 12_345n,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const footerSummary = container.querySelector(
      '[data-testid="stream-summary-panel"]',
    );
    const footer = container.querySelector('[data-testid="stream-footer"]');
    const startControls = container.querySelector(
      '[data-testid="stream-header-start-controls"]',
    );

    expect(
      container.querySelector('[data-testid="stream-summary-badge"]'),
    ).toBeNull();
    const aggregationButton = container.querySelector(
      '[data-testid="stream-aggregations-button"]',
    );

    expect(aggregationButton?.getAttribute("aria-label")).toBe(
      "Toggle aggregations",
    );
    expect(aggregationButton?.textContent?.trim()).toBe("");
    expect(
      startControls?.querySelector('button[aria-label="Global search"]'),
    ).not.toBeNull();
    expect(
      startControls?.querySelector('input[aria-label="Global search"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="stream-header-search-slot"]')
        ?.className,
    ).toContain("flex-1");
    expect(aggregationButton?.className).toContain("size-9");
    expect(
      container.querySelector('[data-testid="stream-follow-mode-toggle"]')
        ?.textContent,
    ).toContain("Paused");
    expect(
      container.querySelector('[data-testid="stream-follow-mode-toggle"]')
        ?.textContent,
    ).toContain("Live");
    expect(
      container.querySelector('[data-testid="stream-follow-mode-toggle"]')
        ?.textContent,
    ).toContain("Tail");
    const pausedFollowButton = container.querySelector(
      '[data-testid="stream-follow-mode-paused"]',
    );
    const liveFollowButton = container.querySelector(
      '[data-testid="stream-follow-mode-live"]',
    );
    const tailFollowButton = container.querySelector(
      '[data-testid="stream-follow-mode-tail"]',
    );

    expect(pausedFollowButton?.getAttribute("title")).toBe(
      "Don't load new events.",
    );
    expect(liveFollowButton?.getAttribute("title")).toBe(
      "Check for new events automatically.",
    );
    expect(tailFollowButton?.getAttribute("title")).toBe(
      "Load and display new events in real time.",
    );
    expect(
      container.querySelector('[data-testid="stream-follow-mode-toggle"]')
        ?.className,
    ).toContain("rounded-sm");
    expect(
      container.querySelector('[data-testid="stream-follow-mode-toggle"]')
        ?.className,
    ).toContain("shadow-none");
    expect(tailFollowButton?.className).toContain(
      "data-[state=on]:bg-background",
    );
    expect(liveFollowButton?.className).toContain("h-8");
    expect(
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-follow-mode-tail"]',
        )
        ?.getAttribute("data-state"),
    ).toBe("on");
    expect(container.textContent).not.toContain(
      "Latest events from the selected stream",
    );
    expect(container.textContent).not.toContain("prisma-wal");
    expect(footerSummary?.textContent).toContain("12,345 events");
    expect(footerSummary?.textContent).toContain("1.5 GB total");
    expect(footerSummary?.className).toContain("tabular-nums");
    expect(footer?.firstElementChild?.className).toContain("justify-start");
    expect(
      container.querySelector('[data-testid="stream-jump-start-button"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="stream-jump-end-button"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Jump to beginning");
    expect(container.textContent).toContain("Jump to end");
    expect(getNavigationStateValue("streamFollowParam")).toBe("tail");
    expect(getNavigationStateValue("streamAggregationsParam")).toBeNull();
    expect(getNavigationStateValue("streamAggregationRangeParam")).toBeNull();

    act(() => {
      startControls
        ?.querySelector<HTMLButtonElement>('button[aria-label="Global search"]')
        ?.click();
    });

    expect(
      startControls?.querySelector('[data-row-search-open="true"]')?.className,
    ).toContain("w-full");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("opens stream diagnostics from the footer summary and shows available storage details", () => {
    useNavigationMock.mockReturnValue({
      searchParam: null,
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "paused",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        indexStatus: {
          bundledCompanions: {
            bytesAtRest: 4_096n,
            fullyIndexedUploadedSegments: false,
            objectCount: 4,
          },
          desiredIndexPlanGeneration: 3,
          exactIndexes: [
            {
              activeRunCount: 1,
              bytesAtRest: 2_048n,
              fullyIndexedUploadedSegments: false,
              indexedSegmentCount: 5,
              kind: "keyword",
              lagMs: 180_000n,
              lagSegments: 3,
              name: "metric",
              objectCount: 3,
              retiredRunCount: 2,
              staleConfiguration: false,
              updatedAt: "2026-03-24T14:43:10.000Z",
            },
          ],
          manifest: {
            generation: 7,
            lastUploadedAt: "2026-03-24T14:43:00.000Z",
            lastUploadedEtag: "etag-7",
            lastUploadedSizeBytes: 512n,
            uploadedGeneration: 7,
          },
          profile: "metrics",
          routingKeyIndex: {
            activeRunCount: 1,
            bytesAtRest: 1_024n,
            configured: true,
            fullyIndexedUploadedSegments: true,
            indexedSegmentCount: 8,
            lagMs: 0n,
            lagSegments: 0,
            objectCount: 1,
            retiredRunCount: 1,
            updatedAt: "2026-03-24T14:42:59.000Z",
          },
          searchFamilies: [
            {
              bytesAtRest: 8_192n,
              contiguousCoveredSegmentCount: 5,
              coveredSegmentCount: 6,
              family: "agg",
              fields: ["metric", "stream"],
              fullyIndexedUploadedSegments: false,
              lagMs: 240_000n,
              lagSegments: 3,
              objectCount: 4,
              planGeneration: 3,
              staleSegmentCount: 2,
              updatedAt: "2026-03-24T14:43:11.000Z",
            },
          ],
          segments: {
            totalCount: 10,
            uploadedCount: 8,
          },
          stream: "prisma-wal",
        },
        objectStoreRequests: {
          byArtifact: [
            {
              artifact: "segments",
              deletes: 0n,
              gets: 2n,
              heads: 1n,
              lists: 0n,
              puts: 5n,
              reads: 3n,
            },
          ],
          deletes: 0n,
          gets: 2n,
          heads: 1n,
          lists: 0n,
          puts: 5n,
          reads: 3n,
        },
        pendingBytes: 512n,
        pendingRows: 9n,
        segmentCount: 10,
        storage: {
          companionFamilies: {
            aggBytes: 256n,
            colBytes: 1_024n,
            ftsBytes: 2_048n,
            mblkBytes: 128n,
          },
          localStorage: {
            companionCacheBytes: 5_408n,
            exactIndexCacheBytes: 64n,
            pendingSealedSegmentBytes: 128n,
            pendingTailBytes: 256n,
            routingIndexCacheBytes: 32n,
            segmentCacheBytes: 512n,
            sqliteSharedTotalBytes: 4_096n,
            totalBytes: 8_192n,
            walRetainedBytes: 2_048n,
          },
          objectStorage: {
            bundledCompanionObjectCount: 4,
            exactIndexObjectCount: 3,
            indexesBytes: 16_384n,
            manifestAndMetaBytes: 768n,
            manifestBytes: 512n,
            routingIndexObjectCount: 1,
            schemaRegistryBytes: 256n,
            segmentObjectCount: 8,
            segmentsBytes: 65_536n,
            totalBytes: 82_688n,
          },
        },
        totalSizeBytes: 1_572_864n,
        uploadedSegmentCount: 8,
        walBytes: 2_048n,
      }),
    });
    useStreamEventsMock.mockReturnValue({
      collection: null,
      events: [],
      hasHiddenNewerEvents: false,
      hasMoreEvents: false,
      hiddenNewerEventCount: 0n,
      isFetching: false,
      matchedEventCount: null,
      pageSize: 50,
      queryScopeKey: "stream-scope:diagnostics",
      refetch: vi.fn(() => Promise.resolve()),
      totalEventCount: 12_345n,
      visibleEventCount: 12_345n,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-summary-panel"]',
        )
        ?.click();
    });

    expect(
      document.body.querySelector('[data-testid="stream-diagnostics-popover"]'),
    ).not.toBeNull();
    expect(
      document.body.querySelector('[data-testid="stream-diagnostics-popover"]')
        ?.className,
    ).toContain("font-sans");
    expect(document.body.textContent).toContain("Stream diagnostics");
    expect(document.body.textContent).toContain("Data ingested");
    expect(document.body.textContent).toContain("Object-store requests");
    expect(document.body.textContent).toContain("Retained WAL");
    expect(document.body.textContent).toContain(
      "This is included in Retained WAL and is not added on top.",
    );
    expect(document.body.textContent).toContain("Object storage");
    expect(document.body.textContent).toContain("Segment index files");
    expect(document.body.textContent).toContain("Exact runs");
    expect(document.body.textContent).toContain("Routing runs");
    expect(document.body.textContent).toContain("Indexes total");
    expect(document.body.textContent).toContain("Manifest");
    expect(document.body.textContent).toContain("Schema");
    expect(document.body.textContent).toContain("Metadata total");
    expect(document.body.textContent).toContain("Segment data");
    expect(document.body.textContent).toContain("Total");
    expect(document.body.textContent).toContain("Search coverage");
    expect(document.body.textContent).toContain("Run accelerators");
    expect(document.body.textContent).toContain("Request accounting");
    expect(document.body.textContent).toContain("Reads total");
    expect(document.body.textContent).toContain("Puts total");
    expect(document.body.textContent).toContain("Requests total");
    expect(document.body.textContent).toContain("segments");
    expect(document.body.textContent).toContain(
      "Waiting for next full 16-segment span",
    );
    expect(document.body.textContent).toContain(
      "Next build at 21 uploaded segments",
    );
    expect(document.body.textContent).toContain("routing key");
    expect(document.body.textContent).toContain("metric");
    expect(document.body.textContent).toContain(
      "GET + HEAD + LIST read-side requests recorded by this Streams process.",
    );
    expect(document.body.textContent).not.toContain("SQLite shared");

    const objectStorageSection = document.body.querySelector(
      '[data-testid="stream-diagnostics-object-storage"]',
    );
    const objectStorageToggle = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="stream-diagnostics-object-storage-toggle"]',
    );
    const localStorageSection = document.body.querySelector(
      '[data-testid="stream-diagnostics-local-storage"]',
    );
    const localStorageToggle = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="stream-diagnostics-local-storage-toggle"]',
    );
    const requestAccountingSection = document.body.querySelector(
      '[data-testid="stream-diagnostics-request-accounting"]',
    );
    const requestAccountingToggle =
      document.body.querySelector<HTMLButtonElement>(
        '[data-testid="stream-diagnostics-request-accounting-toggle"]',
      );

    expect(objectStorageSection?.getAttribute("data-state")).toBe("open");
    expect(objectStorageToggle?.textContent).not.toContain("81 KB");
    expect(localStorageSection?.getAttribute("data-state")).toBe("open");
    expect(localStorageSection?.textContent).toContain("Retained stream data");
    expect(localStorageSection?.textContent).toContain("2.1 KB");
    expect(localStorageSection?.textContent).toContain("Companion cache");
    expect(localStorageSection?.textContent).toContain("5.3 KB");
    expect(localStorageSection?.textContent).toContain("5.9 KB");
    expect(localStorageToggle?.textContent).not.toContain("8.0 KB");
    expect(requestAccountingSection?.getAttribute("data-state")).toBe("open");
    expect(requestAccountingSection?.textContent).toContain("GET");
    expect(requestAccountingSection?.textContent).toContain("HEAD");
    expect(requestAccountingSection?.textContent).toContain("LIST");
    expect(requestAccountingSection?.textContent).toContain("Reads total");
    expect(requestAccountingSection?.textContent).toContain("3");
    expect(requestAccountingSection?.textContent).toContain("Puts total");
    expect(requestAccountingSection?.textContent).toContain("5");
    expect(requestAccountingSection?.textContent).toContain("Requests total");
    expect(requestAccountingSection?.textContent).toContain("8");
    expect(requestAccountingToggle?.textContent).not.toContain("8 requests");

    act(() => {
      objectStorageToggle?.click();
      localStorageToggle?.click();
      requestAccountingToggle?.click();
    });

    expect(objectStorageSection?.getAttribute("data-state")).toBe("closed");
    expect(objectStorageToggle?.textContent).toContain("Object storage");
    expect(objectStorageToggle?.textContent).toContain("81 KB");
    expect(localStorageSection?.getAttribute("data-state")).toBe("closed");
    expect(localStorageToggle?.textContent).toContain("Local storage");
    expect(localStorageToggle?.textContent).toContain("8.0 KB");
    expect(requestAccountingSection?.getAttribute("data-state")).toBe("closed");
    expect(requestAccountingToggle?.textContent).toContain(
      "Request accounting",
    );
    expect(requestAccountingToggle?.textContent).toContain("8 requests");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("hides routing run accelerators when routing is not configured", () => {
    useNavigationMock.mockReturnValue({
      searchParam: null,
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "paused",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        indexStatus: {
          bundledCompanions: {
            bytesAtRest: 0n,
            fullyIndexedUploadedSegments: false,
            objectCount: 0,
          },
          desiredIndexPlanGeneration: 1,
          exactIndexes: [],
          manifest: {
            generation: 0,
            lastUploadedAt: null,
            lastUploadedEtag: null,
            lastUploadedSizeBytes: 0n,
            uploadedGeneration: 0,
          },
          profile: "metrics",
          routingKeyIndex: {
            activeRunCount: 0,
            bytesAtRest: 0n,
            configured: false,
            fullyIndexedUploadedSegments: false,
            indexedSegmentCount: 0,
            lagMs: null,
            lagSegments: 0,
            objectCount: 0,
            retiredRunCount: 0,
            updatedAt: null,
          },
          searchFamilies: [],
          segments: {
            totalCount: 0,
            uploadedCount: 0,
          },
          stream: "prisma-wal",
        },
      }),
    });
    useStreamEventsMock.mockReturnValue({
      collection: null,
      events: [],
      hasHiddenNewerEvents: false,
      hasMoreEvents: false,
      hiddenNewerEventCount: 0n,
      isFetching: false,
      matchedEventCount: null,
      pageSize: 50,
      queryScopeKey: "stream-scope:diagnostics-no-routing",
      refetch: vi.fn(() => Promise.resolve()),
      totalEventCount: 0n,
      visibleEventCount: 0n,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-summary-panel"]',
        )
        ?.click();
    });

    expect(document.body.textContent).not.toContain("routing key");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("omits unavailable lag copy in diagnostics accelerator rows", () => {
    useNavigationMock.mockReturnValue({
      searchParam: null,
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "paused",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        indexStatus: {
          bundledCompanions: {
            bytesAtRest: 0n,
            fullyIndexedUploadedSegments: false,
            objectCount: 0,
          },
          desiredIndexPlanGeneration: 1,
          exactIndexes: [
            {
              activeRunCount: 0,
              bytesAtRest: 0n,
              fullyIndexedUploadedSegments: true,
              indexedSegmentCount: 0,
              kind: "date",
              lagMs: null,
              lagSegments: 0,
              name: "windowStart",
              objectCount: 0,
              retiredRunCount: 0,
              staleConfiguration: false,
              updatedAt: null,
            },
          ],
          manifest: {
            generation: 0,
            lastUploadedAt: null,
            lastUploadedEtag: null,
            lastUploadedSizeBytes: 0n,
            uploadedGeneration: 0,
          },
          profile: "metrics",
          routingKeyIndex: {
            activeRunCount: 0,
            bytesAtRest: 0n,
            configured: false,
            fullyIndexedUploadedSegments: false,
            indexedSegmentCount: 0,
            lagMs: null,
            lagSegments: 0,
            objectCount: 0,
            retiredRunCount: 0,
            updatedAt: null,
          },
          searchFamilies: [],
          segments: {
            totalCount: 0,
            uploadedCount: 0,
          },
          stream: "prisma-wal",
        },
      }),
    });
    useStreamEventsMock.mockReturnValue({
      collection: null,
      events: [],
      hasHiddenNewerEvents: false,
      hasMoreEvents: false,
      hiddenNewerEventCount: 0n,
      isFetching: false,
      matchedEventCount: null,
      pageSize: 50,
      queryScopeKey: "stream-scope:diagnostics-no-unavailable-lag",
      refetch: vi.fn(() => Promise.resolve()),
      totalEventCount: 0n,
      visibleEventCount: 0n,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-summary-panel"]',
        )
        ?.click();
    });

    expect(document.body.textContent).toContain("windowStart");
    expect(document.body.textContent).toContain("Caught up");
    expect(document.body.textContent).not.toContain("Unavailable behind");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders search progress in the footer summary when a stream search is active", () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"process.rss.bytes"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "tail",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        nextOffset: "27482",
        search: createSearchDetails().search,
      }),
    });
    useStreamEventsMock.mockReturnValue({
      collection: null,
      events: Array.from({ length: 150 }, (_unused, index) => {
        const sequence = index === 149 ? 26_282n : 27_481n - BigInt(index);

        return {
          body: {
            headers: {
              timestamp: "2026-03-24T14:42:48.875Z",
            },
            metric: "process.rss.bytes",
            value: {
              id: `synthetic-${sequence.toString()}`,
            },
          },
          exactTimestamp: "2026-03-24T14:42:48.875Z",
          id: `prisma-wal:search:${sequence.toString()}`,
          indexedFields: [],
          key: null,
          offset: `offset-${sequence.toString()}`,
          preview: `{"id":"synthetic-${sequence.toString()}"}`,
          sequence: sequence.toString(),
          sizeBytes: 96,
          sortOffset: `offset-${sequence.toString()}`,
          streamName: "prisma-wal",
        };
      }),
      hasHiddenNewerEvents: false,
      hasMoreEvents: true,
      hiddenNewerEventCount: 0n,
      isFetching: false,
      matchedEventCount: 400n,
      pageSize: 50,
      queryScopeKey: "search-scope:150",
      refetch: vi.fn(() => Promise.resolve()),
      totalEventCount: 27_482n,
      visibleEventCount: 150n,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      container.querySelector('[data-testid="stream-summary-panel"]')
        ?.textContent,
    ).toContain("150 results, scanned 1,200 of 27,482 events");
    expect(
      container.querySelector('[data-testid="stream-summary-panel"]')
        ?.textContent,
    ).not.toContain("total");
    expect(
      container.querySelector<HTMLDivElement>(
        '[data-testid="stream-search-scan-progress"]',
      )?.style.width,
    ).toBe("4.36%");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps search scan progress pinned while the live total keeps updating when no new matches arrive", () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"process.rss.bytes"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "live",
      streamParam: "prisma-wal",
    });
    let currentTotalEventCount = 27_482n;
    useStreamDetailsMock.mockImplementation(() => ({
      details: createStreamDetails({
        nextOffset: currentTotalEventCount.toString(),
        search: createSearchDetails().search,
      }),
    }));
    useStreamEventsMock.mockImplementation(() => ({
      collection: null,
      events: Array.from({ length: 150 }, (_unused, index) => {
        const sequence = index === 149 ? 26_282n : 27_481n - BigInt(index);

        return {
          body: {
            headers: {
              timestamp: "2026-03-24T14:42:48.875Z",
            },
            metric: "process.rss.bytes",
            value: {
              id: `synthetic-${sequence.toString()}`,
            },
          },
          exactTimestamp: "2026-03-24T14:42:48.875Z",
          id: `prisma-wal:search:${sequence.toString()}`,
          indexedFields: [],
          key: null,
          offset: `offset-${sequence.toString()}`,
          preview: `{"id":"synthetic-${sequence.toString()}"}`,
          sequence: sequence.toString(),
          sizeBytes: 96,
          sortOffset: `offset-${sequence.toString()}`,
          streamName: "prisma-wal",
        };
      }),
      hasHiddenNewerEvents: false,
      hasMoreEvents: true,
      hiddenNewerEventCount: 0n,
      isFetching: false,
      matchedEventCount: 400n,
      pageSize: 50,
      queryScopeKey: `search-scope:${currentTotalEventCount.toString()}`,
      refetch: vi.fn(() => Promise.resolve()),
      totalEventCount: currentTotalEventCount,
      visibleEventCount: 150n,
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      container.querySelector('[data-testid="stream-summary-panel"]')
        ?.textContent,
    ).toContain("150 results, scanned 1,200 of 27,482 events");

    currentTotalEventCount = 27_582n;

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      container.querySelector('[data-testid="stream-summary-panel"]')
        ?.textContent,
    ).toContain("150 results, scanned 1,200 of 27,582 events");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("reports the full stream as scanned once a filtered search is exhausted", () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"tieredstore.ingest.queue.requests"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "paused",
      streamParam: "__stream_metrics__",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        name: "__stream_metrics__",
        nextOffset: "50",
        search: createSearchDetails().search,
      }),
    });
    useStreamEventsMock.mockReturnValue({
      collection: null,
      events: Array.from({ length: 9 }, (_unused, index) => {
        const sequence = 49n - BigInt(index * 5);

        return {
          body: {
            headers: {
              timestamp: "2026-03-24T14:42:48.875Z",
            },
            metric: "tieredstore.ingest.queue.requests",
            value: {
              id: `synthetic-${sequence.toString()}`,
            },
          },
          exactTimestamp: "2026-03-24T14:42:48.875Z",
          id: `__stream_metrics__:search:${sequence.toString()}`,
          indexedFields: [],
          key: null,
          offset: `offset-${sequence.toString()}`,
          preview: `{"id":"synthetic-${sequence.toString()}"}`,
          sequence: sequence.toString(),
          sizeBytes: 96,
          sortOffset: `offset-${sequence.toString()}`,
          streamName: "__stream_metrics__",
        };
      }),
      hasHiddenNewerEvents: false,
      hasMoreEvents: false,
      hiddenNewerEventCount: 0n,
      isFetching: false,
      matchedEventCount: 9n,
      pageSize: 50,
      queryScopeKey: "search-scope:9",
      refetch: vi.fn(() => Promise.resolve()),
      totalEventCount: 50n,
      visibleEventCount: 9n,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      container.querySelector('[data-testid="stream-summary-panel"]')
        ?.textContent,
    ).toContain("9 results, scanned 50 of 50 events");
    expect(container.textContent).toContain(
      "Reached the beginning of the stream.",
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("loads older filtered pages only from scroll input and updates the search footer count", () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"process.rss.bytes"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "tail",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        nextOffset: "27482",
        search: createSearchDetails().search,
      }),
    });
    let olderSearchPageLoaded = false;
    useStreamEventsMock.mockImplementation(
      ({ searchVisibleResultCount }: { searchVisibleResultCount?: bigint }) => {
        const resolvedVisibleResultCount = searchVisibleResultCount ?? 50n;
        const loadedResultCount =
          olderSearchPageLoaded && resolvedVisibleResultCount >= 100n
            ? 100
            : 50;

        return {
          collection: null,
          events: Array.from(
            { length: loadedResultCount },
            (_unused, index) => {
              const sequence = 27_481n - BigInt(index);

              return {
                body: {
                  headers: {
                    timestamp: "2026-03-24T14:42:48.875Z",
                  },
                  metric: "process.rss.bytes",
                  value: {
                    id: `synthetic-${sequence.toString()}`,
                  },
                },
                exactTimestamp: "2026-03-24T14:42:48.875Z",
                id: `prisma-wal:search:${sequence.toString()}`,
                indexedFields: [],
                key: null,
                offset: `offset-${sequence.toString()}`,
                preview: `{"id":"synthetic-${sequence.toString()}"}`,
                sequence: sequence.toString(),
                sizeBytes: 96,
                sortOffset: `offset-${sequence.toString()}`,
                streamName: "prisma-wal",
              };
            },
          ),
          hasHiddenNewerEvents: false,
          hasMoreEvents: true,
          hiddenNewerEventCount: 0n,
          isFetching: false,
          matchedEventCount: 400n,
          pageSize: 50,
          queryScopeKey: `search-scope:${resolvedVisibleResultCount.toString()}`,
          refetch: vi.fn(() => Promise.resolve()),
          totalEventCount: 27_482n,
          visibleEventCount: resolvedVisibleResultCount,
        };
      },
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      container.querySelector('[data-testid="stream-search-load-indicator"]'),
    ).toBeNull();

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 520,
      },
      scrollTop: {
        configurable: true,
        value: 200,
        writable: true,
      },
    });

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        searchVisibleResultCount: 100n,
      }),
    );
    expect(
      container.querySelector('[data-testid="stream-summary-panel"]')
        ?.textContent,
    ).toContain("100 results");
    expect(
      container.querySelector('[data-testid="stream-search-load-indicator"]'),
    ).not.toBeNull();

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      container.querySelector('[data-testid="stream-summary-panel"]')
        ?.textContent,
    ).toContain("100 results");
    expect(
      container.querySelector('[data-testid="stream-search-load-indicator"]'),
    ).not.toBeNull();

    olderSearchPageLoaded = true;

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      container.querySelector('[data-testid="stream-search-load-indicator"]'),
    ).toBeNull();

    expect(
      container.querySelector('[data-testid="stream-summary-panel"]')
        ?.textContent,
    ).toContain("100 results");
    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        searchVisibleResultCount: 100n,
      }),
    );

    act(() => {
      root.render(<StreamView />);
    });

    expect(useStreamEventsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        searchVisibleResultCount: 100n,
      }),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not expand filtered tail results when the hook briefly reports all matches as hidden", async () => {
    useNavigationMock.mockReturnValue({
      searchParam: 'metric:"process.rss.bytes"',
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "tail",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        nextOffset: "300",
        search: createSearchDetails().search,
      }),
    });

    let phase = 0;
    useStreamEventsMock.mockImplementation(
      ({
        searchVisibleResultCount,
        stream,
      }: {
        searchVisibleResultCount?: bigint;
        stream: { name: string; nextOffset: string } | null;
      }) => {
        const resolvedVisibleResultCount = searchVisibleResultCount ?? 50n;
        const matchedEventCount = phase === 0 ? 98n : 100n;
        const hiddenNewerEventCount =
          phase === 1 && resolvedVisibleResultCount === 50n
            ? 2n
            : phase >= 2 && resolvedVisibleResultCount === 52n
              ? 100n
              : 0n;
        const eventCount = Number(resolvedVisibleResultCount);

        return {
          collection: null,
          events: Array.from({ length: eventCount }, (_unused, index) => {
            const sequence = 300n - BigInt(index);

            return {
              body: {
                headers: {
                  timestamp: "2026-03-24T14:42:48.875Z",
                },
                metric: "process.rss.bytes",
                value: {
                  id: `synthetic-${sequence.toString()}`,
                },
              },
              exactTimestamp: "2026-03-24T14:42:48.875Z",
              id: `${stream?.name ?? "prisma-wal"}:search:${sequence.toString()}`,
              indexedFields: [],
              key: null,
              offset: `offset-${sequence.toString()}`,
              preview: `{"id":"synthetic-${sequence.toString()}"}`,
              sequence: sequence.toString(),
              sizeBytes: 96,
              sortOffset: `offset-${sequence.toString()}`,
              streamName: stream?.name ?? "prisma-wal",
            };
          }),
          hasHiddenNewerEvents: hiddenNewerEventCount > 0n,
          hasMoreEvents: true,
          hiddenNewerEventCount,
          isFetching: false,
          matchedEventCount,
          pageSize: 50,
          queryScopeKey: `search-scope:${resolvedVisibleResultCount.toString()}`,
          refetch: vi.fn(() => Promise.resolve()),
          totalEventCount: 300n,
          visibleEventCount: resolvedVisibleResultCount,
        };
      },
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<StreamView />);
      await Promise.resolve();
    });

    useStreamEventsMock.mockClear();
    phase = 1;

    await act(async () => {
      root.render(<StreamView />);
      await Promise.resolve();
    });

    expect(
      useStreamEventsMock.mock.calls.some(
        (call) => call[0]?.searchVisibleResultCount === 52n,
      ),
    ).toBe(true);

    useStreamEventsMock.mockClear();
    phase = 2;

    await act(async () => {
      root.render(<StreamView />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      useStreamEventsMock.mock.calls.some(
        (call) => (call[0]?.searchVisibleResultCount ?? 0n) > 52n,
      ),
    ).toBe(false);
    expect(
      container.querySelector('[data-testid="stream-summary-panel"]')
        ?.textContent,
    ).toContain("52 results");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders an aggregation button and panel with range controls when the stream exposes rollups", () => {
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        aggregationCount: 1,
        aggregationRollups: [
          {
            dimensions: ["metric", "unit"],
            intervals: ["1m", "5m", "1h"],
            measures: [
              {
                kind: "summary_parts",
                name: "value",
              },
            ],
            name: "metrics",
          },
        ],
        totalSizeBytes: 1_536n,
      }),
    });
    useStreamAggregationsMock.mockReturnValue({
      aggregations: [
        {
          coverage: {
            indexFamiliesUsed: ["agg"],
            indexedSegments: 4,
            scannedSegments: 0,
            scannedTailDocs: 0,
            usedRollups: true,
          },
          from: "2026-03-27T03:00:00.000Z",
          interval: "1m",
          rollupName: "metrics",
          series: [
            {
              availableStatistics: ["avg", "p95", "p99"],
              id: 'metrics:value:[["metric","process.rss.bytes"],["unit","bytes"]]',
              kind: "summary_parts",
              label: "process.rss.bytes",
              measureName: "value",
              points: [
                {
                  end: "2026-03-27T03:01:00.000Z",
                  start: "2026-03-27T03:00:00.000Z",
                  statistics: {
                    avg: 2_147_483_648,
                    count: 4,
                    max: 4_294_967_296,
                    min: 1_073_741_824,
                    p50: 2_147_483_648,
                    p95: 3_221_225_472,
                    p99: 4_294_967_296,
                  },
                },
                {
                  end: "2026-03-27T03:02:00.000Z",
                  start: "2026-03-27T03:01:00.000Z",
                  statistics: {
                    avg: 2_147_483_648,
                    count: 5,
                    max: 4_294_967_296,
                    min: 1_073_741_824,
                    p50: 2_147_483_648,
                    p95: 3_221_225_472,
                    p99: 4_294_967_296,
                  },
                },
              ],
              rollupName: "metrics",
              statisticValues: {
                avg: 2_147_483_648,
                count: 9,
                max: 4_294_967_296,
                min: 1_073_741_824,
                p50: 2_147_483_648,
                p95: 3_221_225_472,
                p99: 4_294_967_296,
              },
              subtitle: "bytes",
              unit: "bytes",
            },
          ],
          to: "2026-03-27T04:00:00.000Z",
        },
      ],
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(() => Promise.resolve()),
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const viewRoot = container.querySelector<HTMLElement>(
      '[data-testid="stream-view-root"]',
    );
    const viewContent = container.querySelector<HTMLElement>(
      '[data-testid="stream-view-content"]',
    );
    const aggregationButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-aggregations-button"]',
    );

    expect(viewRoot?.className).toContain("overflow-hidden");
    expect(viewContent?.className).toContain("overflow-hidden");
    expect(aggregationButton?.getAttribute("aria-label")).toBe(
      "Toggle aggregations",
    );
    expect(aggregationButton?.textContent?.trim()).toBe("");
    expect(getNavigationStateValue("streamAggregationsParam")).toBeNull();
    expect(
      container.querySelector('[data-testid="stream-aggregations-panel"]'),
    ).toBeNull();

    act(() => {
      aggregationButton?.click();
    });

    expect(
      container.querySelector('[data-testid="stream-aggregations-panel"]'),
    ).not.toBeNull();
    expect(getNavigationStateValue("streamAggregationsParam")).toBe("");
    expect(getNavigationStateValue("streamAggregationRangeParam")).toBe("1h");
    expect(
      container.querySelector('[data-testid="stream-aggregations-scroll-area"]')
        ?.className,
    ).toContain("overflow-x-auto");
    expect(
      container.querySelector('[data-testid="stream-aggregations-scroll-area"]')
        ?.className,
    ).toContain("max-w-full");
    expect(container.textContent).toContain("5 minutes");
    expect(container.textContent).toContain("1 hour");
    expect(container.textContent).toContain("12 hours");
    expect(container.textContent).toContain("process.rss.bytes");
    expect(container.textContent).toContain("GB");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("Average");
    expect(container.textContent).not.toContain("Refreshing aggregation");
    expect(container.querySelector('[role="checkbox"]')).toBeNull();

    const aggregationCards = container.querySelectorAll(
      '[data-testid="stream-aggregation-card"]',
    );
    const aggregationColumns = container.querySelectorAll(
      '[data-testid="stream-aggregation-column"]',
    );
    const scrollContainer = container.querySelector<HTMLElement>(
      '[data-testid="stream-events-scroll-container"]',
    );
    const aggregationPanel = container.querySelector<HTMLElement>(
      '[data-testid="stream-aggregations-panel"]',
    );
    const firstAggregationCard = aggregationCards[0];
    const firstAggregationColumn = aggregationColumns[0];

    expect(firstAggregationCard).not.toBeUndefined();
    expect(firstAggregationColumn?.className).toContain("w-[19rem]");
    expect(firstAggregationColumn?.className).toContain("shrink-0");
    expect(scrollContainer?.className).toContain("overflow-y-auto");
    expect(scrollContainer?.contains(aggregationPanel as Node)).toBe(false);

    const firstAggregationLabel =
      firstAggregationCard?.querySelector<HTMLElement>(
        '[data-testid="stream-aggregation-label"]',
      ) ?? null;
    expect(
      firstAggregationCard?.querySelector(
        '[data-testid="stream-aggregation-unit-trigger"]',
      )?.textContent,
    ).toContain("GB");
    expect(
      firstAggregationCard?.querySelector(
        '[data-testid="stream-aggregation-value"]',
      )?.textContent,
    ).toContain("2");

    const unitTrigger = firstAggregationCard?.querySelector<HTMLButtonElement>(
      '[data-testid="stream-aggregation-unit-trigger"]',
    );
    const statisticMenuTrigger =
      firstAggregationCard?.querySelector<HTMLButtonElement>(
        '[data-testid="stream-aggregation-statistic-trigger"]',
      ) ?? null;

    expect(firstAggregationLabel?.className).toContain("w-full");
    expect(firstAggregationLabel?.className).toContain("truncate");
    expect(unitTrigger).not.toBeNull();
    expect(statisticMenuTrigger).not.toBeNull();
    expect(unitTrigger?.className).not.toContain("transition-all");
    expect(statisticMenuTrigger?.className).not.toContain("transition-all");
    expect(
      Boolean(
        firstAggregationLabel &&
        unitTrigger &&
        (firstAggregationLabel.compareDocumentPosition(unitTrigger) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
      ),
    ).toBe(true);
    expect(
      Boolean(
        unitTrigger &&
        statisticMenuTrigger &&
        (unitTrigger.compareDocumentPosition(statisticMenuTrigger) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
      ),
    ).toBe(true);

    act(() => {
      if (unitTrigger) {
        pointerDownLeft(unitTrigger);
        click(unitTrigger);
      }
    });

    const mbUnitMenuItem = [
      ...document.body.querySelectorAll('[role="menuitemradio"]'),
    ].find((element) => element.textContent?.includes("MB"));

    expect(mbUnitMenuItem).not.toBeUndefined();

    act(() => {
      if (mbUnitMenuItem) {
        pointerDownLeft(mbUnitMenuItem);
        click(mbUnitMenuItem);
      }
    });

    expect(
      firstAggregationCard?.querySelector(
        '[data-testid="stream-aggregation-unit-trigger"]',
      )?.textContent,
    ).toContain("MB");
    expect(
      firstAggregationCard?.querySelector(
        '[data-testid="stream-aggregation-value"]',
      )?.textContent,
    ).toContain("2,048");

    act(() => {
      if (statisticMenuTrigger) {
        pointerDownLeft(statisticMenuTrigger);
        click(statisticMenuTrigger);
      }
    });

    const p99MenuItem = [
      ...document.body.querySelectorAll('[role="menuitemcheckbox"]'),
    ].find((element) => element.textContent?.includes("P99"));

    expect(p99MenuItem).not.toBeUndefined();

    act(() => {
      if (p99MenuItem) {
        pointerDownLeft(p99MenuItem);
        click(p99MenuItem);
      }
    });

    expect(container.textContent).toContain("P99");
    expect(container.textContent).toContain("96");

    act(() => {
      (
        [...container.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("12 hours"),
        ) ?? null
      )?.click();
    });

    expect(useStreamAggregationsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        enabled: true,
        liveUpdatesEnabled: true,
        rangeSelection: {
          duration: "12h",
          kind: "relative",
        },
        streamName: "prisma-wal",
      }),
    );
    expect(getNavigationStateValue("streamAggregationRangeParam")).toBe("12h");
    expect(
      firstAggregationCard?.querySelector(
        '[data-testid="stream-aggregation-unit-trigger"]',
      )?.textContent,
    ).toContain("MB");
    expect(
      [
        ...container.querySelectorAll(
          '[data-testid="stream-aggregation-statistic-text"]',
        ),
      ].some((element) => element.textContent?.includes("P99")),
    ).toBe(true);

    act(() => {
      aggregationButton?.click();
    });

    expect(
      container.querySelector('[data-testid="stream-aggregations-panel"]'),
    ).toBeNull();
    expect(getNavigationStateValue("streamAggregationsParam")).toBeNull();
    expect(getNavigationStateValue("streamAggregationRangeParam")).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps an icon-only aggregation toggle rendered when rollup data resolves into multiple series", async () => {
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        aggregationCount: 1,
        aggregationRollups: [
          {
            dimensions: ["metric", "unit"],
            intervals: ["1m", "5m", "1h"],
            measures: [
              {
                kind: "summary_parts",
                name: "value",
              },
            ],
            name: "metrics",
          },
        ],
        totalSizeBytes: 1_536n,
      }),
    });
    useStreamAggregationsMock.mockReturnValue({
      aggregations: [
        {
          coverage: {
            indexFamiliesUsed: ["agg"],
            indexedSegments: 4,
            scannedSegments: 0,
            scannedTailDocs: 0,
            usedRollups: true,
          },
          from: "2026-03-27T03:00:00.000Z",
          interval: "1m",
          rollupName: "metrics",
          series: [
            {
              availableStatistics: ["avg", "p95"],
              id: 'metrics:value:[["metric","process.rss.bytes"],["unit","bytes"]]',
              kind: "summary_parts",
              label: "process.rss.bytes",
              measureName: "value",
              points: [],
              rollupName: "metrics",
              statisticValues: {
                avg: 2_147_483_648,
                count: 9,
                max: 4_294_967_296,
                min: 1_073_741_824,
                p50: 2_147_483_648,
                p95: 3_221_225_472,
                p99: null,
              },
              subtitle: "bytes",
              unit: "bytes",
            },
            {
              availableStatistics: ["avg", "p95"],
              id: 'metrics:value:[["metric","tieredstore.read.bytes"],["unit","bytes"]]',
              kind: "summary_parts",
              label: "tieredstore.read.bytes",
              measureName: "value",
              points: [],
              rollupName: "metrics",
              statisticValues: {
                avg: 524_288,
                count: 9,
                max: 786_432,
                min: 262_144,
                p50: 524_288,
                p95: 786_432,
                p99: null,
              },
              subtitle: "bytes",
              unit: "bytes",
            },
          ],
          to: "2026-03-27T04:00:00.000Z",
        },
      ],
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(() => Promise.resolve()),
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const aggregationButton = container.querySelector(
      '[data-testid="stream-aggregations-button"]',
    );

    expect(aggregationButton?.getAttribute("aria-label")).toBe(
      "Toggle aggregations",
    );
    expect(aggregationButton?.textContent?.trim()).toBe("");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("defaults to tail and persists follow mode in URL state", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const pausedButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-follow-mode-paused"]',
    );
    const liveButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-follow-mode-live"]',
    );

    expect(pausedButton).not.toBeNull();
    expect(liveButton).not.toBeNull();
    expect(
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-follow-mode-tail"]',
        )
        ?.getAttribute("data-state"),
    ).toBe("on");
    expect(getNavigationStateValue("streamFollowParam")).toBe("tail");
    expect(useStreamsMock).not.toHaveBeenCalled();

    act(() => {
      pausedButton?.click();
    });

    expect(getNavigationStateValue("streamFollowParam")).toBe("paused");
    expect(useStreamDetailsMock.mock.calls.at(-1)?.[0]).toEqual({
      refreshIntervalMs: undefined,
      streamName: "prisma-wal",
    });
    expect(pausedButton?.getAttribute("data-state")).toBe("on");

    act(() => {
      setStreamViewTestNextOffset(60n);
      root.render(<StreamView />);
    });

    expect(
      container.querySelector('[data-testid="stream-new-events-button"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();

    const remountContainer = document.createElement("div");
    document.body.appendChild(remountContainer);
    const remountRoot = createRoot(remountContainer);

    act(() => {
      remountRoot.render(<StreamView />);
    });

    expect(
      remountContainer
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-follow-mode-paused"]',
        )
        ?.getAttribute("data-state"),
    ).toBe("on");
    expect(getNavigationStateValue("streamFollowParam")).toBe("paused");
    expect(useStreamsMock).not.toHaveBeenCalled();

    act(() => {
      remountContainer
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-follow-mode-live"]',
        )
        ?.click();
    });

    expect(getNavigationStateValue("streamFollowParam")).toBe("live");
    expect(useStreamDetailsMock.mock.calls.at(-1)?.[0]).toEqual({
      refreshIntervalMs: 100,
      streamName: "prisma-wal",
    });

    act(() => {
      setStreamViewTestNextOffset(60n);
      remountRoot.render(<StreamView />);
    });

    expect(remountContainer.textContent).toContain("50+ new events");

    act(() => {
      remountRoot.unmount();
    });
    remountContainer.remove();
  });

  it("reflects the URL-backed follow mode selection in the header toggle", () => {
    useNavigationMock.mockReturnValue({
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "paused",
      streamParam: "prisma-wal",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-follow-mode-paused"]',
        )
        ?.getAttribute("data-state"),
    ).toBe("on");
    expect(
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-follow-mode-live"]',
        )
        ?.getAttribute("data-state"),
    ).toBe("off");
    expect(
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-follow-mode-tail"]',
        )
        ?.getAttribute("data-state"),
    ).toBe("off");
    expect(useStreamDetailsMock.mock.calls.at(-1)?.[0]).toEqual({
      refreshIntervalMs: undefined,
      streamName: "prisma-wal",
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("only enables aggregation queries while the panel is open, and then uses follow mode to control auto-refresh", () => {
    useNavigationMock.mockReturnValue({
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "live",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        aggregationCount: 1,
        aggregationRollups: [
          {
            dimensions: ["metric", "unit"],
            intervals: ["1m", "5m", "1h"],
            measures: [
              {
                kind: "summary_parts",
                name: "value",
              },
            ],
            name: "metrics",
          },
        ],
      }),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(useStreamAggregationsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        enabled: false,
        liveUpdatesEnabled: true,
        rangeSelection: {
          duration: "1h",
          kind: "relative",
        },
        streamName: "prisma-wal",
      }),
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[title="Aggregations"]')
        ?.click();
    });

    expect(useStreamAggregationsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        enabled: true,
        liveUpdatesEnabled: true,
        rangeSelection: {
          duration: "1h",
          kind: "relative",
        },
        streamName: "prisma-wal",
      }),
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-follow-mode-paused"]',
        )
        ?.click();
    });

    expect(useStreamAggregationsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        enabled: true,
        liveUpdatesEnabled: false,
        rangeSelection: {
          duration: "1h",
          kind: "relative",
        },
        streamName: "prisma-wal",
      }),
    );
    expect(container.querySelector('[role="checkbox"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps manual aggregation statistic preferences across range changes and remounts", () => {
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        aggregationCount: 1,
        aggregationRollups: [
          {
            dimensions: ["metric", "unit"],
            intervals: ["1m", "5m", "1h"],
            measures: [
              {
                kind: "summary_parts",
                name: "value",
              },
            ],
            name: "metrics",
          },
        ],
        totalSizeBytes: 1_536n,
      }),
    });
    useStreamAggregationsMock.mockImplementation(({ rangeSelection }) => {
      const isTwelveHourRange =
        rangeSelection.kind === "relative" && rangeSelection.duration === "12h";

      return {
        aggregations: [
          {
            coverage: {
              indexFamiliesUsed: ["agg"],
              indexedSegments: 4,
              scannedSegments: 0,
              scannedTailDocs: 0,
              usedRollups: true,
            },
            from: "2026-03-27T03:00:00.000Z",
            interval: isTwelveHourRange ? "1h" : "1m",
            rollupName: "metrics",
            series: [
              {
                availableStatistics: isTwelveHourRange
                  ? ["avg"]
                  : ["avg", "p50"],
                id: 'metrics:value:[["metric","process.rss.bytes"],["unit","bytes"]]',
                kind: "summary_parts",
                label: "process.rss.bytes",
                measureName: "value",
                points: [
                  {
                    end: "2026-03-27T03:01:00.000Z",
                    start: "2026-03-27T03:00:00.000Z",
                    statistics: {
                      avg: 2_147_483_648,
                      count: 4,
                      max: 4_294_967_296,
                      min: 1_073_741_824,
                      p50: isTwelveHourRange ? null : 2_147_483_648,
                      p95: null,
                      p99: null,
                    },
                  },
                ],
                rollupName: "metrics",
                statisticValues: {
                  avg: 2_147_483_648,
                  count: 4,
                  max: 4_294_967_296,
                  min: 1_073_741_824,
                  p50: isTwelveHourRange ? null : 2_147_483_648,
                  p95: null,
                  p99: null,
                },
                subtitle: "bytes",
                unit: "bytes",
              },
            ],
            to: "2026-03-27T04:00:00.000Z",
          },
        ],
        error: null,
        isError: false,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(() => Promise.resolve()),
      };
    });

    const firstContainer = document.createElement("div");
    document.body.appendChild(firstContainer);
    const firstRoot = createRoot(firstContainer);

    act(() => {
      firstRoot.render(<StreamView />);
    });

    act(() => {
      firstContainer
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-aggregations-button"]',
        )
        ?.click();
    });

    expect(getNavigationStateValue("streamAggregationsParam")).toBe("");
    expect(getNavigationStateValue("streamAggregationRangeParam")).toBe("1h");

    const statisticMenuTrigger =
      firstContainer.querySelector<HTMLButtonElement>(
        '[data-testid="stream-aggregation-statistic-trigger"]',
      );

    expect(statisticMenuTrigger).not.toBeNull();

    act(() => {
      if (statisticMenuTrigger) {
        pointerDownLeft(statisticMenuTrigger);
        click(statisticMenuTrigger);
      }
    });

    const p50MenuItem = [
      ...document.body.querySelectorAll('[role="menuitemcheckbox"]'),
    ].find((element) => element.textContent?.includes("P50"));

    expect(p50MenuItem).not.toBeUndefined();

    act(() => {
      if (p50MenuItem) {
        pointerDownLeft(p50MenuItem);
        click(p50MenuItem);
      }
    });

    expect(
      [
        ...firstContainer.querySelectorAll(
          '[data-testid="stream-aggregation-statistic-text"]',
        ),
      ].some((element) => element.textContent?.includes("P50")),
    ).toBe(true);

    act(() => {
      (
        [...firstContainer.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("12 hours"),
        ) ?? null
      )?.click();
    });

    expect(getNavigationStateValue("streamAggregationRangeParam")).toBe("12h");

    expect(
      [
        ...firstContainer.querySelectorAll(
          '[data-testid="stream-aggregation-statistic-text"]',
        ),
      ].some((element) => element.textContent?.includes("P50")),
    ).toBe(true);

    act(() => {
      firstRoot.unmount();
    });
    firstContainer.remove();

    const secondContainer = document.createElement("div");
    document.body.appendChild(secondContainer);
    const secondRoot = createRoot(secondContainer);

    act(() => {
      secondRoot.render(<StreamView />);
    });

    expect(
      secondContainer.querySelector(
        '[data-testid="stream-aggregations-panel"]',
      ),
    ).not.toBeNull();
    expect(secondContainer.textContent).toContain("12 hours");
    expect(
      [
        ...secondContainer.querySelectorAll(
          '[data-testid="stream-aggregation-statistic-text"]',
        ),
      ].some((element) => element.textContent?.includes("P50")),
    ).toBe(true);

    act(() => {
      secondRoot.unmount();
    });
    secondContainer.remove();
  });

  it("supports the all aggregation quick range from the custom popover", () => {
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        aggregationCount: 1,
        aggregationRollups: [
          {
            dimensions: ["metric", "unit"],
            intervals: ["1m", "5m", "1h"],
            measures: [
              {
                kind: "summary_parts",
                name: "value",
              },
            ],
            name: "metrics",
          },
        ],
      }),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-aggregations-button"]',
        )
        ?.click();
    });

    const customRangeButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-aggregations-custom-range-button"]',
    );

    expect(customRangeButton).not.toBeNull();

    act(() => {
      customRangeButton?.click();
    });

    const allRangeButton = [...document.body.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === "All",
    );

    expect(allRangeButton).not.toBeUndefined();

    act(() => {
      if (allRangeButton instanceof HTMLElement) {
        allRangeButton.click();
      }
    });

    expect(useStreamAggregationsMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        rangeSelection: {
          duration: "all",
          kind: "relative",
        },
      }),
    );
    expect(getNavigationStateValue("streamAggregationRangeParam")).toBe("all");
    expect(customRangeButton?.textContent).toContain("All");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps the custom absolute range draft stable while the popover is open across rerenders", () => {
    useNavigationMock.mockReturnValue({
      searchParam: null,
      streamAggregationRangeParam: "1h",
      streamAggregationsParam: "",
      streamFollowParam: "paused",
      streamParam: "prisma-wal",
    });
    useStreamDetailsMock.mockReturnValue({
      details: createStreamDetails({
        aggregationCount: 1,
        aggregationRollups: [
          {
            dimensions: ["metric", "unit"],
            intervals: ["1m", "5m", "1h"],
            measures: [
              {
                kind: "summary_parts",
                name: "value",
              },
            ],
            name: "metrics",
          },
        ],
      }),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-aggregations-custom-range-button"]',
        )
        ?.click();
    });

    const fromDateInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="stream-aggregations-range-from-date"]',
    );
    const fromTimeInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="stream-aggregations-range-from-time"]',
    );
    const toDateInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="stream-aggregations-range-to-date"]',
    );
    const toTimeInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="stream-aggregations-range-to-time"]',
    );

    expect(
      document.body.querySelector(
        '[data-testid="stream-aggregations-custom-range-popover"]',
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector('input[type="datetime-local"]'),
    ).toBeNull();
    expect(fromDateInput).not.toBeNull();
    expect(fromTimeInput).not.toBeNull();
    expect(toDateInput).not.toBeNull();
    expect(toTimeInput).not.toBeNull();

    act(() => {
      if (fromDateInput) {
        setInputValue(fromDateInput, "2024-03-31");
      }
    });

    expect(fromDateInput?.value).toBe("2024-03-31");

    act(() => {
      root.render(<StreamView />);
    });

    expect(
      document.body.querySelector<HTMLInputElement>(
        '[data-testid="stream-aggregations-range-from-date"]',
      )?.value,
    ).toBe("2024-03-31");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps the current viewport anchored when the new-events button appears", () => {
    useNavigationMock.mockReturnValue({
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "live",
      streamParam: "prisma-wal",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    installDynamicScrollMetrics(container, scrollContainer, 120);
    const previousScrollHeight = scrollContainer.scrollHeight;

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    act(() => {
      setStreamViewTestNextOffset(59n);
      root.render(<StreamView />);
    });

    expect(scrollContainer.scrollTop).toBe(
      120 + (scrollContainer.scrollHeight - previousScrollHeight),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps the current viewport anchored when revealing newer events", () => {
    useNavigationMock.mockReturnValue({
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "live",
      streamParam: "prisma-wal",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    installDynamicScrollMetrics(container, scrollContainer, 168);

    act(() => {
      setStreamViewTestNextOffset(59n);
      root.render(<StreamView />);
    });

    scrollContainer.scrollTop = 240;
    const previousScrollHeight = scrollContainer.scrollHeight;

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    const newEventsButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-new-events-button"]',
    );

    expect(newEventsButton).not.toBeNull();

    act(() => {
      newEventsButton?.click();
    });

    expect(scrollContainer.scrollTop).toBe(
      240 + (scrollContainer.scrollHeight - previousScrollHeight),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("animates only the newly revealed rows after clicking the new-events button", () => {
    vi.useFakeTimers();
    useNavigationMock.mockReturnValue({
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "live",
      streamParam: "prisma-wal",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    act(() => {
      setStreamViewTestNextOffset(60n);
      root.render(<StreamView />);
    });

    const newEventsButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-new-events-button"]',
    );

    expect(newEventsButton).not.toBeNull();

    act(() => {
      newEventsButton?.click();
    });

    const newlyRevealedRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-event-row-52"]',
    );
    const previouslyVisibleRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-event-row-2"]',
    );

    expect(newlyRevealedRow?.className).toContain("ps-stream-new-event-flash");
    expect(previouslyVisibleRow?.className).not.toContain(
      "ps-stream-new-event-flash",
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="stream-event-row-52"]',
      )?.className,
    ).not.toContain("ps-stream-new-event-flash");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not auto-load newer events when scrolling to the top", () => {
    useNavigationMock.mockReturnValue({
      streamAggregationRangeParam: null,
      streamAggregationsParam: null,
      streamFollowParam: "live",
      streamParam: "prisma-wal",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    act(() => {
      setStreamViewTestNextOffset(60n);
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 1200,
      },
      scrollTop: {
        configurable: true,
        value: 0,
        writable: true,
      },
    });

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    expect(container.textContent).toContain("50+ new events");

    const latestCall = useStreamEventsMock.mock.calls.at(-1)?.[0];

    expect(latestCall?.pageCount).toBe(1);
    expect(latestCall?.visibleEventCount).toBe(2n);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("automatically reveals new events and pins the list to the top in tail mode", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    installDynamicScrollMetrics(container, scrollContainer, 240);
    scrollContainer.scrollTo = vi.fn(
      (optionsOrX?: ScrollToOptions | number, y?: number) => {
        if (typeof optionsOrX === "number") {
          scrollContainer.scrollTop = typeof y === "number" ? y : optionsOrX;
          return;
        }

        if (typeof optionsOrX?.top === "number") {
          scrollContainer.scrollTop = optionsOrX.top;
        }
      },
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="stream-follow-mode-tail"]',
        )
        ?.click();
    });

    expect(useStreamsMock).not.toHaveBeenCalled();
    expect(useStreamDetailsMock.mock.calls.at(-1)?.[0]).toEqual({
      refreshIntervalMs: 100,
      streamName: "prisma-wal",
    });

    scrollContainer.scrollTop = 240;

    await act(async () => {
      setStreamViewTestNextOffset(60n);
      root.render(<StreamView />);
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="stream-new-events-button"]'),
    ).toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="stream-event-row-52"]',
      )?.className,
    ).toContain("ps-stream-new-event-flash");
    expect(scrollContainer.scrollTop).toBe(0);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
