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

const adapter = createPostgresAdapter({
  executor: createStudioBFFClient({
    url: "/api/query",
  }),
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
- When `llm` is omitted, Studio hides AI filtering, AI SQL generation, and AI visualization affordances entirely.
- There are no per-feature AI integration props to wire separately.
- Studio does not render a built-in fullscreen header button. If your host needs fullscreen behavior, render that control at the host container level, as the local demo does.

Studio handles prompt construction, type-aware validation, correction retries, SQL execution retries, and conversion into the normal filter, SQL, and visualization surfaces. The host transport only needs to forward the prepared request to an LLM provider and return the typed result.

## AI Contract

```ts
type StudioLlmRequest = {
  task: "table-filter" | "sql-generation" | "sql-visualization";
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

Studio treats `output-limit-exceeded` as a first-class retry signal for SQL generation and visualization correction loops. All prompting and retry behavior live in Studio itself, so host implementations should stay transport-only.

## Integration Checklist

Studio is an embeddable React surface, not a standalone app shell. A production integration should:

- render `<Studio />` inside the host product's route, panel, or page
- import `@prisma/studio-core/ui/index.css` exactly once
- create one database adapter per connection using `createPostgresAdapter`, `createMySQLAdapter`, or `createSQLiteAdapter`
- back that adapter with an authenticated executor, typically `createStudioBFFClient({ url: "/api/query" })`
- expose a JSON BFF endpoint that accepts Studio requests and executes them against the database
- pass any tenant or auth context through `customHeaders` and/or `customPayload`
- optionally provide `llm` for AI-assisted filtering, SQL generation, and SQL result visualization
- own surrounding product chrome such as routing, auth, tenancy, and fullscreen controls

The simplest supported shape is: host React app -> `<Studio />` -> adapter -> `createStudioBFFClient(...)` -> host BFF route -> database executor.

## BFF Contract

Studio's packaged adapters speak one JSON-over-HTTP contract. The host application is expected to implement a POST endpoint, usually `/api/query`, that accepts `StudioBFFRequest` payloads and returns JSON results with serialized errors.

The current contract includes `procedure: "transaction"` so Studio can commit multiple staged row updates in one database transaction when the backend supports it.

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
```

### Request Shapes

```ts
type StudioBFFRequest =
  | {
      procedure: "query";
      query: Query;
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
      schemaVersion?: string;
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
```

### Procedure Semantics

- `query`: execute one SQL statement. This is required for every Studio adapter.
- `sequence`: execute exactly two queries in order. This is used by MySQL write flows that update first and refetch second.
- `transaction`: execute an ordered list of queries inside one database transaction. This is the contract addition that enables atomic staged multi-row saves from the table editor.
- `sql-lint`: return parse/plan diagnostics for the SQL editor and SQL-backed filter pills.

For `sequence`, the second query should only run if the first one succeeds. For `transaction`, the response result array must stay in the same order as `body.queries`.

`sql-lint` is optional because adapters can fall back to adapter-local `EXPLAIN` strategies. `transaction` is strongly recommended because it gives staged multi-row saves atomic behavior; without it, adapters may fall back to sequential writes.

## Example BFF Handler

The demo server in this repo is the reference implementation. A host route can mirror it closely:

```ts
import { serializeError, type StudioBFFRequest } from "@prisma/studio-core/data/bff";

export async function handleStudioBff(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      headers: { Allow: "POST,OPTIONS" },
      status: 405,
    });
  }

  const payload = (await request.json()) as StudioBFFRequest;

  if (payload.procedure === "query") {
    const [error, result] = await executor.execute(payload.query);
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
- If you omit `llm`, Studio still supports the full manual filtering UI and the standard SQL editor, just without any AI affordances.

## Telemetry

This package includes anonymized telemetry to help us improve Prisma Studio.
Set `CHECKPOINT_DISABLE=1` to opt out of usage-data collection, following Prisma's documented CLI telemetry opt-out contract. Learn more in our [Privacy Policy](https://www.prisma.io/privacy) and the [Prisma CLI telemetry docs](https://www.prisma.io/docs/v6/orm/tools/prisma-cli#how-to-opt-out-of-data-collection).

## Run Studio Locally

Requirements:

- Node.js `^20.19 || ^22.12 || >=24.0`
- `pnpm` `8`
- `bun`

Install dependencies and start the demo:

```sh
pnpm install
pnpm demo:ppg
```

Then open [http://localhost:4310](http://localhost:4310).

To enable the demo's AI flows, copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.
The demo reads that key server-side and calls Anthropic Haiku 4.5 directly over HTTP through one shared `llm` hook used by table filtering, SQL generation, and SQL result visualization. Set `STUDIO_DEMO_AI_ENABLED=false` to hide all AI affordances without removing the key. `STUDIO_DEMO_AI_FILTERING_ENABLED` is still accepted as a legacy alias. `.env` and `.env.local` are gitignored.

The demo:

- starts Prisma Postgres dev (`ppg-dev`) programmatically via `@prisma/dev`
- uses direct TCP for query execution
- seeds sample relational data on startup
- auto-rebuilds and reloads the UI when source files change

The demo database is intentionally ephemeral: it is pre-seeded when the demo starts and reset when the demo process stops.

## Useful Commands

- `pnpm demo:ppg` - run local Studio demo with seeded Prisma Postgres dev
- `pnpm typecheck` - run TypeScript checks
- `pnpm lint` - run ESLint (`--fix`)
- `pnpm test` - run default vitest suite
- `pnpm test:checkpoint` - run checkpoint tests
- `pnpm test:data` - run data-layer tests
- `pnpm test:demo` - run demo/server tests
- `pnpm test:ui` - run UI tests
- `pnpm test:e2e` - run e2e tests
- `pnpm demo:ppg:build` - bundle the demo server with `bun build`
- `pnpm demo:ppg:bundle` - build and run the bundled demo server
- `pnpm build:deploy` - build a self-contained Compute-ready demo artifact in `deploy/`
- `pnpm build` - build distributable package with `tsup`
- `pnpm check:exports` - validate package export map/types

`@prisma/dev` now emits its own PGlite runtime assets during Bun bundling, so
plain `bun build` no longer needs `--packages external` just to keep Prisma
Postgres dev working. For a source-free Compute artifact, use `pnpm build:deploy`:
that path still prebuilds the browser JS/CSS and injects those assets into the
server bundle so the deployed demo does not need the repo checkout at runtime.

## Development Workflow

For day-to-day development, run the demo locally and verify both terminal logs and browser behavior as you make changes.

Recommended flow:

1. Run `pnpm demo:ppg`.
2. Keep the demo process attached so rebuilds and runtime logs stay visible.
3. Validate UI behavior at `http://localhost:4310`, using Playwright when you want an automated browser check.

Because the demo is pre-seeded and resets between runs, update seed data whenever needed to reproduce richer scenarios.

Seed data lives in `demo/ppg-dev/seed-database.ts` (`seedDatabase`).
