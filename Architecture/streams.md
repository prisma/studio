# Streams Architecture

This document is normative for Prisma Streams integration in Studio.

Studio MAY be configured with a Prisma Streams base URL in addition to the database adapter. When configured, Studio exposes both sidebar stream navigation and a dedicated stream-event view in the main pane.
Studio MAY also run in a streams-only shell mode with no database connection at all; in that case, the stream UI stays available while database-driven navigation and views are suppressed.

## Scope

This architecture governs:

- the optional `streamsUrl` Studio setup contract
- fetching stream metadata from a Prisma Streams server
- refreshing active-stream metadata while a stream view is open
- discovering active-stream search capability metadata
- discovering active-stream routing-key metadata
- tracking URL-backed active-stream routing-key selection
- discovering active-stream aggregation rollups from stream details metadata
- loading active-stream aggregate rollup windows through the Prisma Streams aggregate endpoint
- loading active-stream filtered events through the Prisma Streams search endpoint
- loading active-stream routing-key pages through the Prisma Streams routing-key listing endpoint
- rendering the sidebar `Streams` section underneath `Tables`
- routing the main view into a selected stream
- loading stream events through the Prisma Streams read endpoint
- deriving event-row summary metadata for the list UI
- demo wiring for the `ppg-dev` app, including same-origin proxying

## Canonical Components

- [`ui/studio/Studio.tsx`](../ui/studio/Studio.tsx)
- [`ui/studio/context.tsx`](../ui/studio/context.tsx)
- [`ui/hooks/use-streams.ts`](../ui/hooks/use-streams.ts)
- [`ui/hooks/use-stream-details.ts`](../ui/hooks/use-stream-details.ts)
- [`ui/hooks/use-stream-routing-keys.ts`](../ui/hooks/use-stream-routing-keys.ts)
- [`ui/hooks/use-stream-aggregations.ts`](../ui/hooks/use-stream-aggregations.ts)
- [`ui/hooks/use-stream-events.ts`](../ui/hooks/use-stream-events.ts)
- [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx)
- [`ui/studio/views/stream/StreamView.tsx`](../ui/studio/views/stream/StreamView.tsx)
- [`ui/studio/views/stream/StreamRoutingKeySelector.tsx`](../ui/studio/views/stream/StreamRoutingKeySelector.tsx)
- [`ui/studio/views/stream/StreamAggregationsPanel.tsx`](../ui/studio/views/stream/StreamAggregationsPanel.tsx)
- [`demo/ppg-dev/config.ts`](../demo/ppg-dev/config.ts)
- [`demo/ppg-dev/server.ts`](../demo/ppg-dev/server.ts)

## Non-Negotiable Rules

- Streams configuration MUST remain optional at the Studio boundary.
- Streams support MUST be passed as a plain `streamsUrl` string on `Studio`; do not hide it behind the database adapter contract.
- When `streamsUrl` is absent, Studio MUST behave exactly as before and MUST NOT render a `Streams` section.
- When Studio is launched without a database connection, it MUST still allow stream browsing when `streamsUrl` is present, and MUST hide schema selection, table navigation, and database-only views instead of surfacing adapter errors.
- Stream discovery MUST go through [`useStreams`](../ui/hooks/use-streams.ts); feature code MUST NOT fetch `/v1/streams` ad hoc.
- Active-stream total-size loading MUST go through [`useStreamDetails`](../ui/hooks/use-stream-details.ts); feature code MUST NOT fetch stream `_details` ad hoc from view components.
- Active-stream search-capability discovery MUST go through [`useStreamDetails`](../ui/hooks/use-stream-details.ts); feature code MUST NOT read `_details.schema.search` ad hoc from view components.
- Active-stream routing-key discovery MUST go through [`useStreamDetails`](../ui/hooks/use-stream-details.ts); feature code MUST NOT read `_details.schema.routingKey` ad hoc from view components.
- Active-stream aggregation-rollup discovery MUST go through [`useStreamDetails`](../ui/hooks/use-stream-details.ts); feature code MUST NOT read `_details.schema.search.rollups` ad hoc from view components.
- Active-stream storage, upload, and index-status diagnostics MUST go through [`useStreamDetails`](../ui/hooks/use-stream-details.ts); feature code MUST NOT add a separate `_index_status` fetch path from the stream footer or other active-stream chrome.
- Active-stream aggregate window loading MUST go through [`useStreamAggregations`](../ui/hooks/use-stream-aggregations.ts); feature code MUST NOT `POST` stream `_aggregate` ad hoc from view components.
- Active-stream count refresh MUST reuse [`useStreamDetails`](../ui/hooks/use-stream-details.ts); feature code MUST NOT introduce a second count or metadata polling path for the active stream page.
- Stream event loading MUST go through [`useStreamEvents`](../ui/hooks/use-stream-events.ts); feature code MUST NOT fetch `/v1/stream/:name` ad hoc from view components.
- Stream search loading MUST also go through [`useStreamEvents`](../ui/hooks/use-stream-events.ts); feature code MUST NOT `POST` stream `_search` ad hoc from view components.
- Stream routing-key listing MUST go through [`useStreamRoutingKeys`](../ui/hooks/use-stream-routing-keys.ts); feature code MUST NOT fetch stream `_routing_keys` ad hoc from view components.
- `useStreams` MUST treat `streamsUrl` as a base URL and append the Prisma Streams list endpoint path (`/v1/streams`) itself.
- `useStreamEvents` MUST treat `streamsUrl` as a base URL and append the Prisma Streams read endpoint path (`/v1/stream/{name}`) itself.
- In search mode, `useStreamEvents` MUST append the Prisma Streams search endpoint path (`/v1/stream/{name}/_search`) itself.
- Active stream navigation MUST stay URL-driven through `view=stream` plus a `stream` URL key; do not introduce a parallel local router for Streams.
- Stream events MUST be cached in TanStack DB query collections and read via live query, following the stream-event view architecture in [`Architecture/stream-event-view.md`](stream-event-view.md).
- Sidebar Streams items MUST reuse the existing navigation shell and visual language from [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx); do not introduce a second sidebar component system for Streams.
- Stream-event rows MAY derive display-only summary fields such as relative time, preview text, and indexed-field labels from the decoded event payload, but the decoded event body itself MUST remain the source of truth for inline expansion.
- The `ppg-dev` demo MUST proxy the Prisma Dev Streams server through the Studio origin instead of sending the browser directly to the raw local Streams port.

## API Contract

Studio expects the configured base URL to expose the Prisma Streams list endpoint:

- `GET {streamsUrl}/v1/streams?limit=1000&offset=0`

Studio also expects the configured base URL to expose the Prisma Streams read endpoint for JSON-backed streams:

- `GET {streamsUrl}/v1/stream/{streamName}?format=json&offset={encodedOffset}`
- `GET {streamsUrl}/v1/stream/{streamName}?format=json&offset=-1`
- `GET {streamsUrl}/v1/stream/{streamName}?format=json&offset={encodedOffset}&key={routingKey}`

For active-stream total byte metadata, Studio also expects the stream details endpoint:

- `GET {streamsUrl}/v1/stream/{streamName}/_details`

For active-stream aggregation cards, Studio also expects the stream aggregate endpoint:

- `POST {streamsUrl}/v1/stream/{streamName}/_aggregate`

For searchable streams, Studio also expects the stream search endpoint:

- `POST {streamsUrl}/v1/stream/{streamName}/_search`

For routing-key-capable streams, Studio may also use the routing-key listing endpoint:

- `GET {streamsUrl}/v1/stream/{streamName}/_routing_keys?limit={n}&after={cursor}`

The response is treated as a list of stream records containing at least:

- `name`
- `created_at`
- `expires_at`
- `epoch`
- `next_offset`
- `sealed_through`
- `uploaded_through`

`useStreams` normalizes that payload into the `StudioStream` shape used by the sidebar.
On the active stream page, Studio instead uses `_details.stream` as the authoritative summary payload for `epoch`, `next_offset`, and the footer byte total, and keeps that summary current through `_details` conditional long polling. That long-poll path must keep one stable loop alive across ETag updates instead of restarting the request on every successful `200`, so the browser does not accumulate a stream of client-side canceled `_details` fetches between real wakes.
If `_details.schema.search` is present, `useStreamDetails` also normalizes the advertised field bindings, aliases, default fields, and primary timestamp metadata so the stream view can render the shared search control and build correct `_search` requests without re-parsing raw schema JSON.
If `_details.schema.routingKey` is present, `useStreamDetails` also normalizes that routing-key pointer metadata so the stream view can render a routing-key selector, preserve its selected-key state, and optionally compose that key into an exact search clause when the schema advertises a matching exact keyword field.
If `_details.schema.search.rollups` is present, `useStreamDetails` also normalizes that rollup metadata into Studio's aggregation-rollup model, including advertised dimensions, so the view can render aggregation controls without re-parsing raw schema JSON.
If `_details.stream` includes WAL or pending-tail metadata, `_details.storage` exposes byte/object buckets, `_details.object_store_requests` exposes node-local request accounting, and `_details.index_status` is present, `useStreamDetails` also normalizes those diagnostics into the active-stream details model so the footer diagnostics popover can describe upload coverage, object-storage composition, retained-local-storage buckets, node-local object-store request counts, and per-index/search-family progress, including the routing-key lexicon family, without inventing a second metadata request. When a stream is actively selected, `useStreamDetails` may also read `GET {streamsUrl}/v1/server/_details` to normalize server-wide configured cache limits for those diagnostics; that server-scoped descriptor must stay inside the same hook instead of introducing a second view-local fetch path.

`useStreamEvents` computes the encoded `offset` for the currently requested tail window, fetches decoded JSON events from the stream read endpoint, and normalizes them into `StudioStreamEvent` rows for the main event list.
When the active stream search term is non-empty and the stream advertises search capability, `useStreamEvents` switches to the search endpoint, requests newest-first append-order sort with `sort: ["offset:desc"]`, paginates through `next_search_after`, and keeps hidden-new-match detection aligned with the active filter for `live` and `tail`. Studio must not send `track_total_hits` on that path; it uses the normal `total` object returned by Streams for filtered hidden-new-event counts and jump-to-beginning behavior. Partial or syntactically invalid stream-search input must stay local in the reusable search control and must not be committed into URL state or executed against `_search`. When that search term is empty, the hook must fall back to the normal read endpoint and stop any stale `_search` activity for the previous filter scope.
`useStreamRoutingKeys` resolves the `_routing_keys` endpoint from the configured Streams base URL and pages through the lexicographically sorted keyspace with the returned `next_after` cursor. Because Streams may return `coverage.complete=false` while the routing-key lexicon is still catching up, Studio must treat that surface as a best-effort browse path instead of implying that the sorted keyspace is complete just because `next_after` is present. When a stream declares a routing key, the selector keeps its own selected-key state, shows that selected key inline in the closed trigger, exposes a hover-only clear affordance in that same pill, and Studio must apply that filter on the normal read path through the read endpoint's `key=` parameter. For streams that are not using `_search`, selecting a routing key must restart that keyed read path from `offset=-1` instead of preserving the current near-head stream cursor, and additional keyed history must advance from each response's `Stream-Next-Offset` header until Studio has filled the requested page budget or reached the current end of stream. Because that standalone keyed browse path still does not expose routing-key-aware hidden-new-event counts, `useStreamDetails` must suppress `_details` live/tail long polling as soon as the resolved stream descriptor proves the selected key is staying on the plain read path rather than `_search`. If `useStreamDetails` also proves there is an exact keyword search field bound to that routing-key pointer, the selected key may be composed into the effective `_search` query so routing-key filtering and search share one filtered result set without rewriting the visible search-box text. Operator-facing lexicon lag and local `.lex` cache residency belong in the stream diagnostics popover, not in the routing-key selector itself. When that standalone keyed read path yields no rows in the newest loaded window, Studio must not keep auto-expanding the keyed window in the background; older keyed history only loads from explicit user navigation.
`useStreamAggregations` resolves the selected relative or absolute time window, picks the tightest advertised rollup interval that stays within Studio's bucket budget, groups by the rollup's primary dimension when available, includes `unit` in that group key when the rollup advertises it, and normalizes the returned buckets into sparkline-ready aggregation series with per-statistic values plus explicit raw-unit metadata for display scaling.
Studio uses those resolved series both to render the aggregation strip and to upgrade the header aggregation toggle from raw rollup-count metadata to the real visible aggregation count once the aggregate query has loaded.
The hook only polls those aggregate windows when the stream view is in `live` or `tail` follow mode and the selected range is relative.
Per-series aggregation preferences such as enabled statistics and unit overrides remain in the TanStack DB-backed local UI state collection as user-authored state; aggregate fetches may read them but MUST NOT rewrite them just because a different range resolves a different set of series or statistics.

## Demo Contract

`demo/ppg-dev/server.ts` owns the bridge from Prisma Dev to Studio:

- Prisma Dev remains the source of truth for the actual Streams server URL.
- `/api/config` exposes Studio's browser-facing Streams base URL.
- `/api/streams` proxies read and aggregate requests to the upstream Streams server.
- In streams-only demo mode, `/api/config` also marks the database as disabled so the browser shell can drop database navigation while keeping Streams enabled.

This keeps the browser on the same origin as the Studio app and avoids binding Studio UI behavior to upstream CORS details.

## Forbidden Patterns

- Adding Streams methods to the database adapter just to move stream listing through introspection.
- Hard-coding a raw `127.0.0.1:<port>` Streams URL into browser code.
- Duplicating stream list or stream-event fetch logic inside sidebar/view components or tests.
- Introducing component-local routing for the active stream instead of using URL state.
- Fetching and storing stream-event rows directly in component `useState`.

## Testing Requirements

Streams changes MUST include tests for:

- `Studio`/context propagation of `streamsUrl`
- `useStreams` fetch behavior and response normalization
- `useStreamDetails` fetch behavior and total-byte normalization
- `useStreamDetails` normalization of advertised search metadata
- `useStreamDetails` normalization of advertised routing-key metadata
- `useStreamRoutingKeys` paging behavior for prefix-filtered routing-key discovery
- `useStreamDetails` normalization of advertised aggregation rollups
- `useStreamDetails` normalization of stream-storage and index-status diagnostics
- `useStreamAggregations` aggregate-request behavior and bucket normalization
- `useStreamEvents` tail-window fetch behavior and normalization
- `useStreamEvents` search request behavior, including `next_search_after`
- sidebar rendering of the `Streams` section and stream links
- stream-view routing plus one-row-at-a-time expansion behavior
- stream-view searchable-header behavior and expanded-row match highlighting
- stream-view routing-key-selector visibility, selected-key state, and search-clause composition when available
- stream-view compact header/footer summary rendering plus follow-mode behavior
- stream-view aggregation-button rendering and aggregation-panel range behavior
- `ppg-dev` config wiring for the browser-facing Streams URL
- `ppg-dev` proxy handling for aggregate `POST` requests

When the compute bundle path changes, tests MUST also verify that the packaged demo can boot and serve `/api/config` with Streams enabled.
