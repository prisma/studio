---
"@prisma/studio-core": minor
---

The Migrations view, its navigation item and `readRecordedSchema` now read Prisma's tables from the `_prisma` schema, the name Prisma ORM 8.0 gives them, and fall back to `prisma_contract` for databases last changed by an ORM 8 release candidate. When both schemas exist, Studio reads `_prisma`. `@prisma/studio-core/data/migrations` no longer exports the `LEDGER_QUERY`, `LEDGER_QUERY_WITHOUT_CONTRACT` and `LEDGER_PROBE_QUERY` constants; they had the old schema name built in and have no replacement in the public API.
