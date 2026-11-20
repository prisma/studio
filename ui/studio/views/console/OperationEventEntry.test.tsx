import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioOperationEvent } from "../../Studio";
import { OperationEventEntry } from "./OperationEventEntry";

type UseUiStateReturn = readonly [
  boolean,
  (value: boolean | ((previous: boolean) => boolean)) => void,
];

const { toastMock, useUiStateMock } = vi.hoisted(() => ({
  toastMock: { error: vi.fn(), success: vi.fn() },
  useUiStateMock: vi.fn<(key: string, initial: boolean) => UseUiStateReturn>(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("../../../hooks/use-ui-state", () => ({
  useUiState: useUiStateMock,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const successEvent: StudioOperationEvent = {
  eventId: "evt_1",
  timestamp: "2026-03-09T11:07:44.000Z",
  name: "studio_operation_success",
  payload: {
    operation: "query",
    error: undefined,
    query: {
      sql: "select * from organizations limit $1",
      parameters: [25],
    },
  },
};

function renderEntry(event: StudioOperationEvent) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <table>
        <tbody>
          <OperationEventEntry event={event} />
        </tbody>
      </table>,
    );
  });

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("OperationEventEntry", () => {
  beforeEach(() => {
    useUiStateMock.mockImplementation((_key, initial) => [initial, vi.fn()]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("renders one log row with operation, SQL preview, status and time", () => {
    const { container, cleanup } = renderEntry(successEvent);

    const rows = container.querySelectorAll("tr");
    expect(rows).toHaveLength(1);

    const cells = [...rows[0]!.querySelectorAll("td")].map(
      (cell) => cell.textContent,
    );
    expect(cells).toContain("query");
    expect(cells).toContain("Success");
    expect(cells.some((text) => text?.includes("select * from"))).toBe(true);

    const toggle = container.querySelector("button[aria-expanded]");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[aria-label="Copy SQL query"]')).toBeNull();

    cleanup();
  });

  it("toggles the details when the row is clicked", () => {
    const setExpanded = vi.fn();
    useUiStateMock.mockImplementation(() => [false, setExpanded]);
    const { container, cleanup } = renderEntry(successEvent);

    act(() => {
      container.querySelector("tr")!.click();
    });

    expect(setExpanded).toHaveBeenCalledWith(true);

    cleanup();
  });

  it("shows the full SQL, parameters and copy when expanded", () => {
    useUiStateMock.mockImplementation(() => [true, vi.fn()]);
    const { container, cleanup } = renderEntry(successEvent);

    const detail = container.querySelector('[data-response-type="query"]');
    expect(detail?.textContent).toContain(
      "select * from organizations limit $1",
    );
    expect(detail?.textContent).toContain("[25]");
    expect(
      container.querySelector('[aria-label="Copy SQL query"]'),
    ).not.toBeNull();
    // The disclosure chevron turns down while the row is open.
    expect(container.querySelector("tr svg.rotate-90")).not.toBeNull();

    cleanup();
  });

  it("confirms a copy only after the clipboard write succeeds", async () => {
    useUiStateMock.mockImplementation(() => [true, vi.fn()]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { container, cleanup } = renderEntry(successEvent);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Copy SQL query"]')!
        .click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(
      "select * from organizations limit $1",
    );
    expect(toastMock.success).toHaveBeenCalledWith("Query copied to clipboard");
    expect(toastMock.error).not.toHaveBeenCalled();

    cleanup();
  });

  it("reports a failed copy instead of claiming success", async () => {
    useUiStateMock.mockImplementation(() => [true, vi.fn()]);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
      },
    });
    const { container, cleanup } = renderEntry(successEvent);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Copy SQL query"]')!
        .click();
      await Promise.resolve();
    });

    expect(toastMock.error).toHaveBeenCalledWith("Couldn't copy the query");
    expect(toastMock.success).not.toHaveBeenCalled();

    cleanup();
  });

  it("puts the error in the row and opens its details by default", () => {
    const error = new Error("forced introspection failure");
    (error as Error & { adapterSource?: string }).adapterSource = "postgresql";

    const { container, cleanup } = renderEntry({
      eventId: "evt_2",
      timestamp: "2026-03-09T11:07:44.000Z",
      name: "studio_operation_error",
      payload: {
        operation: "introspect",
        error,
        query: {
          sql: "select current_setting('timezone') as timezone",
          parameters: [],
        },
      },
    });

    const [row] = container.querySelectorAll("tr");
    expect(row?.textContent).toContain("forced introspection failure");
    expect(row?.textContent).toContain("Error");
    expect(useUiStateMock).toHaveBeenCalledWith(
      "operation-event:evt_2:query-expanded",
      true,
      expect.anything(),
    );
    expect(container.textContent).toContain("Adapter");
    expect(container.textContent).toContain("postgresql");

    cleanup();
  });
});
