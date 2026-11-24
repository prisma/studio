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

  function render(
    values: number[],
    props: { times?: number[]; windowMs?: number } = {},
  ) {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <TemporalSparkline
          formatValue={(v) => `${v}ms`}
          height={20}
          label="Progress lag"
          values={values}
          width={100}
          {...props}
        />,
      );
    });
    return { container, unmount: () => act(() => root.unmount()) };
  }

  /** The points of the line, as `[x, y]` pairs. */
  function linePoints(container: HTMLElement): number[][] {
    return container
      .querySelectorAll("path")[1]!
      .getAttribute("d")!
      .split(" ")
      .map((point) => point.slice(1).split(",").map(Number));
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

  it("starts the vertical axis at zero, so a small change stays small", () => {
    const { container, unmount } = render([105, 106]);
    const [first, second] = linePoints(container);

    // 14 pixels of height stand for 0 to 106, so one more run moves the line by a fraction of a pixel.
    expect(Math.abs(first![1]! - second![1]!)).toBeLessThan(0.5);
    unmount();
  });

  it("places samples by the time they were taken", () => {
    const { container, unmount } = render([1, 1, 1], {
      times: [0, 10_000, 100_000],
      windowMs: 200_000,
    });
    const xs = linePoints(container).map((point) => point[0]);

    // 96 pixels stand for 200 seconds and the newest sample is at the right edge.
    expect(xs).toEqual([50, 54.8, 98]);
    expect(
      container.querySelector("svg")!.getAttribute("aria-label"),
    ).toContain("across 3 samples over 1m 40s");
    unmount();
  });
});
