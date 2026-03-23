# Navigation And URL State Architecture

This document is normative for navigation and URL state in Studio.

Navigation state MUST be URL-driven and managed through `useNavigation` + Nuqs. Do not introduce alternate routing/state systems for Studio views.

## Scope

This architecture governs:

- active Studio view (`table`, `schema`, `console`, `sql`)
- active schema/table
- pagination URL state
- sorting URL state
- column pinning URL state
- applied filter URL state
- hash adapter behavior

## Canonical Components

- [`ui/hooks/use-navigation.tsx`](../ui/hooks/use-navigation.tsx)
- [`ui/studio/NuqsHashAdapter.tsx`](../ui/studio/NuqsHashAdapter.tsx)
- [`ui/hooks/nuqs.ts`](../ui/hooks/nuqs.ts)

## Non-Negotiable Rules

- URL params are the source of truth for navigation state.
- All reads/writes MUST go through `useNavigation` or `createUrl`.
- Hash synchronization MUST go through `NuqsHashAdapter`.
- Components MUST NOT write `window.location.hash` directly.
- Components MUST NOT parse URL params manually.

## Supported URL Keys

Only keys declared in [`ui/hooks/nuqs.ts`](../ui/hooks/nuqs.ts) are allowed:

- `view`
- `schema`
- `table`
- `filter`
- `sort`
- `pin`
- `pageIndex`
- `pageSize`
- `search`
- `searchScope`

Notes:

- `search` is row-search term state for active table view.
- `searchScope` is legacy URL state and is not used for table-name navigation filtering.
- `pin` stores left-pinned data columns for the grid as a comma-separated list (for example `pin=id,bigint_col`).
- `pin` order is authoritative and MUST be updated when users drag-reorder pinned columns.
- `pageIndex` remains URL-backed for table navigation.
- `pageSize` remains a supported hash key for compatibility, but table rendering now takes its authoritative rows-per-page preference from `studioUiCollection.tablePageSize` in [`Architecture/ui-state.md`](ui-state.md).

Adding a new URL key requires updating `StateKey` in `nuqs.ts` first.

## Default Resolution Contract

`useNavigationInternal` derives defaults from adapter + introspection:

- `schema`: adapter default schema, else first introspected schema, else `public`
- `table`: first table in resolved schema
- `filter`: serialized `defaultFilter`
- `pageIndex`: `"0"`
- `pageSize`: `"25"`
- `search`: `""`
- `searchScope`: `"table"` (legacy default)
- `view`: `"table"`

When URL params are stale from a previous DB, invalid `schema`/`table` values MUST be resolved to valid current defaults.
Shared table page size and infinite-scroll mode are not derived from URL defaults; they are restored through Studio UI state and then mirrored into query behavior by `usePagination`.

## Hash Adapter Contract

`NuqsHashAdapter` is required for Studio.

- It stores the raw hash in TanStack DB UI state key `nuqs-hash`.
- It updates browser history using Nuqs adapter options (`push` vs `replace`).
- It listens to `hashchange` and debounces updates.
- It exposes snapshots as `URLSearchParams` for Nuqs.

Do not replace hash synchronization logic with custom listeners in feature code.

## Link And Imperative Navigation Rules

Use two patterns only:

- Link rendering: `href={createUrl({ ...ParamValues })}`
- Imperative updates: `setViewParam`, `setSchemaParam`, `setTableParam`, etc.

On schema switch, code MUST also resolve and set a valid table for that schema (current behavior in `Navigation.SchemaSelector`).

## Context Boundary

`NavigationContextProvider` wraps one `useNavigationInternal` instance to reduce re-renders and centralize behavior.

Feature components MUST consume `useNavigation()` and MUST NOT create independent URL management hooks.

## Forbidden Patterns

- Manual `URLSearchParams` parsing in feature components.
- Manual `history.pushState` / `replaceState` outside `NuqsHashAdapter`.
- Local component state that duplicates URL navigation state.
- View selection logic based on anything other than `viewParam`.

## Testing Requirements

Navigation changes MUST include tests for:

- hash <-> query state sync via `NuqsHashAdapter`
- stale schema/table fallback behavior
- URL write serialization for changed controls (sort/filter/pagination/view)

Baseline reference test:

- [`ui/studio/NuqsHashAdapter.test.tsx`](../ui/studio/NuqsHashAdapter.test.tsx)
