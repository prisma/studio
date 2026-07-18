---
"@prisma/studio-core": patch
---

Fix MySQL introspection failing on MariaDB. The adapter now detects MariaDB via `select version()` and uses a dedicated tables query that returns one row per column and groups the result on the client, avoiding `json_arrayagg` (missing before MariaDB 10.5), JSON casts (invalid syntax on MariaDB), and any server-side string aggregation that would be truncated at `group_concat_max_len`. Introspection also parses string-encoded `json_arrayagg` payloads returned by some MySQL transports.
