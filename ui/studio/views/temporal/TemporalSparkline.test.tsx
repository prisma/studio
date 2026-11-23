import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { TemporalSparkline } from "./TemporalSparkline";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TemporalSparkline", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function render(values: number[]) {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <TemporalSparkline
          formatValue={(v) => `${v}ms`}
          label="Progress lag"
          values={values}
        />,
      );
    });
    return { container, unmount: () => act(() => root.unmount()) };
  }

  it("renders a dashed baseline when empty", () => {
    const { container, unmount } = render([]);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-label")).toContain("no samples yet");
    expect(container.querySelector("line")).not.toBeNull();
    unmount();
  });

  it("renders path and min/max/current summary for multiple samples", () => {
    const { container, unmount } = render([2, 10, 4]);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-label")).toContain(
      "Progress lag: now 4ms (min 2ms, max 10ms across 3 samples)",
    );
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelector("circle")).not.toBeNull();
    unmount();
  });
});
