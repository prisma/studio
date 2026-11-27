import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TemporalTimeline } from "./TemporalTimeline";

vi.mock("@/ui/hooks/use-ui-state", async () => {
  const { useState } = await import("react");

  return {
    useUiState: <T,>(_key: string, initial: T) => {
      const [value, setValue] = useState(initial);

      return [value, setValue, vi.fn()];
    },
  };
});

vi.mock("../../context", () => ({
  useStudio: () => ({ hasDatabase: false }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PANEL_WIDTH = 1000;

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <TemporalTimeline
          namespace="default"
          onOpenExecution={vi.fn()}
          onSelectSpan={vi.fn()}
          selectedSpanId={null}
          spans={[]}
          startTime="2026-11-25T08:00:00.000Z"
          totalDurationMs={60_000}
        />
      </QueryClientProvider>,
    );
  });

  const handle = container.querySelector<HTMLElement>(
    '[data-testid="temporal-timeline-label-resize"]',
  )!;

  return {
    handle,
    press: (key: string, shiftKey = false) =>
      act(() => {
        handle.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key, shiftKey }),
        );
      }),
    unmount: () => act(() => root.unmount()),
    width: () => Number(handle.getAttribute("aria-valuenow")),
  };
}

describe("TemporalTimeline name column", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
      PANEL_WIDTH,
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a labelled vertical separator at the automatic width", () => {
    const { handle, unmount, width } = render();

    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-label")).toBe("Resize the name column");
    expect(width()).toBe(220);
    expect(handle.style.left).toBe("220px");

    unmount();
  });

  it("resizes with the arrow keys, Home and End, and keeps room for the bars", () => {
    const { press, unmount, width } = render();

    press("ArrowRight");
    expect(width()).toBe(236);

    press("ArrowLeft", true);
    expect(width()).toBe(172);

    press("Home");
    expect(width()).toBe(96);

    press("End");
    // The panel, less the duration column and the bars' minimum room.
    expect(width()).toBe(PANEL_WIDTH - 72 - 140);

    press("ArrowRight");
    expect(width()).toBe(PANEL_WIDTH - 72 - 140);

    unmount();
  });

  it("goes back to the automatic width on double-click", () => {
    const { handle, press, unmount, width } = render();

    press("End");
    act(() => {
      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(width()).toBe(220);

    unmount();
  });
});
