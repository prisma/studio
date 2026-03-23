import type { Header } from "@tanstack/react-table";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Column } from "../../../data/adapter";
import { DataGridHeader } from "./DataGridHeader";

vi.mock("./DataGridHeaderCell", () => ({
  DataGridHeaderCell: () => <span data-testid="header-cell">header-cell</span>,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface HeaderStateOptions {
  canPin?: boolean;
  canResize?: boolean;
  canSort?: boolean;
  pinned?: false | "left" | "right";
  sorted?: false | "asc" | "desc";
}

function createHeaderState(options?: HeaderStateOptions) {
  const pin = vi.fn();
  const toggleSorting = vi.fn();
  const clearSorting = vi.fn();
  const resizeHandler = vi.fn();

  const header = {
    column: {
      clearSorting,
      getCanPin: () => options?.canPin ?? true,
      getCanResize: () => options?.canResize ?? false,
      getCanSort: () => options?.canSort ?? true,
      getIsPinned: () => options?.pinned ?? false,
      getIsSorted: () => options?.sorted ?? false,
      id: "id",
      pin,
      toggleSorting,
    },
    getResizeHandler: () => resizeHandler,
    id: "id",
    isPlaceholder: false,
  } as unknown as Header<Record<string, unknown>, unknown>;

  return {
    clearSorting,
    header,
    pin,
    toggleSorting,
  };
}

function renderHeader(header: Header<Record<string, unknown>, unknown>): {
  cleanup: () => void;
  container: HTMLDivElement;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<DataGridHeader header={header} column={{} as Column} />);
  });

  return {
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    container,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("DataGridHeader controls", () => {
  it("anchors the resize handle on the column edge with a wider centered hit target", () => {
    const { header } = createHeaderState({
      canResize: true,
      sorted: false,
    });
    const { cleanup, container } = renderHeader(header);
    const root = container.querySelector("div.group.relative");
    const resizeButton = container.querySelector(
      'button[aria-label="Resize column"]',
    );

    if (!(root instanceof HTMLDivElement)) {
      throw new Error("Missing header root");
    }
    if (!(resizeButton instanceof HTMLButtonElement)) {
      throw new Error("Missing resize handle");
    }

    expect(root.className).toContain("w-full");
    expect(root.className).toContain("px-2");
    expect(resizeButton.className).toContain("-right-2");
    expect(resizeButton.className).toContain("block");
    expect(resizeButton.className).toContain("w-4");
    expect(resizeButton.className).toContain("before:left-2");
    expect(resizeButton.className).toContain("before:w-px");

    cleanup();
  });

  it("keeps controls hidden until hover when sort and pin are inactive", () => {
    const { header } = createHeaderState({
      pinned: false,
      sorted: false,
    });
    const { cleanup, container } = renderHeader(header);

    const controls = container.querySelector(
      '[data-testid="column-header-controls"]',
    );
    const pinButton = container.querySelector(
      'button[aria-label="Pin column"]',
    );
    const sortButton = container.querySelector(
      'button[aria-label="Sort ascending"]',
    );

    if (!(controls instanceof HTMLElement)) {
      throw new Error("Missing controls container");
    }
    if (!(pinButton instanceof HTMLButtonElement)) {
      throw new Error("Missing pin button");
    }
    if (!(sortButton instanceof HTMLButtonElement)) {
      throw new Error("Missing sort button");
    }

    expect(controls.className).toContain("opacity-0");
    expect(controls.className).toContain("group-hover:opacity-100");
    expect(controls.className).toContain("pointer-events-none");
    expect(pinButton.className).toContain("text-muted-foreground/70");
    expect(sortButton.className).toContain("text-muted-foreground/70");
    expect(sortButton.querySelector("svg")?.className).toContain(
      "lucide-arrow-up",
    );

    cleanup();
  });

  it("keeps controls visible when column pinning is active and toggles pin state", () => {
    const { header, pin } = createHeaderState({
      pinned: "left",
      sorted: false,
    });
    const { cleanup, container } = renderHeader(header);

    const controls = container.querySelector(
      '[data-testid="column-header-controls"]',
    );
    const pinButton = container.querySelector(
      'button[aria-label="Unpin column"]',
    );

    if (!(controls instanceof HTMLElement)) {
      throw new Error("Missing controls container");
    }
    if (!(pinButton instanceof HTMLButtonElement)) {
      throw new Error("Missing unpin button");
    }

    expect(controls.dataset.active).toBe("true");
    expect(controls.className).toContain("opacity-100");
    expect(pinButton.className).toContain("text-foreground");

    act(() => {
      pinButton.click();
    });

    expect(pin).toHaveBeenCalledWith(false);

    cleanup();
  });

  it("cycles sort from none to asc on first click", () => {
    const { header, toggleSorting, clearSorting } = createHeaderState({
      sorted: false,
    });
    const { cleanup, container } = renderHeader(header);
    const sortButton = container.querySelector(
      'button[aria-label="Sort ascending"]',
    );

    if (!(sortButton instanceof HTMLButtonElement)) {
      throw new Error("Missing sort button");
    }

    act(() => {
      sortButton.click();
    });

    expect(toggleSorting).toHaveBeenCalledWith(false);
    expect(clearSorting).not.toHaveBeenCalled();

    cleanup();
  });

  it("cycles sort from asc to desc on click", () => {
    const { header, toggleSorting, clearSorting } = createHeaderState({
      sorted: "asc",
    });
    const { cleanup, container } = renderHeader(header);
    const sortButton = container.querySelector(
      'button[aria-label="Sort descending"]',
    );

    if (!(sortButton instanceof HTMLButtonElement)) {
      throw new Error("Missing sort button");
    }

    act(() => {
      sortButton.click();
    });

    expect(toggleSorting).toHaveBeenCalledWith(true);
    expect(clearSorting).not.toHaveBeenCalled();

    cleanup();
  });

  it("cycles sort from desc to none and keeps controls visible when sorted", () => {
    const { header, toggleSorting, clearSorting } = createHeaderState({
      sorted: "desc",
    });
    const { cleanup, container } = renderHeader(header);
    const controls = container.querySelector(
      '[data-testid="column-header-controls"]',
    );
    const sortButton = container.querySelector(
      'button[aria-label="Clear sorting"]',
    );

    if (!(controls instanceof HTMLElement)) {
      throw new Error("Missing controls container");
    }
    if (!(sortButton instanceof HTMLButtonElement)) {
      throw new Error("Missing sort button");
    }

    expect(controls.dataset.active).toBe("true");
    expect(controls.className).toContain("opacity-100");
    expect(sortButton.querySelector("svg")?.className).toContain(
      "lucide-arrow-down",
    );

    act(() => {
      sortButton.click();
    });

    expect(clearSorting).toHaveBeenCalledTimes(1);
    expect(toggleSorting).not.toHaveBeenCalled();

    cleanup();
  });
});
