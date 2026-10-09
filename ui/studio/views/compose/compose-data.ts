/**
 * Simulated data model for the Compose application canvas prototype.
 *
 * Compose composes an application from modules (independently deployable
 * or bundled into a single Bun app) and tracks their dependencies on each
 * other and on external services. Module boundaries are auto-instrumented,
 * so every cross-boundary request is an OTel span — which is what the
 * live traffic figures on the canvas represent.
 *
 * Everything here is a hard-coded fixture plus a deterministic traffic
 * simulator: there is no Compose backend yet. The simulator is pure
 * (state in, state out; randomness injected) so ticks are testable.
 */

export type ComposeNodeKind = "ingress" | "module" | "service";

export type ComposeServiceType =
  | "postgres"
  | "redis"
  | "object-storage"
  | "external-api"
  | "email";

export type ComposeDeployment =
  | { mode: "standalone" }
  | { mode: "bundled"; app: string };

export type ComposeHealth = "healthy" | "degraded" | "down";

export interface ComposeNode {
  id: string;
  kind: ComposeNodeKind;
  name: string;
  /** Modules: runtime; services: provider label (e.g. "Prisma Postgres"). */
  detail: string;
  serviceType?: ComposeServiceType;
  deployment?: ComposeDeployment;
}

export interface ComposeEdgeTraffic {
  /** Steady-state requests per second the simulator oscillates around. */
  baseRps: number;
  rps: number;
  p95Ms: number;
  /** 0..1 fraction of failed requests on this boundary. */
  errorRate: number;
}

export interface ComposeEdge {
  id: string;
  source: string;
  target: string;
  /** Boundary protocol shown on hover/labels. */
  protocol: "http" | "queue" | "sql" | "s3" | "smtp";
  traffic: ComposeEdgeTraffic;
}

export interface ComposeGraph {
  appName: string;
  nodes: ComposeNode[];
  edges: ComposeEdge[];
}

export interface ComposeTraceRow {
  span: string;
  target: string;
  durationMs: number;
  ok: boolean;
}

/** Deterministic PRNG (mulberry32) so simulator behavior is testable. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const edge = (
  source: string,
  target: string,
  protocol: ComposeEdge["protocol"],
  baseRps: number,
  p95Ms: number,
  errorRate = 0.002,
): ComposeEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  protocol,
  traffic: { baseRps, rps: baseRps, p95Ms, errorRate },
});

/**
 * The fixture application: an e-commerce app composed of seven modules
 * (three standalone units, four bundled into the single Bun app "core")
 * and six external services.
 */
export function createComposeFixture(): ComposeGraph {
  return {
    appName: "acme-shop",
    nodes: [
      {
        id: "ingress",
        kind: "ingress",
        name: "Edge traffic",
        detail: "https · public",
      },
      {
        id: "web",
        kind: "module",
        name: "web",
        detail: "storefront BFF",
        deployment: { mode: "standalone" },
      },
      {
        id: "auth",
        kind: "module",
        name: "auth",
        detail: "sessions & identity",
        deployment: { mode: "standalone" },
      },
      {
        id: "catalog",
        kind: "module",
        name: "catalog",
        detail: "products & search",
        deployment: { mode: "bundled", app: "core" },
      },
      {
        id: "orders",
        kind: "module",
        name: "orders",
        detail: "cart & checkout",
        deployment: { mode: "bundled", app: "core" },
      },
      {
        id: "billing",
        kind: "module",
        name: "billing",
        detail: "payments",
        deployment: { mode: "bundled", app: "core" },
      },
      {
        id: "notifications",
        kind: "module",
        name: "notifications",
        detail: "async worker",
        deployment: { mode: "bundled", app: "core" },
      },
      {
        id: "media",
        kind: "module",
        name: "media",
        detail: "image pipeline",
        deployment: { mode: "standalone" },
      },
      {
        id: "app-db",
        kind: "service",
        name: "app-db",
        detail: "Prisma Postgres",
        serviceType: "postgres",
      },
      {
        id: "catalog-db",
        kind: "service",
        name: "catalog-db",
        detail: "Prisma Postgres",
        serviceType: "postgres",
      },
      {
        id: "cache",
        kind: "service",
        name: "cache",
        detail: "Redis",
        serviceType: "redis",
      },
      {
        id: "object-storage",
        kind: "service",
        name: "media-bucket",
        detail: "S3 object storage",
        serviceType: "object-storage",
      },
      {
        id: "stripe",
        kind: "service",
        name: "stripe",
        detail: "Stripe API",
        serviceType: "external-api",
      },
      {
        id: "email",
        kind: "service",
        name: "email",
        detail: "Resend",
        serviceType: "email",
      },
    ],
    edges: [
      edge("ingress", "web", "http", 42, 88),
      edge("web", "auth", "http", 18, 24),
      edge("web", "catalog", "http", 31, 41),
      edge("web", "orders", "http", 9, 63),
      edge("web", "media", "http", 6, 130),
      edge("auth", "cache", "http", 25, 3),
      edge("auth", "app-db", "sql", 7, 9),
      edge("catalog", "catalog-db", "sql", 38, 12),
      edge("catalog", "cache", "http", 22, 2),
      edge("orders", "app-db", "sql", 14, 15),
      edge("orders", "billing", "http", 4, 210),
      edge("orders", "notifications", "queue", 4, 6),
      edge("billing", "stripe", "http", 4, 320, 0.02),
      edge("billing", "app-db", "sql", 5, 11),
      edge("notifications", "email", "smtp", 3, 540, 0.06),
      edge("media", "object-storage", "s3", 6, 95),
    ],
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Advances live traffic one tick: every edge's rps drifts around its
 * baseline with a slow wave plus jitter, latency wobbles, and error
 * rates decay toward their baseline with occasional spikes (the Stripe
 * boundary is the fixture's designated troublemaker). Pure — returns new
 * edge objects and leaves the input untouched.
 */
export function tickTraffic(
  edges: readonly ComposeEdge[],
  tick: number,
  random: () => number,
): ComposeEdge[] {
  return edges.map((current, index) => {
    const { baseRps, p95Ms, errorRate } = current.traffic;
    const wave = 1 + 0.25 * Math.sin(tick / 5 + index * 1.7);
    const jitter = 0.85 + random() * 0.3;
    const rps = clamp(baseRps * wave * jitter, 0.2, baseRps * 2);

    const baseP95 = initialP95(current);
    const nextP95 = clamp(
      p95Ms * (0.9 + random() * 0.2),
      baseP95 * 0.6,
      baseP95 * 2.5,
    );

    const baseError = initialErrorRate(current);
    const spiked =
      random() < 0.02 ? baseError + 0.05 + random() * 0.05 : undefined;
    const nextError =
      spiked ?? clamp(errorRate * 0.8 + baseError * 0.2, 0, 0.25);

    return {
      ...current,
      traffic: {
        baseRps,
        rps: Math.round(rps * 10) / 10,
        p95Ms: Math.round(nextP95),
        errorRate: Math.round(nextError * 1000) / 1000,
      },
    };
  });
}

const FIXTURE_BASELINES = new Map(
  createComposeFixture().edges.map((e) => [e.id, e.traffic] as const),
);

function initialP95(edgeValue: ComposeEdge): number {
  return FIXTURE_BASELINES.get(edgeValue.id)?.p95Ms ?? edgeValue.traffic.p95Ms;
}

function initialErrorRate(edgeValue: ComposeEdge): number {
  return (
    FIXTURE_BASELINES.get(edgeValue.id)?.errorRate ??
    edgeValue.traffic.errorRate
  );
}

/**
 * Health is derived from the traffic crossing a node's boundaries:
 * any touching edge with a hard error rate marks it degraded (down is
 * reserved for a dead boundary — no simulated case yet, but the state
 * exists so the visual language is complete).
 */
export function deriveHealth(
  node: ComposeNode,
  edges: readonly ComposeEdge[],
): ComposeHealth {
  const touching = edges.filter(
    (candidate) => candidate.source === node.id || candidate.target === node.id,
  );

  if (touching.length === 0) {
    return "healthy";
  }

  if (touching.some((candidate) => candidate.traffic.errorRate >= 0.15)) {
    return "down";
  }

  if (touching.some((candidate) => candidate.traffic.errorRate >= 0.04)) {
    return "degraded";
  }

  return "healthy";
}

/** Aggregate figures for the floating header. */
export function summarizeGraph(graph: ComposeGraph): {
  modules: number;
  services: number;
  inboundRps: number;
  errorRate: number;
  health: ComposeHealth;
} {
  const modules = graph.nodes.filter((node) => node.kind === "module").length;
  const services = graph.nodes.filter((node) => node.kind === "service").length;
  const inboundRps = graph.edges
    .filter((candidate) => candidate.source === "ingress")
    .reduce((sum, candidate) => sum + candidate.traffic.rps, 0);
  const totalRps = graph.edges.reduce(
    (sum, candidate) => sum + candidate.traffic.rps,
    0,
  );
  const weightedErrors = graph.edges.reduce(
    (sum, candidate) =>
      sum + candidate.traffic.rps * candidate.traffic.errorRate,
    0,
  );
  const errorRate = totalRps > 0 ? weightedErrors / totalRps : 0;
  const healths = graph.nodes.map((node) => deriveHealth(node, graph.edges));
  const health: ComposeHealth = healths.includes("down")
    ? "down"
    : healths.includes("degraded")
      ? "degraded"
      : "healthy";

  return {
    modules,
    services,
    inboundRps: Math.round(inboundRps * 10) / 10,
    errorRate,
    health,
  };
}

/**
 * Fabricates the "recent boundary traces" list for a selected node from
 * the edges touching it — one OTel-span-shaped row per sample, weighted
 * by each boundary's traffic share.
 */
export function buildTraceRows(
  node: ComposeNode,
  edges: readonly ComposeEdge[],
  random: () => number,
  count = 8,
): ComposeTraceRow[] {
  const touching = edges.filter(
    (candidate) => candidate.source === node.id || candidate.target === node.id,
  );

  if (touching.length === 0) {
    return [];
  }

  const totalRps = touching.reduce(
    (sum, candidate) => sum + candidate.traffic.rps,
    0,
  );
  const rows: ComposeTraceRow[] = [];

  for (let index = 0; index < count; index += 1) {
    let pick = random() * totalRps;
    let chosen = touching[0]!;

    for (const candidate of touching) {
      pick -= candidate.traffic.rps;
      if (pick <= 0) {
        chosen = candidate;
        break;
      }
    }

    const outbound = chosen.source === node.id;
    const other = outbound ? chosen.target : chosen.source;
    const spread = 0.4 + random() * 1.4;

    rows.push({
      span: `${chosen.protocol.toUpperCase()} ${outbound ? "→" : "←"} ${other}`,
      target: other,
      durationMs: Math.max(1, Math.round(chosen.traffic.p95Ms * spread)),
      ok: random() >= chosen.traffic.errorRate,
    });
  }

  return rows;
}
