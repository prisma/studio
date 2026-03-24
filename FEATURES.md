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
Choosing a filtered table, whether by `Enter` or mouse click, closes the search field and hands focus to the table grid so users can continue scrolling the new result set immediately.

## Schema Visualizer

Studio includes a schema graph view with table nodes, column metadata, and detected foreign-key relationships labeled as 1:1 or 1:n.
The visualizer now runs ELK auto-layout with component-aware spacing so disconnected tables do not collapse into the same visual band, and orthogonal step edges leave clearer corridors between nodes.
Dragged node positions persist when you leave and return to the same schema view, and a header-level `Reset layout` action re-applies the current ELK baseline when you want to discard manual placement.
Users can pan/zoom, inspect key and nullable markers, and jump from a node directly to that table’s data view.

## Data Grid Browsing

Table data is shown in a grid with server-backed pagination, filtered-row counts, loading feedback, and explicit empty states.
The footer keeps page navigation, a page jump field, a fixed rows-per-page dropdown, and infinite-scroll mode in one compact control group, so users can either jump directly to a page, switch page density from a known preset, or turn on lazy-loading without leaving the grid.
Rows-per-page and infinite-scroll preferences persist across tables through local storage, while the known filtered-row count keeps the footer stable during page transitions for the same filtered result set. Infinite scroll preloads before the hard bottom edge, always appends in fixed 25-row chunks regardless of the paginated page-size setting, keeps filling tall viewports until the grid is actually scrollable, and appends new rows in place without snapping the grid back to the top.

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
