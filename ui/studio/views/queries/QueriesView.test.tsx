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
    requestLlm.mockResolvedValue(
      JSON.stringify({
        improvedSql: "select id from users",
        recommendations: ["Project only the columns the UI needs."],
        summary: "The query over-fetches columns.",
      }),
    );
    useStudioMock.mockReturnValue({
      hasAiQueryRecommendations: false,
      queryInsights: {
        getSnapshot,
      },
      requestLlm,
    });
  });

  afterEach(() => {
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
    expect(container.textContent).toContain("select * from users");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("18ms");
    expect(container.textContent).not.toContain("Recommendations");
    expect(
      container.querySelector('[data-testid="queries-table-shell"]')?.className,
    ).toContain("border-border/70");
    expect(
      [
        ...container.querySelectorAll('[data-testid="queries-metric-card"]'),
      ].every((card) => card.className.includes("border-border/70")),
    ).toBe(true);

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
});
