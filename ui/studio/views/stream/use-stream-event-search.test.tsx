import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioStreamSearchConfig } from "../../../hooks/use-stream-details";
import type { StudioStreamEvent } from "../../../hooks/use-stream-events";
import { useStreamEventSearch } from "./use-stream-event-search";

const useUiStateMock = vi.fn();

vi.mock("../../../hooks/use-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useUiState: (
      _key: string | undefined,
      initialValue: { isOpen: boolean },
    ) => {
      const [value, setValue] = React.useState(initialValue);

      useUiStateMock.mockImplementation(() => [value, setValue] as const);

      return [value, setValue] as const;
    },
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHarness(args: {
  searchConfig?: StudioStreamSearchConfig | null;
  searchTerm: string;
  setSearchParam: (value: string) => Promise<URLSearchParams>;
  suggestionEvents?: StudioStreamEvent[];
  supportsSearch?: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let currentArgs = args;
  let latestState: ReturnType<typeof useStreamEventSearch> | undefined;

  function Harness() {
    latestState = useStreamEventSearch({
      searchConfig: currentArgs.searchConfig ?? null,
      scopeKey: "prisma-wal",
      searchTerm: currentArgs.searchTerm,
      setSearchParam: currentArgs.setSearchParam,
      suggestionEvents: currentArgs.suggestionEvents ?? [],
      supportsSearch: currentArgs.supportsSearch ?? true,
    });

    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    getLatestState() {
      return latestState;
    },
    rerender(nextArgs: typeof args) {
      currentArgs = nextArgs;

      act(() => {
        root.render(<Harness />);
      });
    },
  };
}

const SEARCH_CONFIG: StudioStreamSearchConfig = {
  aliases: {},
  defaultFields: [],
  fields: {
    metric: {
      aggregatable: true,
      bindings: [
        {
          jsonPointer: "/metric",
          version: 1,
        },
      ],
      column: true,
      exact: true,
      exists: true,
      kind: "keyword",
      positions: false,
      prefix: true,
      sortable: true,
    },
  },
  primaryTimestampField: "metric",
};

const EVENTS: StudioStreamEvent[] = [
  {
    body: {
      metric: "process.rss.bytes",
    },
    exactTimestamp: null,
    id: "event-1",
    indexedFields: [],
    key: null,
    offset: "1",
    preview: "",
    sequence: "1",
    sizeBytes: 1,
    sortOffset: "1",
    streamName: "__stream_metrics__",
  },
];

describe("useStreamEventSearch", () => {
  beforeEach(() => {
    useUiStateMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it('does not auto-apply incomplete field-prefix input like "met"', async () => {
    const setSearchParam = vi.fn(() => Promise.resolve(new URLSearchParams()));
    const harness = renderHarness({
      searchConfig: SEARCH_CONFIG,
      searchTerm: "",
      setSearchParam,
      suggestionEvents: EVENTS,
    });

    act(() => {
      harness.getLatestState()?.openRowSearch();
      harness.getLatestState()?.setSearchInput("met");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(setSearchParam).not.toHaveBeenCalled();
    expect(harness.getLatestState()?.isSearchInputInvalid).toBe(false);
    expect(harness.getLatestState()?.searchValidationMessage).toBeNull();
    expect(
      harness.getLatestState()?.searchSuggestions.map((item) => item.label),
    ).toContain("metric:");

    harness.cleanup();
  });

  it("shows starter field suggestions as soon as the search UI opens", () => {
    const setSearchParam = vi.fn(() => Promise.resolve(new URLSearchParams()));
    const harness = renderHarness({
      searchConfig: SEARCH_CONFIG,
      searchTerm: "",
      setSearchParam,
      suggestionEvents: EVENTS,
    });

    act(() => {
      harness.getLatestState()?.openRowSearch();
    });

    expect(harness.getLatestState()?.isRowSearchOpen).toBe(true);
    expect(harness.getLatestState()?.searchInput).toBe("");
    expect(
      harness.getLatestState()?.searchSuggestions.map((item) => item.label),
    ).toContain("metric:");
    expect(setSearchParam).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("keeps value suggestions available from remembered events and applies a complete suggestion", async () => {
    const setSearchParam = vi.fn(() => Promise.resolve(new URLSearchParams()));
    const harness = renderHarness({
      searchConfig: SEARCH_CONFIG,
      searchTerm: "",
      setSearchParam,
      suggestionEvents: EVENTS,
    });

    act(() => {
      harness.getLatestState()?.openRowSearch();
      harness.getLatestState()?.setSearchInput("metric:");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(setSearchParam).not.toHaveBeenCalled();
    expect(harness.getLatestState()?.isSearchInputInvalid).toBe(true);
    expect(harness.getLatestState()?.searchValidationMessage).toBe(
      'Expected a value after "metric:".',
    );
    expect(
      harness.getLatestState()?.searchSuggestions.map((item) => item.label),
    ).toEqual(['metric:"process.rss.bytes"']);

    act(() => {
      harness
        .getLatestState()
        ?.acceptSearchSuggestion('metric:"process.rss.bytes"');
    });

    expect(harness.getLatestState()?.searchInput).toBe(
      'metric:"process.rss.bytes"',
    );
    expect(setSearchParam).toHaveBeenCalledTimes(1);
    expect(setSearchParam).toHaveBeenCalledWith('metric:"process.rss.bytes"');

    await act(async () => {
      await Promise.resolve();
    });

    expect(harness.getLatestState()?.isSearchInputInvalid).toBe(false);
    expect(harness.getLatestState()?.searchValidationMessage).toBeNull();

    harness.cleanup();
  });

  it("keeps the current suggestion values stable while the search UI stays open", async () => {
    const setSearchParam = vi.fn(() => Promise.resolve(new URLSearchParams()));
    const harness = renderHarness({
      searchConfig: SEARCH_CONFIG,
      searchTerm: "",
      setSearchParam,
      suggestionEvents: EVENTS,
    });

    act(() => {
      harness.getLatestState()?.openRowSearch();
      harness.getLatestState()?.setSearchInput("metric:");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(
      harness.getLatestState()?.searchSuggestions.map((item) => item.label),
    ).toEqual(['metric:"process.rss.bytes"']);

    harness.rerender({
      searchConfig: SEARCH_CONFIG,
      searchTerm: "",
      setSearchParam,
      suggestionEvents: [
        {
          body: {
            metric: "tieredstore.read.bytes",
          },
          exactTimestamp: null,
          id: "event-2",
          indexedFields: [],
          key: null,
          offset: "2",
          preview: "",
          sequence: "2",
          sizeBytes: 1,
          sortOffset: "2",
          streamName: "__stream_metrics__",
        },
      ],
    });

    expect(
      harness.getLatestState()?.searchSuggestions.map((item) => item.label),
    ).toEqual(['metric:"process.rss.bytes"']);

    harness.cleanup();
  });
});
