import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStreams } from "./use-streams";

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
  streamsUrl?: string;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient();

  useStudioMock.mockReturnValue({
    streamsUrl: args?.streamsUrl,
  });

  let latestState: ReturnType<typeof useStreams> | undefined;

  function Harness() {
    latestState = useStreams(args);
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

  throw new Error("Timed out waiting for streams state");
}

describe("useStreams", () => {
  beforeEach(() => {
    useStudioMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("returns an idle empty state when Studio is not configured with a streams URL", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const harness = renderHarness();

    expect(harness.getLatestState()).toEqual(
      expect.objectContaining({
        hasStreamsServer: false,
        streams: [],
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("loads and alphabetizes streams from the configured streams server", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            created_at: "2026-03-09T10:00:00.000Z",
            epoch: 0,
            expires_at: null,
            name: "prisma-wal",
            next_offset: "0",
            sealed_through: "0",
            uploaded_through: "0",
          },
          {
            created_at: "2026-03-09T10:00:00.000Z",
            epoch: 0,
            expires_at: null,
            name: "audit-log",
            next_offset: "0",
            sealed_through: "0",
            uploaded_through: "0",
          },
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const harness = renderHarness({
      streamsUrl: "/api/streams",
    });

    await waitFor(() => harness.getLatestState()?.isSuccess === true);
    const fetchCall = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];

    expect(fetchCall[0]).toBe("/api/streams/v1/streams?limit=1000&offset=0");
    expect(fetchCall[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(
      harness.getLatestState()?.streams.map((stream) => stream.name),
    ).toEqual(["audit-log", "prisma-wal"]);
    expect(harness.getLatestState()?.hasStreamsServer).toBe(true);

    harness.cleanup();
  });

  it("refreshes stream metadata every 5 seconds when asked", async () => {
    vi.useFakeTimers();

    async function waitForWithFakeTimers(
      assertion: () => boolean,
    ): Promise<void> {
      const timeoutMs = 2000;
      let elapsedMs = 0;

      while (elapsedMs < timeoutMs) {
        if (assertion()) {
          return;
        }

        await act(async () => {
          await vi.advanceTimersByTimeAsync(50);
        });
        elapsedMs += 50;
      }

      throw new Error("Timed out waiting for streams refresh");
    }

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              created_at: "2026-03-09T10:00:00.000Z",
              epoch: 0,
              expires_at: null,
              name: "prisma-wal",
              next_offset: "2",
              sealed_through: "0",
              uploaded_through: "0",
            },
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              created_at: "2026-03-09T10:00:00.000Z",
              epoch: 0,
              expires_at: null,
              name: "prisma-wal",
              next_offset: "9",
              sealed_through: "0",
              uploaded_through: "0",
            },
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    const harness = renderHarness({
      refreshIntervalMs: 5000,
      streamsUrl: "/api/streams",
    });

    await waitForWithFakeTimers(
      () => harness.getLatestState()?.streams[0]?.nextOffset === "2",
    );
    expect(harness.getLatestState()?.streams[0]?.nextOffset).toBe("2");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(harness.getLatestState()?.streams[0]?.nextOffset).toBe("9");

    harness.cleanup();
    vi.useRealTimers();
  });
});
