import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TemporalGroupedSpan } from "@/data/temporal";

import { TemporalRunStepper } from "./TemporalRunStepper";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function step(id: number, label: string): TemporalGroupedSpan {
  return {
    durationMs: 10,
    eventIds: [id],
    id: `span-${id}`,
    kind: "activity",
    label,
    startedEventId: id,
    startOffsetMs: 0,
    status: "completed",
    timestamp: "2026-11-25T08:00:00.000Z",
  };
}

const steps = [step(5, "chargeCard"), step(9, "shipOrder"), step(14, "notify")];

describe("TemporalRunStepper", () => {
  let root: Root;
  let container: HTMLElement;
  const onChange = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  const render = (position: number | null, isOpen = false) =>
    act(() =>
      root.render(
        <TemporalRunStepper
          isOpen={isOpen}
          onChange={onChange}
          position={position}
          steps={steps}
        />,
      ),
    );
  const press = (label: string) =>
    act(() =>
      container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.click(),
    );
  const place = () =>
    container.querySelector('[data-testid="temporal-run-stepper-place"]')!
      .textContent;
  const key = (name: string, target: EventTarget = window) =>
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: name }),
      );
    });

  it("says where the run page is: a step, the end of the run, or now", () => {
    render(1);
    expect(place()).toBe("Step 2 of 3");

    render(null);
    expect(place()).toBe("End of the run");

    render(null, true);
    expect(place()).toBe("Now");
  });

  it("moves to the first, previous, next and last step", () => {
    render(1);

    press("First step");
    expect(onChange).toHaveBeenLastCalledWith(0);
    press("Previous step");
    expect(onChange).toHaveBeenLastCalledWith(0);
    press("Next step");
    expect(onChange).toHaveBeenLastCalledWith(2);
    press("End of the run");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("goes from the last step to the end of the history, and back from the end to the last step", () => {
    render(2);
    press("Next step");
    expect(onChange).toHaveBeenLastCalledWith(null);

    render(null);
    press("Previous step");
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("moves with the arrow keys anywhere on the page, but not while typing", () => {
    render(1);

    key("ArrowLeft");
    expect(onChange).toHaveBeenLastCalledWith(0);
    key("ArrowRight");
    expect(onChange).toHaveBeenLastCalledWith(2);

    onChange.mockClear();
    const input = document.createElement("input");
    document.body.append(input);
    key("ArrowLeft", input);
    expect(onChange).not.toHaveBeenCalled();
  });
});
