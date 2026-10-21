import { describe, expect, it } from "vitest";

import {
  buildTraceRows,
  createComposeFixture,
  createRng,
  deriveHealth,
  summarizeGraph,
  tickTraffic,
} from "./compose-data";

describe("createComposeFixture", () => {
  it("wires every edge to existing nodes", () => {
    const graph = createComposeFixture();
    const ids = new Set(graph.nodes.map((node) => node.id));

    for (const edge of graph.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it("has one ingress and both deployment modes represented", () => {
    const graph = createComposeFixture();

    expect(graph.nodes.filter((node) => node.kind === "ingress")).toHaveLength(
      1,
    );

    const modes = graph.nodes
      .filter((node) => node.kind === "module")
      .map((node) => node.deployment?.mode);
    expect(modes).toContain("standalone");
    expect(modes).toContain("bundled");
  });
});

describe("tickTraffic", () => {
  it("is pure and keeps traffic within sane bounds", () => {
    const graph = createComposeFixture();
    const before = JSON.stringify(graph.edges);
    const random = createRng(42);

    let edges = graph.edges;
    for (let tick = 0; tick < 50; tick += 1) {
      edges = tickTraffic(edges, tick, random);
    }

    expect(JSON.stringify(graph.edges)).toBe(before);

    for (const edge of edges) {
      expect(edge.traffic.rps).toBeGreaterThan(0);
      expect(edge.traffic.rps).toBeLessThanOrEqual(edge.traffic.baseRps * 2);
      expect(edge.traffic.errorRate).toBeGreaterThanOrEqual(0);
      expect(edge.traffic.errorRate).toBeLessThanOrEqual(0.25);
      expect(edge.traffic.p95Ms).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a given seed", () => {
    const graph = createComposeFixture();
    const a = tickTraffic(graph.edges, 3, createRng(7));
    const b = tickTraffic(graph.edges, 3, createRng(7));

    expect(a).toEqual(b);
  });
});

describe("deriveHealth", () => {
  it("marks nodes touching a high-error boundary as degraded", () => {
    const graph = createComposeFixture();
    const email = graph.nodes.find((node) => node.id === "email")!;
    const notifications = graph.nodes.find(
      (node) => node.id === "notifications",
    )!;
    const web = graph.nodes.find((node) => node.id === "web")!;

    // The fixture ships the email boundary at 6% errors.
    expect(deriveHealth(email, graph.edges)).toBe("degraded");
    expect(deriveHealth(notifications, graph.edges)).toBe("degraded");
    expect(deriveHealth(web, graph.edges)).toBe("healthy");
  });

  it("escalates to down at hard error rates", () => {
    const graph = createComposeFixture();
    const edges = graph.edges.map((edge) =>
      edge.id === "billing->stripe"
        ? { ...edge, traffic: { ...edge.traffic, errorRate: 0.2 } }
        : edge,
    );
    const stripe = graph.nodes.find((node) => node.id === "stripe")!;

    expect(deriveHealth(stripe, edges)).toBe("down");
  });
});

describe("summarizeGraph", () => {
  it("aggregates counts, inbound rps, and overall health", () => {
    const graph = createComposeFixture();
    const summary = summarizeGraph(graph);

    expect(summary.modules).toBe(7);
    expect(summary.services).toBe(6);
    expect(summary.inboundRps).toBeGreaterThan(0);
    // email at 6% drags overall health to degraded.
    expect(summary.health).toBe("degraded");
  });
});

describe("buildTraceRows", () => {
  it("fabricates span rows only from boundaries touching the node", () => {
    const graph = createComposeFixture();
    const billing = graph.nodes.find((node) => node.id === "billing")!;
    const rows = buildTraceRows(billing, graph.edges, createRng(1), 20);

    expect(rows).toHaveLength(20);
    const neighbors = new Set(["orders", "stripe", "app-db"]);
    for (const row of rows) {
      expect(neighbors.has(row.target)).toBe(true);
      expect(row.durationMs).toBeGreaterThan(0);
    }
  });
});
