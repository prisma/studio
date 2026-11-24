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

async function renderErrorToast() {
  act(() => {
    root.render(<Toaster />);
  });

  await act(async () => {
    toast.error("operation failed", { description: "message", id: "error" });
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

function pressPointer(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
  });
}

describe("Toaster", () => {
  it("bounds long descriptions and lets them scroll", async () => {
    const { description } = await renderErrorToast();

    expect(description.classList).toContain("max-h-[20dvh]");
    expect(description.classList).toContain("overflow-y-auto");
    // Studio utilities are compiled under `.ps`, so they need a scoped ancestor.
    expect(description.closest(".ps")).not.toBeNull();
  });

  it("does not start a swipe from a description that overflows", async () => {
    const { description, toastElement } = await renderErrorToast();
    setContentHeight(description, { clientHeight: 100, scrollHeight: 500 });

    pressPointer(description);

    expect(toastElement.dataset.swiping).toBe("false");
  });

  it("keeps swipe-to-dismiss on a description that fits", async () => {
    const { description, toastElement } = await renderErrorToast();
    setContentHeight(description, { clientHeight: 100, scrollHeight: 100 });

    pressPointer(description);

    expect(toastElement.dataset.swiping).toBe("true");
  });

  it("keeps swipe-to-dismiss on the title of an overflowing toast", async () => {
    const { description, toastElement } = await renderErrorToast();
    setContentHeight(description, { clientHeight: 100, scrollHeight: 500 });

    pressPointer(toastElement.querySelector<HTMLElement>("[data-title]")!);

    expect(toastElement.dataset.swiping).toBe("true");
  });
});
