import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type TemporalListContext,
  temporalListPosition,
} from "./temporal-list-context";
import { TemporalListPosition } from "./TemporalListPosition";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const context: TemporalListContext = {
  href: "#temporalSectionParam=workflows&searchParam=failed",
  items: [
    { runId: "run-a", workflowId: "order-1" },
    { runId: "run-b", workflowId: "order-2" },
    { runId: "run-c", workflowId: "order-3" },
  ],
  label: "Failed",
};

describe("temporalListPosition", () => {
  it("finds the run, or else the Workflow ID, in the list", () => {
    expect(temporalListPosition(context, "order-2", "run-b")).toBe(1);
    // A page that follows the latest run has no run ID in its URL.
    expect(temporalListPosition(context, "order-3", undefined)).toBe(2);
    // Another run of a listed Workflow ID, opened from the Runs tab.
    expect(temporalListPosition(context, "order-1", "run-old")).toBe(0);
    expect(temporalListPosition(context, "order-9", "run-z")).toBe(-1);
  });
});

describe("TemporalListPosition", () => {
  let root: Root;
  let container: HTMLElement;
  const onOpenItem = vi.fn();

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

  const render = (position: number) =>
    act(() =>
      root.render(
        <TemporalListPosition
          context={context}
          onOpenItem={onOpenItem}
          position={position}
        />,
      ),
    );
  const key = (name: string) =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: name }));
    });

  it("names the list, links back to it with its filter, and says where the workflow is", () => {
    render(1);

    const back = container.querySelector<HTMLAnchorElement>(
      '[data-testid="temporal-list-back"]',
    )!;

    expect(back.textContent).toBe("Failed");
    expect(back.getAttribute("href")).toBe(context.href);
    expect(
      container.querySelector('[data-testid="temporal-list-place"]')!
        .textContent,
    ).toBe("2 of 3");
  });

  it("opens the next and previous rows with the arrows and with j and k", () => {
    render(1);

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Next in Failed"]')!
        .click(),
    );
    expect(onOpenItem).toHaveBeenLastCalledWith(2);
    key("k");
    expect(onOpenItem).toHaveBeenLastCalledWith(0);
    key("j");
    expect(onOpenItem).toHaveBeenLastCalledWith(2);
  });

  it("stops at the ends of the list", () => {
    render(2);

    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Next in Failed"]',
      )!.disabled,
    ).toBe(true);
    key("j");
    expect(onOpenItem).not.toHaveBeenCalled();
  });
});
