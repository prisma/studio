# Query Insights Architecture

This document is normative for the Studio Queries view (`view=queries`) and its optional embedder bridge.

Query insights MUST be provided by the embedder. Studio does not infer production query traffic from its own table or SQL UI; it only renders snapshots from an injected provider.

## Scope

This architecture governs:

- the optional `Adapter.queryInsights` provider contract
- the BFF `query-insights` procedure
- Queries navigation visibility and URL fallback behavior
- AI recommendation visibility for query analysis
- demo-only query capture for `pnpm demo:ppg`

## Canonical Components

- [`data/query-insights.ts`](../data/query-insights.ts)
- [`data/adapter.ts`](../data/adapter.ts)
- [`data/bff/bff-client.ts`](../data/bff/bff-client.ts)
- [`ui/studio/context.tsx`](../ui/studio/context.tsx)
- [`ui/hooks/use-navigation.tsx`](../ui/hooks/use-navigation.tsx)
- [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx)
- [`ui/studio/views/queries/QueriesView.tsx`](../ui/studio/views/queries/QueriesView.tsx)
- [`ui/studio/views/queries/query-insights-ai.ts`](../ui/studio/views/queries/query-insights-ai.ts)
- [`demo/ppg-dev/query-insights.ts`](../demo/ppg-dev/query-insights.ts)
- [`demo/ppg-dev/server.ts`](../demo/ppg-dev/server.ts)

## Embedder Contract

- `Adapter.queryInsights` is optional.
- Studio MUST hide the `Queries` navigation item when `Adapter.queryInsights` is absent.
- If a stale URL contains `view=queries` and `Adapter.queryInsights` is absent, navigation MUST resolve back to the normal default view instead of rendering the Queries view.
- The route key is `view=queries`. Embedders MUST NOT deep-link to `view=query-insights`.
- `queryInsights` is an adapter capability. It is not a top-level Studio prop.
- Embedders that support query insights MUST provide `getSnapshot(request, options)` and return a `StudioQueryInsightsSnapshot`.
- Snapshot rows SHOULD be aggregated by a stable normalized query identity, not emitted as one row per execution.
- Snapshot rows MUST avoid raw parameter values and other sensitive payload data. The `query` field should contain parameterized SQL or another sanitized query representation.
- `tables` SHOULD contain qualified table names when the embedder can derive them.
- `rowsReturned`, `duration`, `count`, and `lastSeen` SHOULD be best-effort operational signals. Studio treats them as display and sorting data, not accounting-grade telemetry. `reads` is optional read-work telemetry and MUST NOT be used as a user-facing substitute for rows returned.
- `pollingIntervalMs` MAY be returned by the provider. A value less than or equal to `0` tells Studio not to poll automatically.

## Lowest-Fidelity Provider

Studio fully supports a generic SQL-only provider. A first implementation does not need Prisma ORM metadata, per-row plans, read-work estimates, grouping, or AI-specific fields.

The minimum useful row is:

```ts
{
  id: stableNormalizedSqlHash,
  query: parameterizedOrRedactedSql,
  tables: [],
  count: cumulativeExecutionCount,
  duration: cumulativeAverageDurationMs,
  reads: 0,
  rowsReturned: cumulativeRowsReturned,
  lastSeen: latestObservedAtMs,
  prismaQueryInfo: null,
}
```

Rules for this low-fidelity mode:

- `query` MAY be plain SQL. It SHOULD be normalized and parameterized; literal values SHOULD be replaced with placeholders or redacted tokens.
- `tables` MAY be empty when table extraction is not reliable.
- `reads` MAY be `0` when the source cannot estimate physical or logical reads.
- `rowsReturned` MAY be `0` when the source cannot observe returned row counts.
- `prismaQueryInfo`, `queryId`, `groupKey`, `minDurationMs`, and `maxDurationMs` MAY be omitted.
- AI recommendations still work without `prismaQueryInfo`; the prompt falls back to SQL, table names, and metrics. User-facing AI text SHOULD call `rowsReturned` "rows returned" and SHOULD NOT call rows returned "reads".

This is the recommended starting point for local dev providers and embedder migrations. Higher-fidelity providers can add Prisma metadata, table extraction, and better counters later without changing the Studio integration.

## Snapshot Semantics

- `generatedAt` is the snapshot creation time in Unix milliseconds.
- `id` MUST be stable for the same aggregated query identity within the provider's retention window. Prefer a hash of normalized SQL plus relevant Prisma metadata. Do not include wall-clock time, request IDs, or random values in `id`.
- `queryId` is optional and MAY carry an upstream query identifier when one exists. Studio does not require it for identity.
- `groupKey` is optional and MAY carry an upstream grouping key for future or host-specific grouping. Studio does not require it.
- `count` SHOULD be cumulative for the row identity over the provider's retention/reset window and SHOULD be monotonically non-decreasing while the same `id` remains present.
- `duration` SHOULD be the cumulative average duration in milliseconds for the same executions counted by `count`.
- `minDurationMs` and `maxDurationMs`, when present, SHOULD be cumulative over the same executions counted by `count`.
- `rowsReturned` SHOULD be cumulative for the same executions counted by `count`.
- `reads` SHOULD be cumulative for the same executions counted by `count`.
- `lastSeen` is the Unix millisecond timestamp of the most recent observed execution for the row.
- `limit` is a maximum number of rows Studio is asking for. Providers SHOULD apply it after filtering and sorting, usually by `lastSeen` descending.
- `since` is an optional Unix millisecond lower bound for `lastSeen`. Providers that support it SHOULD return rows with `lastSeen >= since`. Providers MAY ignore `since` and return a normal bounded snapshot.
- Provider retention SHOULD cover at least the largest Studio chart window, currently one hour, plus a small margin. If the source resets or drops counters, keep the same `id` only when the counters remain comparable; otherwise use a new identity or accept that Studio will treat the next row as a fresh series.
- Snapshot counters SHOULD NOT be pre-windowed to the selected Studio chart range. Studio derives chart deltas from successive cumulative snapshots and filters the UI window client-side.

## Studio Client Data Paths

Query Insights uses cumulative provider snapshots but renders selected-window UI. Studio keeps those concepts separate:

1. The embedder returns a `StudioQueryInsightsSnapshot` through `queryInsights.getSnapshot()`, usually via the BFF `query-insights` procedure.
2. `QueriesView` stores the latest raw snapshot rows in React state for current SQL text, table names, Prisma metadata, and detail-sheet context.
3. `QueriesView` also keeps a provider-keyed in-memory cache with the latest snapshot totals, latest row by `id`, global chart samples, and per-query metric samples. This cache survives leaving and returning to the `Queries` view while the same provider object is mounted.
4. The first snapshot creates `context` samples from each row's `lastSeen` timestamp. A context sample represents one recent observed execution for visual and table context. It carries average latency and average per-execution counters, but it does not carry a live `queriesPerSecond` value.
5. Later snapshots with a strictly newer `generatedAt` create `measured` samples. Studio compares each current row with the previous row for the same `id`; continuous counters become deltas, and reset counters with a newly advanced `lastSeen` are treated as fresh measured activity. Snapshots with stale or equal `generatedAt` do not create samples.
6. Global chart samples are derived from the same measured per-query deltas used for table rows. This keeps chart throughput, chart latency, table execution counts, and table row counters aligned.
7. Studio prunes both global and per-query samples to the largest selectable chart window, currently one hour.

The chart uses those samples as follows:

- The x-axis visible range ends at the latest retained global sample and extends left by the selected range.
- Throughput line data comes only from `measured` samples with a known `queriesPerSecond`. Newly observed executions are plotted in one-second buckets at their reported `lastSeen` time so delayed polling does not dilute a burst into the whole snapshot interval. Context samples do not draw blue throughput points because no rate interval is known.
- Average-latency line data comes from `measured` samples. Measured samples with no executions render as a zero-latency baseline so throughput and latency segments start, stop, and bridge short idle periods consistently. Context samples render as isolated green latency points.
- The header `Queries/s` value is the measured execution delta divided by measured elapsed seconds in the selected range. If there is no measured interval yet, Studio shows `n/a` instead of `0/s`.
- The header `Avg latency` value uses measured executions in the selected range. Zero-execution measured baseline samples are excluded from that average. If no measured executions exist but context latency points are visible, it falls back to those context samples. If neither exists, Studio shows `n/a`.

The query table uses the per-query samples as follows:

- It groups `QueryMetricSample` rows by query `id` inside the selected chart range.
- `Executions`, `Rows Returned`, `reads`, `duration`, and `lastSeen` are recomputed from that group and are never read directly from cumulative provider counters for the visible row.
- First-snapshot context rows show one representative execution with average per-execution counters so a fresh view can still show useful rows without pretending the whole cumulative provider history happened inside the selected window.
- The detail sheet and AI recommendation prompt use the same selected-window query row shown in the table.

## View Interaction Contract

- The `Queries` view MUST render under the Studio `Visualizer` navigation item and MUST NOT be available when `Adapter.queryInsights` is absent.
- The top-level description SHOULD explain that Studio monitors database activity and helps identify poorly performing queries.
- The activity chart MUST show `Queries/s` and `Avg latency` summaries, share one selected range with the query table, and expose `1m`, `5m`, `15m`, and `1h` range controls.
- The query table SHOULD include `Latency`, `Query`, `Executions`, `Rows Returned`, and `Last Seen` columns. `Rows Returned` is the user-facing label for `rowsReturned`; `reads` remains an optional internal read-work estimate and MAY be used in AI prompts only under that wording.
- When AI recommendations are available, the query table SHOULD add an `Analysis` column with queued, running, manual analyze, and completed severity states.
- The table filter SHOULD use touched tables derived from the selected-window rows, not from stale cumulative provider data.
- Sorting SHOULD operate on selected-window row values, not provider cumulative counters.
- Clicking a query row SHOULD open a detail sheet with SQL, touched tables, selected-window metrics, and optional recommendations.
- The detail sheet SHOULD support previous/next navigation through the currently visible sorted table rows.
- Pause/resume SHOULD stop and restart polling the provider without clearing already retained local samples.

## @prisma/sqlcommenter-query-insights Mapping

When SQL includes `@prisma/sqlcommenter-query-insights` metadata, embedders SHOULD remove the `prismaQuery` tag from the displayed `query` and map it into `prismaQueryInfo`.

Canonical tag shape:

```sql
/*prismaQuery='User.findMany:BASE64URL_JSON_PAYLOAD'*/
/*prismaQuery='queryRaw'*/
/*prismaQuery='executeRaw'*/
```

Mapping rules:

- URL-decode the `prismaQuery` value before parsing.
- If the decoded value has no `:`, treat it as a raw Prisma operation: `{ action: decoded, isRaw: true }`.
- If the decoded value has a `:`, split at the first colon. The left side is the operation prefix and the right side is a base64url-encoded JSON payload.
- Split the operation prefix at the first `.`. The left side is `model`; the right side is `action`. If there is no `.`, omit `model` and use the whole prefix as `action`.
- Decode the base64url payload as JSON. It MAY be an object or an array of objects for compacted batches.
- Recursively redact parameter sentinel objects before storing the payload. Any object with `{ "$type": "Param" }` MUST become a redacted placeholder such as `"<<redacted>>"`.
- If payload decoding fails, keep `model`, `action`, and `isRaw: false`, but omit `payload`.
- If the tag is malformed and no action can be determined, omit `prismaQueryInfo`.
- Remove the `prismaQuery` key from the SQL shown in `query`. Other SQL comments SHOULD also be removed unless the embedder knows they contain no sensitive data.

Examples:

```ts
// /*prismaQuery='User.findMany:eyJ3aGVyZSI6e319'*/
prismaQueryInfo = {
  action: "findMany",
  isRaw: false,
  model: "User",
  payload: { where: {} },
};

// /*prismaQuery='queryRaw'*/
prismaQueryInfo = {
  action: "queryRaw",
  isRaw: true,
};
```

## Traffic Exclusion And Sanitization

Production Query Insights MUST represent the workload the embedder wants users to inspect, not Studio's own implementation traffic.

Embedders SHOULD exclude:

- Query Insights snapshot requests themselves.
- Studio schema introspection, table-list, column-list, enum/type lookup, and relation discovery queries.
- SQL lint, `EXPLAIN`, parse/plan, prepared-statement validation, and dry-run queries.
- Studio table browsing, pagination, sorting, filtering, insert, update, delete, and refetch queries unless the product explicitly wants Studio-originated traffic in the list.
- Metadata and health queries such as `current_setting`, timezone/version checks, `pg_catalog`, `information_schema`, `pg_stat_*`, database size, privilege setup, extension setup, and connection/status probes.
- Demo seed/bootstrap queries, migration/setup queries, stream diagnostics, usage/telemetry queries, and host control-plane maintenance queries.

Recommended implementation:

- Tag Studio-originated BFF requests server-side, using request context, `customHeaders`, `customPayload`, or local executor context, and drop them before they enter the Query Insights source.
- Filter known metadata queries at the source, before aggregation, so they do not affect counters or retention.
- Keep an explicit denylist for exact normalized SQL and a small pattern denylist for metadata families that vary by database version.

Sanitization requirements:

- Never include raw parameter values, secrets, user input literals, tenant identifiers, connection strings, auth tokens, emails, API keys, or free-form payload data in `query` or `prismaQueryInfo.payload`.
- Prefer parameterized SQL with placeholders (`$1`, `?`, `:param`) or redacted literals.
- Strip or sanitize SQL comments. Comments often carry application context and may contain sensitive values.
- `prismaQueryInfo.payload` should describe query shape, not values. Preserve structural fields such as `select`, `include`, `where` keys, `orderBy`, `take`, and `skip`; redact parameter values recursively.

## Writes, Transactions, And Multi-Statement Flows

- Prefer recording each SQL statement separately when the source can observe statement-level execution.
- For a single statement, `duration` SHOULD be the statement's average wall-clock execution duration.
- For `SELECT`, `rowsReturned` SHOULD be the number of rows returned to the caller.
- For `INSERT`, `UPDATE`, and `DELETE` with `RETURNING`, `rowsReturned` SHOULD be the returned row count.
- For `INSERT`, `UPDATE`, and `DELETE` without returned rows, `rowsReturned` SHOULD be `0` unless the provider intentionally maps an affected-row count into this field. If it does, it MUST do so consistently and document that behavior for its own consumers.
- `reads` SHOULD represent the provider's best read-work estimate. It MAY be rows scanned, logical reads, physical reads, or `0` when unknown; Studio treats it as a relative operational signal.
- If a provider can only observe a transaction or batched request as one unit, it MAY emit one aggregated row. In that case `duration` SHOULD be the transaction/request wall-clock duration, `count` should increment once per observed unit, `rowsReturned` and `reads` should be sums across statements when known, and `tables` should be the union of touched tables.
- Failed statements MAY be omitted. If included, they SHOULD have `rowsReturned: 0`, best-effort `duration`, and should not include error messages with sensitive data in `query`.

## BFF Bridge Contract

`createStudioBFFClient({ queryInsights: true, ... })` exposes a `queryInsights` provider that uses the same BFF endpoint as query execution. Without that flag, `bffClient.queryInsights` MUST be undefined so embedders do not accidentally render the Queries view against a BFF that does not implement the optional procedure.

The bridge request body MUST include:

- `procedure: "query-insights"`
- `limit` when provided by Studio
- `since` when provided by Studio
- `customPayload` when configured on the BFF client

The BFF response MUST use the existing tuple envelope:

- `[null, StudioQueryInsightsSnapshot]` for success
- `[SerializedError]` for failure

This procedure is optional for BFF implementers. If an embedder's BFF does not implement `query-insights`, the embedder MUST omit `bffClient.queryInsights` from the adapter requirements so Studio hides the view.

The BFF bridge is snapshot based. Studio does not consume a Prisma Streams `streamUrl` for Query Insights. Embedders that already have SSE, pg_stat_statements, ppg.query_stats, query proxy logs, or control-plane telemetry should adapt that source into `StudioQueryInsightsSnapshot` rows before returning the BFF response.

The BFF endpoint may delegate `query-insights` to a different local sidecar or service than the one that executes Studio SQL. This is the expected shape for environments where query execution is direct TCP but query telemetry is collected by a runtime sidecar, proxy, or control-plane process. The browser-facing Studio adapter still sees one `queryInsights.getSnapshot()` provider and one tuple response.

## AI Recommendations

- Query AI recommendations MUST use the shared `llm({ task: "query-insights", prompt })` hook.
- The Queries view MUST hide AI recommendation UI when `llm` is absent.
- The Queries view MUST NOT introduce a separate AI transport, consent flow, or provider-specific code path.
- Studio MUST NOT expose a Query Insights-specific `analyze()` or `enableAiRecommendations()` contract. Hosts that require consent MUST enforce it inside their shared `llm` implementation.
- Studio MAY automatically enqueue AI analysis when a query group first appears in the selected-window query list. Automatic analysis is best-effort UI enrichment, not part of the embedder contract.
- Automatic analysis MUST run through one serial queue with at most one `llm` request in flight. Studio MUST stop automatic background analysis after five query groups per mounted Queries view so a large snapshot does not fan out into many host AI calls.
- Manual analysis requests from the row action or detail sheet MAY enqueue any query group beyond that automatic cap, but they still MUST use the same serial queue and duplicate-suppression rules.
- Prompt construction MUST use the query row Studio is rendering for the selected time window when available. It MUST NOT fetch row data or ask the provider to run SQL.
- Prompt construction MUST preserve the same terminology as the UI: `rowsReturned` is "rows returned"; `reads` is "read work" and SHOULD be omitted when it is unknown or only duplicates `rowsReturned`.
- AI output MUST be parsed and rendered as advisory text, optional query suggestions, and a severity level (`all-good`, `info`, or `warning`); Studio MUST NOT auto-run AI-suggested SQL.
- The query table MAY show an `Analysis` column when `llm` is present. That column SHOULD show queued/running state, a manual analyze action, and the completed severity icon. It MUST be hidden when `llm` is absent.

## Live Activity Chart

- The Queries view MAY derive client-local time-series samples from successive snapshot totals. This does not add any embedder contract beyond the existing snapshot fields.
- The initial snapshot SHOULD seed recent chart points from each row's `lastSeen` timestamp so the chart can show activity that was captured before the user opened the view.
- First-snapshot seed points MUST be visual context only. Studio MUST NOT treat an aggregate row's cumulative `count` as one-second throughput, and seed points MUST NOT be connected into live measured line segments.
- Throughput chart points MUST be calculated from execution-count deltas in one-second buckets at each row's reported `lastSeen` time. The selected-window throughput summary MAY still divide measured executions by measured elapsed snapshot time so the headline represents the average rate over the visible measured duration.
- Average latency MUST be calculated from the duration delta for newly observed executions, not from all historical rows in every snapshot.
- Studio MUST keep at most the largest selectable chart window in memory. The default visible window is 5 minutes, and users may switch between 1 minute, 5 minutes, 15 minutes, and 1 hour.
- The visible chart throughput summary MUST average only measured sample intervals that are present in the selected window, not the whole nominal window when the left side has no measured samples.
- The visible chart latency summary MUST use measured executions when available and MAY fall back to visible context latency samples before any measured execution exists.
- The query list MUST use the same selected chart window as the chart. Its `count`, `rowsReturned`, `reads`, average `duration`, and `lastSeen` values MUST be derived from per-query samples inside that visible window instead of displaying the provider's cumulative row counters.
- First-snapshot query rows MAY be shown as context when their `lastSeen` timestamp is inside the selected window, but they MUST be rendered as one sampled execution with average per-execution counters. They MUST NOT display cumulative provider totals as if all historical executions happened inside the selected window.
- First-snapshot context samples MUST NOT create throughput values. If no measured interval exists, the chart MUST show no live throughput value rather than `0/s`.
- The chart MUST break line segments across long gaps that do not have measured samples rather than interpolating across missing time. Short gaps of 30 seconds or less SHOULD remain connected so normal bursts do not fragment.
- Single-sample chart segments MUST render as point markers so isolated measurements remain visible.
- Hover affordances SHOULD reveal exact point values for throughput and latency without changing the selected query row state.

## Demo Contract

The `ppg-dev` demo MAY capture successful BFF query executions into an in-memory query-insights store so the feature can be exercised locally.

The demo recorder is not a production architecture. Production embedders should inject query events from the runtime that observes their application traffic, query proxy, driver instrumentation, or control-plane telemetry.

The demo recorder MUST skip metadata, lint, and introspection queries so the Queries view focuses on user-visible database activity.

## Testing Requirements

Changes to query insights MUST include tests covering:

- BFF request and error tuple behavior
- navigation visibility and stale `view=queries` fallback
- rendering provider snapshots in the Queries view
- hiding AI recommendations when no `llm` hook is configured
- chart and table metrics scoped to the selected time range
- first-snapshot context rows that do not create fake throughput
- cumulative counter deltas, counter resets, and stale/equal snapshots
- long chart gaps, short connected gaps, and isolated sample markers
- serial automatic AI analysis with the five-query cap and manual analysis beyond that cap
- AI prompt terminology that calls `rowsReturned` "rows returned" instead of "reads"
- demo aggregation behavior for successful query executions
