# UI State Architecture

This document is normative for Studio UI state.

All shared UI state MUST be stored in TanStack DB collections and read through live queries. Developers are not allowed to introduce alternate state architecture for shared UI behavior.

## Non-Negotiable Rules

- Shared UI state MUST live in TanStack DB collections (not ad-hoc component state).
- Shared UI state MUST be read via `useLiveQuery` (directly or through approved hooks like `useUiState` / `useTableUiState`).
- Shared UI state updates MUST go through collection operations (`insert`, `update`, `delete`).
- Shared UI state keys MUST be deterministic and scoped (for example `schema.table`, `datagrid:${scope}:...`).
- Components MUST NOT duplicate the same shared state in local React state.
- High-frequency transient input state (for example raw text while typing) MUST stay in local component state and only synchronize to shared state on debounce or explicit action.
- New shared UI state features MUST be added to the existing Studio collections or a new TanStack DB collection in Studio context.
- New collection creation paths MUST be instrumented with TanStack DB mutation guardrails documented in [`Architecture/tanstack-db-performance.md`](tanstack-db-performance.md).

## Canonical UI State Stores

Studio context provides the canonical stores in [`ui/studio/context.tsx`](../ui/studio/context.tsx):

- `studioUiCollection` (`localStorageCollectionOptions`)
  - Persisted user-level UI preferences:
  - `isNavigationOpen`
  - `themeMode` (`light` | `dark` | `system`)
  - `isDarkMode` (resolved effective theme for the current render)
  - `tablePageSize`
  - `isInfiniteScrollEnabled`
- `operationEventsCollection` (`localOnlyCollectionOptions`)
  - Console operation event history used by UI.
- `tableUiStateCollection` (`localOnlyCollectionOptions`)
  - Per-table UI state keyed by `${schema}.${table}`:
  - `editingFilter`
  - `rowSelectionState`
  - `stagedRows`
  - `stagedUpdates`
- `tableQueryMetaCollection` (`localOnlyCollectionOptions`)
  - Per-table metadata used by UI:
  - `filteredRowCount`
- `uiLocalStateCollection` (`localOnlyCollectionOptions`)
  - General scoped UI state (for example DataGrid selection machine state).
- `sqlEditorStateCollection` (`localStorageCollectionOptions`)
  - Persisted SQL editor draft state:
  - `queryText`
  - Persisted AI SQL prompt history:
  - `aiPromptHistory`
- `navigationTableNamesCollection` (`localOnlyCollectionOptions`)
  - Introspection-derived `{schema, table, qualifiedName}` rows used by navigation table filtering.

These collections are the architecture boundary. Do not bypass them.

## Approved Read/Write Patterns

### Pattern A: Generic scoped state with `useUiState`

Use [`ui/hooks/use-ui-state.ts`](../ui/hooks/use-ui-state.ts) for scoped UI values (selection state, popover state, etc.).

```ts
const [selectionState, setSelectionState] =
  useUiState<GridSelectionMachineState>(
    `datagrid:${gridScope}:selection-state`,
    GRID_SELECTION_MACHINE_INITIAL_STATE,
  );

setSelectionState((previous) =>
  transitionGridSelectionMachine(previous, { type: "escape" }),
);
```

Why this is required:

- Reads are reactive (`useLiveQuery` under the hood).
- Writes are centralized in the shared collection.
- State is scoped and stable.

### Pattern B: Table-scoped state with `useTableUiState`

Use [`ui/hooks/use-table-ui-state.ts`](../ui/hooks/use-table-ui-state.ts) for per-table UI state.

```ts
const { tableUiState, updateTableUiState } = useTableUiState();

updateTableUiState((draft) => {
  draft.rowSelectionState = {};
  draft.editingFilter = createDefaultFilter();
});
```

Why this is required:

- One source of truth per table.
- No drift between views/components touching the same table UI state.

### Pattern C: Direct collection live query (Studio-level)

When reading Studio-level state in provider or core glue code, use direct live query:

```ts
const { data: studioUiRows = [] } = useLiveQuery(studioUiCollection);
const studioUiState =
  studioUiRows.find((item) => item.id === STUDIO_UI_STATE_ID) ??
  getDefaultStudioUiState();
```

## Concrete UI State Examples

The following are valid examples of UI state and where they belong:

- Navigation open/closed: `studioUiCollection.isNavigationOpen`
- Theme preference: `studioUiCollection.themeMode`
- Effective dark-mode flag for rendering: `studioUiCollection.isDarkMode`
- Shared table rows-per-page preference: `studioUiCollection.tablePageSize`
- Shared table infinite-scroll preference: `studioUiCollection.isInfiniteScrollEnabled`
- Active table row selection: `tableUiStateCollection.rowSelectionState`
- Staged insert rows: `tableUiStateCollection.stagedRows`
- Staged existing-row updates: `tableUiStateCollection.stagedUpdates`
- Filter draft tree for active table: `tableUiStateCollection.editingFilter`
- Filtered row count metadata: `tableQueryMetaCollection.filteredRowCount`
- Stream-scoped expanded event row id (for example `stream:prisma-wal:expanded-event`): `uiLocalStateCollection` via `useUiState`
- Command palette open/closed state: `uiLocalStateCollection` via `useUiState`
- DataGrid selection mode (`none`/`cell`/`row`): `uiLocalStateCollection` via `useUiState`
- DataGrid focused cell (`{ rowIndex, columnId } | null`): `uiLocalStateCollection` via `useUiState`
- SQL editor draft query text: `sqlEditorStateCollection.queryText`
  - Debounced synchronization is allowed, but unmount paths MUST flush pending
    draft writes before component teardown.
- AI SQL prompt history: `sqlEditorStateCollection.aiPromptHistory`
  - Prompt-history browsing MAY use local transient preview state while the
    actual persisted history list remains in the collection as the source of truth.
- Navigation table-name search term/open state: `uiLocalStateCollection` via `useUiState`
- Navigation table-selection grid-focus request: `uiLocalStateCollection` via `useUiState`
- Navigation table-name source rows: `navigationTableNamesCollection`
- Schema visualizer node positions and layout state: `uiLocalStateCollection` via `useUiState`
  - Scoped by active schema plus the current visualized table set so returning to the same schema graph restores dragged positions without leaking across schemas.
  - Includes the stored ELK baseline positions and reset-layout request token used by the header action.
- Command-palette `x more...` handoff into table browsing: the same navigation table-name search `useUiState` entry, not a second command-palette-specific table-filter store

If new UI state is shared across components, it MUST be assigned to one of these stores (or a new TanStack DB collection added in Studio context).
Container-level fullscreen controls are now host-owned rather than Studio-owned, so they MUST NOT be reintroduced as implicit package-level shared UI state unless the architecture is updated first.
Command-palette action registrations are the one allowed React-context exception because they carry live callback references; only the visible palette UI state belongs in TanStack DB.

## Theme State Rules

- `themeMode` is the persisted source of truth for Studio appearance and MUST be one of `light`, `dark`, or `system`.
- `isDarkMode` is a derived compatibility field that reflects the resolved theme currently applied to Studio surfaces.
- `system` mode MUST resolve from `window.matchMedia("(prefers-color-scheme: dark)")` when available, with `document.documentElement.classList.contains("dark")` only as a compatibility fallback when media queries are unavailable.
- System-theme observation MUST only write back into Studio state while `themeMode === "system"`.
- Explicit user-triggered theme changes SHOULD use `document.startViewTransition` when available, with direct synchronous updates as the fallback, so Studio does not flash partially updated theme tokens during appearance switches.
- Explicit `light` or `dark` choices MUST remain stable even if the embedding host mutates `document.documentElement.classList`.
- Legacy persisted rows that only contain `isDarkMode` MUST normalize into explicit `themeMode` values during load so existing installs keep their preference.

## Why This Architecture Is Better

- Single source of truth: eliminates conflicting duplicated state.
- Reactive reads: UI updates automatically when collection rows change.
- Predictable behavior across components: no manual synchronization glue.
- Scope-safe: keyed state prevents table/view cross-talk.
- Testability: state logic can be unit-tested independent of browser behavior.
- Fewer regressions: explicit collection boundaries prevent hidden local-state drift.

## Forbidden Patterns

- Using local `useState` as the source of truth for shared UI state.
- Mirroring shared collection state into another independent local state copy.
- Reading shared UI state from props while writing it elsewhere.
- Creating unscoped keys that can collide across tables/views.
- Bypassing approved hooks and mutating UI behavior through global mutable variables.

## Compliance Requirement

Any PR that introduces or changes shared UI state MUST:

- Use TanStack DB collections as the source of truth.
- Read state through live queries (`useLiveQuery` or approved wrappers).
- Keep keys scoped and deterministic.
- Add/adjust tests when state behavior changes.

Deviations are architecture violations and must be rejected in review.
