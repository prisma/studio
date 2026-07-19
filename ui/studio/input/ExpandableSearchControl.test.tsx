import { act, type ComponentPropsWithoutRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExpandableSearchControl } from "./ExpandableSearchControl";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentPropsWithoutRef<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/ui/components/ui/input", () => ({
  Input: ({ className, ...props }: ComponentPropsWithoutRef<"input">) => (
    <input className={className} {...props} />
  ),
}));

function renderSearchControl(
  rowSearchOverrides: Partial<
    ComponentPropsWithoutRef<typeof ExpandableSearchControl>["rowSearch"]
  > = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const rowSearch = {
    acceptSearchSuggestion: vi.fn(),
    closeRowSearch: vi.fn(),
    isRowSearchOpen: true,
    isSearchInputInvalid: false,
    openRowSearch: vi.fn(),
    rowSearchInputRef: {
      current: null,
    },
    searchInput: "",
    searchSuggestions: [
      {
        annotation: "Field",
        group: "Fields",
        id: "field:avg",
        label: "avg:",
        value: "avg:",
      },
      {
        annotation: "Field",
        group: "Fields",
        id: "field:count",
        label: "count:",
        value: "count:",
      },
      {
        annotation: "Field",
        group: "Fields",
        id: "field:max",
        label: "max:",
        value: "max:",
      },
    ],
    searchValidationMessage: null,
    setSearchInput: vi.fn(),
    ...rowSearchOverrides,
  };

  act(() => {
    root.render(
      <ExpandableSearchControl
        alignment="left"
        expandedWidthClassName="w-full"
        rowSearch={rowSearch}
        supportsSearch
      />,
    );
  });

  return {
    container,
    rerender(nextRowSearchOverrides: Partial<typeof rowSearch>) {
      act(() => {
        root.render(
          <ExpandableSearchControl
            alignment="left"
            expandedWidthClassName="w-full"
            rowSearch={{
              ...rowSearch,
              ...nextRowSearchOverrides,
            }}
            supportsSearch
          />,
        );
      });
    },
    root,
    rowSearch,
  };
}

describe("ExpandableSearchControl", () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("renders an inline validation message when the current search input is invalid", () => {
    const { container, root } = renderSearchControl({
      isSearchInputInvalid: true,
      searchInput: "metric:",
      searchSuggestions: [],
      searchValidationMessage: 'Expected a value after "metric:".',
    });

    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Global search"]',
    );
    const validationMessage = container.querySelector(
      '[data-testid="search-validation-message"]',
    );

    expect(searchInput?.getAttribute("aria-invalid")).toBe("true");
    expect(searchInput?.getAttribute("data-search-syntax-message")).toBe(
      'Expected a value after "metric:".',
    );
    expect(validationMessage?.textContent).toContain("Invalid search query");
    expect(validationMessage?.textContent).toContain(
      'Expected a value after "metric:".',
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders grouped search suggestions below the expanded input", () => {
    const { container, root } = renderSearchControl({
      searchInput: "metric:",
      searchSuggestions: [
        {
          annotation: "Field",
          group: "Fields",
          id: "field:metric",
          label: "metric:",
          value: "metric:",
        },
        {
          annotation: "Loaded event value",
          group: "Values",
          id: "value:metric:process.rss.bytes",
          label: 'metric:"process.rss.bytes"',
          value: 'metric:"process.rss.bytes"',
        },
      ],
    });

    const assistPanel = container.querySelector(
      '[data-testid="search-assist-panel"]',
    );

    expect(assistPanel?.textContent).toContain("Fields");
    expect(assistPanel?.textContent).toContain("metric:");
    expect(assistPanel?.textContent).toContain("Values");
    expect(assistPanel?.textContent).toContain('metric:"process.rss.bytes"');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("uses a raised, content-sized assist panel instead of stretching full width", () => {
    const { container, root } = renderSearchControl();

    const inputWrapper = container.querySelector(
      "[data-row-search-input-wrapper]",
    );
    const assistPanel = container.querySelector(
      '[data-testid="search-assist-panel"]',
    );

    expect(inputWrapper?.className).toContain("z-40");
    expect(assistPanel?.className).toContain("z-50");
    expect(assistPanel?.className).toContain("w-max");
    expect(assistPanel?.className).toContain("min-w-[300px]");
    expect(assistPanel?.className).toContain("max-w-full");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders a trailing close button and closes the expanded search when clicked", () => {
    const { container, root, rowSearch } = renderSearchControl({
      searchInput: "metric:",
    });

    const closeButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="search-close-button"]',
    );

    expect(closeButton?.getAttribute("aria-label")).toBe("Close search");

    act(() => {
      closeButton?.click();
    });

    expect(rowSearch.closeRowSearch).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps a single selected suggestion and scrolls it into view while navigating with arrow keys", () => {
    const scrollIntoViewMock = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});

    const { container, root } = renderSearchControl();
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Global search"]',
    );

    act(() => {
      searchInput?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowDown",
        }),
      );
    });

    const suggestionItems = [
      ...container.querySelectorAll<HTMLElement>(
        '[data-testid="search-suggestion-item"]',
      ),
    ];

    expect(
      suggestionItems.filter(
        (item) => item.getAttribute("data-selected") === "true",
      ),
    ).toHaveLength(1);
    expect(suggestionItems[0]?.getAttribute("data-selected")).not.toBe("true");
    expect(suggestionItems[1]?.getAttribute("data-selected")).toBe("true");
    expect(scrollIntoViewMock).toHaveBeenCalled();
    scrollIntoViewMock.mockRestore();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("preserves the highlighted suggestion when the suggestion list rerenders with the same ids", () => {
    const harness = renderSearchControl();
    const searchInput = harness.container.querySelector<HTMLInputElement>(
      'input[aria-label="Global search"]',
    );

    act(() => {
      searchInput?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowDown",
        }),
      );
    });

    harness.rerender({
      searchSuggestions: [
        {
          annotation: "Updated field",
          group: "Fields",
          id: "field:avg",
          label: "avg:",
          value: "avg:",
        },
        {
          annotation: "Updated field",
          group: "Fields",
          id: "field:count",
          label: "count:",
          value: "count:",
        },
        {
          annotation: "Updated field",
          group: "Fields",
          id: "field:max",
          label: "max:",
          value: "max:",
        },
      ],
    });

    const suggestionItems = [
      ...harness.container.querySelectorAll<HTMLElement>(
        '[data-testid="search-suggestion-item"]',
      ),
    ];

    expect(suggestionItems[1]?.getAttribute("data-selected")).toBe("true");
    expect(suggestionItems[0]?.getAttribute("data-selected")).not.toBe("true");

    act(() => {
      harness.root.unmount();
    });
    harness.container.remove();
  });

  it("commits a clicked suggestion on mouse down without double-firing on select", () => {
    const acceptSearchSuggestion = vi.fn();
    const { container, root } = renderSearchControl({
      acceptSearchSuggestion,
    });

    const firstSuggestionItem = container.querySelector<HTMLElement>(
      '[data-testid="search-suggestion-item"]',
    );

    act(() => {
      firstSuggestionItem?.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
        }),
      );
    });

    expect(acceptSearchSuggestion).toHaveBeenCalledTimes(1);
    expect(acceptSearchSuggestion).toHaveBeenCalledWith("avg:");

    act(() => {
      firstSuggestionItem?.dispatchEvent(
        new CustomEvent("select", {
          bubbles: true,
        }),
      );
    });

    expect(acceptSearchSuggestion).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
