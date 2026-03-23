# Introspection Architecture

This document is normative for Studio introspection fetching, fallback behavior, and startup failure handling.

Studio MUST treat introspection as resilient metadata loading. A failed refresh must not silently degrade into an empty-database state, and a partial metadata success must remain usable whenever table metadata is available.

## Scope

This architecture governs:

- adapter introspection result/error behavior
- React Query fetch policy for introspection
- startup failure and stale-data fallback UI
- operation-event emission for introspection

## Canonical Components

- [`ui/hooks/use-introspection.ts`](../ui/hooks/use-introspection.ts)
- [`ui/hooks/use-navigation.tsx`](../ui/hooks/use-navigation.tsx)
- [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx)
- [`ui/studio/Studio.tsx`](../ui/studio/Studio.tsx)
- [`data/postgres-core/adapter.ts`](../data/postgres-core/adapter.ts)
- [`data/mysql-core/adapter.ts`](../data/mysql-core/adapter.ts)

## Fetch Policy Contract

Introspection MUST be fetched through `use-introspection.ts` with a stable React Query entry.

The query MUST use:

- `retry: false`
- `retryOnMount: false`
- `refetchOnReconnect: false`
- `refetchOnWindowFocus: false`
- `staleTime: Infinity`

Automatic retry loops are forbidden for introspection because they can spam operation events, repeat expensive metadata work, and hide the real startup failure state from the user.

## Data Fallback Contract

`useIntrospection` MUST always return a shape-compatible `data` object so navigation defaults can still be computed safely.

That fallback data is placeholder metadata only. Callers MUST use `hasResolvedIntrospection` to distinguish:

- a real successful introspection result
- placeholder fallback data returned after a failed initial load

When a refetch fails after a previous success, Studio MUST keep the last successful introspection snapshot available and surface the error separately via `errorState`.

## Startup Failure UI Contract

If introspection has not resolved successfully and the active table cannot be resolved, Studio MUST render actionable recovery UI instead of an empty-state table view.

Required behavior:

- [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx) MUST show an introspection failure notice with retry action.
- [`ui/studio/Studio.tsx`](../ui/studio/Studio.tsx) MUST replace the table view with a recovery panel when `view=table` cannot resolve an active table because startup introspection failed.
- The sidebar MUST NOT show `No tables found` for an unresolved startup introspection failure.

When stale introspection data exists, Studio MAY continue rendering tables, but it MUST show a warning notice that the visible schema snapshot is stale and offer retry.

## Adapter Partial-Success Contract

For PostgreSQL and MySQL introspection, table metadata is authoritative for initial usability.

If the tables query succeeds but timezone lookup fails or returns no value:

- introspection MUST still succeed
- timezone MUST fall back to `UTC`
- Studio MUST continue rendering available schemas and tables

If the tables query itself fails, introspection MUST fail.

## Event Contract

Introspection success and failure MUST emit standardized operation events through the central `onEvent` pipeline.

Failure diagnostics MUST include:

- operation name (`introspect`)
- associated SQL query when available
- adapter source on `payload.error.adapterSource` when known

`studio_launched` MUST only be emitted once per adapter lifecycle, even if introspection is manually refetched successfully multiple times.

## Testing Requirements

Changes to this subsystem MUST include tests for:

- failed initial introspection without automatic retry
- stale-data preservation after a failed refetch
- startup recovery UI rendering
- adapter partial-success fallback when timezone lookup fails
- single-emission behavior for `studio_launched`
