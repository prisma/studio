# Prisma Studio

Prisma Studio is Prisma's visual editor for exploring and editing your database.

If you already use Prisma ORM in a project, run Studio with:

```sh
npx prisma studio
```

[Prisma Postgres](https://www.prisma.io/postgres) projects can also use Studio in [Prisma Console](https://console.prisma.io/), which includes additional AI-assisted workflows such as SQL generation and AI-powered filters.

## This Repository

This repository is the OSS home of `@prisma/studio-core`, the package that powers Prisma Studio in Prisma CLI and Prisma Console.

If you want to work on Studio itself, clone this repository and start the local demo:

```sh
pnpm install
pnpm demo:ppg
```

You do not need this repository to use `npx prisma studio` in a Prisma project.

Architecture notes live in [`Architecture/`](Architecture). The package published from this repo is consumed by other Prisma surfaces rather than used as a standalone app directly from this checkout.

Release process notes live in [`RELEASE.md`](RELEASE.md).

## Feedback and Contributions

Open an issue for bugs, feature requests, or integration questions at [github.com/prisma/studio/issues](https://github.com/prisma/studio/issues). Clear reproduction steps, expected behavior, and screenshots make feedback much easier to act on.

Issue-first contributions work best for this repo. Please open an issue before investing in a large pull request; external PRs may not be the preferred path for every change. You can also join the [Prisma Discord](https://pris.ly/discord) for broader discussion.

## Security

If you have a security issue to report, contact [security@prisma.io](mailto:security@prisma.io?subject=%5BGitHub%5D%20Prisma%20Studio%20Security%20Report).

## Embedding Prisma Studio

`@prisma/studio-core` is the embeddable Prisma Studio package.

It provides the same core experience as Prisma Studio: a visual way to explore schema, browse table data, edit rows, filter/sort/paginate records, inspect relation data, and run SQL queries with an operation log.

This package is published to npm and consumed by Prisma surfaces such as Console and CLI integrations.

## Embedding Studio

Import the UI entrypoint, include the packaged CSS once, and pass a configured adapter into `Studio`:

```tsx
import {
  Studio,
  type StudioLlmRequest,
  type StudioLlmResponse,
} from "@prisma/studio-core/ui";
import "@prisma/studio-core/ui/index.css";
import { createStudioBFFClient } from "@prisma/studio-core/data/bff";
import { createPostgresAdapter } from "@prisma/studio-core/data/postgres-core";
import { isStudioLlmResponse } from "@prisma/studio-core/data";

const bffClient = createStudioBFFClient({
  queryInsights: true,
  url: "/api/query",
});

const adapter = createPostgresAdapter({
  executor: bffClient,
  queryInsights: bffClient.queryInsights,
});

export function EmbeddedStudio() {
  return (
    <Studio
      adapter={adapter}
      llm={async (
        request: StudioLlmRequest,
      ): Promise<StudioLlmResponse> => {
        const response = await fetch("/api/ai", {
          body: JSON.stringify(request),
          headers: { "content-type": "application/json" },
          method: "POST",
        });

        const payload = (await response.json()) as unknown;

        if (isStudioLlmResponse(payload)) {
          return payload;
        }

        return {
          code: "request-failed",
          message: response.ok
            ? "AI response did not match the Studio LLM contract."
            : `AI request failed (${response.status} ${response.statusText})`,
          ok: false,
        };
      }}
    />
  );
}
```

- `adapter` is required.
- `llm` is optional and is the single supported AI transport hook for all Studio AI features.
- Studio sends the fully constructed prompt plus a task label, and the host returns either `{ ok: true, text }` or `{ ok: false, code, message }`.
- When `llm` is omitted, Studio hides AI filtering, AI SQL generation, AI visualization, and Query Insights recommendation affordances entirely.
- There are no per-feature AI integration props to wire separately.
- `queryInsights` is optional. Pass it only when your BFF implements the `query-insights` procedure; otherwise omit it so Studio hides the `Queries` view.
- Studio does not render a built-in fullscreen header button. If your host needs fullscreen behavior, render that control at the host container level, as the local demo does.

Studio handles prompt construction, type-aware validation, pre-display SQL validation for AI-generated SQL, correction retries, database-error correction, and conversion into the normal filter, SQL, and visualization surfaces. The host transport only needs to forward the prepared request to an LLM provider and return the typed result.

## AI Contract

```ts
type StudioLlmRequest = {
  task:
    | "table-filter"
    | "sql-generation"
    | "sql-visualization"
    | "query-insights";
  prompt: string;
};

type StudioLlmResponse =
  | { ok: true; text: string }
  | {
      ok: false;
      code:
        | "cancelled"
        | "not-configured"
        | "output-limit-exceeded"
        | "request-failed";
      message: string;
    };
```

Studio treats `output-limit-exceeded` as a first-class retry signal for SQL generation and visualization correction loops. When `sqlLint` is available, Studio validates AI-generated SQL before showing it and feeds lint diagnostics back through the same `sql-generation` transport when correction is needed. If AI-generated SQL still fails after the user manually runs it, Studio sends the failed SQL and database error back through that same transport so the model can propose corrected SQL without auto-running it. All prompting and retry behavior live in Studio itself, so host implementations should stay transport-only.

### SQL Result Visualization Charts

SQL result visualization uses the shared `llm` hook with `task: "sql-visualization"`. The host does not need to provide chart components, Chart.js options, callbacks, plugins, or chart-specific APIs. Studio builds the prompt from the executed SQL, database engine, full result rows, and the original AI SQL request when available; the host only forwards that prompt to the model and returns the model text.

Studio validates the model response as a small Bklit chart config before rendering. The response must be strict JSON in this shape:

```ts
type SqlResultVisualizationResponse = {
  config:
    | {
        type: "bar" | "horizontal-bar" | "line";
        title?: string;
        xKey: string;
        series: Array<{
          key: string;
          label?: string;
          color?: string;
        }>;
        stacked?: boolean;
        data: Array<Record<string, string | number | boolean | null>>;
      }
    | {
        type: "pie" | "doughnut";
        title?: string;
        labelKey: string;
        valueKey: string;
        data: Array<Record<string, string | number | boolean | null>>;
      };
};
```

Chart rules:

- `bar` and `horizontal-bar` require `xKey` plus one or more numeric `series` fields.
- `stacked: true` is supported only for `bar` and `horizontal-bar`.
- `horizontal-bar` is preferred for ranked categorical data and long category labels.
- `line` requires date-like `xKey` values: ISO dates, ISO datetimes, or epoch milliseconds.
- `pie` and `doughnut` require `labelKey` and a numeric `valueKey`.
- `data` rows must contain plain JSON primitive values only.

Example stacked horizontal bar response:

```json
{
  "config": {
    "type": "horizontal-bar",
    "title": "Team skills by organization",
    "xKey": "organization",
    "stacked": true,
    "series": [
      { "key": "typescript", "label": "TypeScript" },
      { "key": "postgres", "label": "Postgres" }
    ],
    "data": [
      { "organization": "Acme", "typescript": 4, "postgres": 2 },
      { "organization": "Globex", "typescript": 1, "postgres": 5 }
    ]
  }
}
```

Invalid JSON, unsupported chart types, non-primitive row values, missing keys, non-numeric series values, and non-date line x-values are rejected and fed back to the model for correction. The normative implementation details live in [`Architecture/sql-result-visualization.md`](Architecture/sql-result-visualization.md).

## Integration Checklist

Studio is an embeddable React surface, not a standalone app shell. A production integration should:

- render `<Studio />` inside the host product's route, panel, or page
- import `@prisma/studio-core/ui/index.css` exactly once
- create one database adapter per connection using `createPostgresAdapter`, `createMySQLAdapter`, or `createSQLiteAdapter`
- back that adapter with an authenticated executor, typically `createStudioBFFClient({ url: "/api/query" })`
- expose a JSON BFF endpoint that accepts Studio requests and executes them against the database
- pass any tenant or auth context through `customHeaders` and/or `customPayload`
- optionally provide `llm` for AI-assisted filtering, SQL generation, SQL result visualization, and Query Insights recommendations
- optionally provide `queryInsights` on the adapter when your BFF can return live query snapshots
- own surrounding product chrome such as routing, auth, tenancy, and fullscreen controls

The simplest supported shape is: host React app -> `<Studio />` -> adapter -> `createStudioBFFClient(...)` -> host BFF route -> database executor.

## Query Insights

Query Insights is an optional Studio feature for embedders that can observe database traffic outside the normal Studio table and SQL views. When enabled, Studio renders a `Queries` navigation item under the schema visualizer with live query rows, throughput and latency charts, and optional AI recommendations for selected queries.

To enable it:

1. Implement the BFF `query-insights` procedure described below.
2. Pass `bffClient.queryInsights` into the adapter as `queryInsights`.
3. Optionally pass the shared `llm` hook if you want AI recommendations in query details.

```ts
const bffClient = createStudioBFFClient({
  queryInsights: true,
  url: "/api/query",
});

const adapter = createPostgresAdapter({
  executor: bffClient,
  queryInsights: bffClient.queryInsights,
});
```

If your BFF does not implement `query-insights`, leave `queryInsights` false/undefined when creating the BFF client and leave the adapter `queryInsights` capability undefined. Studio will hide the `Queries` menu item and stale `view=queries` URLs will fall back to the normal default view.

What the `Queries` view renders:

- a live chart for `Queries/s` and average latency with `1m`, `5m`, `15m`, and `1h` ranges
- a query table with `Latency`, sanitized SQL, `Executions`, `Rows Returned`, `Last Seen`, and optional `Analysis`
- table filtering and sorting by rows returned, latency, execution count, or last-seen time
- a detail sheet with the selected query SQL, touched tables, selected-window metrics, and optional AI recommendations
- a pause/resume control for polling the injected snapshot provider

The chart and table always use the same selected time range. Studio derives visible `Executions`, `Rows Returned`, latency, last-seen values, and any provider read-work estimate from the samples it can place inside that range; it does not show cumulative provider counters as if they all happened in the visible window. The first snapshot can still show recent rows as context when their `lastSeen` timestamp is inside the selected range, but those context rows do not create live throughput values.

Consumer migration notes:

- The Studio route is `#view=queries`. Do not link to `#view=query-insights`.
- `queryInsights` is an adapter capability, not a top-level `<Studio />` prop. Enable the BFF bridge with `createStudioBFFClient({ queryInsights: true, ... })`, then pass `bffClient.queryInsights` into `createPostgresAdapter`, `createMySQLAdapter`, or `createSQLiteAdapter` alongside the executor.
- The packaged BFF bridge uses snapshot polling with `procedure: "query-insights"`. Studio does not require a Prisma Streams `streamUrl`; hosts with SSE, pg_stat_statements, ppg.query_stats, proxy logs, or control-plane telemetry should adapt that source into a `StudioQueryInsightsSnapshot`.
- AI recommendations use the shared `llm` hook with `task: "query-insights"`. Studio does not expose a separate query-specific `analyze()` or `enableAiRecommendations()` transport. Hosts that need consent should enforce it in the `llm` implementation they pass to Studio.
- Automatic AI analysis runs serially, with at most one `llm` request in flight, and stops after the first five automatically discovered query groups. Users can still manually analyze additional rows from the table or detail sheet.

Snapshot rows should be aggregated by a stable normalized query identity. Do not send raw parameter values or sensitive payloads; use parameterized SQL or another sanitized query representation. `rowsReturned`, `duration`, `count`, and `lastSeen` are best-effort operational signals for display and sorting, not accounting-grade telemetry. Studio labels `rowsReturned` as `Rows Returned` everywhere in the UI and AI advice. `reads` is optional provider read-work telemetry for sources that can estimate rows scanned, logical reads, physical reads, or a similar work signal; leave it at `0` when unknown. Studio derives visible chart and table metrics from deltas between cumulative snapshots inside the selected time window; it does not display cumulative provider counters as selected-window totals. A first snapshot can render recent rows as context, but live throughput is only available after Studio has two increasing snapshots to compare.

The lowest-fidelity provider Studio fully supports is a generic SQL snapshot with no Prisma metadata:

```ts
const snapshot = {
  generatedAt: Date.now(),
  pollingIntervalMs: 1000,
  queries: [
    {
      id: hash(normalizeSql(sql)),
      query: parameterizedOrRedactedSql,
      tables: [],
      count: cumulativeExecutionCount,
      duration: cumulativeAverageDurationMs,
      reads: 0,
      rowsReturned: cumulativeRowsReturned,
      lastSeen: latestObservedAtMs,
      prismaQueryInfo: null,
    },
  ],
};
```

For this minimum provider, `tables` can be empty, `reads` and `rowsReturned` can be `0` when unknown, and `prismaQueryInfo` can be `null`. The important requirements are stable `id`, sanitized `query`, cumulative counters for the provider retention window, and accurate `lastSeen`.

The normative integration rules, including sqlcommenter metadata mapping, privacy requirements, counter semantics, and write/transaction guidance, live in [`Architecture/query-insights.md`](Architecture/query-insights.md).

## BFF Contract

Studio's packaged adapters speak one JSON-over-HTTP contract. The host application is expected to implement a POST endpoint, usually `/api/query`, that accepts `StudioBFFRequest` payloads and returns JSON results with serialized errors.

The contract includes `procedure: "transaction"` so Studio can commit multiple staged row updates in one database transaction when the backend supports it. It can also include the optional `procedure: "query-insights"` bridge for embedders that provide live query snapshots.

### Transport Rules

- method: `POST`
- content type: `application/json`
- request authentication: whatever the host app requires; `createStudioBFFClient` forwards `customHeaders` as HTTP headers
- request body context: `customPayload` is forwarded in the JSON body unchanged
- error encoding: return serialized errors, not thrown JS objects

### Shared Types

```ts
type Query = {
  sql: string;
  parameters: readonly unknown[];
  transformations?: Partial<Record<string, "json-parse">>;
};

type SerializedError = {
  name: string;
  message: string;
  errors?: SerializedError[];
};

type SqlLintDiagnostic = {
  code?: string;
  from: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
  to: number;
};

type StudioQueryInsightPrismaQueryInfo = {
  action: string;
  isRaw: boolean;
  model?: string;
  payload?: Record<string, unknown> | Array<Record<string, unknown>>;
};

type StudioQueryInsightQuery = {
  count: number;
  duration: number;
  groupKey?: string | null;
  id: string;
  lastSeen: number;
  maxDurationMs?: number | null;
  minDurationMs?: number | null;
  prismaQueryInfo?: StudioQueryInsightPrismaQueryInfo | null;
  query: string;
  queryId?: string | null;
  reads: number;
  rowsReturned: number;
  tables: string[];
};

type StudioQueryInsightsSnapshot = {
  generatedAt: number;
  pollingIntervalMs?: number;
  queries: StudioQueryInsightQuery[];
};
```

### Request Shapes

```ts
type StudioBFFRequest =
  | {
      procedure: "query";
      query: Query;
      schema?: string;
      customPayload?: Record<string, unknown>;
    }
  | {
      procedure: "sequence";
      sequence: readonly [Query, Query];
      customPayload?: Record<string, unknown>;
    }
  | {
      procedure: "transaction";
      queries: readonly Query[];
      customPayload?: Record<string, unknown>;
    }
  | {
      procedure: "sql-lint";
      sql: string;
      schema?: string;
      schemaVersion?: string;
      customPayload?: Record<string, unknown>;
    }
  | {
      procedure: "query-insights";
      limit?: number;
      since?: number;
      customPayload?: Record<string, unknown>;
    };
```

### Response Shapes

```ts
type QueryResponse = [SerializedError, undefined?] | [null, unknown[]];

type SequenceStepResponse = [SerializedError] | [null, unknown[]];

type SequenceResponse =
  | [SequenceStepResponse]
  | [[null, unknown[]], SequenceStepResponse];

type TransactionResponse = [SerializedError, undefined?] | [null, unknown[][]];

type SqlLintResponse =
  | [SerializedError, undefined?]
  | [
      null,
      {
        diagnostics: SqlLintDiagnostic[];
        schemaVersion?: string;
      },
    ];

type QueryInsightsResponse =
  | [SerializedError, undefined?]
  | [null, StudioQueryInsightsSnapshot];
```

### Procedure Semantics

- `query`: execute one SQL statement. This is required for every Studio adapter. Requests may include `schema`; when present, use it as the default namespace for unqualified identifiers.
- `sequence`: execute exactly two queries in order. This is used by MySQL write flows that update first and refetch second.
- `transaction`: execute an ordered list of queries inside one database transaction. This is the contract addition that enables atomic staged multi-row saves from the table editor.
- `sql-lint`: return parse/plan diagnostics for the SQL editor and SQL-backed filter pills. Requests may include `schema`; diagnostics should plan unqualified identifiers against that selected schema.
- `query-insights`: return a live query snapshot for the optional `Queries` view.

For `sequence`, the second query should only run if the first one succeeds. For `transaction`, the response result array must stay in the same order as `body.queries`.

`sql-lint` is optional because adapters can fall back to adapter-local `EXPLAIN` strategies. `query-insights` is optional because not every embedder can observe application query traffic. `transaction` is strongly recommended because it gives staged multi-row saves atomic behavior; without it, adapters may fall back to sequential writes.

## Example BFF Handler

The demo server in this repo is the reference implementation. A host route can mirror it closely. The example assumes `executor` is your database executor and `queryInsightsStore` is your optional host telemetry source:

```ts
import {
  serializeError,
  type StudioBFFRequest,
} from "@prisma/studio-core/data/bff";

const queryInsightsStore = createQueryInsightsStoreFromYourTelemetry();

export async function handleStudioBff(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      headers: { Allow: "POST,OPTIONS" },
      status: 405,
    });
  }

  const payload = (await request.json()) as StudioBFFRequest;

  if (payload.procedure === "query-insights") {
    if (!queryInsightsStore) {
      return new Response("Query Insights is not supported", { status: 501 });
    }

    try {
      const snapshot = await queryInsightsStore.getSnapshot({
        limit: payload.limit,
        since: payload.since,
      });

      return Response.json([null, snapshot]);
    } catch (error) {
      return Response.json([serializeError(error)]);
    }
  }

  if (payload.procedure === "query") {
    const [error, result] = await executor.execute(payload.query, {
      schema: payload.schema,
    });
    return Response.json([error ? serializeError(error) : null, result]);
  }

  if (payload.procedure === "sequence") {
    const [firstQuery, secondQuery] = payload.sequence;
    const [firstError, firstResult] = await executor.execute(firstQuery);

    if (firstError) {
      return Response.json([[serializeError(firstError)]]);
    }

    const [secondError, secondResult] = await executor.execute(secondQuery);

    if (secondError) {
      return Response.json([
        [null, firstResult],
        [serializeError(secondError)],
      ]);
    }

    return Response.json([
      [null, firstResult],
      [null, secondResult],
    ]);
  }

  if (payload.procedure === "transaction") {
    if (typeof executor.executeTransaction !== "function") {
      return new Response("Transaction execution is not supported", {
        status: 501,
      });
    }

    const [error, result] = await executor.executeTransaction(payload.queries);
    return Response.json([error ? serializeError(error) : null, result]);
  }

  if (payload.procedure === "sql-lint") {
    if (typeof executor.lintSql !== "function") {
      return new Response("SQL lint is not supported", { status: 501 });
    }

    const [error, result] = await executor.lintSql({
      schema: payload.schema,
      schemaVersion: payload.schemaVersion,
      sql: payload.sql,
    });

    return Response.json([error ? serializeError(error) : null, result]);
  }

  return new Response("Invalid procedure", { status: 400 });
}
```

## Integration Notes

- If your host app changes auth or tenant context at runtime, recreate the BFF client or adapter so new `customHeaders` and `customPayload` are used for later requests.
- If you are embedding MySQL Studio, keep `sequence` support enabled because the adapter depends on ordered write-plus-refetch flows.
- If you want fully atomic staged table saves, implement `transaction` on the BFF and forward it to a real database transaction on the server.
- If you implement Query Insights, capture query events from application runtime instrumentation, a query proxy, driver hooks, or control-plane telemetry. Do not rely on Studio's own table and SQL requests as the source of production traffic.
- Exclude Studio-generated introspection, table browsing, SQL lint, metadata, health-check, and `query-insights` snapshot requests from production Query Insights before aggregation.
- If you omit `llm`, Studio still supports the full manual filtering UI and the standard SQL editor, just without any AI affordances.

### Split Query-Insights Service

The BFF endpoint that executes Studio SQL can delegate only `query-insights` to a sidecar. This is useful when direct query execution and query telemetry are owned by different local services:

```ts
if (payload.procedure === "query-insights") {
  const queryInsightsUrl = new URL("http://127.0.0.1:5556/snapshot");

  queryInsightsUrl.searchParams.set("limit", String(payload.limit ?? 500));

  if (payload.since != null) {
    queryInsightsUrl.searchParams.set("since", String(payload.since));
  }

  const response = await fetch(queryInsightsUrl, {
    headers: {
      authorization: request.headers.get("authorization") ?? "",
    },
  });

  if (!response.ok) {
    return Response.json([
      serializeError(new Error("Query Insights sidecar failed")),
    ]);
  }

  return Response.json([null, await response.json()]);
}
```

The sidecar response should already be a `StudioQueryInsightsSnapshot`. Other BFF procedures can continue to use the normal database executor.

## Telemetry

This package includes anonymized telemetry to help us improve Prisma Studio.
Set `CHECKPOINT_DISABLE=1` to opt out of usage-data collection, following Prisma's documented CLI telemetry opt-out contract. Learn more in our [Privacy Policy](https://www.prisma.io/privacy) and the [Prisma CLI telemetry docs](https://www.prisma.io/docs/v6/orm/tools/prisma-cli#how-to-opt-out-of-data-collection).

## Run Studio Locally

Requirements:

- Node.js matching `.node-version`
- `pnpm` `8`
- `bun`

Install dependencies and start the demo:

```sh
pnpm install
pnpm demo:ppg
```

Then open [http://localhost:4310](http://localhost:4310).

To enable the demo's AI flows, copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.
The demo reads that key server-side and calls Anthropic Haiku 4.5 directly over HTTP through one shared `llm` hook used by table filtering, SQL generation, SQL result visualization, and Query Insights recommendations. Set `STUDIO_DEMO_AI_ENABLED=false` to hide all AI affordances without removing the key. `STUDIO_DEMO_AI_FILTERING_ENABLED` is still accepted as a legacy alias. `.env` and `.env.local` are gitignored.

The demo:

- starts Prisma Postgres dev (`ppg-dev`) programmatically via `@prisma/dev`
- uses direct TCP for query execution
- seeds sample relational data on startup
- auto-rebuilds and reloads the UI when source files change

The demo database is intentionally ephemeral: it is pre-seeded when the demo starts and reset when the demo process stops.

To temporarily develop against the sibling local Streams repo instead of the
published `@prisma/streams-local` package, run:

```sh
pnpm streams:use-local
pnpm demo:ppg
```

That script builds `../streams/dist/npm/streams-local`, builds the sibling
`../team-expansion/dev/server` package, reinstalls dependencies with a
repo-local `pnpm` override so Studio uses that local `@prisma/dev` package plus
the local Streams package, and leaves `pnpm-lock.yaml` untouched. If your
checkouts live elsewhere, point the installer at them with
`STUDIO_LOCAL_PRISMA_DEV_PACKAGE_DIR=/absolute/path/to/@prisma/dev/package` and
`STUDIO_LOCAL_STREAMS_REPO_DIR=/absolute/path/to/streams` or directly set
`STUDIO_LOCAL_STREAMS_PACKAGE_DIR=/absolute/path/to/dist/npm/streams-local`.
Revert to the published npm packages with `pnpm streams:use-npm`.

## Useful Commands

- `pnpm demo:ppg` - run local Studio demo with seeded Prisma Postgres dev
- `pnpm demo:ppg:seed-scale -- --streams-url <url>` - append deterministic request-observability scale data to a running Streams server
- `pnpm typecheck` - run TypeScript checks
- `pnpm lint` - run ESLint
- `pnpm lint:fix` - run ESLint with automatic fixes
- `pnpm test` - run default vitest suite with external MySQL integration and heavyweight local suites skipped unless explicitly enabled
- `STUDIO_INCLUDE_HEAVY_LOCAL_TESTS=1 pnpm test` - include the Compute bundle boot smoke test and monolithic active-table filtering suite
- `pnpm test:checkpoint` - run checkpoint tests
- `pnpm test:data` - run data-layer tests
- `pnpm test:data:mysql` - run MySQL/Vitess-backed data integration tests against `STUDIO_MYSQL_TEST_URL` or `mysql://root@localhost:15306/studio`
- `pnpm test:demo` - run demo/server tests
- `pnpm test:ui` - run UI tests
- `pnpm test:e2e` - run e2e tests
- `pnpm demo:ppg:build` - bundle the demo server with `bun build`
- `pnpm demo:ppg:bundle` - build and run the bundled demo server
- `pnpm build:deploy` - build a self-contained Compute-ready demo artifact in `deploy/`
- `pnpm build` - build distributable package with `tsup`
- `pnpm check:exports` - validate package export map/types
- `pnpm streams:use-local` - build and install the sibling local Streams package without touching `pnpm-lock.yaml`
- `pnpm streams:use-npm` - reinstall the published Streams package without touching `pnpm-lock.yaml`

`@prisma/dev` now emits its own PGlite runtime assets during Bun bundling, so
plain `bun build` no longer needs `--packages external` just to keep Prisma
Postgres dev working. For a source-free Compute artifact, use `pnpm build:deploy`:
that path prebuilds the browser JS/CSS, injects those assets into the server
bundle, and copies Prisma Dev's runtime assets into `deploy/bundle/` with
stable filenames so the deployed demo does not need the repo checkout at
runtime. It also Bun-bundles the Prisma Streams local worker into `deploy/touch/`
so Compute can keep Prisma Dev's WAL-to-stream sidecar alive in the source-free artifact.

Deploy that artifact with:

```sh
bunx @prisma/compute-cli deploy --skip-build \
  --path deploy \
  --entrypoint bundle/compute-entrypoint.js \
  --http-port 8080 \
  --service <service-id>
```

## Compute Preview Deploys

This repo also maintains branch-scoped Compute previews for pull requests.

- `.github/workflows/compute-preview.yml` deploys the current PR branch into the
  dedicated `studio-preview` Compute project whenever a PR is opened,
  reopened, or updated with new commits.
- The preview service name is derived from the branch name through a stable
  Compute-safe slug, so later pushes reuse the same service instead of creating
  duplicates.
- The workflow updates one sticky PR comment with the live preview URL after a
  successful deploy.
- When a Git branch is deleted, the same workflow destroys the matching preview
  service.

The workflow expects the GitHub Actions secret
`STUDIO_PREVIEW_COMPUTE_TOKEN`, which should contain a Compute API token for the
`studio-preview` project.

For branch-deletion cleanup to happen automatically, the workflow must be
present on the default branch. In practice that means merging the preview
workflow to `main` once, after which later PR branches will get full automatic
create/update/delete behavior.

## Development Workflow

For day-to-day development, run the demo locally and verify both terminal logs and browser behavior as you make changes.

Recommended flow:

1. Run `pnpm demo:ppg`.
2. Keep the demo process attached so rebuilds and runtime logs stay visible.
3. Validate UI behavior at `http://localhost:4310`, using Playwright when you want an automated browser check.

Because the demo is pre-seeded and resets between runs, update seed data whenever needed to reproduce richer scenarios.

Seed data lives in `demo/ppg-dev/seed-database.ts` (`seedDatabase`).
