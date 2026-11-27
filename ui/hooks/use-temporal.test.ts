import { describe, expect, it } from "vitest";

import { shouldRetryTemporalRequest } from "./use-temporal";

describe("shouldRetryTemporalRequest", () => {
  const failure = (status?: number) =>
    Object.assign(new Error("failed"), status ? { status } : {});

  it("does not retry a request the server refused", () => {
    expect(shouldRetryTemporalRequest(0, failure(400))).toBe(false);
    expect(shouldRetryTemporalRequest(0, failure(404))).toBe(false);
  });

  it("retries a server failure, a busy server and a network failure twice", () => {
    for (const error of [failure(500), failure(429), failure()]) {
      expect(shouldRetryTemporalRequest(0, error)).toBe(true);
      expect(shouldRetryTemporalRequest(1, error)).toBe(true);
      expect(shouldRetryTemporalRequest(2, error)).toBe(false);
    }
  });
});
