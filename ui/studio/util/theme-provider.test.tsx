import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "./theme-provider";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function ThemeConsumer() {
  const { setTheme, theme } = useTheme();

  return (
    <button onClick={() => setTheme("dark")} type="button">
      {theme}
    </button>
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.classList.remove("light", "dark");
  localStorage.clear();
});

describe("ThemeProvider", () => {
  it("persists theme changes through TanStack DB-backed storage", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ThemeProvider defaultTheme="light" storageKey="theme-provider-test">
          <ThemeConsumer />
        </ThemeProvider>,
      );
    });

    const button = container.querySelector("button");

    expect(button?.textContent).toBe("light");

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(button?.textContent).toBe("dark");
    expect(localStorage.getItem("theme-provider-test")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
