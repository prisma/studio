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
- [`data/sqlite-core/adapter.ts`](../data/sqlite-core/adapter.ts)
- [`data/database-label.ts`](../data/database-label.ts)
- [`ui/hooks/use-database-identity.ts`](../ui/hooks/use-database-identity.ts)

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
- `databaseName` per dialect, SQLite file-name-only output and pragma-failure tolerance
- `formatDatabaseLabel` removing passwords and `api_key` query parameters from every label
- the tab title only changing when `documentTitle` is set, and being restored on unmount

## Connected Database Identity

Studio MUST name the database a tab is connected to without an extra round trip and without exposing credentials.

- `AdapterIntrospectResult.databaseName` is optional and comes from the database itself. PostgreSQL and MySQL read it in the existing timezone query (`current_database()`, `database()`), so it adds no query. SQLite reads `pragma_database_list` in parallel with the tables query and reduces the path to the file name in SQL, so the full path (which often contains a user name) never leaves the database host. A failed or empty name MUST NOT fail introspection.
- The database's server address (`inet_server_addr()`, `@@hostname`) MUST NOT be used: behind poolers and proxies such as Prisma Postgres and PgBouncer it is `NULL` or the pooler's address.
- Embedders MAY pass `StudioProps.databaseLabel`. It takes priority over `databaseName`, because only the embedder knows the host or the Console project and branch, and many databases share a name such as `postgres`.
- Every label passes through `formatDatabaseLabel` (`data/database-label.ts`), which is idempotent: connection URLs become `host:port/database` (or the file name) without user names, passwords, query parameters or fragments. A URL is shown only when it reads unambiguously: `new URL` parses it and no `@` follows its credentials (in its path, query, fragment, or later in the label). Otherwise a malformed password could be read as a host or path, so the URL and everything after it are dropped rather than guessed at, and Studio falls back to the introspected name. This also drops credential-free URLs with `@` in the path (e.g. Vitess `keyspace@primary`), which is accepted. Plain-text words holding `user:password@…` are dropped. Embedders SHOULD build the label from parsed connection fields when they have them. `StudioContextProvider` applies it once at the boundary, so context, DOM and tab title only ever hold the cleaned label. Embedders SHOULD also apply it on their server so the raw URL never reaches the browser.
- `ui/hooks/use-database-identity.ts` resolves the label (embedder label, else introspected name, only after a successful introspection) and owns the optional tab title. Studio MUST NOT touch `document.title` unless the embedder passes `documentTitle`. Studios that own the title are tracked on the page: the newest shows its title, and when one unmounts the next owner's title (or, after the last one, the host's original title) comes back.
- The sidebar shows the label as plain text under a `Database` heading, with a standard ShadCN `Tooltip` for the engine and introspected name. It is plain text because Studio cannot switch databases.
- Below it, the schema is a switcher, following Console's branch switcher: a compact trigger under a `Schema` heading that opens the standard ShadCN combobox (`Popover` + `Command`) with a "Find schema…" search and a check on the current schema. Picking the current schema keeps the current table, and picking with the pointer returns focus to the trigger without a keyboard focus ring. Dismissing the list by clicking elsewhere leaves focus where the user clicked.
- Both entries follow the sidebar's rhythm: a heading, then a 28px row whose text aligns with the heading and whose box reaches 8px further left, like the nav items (8px heading to row, 16px between entries, 24px to the next section).

## Cell Editor Type Label

The cell editor MUST surface the DB column type Studio believes a column has (via `ui/studio/input/ColumnTypeLabel.tsx`, composed around the input by `ui/studio/input/get-input.tsx`). This makes schema drift visible to the user instead of producing a silently wrong widget. The readable type string comes from `ui/lib/datatype-display.ts` (`formatDatatypeName`), which maps internal catalog names to common SQL aliases. The label uses standard ShadCN `Tooltip` composition; no non-standard UI is introduced.
