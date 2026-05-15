import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryInsightsView } from "./QueryInsightsView";
import type { QueryInsightsQuery } from "./types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const {
  analyzeMock,
  pauseMock,
  queryInsightsMock,
  queryRowsState,
  resumeMock,
  setQueryInsightsSortParamMock,
  setQueryInsightsTableParamMock,
} = vi.hoisted(() => ({
  ...(() => {
    const analyzeMock = vi.fn();
    const enableAiRecommendationsMock = vi.fn();
    const queryInsightsMock = {
      aiRecommendationsEnabled: true,
      analyze: analyzeMock,
      enableAiRecommendations: enableAiRecommendationsMock,
      onEvent: vi.fn(),
      streamUrl: "/api/query-insights",
    };

    return {
      analyzeMock,
      enableAiRecommendationsMock,
      pauseMock: vi.fn(),
      queryInsightsMock,
      queryRowsState: {
        queries: [] as QueryInsightsQuery[],
      },
      resumeMock: vi.fn(),
      setQueryInsightsSortParamMock: vi.fn(),
      setQueryInsightsTableParamMock: vi.fn(),
    };
  })(),
}));

vi.mock("../../context", () => ({
  useStudio: () => ({
    hasDatabase: true,
    isNavigationOpen: true,
    queryInsights: queryInsightsMock,
    toggleNavigation: vi.fn(),
  }),
}));

vi.mock("../../StudioHeader", () => ({
  StudioHeader: ({
    children,
    endContent,
  }: {
    children?: ReactNode;
    endContent?: ReactNode;
  }) => (
    <div>
      {children}
      {endContent}
    </div>
  ),
}));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({
    queryInsightsSortParam: null,
    queryInsightsTableParam: null,
    setQueryInsightsSortParam: setQueryInsightsSortParamMock,
    setQueryInsightsTableParam: setQueryInsightsTableParamMock,
  }),
}));

vi.mock("./use-query-insights-stream", () => ({
  useQueryInsightsStream: () => ({ status: "open" }),
}));

vi.mock("./use-query-insights-rows", () => ({
  useQueryInsightsRows: () => ({
    flushedIds: new Set<string>(),
    ingestQueries: vi.fn(),
    isAtLimit: false,
    isPaused: false,
    pause: pauseMock,
    pauseBufferSize: 0,
    queries: queryRowsState.queries,
    recentlyAddedIds: new Set<string>(),
    resume: resumeMock,
  }),
}));

function createQuery(overrides: Partial<QueryInsightsQuery> = {}) {
  return {
    count: 281,
    duration: 0,
    groupKey: null,
    id: "query-1",
    lastSeen: 1_700_000_000_000,
    maxDurationMs: 0,
    minDurationMs: 0,
    prismaQueryInfo: null,
    query:
      "WITH state_mapping AS ( SELECT CASE WHEN state = 'active' AND wait_event_type IS NULL THEN 'active' WHEN state = 'active' AND wait_event_type IS NOT NULL THEN 'waiting' END AS state FROM pg_stat_activity ) SELECT * FROM state_mapping",
    queryId: null,
    reads: 3,
    rowsReturned: 42,
    tables: ["state_mapping"],
    ...overrides,
  } satisfies QueryInsightsQuery;
}

describe("QueryInsightsView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queryRowsState.queries = [createQuery()];
    analyzeMock.mockResolvedValue({
      error: null,
      result: {
        analysisMarkdown:
          "## Problem\nThe query scans more rows than needed.\n\n## Why it matters\nExtra reads can slow down interactive workflows.",
        improvedSql: "CREATE INDEX state_mapping_idx ON state_mapping (state);",
        isOptimal: false,
        issuesFound: ["Sequential scan"],
        recommendations: ["Adding an index could reduce reads by 80%."],
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("opens the original right-side AI drawer for a selected query", async () => {
    const container = document.createElement("div");
    container.className = "ps";
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<QueryInsightsView />);
    });

    const tableFrame = container.querySelector<HTMLElement>(
      '[data-testid="query-insights-table"]',
    )?.parentElement;

    expect(tableFrame?.className).toContain("border-transparent");
    expect(tableFrame?.className).toContain("rounded-sm");
    expect(tableFrame?.className).toContain("after:border-border");

    const queryRow = Array.from(
      container.querySelectorAll<HTMLElement>('[role="button"]'),
    ).find((element) => element.textContent?.includes("WITH state_mapping"));

    expect(queryRow).not.toBeUndefined();

    act(() => {
      queryRow?.click();
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');

    expect(dialog?.className).toContain("right-2");
    expect(dialog?.className).toContain("rounded-xl");
    expect(container.contains(dialog)).toBe(true);
    expect(document.body.textContent).toContain(
      "This SQL query reads from state_mapping.",
    );
    expect(document.body.textContent).toContain("Show full query");
    expect(document.body.textContent).toContain("Analyzing query...");
    expect(pauseMock).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(document.body.textContent).toContain("Recommendations");
    expect(document.body.textContent).not.toContain("## Problem");
    expect(document.body.textContent).toContain(
      "Extra reads can slow down interactive workflows.",
    );
    expect(document.body.textContent).toContain(
      "Adding an index could reduce reads by 80%.",
    );
    expect(
      document.body.querySelector<HTMLElement>(".text-primary")?.textContent,
    ).toBe("80%");
  });
});
