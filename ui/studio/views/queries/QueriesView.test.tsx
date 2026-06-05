import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioQueryInsights } from "../../../../data/query-insights";
import { QueriesView } from "./QueriesView";

type StudioMockValue = {
  hasAiQueryRecommendations: boolean;
  queryInsights?: StudioQueryInsights;
  requestLlm: (request: { prompt: string; task: string }) => Promise<string>;
};

const useStudioMock = vi.fn<() => StudioMockValue>();

vi.mock("../../context", () => ({
  useStudio: () => useStudioMock(),
}));

vi.mock("../../StudioHeader", () => ({
  StudioHeader: () => <div>Studio Header</div>,
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

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createAnalysisResponse(level = "info") {
  return JSON.stringify({
    level,
    ...(level === "all-good"
      ? {
          recommendations: [],
          summary: "The query looks healthy.",
        }
      : {
          improvedSql: "select id from users",
          recommendations: ["Project only the columns the UI needs."],
          summary: "The query over-fetches columns.",
        }),
  });
}

function createQuery(id: string, index: number) {
  return {
    count: 1,
    duration: 10 + index,
    id,
    lastSeen: 1_779_963_199_000 + index,
    query: `select * from query_${index}`,
    reads: index,
    rowsReturned: index,
    tables: [`query_${index}`],
  };
}

function getFirstPathPoint(path: string): { x: number; y: number } | null {
  const match = path.match(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  };
}

describe("QueriesView", () => {
  const getSnapshot = vi.fn<StudioQueryInsights["getSnapshot"]>();
  const requestLlm = vi.fn<StudioMockValue["requestLlm"]>();

  beforeEach(() => {
    getSnapshot.mockReset();
    requestLlm.mockReset();
    getSnapshot.mockResolvedValue([
      null,
      {
        generatedAt: 1_779_963_200_000,
        pollingIntervalMs: 0,
        queries: [
          {
            count: 3,
            duration: 18,
            id: "query-1",
            lastSeen: 1_779_963_199_000,
            query: "select * from users",
            reads: 9,
            rowsReturned: 3,
            tables: ["users"],
          },
        ],
      },
    ]);
    requestLlm.mockResolvedValue(createAnalysisResponse());
    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: false,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("renders query rows from the injected query-insights provider", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    expect(getSnapshot.mock.calls[0]?.[0]).toEqual({ limit: 500 });
    expect(getSnapshot.mock.calls[0]?.[1]?.abortSignal).toBeInstanceOf(
      AbortSignal,
    );
    expect(container.textContent).toContain(
      "Monitor database activity and identify and fix poorly-performing queries in your application.",
    );
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="https://www.prisma.io/docs/orm/prisma-client/queries/advanced/query-optimization-performance#enabling-prisma-orm-attribution"]',
      )?.textContent,
    ).toBe("Find out how to see your Prisma ORM calls.");
    expect(
      container
        .querySelector<HTMLAnchorElement>(
          'a[href="https://www.prisma.io/docs/orm/prisma-client/queries/advanced/query-optimization-performance#enabling-prisma-orm-attribution"]',
        )
        ?.closest("p")?.className,
    ).toContain("max-w-5xl");
    expect(container.textContent).toContain("select * from users");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("18ms");
    expect(container.textContent).not.toContain("Recommendations");
    expect(container.textContent).not.toContain("Analysis");
    expect(container.textContent).not.toContain("Analyze");
    expect(
      container.querySelector('[aria-label="Filter queries by table"]')
        ?.textContent,
    ).toBe("All");
    expect(
      container.querySelector('[aria-label="Sort queries"]')?.textContent,
    ).toBe("Rows returned high to low");
    expect(container.textContent).toContain("Rows Returned");
    expect(container.textContent).not.toContain("Reads high to low");
    expect(container.textContent).not.toContain("Table:");
    expect(container.textContent).not.toContain("Sort:");
    expect(container.textContent).not.toContain("Live updates active");
    expect(container.textContent).not.toContain("Live updates paused");
    expect(container.textContent).not.toContain("Refresh");
    const activityChart = container.querySelector(
      '[data-testid="queries-activity-chart"]',
    );

    expect(activityChart?.textContent).not.toContain("Activity");
    expect(activityChart?.textContent).toContain("Queries/s");
    expect(activityChart?.textContent).toContain("n/a");
    expect(activityChart?.textContent).toContain("Avg latency");
    expect(activityChart?.textContent).toContain("18ms");
    expect(container.textContent).not.toContain("Waiting for query activity");
    expect(
      container.querySelector('[aria-label="Show the last 5m"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Show the last 1m"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Show the last 15m"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Show the last 1h"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("Unique Queries");
    expect(container.textContent).not.toContain("Average Latency");
    expect(
      container.querySelector('[data-testid="queries-table-shell"]')?.className,
    ).toContain("border-border/70");
    expect(
      container.querySelector('[data-testid="queries-metric-card"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders a quiet activity chart empty state", async () => {
    getSnapshot.mockResolvedValueOnce([
      null,
      {
        generatedAt: 1_779_963_200_000,
        pollingIntervalMs: 0,
        queries: [],
      },
    ]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    const activityChart = container.querySelector(
      '[data-testid="queries-activity-chart"]',
    );
    const activitySvg = container.querySelector(
      '[data-testid="queries-activity-svg"]',
    );

    expect(activityChart?.textContent).toContain("Waiting for query activity");
    expect(activityChart?.textContent).not.toContain("-5m");
    expect(activityChart?.textContent).not.toContain("now");
    expect(activitySvg?.querySelectorAll("line")).toHaveLength(0);
    expect(
      container.querySelector('[data-testid="queries-activity-queries-path"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="queries-activity-latency-path"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("derives live activity chart samples from query snapshot deltas", async () => {
    vi.useFakeTimers();
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 3,
              duration: 18,
              id: "query-1",
              lastSeen: 1_779_963_199_000,
              query: "select * from users",
              reads: 9,
              rowsReturned: 3,
              tables: ["users"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_201_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 5,
              duration: 18.8,
              id: "query-1",
              lastSeen: 1_779_963_201_000,
              query: "select * from users",
              reads: 12,
              rowsReturned: 5,
              tables: ["users"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_202_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 5,
              duration: 18.8,
              id: "query-1",
              lastSeen: 1_779_963_201_000,
              query: "select * from users",
              reads: 12,
              rowsReturned: 5,
              tables: ["users"],
            },
          ],
        },
      ]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const chart = container.querySelector(
      '[data-testid="queries-activity-chart"]',
    );

    expect(chart?.textContent).toContain("2.0/s");
    expect(chart?.textContent).toContain("20ms");
    expect(
      container.querySelector('[data-testid="queries-activity-svg"]')
        ?.className,
    ).toContain("w-full");

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(chart?.textContent).toContain("1.0/s");
    expect(chart?.textContent).toContain("20ms");
    const queriesPath =
      container
        .querySelector('[data-testid="queries-activity-queries-path"]')
        ?.getAttribute("d") ?? "";
    const latencyPath =
      container
        .querySelector('[data-testid="queries-activity-latency-path"]')
        ?.getAttribute("d") ?? "";

    expect(queriesPath.match(/L/g)).toHaveLength(1);
    expect(latencyPath.match(/L/g)).toHaveLength(1);

    const plot = container.querySelector(
      '[data-testid="queries-activity-plot"]',
    );

    expect(plot).not.toBeNull();

    act(() => {
      plot!.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 620,
          clientY: 40,
        }),
      );
    });

    const tooltip = container.querySelector(
      '[data-testid="queries-activity-tooltip"]',
    );

    expect(tooltip?.textContent).toContain("Queries/s");
    expect(tooltip?.textContent).toContain("Avg latency");
    expect(
      tooltip
        ?.querySelector('[data-testid="queries-activity-tooltip-queries"]')
        ?.className.includes("gap-4"),
    ).toBe(true);
    expect(
      tooltip
        ?.querySelector('[data-testid="queries-activity-tooltip-queries"]')
        ?.querySelector(".bg-sky-500"),
    ).not.toBeNull();
    expect(
      tooltip
        ?.querySelector('[data-testid="queries-activity-tooltip-queries"]')
        ?.querySelector(".text-sky-600"),
    ).not.toBeNull();
    expect(
      tooltip
        ?.querySelector('[data-testid="queries-activity-tooltip-latency"]')
        ?.querySelector(".bg-emerald-500"),
    ).not.toBeNull();
    expect(
      tooltip
        ?.querySelector('[data-testid="queries-activity-tooltip-latency"]')
        ?.querySelector(".text-emerald-600"),
    ).not.toBeNull();

    const oneHourButton = container.querySelector(
      '[aria-label="Show the last 1h"]',
    );

    expect(oneHourButton).not.toBeNull();

    act(() => {
      click(oneHourButton!);
    });

    expect(chart?.textContent).toContain("-1h");

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("keeps cumulative first-snapshot counts out of live chart summaries after idle polling", async () => {
    vi.useFakeTimers();
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 21,
              duration: 5,
              id: "query-1",
              lastSeen: 1_779_963_185_000,
              query: "select * from users",
              reads: 21,
              rowsReturned: 21,
              tables: ["users"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_201_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 21,
              duration: 5,
              id: "query-1",
              lastSeen: 1_779_963_185_000,
              query: "select * from users",
              reads: 21,
              rowsReturned: 21,
              tables: ["users"],
            },
          ],
        },
      ]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const chart = container.querySelector(
      '[data-testid="queries-activity-chart"]',
    );
    const queriesPath =
      container
        .querySelector('[data-testid="queries-activity-queries-path"]')
        ?.getAttribute("d") ?? "";

    expect(chart?.textContent).toContain("0/s");
    expect(chart?.textContent).toContain("5ms");
    expect(queriesPath.match(/L/g)).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-testid="queries-activity-queries-point"]',
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll(
        '[data-testid="queries-activity-latency-point"]',
      ),
    ).toHaveLength(1);

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("plots newly observed executions as one-second throughput buckets", async () => {
    vi.useFakeTimers();
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_207_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 1,
              duration: 17,
              id: "query-1",
              lastSeen: 1_779_963_206_000,
              query: "select * from users",
              reads: 1,
              rowsReturned: 1,
              tables: ["users"],
            },
          ],
        },
      ]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const chart = container.querySelector(
      '[data-testid="queries-activity-chart"]',
    );
    const plot = container.querySelector(
      '[data-testid="queries-activity-plot"]',
    );

    expect(chart?.textContent).toContain("0.14/s");
    expect(plot).not.toBeNull();

    act(() => {
      plot!.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 620,
          clientY: 40,
        }),
      );
    });

    const tooltip = container.querySelector(
      '[data-testid="queries-activity-tooltip"]',
    );

    expect(tooltip?.textContent).toContain("Queries/s");
    expect(tooltip?.textContent).toContain("1.0/s");
    expect(tooltip?.textContent).toContain("Avg latency");
    expect(tooltip?.textContent).toContain("17ms");

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("aggregates chart executions that land in the same one-second bucket", async () => {
    vi.useFakeTimers();
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_600,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 1,
              duration: 12,
              id: "query-1",
              lastSeen: 1_779_963_200_500,
              query: "select * from users",
              reads: 1,
              rowsReturned: 1,
              tables: ["users"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_900,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 2,
              duration: 14,
              id: "query-1",
              lastSeen: 1_779_963_200_800,
              query: "select * from users",
              reads: 2,
              rowsReturned: 2,
              tables: ["users"],
            },
          ],
        },
      ]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const chart = container.querySelector(
      '[data-testid="queries-activity-chart"]',
    );
    const row = container.querySelector("tbody tr");

    expect(chart?.textContent).toContain("2.2/s");
    expect(row?.textContent).toContain("2");

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("visually separates overlapping throughput and latency peaks", async () => {
    vi.useFakeTimers();
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_201_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 1,
              duration: 1,
              id: "query-1",
              lastSeen: 1_779_963_201_000,
              query: "select * from users",
              reads: 1,
              rowsReturned: 1,
              tables: ["users"],
            },
          ],
        },
      ]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const queriesPoint = getFirstPathPoint(
      container
        .querySelector('[data-testid="queries-activity-queries-path"]')
        ?.getAttribute("d") ?? "",
    );
    const latencyPoint = getFirstPathPoint(
      container
        .querySelector('[data-testid="queries-activity-latency-path"]')
        ?.getAttribute("d") ?? "",
    );

    expect(queriesPoint).not.toBeNull();
    expect(latencyPoint).not.toBeNull();
    expect(latencyPoint!.x).toBe(queriesPoint!.x);
    expect(latencyPoint!.y).toBeGreaterThan(queriesPoint!.y);

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("continues chart deltas from cached totals when returning to the Queries view", async () => {
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 0,
          queries: [
            {
              count: 10,
              duration: 5,
              id: "query-1",
              lastSeen: 1_779_963_200_000,
              query: "select * from users",
              reads: 10,
              rowsReturned: 10,
              tables: ["users"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_204_000,
          pollingIntervalMs: 0,
          queries: [
            {
              count: 14,
              duration: 5,
              id: "query-1",
              lastSeen: 1_779_963_204_000,
              query: "select * from users",
              reads: 14,
              rowsReturned: 14,
              tables: ["users"],
            },
          ],
        },
      ]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const firstRoot = createRoot(container);

    act(() => {
      firstRoot.render(<QueriesView />);
    });
    await flushMicrotasks();

    act(() => {
      firstRoot.unmount();
    });

    const secondRoot = createRoot(container);

    act(() => {
      secondRoot.render(<QueriesView />);
    });
    await flushMicrotasks();

    const chart = container.querySelector(
      '[data-testid="queries-activity-chart"]',
    );
    const queriesPath =
      container
        .querySelector('[data-testid="queries-activity-queries-path"]')
        ?.getAttribute("d") ?? "";

    expect(chart?.textContent).toContain("1.0/s");
    expect(chart?.textContent).not.toContain("14.0/s");
    expect(queriesPath.match(/L/g)).toBeNull();

    act(() => {
      secondRoot.unmount();
    });
    container.remove();
  });

  it("breaks the live chart line across time spent away from the Queries view", async () => {
    vi.useFakeTimers();
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_201_000,
          pollingIntervalMs: 1000,
          queries: [],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_261_000,
          pollingIntervalMs: 0,
          queries: [
            {
              count: 1,
              duration: 5,
              id: "query-1",
              lastSeen: 1_779_963_261_000,
              query: "select * from users",
              reads: 1,
              rowsReturned: 1,
              tables: ["users"],
            },
          ],
        },
      ]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const firstRoot = createRoot(container);

    act(() => {
      firstRoot.render(<QueriesView />);
    });
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    act(() => {
      firstRoot.unmount();
    });

    const secondRoot = createRoot(container);

    act(() => {
      secondRoot.render(<QueriesView />);
    });
    await flushMicrotasks();

    const queriesPath =
      container
        .querySelector('[data-testid="queries-activity-queries-path"]')
        ?.getAttribute("d") ?? "";

    expect(queriesPath.match(/M/g)).toHaveLength(2);
    expect(queriesPath.match(/L/g)).toBeNull();

    act(() => {
      secondRoot.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("filters query rows to the selected activity chart window", async () => {
    getSnapshot.mockResolvedValueOnce([
      null,
      {
        generatedAt: 1_779_963_600_000,
        pollingIntervalMs: 0,
        queries: [
          {
            count: 1,
            duration: 10,
            id: "recent-query",
            lastSeen: 1_779_963_540_000,
            query: "select * from recent_events",
            reads: 12,
            rowsReturned: 5,
            tables: ["recent_events"],
          },
          {
            count: 1,
            duration: 20,
            id: "older-query",
            lastSeen: 1_779_963_000_000,
            query: "select * from older_events",
            reads: 24,
            rowsReturned: 10,
            tables: ["older_events"],
          },
        ],
      },
    ]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    expect(container.textContent).toContain("select * from recent_events");
    expect(container.textContent).not.toContain("select * from older_events");

    const fifteenMinuteButton = container.querySelector(
      '[aria-label="Show the last 15m"]',
    );

    expect(fifteenMinuteButton).not.toBeNull();

    act(() => {
      click(fifteenMinuteButton!);
    });

    expect(container.textContent).toContain("select * from recent_events");
    expect(container.textContent).toContain("select * from older_events");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("scopes query row counters to measured activity in the selected chart window", async () => {
    vi.useFakeTimers();
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 10,
              duration: 10,
              id: "query-1",
              lastSeen: 1_779_962_800_000,
              query: "select * from users",
              reads: 100,
              rowsReturned: 1000,
              tables: ["users"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_201_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 12,
              duration: 11,
              id: "query-1",
              lastSeen: 1_779_963_201_000,
              query: "select * from users",
              reads: 120,
              rowsReturned: 1200,
              tables: ["users"],
            },
          ],
        },
      ]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const row = [...container.querySelectorAll("tbody tr")].find((element) =>
      element.textContent?.includes("select * from users"),
    );
    const cells = [...(row?.querySelectorAll("td") ?? [])];

    expect(row).not.toBeUndefined();
    expect(cells[2]?.textContent).toBe("2");
    expect(cells[3]?.textContent).toBe("200");
    expect(row?.textContent).not.toContain("12");
    expect(row?.textContent).not.toContain("1.2K");

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("does not duplicate first-snapshot context rows when a stale snapshot repeats", async () => {
    vi.useFakeTimers();
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 10,
              duration: 10,
              id: "query-1",
              lastSeen: 1_779_963_199_000,
              query: "select * from users",
              reads: 100,
              rowsReturned: 1000,
              tables: ["users"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 12,
              duration: 12,
              id: "query-1",
              lastSeen: 1_779_963_200_500,
              query: "select * from users",
              reads: 120,
              rowsReturned: 1200,
              tables: ["users"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_201_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 12,
              duration: 12,
              id: "query-1",
              lastSeen: 1_779_963_200_500,
              query: "select * from users",
              reads: 120,
              rowsReturned: 1200,
              tables: ["users"],
            },
          ],
        },
      ]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const row = [...container.querySelectorAll("tbody tr")].find((element) =>
      element.textContent?.includes("select * from users"),
    );
    const cells = [...(row?.querySelectorAll("td") ?? [])];

    expect(getSnapshot).toHaveBeenCalledTimes(3);
    expect(cells[2]?.textContent).toBe("3");
    expect(cells[3]?.textContent).toBe("300");

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("treats advanced reset counters as fresh measured activity", async () => {
    vi.useFakeTimers();
    getSnapshot
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_200_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 10,
              duration: 10,
              id: "query-1",
              lastSeen: 1_779_962_800_000,
              query: "select * from users",
              reads: 100,
              rowsReturned: 1000,
              tables: ["users"],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        null,
        {
          generatedAt: 1_779_963_201_000,
          pollingIntervalMs: 1000,
          queries: [
            {
              count: 2,
              duration: 6,
              id: "query-1",
              lastSeen: 1_779_963_201_000,
              query: "select * from users",
              reads: 20,
              rowsReturned: 200,
              tables: ["users"],
            },
          ],
        },
      ]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const chart = container.querySelector(
      '[data-testid="queries-activity-chart"]',
    );
    const row = [...container.querySelectorAll("tbody tr")].find((element) =>
      element.textContent?.includes("select * from users"),
    );
    const cells = [...(row?.querySelectorAll("td") ?? [])];

    expect(chart?.textContent).toContain("2.0/s");
    expect(chart?.textContent).toContain("6ms");
    expect(cells[2]?.textContent).toBe("2");
    expect(cells[3]?.textContent).toBe("200");

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("renders initial snapshot history as isolated points instead of connected aggregate lines", async () => {
    getSnapshot.mockResolvedValueOnce([
      null,
      {
        generatedAt: 1_779_963_600_000,
        pollingIntervalMs: 0,
        queries: [
          {
            count: 1,
            duration: 10,
            id: "query-1",
            lastSeen: 1_779_960_000_000,
            query: "select * from users",
            reads: 12,
            rowsReturned: 5,
            tables: ["users"],
          },
          {
            count: 1,
            duration: 12,
            id: "query-2",
            lastSeen: 1_779_960_020_000,
            query: "select * from teams",
            reads: 12,
            rowsReturned: 5,
            tables: ["teams"],
          },
          {
            count: 1,
            duration: 30,
            id: "query-3",
            lastSeen: 1_779_963_540_000,
            query: "select * from projects",
            reads: 12,
            rowsReturned: 5,
            tables: ["projects"],
          },
        ],
      },
    ]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    const oneHourButton = container.querySelector(
      '[aria-label="Show the last 1h"]',
    );

    expect(oneHourButton).not.toBeNull();

    act(() => {
      click(oneHourButton!);
    });

    const queriesPath =
      container
        .querySelector('[data-testid="queries-activity-queries-path"]')
        ?.getAttribute("d") ?? "";

    expect(queriesPath.match(/M/g)).toBeNull();
    expect(queriesPath.match(/L/g)).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-testid="queries-activity-queries-point"]',
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll(
        '[data-testid="queries-activity-latency-point"]',
      ),
    ).toHaveLength(3);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("uses Studio llm for recommendations only when the AI capability exists", async () => {
    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: true,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    const rowButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("select * from users"),
    );

    expect(rowButton).not.toBeUndefined();

    act(() => {
      click(rowButton!);
    });
    await flushMicrotasks();

    expect(document.body.querySelector(".ps [role='dialog']")).not.toBeNull();
    expect(requestLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "query-insights",
      }),
    );
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(
        "Project only the columns the UI needs.",
      );
    });
    expect(document.body.textContent).toContain("Recommendations");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("copies the SQL text and recommendation from the query details sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: true,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });
    requestLlm.mockResolvedValueOnce(
      JSON.stringify({
        improvedPrisma: "await prisma.user.findMany({ select: { id: true } })",
        improvedSql: "select id from users",
        level: "info",
        recommendations: [
          "Project only the columns the UI needs.",
          "Keep pagination count queries separate from row fetches.",
        ],
        summary: "The query over-fetches columns.",
      }),
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    const rowButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("select * from users"),
    );

    expect(rowButton).not.toBeUndefined();

    act(() => {
      click(rowButton!);
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(
        "Project only the columns the UI needs.",
      );
    });

    const copySqlButton = document.body.querySelector(
      '[aria-label="Copy SQL text"]',
    );
    const copyRecommendationButton = document.body.querySelector(
      '[aria-label="Copy recommendation"]',
    );

    expect(copySqlButton).not.toBeNull();
    expect(copyRecommendationButton).not.toBeNull();

    await act(async () => {
      click(copySqlButton!);
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenLastCalledWith("select * from users");

    await act(async () => {
      click(copyRecommendationButton!);
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenLastCalledWith(
      [
        "Recommendation",
        "The query over-fetches columns.",
        "",
        "- Project only the columns the UI needs.",
        "- Keep pagination count queries separate from row fetches.",
        "",
        "SQL",
        "select id from users",
        "",
        "Prisma",
        "await prisma.user.findMany({ select: { id: true } })",
      ].join("\n"),
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("runs automatic query analysis serially, stops after five groups, and allows manual analysis", async () => {
    getSnapshot.mockResolvedValueOnce([
      null,
      {
        generatedAt: 1_779_963_200_000,
        pollingIntervalMs: 0,
        queries: Array.from({ length: 6 }, (_, index) =>
          createQuery(`query-${index + 1}`, index + 1),
        ),
      },
    ]);
    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: true,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });

    const resolveAnalysisRequests: Array<(value: string) => void> = [];
    requestLlm.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveAnalysisRequests.push(resolve);
        }),
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    expect(container.textContent).toContain("Analysis");
    expect(requestLlm).toHaveBeenCalledTimes(1);
    expect(
      container.querySelectorAll('[data-testid="queries-analysis-loading"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-testid="queries-analysis-queued"]'),
    ).toHaveLength(4);

    for (let index = 0; index < 5; index += 1) {
      await act(async () => {
        resolveAnalysisRequests[index]?.(createAnalysisResponse("warning"));
        await Promise.resolve();
      });
      await flushMicrotasks();
      expect(requestLlm).toHaveBeenCalledTimes(Math.min(index + 2, 5));
    }

    expect(
      container.querySelectorAll(
        '[aria-label="Open warning analysis for suggested fix and complete fix prompt"]',
      ),
    ).toHaveLength(5);
    expect(
      container
        .querySelector(
          '[aria-label="Open warning analysis for suggested fix and complete fix prompt"]',
        )
        ?.getAttribute("title"),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-testid="queries-analysis-loading"]'),
    ).toHaveLength(0);

    const manualAnalyzeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Analyze",
    );

    expect(manualAnalyzeButton).not.toBeUndefined();

    act(() => {
      click(manualAnalyzeButton!);
    });
    await flushMicrotasks();

    expect(requestLlm).toHaveBeenCalledTimes(6);
    expect(
      container.querySelectorAll('[data-testid="queries-analysis-loading"]'),
    ).toHaveLength(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("lets opening a query beyond the automatic cap queue a manual analysis in the detail sheet", async () => {
    getSnapshot.mockResolvedValueOnce([
      null,
      {
        generatedAt: 1_779_963_200_000,
        pollingIntervalMs: 0,
        queries: Array.from({ length: 6 }, (_, index) =>
          createQuery(`query-${index + 1}`, index + 1),
        ),
      },
    ]);
    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: true,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });

    const resolveAnalysisRequests: Array<(value: string) => void> = [];
    requestLlm.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveAnalysisRequests.push(resolve);
        }),
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    const uncappedQueryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("select * from query_6"),
    );

    expect(uncappedQueryButton).not.toBeUndefined();

    act(() => {
      click(uncappedQueryButton!);
    });
    await flushMicrotasks();

    expect(document.body.querySelector(".ps [role='dialog']")).not.toBeNull();
    expect(document.body.textContent).toContain(
      "Waiting for the current analysis to finish.",
    );
    expect(requestLlm).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 5; index += 1) {
      await act(async () => {
        resolveAnalysisRequests[index]?.(createAnalysisResponse("info"));
        await Promise.resolve();
      });
      await flushMicrotasks();
    }

    expect(requestLlm).toHaveBeenCalledTimes(6);

    await act(async () => {
      resolveAnalysisRequests[5]?.(createAnalysisResponse("all-good"));
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("All good");
    });
    expect(document.body.textContent).toContain("The query looks healthy.");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not present all-good analysis as a fix prompt", async () => {
    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: true,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });
    requestLlm.mockResolvedValueOnce(createAnalysisResponse("all-good"));

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    const allGoodButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Good"),
    );

    expect(allGoodButton).not.toBeUndefined();
    expect(allGoodButton?.getAttribute("aria-label")).toBe(
      "Open all good analysis details",
    );
    expect(allGoodButton?.getAttribute("aria-label")).not.toContain("fix");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("surfaces AI analysis failures and retries them from the table action", async () => {
    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: true,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });
    requestLlm
      .mockRejectedValueOnce(new Error("AI provider unavailable"))
      .mockResolvedValueOnce(createAnalysisResponse("warning"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();
    await vi.waitFor(() => {
      expect(
        container.querySelector('[aria-label="Retry query analysis"]'),
      ).not.toBeNull();
    });

    expect(container.textContent).toContain("Analyze");

    act(() => {
      click(container.querySelector('[aria-label="Retry query analysis"]')!);
    });
    await flushMicrotasks();

    expect(requestLlm).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[aria-label="Open warning analysis for suggested fix and complete fix prompt"]',
        ),
      ).not.toBeNull();
    });
    expect(container.textContent).toContain("Warn");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("only automatically analyzes query rows inside the selected activity window", async () => {
    getSnapshot.mockResolvedValueOnce([
      null,
      {
        generatedAt: 1_779_963_600_000,
        pollingIntervalMs: 0,
        queries: [
          {
            ...createQuery("older-query", 1),
            lastSeen: 1_779_963_000_000,
            query: "select * from older_events",
            tables: ["older_events"],
          },
          {
            ...createQuery("recent-query", 2),
            lastSeen: 1_779_963_540_000,
            query: "select * from recent_events",
            tables: ["recent_events"],
          },
        ],
      },
    ]);
    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: true,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    expect(requestLlm).toHaveBeenCalledTimes(1);
    expect(requestLlm.mock.calls[0]?.[0].prompt).toContain(
      "select * from recent_events",
    );
    expect(requestLlm.mock.calls[0]?.[0].prompt).not.toContain(
      "select * from older_events",
    );

    const fifteenMinuteButton = container.querySelector(
      '[aria-label="Show the last 15m"]',
    );

    expect(fifteenMinuteButton).not.toBeNull();

    act(() => {
      click(fifteenMinuteButton!);
    });
    await flushMicrotasks();

    expect(requestLlm).toHaveBeenCalledTimes(2);
    expect(requestLlm.mock.calls[1]?.[0].prompt).toContain(
      "select * from older_events",
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not start duplicate AI recommendation requests for the selected query while polling updates", async () => {
    vi.useFakeTimers();
    getSnapshot.mockResolvedValueOnce([
      null,
      {
        generatedAt: 1_779_963_200_000,
        pollingIntervalMs: 1000,
        queries: [
          {
            count: 3,
            duration: 18,
            id: "query-1",
            lastSeen: 1_779_963_199_000,
            query: "select * from users",
            reads: 9,
            rowsReturned: 3,
            tables: ["users"],
          },
        ],
      },
    ]);
    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: true,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });

    let resolveAnalysis: (value: string) => void = () => {};
    requestLlm.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveAnalysis = resolve;
      }),
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueriesView />);
    });
    await flushMicrotasks();

    const rowButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("select * from users"),
    );

    expect(rowButton).not.toBeUndefined();

    act(() => {
      click(rowButton!);
    });
    await flushMicrotasks();

    expect(requestLlm).toHaveBeenCalledTimes(1);

    getSnapshot.mockResolvedValueOnce([
      null,
      {
        generatedAt: 1_779_963_201_000,
        pollingIntervalMs: 1000,
        queries: [
          {
            count: 4,
            duration: 20,
            id: "query-1",
            lastSeen: 1_779_963_201_000,
            query: "select * from users",
            reads: 11,
            rowsReturned: 3,
            tables: ["users"],
          },
        ],
      },
    ]);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(requestLlm).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAnalysis(createAnalysisResponse());
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(
        "Project only the columns the UI needs.",
      );
    });

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });
});
