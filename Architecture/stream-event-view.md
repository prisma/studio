# Stream Event View Architecture

This document is normative for the Streams event view in Studio.

The stream-event view MUST use TanStack DB as its source of truth for loaded event rows, while keeping URL-driven stream selection and stream-header controls separate from local-only infinite-scroll state.

## Scope

This architecture governs:

- active stream selection in the main view
- refreshing the active stream's latest event count
- loading active-stream total byte metadata for the footer summary box
- discovering active-stream search capability metadata
- discovering active-stream aggregation rollups
- loading active-stream aggregate windows
- rendering the optional aggregation strip above the event header row
- loading a tail window of decoded stream events
- loading filtered stream events through the search endpoint
- TanStack DB caching for stream-event rows
- infinite-scroll page growth for older events
- URL-backed stream follow mode selection
- URL-backed stream search term state
- URL-backed aggregation-panel visibility and aggregation range selection
- batched reveal of newly arrived events
- transient highlighting of newly revealed event rows
- one-row-at-a-time expansion behavior
- selective match highlighting for the open expanded event row
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
- either the tail-window inputs `visibleEventCount`, `pageSize`, and `pageCount`
- or the search inputs `searchQuery`, `visibleSearchResultCount`, and the resolved search sort order

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

### 3. Search-window pagination

When the active stream advertises `schema.search` metadata and the URL-backed `search` param is non-empty, `useStreamEvents` MUST switch from the normal stream read endpoint to `POST /v1/stream/{name}/_search`.

In search mode:

- the visible list MUST be reset before loading the new result set
- incomplete or syntactically invalid stream-search input MUST stay local in the search box and MUST NOT be committed into URL state or sent to `_search`
- incomplete field-name prefixes that are acting as suggestion prefixes, such as `met` on the way to `metric:`, MUST also stay local in the search box and MUST NOT be auto-committed into URL state or sent to `_search`
- when the local stream-search input is syntactically invalid, the shared search control MUST surface a visible explanation of the specific parse issue instead of silently refusing to apply the term
- when that invalid clause targets a typed field such as a numeric aggregate, the validation message SHOULD also explain the supported value forms for that field, such as plain number literals or comparison operators for numeric fields
- the query MUST request newest-first append-order sorting with `sort: ["offset:desc"]`
- infinite scroll MUST continue through `next_search_after`
- infinite-scroll fetches for older filtered pages SHOULD avoid recomputing exact totals on every paginated request; once the leading page has captured the exact total for the current search snapshot, follow-on page requests SHOULD keep `track_total_hits` disabled
- the rendered event list MUST remain in chronological order even though the results are filtered
- the footer summary box MUST switch to search progress copy while a search is active, showing the number of matching rows currently loaded into the list plus how many newest stream events have been scanned to reach the oldest visible match
- that scanned-event count SHOULD be derived from the oldest visible hit relative to the current stream head when Studio is using append-order `offset:desc` pagination
- once the filtered result set is exhausted and there are no older matching hits left, that scanned-event count MUST clamp to the full stream event count so the progress copy agrees with the end-of-stream state
- the search-progress footer SHOULD show a subtle fill proportional to scanned coverage across the stream, and any loading animation in that footer MUST be limited to user-triggered infinite-scroll fetches for older filtered results
- hidden-new-event detection for `live` and `tail` MUST become filter-aware instead of using the raw stream head count
- in search mode, the view MUST track the currently revealed filtered head separately from the older infinite-scroll window, so `live` and `tail` only reveal genuinely new matching hits and never inflate the visible list with older filtered history that the user has not scrolled down to load
- the "Reached the beginning of the stream" message MUST stay hidden while an older filtered page is still loading, and MUST appear only after the filtered request resolves without any additional older results

When the search term is empty, `useStreamEvents` MUST stay on the normal `GET /v1/stream/{name}` read path and MUST tear down any stale search-query work instead of letting `_search` continue in the background.
The stream view MUST clear search-mode visible-result state when the active stream or active search term changes.

### 4. Collection creation and reuse

Stream-event rows MUST be cached as TanStack DB query collections created through Studio context:

- created via `queryCollectionOptions(...)`
- reused through `getOrCreateRowsCollection(queryScopeKey, factory)`

Do not create unmanaged per-render collections. Do not bypass Studio's collection instrumentation boundary.

### 5. Live reads

Consumers MUST read stream-event rows directly from the collection through `useLiveQuery`.

Views MUST NOT mirror the loaded event list into parallel local arrays.

When infinite scroll increases `pageCount`, `useStreamEvents` MAY keep the last resolved event window visible while the larger tail window is still fetching.
This is required to prevent the scroll container from unmounting and resetting the user's scroll position during load-more transitions.

### 6. Latest count refresh and newer-event reveal

While a stream is open, Studio SHOULD refresh the active stream summary through `useStreamDetails`.
If the active stream advertises aggregation rollups, Studio MAY also load aggregate rollup windows through `useStreamAggregations`.

The stream view MUST treat that latest metadata count separately from `visibleEventCount`:

- the header MUST stay control-oriented and MUST NOT render the active stream name, decorative stream icon, or static subtitle copy
- the header MUST render a URL-backed three-state follow-mode selector with `paused`, `live`, and `tail`
- that follow-mode selector MUST default to `tail` when the hash is missing a valid value, and the stream view MUST materialize that resolved default back into the hash
- the follow-mode selector SHOULD expose concise hover help text so the behavioral difference between `paused`, `live`, and `tail` stays discoverable without adding permanent header copy
- the latest event count plus logical payload-byte total MUST render together in a fixed footer summary box, labeled clearly so byte totals stay distinct from the event count
- the active stream page MUST derive `epoch`, `nextOffset`, and the rest of the active stream summary from `useStreamDetails`, not by polling the full `/v1/streams` list in parallel
- when `useStreamDetails` exposes `schema.search`, the header MUST render the same expandable search control used by the table view instead of introducing a stream-only search input
- that shared stream search control MUST live in the left header control cluster beside the aggregation toggle and expand to fill the remaining header width instead of consuming a fixed narrow slot on the right
- when the shared stream search control is open, it MUST expose a trailing close button inside the field so the expanded state can be dismissed without reaching back to the original icon trigger
- stream search state MUST be URL-backed through the shared `search` param so search deep links work the same way for tables and searchable streams
- while the user is typing into stream search, the shared search control SHOULD offer syntactically valid inline suggestions derived from the active stream search schema plus values from the event rows currently loaded in the UI
- when the stream search control first opens with an empty input, it SHOULD immediately offer starter field-clause suggestions so autocomplete is discoverable without a priming keystroke
- those inline suggestions MUST be context-aware: incomplete field-name prefixes such as `met` SHOULD suggest complete field clauses like `metric:`, incomplete fielded clauses such as `metric:` SHOULD suggest valid field values from the currently loaded rows, and a complete clause followed by whitespace SHOULD suggest boolean operators such as `AND`, `OR`, and `NOT`
- field-clause suggestions SHOULD include a compact secondary annotation describing the resolved field type, using user-facing labels such as `string`, `number`, `boolean`, and `date`
- field-value suggestions SHOULD include helpful secondary metadata when it is cheaply available from the loaded rows, such as the event `unit` for metrics-style streams
- suggestion acceptance MUST NOT leak a partial field prefix such as `met` into URL state or `_search` before the user has actually chosen or finished a valid clause
- choosing a suggestion SHOULD update the visible search input immediately, before any async URL-state or search-result work begins
- value suggestions SHOULD continue to use previously seen event rows for the active stream while the stream page remains open, not just the currently visible filtered rows, so a temporary zero-result filter or other empty visible state does not collapse the field-value suggestion list
- the inline suggestion panel MUST float above the sticky event header row, size itself to its content with a `300px` minimum and the current search-box width as its maximum, and cap the rendered suggestion count at `100`
- while the suggestion panel is open, background stream refreshes MUST NOT rewrite the suggestion content underneath the user's keyboard navigation; only explicit input changes may do that
- keyboard navigation inside the suggestion panel MUST keep exactly one suggestion visually selected at a time and MUST scroll the active row into view as the highlight moves
- when `useStreamDetails` exposes one or more aggregation rollups, the header MUST render a sibling icon-only aggregation toggle button with an accessible label instead of a numbered text pill
- the aggregation toggle open/closed state MUST be URL-backed through `useNavigation`
- that header count SHOULD fall back to the rollup-definition count from `useStreamDetails`, but once aggregate window data has loaded it MUST prefer the resolved aggregation-series count so metrics-style rollups report their real card count
- the list remains bounded by `visibleEventCount` until the user reveals newer events
- when the follow mode is `paused`, Studio MUST stop the active-stream details polling loop so the stream view no longer issues background refresh requests
- when the follow mode is `live`, Studio MUST keep the current hidden-new-events behavior: detect newer rows, keep them out of the list, surface the centered `new events` button, and drive active-stream summary refresh through `_details` conditional long polling with `If-None-Match`
- when the follow mode is `tail`, Studio MUST automatically reveal newer rows, retain the same motion-safe row highlight treatment used for manual reveal, and use that same `_details` conditional long-poll path
- while the user remains at the head of the stream in `tail`, Studio MUST keep the event list pinned back to the top when newer rows arrive
- once the user intentionally scrolls away from the head in `tail`, Studio MUST stop forcing the viewport back to the top until they return to the head or explicitly jump back to the newest rows
- when stream search is active, `live` and `tail` MUST respect the active filter instead of reverting to raw stream-head behavior
- when `tail` programmatically scrolls the filtered event list back to the top, that scroll event MUST NOT trigger older-page infinite scroll; older filtered pages may only load from user scrolling toward the bottom of the list
- the aggregation strip, when open, MUST sit above the event-log scroll container instead of scrolling away with the event rows
- aggregation queries MUST be driven by a URL-backed range selection with quick buttons for `5 minutes`, `1 hour`, and `12 hours`, plus a custom-range popover for longer presets, an `All` whole-stream range, or an absolute time window
- the custom absolute-range editor inside that popover MUST keep its own local draft while it is open, and rerenders from surrounding stream updates MUST NOT overwrite partially edited date or time input values
- the absolute-range editor SHOULD use separate date and time inputs instead of a native `datetime-local` field so the control stays visually aligned with the rest of Studio and avoids browser-specific overlap issues
- that aggregation range MUST only be serialized while the aggregation strip is open, so closing the strip clears the range from the hash instead of leaving a stale hidden value behind
- aggregation queries MUST auto-refresh when the stream follow mode is `live` or `tail`, and MUST stay static when the follow mode is `paused`
- aggregation cards MUST be grouped by the rollup's primary dimension when one is advertised, so user-facing labels reflect the real aggregation name instead of raw measure ids like `value`
- when the aggregate group key includes `unit`, the card subtitle SHOULD prefer that unit over the raw rollup name
- for standard unit families such as bytes or durations, the card value SHOULD auto-scale to the most readable unit and MUST let the user override that unit from the card
- aggregation cards MUST render in a single horizontal band that scrolls sideways when the card count exceeds the available width
- aggregation columns MUST keep a fixed card width and confine horizontal overflow to that aggregation band instead of widening the surrounding stream page
- each aggregation card MUST let the metric label take the full card width with truncation, with the unit override and primary statistic controls stacked beneath that label
- when a series exposes multiple summary statistics, the primary statistic control MUST open an inline selector and any additional enabled statistics MUST render as stacked cards in the same column while leaving at least one statistic enabled
- stacked secondary statistic cards MUST render their statistic name as plain text, not as a badge pill
- per-series unit overrides and enabled statistic selections MUST persist while the user switches aggregation ranges for the active stream and when they navigate away from the stream and back
- those per-series aggregation preferences are user-authored UI state and MUST only change in response to explicit unit/statistic control clicks, never as a side effect of range changes or aggregate payload differences
- the unit override trigger and the primary statistic selector SHOULD present as low-visual-weight text until hover or focus, then transition into pill buttons without reflowing the card layout
- the unit override and statistic label SHOULD sit tightly stacked so they read as one compact control block
- each aggregation card MUST show a sparkline-like bucket history behind the headline value instead of introducing a separate chart pane
- the sparkline stroke SHOULD stay visually light so it remains background context rather than a foreground chart
- the centered `new events` button sits directly below the sticky summary header row
- the `new events` button row MUST NOT add a divider between itself and the event rows below it
- the `new events` button reveals at most 50 newer rows per click
- rows revealed by that button MUST receive a short-lived, motion-safe highlight animation so the prepended batch is visually obvious without shifting the viewport
- hidden newer rows MUST NOT auto-reveal from top-of-list scrolling while that button is present
- when the button appears or newer rows are prepended above the current viewport, the view MUST preserve the user's visible event position instead of snapping the existing list content
- only the event-log region may scroll vertically; the surrounding Studio shell, stream header, and aggregation strip MUST remain fixed in place
- the stream footer MUST stay outside the event-log scroll container and reuse the same dense control-cluster language as the table footer, including jump-to-start and jump-to-end controls around the summary box
- the stream footer summary box MUST use tabular numerals so count and size text stay width-stable while digits change within the same number of places
- the unfiltered event-count copy in that footer MUST use grouped digits for readability, while the logical payload size SHOULD remain human-scaled through unit selection instead of raw thousands separators
- clicking that footer summary box MUST open a diagnostics popover directly above it
- that diagnostics popover MUST be driven only from `useStreamDetails`; the stream view MUST NOT add a second `_details`, `/_index_status`, or metrics polling path just for footer diagnostics
- the diagnostics popover MUST separate logical payload size from physical storage signals, using `_details.stream.total_size_bytes` for the former and the richer `_details.storage`, `_details.object_store_requests`, and `_details.index_status` buckets for the latter
- the diagnostics popover MUST split remote bytes into explicit buckets for segments, bundled companions, exact runs, routing runs, and manifest/schema metadata instead of collapsing them into a generic `objects known` label
- the diagnostics popover MUST split local retained bytes into retained WAL, pending tail, pending sealed segments, and caches; pending tail MUST be presented as a non-additive breakdown of retained WAL rather than a second bucket added into retained-stream totals, and cache totals MUST include any companion-cache bytes surfaced by Streams
- the remote and local storage breakdowns inside that diagnostics popover SHOULD render as compact collapsible ledger boxes with the section title embedded in the box header, and when collapsed that header MUST surface the section total while the detailed rows fold closed with a short CSS transition
- request accounting inside that diagnostics popover SHOULD use the same ledger language: `GET`, `HEAD`, and `LIST` rows MUST roll up into `Reads total`, `Puts total` MUST remain separate, and the section MUST expose a final request total for the current Streams node
- the diagnostics popover MUST separate bundled search coverage from run accelerators: search-family rows answer whether bundled companions are fully accelerating search right now, while routing and exact run rows answer how much historical pruning has been built
- run-accelerator rows MUST use state-aware text instead of a generic `N segments behind` badge: `Caught up`, `Waiting for next full 16-segment span`, or `Backfilling`, based on the single-snapshot lag and the fixed 16-segment build span
- when the routing-key index is not configured, the diagnostics popover MUST hide that run-accelerator row instead of presenting it as lagging progress
- the diagnostics popover MUST treat `_details.object_store_requests` as node-local accounting for the current Streams process and MUST label it accordingly
- when the current Streams descriptor does not expose a requested cost or storage number, the diagnostics popover MUST render that field as unavailable instead of guessing or deriving a misleading approximation

When a newer-event batch is revealed, the view MUST also grow `pageCount` so previously visible rows stay in the list instead of being replaced by the newer batch.

### 7. Has-more detection

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
- when the active stream advertises `search.primaryTimestampField`, time SHOULD prefer that configured field and its bound JSON pointers before falling back to the built-in common timestamp field list
- key MAY be derived from explicit key/routing-key fields in the decoded payload
- indexed fields MAY be derived only from explicit indexed-field payload shapes; do not invent synthetic indexed metadata
- preview SHOULD prefer the payload's primary content object when one exists (for example a top-level `value` field), otherwise fall back to the full decoded event
- expanded content SHOULD pretty-print structured JSON payloads
- when stream search is active and a row is expanded, the pretty-printed expanded content SHOULD highlight matching fields and values using the same yellow search treatment used by table search
- unfielded search clauses SHOULD highlight only the matched value text for the configured default fields, not the names of every default field that participated in matching
- wildcard text clauses such as `tieredstore.ingest.queue.*` SHOULD highlight the matched prefix inside the expanded JSON value
- match highlighting MUST be limited to the currently expanded row to avoid per-row search-render overhead in the main list

## UI State Contract

The active expanded event row MUST be stored through `useUiState` with a stream-scoped key such as:

- `stream:${streamName}:expanded-event`

Stream navigation chrome MUST be URL-backed through `useNavigation` with keys such as:

- `streamFollow`
- `aggregations`
- `streamAggregationRange`
- `search`

Aggregation-only local preferences MUST still be stored through `useUiState` with stream-scoped keys such as:

- `stream:${streamName}:aggregation-enabled-statistics`
- `stream:${streamName}:aggregation-display-units`

`stream:${streamName}:aggregations-open` and `stream:${streamName}:aggregation-range` are no longer authoritative state for the stream view and MUST NOT be reintroduced as competing local sources of truth.
The remaining stream-scoped aggregation preference keys live in Studio's TanStack DB-backed local UI state collection.
They MUST NOT be pruned or normalized away just because a different aggregation range temporarily hides a series or omits one of its statistics.

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
- search-endpoint request behavior in `useStreamEvents`, including `next_search_after`
- filtered hidden-new-events handling for `live` and `tail`
- clipping hidden newer events until `visibleEventCount` advances
- newest-first normalization of decoded events
- stream-view expansion exclusivity
- stream-view compact header/footer chrome rendering
- stream-view paused/live/tail follow-mode behavior and hash persistence
- stream-view searchable-header behavior and search reset semantics
- stream-search inline suggestion behavior for field names, field values, and post-clause operators
- expanded-row match highlighting for stream search
- aggregation-rollup request normalization in `useStreamAggregations`
- stream-view aggregation toggle plus range switching, including range cleanup when the panel closes
- infinite-scroll page growth behavior for both older history and newly revealed events
- stream-view transient highlighting for newly revealed rows, including automatic clearance
- stream navigation into `view=stream`
