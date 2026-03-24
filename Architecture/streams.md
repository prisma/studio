# Streams Architecture

This document is normative for Prisma Streams integration in Studio.

Studio MAY be configured with a Prisma Streams base URL in addition to the database adapter. Streams support is navigation-only for now: Studio lists available streams in the left sidebar but does not route the main view through a separate Streams-specific state model.

## Scope

This architecture governs:

- the optional `streamsUrl` Studio setup contract
- fetching stream metadata from a Prisma Streams server
- rendering the sidebar `Streams` section underneath `Tables`
- demo wiring for the `ppg-dev` app, including same-origin proxying

## Canonical Components

- [`ui/studio/Studio.tsx`](../ui/studio/Studio.tsx)
- [`ui/studio/context.tsx`](../ui/studio/context.tsx)
- [`ui/hooks/use-streams.ts`](../ui/hooks/use-streams.ts)
- [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx)
- [`demo/ppg-dev/config.ts`](../demo/ppg-dev/config.ts)
- [`demo/ppg-dev/server.ts`](../demo/ppg-dev/server.ts)

## Non-Negotiable Rules

- Streams configuration MUST remain optional at the Studio boundary.
- Streams support MUST be passed as a plain `streamsUrl` string on `Studio`; do not hide it behind the database adapter contract.
- When `streamsUrl` is absent, Studio MUST behave exactly as before and MUST NOT render a `Streams` section.
- Stream discovery MUST go through [`useStreams`](../ui/hooks/use-streams.ts); feature code MUST NOT fetch `/v1/streams` ad hoc.
- `useStreams` MUST treat `streamsUrl` as a base URL and append the Prisma Streams list endpoint path (`/v1/streams`) itself.
- Sidebar Streams items MUST reuse the existing navigation shell and visual language from [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx); do not introduce a second sidebar component system for Streams.
- The `ppg-dev` demo MUST proxy the Prisma Dev Streams server through the Studio origin instead of sending the browser directly to the raw local Streams port.

## API Contract

Studio expects the configured base URL to expose the Prisma Streams list endpoint:

- `GET {streamsUrl}/v1/streams?limit=1000&offset=0`

The response is treated as a list of stream records containing at least:

- `name`
- `created_at`
- `expires_at`
- `epoch`
- `next_offset`
- `sealed_through`
- `uploaded_through`

`useStreams` normalizes that payload into the `StudioStream` shape used by the sidebar.

## Demo Contract

`demo/ppg-dev/server.ts` owns the bridge from Prisma Dev to Studio:

- Prisma Dev remains the source of truth for the actual Streams server URL.
- `/api/config` exposes Studio's browser-facing Streams base URL.
- `/api/streams` proxies read requests to the upstream Streams server.

This keeps the browser on the same origin as the Studio app and avoids binding Studio UI behavior to upstream CORS details.

## Forbidden Patterns

- Adding Streams methods to the database adapter just to move stream listing through introspection.
- Hard-coding a raw `127.0.0.1:<port>` Streams URL into browser code.
- Duplicating stream list fetch logic inside sidebar components or tests.
- Introducing new URL-state keys for the read-only sidebar Streams list.

## Testing Requirements

Streams changes MUST include tests for:

- `Studio`/context propagation of `streamsUrl`
- `useStreams` fetch behavior and response normalization
- sidebar rendering of the `Streams` section
- `ppg-dev` config wiring for the browser-facing Streams URL

When the compute bundle path changes, tests MUST also verify that the packaged demo can boot and serve `/api/config` with Streams enabled.
