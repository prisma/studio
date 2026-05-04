import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  QueryInsightsChartPoint,
  QueryInsightsStreamQuery,
} from "./types";
import { useQueryInsightsStream } from "./use-query-insights-stream";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const STREAM_URL =
  "/api/streams/v1/stream/prisma-log?format=json&live=sse&offset=-1&timeout=30s";

type EventSourceCallback = (event: Event) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<
    string,
    Set<EventListenerOrEventListenerObject>
  >();
  readonly url: string;
  closed = false;
  onerror: EventSourceCallback | null = null;
  onmessage: EventSourceCallback | null = null;
  onopen: EventSourceCallback | null = null;
  readyState = 0;
  withCredentials = false;

  constructor(url: string | URL) {
    this.url = String(url);
    MockEventSource.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ) {
    if (!listener) {
      return;
    }

    const listeners = this.listeners.get(type) ?? new Set();

    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close() {
    this.closed = true;
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type) ?? new Set();

    for (const listener of listeners) {
      if (typeof listener === "function") {
        listener.call(this, event);
      } else {
        listener.handleEvent(event);
      }
    }

    return true;
  }

  emit(type: string, data: string) {
    this.dispatchEvent(new MessageEvent(type, { data }));
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ) {
    if (!listener) {
      return;
    }

    this.listeners.get(type)?.delete(listener);
  }
}

function createStreamQuery(
  overrides: Partial<QueryInsightsStreamQuery> = {},
): QueryInsightsStreamQuery {
  return {
    count: 1,
    durationMs: 8,
    groupKey: null,
    maxDurationMs: 8,
    minDurationMs: 8,
    prismaQueryInfo: null,
    queryId: null,
    reads: 0,
    rowsReturned: 1,
    sql: "select * from organizations",
    tables: ["organizations"],
    ts: 1_700_000_000_000,
    visibility: "studio-system",
    ...overrides,
  };
}

function renderHarness(args?: { streamUrl?: string }) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const onChartTicks = vi.fn<(points: QueryInsightsChartPoint[]) => void>();
  const onError = vi.fn<(message: string) => void>();
  const onQueries = vi.fn<(queries: QueryInsightsStreamQuery[]) => void>();

  document.body.appendChild(container);

  function Harness() {
    useQueryInsightsStream({
      onChartTicks,
      onError,
      onQueries,
      streamUrl: args?.streamUrl ?? STREAM_URL,
    });

    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    onChartTicks,
    onError,
    onQueries,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const timeoutMs = 2_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) {
      return;
    }

    await flush();
  }

  throw new Error("Timed out waiting for Query Insights stream state");
}

describe("useQueryInsightsStream", () => {
  let originalEventSource: typeof EventSource | undefined;

  beforeEach(() => {
    originalEventSource = globalThis.EventSource;
    MockEventSource.instances = [];
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      value: MockEventSource,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      value: originalEventSource,
    });
    document.body.innerHTML = "";
  });

  it("loads an initial prisma-log snapshot before subscribing to live rows", async () => {
    const query = createStreamQuery();
    const logEvent = {
      ...query,
      type: "query",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([logEvent]), {
        headers: {
          "content-type": "application/json",
          "stream-next-offset": "0000000000000000003G000000",
        },
      }),
    );
    const harness = renderHarness();

    await waitFor(
      () =>
        harness.onQueries.mock.calls.length === 1 &&
        MockEventSource.instances.length === 1,
    );

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/streams/v1/stream/prisma-log?format=json&offset=-1",
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: {
          accept: "application/json",
        },
      }),
    );
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(harness.onQueries).toHaveBeenCalledWith([query]);
    expect(harness.onChartTicks).toHaveBeenCalledWith([
      {
        avgDurationMs: 8,
        queryCount: 1,
        ts: 1_700_000_000_000,
      },
    ]);
    expect(MockEventSource.instances[0]?.url).toBe(
      "/api/streams/v1/stream/prisma-log?format=json&live=sse&offset=0000000000000000003G000000&timeout=30s",
    );
    expect(harness.onError).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("keeps live streaming when the initial snapshot is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", {
        headers: {
          "stream-next-offset": "00000000000000000000000000",
        },
      }),
    );
    const harness = renderHarness();

    await waitFor(() => MockEventSource.instances.length === 1);

    const liveQuery = createStreamQuery({
      durationMs: 12,
      sql: "select * from incidents",
      tables: ["incidents"],
      ts: 1_700_000_001_000,
    });
    const liveLogEvent = {
      ...liveQuery,
      type: "query",
    };

    act(() => {
      MockEventSource.instances[0]?.emit(
        "data",
        JSON.stringify([liveLogEvent]),
      );
    });

    expect(harness.onQueries).toHaveBeenCalledWith([liveQuery]);
    expect(harness.onChartTicks).toHaveBeenCalledWith([
      {
        avgDurationMs: 12,
        queryCount: 1,
        ts: 1_700_000_001_000,
      },
    ]);
    expect(harness.onError).not.toHaveBeenCalled();

    harness.cleanup();
  });
});
