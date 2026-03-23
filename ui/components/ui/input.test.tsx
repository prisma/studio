import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { Input } from "./input";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Input", () => {
  it("uses the semantic foreground color for typed text", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Input aria-label="Demo input" value="Acme" readOnly />);
    });

    const input = container.querySelector('input[aria-label="Demo input"]');

    expect(input?.className).toContain("text-foreground");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
