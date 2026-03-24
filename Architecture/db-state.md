# Database State Architecture

This document is normative for database-backed state in Studio.

All active-table row data MUST be loaded, cached, and mutated through TanStack DB collections. Views are not allowed to call adapter query/update/delete APIs directly.

## Scope

This document covers:

- Active table row loading
- Row cache lifecycle
- Row mutation flow (optimistic update/delete)
- Metadata cache (`filteredRowCount`)

This document does not redefine introspection architecture.

## Core Components

Database state architecture is implemented by these modules:

- [`ui/hooks/use-active-table-rows-collection.ts`](../ui/hooks/use-active-table-rows-collection.ts)
- [`ui/hooks/use-active-table-query.ts`](../ui/hooks/use-active-table-query.ts)
- [`ui/hooks/use-active-table-update.ts`](../ui/hooks/use-active-table-update.ts)
- [`ui/hooks/use-active-table-delete.ts`](../ui/hooks/use-active-table-delete.ts)
- [`ui/studio/context.tsx`](../ui/studio/context.tsx)
- [`ui/hooks/utils/add-row-id-to-result.ts`](../ui/hooks/utils/add-row-id-to-result.ts)

## Data Loading Contract

### 1. Query input (single source)

Active table reads MUST be parameterized by:

- `table` (`schema`, `name`, `columns`)
- `pageIndex`
- `pageSize`
- `sortOrder`
- `filter`

These inputs form the `queryScopeKey` and MUST be treated as the identity of a row collection scope.

### 2. Query-scope keying

`useActiveTableRowsCollection` computes:

- `queryScopeKey = schema::table::pageIndex::pageSize::sortKey::filterKey`

This key MUST remain deterministic. Any new query dimension MUST be added to key derivation.

### 3. Collection creation and reuse

Rows are cached as TanStack DB query collections:

- collection id: `rows:${queryScopeKey}`
- created via `queryCollectionOptions(...)`
- reused via `getOrCreateRowsCollection(queryScopeKey, factory)` from Studio context

Do not create unmanaged per-render collections. All row collections MUST be created through Studio context cache.
Rows collections MUST be instrumented with TanStack DB mutation guardrails (see [`Architecture/tanstack-db-performance.md`](tanstack-db-performance.md)).

### 4. Query execution

Collection `queryFn` MUST call:

- `adapter.query({ table, pageIndex, pageSize, sortOrder, filter }, { abortSignal })`
- active-table row loading MUST keep only the latest in-flight request authoritative for a given `${schema}.${table}` scope:
  - starting a new table-row query for the same table MUST abort the previous in-flight request
  - late completions from superseded requests MUST be ignored, even if the adapter resolves after abort

On success:

- augment rows with `__ps_rowid` using `addRowIdToResult(...)`
- upsert `filteredRowCount` into `tableQueryMetaCollection` under `queryScopeKey`
- emit `studio_operation_success` event

On failure:

- emit `studio_operation_error` event
- throw error to TanStack Query/DB pipeline

### 5. Live reads

Consumers MUST read rows directly from the rows collection via live query:

```ts
const { data: rows = [] } = useLiveQuery(() => collection ?? undefined, [
  collection,
]);
```

Do not mirror these rows into parallel local state.

## Row Identity Contract

Each cached row MUST include `__ps_rowid`.

`__ps_rowid` is derived from:

- table id (`schema.table`)
- PK-derived filter from `inferFilterObject(row, table.columns)`

Current limitation:

- tables without a PK are not fully supported by this id strategy.

Any row-mutation API that depends on row identity MUST use `__ps_rowid`.

## Cache Behavior

Query collection options are configured to keep row snapshots stable for each scope:

- `staleTime: Infinity`
- `retry: false`
- `gcTime: 0`

Manual refetch is done with:

- `collection.utils.refetch({ throwOnError: true })`

`isFetching` for UI MUST come from collection/query state (`collection.utils.isFetching` or live-query loading fallback), not local booleans.

### Metadata cache

`filteredRowCount` MUST be stored in `tableQueryMetaCollection` keyed by `queryScopeKey`.

Views MUST read filtered counts from this metadata collection path and MUST NOT recompute counts from local row length.

## Optimistic Mutation Contract

### 1. Update (optimistic)

Update mutations MUST use:

- `collection.update(rowId, draft => { ...changes })`

and MUST await:

- `transaction.isPersisted.promise`

Persistence is implemented in collection `onUpdate`:

- iterate `transaction.mutations`
- call `adapter.update({ table, row: original, changes }, {})`
- emit operation success/error events
- write server-returned canonical row back via `collection.utils.writeUpdate(...)`

This is the required optimistic flow:

- local cache updates immediately
- persistence confirms/rejects the transaction
- canonical server row is merged back

### 2. Delete (optimistic)

Delete mutations MUST use:

- `collection.delete(rowIds)`

and MUST await:

- `transaction.isPersisted.promise`

Persistence is implemented in collection `onDelete`:

- collect `mutation.original` rows
- call `adapter.delete({ table, rows }, {})`
- emit operation success/error events

After delete persistence, callers MAY refetch for page-boundary consistency (current behavior does this and is acceptable).

### 3. Insert (current behavior)

Insert is currently server-first:

- `useActiveTableInsert` calls `adapter.insert(...)`
- success path refetches active rows collection

There is currently no `onInsert` optimistic handler in the rows collection. Do not assume optimistic inserts exist.

## Usage Rules For Views

- Views MUST use `useActiveTableQuery` / `useActiveTableRowsCollection` for reads.
- Views MUST use `useActiveTableUpdate` for row edits and bulk cell-paste updates.
- Views MUST use `useActiveTableDelete` for row deletion.
- Views MUST NOT call adapter query/update/delete directly.

## Lifecycle Rules

Studio context owns collection lifecycle:

- rows collections are cached in `rowsCollectionCacheRef`
- adapter changes MUST clear cached row collections and reset query client state

Feature code must not add ad-hoc cleanup logic that bypasses Studio context.

## Events And Observability

All database operations MUST emit `onEvent` entries:

- success: `studio_operation_success`
- failure: `studio_operation_error`

This is required so Console and telemetry paths remain accurate.

## Forbidden Patterns

- Fetching table rows in component effects with local state.
- Local optimistic mutation state separate from collection transactions.
- Updating cached rows without using collection mutation APIs.
- Building alternate row ids unrelated to `__ps_rowid`.
- Writing filtered row count into component-local state.

## Testing Requirements

Changes to this architecture MUST include tests in:

- [`ui/hooks/use-active-table-rows-collection.test.tsx`](../ui/hooks/use-active-table-rows-collection.test.tsx)

At minimum, tests must cover:

- row loading through query collection
- metadata count upsert path
- optimistic update persistence path (`collection.update` + `isPersisted.promise`)
- delete persistence path when changed

PRs that alter DB-state flow without corresponding tests are incomplete.
