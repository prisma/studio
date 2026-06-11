# Request Observability Architecture

This document is normative for Studio's request observability surface over Prisma Streams `evlog` and `otel-traces` streams.

The feature is a stream-detail drilldown, not a standalone Studio view. It lets users expand an observability event or span row, open a request detail sheet, and inspect the correlated event, trace timeline, trace waterfall, errors, service calls, and partial-result warnings returned by Prisma Streams.

## Scope

This architecture governs:

- detection of observability-capable stream profiles
- URL-backed request lookup state
- loading request correlation data from Prisma Streams
- rendering the request detail sheet from a single correlation response
- demo seeding for local request-observability validation

## Canonical Components

- [`ui/hooks/use-stream-observe-request.ts`](../ui/hooks/use-stream-observe-request.ts)
- [`ui/studio/views/stream/StreamObserveSheet.tsx`](../ui/studio/views/stream/StreamObserveSheet.tsx)
- [`ui/studio/views/stream/StreamView.tsx`](../ui/studio/views/stream/StreamView.tsx)
- [`demo/ppg-dev/seed-streams.ts`](../demo/ppg-dev/seed-streams.ts)

## Non-Negotiable Rules

- Request observability MUST only appear for streams whose resolved profile is `evlog` or `otel-traces`.
- Stream profile detection MUST come from Streams metadata normalized by `useStreams` and `useStreamDetails`; feature code MUST NOT infer observability support from stream names.
- The active lookup MUST be URL-backed through `streamObserve` and `useNavigation`; components MUST NOT write or parse `window.location.hash` directly.
- `streamObserve` values MUST serialize as `req:<requestId>`, `trace:<traceId>`, or `span:<spanId>`.
- Expanded event rows MAY expose the request-detail action only when the decoded event body has a usable request ID, trace ID, or span ID for the active profile.
- Correlation loading MUST go through `useStreamObserveRequest`; view components MUST NOT call `/v1/observe/request` directly.
- The request sheet MUST treat the Streams response as authoritative and surface `coverage.warnings` when present.
- Missing counterpart streams MUST be explained in the sheet instead of rendering an empty trace or event section as complete.
- The UI MUST use ShadCN primitives for the sheet, badges, buttons, skeletons, and section selector. The waterfall and timeline are custom request-observability composites and are documented in [`non-standard-ui.md`](non-standard-ui.md).

## API Contract

Studio expects the configured Streams base URL to expose:

- `POST {streamsUrl}/v1/observe/request`

The hook sends:

```json
{
  "streams": {
    "events": "app-events",
    "traces": "app-traces"
  },
  "lookup": {
    "requestId": "req_123"
  },
  "include": {
    "events": true,
    "trace": true,
    "timeline": true
  },
  "limits": {
    "events": 50,
    "spans": 2000
  }
}
```

`lookup` contains exactly one of `requestId`, `traceId`, or `spanId`. If one counterpart stream is unavailable, Studio omits that stream and sets the matching include flag to `false`.

The response is normalized into:

- `lookup`: resolved request, trace, and span IDs
- `summary`: title, method/path, service, environment, duration, status, level, and error summary fields
- `evlog`: the primary event plus match count
- `trace`: deduplicated spans, tree, critical path, errors, service map, and partial-state metadata
- `timeline`: merged event/span timeline items
- `coverage`: searched sides and warnings

The sheet renders three sections from that one response:

- `Timeline`: merged event, span-start, span-event, and exception items
- `Trace`: waterfall rows, span details, errors, and service calls
- `Event`: primary evlog event, root-cause fields, and raw JSON

## Pairing Model

When the active stream is `evlog`, Studio uses that stream as the event stream and discovers the first available `otel-traces` stream as the trace counterpart.
When the active stream is `otel-traces`, Studio uses that stream as the trace stream and discovers the first available `evlog` stream as the event counterpart.

This is intentionally simple until Streams exposes an explicit pairing descriptor. UI copy must stay clear when only one side is available.

## Demo Contract

`pnpm demo:ppg` seeds two local profiled streams:

- `app-events` with the `evlog` profile
- `app-traces` with the `otel-traces` profile

The seed data MUST include successful requests, failed requests with root-cause fields, slow requests, event-only requests, and trace-only requests. The demo also starts a ticker that appends fresh correlated requests so `Tail` mode and request-detail refresh can be exercised locally.

The demo MUST create both streams with `Content-Type: application/json` before profile installation.

## Forbidden Patterns

- matching observability streams by hard-coded stream names in the UI
- storing request-detail data in component-local state outside React Query
- adding request-observability methods to the database adapter
- hiding coverage warnings or partial trace state
- inventing request IDs from arbitrary payload text
- adding a standalone request-observability route before the stream row workflow needs one

## Testing Requirements

Request observability changes MUST include tests for:

- lookup param serialization and parsing
- event-row lookup extraction for both `evlog` and `otel-traces`
- counterpart stream resolution
- `useStreamObserveRequest` request body, disabled state, failure state, and response normalization
- sheet loading, warning, timeline, trace, event, missing-stream, and close behavior
- stream-row affordance visibility and URL-backed sheet opening
- demo seed shape and profiled stream creation
