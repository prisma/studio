import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UseExpandableSearchControlArgs } from "../../../hooks/use-expandable-search-control";
import { useActiveTableRowSearch } from "./use-active-table-row-search";

const useExpandableSearchControlMock = vi.fn();

vi.mock("../../../hooks/use-expandable-search-control", () => ({
  useExpandableSearchControl: (args: UseExpandableSearchControlArgs) =>
    useExpandableSearchControlMock(args),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHarness(args: {
  scopeKey: string;
  searchTerm: string;
  setPageIndexParam: (value: string) => Promise<URLSearchParams>;
  setSearchParam: (value: string) => Promise<URLSearchParams>;
  supportsFullTableSearch: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    useActiveTableRowSearch(args);
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
  };
}

async function flushMicrotasks(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useActiveTableRowSearch", () => {
  it("does not reset pagination when applying the same row-search term", async () => {
    const setPageIndexParam = vi
      .fn<(value: string) => Promise<URLSearchParams>>()
      .mockResolvedValue(new URLSearchParams());
    const setSearchParam = vi
      .fn<(value: string) => Promise<URLSearchParams>>()
      .mockResolvedValue(new URLSearchParams());

    let latestArgs: UseExpandableSearchControlArgs | undefined;
    useExpandableSearchControlMock.mockImplementation(
      (args: UseExpandableSearchControlArgs) => {
        latestArgs = args;
        return {};
      },
    );

    const harness = renderHarness({
      scopeKey: "public.users",
      searchTerm: "",
      setPageIndexParam,
      setSearchParam,
      supportsFullTableSearch: true,
    });

    await act(async () => {
      await latestArgs?.applySearchValue("");
      await flushMicrotasks();
    });

    expect(setSearchParam).not.toHaveBeenCalled();
    expect(setPageIndexParam).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("updates search and resets pagination when applying a new row-search term", async () => {
    const setPageIndexParam = vi
      .fn<(value: string) => Promise<URLSearchParams>>()
      .mockResolvedValue(new URLSearchParams());
    const setSearchParam = vi
      .fn<(value: string) => Promise<URLSearchParams>>()
      .mockResolvedValue(new URLSearchParams());

    let latestArgs: UseExpandableSearchControlArgs | undefined;
    useExpandableSearchControlMock.mockImplementation(
      (args: UseExpandableSearchControlArgs) => {
        latestArgs = args;
        return {};
      },
    );

    const harness = renderHarness({
      scopeKey: "public.users",
      searchTerm: "",
      setPageIndexParam,
      setSearchParam,
      supportsFullTableSearch: true,
    });

    await act(async () => {
      await latestArgs?.applySearchValue("oncall:true");
      await flushMicrotasks();
    });

    expect(setSearchParam).toHaveBeenCalledWith("oncall:true");
    expect(setPageIndexParam).toHaveBeenCalledWith("0");

    harness.cleanup();
  });
});
