import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioObserveLookup } from "../../../hooks/use-stream-observe-request";
import { StreamObserveSheet } from "./StreamObserveSheet";

const useStudioMock = vi.fn<
  () => {
    streamsUrl?: string;
  }
>();

vi.mock("../../../studio/context", () => ({
  useStudio: () => useStudioMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OBSERVE_RESPONSE = {
  coverage: {
    events: {
      complete: true,
      hits: 1,
      limit_reached: false,
      searched: true,
      timed_out: false,
    },
    traces: {
      complete: true,
      hits: 2,
      limit_reached: false,
      searched: true,
      timed_out: false,
    },
    warnings: ["missing parent spans: 1"],
  },
  evlog: {
    matches: [
      {
        offset: "0000000000000000000G000000",
        source: { message: "Payment failed" },
      },
    ],
    primary: {
      duration: 234,
      fix: "Retry with a different card.",
      level: "error",
      message: "Payment failed",
      method: "POST",
      path: "/api/checkout",
      requestId: "req_8f2k",
      service: "checkout",
      status: 402,
      timestamp: "2026-06-11T14:20:00.000Z",
      traceId: "5b8efff798038103d269b633813fc60c",
      why: "Card declined by issuer",
    },
    stream: "app-events",
  },
  lookup: {
    requestId: "req_8f2k",
    spanId: null,
    traceId: "5b8efff798038103d269b633813fc60c",
  },
  summary: {
    duration: 234,
    endTime: "2026-06-11T14:20:00.234Z",
    environment: "production",
    error: {
      fix: "Retry with a different card.",
      isError: true,
      link: null,
      message: "card declined",
      type: null,
      why: "Card declined by issuer",
    },
    level: "error",
    method: "POST",
    path: "/api/checkout",
    route: "/api/checkout",
    service: "checkout",
    startTime: "2026-06-11T14:20:00.000Z",
    status: 402,
    title: "Payment failed",
  },
  timeline: [
    {
      duration: 234,
      ids: {
        requestId: "req_8f2k",
        spanId: "086e83747d0e381e",
        traceId: "5b8efff798038103d269b633813fc60c",
      },
      kind: "evlog.event",
      service: "checkout",
      severity: "error",
      source: {
        offset: "0000000000000000000G000000",
        profile: "evlog",
        stream: "app-events",
      },
      time: "2026-06-11T14:20:00.000Z",
      title: "Payment failed",
    },
    {
      duration: 234,
      ids: {
        parentSpanId: null,
        spanId: "086e83747d0e381e",
        traceId: "5b8efff798038103d269b633813fc60c",
      },
      kind: "otel.span.start",
      service: "checkout",
      severity: "error",
      source: { profile: "otel-traces", stream: "app-traces" },
      time: "2026-06-11T14:20:00.000Z",
      title: "POST /api/checkout",
    },
    {
      ids: {
        spanId: "086e83747d0e381e",
        traceId: "5b8efff798038103d269b633813fc60c",
      },
      kind: "otel.span.end",
      service: "checkout",
      severity: "error",
      source: { profile: "otel-traces", stream: "app-traces" },
      time: "2026-06-11T14:20:00.234Z",
      title: "POST /api/checkout",
    },
  ],
  trace: {
    criticalPath: ["086e83747d0e381e"],
    duplicateSpans: 0,
    errors: [
      {
        message: "Card declined by issuer",
        name: "POST payments /charges",
        service: "payments",
        spanId: "22dd83747d0e3822",
        time: "2026-06-11T14:20:00.041Z",
        type: "CardDeclinedError",
      },
    ],
    missingParents: ["aaaa83747d0eaaaa"],
    partial: true,
    rootSpanId: "086e83747d0e381e",
    serviceMap: [
      {
        count: 2,
        errorCount: 1,
        from: "checkout",
        to: "payments",
      },
    ],
    spans: [
      {
        attributes: { "request.id": "req_8f2k" },
        name: "POST /api/checkout",
        spanId: "086e83747d0e381e",
      },
      {
        name: "POST payments /charges",
        spanId: "22dd83747d0e3822",
      },
    ],
    stream: "app-traces",
    traceId: "5b8efff798038103d269b633813fc60c",
    tree: [
      {
        children: [
          {
            children: [],
            depth: 1,
            duration: 151,
            endTime: "2026-06-11T14:20:00.192Z",
            kind: "client",
            name: "POST payments /charges",
            parentSpanId: "086e83747d0e381e",
            service: "payments",
            spanId: "22dd83747d0e3822",
            startTime: "2026-06-11T14:20:00.041Z",
            statusCode: "error",
          },
        ],
        depth: 0,
        duration: 234,
        endTime: "2026-06-11T14:20:00.234Z",
        kind: "server",
        name: "POST /api/checkout",
        parentSpanId: null,
        service: "checkout",
        spanId: "086e83747d0e381e",
        startTime: "2026-06-11T14:20:00.000Z",
        statusCode: "error",
      },
    ],
  },
};

interface RenderedSheet {
  cleanup: () => void;
  container: HTMLElement;
  onClose: ReturnType<typeof vi.fn>;
  rerender: (lookup: StudioObserveLookup | null) => void;
}

function renderSheet(args: {
  eventsStream?: string | null;
  lookup: StudioObserveLookup | null;
  tracesStream?: string | null;
}): RenderedSheet {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const onClose = vi.fn();

  const render = (lookup: StudioObserveLookup | null) => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <StreamObserveSheet
            eventsStream={
              args.eventsStream === undefined ? "app-events" : args.eventsStream
            }
            lookup={lookup}
            onClose={onClose}
            tracesStream={
              args.tracesStream === undefined ? "app-traces" : args.tracesStream
            }
          />
        </QueryClientProvider>,
      );
    });
  };

  render(args.lookup);

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      queryClient.clear();
      container.remove();
    },
    container,
    onClose,
    rerender: render,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitForSelector(selector: string): Promise<HTMLElement> {
  const timeoutMs = 2000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const element = document.querySelector<HTMLElement>(selector);

    if (element) {
      return element;
    }

    await flush();
  }

  throw new Error(`Timed out waiting for ${selector}`);
}

function click(element: HTMLElement): void {
  act(() => {
    element.click();
  });
}

describe("StreamObserveSheet", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    useStudioMock.mockReset();
    useStudioMock.mockReturnValue({
      streamsUrl: "/api/streams",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(OBSERVE_RESPONSE), {
        headers: { "content-type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("renders the request summary, warnings, and timeline by default", async () => {
    const sheet = renderSheet({
      lookup: { kind: "requestId", value: "req_8f2k" },
    });

    const sheetElement = await waitForSelector(
      '[data-testid="stream-observe-sheet"]',
    );

    await waitForSelector('[data-testid="stream-observe-timeline"]');

    expect(sheetElement.textContent).toContain("Payment failed");
    expect(sheetElement.textContent).toContain("POST /api/checkout");
    expect(sheetElement.textContent).toContain("402");

    const warnings = await waitForSelector(
      '[data-testid="stream-observe-warnings"]',
    );

    expect(warnings.textContent).toContain("missing parent spans: 1");

    const timelineItems = document.querySelectorAll(
      '[data-testid="stream-observe-timeline-item"]',
    );

    // The span-end timeline item is hidden to keep the list readable.
    expect(timelineItems).toHaveLength(2);
    expect(timelineItems[0]?.textContent).toContain("Payment failed");
    expect(timelineItems[1]?.textContent).toContain("POST /api/checkout");

    sheet.cleanup();
  });

  it("renders the trace waterfall with span expansion, errors, and service calls", async () => {
    const sheet = renderSheet({
      lookup: { kind: "requestId", value: "req_8f2k" },
    });

    await waitForSelector('[data-testid="stream-observe-timeline"]');
    click(
      await waitForSelector('[data-testid="stream-observe-section-trace"]'),
    );

    const waterfall = await waitForSelector(
      '[data-testid="stream-observe-waterfall"]',
    );

    expect(waterfall.textContent).toContain("2 spans");
    expect(waterfall.textContent).toContain("partial");
    expect(waterfall.textContent).toContain("missing parents");

    const spanRows = document.querySelectorAll(
      '[data-testid^="stream-observe-span-row-"]',
    );

    expect(spanRows).toHaveLength(2);

    click(
      await waitForSelector(
        '[data-testid="stream-observe-span-row-22dd83747d0e3822"]',
      ),
    );

    const spanDetails = await waitForSelector(
      '[data-testid="stream-observe-span-details"]',
    );

    expect(spanDetails.textContent).toContain("POST payments /charges");
    expect(waterfall.textContent).toContain("CardDeclinedError");
    expect(waterfall.textContent).toContain("checkout -> payments");
    expect(waterfall.textContent).toContain("2 calls, 1 error");

    sheet.cleanup();
  });

  it("renders the evlog event with root-cause fields", async () => {
    const sheet = renderSheet({
      lookup: { kind: "requestId", value: "req_8f2k" },
    });

    await waitForSelector('[data-testid="stream-observe-timeline"]');
    click(
      await waitForSelector('[data-testid="stream-observe-section-event"]'),
    );

    const eventPanel = await waitForSelector(
      '[data-testid="stream-observe-event"]',
    );
    const rootCause = await waitForSelector(
      '[data-testid="stream-observe-root-cause"]',
    );

    expect(rootCause.textContent).toContain("Card declined by issuer");
    expect(rootCause.textContent).toContain("Retry with a different card.");
    expect(eventPanel.textContent).toContain('"requestId": "req_8f2k"');

    sheet.cleanup();
  });

  it("explains a missing trace stream instead of rendering an empty waterfall", async () => {
    const sheet = renderSheet({
      lookup: { kind: "requestId", value: "req_8f2k" },
      tracesStream: null,
    });

    await waitForSelector('[data-testid="stream-observe-timeline"]');
    click(
      await waitForSelector('[data-testid="stream-observe-section-trace"]'),
    );
    await flush();

    expect(
      document.querySelector('[data-testid="stream-observe-waterfall"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="stream-observe-sheet"]')
        ?.textContent,
    ).toContain("No otel-traces stream is available");

    sheet.cleanup();
  });

  it("renders an unavailable state when no observe streams are resolved", async () => {
    const sheet = renderSheet({
      eventsStream: null,
      lookup: { kind: "requestId", value: "req_8f2k" },
      tracesStream: null,
    });

    const sheetElement = await waitForSelector(
      '[data-testid="stream-observe-sheet"]',
    );
    click(
      await waitForSelector('[data-testid="stream-observe-section-trace"]'),
    );
    await flush();

    expect(
      document.querySelector('[data-testid="stream-observe-waterfall"]'),
    ).toBeNull();
    expect(sheetElement.textContent).toContain(
      "Request observability is unavailable",
    );
    expect(sheetElement.textContent).toContain(
      "No evlog or otel-traces stream is available",
    );
    expect(
      document.querySelector<HTMLButtonElement>(
        '[data-testid="stream-observe-refresh"]',
      )?.disabled,
    ).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    sheet.cleanup();
  });

  it("stays closed without a lookup and closes through the sheet dismissal", async () => {
    const sheet = renderSheet({ lookup: null });

    await flush();

    expect(
      document.querySelector('[data-testid="stream-observe-sheet"]'),
    ).toBeNull();

    sheet.rerender({
      kind: "traceId",
      value: "5b8efff798038103d269b633813fc60c",
    });
    await waitForSelector('[data-testid="stream-observe-sheet"]');

    const closeButton = document.querySelector<HTMLElement>(
      '[data-testid="stream-observe-sheet"] button[type="button"]',
    );
    const radixClose = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="stream-observe-sheet"] button',
      ),
    ).find((button) => button.textContent?.includes("Close"));

    expect(closeButton).not.toBeNull();
    expect(radixClose).toBeDefined();

    if (radixClose) {
      click(radixClose);
    }

    expect(sheet.onClose).toHaveBeenCalledTimes(1);

    sheet.cleanup();
  });
});
