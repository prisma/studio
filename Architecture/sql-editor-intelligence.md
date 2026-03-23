# SQL Editor Intelligence Architecture

This document is normative for SQL editor intelligence in Studio (`view=sql`): syntax highlighting, schema-aware autocomplete, and async lint diagnostics. Natural-language SQL generation is governed separately by [`Architecture/sql-ai-generation.md`](./sql-ai-generation.md).

The implementation MUST use the existing authenticated BFF transport and MUST NOT introduce an unauthenticated side channel.

## Scope

This architecture governs:

- SQL language mode and syntax highlighting
- schema-aware completions (schemas/tables/columns)
- lint diagnostics lifecycle (request, cancellation, rendering)
- reuse of SQL lint transport for advanced table-level SQL filter pills
- backend lint safety guardrails and operational limits
- keyboard execution semantics for multi-statement SQL text

## Canonical Components

- [`ui/studio/views/sql/SqlView.tsx`](../ui/studio/views/sql/SqlView.tsx)
- [`ui/studio/views/sql/sql-editor-config.ts`](../ui/studio/views/sql/sql-editor-config.ts)
- [`ui/studio/views/sql/sql-lint-source.ts`](../ui/studio/views/sql/sql-lint-source.ts)
- [`data/sql-editor-schema.ts`](../data/sql-editor-schema.ts)
- [`data/bff/bff-client.ts`](../data/bff/bff-client.ts)
- [`data/postgres-core/adapter.ts`](../data/postgres-core/adapter.ts)
- [`data/postgres-core/sql-lint.ts`](../data/postgres-core/sql-lint.ts)
- [`data/mysql-core/adapter.ts`](../data/mysql-core/adapter.ts)
- [`data/mysql-core/sql-lint.ts`](../data/mysql-core/sql-lint.ts)
- [`data/sqlite-core/adapter.ts`](../data/sqlite-core/adapter.ts)
- [`data/sqlite-core/sql-lint.ts`](../data/sqlite-core/sql-lint.ts)
- [`demo/ppg-dev/sql-lint.ts`](../demo/ppg-dev/sql-lint.ts)
- [`demo/ppg-dev/server.ts`](../demo/ppg-dev/server.ts)

## Frontend Contract

- SQL editor MUST use CodeMirror 6.
- Dialect selection MUST come from adapter capability `sqlDialect`:
  - `postgresql` -> `PostgreSQL`
  - `mysql` -> `MySQL`
  - `sqlite` -> `SQLite`
- Completions MUST be derived from introspection metadata (no ad-hoc hardcoded schema lists).
- Schema namespace normalization MUST be deterministic and versioned via `data/sql-editor-schema.ts`.
- `Mod+Enter` (`Cmd+Enter` on macOS / `Ctrl+Enter` on Windows/Linux) MUST execute SQL.
- For multi-statement editor text, execution MUST target the top-level statement containing the cursor (not the entire document).

## Lint Lifecycle Contract

- Lint source MUST be async and debounced (`delay: 500ms`).
- Lint requests MUST run with at most one active request per editor:
  - starting a new request aborts the previous one
  - stale responses MUST be discarded via request id check
- Diagnostics MUST be clamped to document bounds before returning to CodeMirror.
- Empty SQL MUST short-circuit with no lint request.
- Table-level SQL filter pills MAY reuse the same adapter `sqlLint` transport, but they MUST wrap raw `WHERE` fragments in a full `SELECT ... WHERE ...` statement before linting.
- SQL filter-pill linting MUST run asynchronously in the background and MUST NOT block the initial filter apply interaction.
- Table-level SQL filter-pill lint diagnostics are advisory UI state only and MUST NOT mutate the already-applied URL filter after the pill has been saved.

## Backend Surface and Auth Contract

- Lint requests MUST flow through existing BFF request channel (`/api/query` + `procedure`) using:
  - existing `customHeaders`
  - existing `customPayload`
- Procedure name for linting is `sql-lint`.
- New SQL-editor surfaces MUST NOT bypass BFF auth propagation.
- Executor contract:
  - `Executor` MAY expose `lintSql(details, options)` as an optimized lint transport.
  - Postgres adapters MUST use executor `lintSql` when present; otherwise they MUST fall back to adapter-level `EXPLAIN (FORMAT JSON)` linting.

## Postgres Lint Safety Guardrails

`sql-lint` execution MUST enforce all of the following:

- maximum SQL length (50KB)
- one or more top-level statements
- statement allowlist:
  - `SELECT`, `WITH`, `VALUES`, `INSERT`, `UPDATE`, `DELETE`
- parse/plan only execution (`EXPLAIN (FORMAT JSON) ...`)
- transaction-local guardrails:
  - `statement_timeout = 1000ms`
  - `lock_timeout = 100ms`
  - `idle_in_transaction_session_timeout = 1000ms`

On Postgres errors, diagnostics MUST include mapped position and SQLSTATE when available. Timeout diagnostics (`57014`) MUST be rewritten to a user-facing lint-timeout message.
For multi-statement SQL text, diagnostics MUST map statement-relative positions back to full-editor offsets.

## Capability Fallback Rules

- `sqlEditorAutocomplete` is enabled for Postgres/MySQL/SQLite adapters.
- `sqlEditorLint` is enabled for Postgres/MySQL/SQLite adapters.
- All adapters MUST follow this resolution order:
  - use executor-provided `lintSql` when available
  - if `lintSql` is unavailable or returns unsupported-procedure/transport errors (`invalid procedure`, `not supported`, `method not allowed`, and equivalent 5xx transport failures such as `unexpected server error`), fall back to adapter-level `EXPLAIN` linting through the normal executor path
  - when fallback is triggered by a persistent transport incompatibility, adapters SHOULD stop retrying `lintSql` for the current adapter instance and continue with `EXPLAIN` fallback
- Adapter fallback SQL:
  - PostgreSQL: `EXPLAIN <statement>`
  - MySQL: `EXPLAIN <statement>`
  - SQLite: `EXPLAIN <statement>`

## Operational Constraints

- Lint traffic is high-frequency by nature; request cancellation and debounce are required, not optional.
- Lint queries MUST remain isolated from normal execution path semantics (never run with `EXPLAIN ANALYZE`).
- SQL view run/cancel flow remains independent from lint flow and must stay cancellable.
- MySQL and SQLite lint diagnostics are parser/planner best-effort and rely on engine error messages for token mapping (no position field equivalent to Postgres `Position`).

## Testing Requirements

Changes to SQL editor intelligence MUST include tests covering:

- schema namespace normalization and versioning
- BFF lint request serialization + auth payload propagation
- Postgres lint guardrail validation and error mapping
- MySQL and SQLite lint fallback diagnostics + multi-statement position mapping
- one-active-request lint cancellation behavior
- SQL view integration (run/cancel + read-only result grid) with CodeMirror present
