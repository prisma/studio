import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getObserveLookupForStreamEvent,
  normalizeObserveRequestResponse,
  parseStreamObserveParam,
  resolveObserveStreams,
  serializeStreamObserveParam,
  type StudioObserveLookup,
  useStreamObserveRequest,
} from "./use-stream-observe-request";

const useStudioMock = vi.fn<
  () => {
    streamsUrl?: string;
  }
>();

vi.mock("../studio/context", () => ({
  useStudio: () => useStudioMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OBSERVE_RESPONSE_FIXTURE = {
  coverage: {
    events: {
      complete: true,
      hits: 1,
      index_families_used: [],
      limit_reached: false,
      searched: true,
      timed_out: false,
      total: { relation: "eq", value: 1 },
    },
    traces: {
      complete: false,
      hits: 3,
      index_families_used: [],
      limit_reached: false,
      searched: true,
      timed_out: false,
      total: { relation: "eq", value: 3 },
    },
    warnings: ["trace search coverage incomplete"],
  },
  evlog: {
    matches: [
      {
        offset: "0000000000000000000G000000",
        source: { message: "Payment failed" },
      },
    ],
    primary: {
      duration: 234,
      fix: "Retry with a different card.",
      level: "error",
      message: "Payment failed",
      method: "POST",
      path: "/api/checkout",
      requestId: "req_8f2k",
      service: "checkout",
      spanId: "086e83747d0e381e",
      status: 402,
      timestamp: "2026-06-11T14:20:00.000Z",
      traceId: "5b8efff798038103d269b633813fc60c",
      why: "Card declined by issuer",
    },
    stream: "app-events",
  },
  lookup: {
    requestId: "req_8f2k",
    spanId: null,
    traceId: "5b8efff798038103d269b633813fc60c",
  },
  summary: {
    duration: 234,
    endTime: "2026-06-11T14:20:00.234Z",
    environment: "production",
    error: {
      fix: "Retry with a different card.",
      isError: true,
      link: null,
      message: "card declined",
      type: null,
      why: "Card declined by issuer",
    },
    level: "error",
    method: "POST",
    path: "/api/checkout",
    route: "/api/checkout",
    service: "checkout",
    startTime: "2026-06-11T14:20:00.000Z",
    status: 402,
    title: "Payment failed",
  },
  timeline: [
    {
      duration: 234,
      ids: {
        requestId: "req_8f2k",
        spanId: "086e83747d0e381e",
        traceId: "5b8efff798038103d269b633813fc60c",
      },
      kind: "evlog.event",
      service: "checkout",
      severity: "error",
      source: {
        offset: "0000000000000000000G000000",
        profile: "evlog",
        stream: "app-events",
      },
      time: "2026-06-11T14:20:00.000Z",
      title: "Payment failed",
    },
    {
      duration: 234,
      ids: {
        parentSpanId: null,
        spanId: "086e83747d0e381e",
        traceId: "5b8efff798038103d269b633813fc60c",
      },
      kind: "otel.span.start",
      service: "checkout",
      severity: "error",
      source: { profile: "otel-traces", stream: "app-traces" },
      time: "2026-06-11T14:20:00.000Z",
      title: "POST /api/checkout",
    },
  ],
  trace: {
    criticalPath: ["086e83747d0e381e", "22dd83747d0e3822"],
    duplicateSpans: 1,
    errors: [
      {
        message: "Card declined by issuer",
        name: "POST payments /charges",
        service: "payments",
        spanId: "22dd83747d0e3822",
        time: "2026-06-11T14:20:00.041Z",
        type: "CardDeclinedError",
      },
    ],
    missingParents: [],
    partial: false,
    rootSpanId: "086e83747d0e381e",
    serviceMap: [
      {
        count: 1,
        errorCount: 1,
        from: "checkout",
        latency: { count: 1, max: 151, min: 151, sum: 151 },
        to: "payments",
      },
    ],
    spans: [
      { name: "POST /api/checkout", spanId: "086e83747d0e381e" },
      { name: "POST payments /charges", spanId: "22dd83747d0e3822" },
    ],
    stream: "app-traces",
    traceId: "5b8efff798038103d269b633813fc60c",
    tree: [
      {
        children: [
          {
            children: [],
            depth: 1,
            duration: 151,
            endTime: "2026-06-11T14:20:00.192Z",
            kind: "client",
            name: "POST payments /charges",
            parentSpanId: "086e83747d0e381e",
            service: "payments",
            spanId: "22dd83747d0e3822",
            startTime: "2026-06-11T14:20:00.041Z",
            statusCode: "error",
          },
        ],
        depth: 0,
        duration: 234,
        endTime: "2026-06-11T14:20:00.234Z",
        kind: "server",
        name: "POST /api/checkout",
        parentSpanId: null,
        service: "checkout",
        spanId: "086e83747d0e381e",
        startTime: "2026-06-11T14:20:00.000Z",
        statusCode: "error",
      },
    ],
  },
};

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

  throw new Error("Timed out waiting for observe request state");
}

function renderHarness(args: {
  eventsStream: string | null;
  lookup: StudioObserveLookup | null;
  tracesStream: string | null;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  let latestState: ReturnType<typeof useStreamObserveRequest> | undefined;

  function Harness() {
    latestState = useStreamObserveRequest(args);

    return null;
  }

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      queryClient.clear();
      container.remove();
    },
    getLatestState() {
      return latestState;
    },
  };
}

describe("stream observe param serialization", () => {
  it("round-trips request, trace, and span lookups", () => {
    const lookups: StudioObserveLookup[] = [
      { kind: "requestId", value: "req_8f2k" },
      { kind: "traceId", value: "5b8efff798038103d269b633813fc60c" },
      { kind: "spanId", value: "086e83747d0e381e" },
    ];

    for (const lookup of lookups) {
      expect(
        parseStreamObserveParam(serializeStreamObserveParam(lookup)),
      ).toEqual(lookup);
    }

    expect(serializeStreamObserveParam(lookups[0]!)).toBe("req:req_8f2k");
  });

  it("rejects malformed params", () => {
    expect(parseStreamObserveParam(null)).toBeNull();
    expect(parseStreamObserveParam("")).toBeNull();
    expect(parseStreamObserveParam("req:")).toBeNull();
    expect(parseStreamObserveParam(":req_8f2k")).toBeNull();
    expect(parseStreamObserveParam("unknown:req_8f2k")).toBeNull();
    expect(parseStreamObserveParam("req_8f2k")).toBeNull();
  });
});

describe("resolveObserveStreams", () => {
  const streams = [
    { name: "app-events", profile: "evlog" },
    { name: "app-traces", profile: "otel-traces" },
    { name: "prisma-wal", profile: "state-protocol" },
  ];

  it("uses the active evlog stream and discovers the trace counterpart", () => {
    expect(
      resolveObserveStreams({
        activeStreamName: "app-events",
        activeStreamProfile: "evlog",
        streams,
      }),
    ).toEqual({
      eventsStream: "app-events",
      tracesStream: "app-traces",
    });
  });

  it("uses the active trace stream and discovers the evlog counterpart", () => {
    expect(
      resolveObserveStreams({
        activeStreamName: "app-traces",
        activeStreamProfile: "otel-traces",
        streams,
      }),
    ).toEqual({
      eventsStream: "app-events",
      tracesStream: "app-traces",
    });
  });

  it("returns no streams for non-observability profiles", () => {
    expect(
      resolveObserveStreams({
        activeStreamName: "prisma-wal",
        activeStreamProfile: "state-protocol",
        streams,
      }),
    ).toEqual({
      eventsStream: null,
      tracesStream: null,
    });
  });

  it("returns a null counterpart when none is discovered", () => {
    expect(
      resolveObserveStreams({
        activeStreamName: "app-events",
        activeStreamProfile: "evlog",
        streams: [{ name: "app-events", profile: "evlog" }],
      }),
    ).toEqual({
      eventsStream: "app-events",
      tracesStream: null,
    });
  });
});

describe("getObserveLookupForStreamEvent", () => {
  it("prefers the request id for evlog events", () => {
    const result = getObserveLookupForStreamEvent({
      body: {
        requestId: "req_8f2k",
        spanId: "086e83747d0e381e",
        traceId: "5b8efff798038103d269b633813fc60c",
      },
      profile: "evlog",
    });

    expect(result.lookup).toEqual({ kind: "requestId", value: "req_8f2k" });
    expect(result.ids.traceId).toBe("5b8efff798038103d269b633813fc60c");
  });

  it("falls back to the trace id for evlog events without a request id", () => {
    const result = getObserveLookupForStreamEvent({
      body: { traceId: "5b8efff798038103d269b633813fc60c" },
      profile: "evlog",
    });

    expect(result.lookup).toEqual({
      kind: "traceId",
      value: "5b8efff798038103d269b633813fc60c",
    });
  });

  it("prefers the trace id for otel span records", () => {
    const result = getObserveLookupForStreamEvent({
      body: {
        requestId: "req_8f2k",
        spanId: "086e83747d0e381e",
        traceId: "5b8efff798038103d269b633813fc60c",
      },
      profile: "otel-traces",
    });

    expect(result.lookup).toEqual({
      kind: "traceId",
      value: "5b8efff798038103d269b633813fc60c",
    });
  });

  it("returns no lookup for non-observability profiles or unusable bodies", () => {
    expect(
      getObserveLookupForStreamEvent({
        body: { requestId: "req_8f2k" },
        profile: "state-protocol",
      }).lookup,
    ).toBeNull();
    expect(
      getObserveLookupForStreamEvent({
        body: "not an object",
        profile: "evlog",
      }).lookup,
    ).toBeNull();
    expect(
      getObserveLookupForStreamEvent({
        body: { message: "no ids" },
        profile: "evlog",
      }).lookup,
    ).toBeNull();
  });
});

describe("normalizeObserveRequestResponse", () => {
  it("normalizes the full response shape", () => {
    const result = normalizeObserveRequestResponse(OBSERVE_RESPONSE_FIXTURE);

    expect(result.summary.title).toBe("Payment failed");
    expect(result.summary.isError).toBe(true);
    expect(result.summary.errorWhy).toBe("Card declined by issuer");
    expect(result.lookup.traceId).toBe("5b8efff798038103d269b633813fc60c");
    expect(result.evlog?.primary?.fix).toBe("Retry with a different card.");
    expect(result.evlog?.matchCount).toBe(1);
    expect(result.trace?.tree).toHaveLength(1);
    expect(result.trace?.tree[0]?.children[0]?.depth).toBe(1);
    expect(result.trace?.spanCount).toBe(2);
    expect(result.trace?.spansById.get("22dd83747d0e3822")).toMatchObject({
      name: "POST payments /charges",
    });
    expect(result.trace?.criticalPath).toEqual([
      "086e83747d0e381e",
      "22dd83747d0e3822",
    ]);
    expect(result.trace?.duplicateSpans).toBe(1);
    expect(result.trace?.errors[0]?.type).toBe("CardDeclinedError");
    expect(result.trace?.serviceMap[0]).toEqual({
      count: 1,
      errorCount: 1,
      from: "checkout",
      to: "payments",
    });
    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[0]?.kind).toBe("evlog.event");
    expect(result.coverage.events?.complete).toBe(true);
    expect(result.coverage.traces?.complete).toBe(false);
    expect(result.coverage.warnings).toEqual([
      "trace search coverage incomplete",
    ]);
  });

  it("tolerates missing sections", () => {
    const result = normalizeObserveRequestResponse({});

    expect(result.summary.title).toBe("Request");
    expect(result.evlog).toBeNull();
    expect(result.trace).toBeNull();
    expect(result.timeline).toEqual([]);
    expect(result.coverage.events).toBeNull();
    expect(result.coverage.warnings).toEqual([]);
  });
});

describe("useStreamObserveRequest", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    useStudioMock.mockReset();
    useStudioMock.mockReturnValue({
      streamsUrl: "/api/streams",
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("posts the lookup to the observe endpoint and normalizes the result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(OBSERVE_RESPONSE_FIXTURE), {
        headers: { "content-type": "application/json" },
      }),
    );
    const harness = renderHarness({
      eventsStream: "app-events",
      lookup: { kind: "requestId", value: "req_8f2k" },
      tracesStream: "app-traces",
    });

    await waitFor(() => harness.getLatestState()?.result != null);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/streams/v1/observe/request");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      include: {
        events: true,
        timeline: true,
        trace: true,
      },
      limits: {
        events: 50,
        spans: 2000,
      },
      lookup: {
        requestId: "req_8f2k",
      },
      streams: {
        events: "app-events",
        traces: "app-traces",
      },
    });
    expect(harness.getLatestState()?.result?.summary.title).toBe(
      "Payment failed",
    );

    harness.cleanup();
    fetchMock.mockRestore();
  });

  it("omits unavailable streams from the request and include flags", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(OBSERVE_RESPONSE_FIXTURE), {
        headers: { "content-type": "application/json" },
      }),
    );
    const harness = renderHarness({
      eventsStream: null,
      lookup: { kind: "traceId", value: "5b8efff798038103d269b633813fc60c" },
      tracesStream: "app-traces",
    });

    await waitFor(() => harness.getLatestState()?.result != null);

    const [, init] = fetchMock.mock.calls[0]!;

    expect(JSON.parse(String(init?.body))).toMatchObject({
      include: {
        events: false,
        trace: true,
      },
      lookup: {
        traceId: "5b8efff798038103d269b633813fc60c",
      },
      streams: {
        traces: "app-traces",
      },
    });

    harness.cleanup();
    fetchMock.mockRestore();
  });

  it("stays idle without a lookup and reports request failures", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 502 }));
    const idleHarness = renderHarness({
      eventsStream: "app-events",
      lookup: null,
      tracesStream: "app-traces",
    });

    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(idleHarness.getLatestState()?.result).toBeNull();
    idleHarness.cleanup();

    const failingHarness = renderHarness({
      eventsStream: "app-events",
      lookup: { kind: "requestId", value: "req_8f2k" },
      tracesStream: "app-traces",
    });

    await waitFor(() => failingHarness.getLatestState()?.isError === true);

    expect(failingHarness.getLatestState()?.error?.message).toContain("502");

    failingHarness.cleanup();
    fetchMock.mockRestore();
  });
});
