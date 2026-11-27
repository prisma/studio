---
"@prisma/studio-core": patch
---

Ask before running SQL that changes data from the SQL tab. `DELETE`/`UPDATE` without `WHERE`, `DROP`, `TRUNCATE` and `ALTER TABLE ... DROP` always show a red warning naming the table; other writes show a plain prompt with a "Don't ask again" option that can be turned back on from the command palette. Reads never prompt.
