import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStreamRoutingKeys } from "./use-stream-routing-keys";

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

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
  });
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
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

  throw new Error("Timed out waiting for routing key query state");
}

function renderHarness(args: { prefix: string; streamName: string }) {
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

  let latestState: ReturnType<typeof useStreamRoutingKeys> | undefined;

  function Harness() {
    latestState = useStreamRoutingKeys({
      enabled: true,
      prefix: args.prefix,
      streamName: args.streamName,
    });

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

describe("useStreamRoutingKeys", () => {
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

  it("pages routing keys from the requested prefix range", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input: RequestInfo | URL) => {
        const url = new URL(resolveFetchUrl(input), "http://studio.example");
        const after = url.searchParams.get("after");

        if (after === "repo.\uffff") {
          return Promise.resolve(
            createJsonResponse({
              coverage: {
                complete: false,
                indexed_segments: 8,
                possible_missing_local_segments: 0,
                possible_missing_uploaded_segments: 3,
                scanned_local_segments: 0,
                scanned_uploaded_segments: 0,
                scanned_wal_rows: 2,
              },
              keys: ["repo/api", "repo/db"],
              next_after: "repo/db",
              timing: {
                fallback_scan_ms: 4,
                fallback_segment_get_ms: 0,
                fallback_wal_scan_ms: 4,
                lexicon_decode_ms: 1,
                lexicon_merge_ms: 0,
                lexicon_run_get_ms: 0,
                lexicon_runs_loaded: 2,
              },
              took_ms: 12,
            }),
          );
        }

        if (after === "repo/db") {
          return Promise.resolve(
            createJsonResponse({
              coverage: {
                complete: true,
                indexed_segments: 11,
                possible_missing_local_segments: 0,
                possible_missing_uploaded_segments: 0,
                scanned_local_segments: 0,
                scanned_uploaded_segments: 0,
                scanned_wal_rows: 0,
              },
              keys: ["repo0", "repo1"],
              next_after: "repo1",
              timing: {
                fallback_scan_ms: 0,
                fallback_segment_get_ms: 0,
                fallback_wal_scan_ms: 0,
                lexicon_decode_ms: 1,
                lexicon_merge_ms: 1,
                lexicon_run_get_ms: 0,
                lexicon_runs_loaded: 3,
              },
              took_ms: 3,
            }),
          );
        }

        return Promise.reject(new Error(`Unexpected fetch after=${after}`));
      });
    const harness = renderHarness({
      prefix: "repo/",
      streamName: "logs",
    });

    await waitFor(
      () => harness.getLatestState()?.keys.join("|") === "repo/api|repo/db",
    );

    const firstFetchCall = fetchMock.mock.calls[0];

    expect(firstFetchCall?.[0]).toBe(
      "/api/streams/v1/stream/logs/_routing_keys?limit=100&after=repo.%EF%BF%BF",
    );
    expect(firstFetchCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(harness.getLatestState()?.hasMoreRoutingKeys).toBe(true);
    expect(harness.getLatestState()?.isBestEffortBrowse).toBe(true);
    expect(harness.getLatestState()?.coverage).toEqual({
      complete: false,
      indexedSegments: 8,
      possibleMissingLocalSegments: 0,
      possibleMissingUploadedSegments: 3,
      scannedLocalSegments: 0,
      scannedUploadedSegments: 0,
      scannedWalRows: 2,
    });
    expect(harness.getLatestState()?.timing).toEqual({
      fallbackScanMs: 4,
      fallbackSegmentGetMs: 0,
      fallbackWalScanMs: 4,
      lexiconDecodeMs: 1,
      lexiconMergeMs: 0,
      lexiconRunGetMs: 0,
      lexiconRunsLoaded: 2,
    });
    expect(harness.getLatestState()?.tookMs).toBe(12);

    await act(async () => {
      await harness.getLatestState()?.loadMoreRoutingKeys();
    });

    await waitFor(() => harness.getLatestState()?.hasMoreRoutingKeys === false);

    const secondFetchCall = fetchMock.mock.calls[1];

    expect(secondFetchCall?.[0]).toBe(
      "/api/streams/v1/stream/logs/_routing_keys?limit=100&after=repo%2Fdb",
    );
    expect(secondFetchCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(harness.getLatestState()?.keys).toEqual(["repo/api", "repo/db"]);
    expect(harness.getLatestState()?.isBestEffortBrowse).toBe(false);
    expect(harness.getLatestState()?.coverage?.complete).toBe(true);
    expect(harness.getLatestState()?.timing?.lexiconRunsLoaded).toBe(3);
    expect(harness.getLatestState()?.tookMs).toBe(3);

    harness.cleanup();
    fetchMock.mockRestore();
  });
});
