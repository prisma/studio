import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStreamAggregations } from "./use-stream-aggregations";

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

function renderHarness(args: Parameters<typeof useStreamAggregations>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient();

  useStudioMock.mockReturnValue({
    streamsUrl: "/api/streams",
  });

  let latestState: ReturnType<typeof useStreamAggregations> | undefined;

  function Harness() {
    latestState = useStreamAggregations(args);
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
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
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

  throw new Error("Timed out waiting for stream aggregations state");
}

describe("useStreamAggregations", () => {
  beforeEach(() => {
    useStudioMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T03:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("loads aggregate series with a POST request and normalizes summary tiles", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          buckets: [
            {
              end: "2026-03-27T02:31:00.000Z",
              groups: [
                {
                  key: {},
                  measures: {
                    value: {
                      avg: 15,
                      count: 2,
                      max: 20,
                      min: 10,
                      p50: 16,
                      p95: 20,
                      p99: 20,
                      sum: 30,
                    },
                  },
                },
              ],
              start: "2026-03-27T02:30:00.000Z",
            },
            {
              end: "2026-03-27T02:32:00.000Z",
              groups: [
                {
                  key: {},
                  measures: {
                    value: {
                      avg: 40,
                      count: 1,
                      max: 40,
                      min: 40,
                      p50: 40,
                      p95: 40,
                      p99: 40,
                      sum: 40,
                    },
                  },
                },
              ],
              start: "2026-03-27T02:31:00.000Z",
            },
          ],
          coverage: {
            indexed_segments: 4,
            index_families_used: ["agg"],
            scanned_segments: 0,
            scanned_tail_docs: 0,
            used_rollups: true,
          },
          from: "2026-03-27T02:30:00.000Z",
          interval: "1m",
          rollup: "metrics",
          stream: "__stream_metrics__",
          to: "2026-03-27T03:30:00.000Z",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const harness = renderHarness({
      aggregationRollups: [
        {
          intervals: ["10s", "1m", "5m", "1h"],
          measures: [
            {
              kind: "summary_parts",
              name: "value",
            },
          ],
          name: "metrics",
        },
      ],
      rangeSelection: {
        duration: "1h",
        kind: "relative",
      },
      streamName: "__stream_metrics__",
    });

    await waitFor(() => harness.getLatestState()?.isLoading === false);

    const fetchCall = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    const requestBody = JSON.parse(String(fetchCall[1]?.body)) as {
      from: string;
      interval: string;
      measures: string[];
      rollup: string;
      to: string;
    };

    expect(fetchCall[0]).toBe(
      "/api/streams/v1/stream/__stream_metrics__/_aggregate",
    );
    expect(fetchCall[1]?.method).toBe("POST");
    expect(fetchCall[1]?.headers).toEqual({
      "content-type": "application/json",
    });
    expect(fetchCall[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(requestBody).toEqual({
      from: "2026-03-27T02:30:00.000Z",
      interval: "1m",
      measures: ["value"],
      rollup: "metrics",
      to: "2026-03-27T03:30:00.000Z",
    });
    expect(harness.getLatestState()?.aggregations).toEqual([
      {
        coverage: {
          indexFamiliesUsed: ["agg"],
          indexedSegments: 4,
          scannedSegments: 0,
          scannedTailDocs: 0,
          usedRollups: true,
        },
        from: "2026-03-27T02:30:00.000Z",
        interval: "1m",
        measures: [
          {
            kind: "summary_parts",
            name: "value",
            points: [
              {
                end: "2026-03-27T02:31:00.000Z",
                start: "2026-03-27T02:30:00.000Z",
                value: 15,
              },
              {
                end: "2026-03-27T02:32:00.000Z",
                start: "2026-03-27T02:31:00.000Z",
                value: 40,
              },
            ],
            summaryValue: 70 / 3,
          },
        ],
        rollupName: "metrics",
        to: "2026-03-27T03:30:00.000Z",
      },
    ]);

    harness.cleanup();
  });
});
