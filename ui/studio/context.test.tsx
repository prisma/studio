import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { process } from "std-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { check } from "../../checkpoint";
import type { Adapter } from "../../data/adapter";
import { StudioContextProvider, useStudio } from "./context";

vi.mock("../hooks/use-navigation", () => ({
  NavigationContextProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  createUrl: () => "#",
}));

vi.mock("../hooks/use-theme", () => ({
  useTheme: () => ({
    hasCustomTheme: false,
  }),
}));

vi.mock("../../checkpoint", () => ({
  check: vi.fn(() => Promise.resolve()),
}));

vi.mock("./NuqsHashAdapter", () => ({
  NuqsHashAdapter: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const systemThemeListeners = new Set<
  ((event: MediaQueryListEvent) => void) | (() => void)
>();
let systemPrefersDark = false;

function createAdapter(): Adapter {
  return {
    capabilities: {},
    delete: vi.fn(),
    insert: vi.fn(),
    introspect: vi.fn(),
    query: vi.fn(),
    raw: vi.fn(),
    update: vi.fn(),
  } as unknown as Adapter;
}

function renderHarness(props?: { streamsUrl?: string }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latestStudio: ReturnType<typeof useStudio> | undefined;

  function Harness() {
    latestStudio = useStudio();
    return null;
  }

  act(() => {
    root.render(
      <StudioContextProvider
        adapter={createAdapter()}
        streamsUrl={props?.streamsUrl}
      >
        <Harness />
      </StudioContextProvider>,
    );
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    getLatestStudio() {
      return latestStudio;
    },
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const timeoutMs = 2000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (assertion()) {
      return;
    }

    await flush();
  }

  throw new Error("Timed out waiting for Studio context state");
}

function emitSystemThemeChange(matches: boolean) {
  systemPrefersDark = matches;

  act(() => {
    const event = {
      matches,
      media: "(prefers-color-scheme: dark)",
    } as MediaQueryListEvent;

    for (const listener of systemThemeListeners) {
      listener(event);
    }
  });
}

beforeEach(() => {
  systemPrefersDark = false;
  systemThemeListeners.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      addEventListener: (
        _event: string,
        callback: (event: MediaQueryListEvent) => void,
      ) => {
        systemThemeListeners.add(callback);
      },
      addListener: (callback: (event: MediaQueryListEvent) => void) => {
        systemThemeListeners.add(callback);
      },
      dispatchEvent: vi.fn(),
      matches: systemPrefersDark,
      media: query,
      onchange: null,
      removeEventListener: (
        _event: string,
        callback: (event: MediaQueryListEvent) => void,
      ) => {
        systemThemeListeners.delete(callback);
      },
      removeListener: (callback: (event: MediaQueryListEvent) => void) => {
        systemThemeListeners.delete(callback);
      },
    })),
  );
  window.localStorage.clear();
  document.documentElement.className = "";
  Object.defineProperty(globalThis, "VERSION_INJECTED_AT_BUILD_TIME", {
    configurable: true,
    value: "0.25.1-test",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  delete process.env.CHECKPOINT_DISABLE;
  delete (globalThis as { VERSION_INJECTED_AT_BUILD_TIME?: string })
    .VERSION_INJECTED_AT_BUILD_TIME;
});

describe("StudioContextProvider pagination preferences", () => {
  it("persists shared page-size and infinite-scroll preferences across remounts", () => {
    const firstHarness = renderHarness();

    expect(firstHarness.getLatestStudio()?.tablePageSize).toBe(25);
    expect(firstHarness.getLatestStudio()?.isInfiniteScrollEnabled).toBe(false);

    act(() => {
      firstHarness.getLatestStudio()?.setTablePageSize(75);
      firstHarness.getLatestStudio()?.setInfiniteScrollEnabled(true);
    });

    expect(firstHarness.getLatestStudio()?.tablePageSize).toBe(75);
    expect(firstHarness.getLatestStudio()?.isInfiniteScrollEnabled).toBe(true);

    firstHarness.cleanup();

    const secondHarness = renderHarness();

    expect(secondHarness.getLatestStudio()?.tablePageSize).toBe(75);
    expect(secondHarness.getLatestStudio()?.isInfiniteScrollEnabled).toBe(true);

    secondHarness.cleanup();
  });
});

describe("StudioContextProvider streams configuration", () => {
  it("exposes the optional streams URL through Studio context", () => {
    const harness = renderHarness({
      streamsUrl: "/api/streams",
    });

    expect(harness.getLatestStudio()?.streamsUrl).toBe("/api/streams");

    harness.cleanup();
  });
});

describe("StudioContextProvider dark mode preferences", () => {
  it("persists explicit theme mode changes across remounts", () => {
    document.documentElement.classList.remove("dark");

    const firstHarness = renderHarness();

    expect(firstHarness.getLatestStudio()?.themeMode).toBe("system");
    expect(firstHarness.getLatestStudio()?.isDarkMode).toBe(false);

    act(() => {
      firstHarness.getLatestStudio()?.setThemeMode("dark");
    });

    expect(firstHarness.getLatestStudio()?.themeMode).toBe("dark");
    expect(firstHarness.getLatestStudio()?.isDarkMode).toBe(true);

    firstHarness.cleanup();

    const secondHarness = renderHarness();

    expect(secondHarness.getLatestStudio()?.themeMode).toBe("dark");
    expect(secondHarness.getLatestStudio()?.isDarkMode).toBe(true);

    secondHarness.cleanup();
  });

  it("resolves system mode from the system color scheme instead of the host dark class", () => {
    document.documentElement.classList.add("dark");

    const harness = renderHarness();

    expect(harness.getLatestStudio()?.themeMode).toBe("system");
    expect(harness.getLatestStudio()?.isDarkMode).toBe(false);

    harness.cleanup();
  });

  it("matches the system color scheme only when themeMode is system", async () => {
    document.documentElement.classList.remove("dark");

    const harness = renderHarness();

    expect(harness.getLatestStudio()?.themeMode).toBe("system");
    expect(harness.getLatestStudio()?.isDarkMode).toBe(false);

    act(() => {
      document.documentElement.classList.add("dark");
    });

    await flush();

    expect(harness.getLatestStudio()?.isDarkMode).toBe(false);

    emitSystemThemeChange(true);

    await waitFor(() => harness.getLatestStudio()?.isDarkMode === true);

    act(() => {
      harness.getLatestStudio()?.setThemeMode("light");
    });

    expect(harness.getLatestStudio()?.themeMode).toBe("light");
    expect(harness.getLatestStudio()?.isDarkMode).toBe(false);

    emitSystemThemeChange(false);

    await flush();

    expect(harness.getLatestStudio()?.themeMode).toBe("light");
    expect(harness.getLatestStudio()?.isDarkMode).toBe(false);

    harness.cleanup();
  });

  it("migrates persisted legacy dark mode state into explicit theme mode", () => {
    window.localStorage.setItem(
      "prisma-studio-ui-state-v1",
      JSON.stringify({
        "s:studio-ui-state": {
          data: {
            id: "studio-ui-state",
            isDarkMode: true,
            isInfiniteScrollEnabled: false,
            isNavigationOpen: true,
            tablePageSize: 25,
          },
          versionKey: "legacy-theme-state",
        },
      }),
    );

    const harness = renderHarness();

    expect(harness.getLatestStudio()?.themeMode).toBe("dark");
    expect(harness.getLatestStudio()?.isDarkMode).toBe(true);

    harness.cleanup();
  });

  it("wraps explicit theme changes in a document-bound view transition when available", () => {
    let usedDocumentThis = false;
    const startViewTransition = vi.fn(function (
      this: unknown,
      update: () => void,
    ) {
      usedDocumentThis = this === document;
      update();

      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        skipTransition: vi.fn(),
        updateCallbackDone: Promise.resolve(),
      };
    });

    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });

    const harness = renderHarness();

    act(() => {
      harness.getLatestStudio()?.setThemeMode("dark");
    });

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(usedDocumentThis).toBe(true);
    expect(harness.getLatestStudio()?.themeMode).toBe("dark");
    expect(harness.getLatestStudio()?.isDarkMode).toBe(true);

    harness.cleanup();
  });
});

describe("StudioContextProvider telemetry opt-out", () => {
  it("sends launch telemetry by default", () => {
    const harness = renderHarness();

    act(() => {
      harness.getLatestStudio()?.onEvent({
        name: "studio_launched",
        payload: {
          tableCount: 3,
        },
      });
    });

    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "studio_launched",
        product: "prisma-studio-embedded",
      }),
    );

    harness.cleanup();
  });

  it("skips launch telemetry when CHECKPOINT_DISABLE=1", () => {
    process.env.CHECKPOINT_DISABLE = "1";

    const harness = renderHarness();

    act(() => {
      harness.getLatestStudio()?.onEvent({
        name: "studio_launched",
        payload: {
          tableCount: 3,
        },
      });
    });

    expect(check).not.toHaveBeenCalled();

    harness.cleanup();
  });
});
