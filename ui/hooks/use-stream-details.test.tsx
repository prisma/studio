import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStreamDetails } from "./use-stream-details";

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

function createStreamDetailsPayload(overrides?: {
  index_status?: {
    bundled_companions?: {
      bytes_at_rest?: string;
      fully_indexed_uploaded_segments?: boolean;
      object_count?: number;
    };
    desired_index_plan_generation?: number;
    exact_indexes?: unknown[];
    manifest?: {
      generation?: number;
      last_uploaded_at?: string | null;
      last_uploaded_etag?: string | null;
      last_uploaded_size_bytes?: string | null;
      uploaded_generation?: number;
    };
    profile?: string;
    routing_key_index?: {
      active_run_count?: number;
      bytes_at_rest?: string;
      configured?: boolean;
      fully_indexed_uploaded_segments?: boolean;
      indexed_segment_count?: number;
      lag_ms?: string | null;
      lag_segments?: number;
      object_count?: number;
      retired_run_count?: number;
      updated_at?: string | null;
    };
    search_families?: unknown[];
    segments?: {
      total_count?: number;
      uploaded_count?: number;
    };
    stream?: string;
  };
  object_store_requests?: {
    by_artifact?: unknown[];
    deletes?: string;
    gets?: string;
    heads?: string;
    lists?: string;
    puts?: string;
    reads?: string;
  };
  schema?: {
    search?: {
      aliases?: Record<string, unknown>;
      defaultFields?: unknown[];
      fields?: Record<string, unknown>;
      primaryTimestampField?: unknown;
      rollups?: Record<string, unknown>;
    };
  };
  storage?: {
    companion_families?: {
      agg_bytes?: string;
      col_bytes?: string;
      fts_bytes?: string;
      mblk_bytes?: string;
    };
    local_storage?: {
      companion_cache_bytes?: string;
      exact_index_cache_bytes?: string;
      pending_sealed_segment_bytes?: string;
      pending_tail_bytes?: string;
      routing_index_cache_bytes?: string;
      segment_cache_bytes?: string;
      sqlite_shared_total_bytes?: string;
      total_bytes?: string;
      wal_retained_bytes?: string;
    };
    object_storage?: {
      bundled_companion_object_count?: number;
      exact_index_object_count?: number;
      indexes_bytes?: string;
      manifest_and_meta_bytes?: string;
      manifest_bytes?: string;
      routing_index_object_count?: number;
      schema_registry_bytes?: string;
      segment_object_count?: number;
      segments_bytes?: string;
      total_bytes?: string;
    };
  };
  stream?: Partial<{
    content_type: string;
    created_at: string;
    epoch: number;
    expires_at: string | null;
    last_append_at: string | null;
    last_segment_cut_at: string | null;
    name: string;
    next_offset: string;
    pending_bytes: string;
    pending_rows: string;
    sealed_through: string;
    segment_count: number;
    total_size_bytes: string;
    uploaded_segment_count: number;
    uploaded_through: string;
    wal_bytes: string;
  }>;
}) {
  const defaultSchema = {
    search: {
      rollups: {
        metrics: {
          dimensions: ["metric"],
          intervals: ["10s", "1m", "5m"],
          measures: {
            value: {
              kind: "summary_parts",
            },
          },
        },
        requests: {
          dimensions: [],
          intervals: ["1m"],
          measures: {
            latency: {
              kind: "summary",
            },
            requests: {
              kind: "count",
            },
          },
        },
      },
    },
  };

  return {
    index_status: overrides?.index_status,
    object_store_requests: overrides?.object_store_requests,
    schema: overrides?.schema ?? defaultSchema,
    storage: overrides?.storage,
    stream: {
      content_type: "application/json",
      created_at: "2026-03-24T14:42:38.890Z",
      epoch: 0,
      expires_at: null,
      last_append_at: "2026-03-24T14:42:39.890Z",
      last_segment_cut_at: "2026-03-24T14:42:40.890Z",
      name: "prisma-wal",
      next_offset: "2",
      pending_bytes: "128",
      pending_rows: "3",
      sealed_through: "-1",
      segment_count: 0,
      total_size_bytes: "1048576",
      uploaded_segment_count: 0,
      uploaded_through: "-1",
      wal_bytes: "256",
      ...overrides?.stream,
    },
  };
}

function renderHarness(args?: {
  refreshIntervalMs?: number;
  streamName?: string | null;
  streamsUrl?: string;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient();

  useStudioMock.mockReturnValue({
    streamsUrl: args?.streamsUrl,
  });

  let latestState: ReturnType<typeof useStreamDetails> | undefined;

  function Harness() {
    latestState = useStreamDetails(args);
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

  throw new Error("Timed out waiting for stream details state");
}

describe("useStreamDetails", () => {
  beforeEach(() => {
    useStudioMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("returns an idle empty state when Studio is not configured with a stream selection", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const harness = renderHarness({
      streamsUrl: "/api/streams",
    });

    expect(harness.getLatestState()).toEqual(
      expect.objectContaining({
        details: null,
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("loads total byte metadata from the stream details endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(createStreamDetailsPayload()), {
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    const harness = renderHarness({
      streamName: "prisma-wal",
      streamsUrl: "/api/streams",
    });

    await waitFor(() => harness.getLatestState()?.isSuccess === true);
    const fetchCall = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];

    expect(fetchCall[0]).toBe("/api/streams/v1/stream/prisma-wal/_details");
    expect(fetchCall[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(harness.getLatestState()?.details).toEqual({
      aggregationCount: 2,
      aggregationRollups: [
        {
          dimensions: ["metric"],
          intervals: ["10s", "1m", "5m"],
          measures: [
            {
              kind: "summary_parts",
              name: "value",
            },
          ],
          name: "metrics",
        },
        {
          dimensions: [],
          intervals: ["1m"],
          measures: [
            {
              kind: "summary",
              name: "latency",
            },
            {
              kind: "count",
              name: "requests",
            },
          ],
          name: "requests",
        },
      ],
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
      totalSizeBytes: 1_048_576n,
      uploadedSegmentCount: 0,
      uploadedThrough: "-1",
      walBytes: 256n,
    });

    harness.cleanup();
  });

  it("normalizes storage and index diagnostics from the combined details endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          createStreamDetailsPayload({
            index_status: {
              bundled_companions: {
                bytes_at_rest: "4096",
                fully_indexed_uploaded_segments: false,
                object_count: 4,
              },
              desired_index_plan_generation: 3,
              exact_indexes: [
                {
                  active_run_count: 1,
                  bytes_at_rest: "2048",
                  fully_indexed_uploaded_segments: false,
                  indexed_segment_count: 5,
                  kind: "keyword",
                  lag_ms: "180000",
                  lag_segments: 3,
                  name: "metric",
                  object_count: 3,
                  retired_run_count: 2,
                  stale_configuration: false,
                  updated_at: "2026-03-24T14:43:10.000Z",
                },
              ],
              manifest: {
                generation: 7,
                last_uploaded_at: "2026-03-24T14:43:00.000Z",
                last_uploaded_etag: "etag-7",
                last_uploaded_size_bytes: "512",
                uploaded_generation: 7,
              },
              profile: "metrics",
              routing_key_index: {
                active_run_count: 1,
                bytes_at_rest: "1024",
                configured: true,
                fully_indexed_uploaded_segments: true,
                indexed_segment_count: 8,
                lag_ms: "0",
                lag_segments: 0,
                object_count: 1,
                retired_run_count: 1,
                updated_at: "2026-03-24T14:42:59.000Z",
              },
              search_families: [
                {
                  bytes_at_rest: "8192",
                  contiguous_covered_segment_count: 5,
                  covered_segment_count: 6,
                  family: "agg",
                  fields: ["metric", "stream"],
                  fully_indexed_uploaded_segments: false,
                  lag_ms: "240000",
                  lag_segments: 3,
                  object_count: 2,
                  plan_generation: 3,
                  stale_segment_count: 2,
                  updated_at: "2026-03-24T14:43:11.000Z",
                },
              ],
              segments: {
                total_count: 10,
                uploaded_count: 8,
              },
              stream: "prisma-wal",
            },
            object_store_requests: {
              by_artifact: [
                {
                  artifact: "segments",
                  gets: "2",
                  heads: "1",
                  lists: "0",
                  puts: "5",
                  reads: "3",
                },
              ],
              deletes: "0",
              gets: "2",
              heads: "1",
              lists: "0",
              puts: "5",
              reads: "3",
            },
            storage: {
              companion_families: {
                agg_bytes: "256",
                col_bytes: "1024",
                fts_bytes: "2048",
                mblk_bytes: "128",
              },
              local_storage: {
                companion_cache_bytes: "5408",
                exact_index_cache_bytes: "64",
                pending_sealed_segment_bytes: "128",
                pending_tail_bytes: "256",
                routing_index_cache_bytes: "32",
                segment_cache_bytes: "512",
                sqlite_shared_total_bytes: "4096",
                total_bytes: "8192",
                wal_retained_bytes: "2048",
              },
              object_storage: {
                bundled_companion_object_count: 4,
                exact_index_object_count: 3,
                indexes_bytes: "16384",
                manifest_and_meta_bytes: "768",
                manifest_bytes: "512",
                routing_index_object_count: 1,
                schema_registry_bytes: "256",
                segment_object_count: 8,
                segments_bytes: "65536",
                total_bytes: "82688",
              },
            },
            stream: {
              pending_bytes: "512",
              pending_rows: "9",
              segment_count: 10,
              uploaded_segment_count: 8,
              wal_bytes: "2048",
            },
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
      streamName: "prisma-wal",
      streamsUrl: "/api/streams",
    });

    await waitFor(() => harness.getLatestState()?.isSuccess === true);

    expect(harness.getLatestState()?.details).toEqual(
      expect.objectContaining({
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
              objectCount: 2,
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
        uploadedSegmentCount: 8,
        walBytes: 2_048n,
      }),
    );

    harness.cleanup();
  });

  it("normalizes searchable stream schema details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          createStreamDetailsPayload({
            schema: {
              search: {
                aliases: {
                  req: "requestId",
                },
                defaultFields: [
                  {
                    boost: 2,
                    field: "message",
                  },
                ],
                fields: {
                  eventTime: {
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
                    sortable: true,
                  },
                  message: {
                    bindings: [
                      {
                        jsonPointer: "/message",
                        version: 1,
                      },
                    ],
                    exists: true,
                    kind: "text",
                    positions: true,
                  },
                  requestId: {
                    bindings: [
                      {
                        jsonPointer: "/requestId",
                        version: 1,
                      },
                    ],
                    exact: true,
                    exists: true,
                    kind: "keyword",
                    prefix: true,
                  },
                },
                primaryTimestampField: "eventTime",
              },
            },
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
      streamName: "prisma-wal",
      streamsUrl: "/api/streams",
    });

    await waitFor(() => harness.getLatestState()?.isSuccess === true);

    expect(harness.getLatestState()?.details?.search).toEqual({
      aliases: {
        req: "requestId",
      },
      defaultFields: [
        {
          boost: 2,
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
    });

    harness.cleanup();
  });

  it("uses ETag long polling for active stream detail refresh", async () => {
    let requestCount = 0;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, init) => {
        requestCount += 1;

        if (requestCount === 1) {
          return Promise.resolve(
            new Response(JSON.stringify(createStreamDetailsPayload()), {
              headers: {
                "content-type": "application/json",
                etag: '"details-v1"',
              },
            }),
          );
        }

        if (requestCount === 2) {
          return Promise.resolve(
            new Response(
              JSON.stringify(
                createStreamDetailsPayload({
                  stream: {
                    next_offset: "5",
                    total_size_bytes: "2097152",
                  },
                }),
              ),
              {
                headers: {
                  "content-type": "application/json",
                  etag: '"details-v2"',
                },
              },
            ),
          );
        }

        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;

          if (!(signal instanceof AbortSignal)) {
            return;
          }

          signal.addEventListener(
            "abort",
            () => {
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      });
    const harness = renderHarness({
      refreshIntervalMs: 100,
      streamName: "prisma-wal",
      streamsUrl: "/api/streams",
    });

    await waitFor(() => fetchSpy.mock.calls.length >= 2);
    await waitFor(() => harness.getLatestState()?.details?.nextOffset === "5");

    const initialFetchCall = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    const longPollCall = fetchSpy.mock.calls[1] as [
      string,
      RequestInit | undefined,
    ];

    expect(initialFetchCall[0]).toBe(
      "/api/streams/v1/stream/prisma-wal/_details",
    );
    expect(longPollCall[0]).toBe(
      "/api/streams/v1/stream/prisma-wal/_details?live=long-poll&timeout=30s",
    );
    expect(new Headers(longPollCall[1]?.headers).get("If-None-Match")).toBe(
      '"details-v1"',
    );
    expect(harness.getLatestState()?.details).toEqual(
      expect.objectContaining({
        nextOffset: "5",
        totalSizeBytes: 2_097_152n,
      }),
    );

    harness.cleanup();
  });

  it("treats a same-ETag long-poll 200 response as unchanged", async () => {
    let requestCount = 0;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, init) => {
        requestCount += 1;

        if (requestCount === 1) {
          return Promise.resolve(
            new Response(JSON.stringify(createStreamDetailsPayload()), {
              headers: {
                "content-type": "application/json",
                etag: '"details-v1"',
              },
            }),
          );
        }

        if (requestCount === 2) {
          return Promise.resolve(
            new Response(JSON.stringify(createStreamDetailsPayload()), {
              headers: {
                "content-type": "application/json",
                etag: '"details-v1"',
              },
            }),
          );
        }

        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;

          if (!(signal instanceof AbortSignal)) {
            return;
          }

          signal.addEventListener(
            "abort",
            () => {
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      });
    const harness = renderHarness({
      refreshIntervalMs: 100,
      streamName: "prisma-wal",
      streamsUrl: "/api/streams",
    });

    await waitFor(() => fetchSpy.mock.calls.length >= 2);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(harness.getLatestState()?.details).toEqual(
      expect.objectContaining({
        nextOffset: "2",
        totalSizeBytes: 1_048_576n,
      }),
    );

    harness.cleanup();
  });
});
