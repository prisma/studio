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

export async function seedObservabilityStreams(args: {
  fetchImpl?: FetchImplementation;
  now?: Date;
  streamsServerUrl: string;
}): Promise<void> {
  const fetchImpl =
    args.fetchImpl ?? (globalThis.fetch as unknown as FetchImplementation);
  const baseUrl = args.streamsServerUrl.replace(/\/+$/, "");
  const seed = buildObservabilityStreamSeed({ now: args.now ?? new Date() });

  await ensureProfiledStream({
    baseUrl,
    fetchImpl,
    profile: { kind: "evlog", redactKeys: ["sessiontoken"] },
    streamName: DEMO_OBSERVABILITY_EVENTS_STREAM,
  });
  await ensureProfiledStream({
    baseUrl,
    fetchImpl,
    profile: { kind: "otel-traces" },
    streamName: DEMO_OBSERVABILITY_TRACES_STREAM,
  });

  await postJson({
    body: seed.events,
    fetchImpl,
    label: "seeding evlog events",
    url: `${baseUrl}/v1/stream/${DEMO_OBSERVABILITY_EVENTS_STREAM}`,
  });
  await postJson({
    body: seed.spans,
    fetchImpl,
    label: "seeding otel spans",
    url: `${baseUrl}/v1/stream/${DEMO_OBSERVABILITY_TRACES_STREAM}`,
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
