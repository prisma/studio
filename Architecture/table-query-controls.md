# Table Query Controls Architecture

This document is normative for table control state (filtering, sorting, pagination, row selection, staged rows, and staged cell updates).

Table control state MUST be split exactly as defined here: URL state for applied query controls, table-scoped TanStack DB state for editing and selection workflows.

## Scope

This architecture governs:

- applied filtering
- applied row-search term
- navigation table-name search
- filter editing draft
- sorting
- column-header pin/sort controls
- pagination
- row selection state
- selection export controls
- staged insert rows

## Canonical Components

- [`ui/hooks/use-filtering.ts`](../ui/hooks/use-filtering.ts)
- [`ui/hooks/ai-filtering.ts`](../ui/hooks/ai-filtering.ts)
- [`ui/hooks/use-sorting.ts`](../ui/hooks/use-sorting.ts)
- [`ui/hooks/use-pagination.ts`](../ui/hooks/use-pagination.ts)
- [`ui/hooks/use-selection.ts`](../ui/hooks/use-selection.ts)
- [`ui/hooks/use-table-ui-state.ts`](../ui/hooks/use-table-ui-state.ts)
- [`ui/hooks/use-navigation-table-list.ts`](../ui/hooks/use-navigation-table-list.ts)
- [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx)
- [`ui/studio/views/table/ActiveTableView.tsx`](../ui/studio/views/table/ActiveTableView.tsx)
- [`ui/studio/grid/DataGridHeader.tsx`](../ui/studio/grid/DataGridHeader.tsx)

## State Partitioning Rules

- Applied query controls MUST be URL-backed:
  - `filterParam`
  - `searchParam`
  - `sortParam`
  - `pageIndexParam`
  - `pageSizeParam`
- Per-table editing/selection workflows MUST be stored in `tableUiStateCollection` keyed by `${schema}.${table}`:
  - `editingFilter`
  - `rowSelectionState`
  - `stagedRows`
  - `stagedUpdates`

Do not mix these responsibilities.

## Filtering Contract

Filtering has two states:

- `appliedFilter`: from URL `filterParam` (query-driving state)
- `editingFilter`: table-scoped draft in `tableUiStateCollection`

Rules:

- Opening filter UI works on `editingFilter`.
- `Studio` MAY receive one optional async `llm({ task, prompt }) => Promise<{ ok: true, text } | { ok: false, code, message }>` hook for all AI features, and table filtering MUST use that shared transport with task `table-filter`.
- When `llm` is not configured, the toolbar MUST render only the compact manual filter trigger with no AI prompt shell.
- The primary table-filter authoring flow MUST be an inline pill row rendered above the grid column headers and outside the scrollable table element.
- When `llm` is configured, the toolbar filter control MUST render as a split control with the existing manual-filter trigger on the left and an inline AI prompt field on the right.
- The AI prompt field MUST expand to consume available toolbar space while focused or populated, and pressing `Enter` MUST invoke the configured `llm` hook through Studio's `table-filter` task wrapper.
- Selecting a column from the toolbar filter button MUST append a new draft pill with that column selected, an unset operator, and an empty value.
- The toolbar filter picker MUST also offer a `SQL WHERE clause` option that appends a draft `SqlFilter` pill.
- AI prompt construction MUST include the active table name, all live columns and readable datatype names, the allowed operators for the table, the current date/time context, and a strict JSON response contract.
- Filter authoring MUST use a shared operator-compatibility matrix so manual dropdowns, AI validation, and applied-filter serialization agree on which operators are relevant for each column type.
- AI prompt construction MUST explicitly state that `is` and `is not` are null-check operators only and MUST use value `null`.
- AI prompt construction MUST also include per-column supported operators plus syntax rules for ordered comparisons, text search, UUID values, JSON values, and array equality values.
- AI prompt construction MUST allow `{"kind":"sql","sql":"..."}` items and MUST explicitly instruct the model to use SQL only as a fallback when the request cannot be fully expressed with predefined column filters.
- AI responses MUST be validated against the live column metadata, allowed operators, and shared filter-syntax rules before they are converted into `editingFilter` nodes.
- AI responses that fail syntax validation MUST trigger at most one correction retry that includes the original user request, the previous AI response, and the validation issues that need to be fixed.
- AI-generated filters MUST flow through `setEditingFilter` and `applyEditingFilter`, so the resulting inline pills and `filterParam` URL state stay consistent with manually authored filters.
- AI-generated filters MUST retain the originating user request as local pill metadata so the inline pill can show a green hover explanation of what the model was asked to do.
- Applied filter trees MAY contain `ColumnFilter`, `FilterGroup`, and `SqlFilter` nodes. `SqlFilter.sql` is a single adapter-native `WHERE` clause fragment and MUST be normalized consistently before execution.
- Applying a draft pill via `Enter` or the inline check action MUST serialize only complete filters into `filterParam`.
- SQL filter pills MUST use the same draft/apply/dismiss semantics as column pills. Empty SQL drafts or SQL fragments with embedded semicolons are syntactically invalid and MUST stay out of the URL-backed applied filter until corrected.
- Saved SQL filter pills MUST also run the adapter SQL-lint transport asynchronously against a full `SELECT ... WHERE ...` statement that wraps the clause fragment, using the same schema-versioned lint surface as the SQL editor.
- Async SQL lint MUST NOT block the initial filter apply. Studio MAY briefly apply the SQL filter while lint is in flight.
- When async SQL lint reports a diagnostic or transport error, the SQL pill MUST become a yellow warning pill with the lint message, but that warning MUST remain advisory and MUST NOT rewrite the already-applied URL filter state.
- Saved pills with syntax issues MUST remain visible in `editingFilter`, render with a yellow warning outline plus hover explanation, and be excluded from the URL-backed applied filter until corrected.
- Non-warning AI-generated pills MUST show their originating request in a green hover tooltip. If an AI-generated pill is also invalid, the yellow warning tooltip remains primary and SHOULD include the original AI request as secondary context.
- Dismissing a brand-new draft pill via `Escape` or click-away MUST remove that pill from `editingFilter` and resynchronize the applied URL filter.
- Dismissing an existing pill via `Escape` or click-away MUST close editing and resynchronize the applied URL filter with that pill's current edits.
- The inline pill row MUST remain fixed while the data grid scrolls and MUST wrap onto additional lines when horizontal space is limited.
- Inline filter pill controls MUST explicitly define their sizing, font, and base control reset styles so embedded host button/input CSS does not distort pill layout.
- When there are staged rows or staged updates, filter authoring controls MUST lock in place instead of mutating the visible result set. Pointer or keyboard attempts to use those locked controls SHOULD route feedback into the staged-edit discard affordance instead of failing silently.
- Incomplete draft pills MUST remain in `editingFilter` and MUST NOT be written into the URL-applied filter.
- Removing a pill MUST update `editingFilter` and then resynchronize the applied URL filter.
- `editingFilter` MUST be resynchronized when applied URL filter changes externally or when the active table scope changes.
- Non-URL editing metadata such as AI-origin requests MUST be rehydrated by filter id when `editingFilter` is resynchronized from the applied URL filter.
- Invalid `filterParam` JSON MUST fall back to `defaultFilter`.

## Row Search Contract

- Row search state is URL-backed:
  - `searchParam` (search term)
- Active table row-search filtering is always applied from `searchParam`.
- Changing row-search term MUST reset `pageIndex` to `0`.
- Raw input typing state MUST remain local to the row-search control and synchronize to `searchParam` on debounce.
- Row-search control visibility MUST follow adapter capabilities (`adapter.capabilities.fullTableSearch`).
- Row-search UI is contextual:
  - hidden by default behind a search icon button
  - expands to an inline input on open and collapses on `Escape`
  - collapses on blur only when input is empty
- When staged rows or staged updates exist, the row-search control MUST stay closed and MUST block new search edits until the user saves or discards those staged edits.
- Command-palette row-search actions MUST reuse that same inline control:
  - selecting plain `Search rows` focuses the existing toolbar search input
  - selecting `Search rows: <query>` injects the payload into that input and applies the URL-backed search term
- Row-search SQL generation MUST be delegated to full-table-search architecture for the current SQL adapter, not assembled as ad-hoc per-column UI filter trees.
  - Canonical doc: [`Architecture/full-table-search.md`](full-table-search.md)

## Navigation Table Search Contract

- Table-name search state MUST be stored in TanStack DB local UI state (`uiLocalStateCollection` via `useUiState`).
- Introspection table names MUST be normalized into a local TanStack DB collection.
- Navigation filtering MUST run through a TanStack DB live query (`useLiveQuery` with query `where` clauses), not ad-hoc array `.filter(...)` in the component.
- Table-name search UI is contextual in the sidebar Tables header:
  - search icon appears on hover/focus of the tables block
  - input expands inline from the right on open and closes on `Escape`
  - blur closes only when input is empty
  - `ArrowUp` / `ArrowDown` move through the filtered table results, and `Enter` navigates to the highlighted table
- Selecting a table from that filtered sidebar list, whether by `Enter` or mouse click, MUST close the table-search UI and request focus for the active table grid so keyboard scrolling can continue immediately.
- The command-palette `x more...` table action MUST reuse that same sidebar table-search state and input instead of introducing a second palette-local table-filter mode.

## Sorting Contract

- Sorting is serialized in URL as `column:direction,column:direction`.
- Parsing MUST validate `direction` as `asc | desc`.
- Invalid sort tokens MUST be ignored.
- Empty sort MUST serialize to `null` URL value.
- When staged rows or staged updates exist, sort controls MUST refuse changes until the staged edits are resolved.

Do not store sorting in local component state for table views.

Column-header pin/sort control rendering and interaction rules are defined in:

- [`Architecture/column-header.md`](column-header.md)

## Pagination Contract

- `pageIndex` MUST be read from URL params.
- Shared table page-size preference MUST live in `studioUiCollection.tablePageSize`.
- Shared infinite-scroll preference MUST live in `studioUiCollection.isInfiniteScrollEnabled`.
- Updates MUST use TanStack Table-compatible `OnChangeFn<PaginationState>` in `usePagination`.
- `usePagination` MUST expose the URL-backed `pageIndex`, the persisted page-size preference, and the persisted infinite-scroll preference through one hook contract.
- Values written to URL MUST be stringified numbers. `pageSize` MAY still be mirrored into the URL for compatibility, but the persisted Studio preference is authoritative for table rendering.
- The page-number footer input MUST keep raw typing local until blur or `Enter`, then commit a clamped positive integer.
- The rows-per-page footer control MUST be a dropdown trigger button, not a free-form input.
- The rows-per-page dropdown MUST offer exactly these shared preset options: `10`, `25`, `50`, `100`, and `500`.
- Infinite scroll MUST preload before the user reaches the absolute bottom edge, instead of waiting for a near-zero remaining distance.
- Infinite scroll MUST also re-check immediately after enablement and after each append so tall viewports that are still within the preload threshold keep loading until the grid is genuinely scrollable or there are no more rows.
- Infinite-scroll appends MUST preserve the previously rendered rows while the larger query window is fetching, so the grid does not collapse and reset the user's scroll position.
- Infinite scroll MUST query from `pageIndex = 0` and grow the effective `pageSize` window in fixed `25`-row batches as the grid scroll nears the bottom, independent of the paginated rows-per-page preference.
- Infinite-scroll window growth MUST reset to the first chunk whenever the visible row set changes, including table scope, applied filter, row-search term, sort order, or shared page size.
- Filtered row-count metadata MUST be cached independently of `pageIndex`, `pageSize`, and sort order, so pagination controls stay mounted while a different page of the same filtered result set is loading.
- When staged rows or staged updates exist, pagination controls MUST refuse page changes until the staged edits are resolved.

## Row Selection Contract

- Row selection source is `tableUiState.rowSelectionState`.
- `useSelection` is the only hook allowed to orchestrate delete-selection behavior.
- Row selection MUST be cleared when:
  - table scope changes
  - page index changes
  - page size changes
- Delete selection MUST derive selected rows from current `data.rows` and clear selection on success.

Cell/row mode specifics for DataGrid are defined in [`Architecture/selection.md`](selection.md) and must be followed.

## Selection Export Contract

- The active-table toolbar MUST show selection export actions only when there is an active cell-range selection or one or more selected rows.
- Keyboard `Cmd/Ctrl+C` behavior MUST remain owned by `DataGrid`; toolbar export actions are additive and MUST NOT replace or intercept the existing clipboard shortcut flow.
- The selection export menu MUST use standard ShadCN dropdown-menu primitives. The `include column header` toggle MUST be a `DropdownMenuCheckboxItem`, not a hand-built checkbox row.
- Cell-range export MUST derive the selected rectangle from the shared `datagrid:${scope}:selection-state` machine via `getCellSelectionRange(...)`.
- Row export MUST derive the selected rows from `tableUiState.rowSelectionState` / `useSelection`, and MUST preserve the current `data.rows` order rather than reordering by selected row id.
- Export column order MUST follow the current grid layout by reading the shared `datagrid:${scope}:column-order` and `datagrid:${scope}:column-pinning` UI state, excluding the virtual `__ps_select` column.
- Export actions MAY offer additional formats, but the exported data MUST always be derived from the same current-page rows and visible column order that the user is working with in the active grid.

## Relation Navigation Contract

- Direct foreign-key cells MAY render navigation links into the referenced table when the live column metadata includes `fkSchema`, `fkTable`, and `fkColumn`.
- Active table views MUST also infer reverse relation columns by scanning live introspection for inbound foreign keys that point at the active table.
- Those reverse relation columns MUST be view-local virtual columns. They MUST NOT be added to `Table.columns` or flow into query, insert, update, or delete payloads as if they were physical database columns.
- Reverse relation columns MUST only be created for real inbound foreign keys, MUST default to the end of the grid after physical database columns, and MUST still participate in the shared column-order / pinning state so users can rearrange them like other visible columns.
- Reverse relation cells MUST be read-only and MUST navigate to the source table with an equality filter `sourceColumn = currentRow[referencedColumn]`.

## Staged Row And Cell Draft Contract

- `stagedRows` and `stagedUpdates` MUST be stored in `tableUiStateCollection`.
- Insert-row drafting in table view MUST update `stagedRows` via `updateTableUiState`.
- Existing-row cell edits MUST update `stagedUpdates` via `updateTableUiState` instead of persisting immediately.
- The active-table toolbar MUST surface one shared save/discard flow for all staged draft rows and staged existing-row edits.
- The table command palette MUST surface that same shared save/discard flow whenever staged work exists, using the same action labels as the toolbar buttons.
- The save action label MUST count affected rows, not affected cells.
- The save action MUST ask for confirmation before persistence, count affected rows in both the button label and prompt, and keep the primary write action focused first in that dialog.
- The discard action MUST ask for confirmation, count staged cells in its prompt, and provide the primary affordance for abandoning staged work.
- While staged work exists, controls that would change which rows are visible, including filtering, row search, sorting, and pagination, MUST remain locked until save or discard completes.

## Integration Contract For ActiveTableView

`ActiveTableView` MUST compose:

- `useFiltering` for filter state
- `useSorting` for sort state
- `usePagination` for page state
- `useSelection` for row selection state and delete action
- `useTableUiState` for staged rows, staged updates, and filter draft persistence
- table command-palette actions MUST delegate through these same hooks rather than bypassing them with ad-hoc URL writes or duplicate local state
- table command-palette actions MUST delegate through these same hooks rather than bypassing them with ad-hoc URL writes or duplicate local state

Feature code MUST not bypass these hooks with direct URL or collection writes unless the hook itself is being extended.

## Forbidden Patterns

- Duplicating `editingFilter`, `rowSelectionState`, `stagedRows`, or `stagedUpdates` in local `useState`.
- Applying filter changes directly to URL from nested filter components.
- Reintroducing popup-only filter authoring as the primary active-table filtering flow.
- Reading selected rows from DOM state instead of `rowSelectionState`.
- Storing pagination/sorting outside URL params.

## Testing Requirements

Changes MUST add/update tests in:

- [`ui/hooks/use-filtering.test.tsx`](../ui/hooks/use-filtering.test.tsx)
- [`ui/hooks/use-selection.test.tsx`](../ui/hooks/use-selection.test.tsx)
- [`ui/hooks/use-table-ui-state.test.tsx`](../ui/hooks/use-table-ui-state.test.tsx)
- [`ui/hooks/use-navigation-table-list.test.tsx`](../ui/hooks/use-navigation-table-list.test.tsx)
- [`ui/studio/Navigation.test.tsx`](../ui/studio/Navigation.test.tsx)
- [`ui/studio/views/table/ActiveTableView.filtering.test.tsx`](../ui/studio/views/table/ActiveTableView.filtering.test.tsx)

At minimum verify:

- URL <-> applied state transitions
- table-scoped draft persistence
- AI prompt visibility, expansion behavior, prompt contents, retry behavior, and AI-generated filter application
- inline filter-pill creation, operator focus, operator filtering by column type, SQL-pill behavior, Enter-to-apply, async SQL lint warning states, advisory lint failures, and remove behavior
- row selection clearing on page/scope change
- staged row and staged existing-row persistence behavior
- navigation table-name filtering (including special characters)
- contextual open/close behavior of table and row search inputs
