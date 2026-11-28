---
"@prisma/studio-core": minor
---

Show which database Studio is connected to. The sidebar names the database above the schema picker, using the name the database reports (`current_database()`, `database()` or the SQLite file name) or a `databaseLabel` passed by the embedding host. A new `formatDatabaseLabel` helper strips credentials and query parameters from connection URLs, and an opt-in `documentTitle` prop puts the label in the browser tab title.
