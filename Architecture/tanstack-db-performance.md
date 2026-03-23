# TanStack DB Performance Guardrails

This document is normative for performance-sensitive usage of TanStack DB in Studio.

It exists to prevent main-thread stalls caused by high-frequency collection mutations (for example, one write per keystroke flowing into heavy downstream recalculation).

## Scope

This architecture governs:

- mutation frequency limits for TanStack DB collections
- how transient UI input state is separated from shared/query-driving state
- runtime diagnostics for mutation bursts in development
- required coding patterns when introducing new TanStack DB-backed state

## Core Principles

- TanStack DB is the source of truth for shared UI and database-backed state.
- Per-keystroke transient state is not shared state and MUST remain local React state.
- Query-driving state MAY be TanStack DB or URL-backed, but updates from fast input MUST be buffered (debounce/throttle/explicit submit).
- Collection writes inside render-driven loops are forbidden.

## Mutation Burst Guard

Studio installs a development-only mutation burst guard in:

- [`ui/studio/tanstack-db-mutation-guard.ts`](../ui/studio/tanstack-db-mutation-guard.ts)

The guard:

- counts TanStack DB `insert` / `update` / `delete` calls per event-loop tick
- emits a warning when mutation count exceeds threshold
- includes the triggering collection/method and top collection breakdown
- supports strict mode (throw) for local debugging and CI-style enforcement

Default behavior:

- enabled only when `NODE_ENV === "development"`
- warning mode
- threshold: `120` mutations per tick

Optional runtime overrides (set before Studio boots):

- `window.__PRISMA_STUDIO_STRICT_TANSTACK_DB__ = true` (throw instead of warn)
- `window.__PRISMA_STUDIO_TANSTACK_DB_MAX_MUTATIONS_PER_TICK__ = <positive integer>`

## Instrumentation Boundary

All central collection creation paths MUST be instrumented:

- Studio collections in [`ui/studio/context.tsx`](../ui/studio/context.tsx)
  - `studioUiCollection`
  - `operationEventsCollection`
  - `tableUiStateCollection`
  - `tableQueryMetaCollection`
  - `uiLocalStateCollection`
  - `sqlEditorStateCollection`
  - `navigationTableNamesCollection`
- rows collections created through `getOrCreateRowsCollection(...)`
- fallback local UI collection in [`ui/hooks/use-ui-state.ts`](../ui/hooks/use-ui-state.ts)

If new collection creation paths are added, they MUST call `instrumentTanStackCollectionMutations(...)`.

## State Partitioning Rule For Fast Inputs

When user input can emit many events quickly (typing, drag, pointer move):

- keep raw input value in local component state
- synchronize to shared/query-driving state on debounce or explicit action
- avoid coupling each input event to collection mutations that fan out into large dependent graphs

Canonical example:

- search input text is local
- URL/search param update is debounced
- expensive table/grid/query state updates are derived from debounced value

## Grid Rendering Guardrails

Wide data grids are a special high-risk area for main-thread stalls. To avoid
render-driven amplification, grid cell behavior MUST follow these rules:

- render a single shared context menu at the grid level
- do not wrap every cell in a context-menu component
- do not allocate per-cell copy callbacks; resolve copy payload only for the
  current context-menu target
- mount editor popovers only for the active cell; closed cells must render a
  lightweight display shell without popover portals
- maintain at most one active writable editor per table view at a time

Rationale:

- per-cell wrappers/callbacks scale linearly with visible cell count and become
  expensive on pagination/selection updates
- popover portals and editor trees are expensive in large tables when mounted
  eagerly

## Forbidden Patterns

- writing to TanStack DB collections directly in render paths
- writing shared state on every keypress when only final/debounced value is needed
- recreating large derived structures that trigger collection writes on unrelated local updates
- introducing new uninstrumented `createCollection(...)` paths
- mounting per-cell context menu wrappers across the full grid
- mounting writable editor popovers for non-active cells

## Operational Constraints

- The guard is diagnostic, not a correctness mechanism.
- Warning mode should not be relied on as control flow.
- Throw mode is for debugging/testing only and can interrupt legitimate bulk operations.
- Threshold tuning should remain conservative to avoid false positives for valid batch actions.

## Testing Requirements

Guard behavior is covered by:

- [`ui/studio/tanstack-db-mutation-guard.test.ts`](../ui/studio/tanstack-db-mutation-guard.test.ts)
- [`ui/studio/tanstack-db-performance-architecture.test.ts`](../ui/studio/tanstack-db-performance-architecture.test.ts)
- [`ui/hooks/use-ui-state.context.test.tsx`](../ui/hooks/use-ui-state.context.test.tsx)

Any change to guard semantics MUST update tests for:

- threshold violation behavior
- next-tick reset behavior
- strict throw behavior
- instrumentation forwarding for `insert`/`update`/`delete`

Architecture-compliance tests MUST also cover:

- allowed `createCollection(...)` boundaries in production UI code
- `cleanupOnUnmount` paths avoiding shared TanStack DB reads/writes
- per-cell components avoiding direct global hook reads that fan out across wide grids
- grid-wide shared context-menu usage instead of per-cell context wrappers
- active-cell-only writable editor mounting behavior
