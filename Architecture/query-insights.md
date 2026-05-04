# Query Insights Architecture

This document is normative for Studio's Query Insights view (`view=query-insights`).

Query Insights is an optional host-provided observability surface. Studio core owns the UI, URL state, stream decoding, bounded in-browser session state, charts, table controls, and detail sheet. The host owns the backend stream, authorization, tenant or demo database lookup, and structured analysis endpoint.

## Studio Boundary

Studio receives Query Insights through `StudioProps.queryInsights`.

The transport provides:

- initial AI recommendation consent state
- an SSE `streamUrl` that reads a JSON `prisma-log` Prisma Streams stream
- a structured `analyze(input)` function
- an `enableAiRecommendations()` function
- optional UI event forwarding

When the transport is absent, Studio MUST hide the sidebar item and command-palette action. A stale `#view=query-insights` URL MUST resolve back to the normal default view.

## URL State

Query Insights uses Studio's normal hash navigation state:

- `view=query-insights`
- `queryInsightsSort=<latency|reads|executions|lastSeen>:<asc|desc>`
- `queryInsightsTable=<table name>`

All reads and writes MUST go through `useNavigation`.

## Runtime State

Query Insights rows are intentionally local React state rather than TanStack DB collections.

This is a documented exception to the database-state architecture because Query Insights data is not table data, has no persistence contract, resets per stream session, and is bounded to 500 unique query patterns plus a 500-row paused buffer. Chart points are also local and capped to 100 points.

The stream MUST only be opened while the Query Insights view is mounted. Unmounting the view closes the EventSource.

## Stream Contract

The canonical Query Insights data source is a Prisma Streams JSON stream named
`prisma-log`. Query execution records MUST be appended to that stream
continuously by the host while queries execute, regardless of whether the Query
Insights view is currently open.

The Studio UI reads that stream through the normal Streams HTTP surface, using
`GET /v1/stream/prisma-log?format=json&offset=-1&live=sse`. This means the UI
receives standard Streams SSE events:

- `data`: a JSON array of `prisma-log` events
- `control`: stream cursor and up-to-date metadata, currently ignored by Query
  Insights

Each query event in the `data` batch uses `type: "query"` plus SQL, latency,
count, reads, rows returned, tables, optional Prisma metadata, optional
`groupKey`, optional `queryId`, and optional min/max latency. Studio derives
one-second chart buckets from each query event timestamp and aggregates repeated
query patterns in browser state.

The client MAY still decode legacy `queries` and `chartTick` SSE event names for
compatibility, but new demo and host integrations MUST feed Query Insights from
`prisma-log`.

## UI Contract

The view uses standard ShadCN primitives for cards, buttons, badges, selects, table, and sheet.

The live observability composition is Studio-specific: two Chart.js-backed metric cards feed from chart ticks, a bounded ShadCN table renders sorted and filtered query rows, and a ShadCN sheet renders details and recommendations.

Selecting a row auto-pauses table updates. Closing a sheet that caused auto-pause resumes and flushes the paused buffer.

## Query Visibility

Studio's `Query` contract includes `meta.visibility`.

Postgres adapter-generated introspection, table reads, mutations, and fallback lint helper queries MUST be marked `studio-system`. Raw SQL editor executions remain user-visible. BFF hosts should append `-- prisma:studio` to system queries before forwarding them to the database so backend Query Insights implementations can filter them consistently with `-- prisma:console`.

## ppg-dev Demo

The local `ppg-dev` demo hosts the Query Insights backend itself:

- `/api/config` advertises the Query Insights transport URLs
- ppg-dev ensures the `prisma-log` stream exists on the configured Prisma
  Streams server at startup
- `/api/query` appends the Studio system suffix to system queries, executes the database request, and appends each successful user-visible SQL execution to `prisma-log`
- the Query Insights UI reads from `/api/streams/v1/stream/prisma-log`, so it
  uses the same same-origin Streams proxy as the Stream view
- `/api/query-insights/analyze` returns deterministic demo analysis
- `/api/query-insights/enable-ai` stores consent in demo memory

This keeps the demo same-origin and exercises the Studio transport without depending on production control-plane services.
