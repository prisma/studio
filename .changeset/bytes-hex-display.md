---
"@prisma/studio-core": patch
---

Show binary columns (PostgreSQL `bytea`, MySQL/MariaDB `blob`/`binary`/`varbinary`, SQLite `BLOB`) as `\x`-prefixed hex instead of `[object Object]` or Buffer JSON, in table cells, SQL results and every copy path.
