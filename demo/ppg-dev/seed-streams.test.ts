import { describe, expect, it, vi } from "vitest";

import {
  buildObservabilityStreamSeed,
  DEMO_OBSERVABILITY_EVENTS_STREAM,
  DEMO_OBSERVABILITY_TRACES_STREAM,
  seedObservabilityStreams,
} from "./seed-streams";

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;

function createOkResponse() {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(""),
  };
}

describe("buildObservabilityStreamSeed", () => {
  const now = new Date("2026-06-11T12:00:00.000Z");
  const seed = buildObservabilityStreamSeed({ now });

  it("produces correlated evlog events and otel spans", () => {
    expect(seed.events.length).toBeGreaterThanOrEqual(12);
    expect(seed.spans.length).toBeGreaterThanOrEqual(55);

    const spanTraceIds = new Set(
      seed.spans.map((span) => span.traceId as string),
    );

    for (const traceId of spanTraceIds) {
      expect(traceId).toMatch(TRACE_ID_PATTERN);
    }

    for (const span of seed.spans) {
      expect(span.spanId).toMatch(SPAN_ID_PATTERN);
      expect(typeof span.startUnixNano).toBe("string");
      expect(typeof span.endUnixNano).toBe("string");
    }

    const correlatedEvents = seed.events.filter(
      (event) => typeof event.traceId === "string",
    );

    expect(correlatedEvents.length).toBeGreaterThan(0);

    for (const event of correlatedEvents) {
      expect(spanTraceIds.has(event.traceId as string)).toBe(true);
    }
  });

  it("links root spans back to the evlog request id", () => {
    const rootSpans = seed.spans.filter((span) => span.parentSpanId === null);

    expect(rootSpans.length).toBeGreaterThan(0);

    const eventRequestIds = new Set(
      seed.events.map((event) => event.requestId as string),
    );
    const correlatedRootSpans = rootSpans.filter((span) => {
      const attributes = span.attributes as Record<string, unknown>;

      return typeof attributes["request.id"] === "string";
    });

    expect(correlatedRootSpans.length).toBeGreaterThan(0);

    const correlatedRequestIds = correlatedRootSpans.map((span) => {
      const attributes = span.attributes as Record<string, unknown>;

      return attributes["request.id"] as string;
    });

    expect(
      correlatedRequestIds.some((requestId) => eventRequestIds.has(requestId)),
    ).toBe(true);
  });

  it("includes the documented partial-coverage failure modes", () => {
    const eventOnlyRequests = seed.events.filter(
      (event) => event.traceId === null,
    );
    const eventTraceIds = new Set(
      seed.events
        .map((event) => event.traceId)
        .filter((traceId): traceId is string => typeof traceId === "string"),
    );
    const traceOnlyTraceIds = new Set(
      seed.spans
        .map((span) => span.traceId as string)
        .filter((traceId) => !eventTraceIds.has(traceId)),
    );

    expect(eventOnlyRequests.length).toBeGreaterThan(0);
    expect(traceOnlyTraceIds.size).toBeGreaterThan(0);
  });

  it("includes an error request with root-cause fields", () => {
    const errorEvent = seed.events.find((event) => event.level === "error");

    expect(errorEvent).toBeDefined();
    expect(typeof errorEvent?.why).toBe("string");
    expect(typeof errorEvent?.fix).toBe("string");
  });

  it("includes production-shaped nested traces", () => {
    expect(seed.events.map((event) => event.message)).toEqual(
      expect.arrayContaining([
        "Inventory reservation retried",
        "Query insights snapshot viewed",
        "Workspace dashboard opened",
      ]),
    );

    const snapshotEvent = seed.events.find(
      (event) => event.message === "Query insights snapshot viewed",
    );

    expect(snapshotEvent).toMatchObject({
      duration: 3486,
      method: "POST",
      path: "/api/query-insights/snapshot",
      service: "console",
      status: 200,
    });

    const snapshotTraceId = snapshotEvent?.traceId as string;
    const snapshotSpans = seed.spans.filter(
      (span) => span.traceId === snapshotTraceId,
    );

    expect(snapshotSpans).toHaveLength(19);
    expect(
      snapshotSpans.some(
        (span) => span.name === "postgresql client local-db:5432",
      ),
    ).toBe(true);
    expect(
      snapshotSpans.some(
        (span) => span.name === "Durable Object TENANT_MANAGER",
      ),
    ).toBe(true);

    const rootSpan = snapshotSpans.find((span) => span.parentSpanId === null);

    expect(rootSpan?.name).toBe("fetchHandler POST");
    expect(
      snapshotSpans.filter((span) => span.parentSpanId === rootSpan?.spanId)
        .length,
    ).toBeGreaterThanOrEqual(2);

    const serviceNames = new Set(
      snapshotSpans.map((span) => {
        const resource = span.resource as {
          attributes: Record<string, unknown>;
        };

        return resource.attributes["service.name"];
      }),
    );

    expect(serviceNames.has("console")).toBe(true);
    expect(serviceNames.has("tenant-manager")).toBe(true);

    const localDbSpan = snapshotSpans.find(
      (span) => span.name === "postgresql client local-db:5432",
    );
    const localDbAttributes = localDbSpan?.attributes as Record<
      string,
      unknown
    >;

    expect(localDbAttributes["network.protocol.name"]).toBe("tcp");
    expect(localDbAttributes["server.address"]).toBe("local-db");
    expect(localDbAttributes["server.port"]).toBe(5432);
  });

  it("is deterministic for a fixed seed and time", () => {
    const again = buildObservabilityStreamSeed({ now });

    expect(again).toEqual(seed);
  });
});

describe("seedObservabilityStreams", () => {
  it("creates both profiled streams and appends the seed batches", async () => {
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const fetchImpl = vi.fn(
      (
        url: string,
        init?: {
          body?: string;
          headers?: Record<string, string>;
          method?: string;
        },
      ) => {
        calls.push({ body: init?.body, method: init?.method, url });

        return Promise.resolve(createOkResponse());
      },
    );

    await seedObservabilityStreams({
      fetchImpl,
      now: new Date("2026-06-11T12:00:00.000Z"),
      streamsServerUrl: "http://127.0.0.1:9999/",
    });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `PUT http://127.0.0.1:9999/v1/stream/${DEMO_OBSERVABILITY_EVENTS_STREAM}`,
      `POST http://127.0.0.1:9999/v1/stream/${DEMO_OBSERVABILITY_EVENTS_STREAM}/_profile`,
      `PUT http://127.0.0.1:9999/v1/stream/${DEMO_OBSERVABILITY_TRACES_STREAM}`,
      `POST http://127.0.0.1:9999/v1/stream/${DEMO_OBSERVABILITY_TRACES_STREAM}/_profile`,
      `POST http://127.0.0.1:9999/v1/stream/${DEMO_OBSERVABILITY_EVENTS_STREAM}`,
      `POST http://127.0.0.1:9999/v1/stream/${DEMO_OBSERVABILITY_TRACES_STREAM}`,
    ]);

    const eventsProfileCall = calls[1];
    const tracesProfileCall = calls[3];

    expect(JSON.parse(eventsProfileCall?.body ?? "{}")).toMatchObject({
      profile: {
        kind: "evlog",
        observability: {
          request: {
            tracesStream: DEMO_OBSERVABILITY_TRACES_STREAM,
          },
        },
      },
    });
    expect(JSON.parse(tracesProfileCall?.body ?? "{}")).toMatchObject({
      profile: {
        kind: "otel-traces",
        observability: {
          request: {
            eventsStream: DEMO_OBSERVABILITY_EVENTS_STREAM,
          },
        },
      },
    });

    const eventsAppendCall = calls[4];
    const appendedEvents = JSON.parse(eventsAppendCall?.body ?? "[]") as Array<
      Record<string, unknown>
    >;

    expect(Array.isArray(appendedEvents)).toBe(true);
    expect(appendedEvents.length).toBeGreaterThan(0);
  });

  it("fails loudly when the profile install is rejected", async () => {
    const fetchImpl = vi.fn((url: string, init?: { method?: string }) => {
      if (init?.method === "POST" && url.endsWith("/_profile")) {
        return Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve("profile rejected"),
        });
      }

      return Promise.resolve(createOkResponse());
    });

    await expect(
      seedObservabilityStreams({
        fetchImpl,
        streamsServerUrl: "http://127.0.0.1:9999",
      }),
    ).rejects.toThrow(/profile rejected/);
  });
});
