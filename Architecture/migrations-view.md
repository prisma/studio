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

Prisma Next records one row per applied migration in `prisma_contract.ledger`, and the migration's destination contract IR in the 1:1 companion table `prisma_contract.contract` (`ledger_id` PK/FK → `ledger.id`; see the Migration System subsystem doc in the prisma-next repository). The columns Studio consumes:

- `ledger.id` — apply order (bigserial)
- `ledger.space` — contract space (`app` for the application schema)
- `ledger.migration_name`, `ledger.migration_hash` — identity; the name is empty for synthesised `db init`/`db update` applies
- `ledger.origin_core_hash`, `ledger.destination_core_hash` — the contract-graph edge
- `ledger.operations` — the executed operation envelopes, including per-step SQL and `operationClass`
- `ledger.created_at` — apply time
- `contract.contract_json` — full contract IR of the migration's destination state (LEFT JOIN; null when the edge carried no snapshot)

Only the after-state is stored; a migration's before-state is derived from its predecessor (see Snapshot Chain Derivation). Rows are read through the standard `Adapter.raw` surface, so every executor (direct TCP, BFF, PGlite) works unchanged. Databases bootstrapped before the `contract` table existed are queried without the join (detection below) — the list still renders, with empty diffs.

## Detection

`useMigrationsDetection` derives ledger and contract-table presence purely from introspection data (`introspection.schemas["prisma_contract"].tables["ledger"|"contract"]`); no extra probe query runs. The Migrations navigation item renders only when the ledger table exists; the contract-table flag picks the joined or join-less ledger query. Stale `view=migrations` URLs against a database without a ledger show the view's empty state rather than breaking navigation.

## Snapshot Chain Derivation

Each migration's `contractBefore` is derived per contract space from the predecessor row's `contract_json`, guarded by hash continuity: the edge's `origin_core_hash` must equal the predecessor's `destination_core_hash` (the runner's marker CAS enforces this for graph-walk applies). When the guard fails (out-of-band drift around a synthesised apply, missing rows) or the predecessor carries no snapshot, `contractBefore` stays null — an unknown baseline renders as an empty before-state rather than a wrong one. A baseline migration (null `origin_core_hash`) keeps a null before-snapshot and diffs against the empty contract.

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

The per-migration header (title, hash edge, diff-stat chips, view controls) floats over the top edge of the canvas as a translucent backdrop-blurred bar, so the canvas owns the full height of the content pane.

## Detail Panels

Two mutually exclusive collapsible panels sit under the canvas in a shared container whose height is user-resizable from a drag handle on its top edge (pointer drag plus ArrowUp/ArrowDown, clamped 120–640px, persisted UI state):

- **SQL** renders the ledger row's operation envelopes verbatim — labels, operation classes, and executed statements.
- **Schema** renders a Prisma-schema-style diff. `psl-schema.ts` projects each contract snapshot into PSL-shaped text (model/enum blocks, mapped field types, defaults, relations, `@@index`/`@@unique`/`@@map`) and diffs the two texts line-by-line with the `diff` (jsdiff) package, collapsing long unchanged runs. The projection favors diff stability (fixed field ordering, no column alignment padding) over exact `prisma format` output. jsdiff was chosen over `@pierre/diffs` because the latter hard-depends on shiki, which is too heavy for the published bundle; the renderer is isolated in `MigrationSchemaPanel` so it can be swapped.

## Demo Seeding

`seed-migrations.ts` replays a fixture captured from the prisma-next `migrations-showcase` example (`demo/ppg-dev/fixtures/prisma-contract-migrations.json`): it recreates the `prisma_contract` schema (marker, ledger, and the 1:1 contract table), restores the marker and ledger rows plus one contract row per snapshot-carrying migration (ledger insert `RETURNING id`, after-state only — the fixture's `contract_json_before` values are intentionally not stored), and re-executes every operation's SQL in ledger order so the live schema matches the migration history exactly. A legacy demo volume seeded with the old two-column ledger is upgraded in place (snapshots moved into the contract table, bookend columns dropped). A few showcase rows are inserted so the resulting tables are browsable.
