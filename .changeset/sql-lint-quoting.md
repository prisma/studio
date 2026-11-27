---
"@prisma/studio-core": patch
---

Fix SQL editor lint markers that fell back to the start of the statement: comment markers inside quoted identifiers and Postgres dollar-quoted strings are no longer read as comments, MySQL strings with backslash-escaped quotes are read correctly, and a missing table is marked even when its schema qualifier is quoted (for example `"main".orders`).
