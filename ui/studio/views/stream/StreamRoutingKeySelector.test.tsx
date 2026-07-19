import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StreamRoutingKeySelector } from "./StreamRoutingKeySelector";

const { useStreamRoutingKeysMock } = vi.hoisted(() => ({
  useStreamRoutingKeysMock: vi.fn(),
}));

vi.mock("../../../hooks/use-stream-routing-keys", () => ({
  useStreamRoutingKeys: useStreamRoutingKeysMock,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function click(element: Element) {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

function keyDown(element: Element, key: string) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
    }),
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("StreamRoutingKeySelector", () => {
  beforeEach(() => {
    useStreamRoutingKeysMock.mockReturnValue({
      coverage: null,
      error: null,
      hasMoreRoutingKeys: false,
      isFetching: false,
      isFetchingNextPage: false,
      isBestEffortBrowse: false,
      isLoading: false,
      keys: ["repo/api", "repo/db", "repo/web"],
      loadMoreRoutingKeys: vi.fn(() => Promise.resolve()),
      timing: null,
      tookMs: null,
    });
  });

  afterEach(() => {
    useStreamRoutingKeysMock.mockReset();
    document.body.innerHTML = "";
  });

  it("applies the selected routing key with keyboard navigation", async () => {
    const setSelectedRoutingKeyParam = vi.fn(() =>
      Promise.resolve(new URLSearchParams()),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StreamRoutingKeySelector
          selectedRoutingKey={null}
          setSelectedRoutingKeyParam={setSelectedRoutingKeyParam}
          streamName="__stream_metrics__"
        />,
      );
    });

    act(() => {
      click(
        container.querySelector(
          '[data-testid="stream-routing-key-button"]',
        ) as HTMLElement,
      );
    });
    await flush();

    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="stream-routing-key-input"]',
    );

    expect(input).not.toBeNull();

    act(() => {
      keyDown(input!, "ArrowDown");
    });
    await flush();

    act(() => {
      keyDown(input!, "Enter");
    });
    await flush();

    expect(setSelectedRoutingKeyParam).toHaveBeenCalledWith("repo/db");
    expect(
      document.body.querySelector('[data-testid="stream-routing-key-input"]'),
    ).toBeNull();
  });

  it("applies the selected routing key with mouse selection", async () => {
    const setSelectedRoutingKeyParam = vi.fn(() =>
      Promise.resolve(new URLSearchParams()),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StreamRoutingKeySelector
          selectedRoutingKey={null}
          setSelectedRoutingKeyParam={setSelectedRoutingKeyParam}
          streamName="gharchive-remote-simple-all-exact-repoName"
        />,
      );
    });

    act(() => {
      click(
        container.querySelector(
          '[data-testid="stream-routing-key-button"]',
        ) as HTMLElement,
      );
    });
    await flush();

    act(() => {
      click(
        document.body.querySelector(
          '[data-testid="stream-routing-key-option-2"]',
        ) as HTMLElement,
      );
    });

    expect(setSelectedRoutingKeyParam).toHaveBeenCalledWith("repo/web");
  });

  it("clears the selected routing key from the trigger affordance", () => {
    const setSelectedRoutingKeyParam = vi.fn(() =>
      Promise.resolve(new URLSearchParams()),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StreamRoutingKeySelector
          selectedRoutingKey="repo/db"
          setSelectedRoutingKeyParam={setSelectedRoutingKeyParam}
          streamName="gharchive-remote-simple-all-exact-repoName"
        />,
      );
    });

    act(() => {
      click(
        container.querySelector(
          '[data-testid="stream-routing-key-clear-button"]',
        ) as HTMLElement,
      );
    });

    expect(setSelectedRoutingKeyParam).toHaveBeenCalledWith(null);
    expect(
      document.body.querySelector('[data-testid="stream-routing-key-input"]'),
    ).toBeNull();
  });

  it("expands the trigger and shows the selected routing key", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StreamRoutingKeySelector
          selectedRoutingKey="repo/db"
          setSelectedRoutingKeyParam={() =>
            Promise.resolve(new URLSearchParams())
          }
          streamName="golden-stream-2"
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-routing-key-button"]',
    );
    const label = container.querySelector<HTMLElement>(
      '[data-testid="stream-routing-key-button-label"]',
    );

    expect(button?.textContent).toContain("repo/db");
    expect(label?.textContent).toBe("repo/db");
    expect(button?.className).toContain("bg-background");
    expect(button?.className).toContain("hover:bg-background");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("virtualizes the rendered routing-key list", async () => {
    useStreamRoutingKeysMock.mockReturnValue({
      coverage: null,
      error: null,
      hasMoreRoutingKeys: false,
      isFetching: false,
      isFetchingNextPage: false,
      isBestEffortBrowse: false,
      isLoading: false,
      keys: Array.from({ length: 200 }, (_unused, index) => `key-${index}`),
      loadMoreRoutingKeys: vi.fn(() => Promise.resolve()),
      timing: null,
      tookMs: null,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StreamRoutingKeySelector
          selectedRoutingKey={null}
          setSelectedRoutingKeyParam={() =>
            Promise.resolve(new URLSearchParams())
          }
          streamName="__stream_metrics__"
        />,
      );
    });

    act(() => {
      click(
        container.querySelector(
          '[data-testid="stream-routing-key-button"]',
        ) as HTMLElement,
      );
    });
    await flush();

    expect(
      document.body.querySelectorAll(
        '[data-testid^="stream-routing-key-option-"]',
      ).length,
    ).toBeLessThan(40);
  });

  it("renders the popover with the Studio sans font", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StreamRoutingKeySelector
          selectedRoutingKey={null}
          setSelectedRoutingKeyParam={() =>
            Promise.resolve(new URLSearchParams())
          }
          streamName="__stream_metrics__"
        />,
      );
    });

    act(() => {
      click(
        container.querySelector(
          '[data-testid="stream-routing-key-button"]',
        ) as HTMLElement,
      );
    });
    await flush();

    expect(
      document.body.querySelector('[data-testid="stream-routing-key-popover"]')
        ?.className,
    ).toContain("font-sans");
  });

  it("does not duplicate the selected routing key inside the popover", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StreamRoutingKeySelector
          selectedRoutingKey="repo/db"
          setSelectedRoutingKeyParam={() =>
            Promise.resolve(new URLSearchParams())
          }
          streamName="__stream_metrics__"
        />,
      );
    });

    act(() => {
      click(
        container.querySelector(
          '[data-testid="stream-routing-key-button"]',
        ) as HTMLElement,
      );
    });
    await flush();

    expect(document.body.textContent).not.toContain("Selected routing key:");
    expect(
      document.body.querySelector('[data-testid="stream-routing-key-clear"]'),
    ).toBeNull();
  });

  it("keeps best-effort browse status out of the selector popover", async () => {
    useStreamRoutingKeysMock.mockReturnValue({
      coverage: {
        complete: false,
        indexedSegments: 448,
        possibleMissingLocalSegments: 0,
        possibleMissingUploadedSegments: 1116,
        scannedLocalSegments: 0,
        scannedUploadedSegments: 0,
        scannedWalRows: 5091,
      },
      error: null,
      hasMoreRoutingKeys: true,
      isFetching: false,
      isFetchingNextPage: false,
      isBestEffortBrowse: true,
      isLoading: false,
      keys: ["repo/api"],
      loadMoreRoutingKeys: vi.fn(() => Promise.resolve()),
      timing: {
        fallbackScanMs: 10,
        fallbackSegmentGetMs: 0,
        fallbackWalScanMs: 10,
        lexiconDecodeMs: 7,
        lexiconMergeMs: 0,
        lexiconRunGetMs: 0,
        lexiconRunsLoaded: 18,
      },
      tookMs: 516,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StreamRoutingKeySelector
          selectedRoutingKey={null}
          setSelectedRoutingKeyParam={() =>
            Promise.resolve(new URLSearchParams())
          }
          streamName="golden-stream-2"
        />,
      );
    });

    act(() => {
      click(
        container.querySelector(
          '[data-testid="stream-routing-key-button"]',
        ) as HTMLElement,
      );
    });
    await flush();

    expect(
      document.body.querySelector('[data-testid="stream-routing-key-status"]'),
    ).toBeNull();
    expect(document.body.textContent).not.toContain("Best-effort browse");
    expect(document.body.textContent).not.toContain("Local .lex cache");
  });
});
