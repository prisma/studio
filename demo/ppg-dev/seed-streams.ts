export const DEMO_OBSERVABILITY_EVENTS_STREAM = "app-events";
export const DEMO_OBSERVABILITY_TRACES_STREAM = "app-traces";

const DEFAULT_TICKER_INTERVAL_MS = 6_000;
const JSON_HEADERS = { "content-type": "application/json" } as const;

type FetchImplementation = (
  input: string,
  init?: {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
  },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

interface DemoSpanSeed {
  attributes?: Record<string, unknown>;
  durationMs: number;
  errorMessage?: string;
  exception?: {
    message: string;
    offsetMs: number;
    type: string;
  };
  kind: "client" | "consumer" | "internal" | "producer" | "server";
  name: string;
  parentIndex?: number;
  resourceAttributes?: Record<string, unknown>;
  service: string;
  startOffsetMs: number;
}

interface DemoRequestSeed {
  ageMs: number;
  context?: Record<string, unknown>;
  durationMs: number;
  fix?: string;
  level: "debug" | "error" | "info" | "warn";
  message: string;
  method: string;
  path: string;
  route?: string;
  service: string;
  /** When false, no evlog event is emitted (trace-only request). */
  skipEvent?: boolean;
  /** When true, no otel spans are emitted (event-only request). */
  skipTrace?: boolean;
  spans: DemoSpanSeed[];
  status: number;
  why?: string;
}

export interface DemoObservabilitySeed {
  events: Array<Record<string, unknown>>;
  spans: Array<Record<string, unknown>>;
}

function createDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createHexIdFactory(random: () => number) {
  return (length: number): string => {
    let id = "";

    for (let index = 0; index < length; index += 1) {
      id += Math.floor(random() * 16).toString(16);
    }

    // All-zero trace/span ids are rejected by the otel-traces profile.
    return id.includes("1") || id.includes("f") ? id : `1${id.slice(1)}`;
  };
}

function toUnixNanoString(unixMs: number): string {
  return (BigInt(Math.round(unixMs)) * 1_000_000n).toString();
}

function buildDemoRequestSeeds(): DemoRequestSeed[] {
  const consoleWorkerResource = {
    "cloud.platform": "cloudflare-workers",
    "cloud.provider": "cloudflare",
    "cloud.region": "earth",
    "faas.max_memory": 134_217_728,
    "scope.name": "@microlabs/otel-cf-workers",
    "service.namespace": "control-plane",
  };
  const tenantManagerResource = {
    "cloud.platform": "cloudflare-workers",
    "cloud.provider": "cloudflare",
    "cloud.region": "earth",
    "faas.max_memory": 134_217_728,
    "scope.name": "@microlabs/otel-cf-workers",
    "service.namespace": "control-plane",
  };
  const checkoutSpans: DemoSpanSeed[] = [
    {
      attributes: {
        "http.response.status_code": 402,
        "http.route": "/api/checkout",
      },
      durationMs: 234,
      errorMessage: "card declined",
      kind: "server",
      name: "POST /api/checkout",
      service: "checkout",
      startOffsetMs: 0,
    },
    {
      attributes: { "db.operation": "SELECT", "db.system": "postgresql" },
      durationMs: 8,
      kind: "client",
      name: "SELECT users",
      parentIndex: 0,
      service: "checkout",
      startOffsetMs: 12,
    },
    {
      attributes: { "db.operation": "SELECT", "db.system": "postgresql" },
      durationMs: 11,
      kind: "client",
      name: "SELECT carts",
      parentIndex: 0,
      service: "checkout",
      startOffsetMs: 24,
    },
    {
      attributes: { "url.full": "https://payments.internal/charges" },
      durationMs: 151,
      errorMessage: "402 from issuer",
      exception: {
        message: "Card declined by issuer",
        offsetMs: 149,
        type: "CardDeclinedError",
      },
      kind: "client",
      name: "POST payments /charges",
      parentIndex: 0,
      service: "payments",
      startOffsetMs: 41,
    },
  ];

  const productsSpans = (cacheHit: boolean): DemoSpanSeed[] => [
    {
      attributes: {
        "http.response.status_code": 200,
        "http.route": "/api/products",
      },
      durationMs: cacheHit ? 14 : 56,
      kind: "server",
      name: "GET /api/products",
      service: "storefront",
      startOffsetMs: 0,
    },
    {
      attributes: { "db.system": "redis" },
      durationMs: 3,
      kind: "client",
      name: cacheHit ? "GET cache products" : "MISS cache products",
      parentIndex: 0,
      service: "storefront",
      startOffsetMs: 2,
    },
    ...(cacheHit
      ? []
      : [
          {
            attributes: {
              "db.operation": "SELECT",
              "db.system": "postgresql",
            },
            durationMs: 38,
            kind: "client",
            name: "SELECT products",
            parentIndex: 0,
            service: "storefront",
            startOffsetMs: 9,
          } satisfies DemoSpanSeed,
        ]),
  ];

  const queryInsightsSnapshotSpans: DemoSpanSeed[] = [
    {
      attributes: {
        "http.request.method": "POST",
        "http.response.status_code": 200,
        "network.protocol.name": "http",
        "url.path": "/api/query-insights/snapshot",
      },
      durationMs: 3486,
      kind: "server",
      name: "fetchHandler POST",
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 0,
    },
    {
      durationMs: 3486,
      kind: "internal",
      name: "action.studio.bff",
      parentIndex: 0,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 0,
    },
    {
      durationMs: 1494,
      kind: "internal",
      name: "getSessionActor",
      parentIndex: 1,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 13,
    },
    {
      attributes: {
        "db.operation": "get",
        "db.system": "cloudflare-kv",
      },
      durationMs: 101,
      kind: "client",
      name: "KV kvUserSessions get",
      parentIndex: 2,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 38,
    },
    {
      attributes: {
        "db.system": "postgresql",
        "network.protocol.name": "tcp",
        "server.address": "local-db",
        "server.port": 5432,
      },
      durationMs: 431,
      kind: "client",
      name: "postgresql client local-db:5432",
      parentIndex: 2,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 431,
    },
    {
      attributes: {
        "db.system": "postgresql",
        "network.protocol.name": "tcp",
        "server.address": "local-db",
        "server.port": 5432,
      },
      durationMs: 321,
      kind: "client",
      name: "postgresql client local-db:5432",
      parentIndex: 2,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 862,
    },
    {
      attributes: {
        "db.system": "postgresql",
        "network.protocol.name": "tcp",
        "server.address": "local-db",
        "server.port": 5432,
      },
      durationMs: 328,
      kind: "client",
      name: "postgresql client local-db:5432",
      parentIndex: 2,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 1189,
    },
    {
      durationMs: 1992,
      kind: "internal",
      name: "getQueryInsightsSnapshot",
      parentIndex: 1,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 1494,
    },
    {
      attributes: {
        "db.operation": "executeSql",
        "rpc.service": "tenant-manager",
      },
      durationMs: 1040,
      kind: "client",
      name: "control-plane.tenant-manager.ppg.executesql",
      parentIndex: 7,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 1494,
    },
    {
      attributes: {
        "rpc.method": "executeSql",
        "rpc.service": "tenantManager",
      },
      durationMs: 1040,
      kind: "client",
      name: "Service Binding tenantManager",
      parentIndex: 8,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 1494,
    },
    {
      attributes: {
        "http.request.method": "POST",
        "http.response.status_code": 200,
      },
      durationMs: 1040,
      kind: "server",
      name: "fetchHandler POST",
      parentIndex: 9,
      resourceAttributes: tenantManagerResource,
      service: "tenant-manager",
      startOffsetMs: 1494,
    },
    {
      attributes: {
        "cloudflare.durable_object.name": "TENANT_MANAGER",
      },
      durationMs: 1040,
      kind: "internal",
      name: "Durable Object TENANT_MANAGER",
      parentIndex: 10,
      resourceAttributes: tenantManagerResource,
      service: "tenant-manager",
      startOffsetMs: 1494,
    },
    {
      attributes: {
        "db.operation": "executeSql",
        "rpc.service": "tenant-manager",
      },
      durationMs: 952,
      kind: "client",
      name: "control-plane.tenant-manager.ppg.executesql",
      parentIndex: 7,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 2534,
    },
    {
      attributes: {
        "rpc.method": "executeSql",
        "rpc.service": "tenantManager",
      },
      durationMs: 950,
      kind: "client",
      name: "Service Binding tenantManager",
      parentIndex: 12,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 2536,
    },
    {
      attributes: {
        "http.request.method": "POST",
        "http.response.status_code": 200,
      },
      durationMs: 948,
      kind: "server",
      name: "fetchHandler POST",
      parentIndex: 13,
      resourceAttributes: tenantManagerResource,
      service: "tenant-manager",
      startOffsetMs: 2538,
    },
    {
      attributes: {
        "cloudflare.durable_object.name": "TENANT_MANAGER",
      },
      durationMs: 946,
      kind: "internal",
      name: "Durable Object TENANT_MANAGER",
      parentIndex: 14,
      resourceAttributes: tenantManagerResource,
      service: "tenant-manager",
      startOffsetMs: 2540,
    },
    {
      attributes: {
        "db.system": "postgresql",
        "network.protocol.name": "tcp",
        "server.address": "local-db",
        "server.port": 5432,
      },
      durationMs: 625,
      kind: "client",
      name: "postgresql client local-db:5432",
      parentIndex: 0,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 0,
    },
    {
      attributes: {
        "db.system": "postgresql",
        "network.protocol.name": "tcp",
        "server.address": "local-db",
        "server.port": 5432,
      },
      durationMs: 414,
      kind: "client",
      name: "postgresql client local-db:5432",
      parentIndex: 0,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 625,
    },
    {
      attributes: {
        "db.system": "postgresql",
        "network.protocol.name": "tcp",
        "server.address": "local-db",
        "server.port": 5432,
      },
      durationMs: 625,
      kind: "client",
      name: "postgresql client local-db:5432",
      parentIndex: 0,
      resourceAttributes: consoleWorkerResource,
      service: "console",
      startOffsetMs: 1040,
    },
  ];

  return [
    {
      ageMs: 70_000,
      context: {
        cartId: "cart_551",
        paymentProvider: "stripe",
        userId: "user_910",
      },
      durationMs: 234,
      fix: "Ask the customer to retry with a different card.",
      level: "error",
      message: "Payment failed",
      method: "POST",
      path: "/api/checkout",
      route: "/api/checkout",
      service: "checkout",
      spans: checkoutSpans,
      status: 402,
      why: "Card declined by issuer",
    },
    {
      ageMs: 40_000,
      context: { resultCount: 18 },
      durationMs: 612,
      fix: "Add a covering index for category + price ordering.",
      level: "warn",
      message: "Product search exceeded latency budget",
      method: "GET",
      path: "/api/search",
      route: "/api/search",
      service: "storefront",
      spans: [
        {
          attributes: {
            "http.response.status_code": 200,
            "http.route": "/api/search",
          },
          durationMs: 612,
          kind: "server",
          name: "GET /api/search",
          service: "storefront",
          startOffsetMs: 0,
        },
        {
          attributes: {
            "db.operation": "SELECT",
            "db.system": "postgresql",
          },
          durationMs: 540,
          kind: "client",
          name: "SELECT products search",
          parentIndex: 0,
          service: "storefront",
          startOffsetMs: 31,
        },
      ],
      status: 200,
      why: "Sequential scan on products for an unindexed sort.",
    },
    {
      ageMs: 22 * 60_000,
      context: { plan: "pro" },
      durationMs: 187,
      fix: "Surface the duplicate-email validation before submit.",
      level: "error",
      message: "Signup failed",
      method: "POST",
      path: "/api/signup",
      route: "/api/signup",
      service: "accounts",
      spans: [
        {
          attributes: {
            "http.response.status_code": 500,
            "http.route": "/api/signup",
          },
          durationMs: 187,
          errorMessage: "unique constraint violation",
          kind: "server",
          name: "POST /api/signup",
          service: "accounts",
          startOffsetMs: 0,
        },
        {
          attributes: {
            "db.operation": "INSERT",
            "db.system": "postgresql",
          },
          durationMs: 24,
          errorMessage: "duplicate key value violates unique constraint",
          exception: {
            message:
              'duplicate key value violates unique constraint "users_email_key"',
            offsetMs: 22,
            type: "UniqueConstraintViolation",
          },
          kind: "client",
          name: "INSERT users",
          parentIndex: 0,
          service: "accounts",
          startOffsetMs: 96,
        },
      ],
      status: 500,
      why: "Email already exists but the form allowed resubmission.",
    },
    {
      ageMs: 95_000,
      context: {
        deploymentType: "preview",
        projectId: "prj_4096",
        queryGroups: 47,
        tenantId: "tenant_8b12",
      },
      durationMs: 3486,
      level: "info",
      message: "Query insights snapshot viewed",
      method: "POST",
      path: "/api/query-insights/snapshot",
      route: "/api/query-insights/snapshot",
      service: "console",
      spans: queryInsightsSnapshotSpans,
      status: 200,
    },
    {
      ageMs: 6 * 60_000,
      context: {
        projectId: "prj_9f34",
        workspaceId: "wrk_eu_central",
      },
      durationMs: 842,
      level: "info",
      message: "Workspace dashboard opened",
      method: "GET",
      path: "/api/workspaces/wrk_eu_central/dashboard",
      route: "/api/workspaces/:id/dashboard",
      service: "console",
      spans: [
        {
          attributes: {
            "http.response.status_code": 200,
            "http.route": "/api/workspaces/:id/dashboard",
          },
          durationMs: 842,
          kind: "server",
          name: "GET /api/workspaces/:id/dashboard",
          resourceAttributes: consoleWorkerResource,
          service: "console",
          startOffsetMs: 0,
        },
        {
          durationMs: 132,
          kind: "internal",
          name: "getSessionActor",
          parentIndex: 0,
          resourceAttributes: consoleWorkerResource,
          service: "console",
          startOffsetMs: 8,
        },
        {
          attributes: {
            "db.operation": "SELECT",
            "db.system": "postgresql",
          },
          durationMs: 188,
          kind: "client",
          name: "SELECT workspace projects",
          parentIndex: 0,
          resourceAttributes: consoleWorkerResource,
          service: "console",
          startOffsetMs: 154,
        },
        {
          attributes: {
            "rpc.method": "listDatabases",
            "rpc.service": "tenantManager",
          },
          durationMs: 411,
          kind: "client",
          name: "Service Binding tenantManager",
          parentIndex: 0,
          resourceAttributes: consoleWorkerResource,
          service: "console",
          startOffsetMs: 356,
        },
        {
          attributes: {
            "http.request.method": "POST",
            "http.response.status_code": 200,
          },
          durationMs: 398,
          kind: "server",
          name: "fetchHandler POST",
          parentIndex: 3,
          resourceAttributes: tenantManagerResource,
          service: "tenant-manager",
          startOffsetMs: 365,
        },
        {
          attributes: {
            "db.operation": "SELECT",
            "db.system": "postgresql",
          },
          durationMs: 259,
          kind: "client",
          name: "SELECT query_insights latest",
          parentIndex: 0,
          resourceAttributes: consoleWorkerResource,
          service: "console",
          startOffsetMs: 512,
        },
        {
          attributes: { "db.system": "redis" },
          durationMs: 44,
          kind: "client",
          name: "GET cache workspace-summary",
          parentIndex: 0,
          resourceAttributes: consoleWorkerResource,
          service: "console",
          startOffsetMs: 782,
        },
      ],
      status: 200,
    },
    {
      ageMs: 13 * 60_000,
      context: {
        orderId: "order_8831",
        reservationAttempt: 2,
        sku: "sku_hoodie_black_l",
      },
      durationMs: 1280,
      fix: "Increase stock-service timeout and keep the retry queue enabled.",
      level: "warn",
      message: "Inventory reservation retried",
      method: "POST",
      path: "/api/inventory/reservations",
      route: "/api/inventory/reservations",
      service: "checkout",
      spans: [
        {
          attributes: {
            "http.response.status_code": 202,
            "http.route": "/api/inventory/reservations",
          },
          durationMs: 1280,
          kind: "server",
          name: "POST /api/inventory/reservations",
          service: "checkout",
          startOffsetMs: 0,
        },
        {
          attributes: { "db.system": "redis" },
          durationMs: 18,
          kind: "client",
          name: "SET lock inventory-reservation",
          parentIndex: 0,
          service: "checkout",
          startOffsetMs: 11,
        },
        {
          attributes: {
            "http.request.method": "POST",
            "http.response.status_code": 504,
            "url.full": "https://inventory.internal/reservations",
          },
          durationMs: 702,
          errorMessage: "upstream timeout",
          exception: {
            message: "inventory service timed out after 700ms",
            offsetMs: 700,
            type: "UpstreamTimeoutError",
          },
          kind: "client",
          name: "POST inventory /reservations",
          parentIndex: 0,
          service: "inventory",
          startOffsetMs: 54,
        },
        {
          attributes: {
            "db.operation": "SELECT",
            "db.system": "postgresql",
          },
          durationMs: 64,
          kind: "client",
          name: "SELECT inventory fallback",
          parentIndex: 0,
          service: "checkout",
          startOffsetMs: 786,
        },
        {
          attributes: {
            "messaging.destination.name": "inventory-reservations",
            "messaging.operation": "publish",
            "messaging.system": "sqs",
          },
          durationMs: 87,
          kind: "producer",
          name: "publish inventory retry",
          parentIndex: 0,
          service: "checkout",
          startOffsetMs: 890,
        },
        {
          attributes: {
            "db.operation": "UPDATE",
            "db.system": "postgresql",
          },
          durationMs: 93,
          kind: "client",
          name: "UPDATE orders reservation_status",
          parentIndex: 0,
          service: "checkout",
          startOffsetMs: 1004,
        },
        {
          attributes: {
            "http.request.method": "POST",
            "http.response.status_code": 200,
            "url.full": "https://notifications.internal/events",
          },
          durationMs: 116,
          kind: "client",
          name: "POST notification reservation_delayed",
          parentIndex: 0,
          service: "notifications",
          startOffsetMs: 1128,
        },
      ],
      status: 202,
      why: "The stock service timed out, so the checkout queued a retry.",
    },
    {
      ageMs: 3 * 60_000,
      context: { orderId: "order_2204" },
      durationMs: 96,
      level: "info",
      message: "Order confirmation email queued",
      method: "POST",
      path: "/api/orders/2204/confirm",
      route: "/api/orders/:id/confirm",
      service: "checkout",
      skipTrace: true,
      spans: [],
      status: 202,
      why: undefined,
    },
    {
      ageMs: 8 * 60_000,
      durationMs: 412,
      level: "info",
      message: "Order export completed",
      method: "POST",
      path: "/jobs/order-export",
      route: "/jobs/order-export",
      service: "worker",
      skipEvent: true,
      spans: [
        {
          durationMs: 412,
          kind: "consumer",
          name: "process order-export",
          service: "worker",
          startOffsetMs: 0,
        },
        {
          attributes: {
            "db.operation": "SELECT",
            "db.system": "postgresql",
          },
          durationMs: 188,
          kind: "client",
          name: "SELECT orders batch",
          parentIndex: 0,
          service: "worker",
          startOffsetMs: 18,
        },
        {
          attributes: { "url.full": "https://storage.internal/exports" },
          durationMs: 121,
          kind: "client",
          name: "PUT exports/orders.csv",
          parentIndex: 0,
          service: "worker",
          startOffsetMs: 245,
        },
      ],
      status: 200,
    },
    ...[5 * 60_000, 11 * 60_000, 16 * 60_000, 27 * 60_000, 34 * 60_000].map(
      (ageMs, index): DemoRequestSeed => ({
        ageMs,
        context: { categoryId: `cat_${index + 1}` },
        durationMs: index % 2 === 0 ? 14 : 56,
        level: "info",
        message: "Products listed",
        method: "GET",
        path: "/api/products",
        route: "/api/products",
        service: "storefront",
        spans: productsSpans(index % 2 === 0),
        status: 200,
      }),
    ),
  ];
}

export function buildObservabilityRequestRecords(args: {
  hexId: (length: number) => string;
  now: Date;
  request: DemoRequestSeed;
  requestIdSuffix: string;
}): DemoObservabilitySeed {
  const { hexId, now, request, requestIdSuffix } = args;
  const requestId = `req_${requestIdSuffix}`;
  const traceId = hexId(32);
  const startMs = now.getTime() - request.ageMs;
  const spanIds = request.spans.map(() => hexId(16));
  const events: Array<Record<string, unknown>> = [];
  const spans: Array<Record<string, unknown>> = [];

  if (!request.skipEvent) {
    events.push({
      duration: request.durationMs,
      environment: "production",
      fix: request.fix ?? null,
      level: request.level,
      message: request.message,
      method: request.method,
      path: request.path,
      requestId,
      service: request.service,
      spanId: request.skipTrace ? null : (spanIds[0] ?? null),
      status: request.status,
      timestamp: new Date(startMs).toISOString(),
      traceId: request.skipTrace ? null : traceId,
      why: request.why ?? null,
      ...request.context,
    });
  }

  if (!request.skipTrace) {
    for (const [index, span] of request.spans.entries()) {
      const spanStartMs = startMs + span.startOffsetMs;
      const spanEndMs = spanStartMs + span.durationMs;
      const isRoot = span.parentIndex == null;

      spans.push({
        attributes: {
          ...(isRoot
            ? {
                "http.request.method": request.method,
                "request.id": requestId,
                "url.path": request.path,
              }
            : {}),
          ...span.attributes,
        },
        endUnixNano: toUnixNanoString(spanEndMs),
        events: span.exception
          ? [
              {
                attributes: {
                  "exception.message": span.exception.message,
                  "exception.type": span.exception.type,
                },
                name: "exception",
                timeUnixNano: toUnixNanoString(
                  spanStartMs + span.exception.offsetMs,
                ),
              },
            ]
          : [],
        kind: span.kind,
        name: span.name,
        parentSpanId:
          span.parentIndex == null ? null : spanIds[span.parentIndex],
        resource: {
          attributes: {
            "deployment.environment": "production",
            "service.name": span.service,
            "service.version": "1.42.0",
            ...span.resourceAttributes,
          },
        },
        spanId: spanIds[index],
        startUnixNano: toUnixNanoString(spanStartMs),
        status: span.errorMessage
          ? { code: "error", message: span.errorMessage }
          : { code: "ok", message: null },
        traceId,
      });
    }
  }

  return { events, spans };
}

export function buildObservabilityStreamSeed(args: {
  now: Date;
  randomSeed?: number;
}): DemoObservabilitySeed {
  const random = createDeterministicRandom(args.randomSeed ?? 0x5eed_1234);
  const hexId = createHexIdFactory(random);
  const events: Array<Record<string, unknown>> = [];
  const spans: Array<Record<string, unknown>> = [];

  for (const [index, request] of buildDemoRequestSeeds().entries()) {
    const records = buildObservabilityRequestRecords({
      hexId,
      now: args.now,
      request,
      requestIdSuffix: `${(index + 1).toString(36)}${hexId(4)}`,
    });

    events.push(...records.events);
    spans.push(...records.spans);
  }

  return { events, spans };
}

async function postJson(args: {
  body: unknown;
  fetchImpl: FetchImplementation;
  label: string;
  url: string;
}): Promise<void> {
  const response = await args.fetchImpl(args.url, {
    body: JSON.stringify(args.body),
    headers: { ...JSON_HEADERS },
    method: "POST",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    throw new Error(
      `[demo] ${args.label} failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`,
    );
  }
}

async function ensureProfiledStream(args: {
  baseUrl: string;
  fetchImpl: FetchImplementation;
  profile: Record<string, unknown>;
  streamName: string;
}): Promise<void> {
  const streamUrl = `${args.baseUrl}/v1/stream/${args.streamName}`;
  const createResponse = await args.fetchImpl(streamUrl, {
    headers: { ...JSON_HEADERS },
    method: "PUT",
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    const detail = await createResponse.text().catch(() => "");

    throw new Error(
      `[demo] creating stream ${args.streamName} failed: HTTP ${createResponse.status}${detail ? ` ${detail}` : ""}`,
    );
  }

  await postJson({
    body: {
      apiVersion: "durable.streams/profile/v1",
      profile: args.profile,
    },
    fetchImpl: args.fetchImpl,
    label: `installing ${args.streamName} profile`,
    url: `${streamUrl}/_profile`,
  });
}

export async function ensureObservabilityStreams(args: {
  fetchImpl?: FetchImplementation;
  streamsServerUrl: string;
}): Promise<void> {
  const fetchImpl =
    args.fetchImpl ?? (globalThis.fetch as unknown as FetchImplementation);
  const baseUrl = args.streamsServerUrl.replace(/\/+$/, "");

  await ensureProfiledStream({
    baseUrl,
    fetchImpl,
    profile: {
      kind: "evlog",
      observability: {
        request: {
          tracesStream: DEMO_OBSERVABILITY_TRACES_STREAM,
        },
      },
      redactKeys: ["sessiontoken"],
    },
    streamName: DEMO_OBSERVABILITY_EVENTS_STREAM,
  });
  await ensureProfiledStream({
    baseUrl,
    fetchImpl,
    profile: {
      kind: "otel-traces",
      observability: {
        request: {
          eventsStream: DEMO_OBSERVABILITY_EVENTS_STREAM,
        },
      },
    },
    streamName: DEMO_OBSERVABILITY_TRACES_STREAM,
  });
}

export async function appendObservabilitySeed(args: {
  fetchImpl?: FetchImplementation;
  seed: DemoObservabilitySeed;
  streamsServerUrl: string;
}): Promise<void> {
  const fetchImpl =
    args.fetchImpl ?? (globalThis.fetch as unknown as FetchImplementation);
  const baseUrl = args.streamsServerUrl.replace(/\/+$/, "");

  if (args.seed.events.length > 0) {
    await postJson({
      body: args.seed.events,
      fetchImpl,
      label: "appending evlog events",
      url: `${baseUrl}/v1/stream/${DEMO_OBSERVABILITY_EVENTS_STREAM}`,
    });
  }

  if (args.seed.spans.length > 0) {
    await postJson({
      body: args.seed.spans,
      fetchImpl,
      label: "appending otel spans",
      url: `${baseUrl}/v1/stream/${DEMO_OBSERVABILITY_TRACES_STREAM}`,
    });
  }
}

export async function seedObservabilityStreams(args: {
  fetchImpl?: FetchImplementation;
  now?: Date;
  streamsServerUrl: string;
}): Promise<void> {
  const fetchImpl =
    args.fetchImpl ?? (globalThis.fetch as unknown as FetchImplementation);
  const baseUrl = args.streamsServerUrl.replace(/\/+$/, "");
  const seed = buildObservabilityStreamSeed({ now: args.now ?? new Date() });

  await ensureObservabilityStreams({ fetchImpl, streamsServerUrl: baseUrl });
  await appendObservabilitySeed({
    fetchImpl,
    seed,
    streamsServerUrl: baseUrl,
  });
}

export function startObservabilityStreamTicker(args: {
  fetchImpl?: FetchImplementation;
  intervalMs?: number;
  streamsServerUrl: string;
}): () => void {
  const fetchImpl =
    args.fetchImpl ?? (globalThis.fetch as unknown as FetchImplementation);
  const baseUrl = args.streamsServerUrl.replace(/\/+$/, "");
  const requests = buildDemoRequestSeeds().filter(
    (request) => !request.skipEvent && !request.skipTrace,
  );

  const timer = setInterval(() => {
    const random = Math.random;
    const request = requests[Math.floor(random() * requests.length)];

    if (!request) {
      return;
    }

    const hexId = createHexIdFactory(random);
    const records = buildObservabilityRequestRecords({
      hexId,
      now: new Date(),
      request: { ...request, ageMs: Math.floor(random() * 1_500) },
      requestIdSuffix: hexId(6),
    });

    void (async () => {
      if (records.events.length > 0) {
        await postJson({
          body: records.events,
          fetchImpl,
          label: "appending evlog tick",
          url: `${baseUrl}/v1/stream/${DEMO_OBSERVABILITY_EVENTS_STREAM}`,
        });
      }

      if (records.spans.length > 0) {
        await postJson({
          body: records.spans,
          fetchImpl,
          label: "appending otel tick",
          url: `${baseUrl}/v1/stream/${DEMO_OBSERVABILITY_TRACES_STREAM}`,
        });
      }
    })().catch((error: unknown) => {
      console.warn(
        `[demo] observability stream ticker append failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }, args.intervalMs ?? DEFAULT_TICKER_INTERVAL_MS);

  return () => {
    clearInterval(timer);
  };
}
