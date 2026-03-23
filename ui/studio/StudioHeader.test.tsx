import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioHeader } from "./StudioHeader";

const toggleNavigationSpy = vi.fn();

vi.mock("./context", () => ({
  useStudio: () => ({
    isNavigationOpen: true,
    toggleNavigation: toggleNavigationSpy,
  }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("StudioHeader", () => {
  beforeEach(() => {
    toggleNavigationSpy.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders only navigation and custom end controls, without a fullscreen button", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioHeader endContent={<button type="button">Refresh</button>}>
          <span>Filters</span>
        </StudioHeader>,
      );
    });

    const headerEndControls = container.querySelector(
      '[data-testid="studio-header-end-controls"]',
    );
    const navigationButton = container.querySelector("button");

    expect(container.textContent).toContain("Filters");
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(headerEndControls?.querySelectorAll("button")).toHaveLength(1);
    expect(navigationButton?.getAttribute("aria-label")).toBe(
      "Close navigation",
    );

    act(() => {
      navigationButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(toggleNavigationSpy).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("omits the end-controls wrapper when no custom end content is provided", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StudioHeader />);
    });

    expect(
      container.querySelector('[data-testid="studio-header-end-controls"]'),
    ).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Close navigation",
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
