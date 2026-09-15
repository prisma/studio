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
- `refetchOnWindowFocus: "always"`
- `staleTime: 30_000` (30s)

Automatic retry loops are forbidden for introspection because they can spam operation events, repeat expensive metadata work, and hide the real startup failure state from the user. `refetchOnWindowFocus` is not a retry loop: `refetchOnWindowFocus: "always"` refires on every window focus even while data is still fresh — React Query v5 would normally treat plain `true` as "refetch only stale queries" and skip the focus refetch while data is fresh, hence the explicit `"always"` string. Combined with the 30s `staleTime` (which throttles background refetches otherwise), a focus event in practice re-introspects at most once each time the user returns to Studio, which is the intent of the refreshable schema contract below.

## Refreshable Schema Contract

Introspection is cached but MUST be refreshable so the cell editor re-renders with the correct column type when the live DB schema drifts (e.g. a column changed from boolean to varchar after Studio loaded).

All refresh paths go through one shared mechanism in `ui/hooks/refresh-introspection.ts`:

- `INTROSPECTION_QUERY_KEY` is the single React Query key for introspection.
- `refreshIntrospection(queryClient)` invalidates the introspection cache and refetches any active observer.

Three call sites share it:

- `useIntrospection().refreshSchema` — backs the toolbar "Refresh schema" button.
- the write-error self-heal path (see Self-Heal Contract below).
- window-focus refetch (React Query built-in, enabled by `refetchOnWindowFocus: "always"` + `staleTime: 30_000`).

The "Refresh schema" button MUST be a ShadCN `Button` with a ShadCN `Tooltip`, an `aria-label`, and a loading/disabled state while refetching.

## Self-Heal Contract

When a row write (insert/update) fails with a PostgreSQL type-mismatch error, Studio MUST additionally invalidate cached introspection and trigger a refetch so the editor can re-render with the correct column type.

- Detection: `data/postgres-core/postgres-error.ts` matches SQLSTATE `42804` (`datatype_mismatch`) and `22P02` (`invalid_text_representation`) by reading the string `code` property carried on the `AdapterError` (the Postgres driver attaches the server `SqlState` there, and `createAdapterError` preserves it on the same object).
- Wiring: `ui/hooks/refresh-introspection.ts` exports `selfHealOnWriteError({ error, queryClient })`, called from the row mutation error paths in `ui/hooks/use-active-table-rows-collection.ts` (`onUpdate`) and `ui/hooks/use-active-table-insert.ts`.
- Non-swallowing: the original error MUST still be surfaced to the user (the `studio_operation_error` event and resulting toast still fire). The self-heal only additionally triggers a background introspection refetch.

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

- a single initial introspection without mount-time cancellation or refetch
- failed initial introspection without automatic retry
- stale-data preservation after a failed refetch
- startup recovery UI rendering
- adapter partial-success fallback when timezone lookup fails
- single-emission behavior for `studio_launched`
- introspection refetching when the window regains focus (proves `staleTime` is the 30s throttle and `refetchOnWindowFocus: "always"` refetches even while fresh data is still cached)
- `refreshSchema` invalidating and triggering an introspection refetch
- self-heal on a Postgres type-mismatch write error (SQLSTATE `42804` / `22P02`) without swallowing the user-facing error

## Cell Editor Type Label

The cell editor MUST surface the DB column type Studio believes a column has (via `ui/studio/input/ColumnTypeLabel.tsx`, composed around the input by `ui/studio/input/get-input.tsx`). This makes schema drift visible to the user instead of producing a silently wrong widget. The readable type string comes from `ui/lib/datatype-display.ts` (`formatDatatypeName`), which maps internal catalog names to common SQL aliases. The label uses standard ShadCN `Tooltip` composition; no non-standard UI is introduced.
