import { describe, expect, it } from "vitest";

import {
  buildObservabilityScaleSeed,
  parseScaleSeedArgs,
} from "./seed-streams-scale";

describe("parseScaleSeedArgs", () => {
  it("parses the reusable scale-seed CLI options", () => {
    const options = parseScaleSeedArgs([
      "--streams-url",
      "http://127.0.0.1:55591",
      "--batches=12",
      "--seed",
      "42",
      "--spacing-ms",
      "1000",
      "--now",
      "2026-06-11T12:00:00.000Z",
    ]);

    expect(options).toEqual({
      batches: 12,
      now: new Date("2026-06-11T12:00:00.000Z"),
      randomSeed: 42,
      spacingMs: 1000,
      streamsServerUrl: "http://127.0.0.1:55591",
    });
  });

  it("requires a streams URL", () => {
    const originalStreamsUrl = process.env.STREAMS_URL;
    const originalStudioStreamsUrl = process.env.STUDIO_STREAMS_URL;

    try {
      delete process.env.STREAMS_URL;
      delete process.env.STUDIO_STREAMS_URL;

      expect(() => parseScaleSeedArgs(["--batches", "2"])).toThrow(
        /Missing --streams-url/,
      );
    } finally {
      process.env.STREAMS_URL = originalStreamsUrl;
      process.env.STUDIO_STREAMS_URL = originalStudioStreamsUrl;
    }
  });
});

describe("buildObservabilityScaleSeed", () => {
  it("builds deterministic multi-batch observability data", () => {
    const seed = buildObservabilityScaleSeed({
      batches: 3,
      now: new Date("2026-06-11T12:00:00.000Z"),
      randomSeed: 99,
      spacingMs: 60_000,
    });
    const requestIds = new Set(
      seed.events.map((event) => event.requestId).filter(Boolean),
    );

    expect(seed.events.length).toBe(36);
    expect(seed.spans.length).toBe(168);
    expect(requestIds.size).toBe(36);
    expect(seed.events[0]?.timestamp).toBe("2026-06-11T11:58:50.000Z");
    expect(seed.events.at(-1)?.timestamp).toBe("2026-06-11T11:24:00.000Z");
  });
});
