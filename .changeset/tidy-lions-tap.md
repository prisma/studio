---
"@prisma/studio-core": patch
---

Fix saving staged cell edits silently failing for rows loaded beyond the first batch when infinite scroll is enabled. Row update, delete, and insert mutations now target the same rows-collection scope the grid displays instead of the paginated first page.
