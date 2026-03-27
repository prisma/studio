# Stream Event View Architecture

This document is normative for the Streams event view in Studio.

The stream-event view MUST use TanStack DB as its source of truth for loaded event rows, while keeping URL-driven stream selection and local-only infinite-scroll controls separate from table/grid state.

## Scope

This architecture governs:

- active stream selection in the main view
- refreshing the active stream's latest event count
- loading active-stream total byte metadata for the header badge
- discovering active-stream aggregation rollups
- loading active-stream aggregate windows
- rendering the optional aggregation strip above the event header row
- loading a tail window of decoded stream events
- TanStack DB caching for stream-event rows
- infinite-scroll page growth for older events
- batched reveal of newly arrived events
- transient highlighting of newly revealed event rows
- one-row-at-a-time expansion behavior
- event-row summary derivation for time, key, indexed fields, preview, and size

## Canonical Components

- [`ui/hooks/use-stream-events.ts`](../ui/hooks/use-stream-events.ts)
- [`ui/hooks/use-stream-details.ts`](../ui/hooks/use-stream-details.ts)
- [`ui/hooks/use-stream-aggregations.ts`](../ui/hooks/use-stream-aggregations.ts)
- [`ui/hooks/use-ui-state.ts`](../ui/hooks/use-ui-state.ts)
- [`ui/hooks/use-navigation.tsx`](../ui/hooks/use-navigation.tsx)
- [`ui/studio/views/stream/StreamView.tsx`](../ui/studio/views/stream/StreamView.tsx)
- [`ui/studio/views/stream/StreamAggregationsPanel.tsx`](../ui/studio/views/stream/StreamAggregationsPanel.tsx)
- [`ui/studio/context.tsx`](../ui/studio/context.tsx)

## Data Loading Contract

### 1. Query input identity

Stream-event reads MUST be parameterized by:

- `streamsUrl`
- `stream.name`
- `stream.epoch`
- `visibleEventCount`
- `pageSize`
- `pageCount`

These inputs form the query scope. Any new query dimension MUST be added to the scope key.
The latest upstream `stream.nextOffset` metadata MUST NOT be part of the event-query identity, or count refreshes would invalidate the visible list before the user chooses to reveal new rows.

### 2. Tail-window pagination

Infinite scroll in the stream view is implemented as a growing tail window, not page-by-page replacement.

Given:

- `visibleEventCount`
- `pageSize`
- `pageCount`

`useStreamEvents` MUST compute the oldest exclusive offset required to fetch the most recent `pageSize * pageCount` events ending at `visibleEventCount`, then request the Prisma Streams read endpoint once for that window.
If the upstream stream has grown beyond `visibleEventCount`, the hook MUST clip away the overflow newer events so the visible list stays stable until the user reveals them.

The view MUST reset `pageCount` back to `1` and reset `visibleEventCount` back to the stream's current count when the active stream changes.

### 3. Collection creation and reuse

Stream-event rows MUST be cached as TanStack DB query collections created through Studio context:

- created via `queryCollectionOptions(...)`
- reused through `getOrCreateRowsCollection(queryScopeKey, factory)`

Do not create unmanaged per-render collections. Do not bypass Studio's collection instrumentation boundary.

### 4. Live reads

Consumers MUST read stream-event rows directly from the collection through `useLiveQuery`.

Views MUST NOT mirror the loaded event list into parallel local arrays.

When infinite scroll increases `pageCount`, `useStreamEvents` MAY keep the last resolved event window visible while the larger tail window is still fetching.
This is required to prevent the scroll container from unmounting and resetting the user's scroll position during load-more transitions.

### 5. Latest count refresh and newer-event reveal

While a stream is open, Studio MAY refresh the stream metadata count on a short interval through `useStreams`.
Studio MAY also refresh logical payload-byte totals for the active stream through `useStreamDetails`.
If the active stream advertises aggregation rollups, Studio MAY also load aggregate rollup windows through `useStreamAggregations`.

The stream view MUST treat that latest metadata count separately from `visibleEventCount`:

- the header count reflects the latest polled metadata count
- the header MAY append logical payload-byte totals from `useStreamDetails`, labeled clearly so it is distinct from the event count
- when `useStreamDetails` exposes one or more aggregation measures, the header MUST render a sibling `x aggregations` toggle button
- the list remains bounded by `visibleEventCount` until the user reveals newer events
- the aggregation strip, when open, MUST sit above the sticky stream-column header row inside the same scroll container
- aggregation queries MUST be driven by a persisted range selection with quick buttons for `5 minutes`, `1 hour`, and `12 hours`, plus a custom-range popover for longer presets or an absolute time window
- aggregation cards MUST render one summary value per advertised measure, using a single horizontal band that scrolls sideways when the card count exceeds the available width
- each aggregation card MUST show a sparkline-like bucket history behind the headline value instead of introducing a separate chart pane
- the centered `new events` button sits directly below the sticky summary header row
- the `new events` button row MUST NOT add a divider between itself and the event rows below it
- the `new events` button reveals at most 50 newer rows per click
- rows revealed by that button MUST receive a short-lived, motion-safe highlight animation so the prepended batch is visually obvious without shifting the viewport
- hidden newer rows MUST NOT auto-reveal from top-of-list scrolling while that button is present
- when the button appears or newer rows are prepended above the current viewport, the view MUST preserve the user's visible event position instead of snapping the existing list content

When a newer-event batch is revealed, the view MUST also grow `pageCount` so previously visible rows stay in the list instead of being replaced by the newer batch.

### 6. Has-more detection

The view MUST derive whether older events remain from `visibleEventCount` versus the number of rows currently loaded in the collection.

Do not introduce a second pagination source of truth for this.

## Event Row Normalization Contract

Each normalized event row MUST include:

- a stable row id
- the decoded event body
- an optional exact timestamp
- an optional key
- zero or more indexed-field display entries
- a one-line preview string
- a byte-size estimate suitable for UI display
- a deterministic order index for newest-first rendering

The decoded event body is the source of truth. Summary fields are display helpers only.

Summary derivation rules:

- time MAY be derived from common timestamp fields in the decoded payload
- key MAY be derived from explicit key/routing-key fields in the decoded payload
- indexed fields MAY be derived only from explicit indexed-field payload shapes; do not invent synthetic indexed metadata
- preview SHOULD prefer the payload's primary content object when one exists (for example a top-level `value` field), otherwise fall back to the full decoded event
- expanded content SHOULD pretty-print structured JSON payloads

## UI State Contract

The active expanded event row MUST be stored through `useUiState` with a stream-scoped key such as:

- `stream:${streamName}:expanded-event`

The aggregation panel state MUST also be stored through `useUiState` with stream-scoped keys such as:

- `stream:${streamName}:aggregations-open`
- `stream:${streamName}:aggregation-range`

Only one event row may be expanded at a time.

The infinite-scroll `pageCount` and `visibleEventCount` are view-local transient state and MUST NOT be written to URL params or shared collections.

## Forbidden Patterns

- fetching stream events directly inside `StreamView` without going through `useStreamEvents`
- storing the loaded event list in component-local `useState`
- introducing stream-event URL pagination params
- allowing more than one expanded row at a time
- fetching aggregation rollups or aggregate windows directly inside `StreamView` without going through the dedicated hooks
- deriving fake indexed fields from arbitrary payload properties

## Testing Requirements

Changes to this architecture MUST include tests for:

- encoded-offset/tail-window fetch behavior in `useStreamEvents`
- clipping hidden newer events until `visibleEventCount` advances
- newest-first normalization of decoded events
- stream-view expansion exclusivity
- stream-view header rendering of total stream bytes
- aggregation-rollup request normalization in `useStreamAggregations`
- stream-view aggregation toggle plus range switching
- infinite-scroll page growth behavior for both older history and newly revealed events
- stream-view transient highlighting for newly revealed rows, including automatic clearance
- stream navigation into `view=stream`
