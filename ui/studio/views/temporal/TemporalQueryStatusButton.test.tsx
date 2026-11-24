import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type TemporalQueryPhase,
  TemporalQueryStatusButton,
} from "./TemporalQueryStatusButton";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TemporalQueryStatusButton", () => {
  let root: Root;
  let container: HTMLElement;
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function render(
    phase: TemporalQueryPhase | null,
    options: { isError?: boolean; queryKey?: string } = {},
  ) {
    act(() =>
      root.render(
        <TemporalQueryStatusButton
          isError={options.isError ?? false}
          isPolling={false}
          onRefresh={onRefresh}
          phase={phase}
          queryKey={options.queryKey ?? 'ExecutionStatus = "Failed"'}
        />,
      ),
    );
  }

  const wait = (ms: number) => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };
  const status = () =>
    container.querySelector('[data-testid="temporal-query-status"]');
  const button = () => container.querySelector("button");

  it("is the refresh button while no query runs", () => {
    render(null);

    expect(status()).toBeNull();
    expect(button()!.getAttribute("aria-label")).toBe("Refresh executions");
    act(() => button()!.click());
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("says what runs and for how long, in place of the refresh button", () => {
    render("rows");
    wait(1_200);

    expect(button()).toBeNull();
    expect(status()!.getAttribute("data-phase")).toBe("rows");
    expect(status()!.textContent).toContain("Loading rows");
    expect(status()!.textContent).toContain("1.2s");

    // The rows are here; the server still counts the matches.
    render("count");
    wait(4_000);

    expect(status()!.textContent).toContain("Counting matches");
    expect(status()!.textContent).toContain("5.2s");
  });

  it("starts the time again when the user asks for something else", () => {
    render("rows");
    wait(3_000);
    render("rows", { queryKey: 'ExecutionStatus = "Running"' });
    wait(500);

    expect(status()!.textContent).toContain("0.5s");
  });

  it("shows how long the query took, then is the refresh button again", () => {
    render("rows");
    wait(2_400);
    render(null);

    expect(button()!.textContent).toContain("2.40s");
    expect(button()!.getAttribute("aria-label")).toBe(
      "Refresh executions. The last query took 2.40s",
    );

    wait(3_000);
    expect(button()!.textContent).toBe("Refresh");
    expect(button()!.getAttribute("aria-label")).toBe("Refresh executions");
  });

  it("is as wide in every state, so the header beside it does not move", () => {
    const width = () =>
      [...(status() ?? button())!.classList].filter((name) =>
        /^(@max-2xl:)?w-/.test(name),
      );

    render(null);
    const idle = width();

    expect(idle.length).toBeGreaterThan(0);

    render("rows");
    expect(width()).toEqual(idle);

    render(null);
    expect(width()).toEqual(idle);

    render(null, { isError: true });
    expect(width()).toEqual(idle);
  });

  it("offers to run a failed query again", () => {
    render("rows");
    wait(800);
    render(null, { isError: true });

    expect(button()!.getAttribute("aria-label")).toBe(
      "The query failed. Run it again",
    );
    act(() => button()!.click());
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
