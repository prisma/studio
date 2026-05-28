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
- Embedders that support query insights MUST provide `getSnapshot(request, options)` and return a `StudioQueryInsightsSnapshot`.
- Snapshot rows SHOULD be aggregated by a stable normalized query identity, not emitted as one row per execution.
- Snapshot rows MUST avoid raw parameter values and other sensitive payload data. The `query` field should contain parameterized SQL or another sanitized query representation.
- `tables` SHOULD contain qualified table names when the embedder can derive them.
- `reads`, `rowsReturned`, `duration`, `count`, and `lastSeen` SHOULD be best-effort operational signals. Studio treats them as display and sorting data, not accounting-grade telemetry.
- `pollingIntervalMs` MAY be returned by the provider. A value less than or equal to `0` tells Studio not to poll automatically.

## BFF Bridge Contract

`createStudioBFFClient` exposes a `queryInsights` provider that uses the same BFF endpoint as query execution.

The bridge request body MUST include:

- `procedure: "query-insights"`
- `limit` when provided by Studio
- `since` when provided by Studio
- `customPayload` when configured on the BFF client

The BFF response MUST use the existing tuple envelope:

- `[null, StudioQueryInsightsSnapshot]` for success
- `[SerializedError]` for failure

This procedure is optional for BFF implementers. If an embedder's BFF does not implement `query-insights`, the embedder MUST omit `bffClient.queryInsights` from the adapter requirements so Studio hides the view.

## AI Recommendations

- Query AI recommendations MUST use the shared `llm({ task: "query-insights", prompt })` hook.
- The Queries view MUST hide AI recommendation UI when `llm` is absent.
- The Queries view MUST NOT introduce a separate AI transport, consent flow, or provider-specific code path.
- Prompt construction MUST use the selected query snapshot row only. It MUST NOT fetch row data or ask the provider to run SQL.
- AI output MUST be parsed and rendered as advisory text and optional query suggestions; Studio MUST NOT auto-run AI-suggested SQL.

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
- demo aggregation behavior for successful query executions
