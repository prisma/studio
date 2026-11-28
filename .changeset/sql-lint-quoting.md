---
"@prisma/studio-core": patch
---

Fix SQL editor lint markers that fell back to the start of the statement or landed on the wrong text. Comment markers inside quoted identifiers and Postgres dollar-quoted strings are no longer read as comments, and MySQL strings with backslash-escaped quotes or double quotes are read correctly. A name that only appears inside a quoted alias or a string is no longer marked in place of the table, and a missing table is marked even when its schema qualifier is quoted (for example `"main".orders`).
