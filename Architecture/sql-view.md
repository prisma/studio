# SQL View Architecture

This document is normative for Studio's SQL workspace (`view=sql`).

The SQL view MUST reuse the shared `DataGrid` renderer used by table view so pinned headers, virtualization, and grid interactions behave consistently.

## Scope

This architecture governs:

- SQL editor and run/cancel controls
- raw SQL execution flow and operation event emission
- SQL result rendering
- capability constraints for SQL-result grid behavior

SQL editor intelligence (CodeMirror, autocomplete, linting) is governed by:

- [`Architecture/sql-editor-intelligence.md`](sql-editor-intelligence.md)

SQL result visualization is governed by:

- [`Architecture/sql-result-visualization.md`](sql-result-visualization.md)

## Canonical Components

- [`ui/studio/views/sql/SqlView.tsx`](../ui/studio/views/sql/SqlView.tsx)
- [`ui/studio/grid/DataGrid.tsx`](../ui/studio/grid/DataGrid.tsx)
- [`ui/studio/grid/DataGridHeader.tsx`](../ui/studio/grid/DataGridHeader.tsx)
- [`ui/studio/grid/DataGridDraggableHeaderCell.tsx`](../ui/studio/grid/DataGridDraggableHeaderCell.tsx)

## Non-Negotiable Rules

- SQL query history MUST NOT be persisted or rendered in SQL view.
- SQL result rows MUST be rendered through shared `DataGrid`, not bespoke table markup.
- Optional AI result visualization charts MUST render inside shared `DataGrid`, above the header row via `getBeforeHeaderRows(...)`, not in a separate scroll container.
- AI-generated SQL MUST NOT execute until the user explicitly runs it.
- After AI SQL generation fills the editor, SQL view MUST focus the editor and place the cursor at the end of the generated statement.
- AI-generated SQL executions MAY carry a per-result visualization intent, and SQL view MUST preserve that intent only for the resulting execution output.
- AI-generated SQL executions MAY also carry the original natural-language request as per-result visualization context, and SQL view MUST preserve that only for the resulting execution output.
- SQL execution controls MUST use a single primary action button that toggles:
  - `Run SQL` when idle
  - `Cancel` while a query is in flight
- SQL result grid MUST be read-only:
  - no cell editing
  - no column sorting
  - no paging controls
- SQL result grid MUST keep column pinning enabled and URL-backed using existing `pin` navigation state.
- SQL execution MUST remain cancellable via `AbortController`.
- SQL editor lines MUST soft-wrap within the available editor width instead of forcing page-level horizontal overflow while typing long queries.
- The SQL editor panel MUST cap its height and scroll internally so a long query cannot push the `Run SQL` control out of view or collapse the result grid.

## Run Confirmation Contract

- Every SQL run trigger (the `Run SQL` button, the `Cmd/Ctrl+Enter` editor
  keybinding, and running AI-generated SQL) MUST go through `executeSql`,
  which classifies the statement with `classifySqlStatement`
  ([`data/sql-statement-risk.ts`](../data/sql-statement-risk.ts)) before
  calling `adapter.raw(...)`.
- `safe` statements MUST run without a dialog.
- `danger` statements (`DELETE`/`UPDATE` without top-level `WHERE`, `DROP`,
  `TRUNCATE`, `ALTER TABLE ... DROP`) MUST always open the destructive
  confirmation, regardless of user settings. Its `cancel` button MUST be
  focused on open.
- `write` and `unknown` statements MUST open the plain confirmation unless the
  persistent `sql:confirm-before-changes` UI state is `false`.
- The plain confirmation's "Don't ask again" checkbox MUST be unticked on open
  and MUST only persist when the run is confirmed; it MUST then show a toast
  explaining how to turn confirmation back on.
- Cancel and Escape MUST run nothing and MUST return focus to the editor.
- Confirmation dialogs MUST use the shared
  [`BinaryAlertDialog`](../ui/studio/BinaryAlertDialog.tsx) (fixed width,
  two equal full-width buttons, the "Don't ask again" checkbox passed as
  `control` above them). Prompts MUST
  describe the effect in plain words without SQL keywords, render table names
  as monospace chips, and put "Studio can't undo this." on a quieter second
  line.
- The classifier MUST stay conservative: comments, string literals and
  parenthesised subqueries MUST NOT affect `WHERE` detection, and anything it
  does not recognise MUST classify as `unknown`, never `safe`.

## Result Rendering Contract

- SQL execution target is cursor-aware:
  - single-statement editor text: execute that statement
  - multi-statement editor text: execute the top-level statement containing the cursor
- SQL execution MUST pass the active URL schema to `adapter.raw(...)` so
  unqualified identifiers resolve against the schema selected in Studio.
- PostgreSQL raw execution MUST apply the active schema through a
  transaction-local `search_path` and MUST NOT leak schema changes across
  requests or connections.
- The grid renders all rows returned by that execution.
- "row(s) returned in Xms" MUST report client-observed request duration from
  the SQL request transport (BFF request timing) when available; it MUST NOT
  include client-side render/layout time.
- The idle AI-visualization affordance MUST render on the same summary row as the `"row(s) returned in Xms"` text, right-aligned from the row-count copy.
- SQL result rows MUST be adapted with a stable synthetic `__ps_rowid` for shared grid row identity.
- Result columns are dynamic and derived from query output keys.
- SQL headers/cells MUST reuse table-view header/cell components (`DataGridHeader`, `getCell`) with synthetic column metadata.
- Any mounted AI visualization chart for SQL results MUST live inside the shared scrollable grid header region, so it scrolls with the same container as the result rows.
- Editing SQL text after a result is mounted MUST NOT force the existing result grid subtree to rerender unless result data or grid state changes.

## State Contract

- Large SQL result payloads MUST stay in component-local React state.
- High-frequency transient input (`textarea` typing) MUST remain local state.
- High-frequency editor input MUST be isolated from mounted SQL result-grid rendering so typing cost does not scale with result size.
- SQL editor draft text MUST be persisted through `sqlEditorStateCollection`
  (`localStorageCollectionOptions`) using key `sql-editor:draft`.
- AI SQL prompt history MUST be persisted through the same `sqlEditorStateCollection`
  using a separate deterministic key, not ad-hoc localStorage writes.
- SQL editor initialization MUST read persisted draft from collection state, and
  MUST fall back to the underlying localStorage snapshot if collection state is
  temporarily unavailable during view mount.
- Default SQL text (`select * from `) is a UI fallback only and MUST NOT be
  persisted unless the user edits the editor value.
- Synchronization from local editor state to persisted draft MUST be debounced.
- SQL view unmount MUST flush pending draft persistence so navigating away and
  back does not lose in-progress query text.
- URL-backed pin state is shared via `useColumnPinning`.

## Forbidden Patterns

- Reintroducing session query history in SQL view.
- Rendering SQL results with a separate table component tree.
- Adding local pagination/sorting mechanics specific to SQL view.

## Testing Requirements

Changes to SQL view MUST include tests for:

- query execution success and cancellation behavior
- query execution with an active non-public schema
- read-only grid rendering (pin control present, sorting controls disabled)
- absence of history UI
- absence of pagination controls in SQL result grid
- run confirmation: safe statements run without a dialog; risky statements do
  not call `adapter.raw(...)` until confirmed from both the button and the
  keyboard path; cancel/Escape never run; the "Don't ask again" setting is
  saved only on confirm
