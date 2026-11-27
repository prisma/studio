import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TemporalWorkersResponse } from "@/data/temporal";

import { TemporalWorkersView } from "./TemporalWorkersView";

const workersMock = vi.fn<() => TemporalWorkersResponse | undefined>();
const errorMock = vi.fn<() => Error | null>(() => null);

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalWorkers: () => ({
    data: workersMock(),
    dataUpdatedAt: Date.now() - 90_000,
    error: errorMock(),
    isError: errorMock() !== null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({
    createUrl: (values: Record<string, string>) =>
      `#${new URLSearchParams(values).toString()}`,
  }),
}));

vi.mock("../../StudioHeader", () => ({ StudioHeader: () => null }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const workers: TemporalWorkersResponse = {
  deployments: [],
  nexusEndpoints: null,
  workers: [
    {
      identity: "shop-worker@payments",
      lastAccessTime: "2026-11-24T14:06:47.061Z",
      taskQueues: [{ name: "payments", type: "activity" }],
    },
  ],
};

describe("TemporalWorkersView", () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = "";
    errorMock.mockReturnValue(null);
  });

  function renderView(response: TemporalWorkersResponse | undefined) {
    const container = document.createElement("div");

    document.body.append(container);
    workersMock.mockReturnValue(response);
    root = createRoot(container);
    act(() =>
      root!.render(
        <TemporalWorkersView
          followMode="paused"
          namespace="payments-eu"
          onFollowModeChange={vi.fn()}
        />,
      ),
    );

    return container;
  }

  it("links a Worker's queue to Task Queues, because an Activity queue has no runs to list", () => {
    const container = renderView(workers);
    const link = container.querySelector("a")!;
    const params = new URLSearchParams(link.getAttribute("href")!.slice(1));

    expect(link.textContent).toBe("payments · activity");
    expect(params.get("temporalSectionParam")).toBe("queues");
    expect(params.get("temporalNsParam")).toBe("payments-eu");
    expect(params.get("searchParam")).toBeNull();
    // The page stays paused.
    expect(params.get("temporalFollowParam")).toBe("paused");
  });

  it("says when the list was read and that refresh is paused", () => {
    const container = renderView(workers);

    expect(
      container.querySelector('[data-testid="temporal-workers-as-of"]')!
        .textContent,
    ).toBe("As of 1m ago · Paused");
  });

  it("says that the load failed, with the server's message", () => {
    errorMock.mockReturnValue(new Error("14 UNAVAILABLE: connection refused"));
    const container = renderView(undefined);
    const alert = container.querySelector('[role="alert"]')!;

    expect(alert.textContent).toContain(
      "Could not load the Workers of namespace payments-eu.",
    );
    expect(alert.textContent).toContain("14 UNAVAILABLE: connection refused");
  });

  it("keeps the Workers on screen when a refresh fails", () => {
    errorMock.mockReturnValue(new Error("14 UNAVAILABLE: connection refused"));
    const container = renderView(workers);

    expect(container.textContent).toContain("shop-worker@payments");
    expect(
      container.querySelector('[data-testid="temporal-refresh-error"]'),
    ).not.toBeNull();
  });
});
