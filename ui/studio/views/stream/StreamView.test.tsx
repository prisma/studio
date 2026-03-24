import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StreamView } from "./StreamView";

const { useNavigationMock, useStreamEventsMock, useStreamsMock } = vi.hoisted(
  () => ({
    useNavigationMock: vi.fn<
      () => {
        streamParam: string | null;
      }
    >(),
    useStreamEventsMock: vi.fn<
      (args: {
        pageCount: number;
        stream: { name: string } | null;
        visibleEventCount?: bigint;
      }) => {
        collection: null;
        events: Array<{
          body: unknown;
          exactTimestamp: string | null;
          id: string;
          indexedFields: Array<{ id: string; label: string; value?: string }>;
          key: string | null;
          offset: string;
          preview: string;
          sequence: string;
          sizeBytes: number;
          sortOffset: string;
          streamName: string;
        }>;
        hasHiddenNewerEvents: boolean;
        hasMoreEvents: boolean;
        hiddenNewerEventCount: bigint;
        isFetching: boolean;
        pageSize: number;
        queryScopeKey: string;
        refetch: () => Promise<void>;
        totalEventCount: bigint;
        visibleEventCount: bigint;
      }
    >(),
    useStreamsMock: vi.fn<
      () => {
        isError: boolean;
        isLoading: boolean;
        streams: Array<{
          createdAt: string;
          epoch: number;
          expiresAt: string | null;
          name: string;
          nextOffset: string;
          sealedThrough: string;
          uploadedThrough: string;
        }>;
      }
    >(),
  }),
);

const uiStateValues = new Map<string, unknown>();

vi.mock("../../../hooks/use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

vi.mock("../../../hooks/use-stream-events", () => ({
  useStreamEvents: useStreamEventsMock,
}));

vi.mock("../../../hooks/use-streams", () => ({
  useStreams: () => useStreamsMock(),
}));

vi.mock("../../../hooks/use-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useUiState: <T,>(key: string | undefined, initialValue: T) => {
      const [value, setValue] = React.useState<T>(() => {
        if (key && !uiStateValues.has(key)) {
          uiStateValues.set(key, initialValue);
        }

        return key
          ? ((uiStateValues.get(key) as T | undefined) ?? initialValue)
          : initialValue;
      });

      const setSharedValue = (updater: T | ((previous: T) => T)) => {
        setValue((previous) => {
          const nextValue =
            typeof updater === "function"
              ? (updater as (previous: T) => T)(previous)
              : updater;

          if (key) {
            uiStateValues.set(key, nextValue);
          }

          return nextValue;
        });
      };

      const resetValue = () => {
        if (key) {
          uiStateValues.set(key, initialValue);
        }

        setValue(initialValue);
      };

      return [value, setSharedValue, resetValue] as const;
    },
  };
});

vi.mock("../../StudioHeader", () => ({
  StudioHeader: ({
    children,
    endContent,
  }: {
    children?: React.ReactNode;
    endContent?: React.ReactNode;
  }) => (
    <div data-testid="studio-header">
      <div>{children}</div>
      <div>{endContent}</div>
    </div>
  ),
}));

vi.mock("@/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
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

function setStreamViewTestNextOffset(nextOffset: bigint) {
  (
    globalThis as unknown as {
      __streamViewTestSetNextOffset: (nextOffset: bigint) => void;
    }
  ).__streamViewTestSetNextOffset(nextOffset);
}

function installDynamicScrollMetrics(
  container: HTMLElement,
  scrollContainer: HTMLDivElement,
  initialScrollTop: number,
) {
  Object.defineProperties(scrollContainer, {
    clientHeight: {
      configurable: true,
      value: 400,
    },
    scrollHeight: {
      configurable: true,
      get() {
        const eventRowCount = container.querySelectorAll(
          '[data-testid^="stream-event-row-"]',
        ).length;
        const buttonHeight = container.querySelector(
          '[data-testid="stream-new-events-row"]',
        )
          ? 48
          : 0;

        return 120 + buttonHeight + eventRowCount * 44;
      },
    },
    scrollTop: {
      configurable: true,
      value: initialScrollTop,
      writable: true,
    },
  });
}

describe("StreamView", () => {
  beforeEach(() => {
    uiStateValues.clear();
    let currentNextOffset = 2n;
    useNavigationMock.mockReturnValue({
      streamParam: "prisma-wal",
    });
    useStreamsMock.mockImplementation(() => ({
      isError: false,
      isLoading: false,
      streams: [
        {
          createdAt: "2026-03-24T14:42:38.890Z",
          epoch: 0,
          expiresAt: null,
          name: "prisma-wal",
          nextOffset: currentNextOffset.toString(),
          sealedThrough: "-1",
          uploadedThrough: "-1",
        },
      ],
    }));
    useStreamEventsMock.mockImplementation(
      ({
        pageCount,
        visibleEventCount,
      }: {
        pageCount: number;
        stream: { name: string } | null;
        visibleEventCount?: bigint;
      }) => {
        const resolvedVisibleEventCount =
          visibleEventCount ?? currentNextOffset;
        const hiddenNewerEventCount =
          currentNextOffset > resolvedVisibleEventCount
            ? currentNextOffset - resolvedVisibleEventCount
            : 0n;
        const events = Array.from(
          { length: Number(resolvedVisibleEventCount) },
          (_unused, index) => {
            const sequence = resolvedVisibleEventCount - BigInt(index);

            if (sequence === 2n) {
              return {
                body: {
                  headers: {
                    timestamp: "2026-03-24T14:42:48.875Z",
                  },
                  value: {
                    id: "org_skyline",
                  },
                },
                exactTimestamp: "2026-03-24T14:42:48.875Z",
                id: `prisma-wal:event:${pageCount}:2`,
                indexedFields: [],
                key: null,
                offset: "offset-2",
                preview: '{"id":"org_skyline"}',
                sequence: "2",
                sizeBytes: 1200,
                sortOffset: "offset-2",
                streamName: "prisma-wal",
              };
            }

            if (sequence === 1n) {
              return {
                body: {
                  headers: {
                    timestamp: "2026-03-24T14:42:39.098Z",
                  },
                  indexedFields: {
                    tenant: "acme",
                  },
                  key: "org_northwind",
                  value: {
                    id: "org_northwind",
                  },
                },
                exactTimestamp: "2026-03-24T14:42:39.098Z",
                id: `prisma-wal:event:${pageCount}:1`,
                indexedFields: [
                  {
                    id: "indexed:0:tenant:acme",
                    label: "tenant",
                    value: "acme",
                  },
                ],
                key: "org_northwind",
                offset: "offset-1",
                preview: '{"id":"org_northwind"}',
                sequence: "1",
                sizeBytes: 48,
                sortOffset: "offset-1",
                streamName: "prisma-wal",
              };
            }

            return {
              body: {
                headers: {
                  timestamp: "2026-03-24T14:42:48.875Z",
                },
                value: {
                  id: `synthetic-${sequence.toString()}`,
                },
              },
              exactTimestamp: "2026-03-24T14:42:48.875Z",
              id: `prisma-wal:event:${pageCount}:${sequence.toString()}`,
              indexedFields: [],
              key: null,
              offset: `offset-${sequence.toString()}`,
              preview: `{"id":"synthetic-${sequence.toString()}"}`,
              sequence: sequence.toString(),
              sizeBytes: 96,
              sortOffset: `offset-${sequence.toString()}`,
              streamName: "prisma-wal",
            };
          },
        );

        return {
          collection: null,
          events,
          hasHiddenNewerEvents: hiddenNewerEventCount > 0n,
          hasMoreEvents: pageCount < 2,
          hiddenNewerEventCount,
          isFetching: false,
          pageSize: 50,
          queryScopeKey: `scope:${pageCount}:${resolvedVisibleEventCount.toString()}`,
          refetch: vi.fn(() => Promise.resolve()),
          totalEventCount: currentNextOffset,
          visibleEventCount: resolvedVisibleEventCount,
        };
      },
    );

    Object.assign(globalThis, {
      __streamViewTestSetNextOffset(nextOffset: bigint) {
        currentNextOffset = nextOffset;
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    delete (
      globalThis as {
        __streamViewTestSetNextOffset?: (nextOffset: bigint) => void;
      }
    ).__streamViewTestSetNextOffset;
  });

  it("renders stream event summary columns and keeps only one row expanded at a time", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(container.textContent).toContain("Time");
    expect(container.textContent).toContain("Key");
    expect(container.textContent).toContain("Indexed");
    expect(container.textContent).toContain("Preview");
    expect(container.textContent).toContain("Size");
    expect(container.textContent).toContain("org_northwind");
    expect(container.textContent).toContain("tenant: acme");
    expect(container.textContent).toContain("1.2 KB");
    expect(container.textContent).not.toContain('"id": "org_skyline"');

    const newerRow = container.querySelector(
      '[data-testid="stream-event-row-2"]',
    );
    const olderRow = container.querySelector(
      '[data-testid="stream-event-row-1"]',
    );

    expect(newerRow).not.toBeNull();
    expect(olderRow).not.toBeNull();

    act(() => {
      if (newerRow) {
        click(newerRow);
      }
    });

    expect(container.textContent).toContain('"id": "org_skyline"');

    act(() => {
      if (olderRow) {
        click(olderRow);
      }
    });

    expect(container.textContent).toContain('"id": "org_northwind"');
    expect(container.textContent).not.toContain('"id": "org_skyline"');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("requests an older tail window when the list scrolls near the bottom", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 520,
      },
      scrollTop: {
        configurable: true,
        value: 200,
        writable: true,
      },
    });

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    const pageCounts = useStreamEventsMock.mock.calls.map(
      (call) => call[0]?.pageCount ?? 0,
    );

    expect(pageCounts).toContain(1);
    expect(pageCounts).toContain(2);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows a capped new-events button and reveals only 50 at a time", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    expect(container.textContent).not.toContain("new events");

    act(() => {
      setStreamViewTestNextOffset(59n);
      root.render(<StreamView />);
    });

    expect(container.textContent).toContain("50+ new events");
    const headerRow = container.querySelector(
      '[data-testid="stream-header-row"]',
    );
    const buttonRow = container.querySelector(
      '[data-testid="stream-new-events-row"]',
    );

    expect(headerRow).not.toBeNull();
    expect(buttonRow).not.toBeNull();
    expect(buttonRow?.className).toContain("justify-center");
    expect(buttonRow?.className).not.toContain("border-b");
    expect(headerRow?.compareDocumentPosition(buttonRow as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const newEventsButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("50+ new events"),
    );

    expect(newEventsButton).not.toBeUndefined();

    act(() => {
      newEventsButton?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(container.textContent).toContain("7 new events");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps the current viewport anchored when the new-events button appears", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    installDynamicScrollMetrics(container, scrollContainer, 120);
    const previousScrollHeight = scrollContainer.scrollHeight;

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    act(() => {
      setStreamViewTestNextOffset(59n);
      root.render(<StreamView />);
    });

    expect(scrollContainer.scrollTop).toBe(
      120 + (scrollContainer.scrollHeight - previousScrollHeight),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps the current viewport anchored when revealing newer events", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    installDynamicScrollMetrics(container, scrollContainer, 168);

    act(() => {
      setStreamViewTestNextOffset(59n);
      root.render(<StreamView />);
    });

    scrollContainer.scrollTop = 240;
    const previousScrollHeight = scrollContainer.scrollHeight;

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    const newEventsButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="stream-new-events-button"]',
    );

    expect(newEventsButton).not.toBeNull();

    act(() => {
      newEventsButton?.click();
    });

    expect(scrollContainer.scrollTop).toBe(
      240 + (scrollContainer.scrollHeight - previousScrollHeight),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not auto-load newer events when scrolling to the top", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StreamView />);
    });

    act(() => {
      setStreamViewTestNextOffset(60n);
      root.render(<StreamView />);
    });

    const scrollContainer = container.querySelector<HTMLDivElement>(
      '[data-testid="stream-events-scroll-container"]',
    );

    expect(scrollContainer).not.toBeNull();

    if (!scrollContainer) {
      throw new Error("Expected stream events scroll container");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        value: 1200,
      },
      scrollTop: {
        configurable: true,
        value: 0,
        writable: true,
      },
    });

    act(() => {
      scrollContainer.dispatchEvent(
        new Event("scroll", {
          bubbles: true,
        }),
      );
    });

    expect(container.textContent).toContain("50+ new events");

    const latestCall = useStreamEventsMock.mock.calls.at(-1)?.[0];

    expect(latestCall?.pageCount).toBe(1);
    expect(latestCall?.visibleEventCount).toBe(2n);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
