import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SchemaVisualization } from "./Visualiser";

const { useNavigationMock } = vi.hoisted(() => ({
  useNavigationMock: vi.fn<
    () => {
      createUrl: () => string;
      metadata: {
        activeSchema: { name: string };
      };
    }
  >(),
}));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: useNavigationMock,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("SchemaVisualization", () => {
  beforeEach(() => {
    useNavigationMock.mockReturnValue({
      createUrl: () => "#",
      metadata: {
        activeSchema: { name: "public" },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("renders table nodes and reacts to table list updates", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SchemaVisualization
          tables={[
            {
              name: "users",
              fields: [{ name: "id", type: "text", isPrimary: true }],
            },
          ]}
          relationships={[]}
        />,
      );
    });

    expect(container.textContent).toContain("users");
    expect(
      container.querySelector('[aria-label="Open table users"]'),
    ).not.toBeNull();

    act(() => {
      root.render(
        <SchemaVisualization
          tables={[
            {
              name: "users",
              fields: [{ name: "id", type: "text", isPrimary: true }],
            },
            {
              name: "posts",
              fields: [{ name: "id", type: "text", isPrimary: true }],
            },
          ]}
          relationships={[{ from: "posts", to: "users", type: "many-to-one" }]}
        />,
      );
    });

    expect(container.textContent).toContain("posts");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("uses semantic foreground colors for table titles and field labels", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SchemaVisualization
          tables={[
            {
              name: "users",
              fields: [
                { name: "id", type: "text", isPrimary: true },
                { name: "email", type: "text" },
              ],
            },
          ]}
          relationships={[]}
        />,
      );
    });

    const title = Array.from(container.querySelectorAll("div")).find(
      (element) =>
        element.textContent?.trim() === "users" &&
        element.className.includes("font-semibold"),
    );
    const fieldName = Array.from(container.querySelectorAll("span")).find(
      (element) => element.textContent?.trim() === "email",
    );
    const openButton = container.querySelector(
      '[aria-label="Open table users"]',
    );

    expect(title?.parentElement?.className).toContain("text-foreground");
    expect(fieldName?.parentElement?.className).toContain("text-foreground");
    expect(openButton?.parentElement?.className).toContain("text-foreground");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
