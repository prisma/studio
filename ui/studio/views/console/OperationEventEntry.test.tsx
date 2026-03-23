import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioOperationEvent } from "../../Studio";
import { OperationEventEntry } from "./OperationEventEntry";

type UseUiStateReturn = readonly [
  boolean,
  (value: boolean | ((previous: boolean) => boolean)) => void,
];

const { useUiStateMock } = vi.hoisted(() => ({
  useUiStateMock: vi.fn<() => UseUiStateReturn>(),
}));

vi.mock("../../../hooks/use-ui-state", () => ({
  useUiState: useUiStateMock,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("OperationEventEntry", () => {
  beforeEach(() => {
    useUiStateMock.mockReturnValue([false, vi.fn()]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("renders query details with gap-based stacks and accessible controls", () => {
    const event: StudioOperationEvent = {
      eventId: "evt_1",
      timestamp: "2026-03-09T00:00:00.000Z",
      name: "studio_operation_success",
      payload: {
        operation: "query",
        error: undefined,
        query: {
          sql: "select * from organizations",
          parameters: [],
        },
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<OperationEventEntry event={event} />);
    });

    const rootEntry = container.firstElementChild;
    const queryBlock = container.querySelector('[data-response-type="query"]');
    const toggleButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("SQL Query"),
    );
    const copyButton = container.querySelector(
      'button[aria-label="Copy SQL query"]',
    );

    expect(rootEntry?.className).toContain("flex");
    expect(rootEntry?.className).toContain("gap-2");
    expect(queryBlock?.className).toContain("flex");
    expect(queryBlock?.className).toContain("gap-2");
    expect(
      Array.from(container.querySelectorAll<HTMLElement>("[class]")).some(
        (element) => element.className.includes("space-y-"),
      ),
    ).toBe(false);
    expect(toggleButton?.getAttribute("aria-expanded")).toBe("false");
    expect(copyButton).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders adapter source for error events", () => {
    const error = new Error("forced introspection failure");
    (
      error as Error & {
        adapterSource?: string;
        query?: { parameters: unknown[]; sql: string };
      }
    ).adapterSource = "postgresql";

    const event: StudioOperationEvent = {
      eventId: "evt_2",
      timestamp: "2026-03-09T00:00:00.000Z",
      name: "studio_operation_error",
      payload: {
        operation: "introspect",
        error,
        query: {
          sql: "select current_setting('timezone') as timezone",
          parameters: [],
        },
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<OperationEventEntry event={event} />);
    });

    expect(container.textContent).toContain("Adapter");
    expect(container.textContent).toContain("postgresql");
    expect(container.textContent).toContain("forced introspection failure");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
