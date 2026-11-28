---
"@prisma/studio-core": minor
---

Show which database Studio is connected to. The sidebar names the database above the schema, using the name the database reports (`current_database()`, `database()` or the SQLite file name) or a `databaseLabel` passed by the embedding host. A new `formatDatabaseLabel` helper strips credentials and query parameters from connection URLs, and an opt-in `documentTitle` prop puts the label in the browser tab title.

The schema picker becomes a compact switcher like Console's branch switcher, with a searchable list and a check on the current schema. Pressing Enter on a focused button or link now activates it instead of opening the focused table cell.
