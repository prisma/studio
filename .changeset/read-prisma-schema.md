---
"@prisma/studio-core": minor
---

Read Prisma's migration tables from the `_prisma` schema, the name Prisma ORM 8.0.0 gives them, and keep reading `prisma_contract` for databases that have not been migrated by the new release yet. When both schemas exist, Studio reads `_prisma`. This covers the Migrations view, its navigation item and `readRecordedSchema`. `@prisma/studio-core/data/migrations` now exports the ledger queries as functions of the schema (`ledgerQuery`, `ledgerQueryWithoutContract`, `ledgerProbeQuery`) in place of the `LEDGER_QUERY`, `LEDGER_QUERY_WITHOUT_CONTRACT` and `LEDGER_PROBE_QUERY` constants.
