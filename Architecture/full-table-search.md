# Full Table Search Architecture

This document is normative for full-table content search in active table views.

## Scope

This architecture governs:

- row/content search term handling
- SQL predicate generation for full-table search
- execution guardrails for expensive search queries
- user-visible error behavior for search timeouts

## Design Goals

- Keep "search this table" useful without requiring schema indexes.
- Minimize per-row compute cost for generic scans.
- Bound operational risk with strict timeout and concurrency limits.
- Keep URL state and table query control architecture intact.

## Canonical Components

- [`ui/studio/views/table/ActiveTableView.tsx`](../ui/studio/views/table/ActiveTableView.tsx)
- [`ui/hooks/use-active-table-query.ts`](../ui/hooks/use-active-table-query.ts)
- [`ui/hooks/use-active-table-rows-collection.ts`](../ui/hooks/use-active-table-rows-collection.ts)
- [`data/full-table-search.ts`](../data/full-table-search.ts)
- [`data/postgres-core/full-table-search.ts`](../data/postgres-core/full-table-search.ts)
- [`data/postgres-core/dml.ts`](../data/postgres-core/dml.ts)
- [`data/mysql-core/dml.ts`](../data/mysql-core/dml.ts)
- [`data/sqlite-core/dml.ts`](../data/sqlite-core/dml.ts)
- [`data/postgres-core/adapter.ts`](../data/postgres-core/adapter.ts)
- [`data/mysql-core/adapter.ts`](../data/mysql-core/adapter.ts)
- [`data/sqlite-core/adapter.ts`](../data/sqlite-core/adapter.ts)

## Data Flow

1. The table toolbar captures user input and debounces URL updates.
2. `use-active-table-query` resolves `fullTableSearchTerm` from active table + row-search scope context.
3. `use-active-table-rows-collection` passes `fullTableSearchTerm` to `adapter.query`.
4. SQL adapters delegate search predicate planning and expression rendering to `data/full-table-search.ts`.
   - PostgreSQL composes the shared planner with `data/postgres-core/full-table-search.ts` to extend cast-to-text fallback coverage across built-in type families.
5. Search predicates are composed with the applied filter in SQL `WHERE`.
6. SQL adapters execute search with guardrails:
   - timeout at 5 seconds
   - cancel previous in-flight search before starting a new one

## SQL Strategy

The system must avoid "stringify every column blindly" scans.

### Text predicates

- String and enum columns are searched with case-insensitive substring matching.
  - PostgreSQL uses `ILIKE`.
  - MySQL and SQLite use `LOWER(CAST(column AS text/char)) LIKE LOWER('%term%')`.
- UUID columns are excluded from text `ILIKE` and handled as typed equality.
- PostgreSQL additionally applies cast-to-text `ILIKE` fallback predicates across non-text datatype families (arrays, json/jsonb, raw/native built-ins) to support full built-in type coverage.
- MySQL and SQLite continue to exclude array/raw/json fallback casts by default.
- Text search activates only when query length is at least 2 characters.
- Text predicate count is capped (`FULL_TABLE_SEARCH_MAX_TEXT_COLUMNS`) to avoid unbounded OR growth.

### Typed predicates (term-aware)

When parsing succeeds, typed OR predicates are added:

- numeric term -> numeric column equality
- boolean term -> boolean equality
- UUID term -> UUID equality
- `YYYY[-MM[-DD]]` term -> datetime range (`>= startInclusive` and `< endExclusive`)
- `YYYY-MM-DD[T| ]HH[:mm[:ss[.SSS]]][Z]` term -> datetime range at provided precision (`hour`, `minute`, `second`, or `millisecond`)
- `HH[:mm[:ss[.SSS]]]` term -> time equality (missing parts are normalized to `00`)

This avoids unnecessary casts and keeps predicate evaluation cheaper for common admin lookup patterns.

## Cost Tiers

The planner is organized around practical cost tiers:

- cheap: typed equality/range predicates (boolean, numeric, UUID, datetime, time)
- moderate: text-ish substring predicates (string/enum)
- expensive: cast-to-text substring fallback on complex/large representations (arrays, json/jsonb, wide raw/native types)

Current behavior:

- PostgreSQL includes all tiers so built-in type families are searchable out of the box.
- MySQL and SQLite include cheap + moderate tiers only.

Forward compatibility:

- Column-selection controls can later use this model to keep cheap/moderate columns enabled by default and let users opt into expensive columns explicitly.

## Future Enhancement

- Add user-facing column inclusion controls for row search:
  - default enabled: cheap + moderate predicate columns
  - opt-in: expensive predicate columns (for example large JSON/array/text-rendered complex types)
  - integration point: planner tier metadata in `data/postgres-core/full-table-search.ts` and shared planner composition

## Dialect Data-Type Coverage

The planner works from Studio datatype groups (`string`, `enum`, `numeric`, `boolean`, `datetime`, `time`, `json`, `raw`) plus `isArray`.

### PostgreSQL

Search behavior:

- `string` and `enum`: case-insensitive substring via `CAST(column AS text) ILIKE '%term%'`
- `numeric` (non-array): equality when term parses numeric
- `boolean` (non-array): equality when term parses boolean
- UUID columns (`datatype.name === "uuid"`, non-array): equality when term parses UUID
- `datetime` (non-array): day/month/year range match when term parses `YYYY[-MM[-DD]]`; also supports partial datetime precision via `YYYY-MM-DD[T| ]HH[:mm[:ss[.SSS]]][Z]`
- `time` (non-array): equality when term parses `HH[:mm[:ss[.SSS]]]` (missing parts normalized to `00`)
- built-in non-text families are also searchable with cast-to-text substring fallback (examples: `json/jsonb`, arrays such as `text[]`, range/multirange, network, geometric, `xml`, `tsvector`, `tsquery`, `oid`/`reg*`, `pg_lsn`, `jsonpath`, and other native built-ins that render to text)

Notes:

- Fallback coverage depends on PostgreSQL text I/O representation (`CAST(column AS text)`), so matching semantics follow rendered values.
- Text predicate count cap still applies.

### MySQL

Search behavior:

- `string` (non-array, non-UUID, non-binary-like): case-insensitive substring via `LOWER(CAST(column AS char)) LIKE '%term%'`
- `enum` (non-array): case-insensitive substring via `LOWER(CAST(column AS char)) LIKE '%term%'`
- `numeric` (non-array): equality when term parses numeric
- `boolean` (non-array): equality when term parses boolean
- UUID string columns (`datatype.name === "uuid"`, non-array): equality when term parses UUID
- `datetime` (non-array): day/month/year range match when term parses `YYYY[-MM[-DD]]`; also supports partial datetime precision via `YYYY-MM-DD[T| ]HH[:mm[:ss[.SSS]]][Z]`
- `time` (non-array): equality when term parses `HH[:mm[:ss[.SSS]]]` (missing parts normalized to `00`)

Not searchable in full-table search:

- `json` group columns
- raw/binary-like columns (for example `blob`, `binary`, `varbinary`)
- UUID columns for substring matching (UUID is equality-only)
- array columns are excluded by planner design (MySQL adapters currently introspect columns as non-array)

### SQLite

Search behavior:

- `string` (non-array, non-UUID, non-binary-like): case-insensitive substring via `LOWER(CAST(column AS text)) LIKE '%term%'`
- `enum` (non-array): case-insensitive substring via `LOWER(CAST(column AS text)) LIKE '%term%'`
- `numeric` (non-array): equality when term parses numeric
- `boolean` (non-array): equality when term parses boolean
- UUID string columns (`datatype.name === "uuid"`, non-array): equality when term parses UUID
- `datetime` (non-array): day/month/year range match when term parses `YYYY[-MM[-DD]]`; also supports partial datetime precision via `YYYY-MM-DD[T| ]HH[:mm[:ss[.SSS]]][Z]`
- `time` (non-array): equality when term parses `HH[:mm[:ss[.SSS]]]` (missing parts normalized to `00`)

Not searchable in full-table search:

- `json` group columns
- raw/binary-like columns (for example `blob`)
- UUID columns for substring matching (UUID is equality-only)
- array columns are excluded by planner design (SQLite adapters currently introspect columns as non-array)

## Operational Guardrails

- Search timeout is hard-capped at `5000ms`.
- PostgreSQL full-table search queries set per-query guardrails in SQL:
  - `statement_timeout = 5000ms`
  - `lock_timeout = 100ms`
  - These are applied via `set_config(..., true)` in a dedicated guardrail CTE that is joined by both count and row-select query blocks.
- MySQL full-table search queries set per-query guardrails using optimizer hints:
  - `MAX_EXECUTION_TIME(5000)`
  - `SET_VAR(lock_wait_timeout=1)` (metadata lock wait timeout, seconds)
- SQLite has no equivalent per-query lock-wait/statement knobs in this architecture path; it relies on the existing abort + timeout executor guardrail.
- Timeout errors use the message:
  - `Search timed out after 5 seconds. This kind of search is expensive, and your table might be too large.`
- Exactly one full-table search query may be active per adapter instance (PostgreSQL, MySQL, SQLite):
  - a new search request aborts the previous in-flight search request.
- Search still uses paginated table queries with `LIMIT`; this enables early stop once enough matches are found.

## UI Guardrails

- Search input updates are debounced (350ms) before writing URL state.
- Row-search UI is only rendered when `adapter.capabilities.fullTableSearch === true`.
- If the connected adapter does not support full-table search, row-search controls are hidden.
- Row-search input is contextual:
  - hidden by default behind an outline icon button
  - expands inline when opened and collapses on `Escape`
  - collapses on blur when the current value is empty
- Row-search behavior still resets pagination to first page by existing URL-state logic.
- Matched substrings in rendered grid cells must be highlighted with a yellow background to improve scanability of result rows.

## Error Semantics

- Superseded search queries are aborted with `AbortError` and treated as cancellation.
- Timeout is surfaced as `FullTableSearchTimeoutError` with the explicit expensive-search guidance.

## Testing Requirements

Changes to this system must include:

- unit tests for predicate planning (`full-table-search.test.ts`)
- integration tests against Prisma Postgres dev (`full-table-search.ppg-dev.test.ts`) covering:
  - mixed-type search execution
  - timeout behavior at 5 seconds
  - single-active-query cancellation behavior
- SQL dialect coverage tests in MySQL and SQLite DML suites (`mysql-core/dml.test.ts`, `sqlite-core/dml.test.ts`)
- adapter guardrail tests for MySQL and SQLite (`mysql-core/full-table-search.adapter.test.ts`, `sqlite-core/full-table-search.adapter.test.ts`)
