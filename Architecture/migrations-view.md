# Prisma Next Migrations View Architecture

This document is normative for the Studio Migrations view (`view=migrations`).

The view renders the Prisma Next migration history stored in the connected database. Studio does not read migration bundles from disk and does not talk to the Prisma Next CLI; the database ledger is the single source of truth.

## Scope

This architecture governs:

- detection of the Prisma Next migration ledger and Migrations navigation visibility
- loading and normalizing `prisma_contract.ledger` rows
- the contract snapshot diff engine
- the visual diff canvas and migration timeline list
- demo seeding of a migration history for `pnpm demo:ppg`

## Canonical Components

- [`ui/hooks/use-migrations.ts`](../ui/hooks/use-migrations.ts)
- [`ui/studio/views/migrations/contract-diff.ts`](../ui/studio/views/migrations/contract-diff.ts)
- [`ui/studio/views/migrations/diff-layout.ts`](../ui/studio/views/migrations/diff-layout.ts)
- [`ui/studio/views/migrations/MigrationsView.tsx`](../ui/studio/views/migrations/MigrationsView.tsx)
- [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx)
- [`demo/ppg-dev/seed-migrations.ts`](../demo/ppg-dev/seed-migrations.ts)

## Data Source

Prisma Next records one row per applied migration in `prisma_contract.ledger` (see the Migration System subsystem doc in the prisma-next repository). The columns Studio consumes:

- `id` — apply order (bigserial)
- `space` — contract space (`app` for the application schema)
- `migration_name`, `migration_hash` — identity; the name is empty for synthesised `db init`/`db update` applies
- `origin_core_hash`, `destination_core_hash` — the contract-graph edge
- `contract_json_before`, `contract_json_after` — full contract IR snapshots bracketing the migration
- `operations` — the executed operation envelopes, including per-step SQL and `operationClass`
- `created_at` — apply time

Rows are read through the standard `Adapter.raw` surface, so every executor (direct TCP, BFF, PGlite) works unchanged.

## Detection

`useMigrationsDetection` derives ledger presence purely from introspection data (`introspection.schemas["prisma_contract"].tables["ledger"]`); no extra probe query runs. The Migrations navigation item renders only when the ledger table exists. Stale `view=migrations` URLs against a database without a ledger show the view's empty state rather than breaking navigation.

## Snapshot Chain Repair

`contract_json_before` MAY be null (synthesised applies, or rows written before snapshots existed). `parseLedgerRows` repairs the chain per contract space: a missing before-snapshot is filled from the predecessor row's after-snapshot, which is exact because each edge's origin hash is its predecessor's destination hash. A baseline migration (null `origin_core_hash`) keeps a null before-snapshot and diffs against the empty contract.

## Diff Engine

`contract-diff.ts` is pure and UI-free:

1. `parseContractSnapshot` normalizes a contract JSON document into flat models (fields with column, native type, nullability, rendered default, enum linkage, primary-key membership; relations; index/unique signatures) and enums. Malformed documents degrade to an empty snapshot instead of throwing.
2. `diffContracts` classifies every model, field, enum, enum member, relation, and index signature as `added` / `removed` / `changed` / `unchanged`, with per-field change details (type, nullability, default) and aggregate stats.

Model-level structure comes from the contract's domain plane; storage-plane data (native types, defaults, primary keys, indexes) enriches it through each model's `storage.table` binding.

## Visual Canvas

The diff renders on a React Flow canvas (same dependency as the Schema Visualizer) with ELK auto-layout in `diff-layout.ts`. By default only touched models, their direct relation neighbors (rendered dimmed as context), and touched enums become nodes; the `All models` toggle (persisted UI state) expands to every model **and enum** in the migration's contract (unchanged ones in the dimmed context style), and a migration that touches nothing falls back to showing the full schema. Relation edges connect visible nodes, with added relations emphasized and removed relations drawn in the destructive color.

A model's status is table-anchored: only field or index changes mark it `changed`. Relation-only changes (a back-relation whose foreign key lives in the other table) keep the model `unchanged` — the added or removed relation surfaces through the emphasized edge, never through an amber card. This keeps the amber signal synonymous with "this table's DDL changed".

The canvas is a single persistent React Flow instance. Node ids are stable (`model:<name>` / `enum:<name>`), so switching migrations swaps node/edge arrays in place: surviving nodes glide to their new ELK positions via a CSS transform transition (see the `migrations-diff-canvas` rules in `ui/index.css`), entering nodes fade in, and the camera animates with `fitView({ duration: 500 })`. MUST NOT key the canvas or its wrapper by migration id — remounting is what causes the jarring full rebuild (and previously wedged exit animations).

The card styling is deliberately playful (FigJam-inspired): status-colored sticky-note cards with tape accents and deterministic tilt, `+`/`−`/`~` field glyphs, and before → after pills for changed field aspects. See `non-standard-ui.md` for the approved exception.

Selection state lives in the `migration` URL parameter (nuqs), so a specific migration diff is shareable.

## Detail Panels

Two mutually exclusive collapsible panels sit under the canvas:

- **SQL** renders the ledger row's operation envelopes verbatim — labels, operation classes, and executed statements.
- **Schema** renders a Prisma-schema-style diff. `psl-schema.ts` projects each contract snapshot into PSL-shaped text (model/enum blocks, mapped field types, defaults, relations, `@@index`/`@@unique`/`@@map`) and diffs the two texts line-by-line with the `diff` (jsdiff) package, collapsing long unchanged runs. The projection favors diff stability (fixed field ordering, no column alignment padding) over exact `prisma format` output. jsdiff was chosen over `@pierre/diffs` because the latter hard-depends on shiki, which is too heavy for the published bundle; the renderer is isolated in `MigrationSchemaPanel` so it can be swapped.

## Demo Seeding

`seed-migrations.ts` replays a fixture captured from the prisma-next `migrations-showcase` example (`demo/ppg-dev/fixtures/prisma-contract-migrations.json`): it recreates the `prisma_contract` schema, restores the marker and ledger rows (including contract snapshots), and re-executes every operation's SQL in ledger order so the live schema matches the migration history exactly. A few showcase rows are inserted so the resulting tables are browsable.
