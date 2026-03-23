import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyDarkModeClass,
  applyThemeVariables,
  clearThemeVariables,
  useTheme,
} from "./use-theme";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function createStudioRoot(): HTMLDivElement {
  const studioRoot = document.createElement("div");
  studioRoot.className = "ps";
  document.body.appendChild(studioRoot);
  return studioRoot;
}

function renderThemeHarness(args: {
  customTheme?: Parameters<typeof useTheme>[0];
  isDarkMode?: boolean;
}) {
  const container = createStudioRoot();
  const root = createRoot(container);

  function Harness() {
    useTheme(args.customTheme, args.isDarkMode);
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
});

describe("theme helpers", () => {
  it("applies theme variables only to Studio roots", () => {
    const firstStudioRoot = createStudioRoot();
    const secondStudioRoot = createStudioRoot();

    applyThemeVariables({
      "--background": "oklch(0.1 0 0)",
      "--foreground": "oklch(0.9 0 0)",
    });

    expect(firstStudioRoot.style.getPropertyValue("--background")).toBe(
      "oklch(0.1 0 0)",
    );
    expect(secondStudioRoot.style.getPropertyValue("--foreground")).toBe(
      "oklch(0.9 0 0)",
    );
    expect(
      document.documentElement.style.getPropertyValue("--background"),
    ).toBe("");
  });

  it("toggles dark mode across every Studio root", () => {
    const firstStudioRoot = createStudioRoot();
    const secondStudioRoot = createStudioRoot();

    applyDarkModeClass(true);

    expect(firstStudioRoot.classList.contains("dark")).toBe(true);
    expect(secondStudioRoot.classList.contains("dark")).toBe(true);

    applyDarkModeClass(false);

    expect(firstStudioRoot.classList.contains("dark")).toBe(false);
    expect(secondStudioRoot.classList.contains("dark")).toBe(false);
  });

  it("clears theme variables from every Studio root", () => {
    const firstStudioRoot = createStudioRoot();
    const secondStudioRoot = createStudioRoot();

    firstStudioRoot.style.setProperty("--background", "black");
    secondStudioRoot.style.setProperty("--background", "black");

    clearThemeVariables(["--background"]);

    expect(firstStudioRoot.style.getPropertyValue("--background")).toBe("");
    expect(secondStudioRoot.style.getPropertyValue("--background")).toBe("");
  });
});

describe("useTheme", () => {
  it("applies the root dark-mode class before sibling layout effects run", () => {
    const container = createStudioRoot();
    const root = createRoot(container);
    let darkModeSeenInLayoutEffect = false;

    function Harness(props: { isDarkMode: boolean }) {
      useTheme(undefined, props.isDarkMode);

      useLayoutEffect(() => {
        darkModeSeenInLayoutEffect = container.classList.contains("dark");
      }, [props.isDarkMode]);

      return null;
    }

    act(() => {
      root.render(<Harness isDarkMode />);
    });

    expect(darkModeSeenInLayoutEffect).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("applies theme variables before sibling layout effects run", () => {
    const container = createStudioRoot();
    const root = createRoot(container);
    let backgroundSeenInLayoutEffect = "";

    function Harness(props: { isDarkMode: boolean }) {
      useTheme(
        {
          dark: {
            "--background": "oklch(0.2 0 0)",
          },
          light: {
            "--background": "oklch(0.95 0 0)",
          },
        },
        props.isDarkMode,
      );

      useLayoutEffect(() => {
        backgroundSeenInLayoutEffect =
          container.style.getPropertyValue("--background");
      }, [props.isDarkMode]);

      return null;
    }

    act(() => {
      root.render(<Harness isDarkMode />);
    });

    expect(backgroundSeenInLayoutEffect).toBe("oklch(0.2 0 0)");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("syncs new Studio portals with the current dark mode", async () => {
    const harness = renderThemeHarness({
      isDarkMode: true,
    });

    const portalRoot = createStudioRoot();

    await flush();

    expect(portalRoot.classList.contains("dark")).toBe(true);

    harness.cleanup();
    portalRoot.remove();
  });

  it("syncs new Studio portals with custom theme variables", async () => {
    const harness = renderThemeHarness({
      customTheme: {
        dark: {
          "--background": "oklch(0.2 0 0)",
        },
        light: {
          "--background": "oklch(0.95 0 0)",
        },
      },
      isDarkMode: true,
    });

    const portalRoot = createStudioRoot();

    await flush();

    expect(portalRoot.style.getPropertyValue("--background")).toBe(
      "oklch(0.2 0 0)",
    );

    harness.cleanup();
    portalRoot.remove();
  });
});
