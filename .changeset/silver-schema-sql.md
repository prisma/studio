---
"@prisma/studio-core": minor
---

Fix schema-aware SQL execution, linting, and Studio navigation so SQL queries and diagnostics resolve unqualified identifiers against the selected schema instead of always relying on the adapter default schema.
