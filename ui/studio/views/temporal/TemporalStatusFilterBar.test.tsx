import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addRecentFilter } from "./temporal-saved-views";
import {
  statusPresetOfQuery,
  TemporalStatusFilterBar,
} from "./TemporalStatusFilterBar";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const namespaceCounts = {
  countsByStatus: { Completed: 7962, Failed: 650, Running: 337, TimedOut: 90 },
  totalCount: 11_270,
};

function render(
  props: Partial<Parameters<typeof TemporalStatusFilterBar>[0]> & {
    query: string;
  },
) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  act(() => {
    createRoot(container).render(
      <TemporalStatusFilterBar
        counts={namespaceCounts}
        isLoadingRows={false}
        onApply={vi.fn()}
        onClearRecent={vi.fn()}
        recentFilters={[]}
        {...props}
      />,
    );
  });

  const pill = (status: string) =>
    container.querySelector<HTMLElement>(
      `[data-testid="temporal-status-pill-${status}"]`,
    );

  return {
    custom: container.querySelector<HTMLElement>(
      '[data-testid="temporal-custom-filter"]',
    ),
    pill,
  };
}

describe("TemporalStatusFilterBar", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps every preset and the counts of the namespace when a status filter is on", () => {
    const { custom, pill } = render({
      matchCount: 90,
      query: 'ExecutionStatus = "TimedOut"',
    });

    expect(pill("All")!.textContent).toBe("All11,270");
    expect(pill("All")!.dataset.state).toBe("off");
    expect(pill("Running")!.textContent).toBe("Running337");
    expect(pill("TimedOut")!.textContent).toBe("Timed Out90");
    expect(pill("TimedOut")!.dataset.state).toBe("on");
    expect(pill("Terminated")).toBeNull();
    expect(custom).toBeNull();
  });

  it("shows any other search as one more selected item with its number of matches", () => {
    const { custom, pill } = render({
      matchCount: 12,
      query: 'TaskQueue = "billing"',
    });

    expect(custom!.textContent).toBe('TaskQueue = "billing"12');
    expect(pill("All")!.dataset.state).toBe("off");
    expect(pill("Running")!.dataset.state).toBe("off");
    expect(pill("All")!.textContent).toBe("All11,270");
  });

  it("offers the recent filters when no search is on", () => {
    expect(render({ query: "" }).custom).toBeNull();

    const { custom, pill } = render({
      query: "",
      recentFilters: ['TaskQueue = "billing"'],
    });

    expect(custom!.textContent).toBe("Recent");
    expect(pill("All")!.dataset.state).toBe("on");
  });
});

describe("statusPresetOfQuery", () => {
  it("reads a filter on one status as that preset and anything else as none", () => {
    expect(statusPresetOfQuery("  ")).toBe("All");
    expect(statusPresetOfQuery('ExecutionStatus="Failed"')).toBe("Failed");
    expect(statusPresetOfQuery("ExecutionStatus = 'TimedOut'")).toBe(
      "TimedOut",
    );
    expect(
      statusPresetOfQuery('ExecutionStatus = "ContinuedAsNew"'),
    ).toBeNull();
    expect(
      statusPresetOfQuery('ExecutionStatus = "Failed" AND TaskQueue = "x"'),
    ).toBeNull();
    expect(statusPresetOfQuery("order-7")).toBeNull();
  });
});

describe("addRecentFilter", () => {
  it("puts a filter first, once, and keeps at most ten", () => {
    expect(addRecentFilter(["a", "b"], "b")).toEqual(["b", "a"]);

    const eleven = Array.from({ length: 11 }, (_, index) => `f${index}`);
    const recent = eleven.reduce(addRecentFilter, [] as string[]);

    expect(recent).toHaveLength(10);
    expect(recent[0]).toBe("f10");
  });
});
