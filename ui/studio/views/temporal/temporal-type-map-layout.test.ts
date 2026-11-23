import { describe, expect, it } from "vitest";

import type { TemporalTypeMapNode } from "@/data/temporal";

import {
  layoutTypeMap,
  orderTypeMapNodes,
  roundedPath,
  typeMapNodeSize,
} from "./temporal-type-map-layout";

function node(
  id: string,
  kind: TemporalTypeMapNode["kind"],
  overrides: Partial<TemporalTypeMapNode> = {},
): TemporalTypeMapNode {
  return {
    failedRunCount: 0,
    failedRuns: [],
    id,
    kind,
    label: id,
    retriedRunCount: 0,
    runCount: 1,
    spanCount: 1,
    waitingRunCount: 0,
    waitingRuns: [],
    ...overrides,
  };
}

const edge = (from: string, to: string, runCount = 1) => ({
  from,
  id: `${from}\n${to}`,
  runCount,
  to,
});

describe("layoutTypeMap", () => {
  it("puts the start above the steps and the closing statuses below them, also when the steps loop", async () => {
    const { edges, nodes: positions } = await layoutTypeMap({
      edges: [
        edge("start", "charge", 3),
        edge("charge", "timer", 3),
        edge("timer", "charge", 2),
        edge("timer", "end:Completed", 2),
        edge("charge", "end:Failed"),
      ],
      nodes: [
        node("start", "start"),
        node("charge", "activity"),
        node("timer", "timer"),
        node("end:Completed", "end"),
        node("end:Failed", "end"),
      ],
    });

    expect(positions.start!.y).toBeLessThan(positions.charge!.y);
    expect(positions.charge!.y).toBeLessThan(positions.timer!.y);
    expect(positions.timer!.y).toBeLessThan(positions["end:Completed"]!.y);
    expect(positions["end:Failed"]!.y).toBe(positions["end:Completed"]!.y);
    // Every arrow has a route and a place for its count.
    expect(Object.keys(edges)).toHaveLength(5);
    expect(edges["start\ncharge"]!.points.length).toBeGreaterThanOrEqual(2);
    expect(edges["start\ncharge"]!.label).toBeDefined();
  });
});

describe("orderTypeMapNodes", () => {
  it("puts a step after the steps that lead to it, however early some run reached it", () => {
    // Most runs release the inventory late; the runs came in an order that lists it early.
    const ordered = orderTypeMapNodes({
      edges: [
        edge("start", "charge"),
        edge("charge", "release"),
        edge("charge", "ship"),
        edge("ship", "refund"),
        edge("refund", "release"),
        edge("release", "end:Failed"),
      ],
      nodes: [
        node("start", "start"),
        node("charge", "activity"),
        node("release", "activity"),
        node("ship", "child-workflow"),
        node("refund", "activity"),
        node("end:Failed", "end"),
      ],
    });

    expect(ordered.map((item) => item.id)).toEqual([
      "start",
      "charge",
      "ship",
      "refund",
      "release",
      "end:Failed",
    ]);
  });
});

describe("roundedPath", () => {
  it("rounds a corner and keeps the ends where they are", () => {
    expect(
      roundedPath(
        [
          { x: 0, y: 0 },
          { x: 0, y: 20 },
          { x: 30, y: 20 },
        ],
        6,
      ),
    ).toBe("M 0 0 L 0 14 Q 0 20 6 20 L 30 20");
  });
});

describe("typeMapNodeSize", () => {
  it("makes a step taller when it has failures or waiting runs to show", () => {
    expect(typeMapNodeSize(node("charge", "activity")).height).toBeLessThan(
      typeMapNodeSize(node("charge", "activity", { failedRunCount: 2 })).height,
    );
  });
});
