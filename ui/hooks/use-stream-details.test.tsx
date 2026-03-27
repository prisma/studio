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
      new Response(
        JSON.stringify({
          stream: {
            name: "prisma-wal",
            total_size_bytes: "1048576",
          },
        }),
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
    const fetchCall = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];

    expect(fetchCall[0]).toBe("/api/streams/v1/stream/prisma-wal/_details");
    expect(fetchCall[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(harness.getLatestState()?.details).toEqual({
      name: "prisma-wal",
      totalSizeBytes: 1_048_576n,
    });

    harness.cleanup();
  });
});
