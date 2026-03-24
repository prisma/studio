# Streams Architecture

This document is normative for Prisma Streams integration in Studio.

Studio MAY be configured with a Prisma Streams base URL in addition to the database adapter. When configured, Studio exposes both sidebar stream navigation and a dedicated stream-event view in the main pane.

## Scope

This architecture governs:

- the optional `streamsUrl` Studio setup contract
- fetching stream metadata from a Prisma Streams server
- refreshing active-stream metadata while a stream view is open
- rendering the sidebar `Streams` section underneath `Tables`
- routing the main view into a selected stream
- loading stream events through the Prisma Streams read endpoint
- deriving event-row summary metadata for the list UI
- demo wiring for the `ppg-dev` app, including same-origin proxying

## Canonical Components

- [`ui/studio/Studio.tsx`](../ui/studio/Studio.tsx)
- [`ui/studio/context.tsx`](../ui/studio/context.tsx)
- [`ui/hooks/use-streams.ts`](../ui/hooks/use-streams.ts)
- [`ui/hooks/use-stream-events.ts`](../ui/hooks/use-stream-events.ts)
- [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx)
- [`ui/studio/views/stream/StreamView.tsx`](../ui/studio/views/stream/StreamView.tsx)
- [`demo/ppg-dev/config.ts`](../demo/ppg-dev/config.ts)
- [`demo/ppg-dev/server.ts`](../demo/ppg-dev/server.ts)

## Non-Negotiable Rules

- Streams configuration MUST remain optional at the Studio boundary.
- Streams support MUST be passed as a plain `streamsUrl` string on `Studio`; do not hide it behind the database adapter contract.
- When `streamsUrl` is absent, Studio MUST behave exactly as before and MUST NOT render a `Streams` section.
- Stream discovery MUST go through [`useStreams`](../ui/hooks/use-streams.ts); feature code MUST NOT fetch `/v1/streams` ad hoc.
- Active-stream count refresh MUST reuse [`useStreams`](../ui/hooks/use-streams.ts); feature code MUST NOT introduce a second count or metadata polling path.
- Stream event loading MUST go through [`useStreamEvents`](../ui/hooks/use-stream-events.ts); feature code MUST NOT fetch `/v1/stream/:name` ad hoc from view components.
- `useStreams` MUST treat `streamsUrl` as a base URL and append the Prisma Streams list endpoint path (`/v1/streams`) itself.
- `useStreamEvents` MUST treat `streamsUrl` as a base URL and append the Prisma Streams read endpoint path (`/v1/stream/{name}`) itself.
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

The response is treated as a list of stream records containing at least:

- `name`
- `created_at`
- `expires_at`
- `epoch`
- `next_offset`
- `sealed_through`
- `uploaded_through`

`useStreams` normalizes that payload into the `StudioStream` shape used by the sidebar.
The stream's current event count comes from `next_offset` on this metadata response. When a stream view is open, Studio MAY refetch this metadata endpoint on a short interval to keep the count fresh without re-reading event bodies.

`useStreamEvents` computes the encoded `offset` for the currently requested tail window, fetches decoded JSON events from the stream read endpoint, and normalizes them into `StudioStreamEvent` rows for the main event list.

## Demo Contract

`demo/ppg-dev/server.ts` owns the bridge from Prisma Dev to Studio:

- Prisma Dev remains the source of truth for the actual Streams server URL.
- `/api/config` exposes Studio's browser-facing Streams base URL.
- `/api/streams` proxies read requests to the upstream Streams server.

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
- `useStreamEvents` tail-window fetch behavior and normalization
- sidebar rendering of the `Streams` section and stream links
- stream-view routing plus one-row-at-a-time expansion behavior
- `ppg-dev` config wiring for the browser-facing Streams URL

When the compute bundle path changes, tests MUST also verify that the packaged demo can boot and serve `/api/config` with Streams enabled.
