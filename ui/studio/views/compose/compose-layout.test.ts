import { describe, expect, it } from "vitest";

import { createComposeFixture } from "./compose-data";
import { buildComposeFlow, edgeStroke, edgeWidth } from "./compose-layout";

describe("buildComposeFlow", () => {
  it("emits one flow node per graph node with stable prefixed ids", () => {
    const graph = createComposeFixture();
    const { nodes, edges } = buildComposeFlow(graph);

    expect(nodes).toHaveLength(graph.nodes.length);
    expect(edges).toHaveLength(graph.edges.length);
    expect(nodes.every((node) => node.id.startsWith("compose:"))).toBe(true);
  });

  it("routes services to the service card type and aggregates per-node rps", () => {
    const graph = createComposeFixture();
    const { nodes } = buildComposeFlow(graph);

    const cache = nodes.find((node) => node.id === "compose:cache")!;
    expect(cache.type).toBe("composeService");
    // auth (25) + catalog (22) flow into the cache.
    expect(cache.data.inRps).toBeCloseTo(47, 0);

    const web = nodes.find((node) => node.id === "compose:web")!;
    expect(web.type).toBe("composeModule");
    expect(web.data.outRps).toBeGreaterThan(0);
  });

  it("animates only boundaries with meaningful traffic", () => {
    const graph = createComposeFixture();
    graph.edges[0]!.traffic.rps = 0;
    const { edges } = buildComposeFlow(graph);

    expect(edges[0]!.animated).toBe(false);
    expect(edges.slice(1).every((edge) => edge.animated)).toBe(true);
  });
});

describe("edgeWidth", () => {
  it("scales monotonically and stays bounded", () => {
    expect(edgeWidth(0)).toBeCloseTo(1, 5);
    expect(edgeWidth(5)).toBeGreaterThan(edgeWidth(1));
    expect(edgeWidth(40)).toBeGreaterThan(edgeWidth(5));
    expect(edgeWidth(10_000)).toBeLessThanOrEqual(4.5);
  });
});

describe("edgeStroke", () => {
  it("shifts from calm to amber to destructive as errors rise", () => {
    const graph = createComposeFixture();
    const base = graph.edges[0]!;
    const at = (errorRate: number) => ({
      ...base,
      traffic: { ...base.traffic, errorRate },
    });

    expect(edgeStroke(at(0.001))).toContain("160");
    expect(edgeStroke(at(0.02))).toContain("75");
    expect(edgeStroke(at(0.05))).toBe("var(--destructive)");
  });
});
