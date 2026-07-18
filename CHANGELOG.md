# @prisma/studio-core

## 0.34.0

### Minor Changes

- dc44731: Remember the schema visualizer's manual table layout. Dragged node positions are now stored in localStorage-backed UI state scoped per schema, so a manual arrangement survives leaving the visualizer and full page reloads. Tables without a remembered position (for example newly created ones) fall back to ELK auto-layout, and the `Reset layout` action clears the remembered layout.
- 1fbd26b: Show the total row count of the current result set in the data grid footer. The count uses the same filtered total that drives pagination, so it respects active filters and row search, formats with thousands separators, and hides when the adapter cannot count rows.

### Patch Changes

- 1b72949: Fix white page background around Studio in dark mode. When Studio runs in a full-page shell whose document has no host-authored background, the resolved theme now syncs to the document root (`color-scheme` plus Studio's background color), so overscroll areas and the space behind Studio's rounded corners match the active theme. Host pages that style their own `<html>`/`<body>` background are left untouched.
- 6415faf: Fix PostgreSQL enum array cell updates failing with "Update Operation failed" by always writing array values as explicit `array[...]` expressions with an array-type cast instead of relying on driver-specific array parameter serialization. Also preserve the original error name when errors are deserialized from the Studio BFF transport.
- 3e1c902: # Support libpq SSL parameters in Postgres connection strings

  Consume `sslrootcert`, `sslcert`, `sslkey`, `sslpassword`, and `sslmode` client-side when building the postgres.js client instead of forwarding them to the server, which rejected connections with `unrecognized configuration parameter "sslrootcert"`. The new `createPostgresJSConnectionConfig` helper in `@prisma/studio-core/data/postgresjs` translates a connection string into a stripped connection string plus TLS options (reading certificate files from disk) for `postgres()`.

- 3f4d84c: Fix grid column widths being reset when columns are pinned or unpinned. Resizing a column and then changing any column's pin state (which round-trips through the URL-backed `pinnedColumnIds` prop) wiped all user column widths and custom column ordering back to defaults. The reset now only happens when the set of columns itself changes.
- df3f210: Fix MySQL introspection failing on MariaDB. The adapter now detects MariaDB via `select version()` and uses a dedicated tables query that returns one row per column and groups the result on the client, avoiding `json_arrayagg` (missing before MariaDB 10.5), JSON casts (invalid syntax on MariaDB), and any server-side string aggregation that would be truncated at `group_concat_max_len`. Introspection also parses string-encoded `json_arrayagg` payloads returned by some MySQL transports.
- f6b4652: Fix `TypeError: crypto.randomUUID is not a function` when Studio is served over plain HTTP on a non-localhost host (non-secure context, e.g. `http://192.168.x.x:5555`). UUID generation now falls back to a UUIDv4 built from `crypto.getRandomValues` when `crypto.randomUUID` is unavailable.
- 9eeb555: # Show common PostgreSQL type aliases

  Display native PostgreSQL catalog type names by their common SQL aliases (`int8` -> `bigint`, `int4` -> `integer`, `int2` -> `smallint`, `float8` -> `double precision`, `float4` -> `real`, `bool` -> `boolean`, `bpchar` -> `char`) in the table header, filter column picker, and schema visualizer, including array types (`int8[]` -> `bigint[]`).

- 6c9e625: Fix broken horizontal scrolling in wide data tables. The column virtualization window now follows scrolling synchronously and only re-renders the grid when the set of mounted columns changes, so scrolling no longer jumps between columns and the last column is reachable. Focused-cell auto-scroll now runs at most once per focus change, so clicking a cell to edit no longer snaps the viewport back and off-screen focus targets no longer fight user scrolling. Also corrects the virtualization window offset when columns are pinned.
- cb4f6d5: # Fix SQLite date-like column edits producing NaN

  SQLite columns declared as `date`, `datetime`, or `timestamp` get NUMERIC affinity, so Studio treated their date-string values as numbers and coerced edits to `NaN`. Date-like declared types are now edited as text and stored as-is, and numeric cell edits, pastes, and filters only coerce input to a number when it actually parses as one — non-numeric text is kept as text, matching SQLite's NUMERIC-affinity semantics, so `NaN` is never written.

- 3fec72a: Fix saving staged cell edits silently failing for rows loaded beyond the first batch when infinite scroll is enabled. Row update, delete, and insert mutations now target the same rows-collection scope the grid displays instead of the paginated first page.
- 099b7da: Allow UUID v6–v8 values in column filters.

## 0.33.0

### Minor Changes

- c341072: # Fix duplicate startup introspection requests

  Avoid cancelling and repeating introspection requests when Studio initially mounts.

## 0.32.0

### Minor Changes

- ed30e6e: Add a Prisma Next Migrations view. When the connected database carries a Prisma Next migration ledger (`prisma_contract.ledger`) with at least one applied migration, Studio shows a Migrations navigation item with a newest-first timeline of every applied migration — name, apply time, operation count, destructive-change markers, and compact `+`/`−`/`~` chips summarizing what each migration changed.

  Selecting a migration renders a visual, FigJam-style diff canvas built from the contract snapshots Prisma Next records alongside the ledger: added, removed, and changed models as color-coded cards with per-field before → after details (type, nullability, defaults, primary keys), enum cards, and relation edges. An All models toggle expands to the migration's full schema, switching migrations morphs the canvas over ~500ms instead of rebuilding it, and the selected migration is URL-addressable.

  Collapsible detail panels behind a drag-resizable split show the executed SQL per operation and a Prisma-schema-style line diff of the before/after schema, with long unchanged runs collapsed into click-to-expand folds.

  Databases whose ledger predates contract snapshots keep the timeline and SQL panel and show an update notice in place of the canvas. Requires a database migrated with a Prisma Next version that records contract snapshots for the visual and schema diffs.

## 0.31.2

### Patch Changes

- ff11835: Fix PostgreSQL text array cell edits when queries are compiled with inline values.

## 0.31.1

### Patch Changes

- e1583e5: Improve observability stream previews with concise evlog request summaries and otel span summaries.

## 0.31.0

### Minor Changes

- a241cd8: Add stream request observability

## 0.30.0

### Minor Changes

- 9d45420: Add Query Details copy actions

## 0.29.0

### Minor Changes

- f05f7b9: Fix schema-aware SQL execution, linting, and Studio navigation so SQL queries and diagnostics resolve unqualified identifiers against the selected schema instead of always relying on the adapter default schema.

## 0.28.0

### Minor Changes

- 0e1cd4e: Expand Prisma Streams support across Studio with a dedicated stream browser, live stream aggregations, stream diagnostics, routing-key browsing, WAL history handoff from tables, and a more flexible demo/runtime setup for local and external Streams servers.
- 15e6e11: Add an optional Studio Queries view backed by query-insights snapshots from the Studio BFF bridge.
  Render SQL result visualizations with Studio-owned Bklit chart configs instead of Chart.js configs.

## Upcoming

### Patch Changes

- Keep the latest sort or filter change authoritative by aborting superseded table reads and ignoring older async URL writes, so slow earlier queries can no longer overwrite the visible rows.
- Keep wide text and JSON columns capped to the grid's existing max width, so oversized cell values clip with an ellipsis instead of blowing the table open.
- Fix staged PostgreSQL enum-array edits, so saving a changed `enum[]` cell writes successfully instead of failing on an invalid quoted cast type.
- Keep PostgreSQL `date` and `timestamp` cells aligned with the stored values by normalizing `postgres.js` results before Studio renders them, so host-local timezones no longer shift table timestamps.
- Let `Cmd/Ctrl+C` fall back to the focused grid cell when nothing is selected, so spreadsheet-style keyboard navigation still supports immediate copy.
- Simplify the Compute demo bundling path around `@prisma/dev@0.22.3`, so the deploy build no longer manually copies PGlite runtime assets and plain Bun server bundles no longer need `--packages external`.
- Auto-arrange the schema visualizer with ELK, space disconnected tables cleanly, and add a `Reset layout` action while keeping dragged node positions when you leave and return.
- Add optional Prisma Streams setup support, wire the `ppg-dev` demo to Prisma Dev's Streams server, and show live stream names in a new sidebar `Streams` section.
- Add a dedicated stream event view with infinite scrolling, expandable rows, and summary columns for time, key, indexed fields, preview text, and payload size.
- Keep stream event counts live while a stream is open, and reveal newly arrived events in 50-row batches without snapping the current list.
- Work around the current `@prisma/dev` Compute asset-resolution gap by copying stable PGlite runtime filenames into the deploy bundle and bundling the Prisma Streams local worker, so the packaged demo can boot correctly on Compute with WAL syncing still enabled.
- Add automatic Compute preview deploys for pull requests, so branch builds land in the `studio-preview` project, comment their live URL on the PR, and clean themselves up when the branch is deleted.

## 0.27.3

### Patch Changes

- Keep AI-generated SQL staged in the editor instead of auto-running it, and focus the SQL editor so `Cmd/Ctrl+Enter` or `Run SQL` stays the explicit execution step.

## 0.27.2

### Patch Changes

- Remove the temporary `aiFilter` and `aiGenerateSql` compatibility path, so `llm({ task, prompt })` is the only supported Studio AI integration hook.

## 0.27.1

### Patch Changes

- Collapse Studio AI integration to one optional `llm({ task, prompt })` hook, so table filtering, SQL generation, and SQL result visualization all reuse the same embedder transport and typed error contract.

## 0.27.0

### Patch Changes

- Add AI SQL result visualization with a right-aligned `Visualize data with AI` summary action, automatic chart generation for AI-written queries when the model says the result is worth graphing, original AI-request context passed into chart generation, a centered/clamped in-grid chart band, and clearer retry handling when the provider hits its output token limit.
- Keep `Generate SQL with AI` request history in local TanStack storage, and let an empty focused AI prompt browse older requests with `ArrowUp` / `ArrowDown` as placeholder previews before committing one back into the input.

## 0.26.0

### Patch Changes

- Add optional AI SQL generation in the SQL view, now with concrete database-engine prompt context, immediate execution of the generated query, and up-to-two AI correction retries when the database returns an execution error.

## 0.25.2

### Patch Changes

- Keep the local Anthropic AI-filter demo out of server logs by avoiding API-key and prompt logging.
- Honor Prisma's `CHECKPOINT_DISABLE=1` telemetry opt-out so embedded Studio can suppress checkpoint usage-data requests.
- Add live theme controls to the `Cmd/Ctrl+K` palette, including a `Match system theme` toggle that follows the real system color scheme, inline `Light`/`Dark` overrides, keyboard-selectable appearance rows, pre-paint theme syncing plus view-transition smoothing to avoid flicker, and dark-mode fixes that recolor Studio surfaces while keeping confirmation dialogs, toolbar buttons, filter pills, staged-edit cells, visualizer nodes, grid content, pagination text, and the Prisma navigation logo readable.
- Keep command-palette theme toggles working in Chrome, so `Match system theme` can be turned off again by mouse or keyboard without dismissing the palette.

## 0.25.1

### Patch Changes

- Polish the `Cmd/Ctrl+K` command palette spacing and standardize its ShadCN command shell, and switch the table `copy as` export menu to standard ShadCN menu primitives with a proper checkbox toggle.

## 0.25.0

### Patch Changes

- Add inferred reverse relation columns for inbound foreign keys, so parent tables can jump straight into filtered related rows without manually rebuilding the reverse lookup.
- Tighten the table footer into a single pagination control group with an editable page field, a preset rows-per-page dropdown, and a shared infinite-scroll mode that always loads in fixed 25-row chunks, fills the viewport, and appends new rows without jumping back to the top.
- Keep the sticky top-left selector header above the scrolling selector column, so the empty corner cell stays visible while the grid moves.

## 0.24.0

### Patch Changes

- Wrap long SQL editor lines inside the SQL view instead of letting the query input stretch past the viewport width.

## 0.23.0

### Patch Changes

- Stage edits across multiple cells and rows, add spreadsheet-style focused-cell navigation with arrow keys, `Enter`, and `Shift`-selection, keep staged and inserted cells anchored with visible focus/highlight treatment, and confirm or lock batch write flows until the user saves or discards.

## 0.22.3

### Patch Changes

- Add a `copy as` toolbar menu for selected rows and cells, with Markdown/CSV copy and save actions plus optional column headers.

## 0.22.2

### Patch Changes

- Keep Studio usable when startup introspection fails by showing retryable diagnostics, preserving the last successful schema snapshot on refresh errors, and falling back to `UTC` when non-critical timezone metadata cannot be read.
- Add a counted delete confirmation dialog for selected table rows, so destructive row deletes are explicit before they run.

## 0.22.1

### Patch Changes

- Keep the `Cmd/Ctrl+K` palette scrolled to the active keyboard selection, so moving into lower results no longer highlights hidden commands.

## 0.22.0

### Patch Changes

- Add a compact `Cmd/Ctrl+K` command palette with context-aware table actions, top-3 table navigation, a `x more...` handoff into the existing sidebar table search, centered popup styling for embedded Studio, immediate arrow-key navigation on open, and two-mode `Search rows` / `Filter with AI` commands that either focus the toolbar inputs or execute typed payloads directly.
- Keep the original AI filter request attached to generated filter pills, showing it on hover in a green info bubble while preserving the existing yellow warning bubble for invalid filters.
- Animate pinned and drag-reordered columns into their new positions so table layout changes clearly slide instead of abruptly jumping.
- Improve grid column resizing by centering the resize handle on the real header boundary, widening the hit target, capping default widths at 400px, and clipping overflowing header/cell content when columns are narrowed.
- Keep pagination controls visible while loading another page of the same result set instead of letting the footer disappear during the fetch.
- Let the existing sidebar table-name filter support `ArrowUp` / `ArrowDown` and `Enter`, close itself on selection, and hand focus to the next table grid so filtered table browsing stays fully keyboard-driven.

## 0.21.1

### Patch Changes

- Remove the built-in Studio fullscreen header button, and keep fullscreen as a demo-owned browser control instead of package-level chrome.
- Validate saved SQL filter pills in the background with the shared SQL-lint transport, turning broken `WHERE` clauses into yellow warning pills with the lint error while leaving the already-applied URL filter untouched.

## 0.21.0

### Patch Changes

- Add optional AI-assisted table filtering so embedders can translate natural-language requests into the same inline, URL-shareable filters used by manual filtering, with type-aware operator rules, one-shot correction retries, and yellow warning pills for filters that are still syntactically invalid.
- Hide the AI filter affordance unless Studio is actually configured with an `aiFilter` hook, and let the local demo disable Anthropic-backed AI filtering explicitly through `STUDIO_DEMO_AI_FILTERING_ENABLED`.
- Add advanced inline SQL filter pills that accept raw `WHERE` clause fragments, keep them URL-shareable like normal filters, and let AI filtering fall back to SQL only when predefined operators cannot express the request.
- Keep inline filter pills synced with the URL when switching between tables, so returning to a table does not resurrect stale filters that are no longer applied.

## 0.20.1

### Patch Changes

- Keep the SQL editor responsive after large result sets by isolating the result grid from editor typing, so follow-up query edits do not freeze the view.
- Keep inline filter pills visually stable inside embedded hosts by explicitly resetting pill control sizing, font metrics, and button/input appearance.

## 0.20.0

### Patch Changes

- Filter tables faster with a simple column picker and fixed inline filter pills that stay visible above the grid, discard unused drafts cleanly, and keep URL-shareable filters intact.

## 0.19.3

### Patch Changes

- Keep SQL drafts stable across navigation by restoring from persisted local storage state and avoiding default-query overwrites, and simplify SQL execution controls with a single Run/Cancel toggle button.

## 0.19.2

### Patch Changes

- Fix PostgreSQL SQL-lint fallback compatibility by using plain `EXPLAIN` output, avoiding object-shaped payloads that some BFF executors reject.

## 0.19.1

### Patch Changes

- Bring SQL editor linting to MySQL and SQLite with inline diagnostics, while keeping dialect-aware highlighting and schema autocomplete across all supported SQL engines.

## 0.19.0

### Patch Changes

- Upgrade SQL authoring with a CodeMirror-based editor that adds dialect-aware highlighting and live schema autocomplete.
- Add inline PostgreSQL SQL lint diagnostics over the existing authenticated BFF channel, with strict guardrails for single-statement parse/plan validation.
- Run SQL quickly with `Cmd/Ctrl+Enter`, including statement-at-cursor execution for multi-statement scripts.

## 0.18.0

### Patch Changes

- Improve wide-table responsiveness with center-column virtualization and lower main-thread render work during pagination and interaction.
- Default table sorting to primary key ascending when the active table has a primary key.
- Persist pinned columns in URL state via `pin=...`, including pinned-column order.
- Replace header dropdown actions with inline pin/sort controls that stay visible when active and appear on hover when inactive.
- Fix pinned-column rendering edge cases with virtualization and sticky layering.
- Stabilize pinned-column drag reorder so URL/state updates are reliable and cross-zone drags do not shift non-dragged headers.
- Improve column resize usability by realigning and widening the resize hit target at the header boundary.

## 0.17.0

### Patch Changes

- Navigate large schemas faster with inline sidebar table-name search that updates instantly and supports literal special characters like `_`.
- Search rows in the active table with a dedicated global search that combines text matching with typed matching for booleans, numbers, UUIDs, dates, and times.
- Spot matches quickly in results with yellow in-cell highlights for matching text.
- Keep full-table search safe on large datasets with debounced input, one active search at a time, and a clear 5-second timeout message when scans are too expensive.
- Expand PostgreSQL row search coverage to built-in type families beyond plain text, including JSONB and array-backed data via text-rendered fallback matching.
- Hide row-search controls automatically when connected to a database adapter that does not support full-table row search.

## 0.16.3

### Patch Changes

- add a supported `bun build` flow for the `demo:ppg` server via `pnpm demo:ppg:build`/`pnpm demo:ppg:bundle`, externalizing package imports so Prisma Dev can load PGlite runtime assets from `node_modules` in bundled runs
- make demo server project-root resolution resilient for bundled output paths so source watching and CSS entry loading still resolve correctly
- align `engines.node` with Prisma runtime support (`^20.19 || ^22.12 || ^24.0`) so Node 20.19.x CLI consumers can install `@prisma/studio-core`
- add a dedicated SQL view with raw query execution, cancel support, result rendering, and session query history replay

## 0.16.2

### Minor Changes

- migrate Studio’s active-table data flow and shared table UI state to TanStack DB collections, replacing ad-hoc React Query cache patching and local hook state for filtering, sorting, selection, staged rows, and shared Studio UI preferences

### Patch Changes

- enforce numeric SQL ordering semantics for numeric columns in PostgreSQL select queries
- reset pagination to the first page when table sorting changes
- serialize sort/page URL writes so sort changes are not dropped on non-zero pages
- preserve adapter row order in grid rendering so URL-driven sorting is reflected in visible row order
- prevent UI-state cleanup crashes when ephemeral keys have already been removed
- clarify timestamp/time editing context by labeling picker inputs with the local UTC offset
- clear stale multi-cell selection highlights when clicking outside the selected range
- prevent column-header text stretch/shrink artifacts during drag reordering
- fix bottom pagination bar clipping so the page input remains fully visible

## 0.16.1

### Patch Changes

- fix table-switch selection regressions so column mapping rehydrates per schema and FK/reference columns (and columns to their right) remain selectable and included in copied row output
- harden context-menu copy semantics by honoring explicit empty-string `copyText`, preventing duplicate clipboard writes from chained events, and centralizing grid interaction suppression checks used by grid selection and cell editing

## 0.16.0

### Patch Changes

- elevate Studio grid editing with spreadsheet-like interactions: rectangular multi-cell selection, drag-to-expand ranges, bulk copy/paste across cells and rows, and row selection mode from the spacer column (drag, shift-toggle, right-click, and top-left select-all toggle)
- improve reliability and polish of selection/edit workflows by restoring clean text-vs-cell selection transitions, preserving click-to-edit behavior, preventing context-menu copy click-through side effects, and keeping pinned spacer cells visually correct while horizontally scrolling

## 0.15.0

### Minor Changes

- Moved to a different repo. No longer differentiates between OSS and licensed. No longer supports Accelerate.

## 0.13.1

### Patch Changes

- fix introspection errors in vitess

## 0.13.0

### Minor Changes

- enable mysql in accelerate.

## 0.12.0

### Minor Changes

- show parameters in console
- sql.js executor

### Patch Changes

- apply transformations in sqlite writes.
- sqlite nullable was flipped. also no handling of INTEGER PRIMARY KEY being non-nullable implicitly.

## 0.11.2

### Patch Changes

- sqlite auto-increment introspection

## 0.11.1

### Patch Changes

- sqlite default value introspection
- mysql default value introspection.

## 0.11.0

### Minor Changes

- lots of improvements to inputs, cells, defaults, etc.
- (postgres) column default value introspection

### Patch Changes

- implement postgres autoincrement introspection

## 0.10.0

### Minor Changes

- proper handling of composite primary keyss

## 0.9.0

### Minor Changes

- core is now properly documented with updated licensing and README.

## 0.8.2

### Patch Changes

- sort tables alphabetically in nav

## 0.8.1

### Patch Changes

- fix select query conflicts

## 0.8.0

### Minor Changes

- mysql support

## 0.7.0

### Minor Changes

- sqlite support

## 0.6.0

### Minor Changes

- removed ctid as it was breaking reading from views

## 0.5.3

### Patch Changes

- remove @prisma/client from peer deps.

## 0.5.2

### Patch Changes

- fix SSR full page refresh failures.

## 0.5.1

### Patch Changes

- tracking.. shh!
- Fix padding on icon buttons

## 0.5.0

### Minor Changes

- add postgresjs executor

### Patch Changes

- fix issues with enums and uuids

## 0.4.0

### Minor Changes

- Adds createPrismaPostgresHttpClient wrapper

## 0.3.4

### Patch Changes

- Fix svg bundling

## 0.3.3

### Patch Changes

- Fix bumping

## 0.3.2

### Patch Changes

- Include license file

## 0.3.1

### Patch Changes

- Fix empty publish

## 0.3.0

### Minor Changes

- remove inferRowFilter from public API.

### Patch Changes

- fix inserts failing for special data types.
- Reload schema on refresh
- fix no floaters when in fullscreen mode

## 0.2.6

### Patch Changes

- Remove inclusion in JS

## 0.2.5

### Patch Changes

- Fix CSS

## 0.2.4

### Patch Changes

- Fix uuid filters
- Upgrade to Tailwind 4
- Fix CSS

## 0.2.3

### Patch Changes

- Cell validations have been added
- Added darkmode support, major improvements to overall theming

## 0.2.2

### Patch Changes

- filtering by enum was not working

## 0.2.1

### Patch Changes

- build issue with esbuild+reactflow and require('react')

## 0.2.0

### Minor Changes

- Bump for console

## 0.1.0

### Minor Changes

- accelerate http client is now an executor. added abort signal supports to adapters and executors.
- pglite adapter and executor
