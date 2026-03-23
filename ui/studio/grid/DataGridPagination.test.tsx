import type { Table } from "@tanstack/react-table";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataGridPagination } from "./DataGridPagination";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function updateTextInputValue(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickElement(element: HTMLElement) {
  element.dispatchEvent(
    new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }),
  );
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }),
  );
}

function createMockTable(args?: {
  pageCount?: number;
  pageIndex?: number;
  pageSize?: number;
}) {
  const setPageIndex = vi.fn();
  const setPageSize = vi.fn();

  return {
    getCanNextPage: () => true,
    getCanPreviousPage: () => true,
    getPageCount: () => args?.pageCount ?? 189,
    getState: () => ({
      pagination: {
        pageIndex: args?.pageIndex ?? 0,
        pageSize: args?.pageSize ?? 25,
      },
    }),
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    setPageIndex,
    setPageSize,
  } as unknown as Table<Record<string, unknown>> & {
    setPageIndex: typeof setPageIndex;
    setPageSize: typeof setPageSize;
  };
}

describe("DataGridPagination", () => {
  it("uses regular-sized text buttons for the basic pagination variant", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<DataGridPagination table={createMockTable()} />);
    });

    const previousButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.trim() === "Previous");
    const nextButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Next",
    );

    expect(previousButton?.className).toContain("h-8");
    expect(previousButton?.className).not.toContain("w-9");
    expect(nextButton?.className).toContain("h-8");
    expect(nextButton?.className).not.toContain("w-9");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps numeric pagination input fully visible", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridPagination table={createMockTable()} variant="numeric" />,
      );
    });

    const stickyContainer = container.firstElementChild;
    const pageInput = container.querySelector(
      'input[aria-label="Page number"]',
    );
    const pageSizeButton = container.querySelector(
      'button[aria-label="Rows per page"]',
    );
    const infiniteScrollSwitch = container.querySelector(
      '[role="switch"][aria-label="Infinite scroll"]',
    );
    const infiniteScrollLabel = Array.from(
      container.querySelectorAll("label"),
    ).find((label) => label.textContent?.trim() === "infinite scroll");

    if (!(stickyContainer instanceof HTMLElement)) {
      throw new Error("Could not find pagination container");
    }

    if (!(pageInput instanceof HTMLInputElement)) {
      throw new Error("Could not find page number input");
    }

    expect(stickyContainer.className).not.toContain("overflow-clip");
    expect(pageInput.className).toContain("h-9");
    expect(pageInput.getAttribute("type")).toBe("text");
    expect(pageSizeButton).not.toBeNull();
    expect(
      container.querySelector('input[aria-label="Rows per page"]'),
    ).toBeNull();
    expect(pageSizeButton?.textContent?.replace(/\s+/g, " ").trim()).toContain(
      "25 rows per page",
    );
    expect(infiniteScrollSwitch).not.toBeNull();
    expect(infiniteScrollLabel?.className).toContain("font-sans");
    expect(
      container.querySelector('button[aria-label="Go to first page"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Go to previous page"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Go to next page"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Go to last page"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the page number as a tight right-aligned phrase", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridPagination
          table={createMockTable({ pageCount: 40, pageIndex: 0 })}
          variant="numeric"
        />,
      );
    });

    const pageInput = container.querySelector(
      'input[aria-label="Page number"]',
    );

    if (!(pageInput instanceof HTMLInputElement)) {
      throw new Error("Could not find page number input");
    }

    const phraseSpans = Array.from(
      pageInput.parentElement?.querySelectorAll("span") ?? [],
    ).map((span) => span.textContent?.trim());

    expect(pageInput.parentElement?.className).toContain("gap-2");
    expect(pageInput.parentElement?.textContent).not.toContain("Page");
    expect(pageInput.className).toContain("w-auto");
    expect(pageInput.className).toContain("px-1");
    expect(pageInput.className).toContain("tabular-nums");
    expect(pageInput.className).toContain("text-right");
    expect(pageInput.className).not.toContain("text-center");
    expect(pageInput.className).not.toContain("w-12");
    expect(pageInput.style.width).toBe("3ch");
    expect(phraseSpans).toEqual(["of", "40"]);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps the numeric page phrase readable on themed backgrounds", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridPagination
          table={createMockTable({ pageCount: 1, pageIndex: 0 })}
          variant="numeric"
        />,
      );
    });

    const pageInput = container.querySelector(
      'input[aria-label="Page number"]',
    );

    if (!(pageInput instanceof HTMLInputElement)) {
      throw new Error("Could not find page number input");
    }

    expect(pageInput.className).toContain("text-foreground");
    expect(pageInput.parentElement?.className).toContain("text-foreground");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("allows replacing the page number draft and commits on blur", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const table = createMockTable();

    act(() => {
      root.render(<DataGridPagination table={table} variant="numeric" />);
    });

    const pageInput = container.querySelector(
      'input[aria-label="Page number"]',
    );

    if (!(pageInput instanceof HTMLInputElement)) {
      throw new Error("Could not find page number input");
    }

    act(() => {
      updateTextInputValue(pageInput, "");
      updateTextInputValue(pageInput, "12");
    });

    expect(pageInput.value).toBe("12");
    expect(table.setPageIndex).not.toHaveBeenCalled();

    act(() => {
      pageInput.focus();
      pageInput.blur();
    });

    expect(table.setPageIndex).toHaveBeenCalledWith(11);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("commits the page draft on Enter", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const table = createMockTable();

    act(() => {
      root.render(<DataGridPagination table={table} variant="numeric" />);
    });

    const pageInput = container.querySelector(
      'input[aria-label="Page number"]',
    );

    if (!(pageInput instanceof HTMLInputElement)) {
      throw new Error("Could not find page number input");
    }

    act(() => {
      updateTextInputValue(pageInput, "999");
      pageInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });

    expect(table.setPageIndex).toHaveBeenCalledWith(188);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("changes rows per page from the dropdown options", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const table = createMockTable();

    act(() => {
      root.render(<DataGridPagination table={table} variant="numeric" />);
    });

    const pageSizeButton = container.querySelector(
      'button[aria-label="Rows per page"]',
    );

    if (!(pageSizeButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find rows per page trigger");
    }

    act(() => {
      clickElement(pageSizeButton);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const fiftyRowsItem = [
      ...document.querySelectorAll('[role="menuitemradio"]'),
    ].find(
      (item) =>
        item.textContent?.replace(/\s+/g, " ").trim() === "50 rows per page",
    );

    if (!(fiftyRowsItem instanceof HTMLElement)) {
      throw new Error("Could not find 50 rows per page option");
    }

    act(() => {
      clickElement(fiftyRowsItem);
    });

    expect(table.setPageSize).toHaveBeenCalledWith(50);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("toggles infinite scroll when the visible label is clicked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const table = createMockTable();
    const onInfiniteScrollEnabledChange = vi.fn();

    act(() => {
      root.render(
        <DataGridPagination
          onInfiniteScrollEnabledChange={onInfiniteScrollEnabledChange}
          table={table}
          variant="numeric"
        />,
      );
    });

    const infiniteScrollLabel = Array.from(
      container.querySelectorAll("label"),
    ).find((label) => label.textContent?.trim() === "infinite scroll");

    if (!(infiniteScrollLabel instanceof HTMLLabelElement)) {
      throw new Error("Could not find infinite scroll label");
    }

    act(() => {
      clickElement(infiniteScrollLabel);
    });

    expect(onInfiniteScrollEnabledChange).toHaveBeenCalledWith(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("disables the grouped page controls when infinite scroll is enabled", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const table = createMockTable();
    const onInfiniteScrollEnabledChange = vi.fn();

    act(() => {
      root.render(
        <DataGridPagination
          infiniteScrollEnabled
          onInfiniteScrollEnabledChange={onInfiniteScrollEnabledChange}
          table={table}
          variant="numeric"
        />,
      );
    });

    const group = container.querySelector(
      '[role="group"][aria-label="Pagination"]',
    );
    const pageInput = container.querySelector(
      'input[aria-label="Page number"]',
    );
    const pageSizeButton = container.querySelector(
      'button[aria-label="Rows per page"]',
    );
    const infiniteScrollSwitch = container.querySelector(
      '[role="switch"][aria-label="Infinite scroll"]',
    );

    if (!(pageInput instanceof HTMLInputElement)) {
      throw new Error("Could not find page number input");
    }

    if (!(pageSizeButton instanceof HTMLButtonElement)) {
      throw new Error("Could not find rows per page button");
    }

    if (!(infiniteScrollSwitch instanceof HTMLElement)) {
      throw new Error("Could not find infinite scroll switch");
    }

    expect(group).not.toBeNull();
    expect(pageInput.readOnly).toBe(true);
    expect(pageSizeButton.disabled).toBe(true);
    expect(infiniteScrollSwitch.getAttribute("aria-checked")).toBe("true");

    act(() => {
      infiniteScrollSwitch.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(onInfiniteScrollEnabledChange).toHaveBeenCalledWith(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
