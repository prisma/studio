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
    expect(seed.events.length).toBeGreaterThanOrEqual(8);
    expect(seed.spans.length).toBeGreaterThanOrEqual(20);

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
