---
"@prisma/studio-core": minor
---

Add a Prisma Next Migrations view. When the connected database carries a Prisma Next migration ledger (`prisma_contract.ledger`) with at least one applied migration, Studio shows a Migrations navigation item with a newest-first timeline of every applied migration — name, apply time, operation count, destructive-change markers, and compact `+`/`−`/`~` chips summarizing what each migration changed.

Selecting a migration renders a visual, FigJam-style diff canvas built from the contract snapshots Prisma Next records alongside the ledger: added, removed, and changed models as color-coded cards with per-field before → after details (type, nullability, defaults, primary keys), enum cards, and relation edges. An All models toggle expands to the migration's full schema, switching migrations morphs the canvas over ~500ms instead of rebuilding it, and the selected migration is URL-addressable.

Collapsible detail panels behind a drag-resizable split show the executed SQL per operation and a Prisma-schema-style line diff of the before/after schema, with long unchanged runs collapsed into click-to-expand folds.

Databases whose ledger predates contract snapshots keep the timeline and SQL panel and show an update notice in place of the canvas. Requires a database migrated with a Prisma Next version that records contract snapshots for the visual and schema diffs.
