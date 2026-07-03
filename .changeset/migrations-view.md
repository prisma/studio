---
"@prisma/studio-core": minor
---

Add a Prisma Next Migrations view. When the connected database carries a Prisma Next migration ledger (`prisma_contract.ledger`), Studio shows a Migrations navigation item with a newest-first timeline of every applied migration and a visual, FigJam-style diff canvas built from the contract snapshots stored in the ledger: added/removed/changed models as color-coded cards with per-field before → after details, enum cards, and relation edges. Includes an all-models toggle, collapsible SQL and Prisma-schema-diff panels behind a resizable split, a floating header over a full-height canvas, and a ~500ms morph transition when switching migrations.
