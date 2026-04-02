import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioStreamSearchConfig } from "./use-stream-details";
import {
  encodeStreamOffset,
  getStreamEventsWindow,
  useStreamEvents,
} from "./use-stream-events";
import type { StudioStream } from "./use-streams";

const useStudioMock = vi.fn<
  () => {
    getOrCreateRowsCollection: <T>(key: string, factory: () => T) => T;
    queryClient: QueryClient;
    streamsUrl?: string;
  }
>();

vi.mock("../studio/context", () => ({
  useStudio: () => useStudioMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createStudioMock(streamsUrl = "/api/streams") {
  const queryClient = new QueryClient();
  const collectionCache = new Map<string, unknown>();

  return {
    getOrCreateRowsCollection<T>(key: string, factory: () => T): T {
      const existingCollection = collectionCache.get(key) as T | undefined;

      if (existingCollection) {
        return existingCollection;
      }

      const nextCollection = factory();
      collectionCache.set(key, nextCollection);

      return nextCollection;
    },
    queryClient,
    streamsUrl,
  };
}

function renderHarness(args: {
  liveUpdatesEnabled?: boolean;
  pageCount?: number;
  pageSize?: number;
  searchConfig?: StudioStreamSearchConfig | null;
  searchQuery?: string;
  searchVisibleResultCount?: bigint;
  stream?: StudioStream | null;
  streamsUrl?: string;
  visibleEventCount?: bigint;
}) {
  const studio = createStudioMock(args.streamsUrl);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let currentArgs = args;

  useStudioMock.mockReturnValue(studio);

  let latestState: ReturnType<typeof useStreamEvents> | undefined;

  function Harness() {
    latestState = useStreamEvents({
      liveUpdatesEnabled: currentArgs.liveUpdatesEnabled,
      pageCount: currentArgs.pageCount ?? 1,
      pageSize: currentArgs.pageSize,
      searchConfig: currentArgs.searchConfig,
      searchQuery: currentArgs.searchQuery,
      searchVisibleResultCount: currentArgs.searchVisibleResultCount,
      stream: currentArgs.stream,
      visibleEventCount: currentArgs.visibleEventCount,
    });

    return null;
  }

  act(() => {
    root.render(
      <QueryClientProvider client={studio.queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      studio.queryClient.clear();
      container.remove();
    },
    getLatestState() {
      return latestState;
    },
    rerender(nextArgs: typeof args) {
      currentArgs = nextArgs;

      act(() => {
        root.render(
          <QueryClientProvider client={studio.queryClient}>
            <Harness />
          </QueryClientProvider>,
        );
      });
    },
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const timeoutMs = 2000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) {
      return;
    }

    await flush();
  }

  throw new Error("Timed out waiting for stream events state");
}

function createStreamPayloadRange(args: { from: number; toExclusive: number }) {
  return Array.from(
    { length: Math.max(0, args.toExclusive - args.from) },
    (_unused, index) => {
      const value = args.from + index;

      return {
        headers: {
          timestamp: new Date(
            Date.UTC(2026, 2, 24, 14, 42, 39 + value),
          ).toISOString(),
        },
        key: String(value),
        value: {
          id: value,
        },
      };
    },
  );
}

function createSearchConfig(): StudioStreamSearchConfig {
  return {
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
            jsonPointer: "/eventTime",
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
    },
    primaryTimestampField: "eventTime",
  };
}

describe("useStreamEvents", () => {
  beforeEach(() => {
    useStudioMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("computes the oldest exclusive offset for the requested tail window", () => {
    expect(
      getStreamEventsWindow({
        epoch: 0,
        visibleEventCount: 516n,
        pageCount: 1,
        pageSize: 25,
      }),
    ).toEqual({
      offset: "000000000000000007NG000000",
      requestedEventCount: 25,
      startExclusiveSequence: 490n,
      totalEventCount: 516n,
    });
  });

  it("loads a tail window and normalizes events into newest-first rows", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            headers: {
              timestamp: "2026-03-24T14:42:39.098Z",
            },
            indexedFields: {
              tenant: "acme",
            },
            key: "org_northwind",
            value: {
              id: "org_northwind",
            },
          },
          {
            value: {
              id: "org_skyline",
            },
            windowEnd: 1774363368875,
          },
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const harness = renderHarness({
      pageCount: 1,
      pageSize: 2,
      stream: {
        createdAt: "2026-03-24T14:42:38.890Z",
        epoch: 0,
        expiresAt: null,
        name: "prisma-wal",
        nextOffset: "3",
        sealedThrough: "-1",
        uploadedThrough: "-1",
      },
      visibleEventCount: 3n,
    });

    await waitFor(() => harness.getLatestState()?.events.length === 2);

    const fetchCall = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];

    expect(fetchCall[0]).toBe(
      `/api/streams/v1/stream/prisma-wal?format=json&offset=${encodeStreamOffset(0, 0n)}`,
    );
    expect(fetchCall[1]?.signal).toBeInstanceOf(AbortSignal);

    const latestState = harness.getLatestState();

    expect(latestState?.events.map((event) => event.sequence)).toEqual([
      "2",
      "1",
    ]);
    expect(latestState?.events[0]).toEqual(
      expect.objectContaining({
        exactTimestamp: "2026-03-24T14:42:48.875Z",
        key: null,
        preview: '{"id":"org_skyline"}',
      }),
    );
    expect(latestState?.events[1]).toEqual(
      expect.objectContaining({
        exactTimestamp: "2026-03-24T14:42:39.098Z",
        indexedFields: [
          {
            id: "indexed:0:tenant:acme",
            label: "tenant",
            value: "acme",
          },
        ],
        key: "org_northwind",
        preview: '{"id":"org_northwind"}',
      }),
    );
    expect(latestState?.events[0]?.sizeBytes).toBeGreaterThan(0);
    expect(latestState?.hasMoreEvents).toBe(true);

    harness.cleanup();
  });

  it("prefers the advertised primary timestamp field over legacy timestamp candidates", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            eventTime: "2011-02-12T10:56:58Z",
            headers: {
              timestamp: "2026-03-24T14:42:39.098Z",
            },
            value: {
              id: "org_skyline",
            },
          },
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const harness = renderHarness({
      pageCount: 1,
      pageSize: 1,
      searchConfig: createSearchConfig(),
      stream: {
        createdAt: "2026-03-24T14:42:38.890Z",
        epoch: 0,
        expiresAt: null,
        name: "gharchive-demo-all",
        nextOffset: "1",
        sealedThrough: "-1",
        uploadedThrough: "-1",
      },
      visibleEventCount: 1n,
    });

    await waitFor(() => harness.getLatestState()?.events.length === 1);

    expect(harness.getLatestState()?.events[0]).toEqual(
      expect.objectContaining({
        exactTimestamp: "2011-02-12T10:56:58.000Z",
      }),
    );

    harness.cleanup();
  });

  it("falls back to legacy timestamp fields when the primary timestamp field is absent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            headers: {
              timestamp: "2026-03-24T14:42:39.098Z",
            },
            value: {
              id: "org_skyline",
            },
          },
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const harness = renderHarness({
      pageCount: 1,
      pageSize: 1,
      searchConfig: createSearchConfig(),
      stream: {
        createdAt: "2026-03-24T14:42:38.890Z",
        epoch: 0,
        expiresAt: null,
        name: "gharchive-demo-all",
        nextOffset: "1",
        sealedThrough: "-1",
        uploadedThrough: "-1",
      },
      visibleEventCount: 1n,
    });

    await waitFor(() => harness.getLatestState()?.events.length === 1);

    expect(harness.getLatestState()?.events[0]).toEqual(
      expect.objectContaining({
        exactTimestamp: "2026-03-24T14:42:39.098Z",
      }),
    );

    harness.cleanup();
  });

  it("keeps the last resolved event window visible while a larger tail window is fetching", async () => {
    let resolveSecondFetch: ((response: Response) => void) | undefined;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(input);

        if (url.endsWith(`offset=${encodeStreamOffset(0, 49n)}`)) {
          return Promise.resolve(
            new Response(
              JSON.stringify(
                createStreamPayloadRange({
                  from: 50,
                  toExclusive: 100,
                }),
              ),
            ),
          );
        }

        if (url.endsWith("offset=-1")) {
          return new Promise((resolve) => {
            resolveSecondFetch = resolve;
          });
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      });
    const stream: StudioStream = {
      createdAt: "2026-03-24T14:42:38.890Z",
      epoch: 0,
      expiresAt: null,
      name: "prisma-wal",
      nextOffset: "100",
      sealedThrough: "-1",
      uploadedThrough: "-1",
    };
    const harness = renderHarness({
      pageCount: 1,
      pageSize: 50,
      stream,
      visibleEventCount: 100n,
    });

    await waitFor(() => harness.getLatestState()?.events.length === 50);

    harness.rerender({
      pageCount: 2,
      pageSize: 50,
      stream,
      visibleEventCount: 100n,
    });

    await waitFor(() => harness.getLatestState()?.isFetching === true);

    expect(harness.getLatestState()?.events).toHaveLength(50);
    expect(harness.getLatestState()?.events[0]?.sequence).toBe("99");

    await act(async () => {
      resolveSecondFetch?.(
        new Response(
          JSON.stringify(
            createStreamPayloadRange({
              from: 0,
              toExclusive: 100,
            }),
          ),
        ),
      );
      await Promise.resolve();
    });

    await waitFor(() => harness.getLatestState()?.events.length === 100);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(harness.getLatestState()?.events[0]?.sequence).toBe("99");
    expect(harness.getLatestState()?.events.at(-1)?.sequence).toBe("0");

    harness.cleanup();
  });

  it("keeps newer events hidden until the visible event count advances", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          createStreamPayloadRange({
            from: 50,
            toExclusive: 120,
          }),
        ),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const harness = renderHarness({
      pageCount: 1,
      pageSize: 50,
      stream: {
        createdAt: "2026-03-24T14:42:38.890Z",
        epoch: 0,
        expiresAt: null,
        name: "prisma-wal",
        nextOffset: "120",
        sealedThrough: "-1",
        uploadedThrough: "-1",
      },
      visibleEventCount: 100n,
    });

    await waitFor(() => harness.getLatestState()?.events.length === 50);

    const fetchCall = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];

    expect(fetchCall[0]).toBe(
      `/api/streams/v1/stream/prisma-wal?format=json&offset=${encodeStreamOffset(0, 49n)}`,
    );
    expect(fetchCall[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(harness.getLatestState()?.events[0]?.sequence).toBe("99");
    expect(harness.getLatestState()?.events.at(-1)?.sequence).toBe("50");
    expect(harness.getLatestState()?.hasHiddenNewerEvents).toBe(true);
    expect(harness.getLatestState()?.hiddenNewerEventCount).toBe(20n);
    expect(harness.getLatestState()?.totalEventCount).toBe(120n);
    expect(harness.getLatestState()?.visibleEventCount).toBe(100n);

    harness.cleanup();
  });

  it("uses the search endpoint with append-order sort and search_after pagination", async () => {
    const firstOffset = encodeStreamOffset(0, 2n);
    const secondOffset = encodeStreamOffset(0, 1n);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input, init) => {
        const url = String(input);

        expect(url).toBe("/api/streams/v1/stream/prisma-wal/_search");
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("content-type")).toBe(
          "application/json",
        );

        const requestBody = JSON.parse(String(init?.body)) as {
          q: string;
          search_after?: unknown[];
          size: number;
          sort: string[];
          track_total_hits: boolean;
        };

        if (!requestBody.search_after) {
          expect(requestBody).toEqual({
            q: "req:req_*",
            size: 1,
            sort: ["offset:desc"],
            track_total_hits: true,
          });

          return Promise.resolve(
            new Response(
              JSON.stringify({
                hits: [
                  {
                    offset: firstOffset,
                    source: {
                      eventTime: "2026-03-25T10:18:23.123Z",
                      message: "card declined again",
                      requestId: "req_3",
                    },
                  },
                ],
                next_search_after: [firstOffset],
                total: {
                  relation: "eq",
                  value: 2,
                },
              }),
            ),
          );
        }

        expect(requestBody).toEqual({
          q: "req:req_*",
          search_after: [firstOffset],
          size: 1,
          sort: ["offset:desc"],
          track_total_hits: false,
        });

        return Promise.resolve(
          new Response(
            JSON.stringify({
              hits: [
                {
                  offset: secondOffset,
                  source: {
                    eventTime: "2026-03-25T10:17:23.123Z",
                    message: "payment retry failed",
                    requestId: "req_2",
                  },
                },
              ],
              next_search_after: null,
              total: {
                relation: "eq",
                value: 2,
              },
            }),
          ),
        );
      });
    const harness = renderHarness({
      pageCount: 1,
      pageSize: 1,
      searchConfig: createSearchConfig(),
      searchQuery: "req:req_*",
      searchVisibleResultCount: 2n,
      stream: {
        createdAt: "2026-03-24T14:42:38.890Z",
        epoch: 0,
        expiresAt: null,
        name: "prisma-wal",
        nextOffset: "5",
        sealedThrough: "-1",
        uploadedThrough: "-1",
      },
    });

    await waitFor(() => harness.getLatestState()?.events.length === 2);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(
      harness.getLatestState()?.events.map((event) => event.offset),
    ).toEqual([firstOffset, secondOffset]);
    expect(
      harness.getLatestState()?.events.map((event) => event.exactTimestamp),
    ).toEqual(["2026-03-25T10:18:23.123Z", "2026-03-25T10:17:23.123Z"]);
    expect(harness.getLatestState()?.hasMoreEvents).toBe(false);
    expect(harness.getLatestState()?.matchedEventCount).toBe(2n);
    expect(harness.getLatestState()?.visibleEventCount).toBe(2n);
    expect(harness.getLatestState()?.totalEventCount).toBe(5n);

    harness.cleanup();
  });

  it("tracks hidden new matches through the search head check in live mode", async () => {
    let searchRequestCount = 0;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input, init) => {
        const requestBody = JSON.parse(String(init?.body)) as { size: number };

        if (searchRequestCount === 0) {
          searchRequestCount += 1;
          expect(requestBody.size).toBe(1);

          return Promise.resolve(
            new Response(
              JSON.stringify({
                hits: [
                  {
                    offset: encodeStreamOffset(0, 4n),
                    source: {
                      eventTime: "2026-03-25T10:18:23.123Z",
                      message: "card declined again",
                      requestId: "req_3",
                    },
                  },
                ],
                next_search_after: null,
                total: {
                  relation: "eq",
                  value: 1,
                },
              }),
            ),
          );
        }

        expect(String(input)).toBe("/api/streams/v1/stream/prisma-wal/_search");
        expect(requestBody.size).toBe(1);

        return Promise.resolve(
          new Response(
            JSON.stringify({
              hits: [
                {
                  offset: encodeStreamOffset(0, 5n),
                  source: {
                    eventTime: "2026-03-25T10:19:23.123Z",
                    message: "card declined yet again",
                    requestId: "req_4",
                  },
                },
              ],
              next_search_after: null,
              total: {
                relation: "eq",
                value: 3,
              },
            }),
          ),
        );
      });
    const harness = renderHarness({
      liveUpdatesEnabled: true,
      pageCount: 1,
      pageSize: 2,
      searchConfig: createSearchConfig(),
      searchQuery: "req:req_*",
      searchVisibleResultCount: 1n,
      stream: {
        createdAt: "2026-03-24T14:42:38.890Z",
        epoch: 0,
        expiresAt: null,
        name: "prisma-wal",
        nextOffset: "6",
        sealedThrough: "-1",
        uploadedThrough: "-1",
      },
    });

    await waitFor(
      () => harness.getLatestState()?.hasHiddenNewerEvents === true,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(harness.getLatestState()?.hiddenNewerEventCount).toBe(2n);
    expect(harness.getLatestState()?.matchedEventCount).toBe(3n);

    harness.cleanup();
  });

  it("does not treat older paginated search results as hidden newer matches", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          hits: [
            {
              offset: encodeStreamOffset(0, 5n),
              source: {
                eventTime: "2026-03-25T10:19:23.123Z",
                message: "card declined again",
                requestId: "req_4",
              },
            },
          ],
          next_search_after: [encodeStreamOffset(0, 5n)],
          total: {
            relation: "eq",
            value: 2,
          },
        }),
      ),
    );
    const harness = renderHarness({
      liveUpdatesEnabled: true,
      pageCount: 1,
      pageSize: 1,
      searchConfig: createSearchConfig(),
      searchQuery: "req:req_*",
      searchVisibleResultCount: 1n,
      stream: {
        createdAt: "2026-03-24T14:42:38.890Z",
        epoch: 0,
        expiresAt: null,
        name: "prisma-wal",
        nextOffset: "6",
        sealedThrough: "-1",
        uploadedThrough: "-1",
      },
    });

    await waitFor(
      () =>
        harness.getLatestState()?.events.length === 1 &&
        harness.getLatestState()?.matchedEventCount === 2n,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(harness.getLatestState()?.hasHiddenNewerEvents).toBe(false);
    expect(harness.getLatestState()?.hiddenNewerEventCount).toBe(0n);
    expect(harness.getLatestState()?.hasMoreEvents).toBe(true);

    harness.cleanup();
  });

  it("switches back to the normal stream read endpoint when search is cleared", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(input);

        if (url.endsWith("/_search")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                hits: [
                  {
                    offset: encodeStreamOffset(0, 3n),
                    source: {
                      eventTime: "2026-03-25T10:18:23.123Z",
                      message: "card declined again",
                      requestId: "req_3",
                    },
                  },
                ],
                next_search_after: null,
                total: {
                  relation: "eq",
                  value: 1,
                },
              }),
            ),
          );
        }

        return Promise.resolve(
          new Response(
            JSON.stringify(
              createStreamPayloadRange({
                from: 0,
                toExclusive: 3,
              }),
            ),
            {
              headers: {
                "content-type": "application/json",
              },
            },
          ),
        );
      });
    const stream = {
      createdAt: "2026-03-24T14:42:38.890Z",
      epoch: 0,
      expiresAt: null,
      name: "prisma-wal",
      nextOffset: "3",
      sealedThrough: "-1",
      uploadedThrough: "-1",
    } satisfies StudioStream;
    const harness = renderHarness({
      pageCount: 1,
      pageSize: 50,
      searchConfig: createSearchConfig(),
      searchQuery: "req:req_*",
      searchVisibleResultCount: 1n,
      stream,
    });

    await waitFor(() => harness.getLatestState()?.events.length === 1);

    const fetchCallCountAfterSearch = fetchSpy.mock.calls.length;

    harness.rerender({
      pageCount: 1,
      pageSize: 50,
      searchConfig: createSearchConfig(),
      searchQuery: "",
      stream,
      visibleEventCount: 3n,
    });

    await waitFor(() => harness.getLatestState()?.events.length === 3);

    const fetchCallsAfterSearch = fetchSpy.mock.calls.slice(
      fetchCallCountAfterSearch,
    );

    expect(fetchCallsAfterSearch.length).toBeGreaterThan(0);
    expect(
      fetchCallsAfterSearch.some(([url]) =>
        String(url).includes("/v1/stream/prisma-wal?format=json&offset="),
      ),
    ).toBe(true);
    expect(
      fetchCallsAfterSearch.some(([url]) => String(url).endsWith("/_search")),
    ).toBe(false);

    harness.cleanup();
  });
});
