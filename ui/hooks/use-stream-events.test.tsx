import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  pageCount?: number;
  pageSize?: number;
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
      pageCount: currentArgs.pageCount ?? 1,
      pageSize: currentArgs.pageSize,
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
});
