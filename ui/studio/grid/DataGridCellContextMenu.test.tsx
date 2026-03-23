import type { MouseEvent, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => (
    <div data-mock-context-menu>{children}</div>
  ),
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuItem: ({
    children,
    onClick,
    onSelect,
    ...props
  }: {
    children: ReactNode;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
    onSelect?: (event: Event) => void;
  }) => (
    <button
      {...props}
      onClick={(event) => {
        onClick?.(event);
        onSelect?.(new Event("select"));
      }}
      type="button"
    >
      {children}
    </button>
  ),
  ContextMenuTrigger: ({
    asChild: _asChild,
    children,
    ...props
  }: {
    asChild?: boolean;
    children: ReactNode;
  }) => <div {...props}>{children}</div>,
}));

import { DataGridCellContextMenu } from "./DataGridCellContextMenu";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete document.body.dataset.studioSuppressCellOpenUntil;
});

describe("DataGridCellContextMenu", () => {
  it("copies the provided grid selection text from context-menu copy", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridCellContextMenu copyText={"org_acme\tAcme Labs"}>
          org_acme
        </DataGridCellContextMenu>,
      );
    });

    const copyButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Copy",
    );

    if (!(copyButton instanceof HTMLButtonElement)) {
      throw new Error("Copy button was not rendered");
    }

    act(() => {
      copyButton.click();
    });

    expect(writeText).toHaveBeenCalledWith("org_acme\tAcme Labs");
    expect(document.body.dataset.studioSuppressCellOpenUntil).toBeDefined();

    act(() => {
      root.unmount();
    });
  });

  it("copies explicit empty-string copyText without falling back to rendered text", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridCellContextMenu copyText="">
          <span>NULL</span>
        </DataGridCellContextMenu>,
      );
    });

    const copyButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Copy",
    );

    if (!(copyButton instanceof HTMLButtonElement)) {
      throw new Error("Copy button was not rendered");
    }

    act(() => {
      copyButton.click();
    });

    expect(writeText).toHaveBeenCalledWith("");

    act(() => {
      root.unmount();
    });
  });

  it("resolves copyText lazily when provided as a callback", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const resolveCopyText = vi.fn(() => "lazy\tvalue");

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridCellContextMenu copyText={resolveCopyText}>
          lazy
        </DataGridCellContextMenu>,
      );
    });

    const copyButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Copy",
    );

    if (!(copyButton instanceof HTMLButtonElement)) {
      throw new Error("Copy button was not rendered");
    }

    expect(resolveCopyText).not.toHaveBeenCalled();

    act(() => {
      copyButton.click();
    });

    expect(resolveCopyText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("lazy\tvalue");

    act(() => {
      root.unmount();
    });
  });

  it("runs clipboard write exactly once for a single pointer-then-click copy action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridCellContextMenu copyText={"org_northwind\tNorthwind Retail"}>
          org_northwind
        </DataGridCellContextMenu>,
      );
    });

    const copyButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Copy",
    );

    if (!(copyButton instanceof HTMLButtonElement)) {
      throw new Error("Copy button was not rendered");
    }

    act(() => {
      copyButton.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      copyButton.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("org_northwind\tNorthwind Retail");

    act(() => {
      root.unmount();
    });
  });

  it("does not copy on pointer down before the menu item is selected", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridCellContextMenu copyText={"org_northwind\tNorthwind Retail"}>
          org_northwind
        </DataGridCellContextMenu>,
      );
    });

    const copyButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Copy",
    );

    if (!(copyButton instanceof HTMLButtonElement)) {
      throw new Error("Copy button was not rendered");
    }

    act(() => {
      copyButton.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    expect(writeText).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
