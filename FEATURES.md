# Features

## Multi-Database Adapters

Studio connects to PostgreSQL, MySQL, and SQLite through a unified adapter contract, so the same UI works across supported engines.
Each adapter handles introspection, querying, inserts, updates, and deletes while exposing capabilities that drive conditional UI behavior.

## Live Introspection and Schema Discovery

Studio introspects connected databases to build schemas, tables, columns, relationships, filter operators, and timezone metadata.
This gives users an accurate live model of the database and keeps table navigation grounded in current structure.

## Deployable Prisma Postgres Demo

The local `ppg-dev` demo can be packaged into a Compute-ready artifact instead of requiring the repo checkout at runtime.
The deploy builder precompiles the browser JS/CSS, injects those assets into the bundled server, and relies on `@prisma/dev`'s Bun runtime-asset manifest so PGlite's WASM, data, and extension archives are emitted automatically beside the server bundle.
The same demo entrypoint can also run against external development infrastructure through `pnpm demo:ppg -- --database-url <postgres-url> --streams-server-url <streams-url>`, or in streams-only mode through `pnpm demo:ppg -- --streams-server-url <streams-url>`. In those modes, Studio keeps serving the local shell and `/api/streams` proxy, but skips local Prisma Dev startup, local Streams startup, WAL wiring, and local seeding so you can point the demo at an already-running backend stack.

## Streams-Only Studio Shell

Studio can run without a database connection when a Streams server is configured, which makes it usable as a focused event-log and stream-search tool.
In that mode the shell hides schema selection, table navigation, and database-only views, defaults into the stream view, and keeps all Streams browsing, search, aggregation, and live/tail behavior working through the normal `/api/streams` proxy.

## Local Streams Development Override

Studio's local development workflow can temporarily replace the published npm `@prisma/dev` package with the sibling source package from `../team-expansion/dev/server`, while also swapping its `@prisma/streams-local` dependency over to a built local Streams checkout.
That override stays opt-in, rebuilds from the sibling repos by default, and can be reverted without rewriting the tracked lockfile, so experimental Prisma Dev and Durable Streams work can stay local to one Studio checkout.

## Introspection Recovery and Retry

Startup introspection failures show retryable diagnostics in both the sidebar and the main table panel instead of pretending the database has no tables.
Studio keeps the last successful schema snapshot visible when a refresh fails, disables automatic retry loops for introspection, and falls back to `UTC` when PostgreSQL or MySQL timezone metadata is unavailable but table metadata succeeded.

## URL-Driven Navigation and Deep Linking

View, schema, table, filter, sort, pagination, and row-search state are encoded in URL hash parameters.
Users can share links into a precise Studio state, and stale params are resolved back to valid schema/table defaults.

## Sidebar Schema and Table Navigation

The sidebar provides schema switching and active-table navigation so users can move through large databases quickly.
Table-name metadata is normalized into local TanStack DB state and queried live for responsive list rendering.

## Sidebar Table Name Search

Table filtering is available inline in the Tables header, so search is there when needed without permanent UI clutter.
The field opens and closes with keyboard-friendly behavior, filters table names in real time from local state, and supports `ArrowUp` / `ArrowDown` plus `Enter` to choose a table without leaving the keyboard.
The same hover affordance also exposes a refresh action next to search, so users can reload schema and table metadata from the sidebar header without permanently spending space on extra controls.
Choosing a filtered table, whether by `Enter` or mouse click, closes the search field and hands focus to the table grid so users can continue scrolling the new result set immediately.

## Sidebar Streams Navigation

Studio can optionally connect to a Prisma Streams server alongside the database connection and show a `Streams` section directly under `Tables` in the sidebar.
The list reuses the same compact navigation shell as table browsing, loads live stream names from the configured Streams base URL, and disappears entirely when Studio is embedded without Streams configured.
Streams also reuse the same inline filter disclosure as tables, so the `Streams` header can open an in-place search field with the same keyboard flow, real-time local filtering, and `ArrowUp` / `ArrowDown` plus `Enter` selection behavior instead of introducing a second sidebar filtering pattern.
That shared hover affordance also adds a stream-list refresh button beside search, so the current Streams server can be queried again on demand without opening the field first or adding permanent chrome to the sidebar header.
The sidebar width is also user-resizable from a drag handle on its right edge, and that width is persisted in Studio UI state so wider stream names stay readable as you move around the app or reopen it later.

## Stream Event Browsing

Selecting a stream opens a dedicated event log view in the main pane instead of the table grid.
The view uses TanStack DB-backed infinite scroll to load the newest events first, shows summary columns for time, key, indexed fields, preview text, and payload size, and lets users expand one event at a time to inspect the full formatted content.
When a stream advertises a search schema with a primary timestamp field, the event log uses that configured timestamp for the row time column before falling back to legacy timestamp field names. This keeps schema-driven streams like GH Archive from showing `Unknown time` even when their canonical timestamp lives under a non-legacy field such as `eventTime`.
The stream chrome now mirrors the table view more closely: the header is reserved for controls, while a fixed footer summary box shows the latest event count and total logical payload bytes in human-readable units.
That footer count uses grouped digits like `12,345 events`, while the byte total stays compact by scaling units such as `MB` and `GB` instead of showing a raw comma-separated byte count.
That footer summary uses tabular numerals, so values stay visually stable as digits change without making the whole control cluster wobble on every `8` to `9` style update.
That same header also exposes URL-backed `Paused`, `Live`, and `Tail` modes, with `Tail` as the default. `Paused` stops background polling entirely, `Live` keeps the current hidden-new-events flow with the centered `new events` button, and `Tail` automatically reveals arriving rows, highlights them, and keeps the newest events pinned in view while you stay at the head of the stream.
The footer jump buttons use the same shared tooltip treatment as the rest of Studio, so hovering the edge controls explains that they jump to the beginning or end of the visible stream history without introducing extra permanent labels.
On the active stream page, Studio now reuses the stream summary already embedded in `GET /v1/stream/{name}/_details`, so the footer count, byte total, and reveal logic no longer need a second `/v1/streams` polling loop just to track `epoch` and `next_offset`.
Studio keeps those follow controls compact, adds hover explanations for each mode, writes the active follow mode into the hash for deep-linking, and uses `_details` ETag long polling while a stream is actively following so live and tail updates arrive without the old 100ms metadata poll loop. That long-poll loop now stays alive across ETag updates instead of restarting itself on every successful wake, which avoids the noisy client-side canceled requests that used to appear between real `_details` refreshes.
Older-history loading stays on the same infinite-scroll surface, and the footer adds jump-to-start / jump-to-end controls so you can move between the oldest and newest visible ends without losing the anchored stream chrome.
Clicking the footer summary now opens a diagnostics popover above it, reusing the same long-polled `_details` descriptor instead of adding another stream-management request. That panel separates logical payload size from physical cost signals, breaks object storage into segments, index files, exact runs, routing runs, and manifest/meta bytes, and shows the matching retained-local-storage buckets plus node-local object-store request counters.
The remote and local storage sections now use compact collapsible ledger boxes instead of wide card grids, so users can scan the totals at a glance and expand the detailed accounting only when they need the breakdown.
The same popover also splits search coverage from run accelerators, so users can tell whether bundled companions are fully accelerating search right now and whether cross-segment run indexes are caught up, backfilling, or simply waiting for the next full 16-segment span. Local retained-data totals also avoid double-counting the pending tail by treating it as a breakdown of retained WAL rather than a second additive bucket, and the local cache ledger now includes companion-cache bytes so the visible row totals line up with the Streams-reported local total. Request accounting uses the same compact ledger style with explicit `GET`, `HEAD`, and `LIST` rows rolling up into `Reads total`, separate `Puts total`, and a final request total for the current Streams node.
When Streams does not expose a meaningful lag duration for a coverage or accelerator row, Studio simply omits that lag text instead of rendering distracting placeholders like `Unavailable behind`.

## Stream Search and Match Highlighting

When a stream advertises search capability in its `_details` descriptor, Studio reuses the same compact expandable search control used by tables instead of introducing a separate stream-only search box.
In the stream header, that control sits with the left-side stream actions and expands across the remaining header width, so filtering stays close to the aggregation toggle without squeezing into a tiny fixed field.
When the field is open, a small trailing close button sits inside the input so you can collapse the expanded search state directly from the active field.
Running a search swaps the event log over to the Streams `_search` endpoint, resets the visible list, and keeps infinite scroll paginating chronologically through filtered results instead of mixing searched and unsearched windows. When no filter is active, the stream view stays on the normal read endpoint so unfiltered browsing keeps the cheaper path.
Incomplete fielded queries such as `metric:` stay local in the search box until they become valid Streams search syntax, and incomplete field-name prefixes such as `met` also stay local when they are clearly on the way to a field suggestion like `metric:`. Accepting a suggestion no longer leaks that partial prefix into the URL or `_search`, so Studio does not briefly filter the stream on half-written syntax while you are still composing a clause. When the local query is invalid, the search control shows the exact syntax problem directly under the field instead of failing silently, and typed fields such as numeric aggregates can explain the accepted value forms right in that inline error.
The same search box also offers context-aware suggestions while you type. Opening the field now shows starter field clauses immediately, field-name prefixes complete into valid field clauses, incomplete fielded clauses suggest recent values from event rows already seen for that stream, and a completed clause followed by whitespace suggests boolean operators for building the next clause. Those value suggestions keep drawing from remembered rows for the active stream, so they remain useful even when the currently visible filtered result set is empty.
Field suggestions also show a friendly field-type label such as `string`, `number`, `boolean`, or `date`, so a clause like `unit:` reads as a string field instead of opaque search-engine metadata. Value suggestions can also show related metadata from the loaded rows, such as `unit: bytes`, which helps distinguish metrics-style dimensions without opening an event first.
The inline suggestion panel stays above the sticky stream header, sizes to its content instead of stretching across the whole view, and caps itself at 100 suggestions so broad fields remain usable without becoming a giant overlay. While it is open, background stream refreshes no longer reshuffle the list under your cursor, and keyboard navigation keeps one active row highlighted and scrolled into view.
Filtered infinite scroll now uses append-order search pagination and only shows the `Reached the beginning of the stream` message after the server has actually confirmed there are no older matching events left.
Stream search no longer asks Streams for `track_total_hits` at all. Studio now uses the normal `total` object returned by `_search`, which keeps the client aligned with the current Streams search contract while still supporting filtered progress, hidden-new-match counts, and jump-to-beginning behavior.
While a search is active, the footer summary switches from `events + bytes` to search progress, showing how many matching rows are currently loaded plus how far Studio has scanned back through the stream to find them. That scan depth is pinned to the currently revealed filtered snapshot, so passive `Live` and `Tail` checks do not make the number drift upward unless the visible filtered window actually changes, while the total stream event count in the same footer can still keep advancing with the live head. Once the filtered result set is exhausted, that progress still resolves to the full stream size so the footer and the `Reached the beginning of the stream` message agree instead of undercounting the last unmatched tail. That same summary box adds a subtle fill proportional to scanned coverage, and only the user-triggered infinite-scroll fetch path adds a brief neutral loading pulse so background follow-mode refreshes do not look like manual pagination work.
`Live` and `Tail` continue to work against that active filter, so newly matching events are discovered and revealed without dropping back to raw stream-head behavior.
When `Tail` pins the filtered list back to the newest matching events, that programmatic scroll no longer triggers older-page loading. Older filtered history still grows only when you actually scroll toward the bottom yourself.
That filtered follow logic also keeps a separate notion of the currently revealed matching head, so `Tail` can append only genuinely new matching events without suddenly pulling in older filtered pages just because the exact match total changed.
When you open a matching event, Studio highlights the matched fields and values inside the expanded JSON payload with the same yellow search treatment used in the table view, but only for the open row so large logs stay responsive. Unfielded searches highlight the matching value text without also painting every default-field name, and wildcard clauses such as `tieredstore.ingest.queue.*` highlight the matched prefix inside the expanded JSON value.

## Stream Aggregation Rollups

When a stream advertises search rollups, Studio adds an icon-only aggregation toggle in the stream header so users can inspect rollup data without leaving the event log without spending header width on a live count pill.
The aggregation strip groups cards by the rollup's primary dimension, so metrics like `process.rss.bytes` render under their real names instead of generic measure labels, and the secondary label prefers the metric unit when Streams exposes one.
For standard unit families such as bytes and durations, Studio auto-picks the most readable unit for the current value and lets you override it from the card itself.
Quick controls cover `5 minutes`, `1 hour`, and `12 hours`, and a small popover exposes longer presets, an `All` range for whole-stream history, plus an exact absolute range.
That custom range editor keeps a local draft while you type, so rerenders from the surrounding stream page do not snap the inputs back underneath you.
The absolute editor also uses separate date and time inputs instead of the browser's bulky `datetime-local` control, which keeps year editing stable and avoids the overlapping native control chrome that looked out of place next to the rest of Studio.
The aggregation strip's open state and active range are also shareable through the URL hash, but the `aggregations` flag only appears while the strip is open and the range is only kept in the hash alongside that open flag.
Aggregation refresh now follows the main stream mode instead of a separate toggle, but only while the strip is actually open: `Paused` freezes the metrics band, while `Live` and `Tail` keep an open aggregation strip current without spending background `_aggregate` requests when the strip is closed.
If a metric exposes multiple summary statistics such as `Average`, `P95`, or `P99`, the primary selector opens a small menu and any extra enabled statistics stack as additional cards in the same metric column with plain-text secondary labels.
Those unit and statistic preferences are treated as user-authored state in Studio's TanStack DB-backed UI store, so they survive range switches and returning to the same stream instead of being reset by whichever aggregate payload happened to load last.
Cards keep a fixed width inside their own horizontal scroller, the header toggle upgrades from raw rollup count to the real visible aggregation count once data loads, and only the event log itself scrolls so the surrounding stream chrome stays anchored.

## Schema Visualizer

Studio includes a schema graph view with table nodes, column metadata, and detected foreign-key relationships labeled as 1:1 or 1:n.
The visualizer now runs ELK auto-layout with component-aware spacing so disconnected tables do not collapse into the same visual band, and orthogonal step edges leave clearer corridors between nodes.
Dragged node positions persist when you leave and return to the same schema view, and a header-level `Reset layout` action re-applies the current ELK baseline when you want to discard manual placement.
Users can pan/zoom, inspect key and nullable markers, and jump from a node directly to that table’s data view.

## Data Grid Browsing

Table data is shown in a grid with server-backed pagination, filtered-row counts, loading feedback, and explicit empty states.
The footer keeps page navigation, a page jump field, a fixed rows-per-page dropdown, and infinite-scroll mode in one compact control group, so users can either jump directly to a page, switch page density from a known preset, or turn on lazy-loading without leaving the grid.
Rows-per-page and infinite-scroll preferences persist across tables through local storage, while the known filtered-row count keeps the footer stable during page transitions for the same filtered result set. Infinite scroll preloads before the hard bottom edge, always appends in fixed 25-row chunks regardless of the paginated page-size setting, keeps filling tall viewports until the grid is actually scrollable, and appends new rows in place without snapping the grid back to the top.
Rapid sort and filter changes keep the latest request authoritative, and superseded table reads are aborted so a slower older result cannot overwrite the visible grid.

## PostgreSQL Stored Temporal Values

When Studio reads PostgreSQL data through the `postgres.js` executor, `date` and `timestamp without time zone` values are normalized back to their stored wall-clock values before they reach the grid.
This keeps table cells, copies, and other row-backed UI surfaces from drifting with the host machine timezone, so a stored PostgreSQL timestamp is shown as the value that was actually written.

## Command Palette

`Cmd/Ctrl+K` opens a compact Studio command palette that immediately focuses search and filters available actions as you type.
In table view it surfaces context-aware actions like row search, AI filtering, insert row, refresh, and page navigation, while the lower sections jump to tables and core Studio views.
Table navigation stays intentionally short by showing only the first 3 tables by default and the top 3 matches while filtering. If more tables exist, the palette shows an `x more...` entry that hands off into the existing sidebar table search so users keep one consistent table-filtering UI.
`Search rows` and `Filter with AI` work in two modes: typing the command name keeps them as focus actions for the existing toolbar inputs, while free text turns them into direct `Search rows: ...` and `Filter with AI: ...` actions that execute immediately. Keyboard selection stays active from the moment the palette opens, so arrow keys can move through results before any typing, and the list auto-scrolls the active result into view as you move into lower sections.

## Column Controls and Metadata

Columns support drag-and-drop reordering, resizing, sorting, and pinning to keep important fields anchored during wide-table review.
Header cells surface model metadata such as primary key, foreign key, required, computed, autoincrement, and datatype.
Resize handles stay centered on the real column boundary with a forgiving full-height hit target, so resizing does not require pixel-perfect pointer placement.
Column widths stay bounded to practical defaults, and long text or JSON values respect that same max width by clipping with a standard ellipsis instead of forcing the grid wider than the chosen size.
Pinning and drag reordering now animate the affected header and visible cells with a short CSS transition, so column layout changes read as motion instead of abrupt jumps. Sticky header layering also keeps the top-left selector corner above the scrolling row-selector column, so the empty spacer cell stays visible while the grid moves underneath it.

## Inline Table Filters

Table filtering starts from a simple column picker in the toolbar and renders filter pills inline in a fixed row above the grid headers.
New pills open with the selected column prefilled, the operator unset, and the value ready for typed entry, then apply with Enter or the inline check action. The same picker can also add a raw `SQL WHERE clause` pill for advanced cases that need adapter-native filtering.
Draft pills dismiss cleanly with `Esc` or click-away: unused new pills are removed, while existing pills close editing and resync the applied filter.
Operator choices are type-aware: ordered operators only appear for numeric/date/time columns, text-search operators only appear for text-like columns, and equality-only types such as UUID, JSON, and binary columns stay constrained to the operators they can actually support.
Saved pills are syntax-validated before they reach the URL. Invalid pills stay visible with a yellow warning outline and hover message, but they are not serialized into the shareable filter hash until fixed. SQL pills use the same warning flow, accept a single `WHERE` clause fragment with an optional leading `WHERE`, and then run async SQL lint in the background against a full `SELECT ... WHERE ...` statement.
That SQL lint does not block the initial apply, so advanced filters can execute immediately. A later lint failure turns the pill yellow with the lint error as the explanation, but it stays advisory and does not rewrite the already-applied URL state.
The picker keeps readable database type names like `timestamptz`, and the pill row stays in place while the data grid scrolls, wraps across lines when needed, and keeps applied filters encoded in the URL hash for shareable views.
Filter pill controls also declare their own sizing, font, and control resets so embedded host products cannot distort the pill layout with global button/input CSS.
When users switch to a different table and later come back, the inline pills resync from the current URL state instead of reviving stale per-table drafts that are no longer applied.

## AI-Assisted Table Filters

Embedders can optionally provide a single async `llm` hook on `Studio`, and the table filter flow uses that shared transport with a `table-filter` task. This is the only supported AI integration surface.
When configured, the table toolbar shows a single shared filter control: the left side opens the manual filter picker and the right side acts as an inline AI prompt that expands in place without adding a second bordered field. If no `llm` hook is provided, Studio falls back to the compact manual filter button with no empty AI affordance.
The shared shell keeps the surrounding toolbar buttons aligned and preserves a clear gap to the refresh or other host-supplied end controls as it grows. The local demo can also disable all AI affordances explicitly through `STUDIO_DEMO_AI_ENABLED=false`, which is useful when an Anthropic key is present but the embed should behave like a manual-only Studio.
The local Anthropic-backed demo keeps provider secrets and prompt text out of request logs, so enabling the sample `llm` flow does not echo credentials or user input into terminal output.
The prompt also includes the current date and time, so relative requests like `today`, `last month`, or `last year` can be resolved against a concrete timestamp, and it includes per-column supported operators plus explicit syntax rules for null checks, text search, UUIDs, JSON, arrays, ordered comparisons, and the SQL fallback format.
AI responses are syntax-validated with the same rules as manual pills. Studio tells the model to prefer predefined column filters and only fall back to `{"kind":"sql","sql":"..."}` when the request cannot be expressed that way, then retries once with the raw response and validation issues if the first answer is invalid.
When AI creates a filter, the pill keeps the original request as local UI metadata. Hovering a valid AI-generated pill shows that request in a green explanation bubble, while invalid AI pills keep the yellow warning bubble and include the original request as secondary context.

## Global Row Content Search

Active-table search supports typed planning across columns, combining text matching with boolean, numeric, UUID, date, and time parsing.
PostgreSQL adds broad built-in type coverage via cast-to-text fallback, while MySQL and SQLite prioritize efficient cheap/moderate predicates.

## Search Guardrails and Match Highlighting

Full-table search is debounced, limited to one in-flight query per adapter, and hard-capped with a 5-second timeout.
Matching substrings are highlighted in the grid, and timeout errors explain that table-wide search can be expensive on large tables.

## SQL Editor Intelligence

The SQL view uses a full CodeMirror editor with dialect-aware syntax highlighting and schema-aware autocomplete for schemas, tables, and columns.
Autocomplete is built from live introspection metadata, so suggestions track the current database structure without manual refresh workflows.
PostgreSQL, MySQL, and SQLite linting runs asynchronously through guarded parse/plan `EXPLAIN` paths and shows inline diagnostics while preserving the normal run/cancel query flow.
The same lint transport also validates saved table-level SQL filter pills in the background, so Studio reuses one dialect-aware SQL validation path for both the SQL editor and advanced inline table filters.
Keyboard execution supports `Cmd/Ctrl+Enter`, and in multi-statement scripts it runs only the top-level statement at the current cursor.
Large SQL result sets stay responsive while you keep editing the query because result-grid rendering is isolated from editor keystrokes unless the executed result itself changes.
Long SQL lines wrap inside the editor instead of stretching the overall page wider, so writing large queries stays readable on narrow viewports.

## AI SQL Generation

Embedders can optionally provide the same async `llm` hook on `Studio`, and the SQL view uses it with a `sql-generation` task to turn natural-language requests into SQL.
When configured, the SQL toolbar adds an inline prompt plus `Generate SQL` action that writes the generated statement into the editor without running it, then focuses the editor so `Cmd/Ctrl+Enter` or the existing `Run SQL` button can execute it as the next explicit step.
The prompt context is built from live introspection metadata, including the concrete database engine, active SQL dialect, and available schema/table/column names, but it excludes row data and query results.
AI responses must satisfy a strict JSON contract with generated SQL, a short rationale, and a yes/no visualization decision, and Studio retries once if the model returns malformed JSON.
Submitted AI requests are also stored locally in the SQL-view TanStack collection, so an empty focused prompt field can browse older requests with `ArrowUp` / `ArrowDown` as placeholder-only previews before committing one back into the input for editing.
Provider output-limit failures are surfaced explicitly and can feed into the next JSON-correction prompt instead of showing up as a vague parse failure. The visualization decision from AI generation is also preserved so the later manual run can still auto-chart graph-worthy results.

## AI SQL Result Visualization

When SQL query results are visible and `llm` is configured, Studio can also turn the returned rows into an in-grid Chart.js visualization.
The visualization uses a minimal summary-row trigger labeled `Visualize data with AI`, right-aligned beside the query result count, and mounts the generated chart above the SQL result headers inside the shared scrollable grid without a regenerate control.
Studio sends the executed SQL, the concrete database engine, and the full result row set to the model, and when the result came from `Generate SQL with AI` it also includes the original natural-language request for extra visualization context. The model is asked for a pure Chart.js JSON config with no external libraries, and Studio mounts the returned chart directly with Chart.js.
Mounted charts sit inside a white in-grid band that stays tied to the visible result viewport instead of the total table width, while the chart itself stays centered and width-clamped between 300px and 1200px so wide result grids do not force giant charts.
When SQL is generated through AI, the same model call also decides whether the expected result is graph-worthy; if it says yes, Studio auto-generates the chart after the user manually runs that generated SQL instead of waiting for a separate chart button click.
If another query starts running, the visualization resets immediately so stale charts do not persist across changing result sets. Visualization generation also retries up to two times on malformed JSON, invalid chart configs, or explicit provider output-limit failures.

## Cell and Row Selection Modes

Selection uses a typed state machine with mutually exclusive modes for cell-range selection and row selection.
Users can extend ranges with pointer gestures or Shift+arrow keys and clear active selections with Escape.

## Clipboard and Context Menu Workflows

Studio supports copy for individual cells, row-level selections, and rectangular cell ranges using tabular clipboard formats.
Paste operations map matrix values into selected writable cells, enabling spreadsheet-style bulk update workflows.

## Selection Export Formats

When rows or cell ranges are selected, the table toolbar adds a compact `copy as` menu for exporting the current selection as Markdown or CSV.
Exports can copy directly to the clipboard or save to disk, include column headers by default, and reuse the current grid column order and pinned-column layout so the exported shape matches what users are working with.

## Typed Cell Editing

Editable cells open popover editors with datatype-specific controls for raw text, numeric, boolean, enum, JSON/array, date, and time values.
Save/cancel keyboard behavior is standardized, and null/default/empty semantics are handled explicitly per input type.
PostgreSQL user-defined enum arrays also persist through that same staged-edit flow, with schema-qualified casts emitted in a form PostgreSQL accepts for `enum[]` writes.

## Staged Multi-Cell Editing

Existing rows can stage edits across multiple cells and rows before anything is written to the database.
Staged cells stay visible with a warm staged tint and preserved amber border, `Tab` and `Cmd/Ctrl` + arrow keys move editing directly into neighboring cells, and the toolbar promotes a shared `Save x rows` action once edits are pending.
Clicking away from an edited cell still stages that change, so you can move around the grid with the mouse without having to press `Enter` first.
A muted blue focused-cell border keeps keyboard navigation anchored even outside edit mode: arrow keys move that focus like a spreadsheet, `Enter` reopens the focused cell, `Shift` + arrow starts cell-range selection from it, and insert-row drafts focus their first cell immediately.
That same focused-cell model also powers keyboard copy fallback, so `Cmd/Ctrl+C` still copies the current cell value even when focus has moved with arrow keys but no explicit cell range is selected.
Committing those staged edits is guarded by a compact confirmation dialog, so batch writes stay explicit before Studio sends the transaction to the database.
While staged edits exist, row-changing controls like filter, search, sort, and pagination lock in place so the visible result set cannot drift away from the staged cells. Those blocked interactions kick the yellow `Discard edits` button into a short CSS wiggle instead of silently doing nothing.
The same staged-edit actions also appear in `Cmd/Ctrl+K`, so you can save or discard without leaving the keyboard and without learning a second set of labels.
Insert-row drafts use that same staged editing model, so new rows and existing rows share one save/discard workflow instead of separate persistence behavior, and the focused cell stays on the same screen position when sorting, filtering, or paging swaps in new visible rows.

## Relation-Aware Navigation

Foreign-key cells expose direct navigation actions that open the referenced table with a generated equality filter.
This makes cross-table investigation fast without manually rebuilding filters for related records.
Studio also infers reverse relation columns for inbound foreign keys, so a parent table can expose read-only links into related child rows without storing extra schema metadata.
Those virtual back-relation columns default to the end of the grid, can still be rearranged like other columns, and keep the same filtered-navigation behavior in the reverse direction.

## Insert, Update, and Delete Workflows

Updates and deletes use optimistic collection mutations so feedback is immediate while persistence completes in the background.
Insertion supports staged draft rows with per-cell editors and explicit save/cancel controls before committing.
Saving staged edits, discarding staged edits, and selected-row deletion all use compact confirmation dialogs that count the affected rows or cells so destructive and write-heavy actions stay explicit before they run.

## Operation Console and Error Visibility

Introspection and data operations emit structured success/error events with SQL text, parameters, timestamps, and status.
The Console view provides query history with copy actions, and error toasts link directly to Console for fast diagnostics.

## Telemetry Opt-Out

Studio uses the same checkpoint usage-data service as other Prisma tooling for launch telemetry and update notices.
Teams that do not want Studio to send that usage data can disable it with `CHECKPOINT_DISABLE=1`, matching Prisma's documented CLI opt-out behavior.

## Persistent Studio UI State

Studio stores shared UI state in TanStack DB collections, including per-table drafts, selections, and metadata caches.
Sidebar state, theme preference, and scoped interaction state stay consistent across components and sessions.

## TanStack DB Mutation Guardrails

Studio includes development-time guardrails that detect unusually high TanStack DB mutation volume in a single event-loop tick.
When a mutation burst is detected, Studio reports the triggering collection and operation so regressions are found early.
Strict mode can escalate warnings to thrown errors for debugging performance-sensitive flows.

## Theming and Embedding Customization

Embedded hosts can provide custom theme variables (object or CSS) while Studio supports explicit `light`, `dark`, and `match system` theme modes.
Theme values are applied across Studio roots and portal surfaces at runtime, and the command palette can switch Studio between actual system color-scheme following and persistent local overrides without introducing a separate theme system. If media queries are unavailable, Studio falls back to the host document `dark` class.
Theme root classes and variables are synchronized before paint, and supported browsers wrap explicit theme changes in a view transition, so switching appearance modes does not flash a partially updated mix of old and new tokens.
Palette theme toggles stay interactive in browsers that expose the View Transition API, so `Match system theme` can be turned both on and off in place without closing the palette or getting stuck on the system setting.
Shared buttons, inputs, filter pills, visualizer nodes, confirmation dialogs, staged-cell overlays, grid cells, compact pagination controls, and the Prisma navigation mark resolve readable dark-mode treatment from those theme tokens and assets, so toolbar controls, page pickers, inline filters, schema cards, prompts, staged edits, table values, and the Studio brand chrome stay visible on dark host surfaces.
