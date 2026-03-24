// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Adapter } from "../../data/adapter";

const studioMock = vi.fn((props: Record<string, unknown>) => {
  return createElement("div", {
    "data-llm": typeof props.llm,
    "data-testid": "studio-stub",
  });
});

vi.mock("../../ui", () => ({
  Studio: (props: Record<string, unknown>) => {
    studioMock(props);
    return createElement("div", { "data-testid": "studio-stub" });
  },
}));

import { DemoApp } from "./DemoShell";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("DemoApp", () => {
  let fullscreenElement: Element | null = null;
  let requestFullscreenSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fullscreenElement = null;
    requestFullscreenSpy = vi.fn(() => {
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });

    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreenSpy,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    studioMock.mockClear();
  });

  it("shows the demo fullscreen button only while the page is not already fullscreen", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        createElement(DemoApp, {
          adapter: {} as Adapter,
          aiEnabled: false,
          bootId: "boot-1234",
          seededAt: "2026-03-09T10:00:00.000Z",
          streamsUrl: "/api/streams",
        }),
      );
    });

    const fullscreenButton = container.querySelector(
      'button[aria-label="Enter demo fullscreen"]',
    );

    expect(fullscreenButton).not.toBeNull();
    expect(
      container.querySelector('[data-testid="studio-stub"]'),
    ).not.toBeNull();
    expect(studioMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        streamsUrl: "/api/streams",
      }),
    );

    await act(async () => {
      fullscreenButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(requestFullscreenSpy).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('button[aria-label="Enter demo fullscreen"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("returns a structured output-limit error through the shared llm hook", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "output-limit-exceeded",
          message:
            "Anthropic stopped because it reached the configured output limit of 2048 tokens before finishing the response.",
          ok: false,
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        createElement(DemoApp, {
          adapter: {} as Adapter,
          aiEnabled: true,
          bootId: "boot-1234",
          seededAt: "2026-03-09T10:00:00.000Z",
          streamsUrl: "/api/streams",
        }),
      );
    });

    const studioProps = studioMock.mock.calls.at(-1)?.[0] as
      | {
          llm?: (request: {
            prompt: string;
            task: "sql-generation";
          }) => Promise<unknown>;
        }
      | undefined;

    if (typeof studioProps?.llm !== "function") {
      throw new Error("Expected llm prop");
    }

    const response = await studioProps.llm({
      prompt: "Generate a chart",
      task: "sql-generation",
    });

    expect(response).toEqual({
      code: "output-limit-exceeded",
      message:
        "Anthropic stopped because it reached the configured output limit of 2048 tokens before finishing the response.",
      ok: false,
    });

    fetchSpy.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
