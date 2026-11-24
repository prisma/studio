import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Toaster } from "./sonner";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Sonner captures the pointer on press; happy-dom can't capture synthetic ones.
  Element.prototype.setPointerCapture = () => undefined;

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    toast.dismiss();
    root.unmount();
  });
  container.remove();
});

async function wait(milliseconds: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });
}

async function renderErrorToast(options: { duration?: number } = {}) {
  act(() => {
    root.render(<Toaster />);
  });

  await act(async () => {
    toast.error("operation failed", {
      description: "message",
      id: "error",
      ...options,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  const toastElement = document.querySelector<HTMLElement>(
    "[data-sonner-toast]",
  )!;
  const description =
    toastElement.querySelector<HTMLElement>("[data-description]")!;

  return { description, toastElement };
}

function setContentHeight(
  element: HTMLElement,
  heights: { clientHeight: number; scrollHeight: number },
) {
  for (const [property, value] of Object.entries(heights)) {
    Object.defineProperty(element, property, { configurable: true, value });
  }
}

function firePointer(
  element: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: PointerEventInit = {},
) {
  act(() => {
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: 0,
        pointerType: "mouse",
        buttons: type === "pointerup" ? 0 : 1,
        ...init,
      }),
    );
  });
}

function dragDown(element: HTMLElement, pointerType = "mouse") {
  firePointer(element, "pointerdown", { clientY: 0, pointerType });
  // Sonner locks the swipe direction on the first move and applies it next.
  firePointer(element, "pointermove", { clientY: 10, pointerType });
  firePointer(element, "pointermove", { clientY: 30, pointerType });
}

function getSwipeAmount(toastElement: HTMLElement) {
  return toastElement.style.getPropertyValue("--swipe-amount-y");
}

describe("Toaster", () => {
  it("bounds long descriptions and lets them scroll", async () => {
    const { description } = await renderErrorToast();

    expect(description.classList).toContain("max-h-[20dvh]");
    expect(description.classList).toContain("overflow-y-auto");
    // Studio utilities are compiled under `.ps`, so they need a scoped ancestor.
    expect(description.closest(".ps")).not.toBeNull();
  });

  it("does not swipe when dragging a description that overflows", async () => {
    const { description, toastElement } = await renderErrorToast();
    setContentHeight(description, { clientHeight: 100, scrollHeight: 500 });

    dragDown(description);

    expect(getSwipeAmount(toastElement)).toBe("");
  });

  it("swipes when dragging a description that fits", async () => {
    const { description, toastElement } = await renderErrorToast();
    setContentHeight(description, { clientHeight: 100, scrollHeight: 100 });

    dragDown(description, "touch");

    expect(getSwipeAmount(toastElement)).toBe("30px");
  });

  it("leaves touch panning to the toast so presses are never cancelled", async () => {
    const { description } = await renderErrorToast();

    // A native pan would end the press with `pointercancel`, which Sonner
    // ignores: the toast would stay in its pressed state and never close.
    expect(description.classList).toContain("touch-none");
  });

  it("swipes when dragging the title of an overflowing toast", async () => {
    const { description, toastElement } = await renderErrorToast();
    setContentHeight(description, { clientHeight: 100, scrollHeight: 500 });

    dragDown(toastElement.querySelector<HTMLElement>("[data-title]")!);

    expect(getSwipeAmount(toastElement)).toBe("30px");
  });

  it("scrolls an overflowing description by touch", async () => {
    const { description } = await renderErrorToast();
    setContentHeight(description, { clientHeight: 100, scrollHeight: 500 });

    firePointer(description, "pointerdown", {
      clientY: 90,
      pointerType: "touch",
    });
    firePointer(description, "pointermove", {
      clientY: 70,
      pointerType: "touch",
    });
    firePointer(description, "pointermove", {
      clientY: 40,
      pointerType: "touch",
    });

    expect(description.scrollTop).toBe(50);
  });

  it("does not drag-scroll with a mouse, so text stays selectable", async () => {
    const { description } = await renderErrorToast();
    setContentHeight(description, { clientHeight: 100, scrollHeight: 500 });

    firePointer(description, "pointerdown", { clientY: 90 });
    firePointer(description, "pointermove", { clientY: 40 });

    expect(description.scrollTop).toBe(0);
  });

  it("stays open while an overflowing description is pressed", async () => {
    const { description, toastElement } = await renderErrorToast({
      duration: 150,
    });
    setContentHeight(description, { clientHeight: 100, scrollHeight: 500 });

    firePointer(description, "pointerdown", { pointerType: "touch" });
    await wait(400);
    expect(toastElement.isConnected).toBe(true);

    firePointer(description, "pointerup", { pointerType: "touch" });
    await wait(400);
    expect(toastElement.isConnected).toBe(false);
  });
});
