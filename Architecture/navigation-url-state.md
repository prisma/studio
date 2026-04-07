# Navigation And URL State Architecture

This document is normative for navigation and URL state in Studio.

Navigation state MUST be URL-driven and managed through `useNavigation` + Nuqs. Do not introduce alternate routing/state systems for Studio views.

## Scope

This architecture governs:

- active Studio view (`table`, `schema`, `console`, `sql`, `stream`)
- active schema/table/stream
- active stream follow mode
- active stream aggregation-panel visibility
- active stream aggregation range while the aggregation panel is open
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
- `stream`
- `streamFollow`
- `aggregations`
- `streamAggregationRange`
- `filter`
- `sort`
- `pin`
- `pageIndex`
- `pageSize`
- `search`
- `searchScope`

Notes:

- `search` is shared search term state for the active data view. In table view it drives row search, and in stream view it drives stream-event search when the selected stream advertises search capability.
- `searchScope` is legacy URL state and is not used for table-name navigation filtering.
- `pin` stores left-pinned data columns for the grid as a comma-separated list (for example `pin=id,bigint_col`).
- `pin` order is authoritative and MUST be updated when users drag-reorder pinned columns.
- `pageIndex` remains URL-backed for table navigation.
- `pageSize` remains a supported hash key for compatibility, but table rendering now takes its authoritative rows-per-page preference from `studioUiCollection.tablePageSize` in [`Architecture/ui-state.md`](ui-state.md).
- `streamFollow` stores the active stream follow mode (`paused`, `live`, or `tail`).
- `aggregations` is an open-only flag for the active stream aggregation strip; when present it MUST be serialized as a bare key with no explicit value.
- `streamAggregationRange` stores the active stream aggregation range, but MUST only be serialized while `aggregations` is present.

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
- `stream`: no default; only meaningful when `view=stream`
- `streamFollow`: no global default in `useNavigation`; the active stream view MUST resolve an absent value to `tail` and materialize that into the hash
- `aggregations`: no global default in `useNavigation`; the active stream view MUST treat an absent flag as closed and MUST NOT materialize that closed state into the hash
- `streamAggregationRange`: no standalone default; the active stream view MUST clear it whenever `aggregations` is absent, and MUST materialize its default range only after the aggregation panel is opened

When Studio is running without a database connection but with Streams enabled:

- the resolved default `view` MUST become `"stream"` instead of `"table"`
- stale database-oriented views such as `table`, `schema`, `console`, and `sql` MUST resolve back to the stream view instead of trying to render database-only UI against a disabled database session

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
- Imperative updates: `setViewParam`, `setSchemaParam`, `setTableParam`, `setStreamParam`, etc.

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
