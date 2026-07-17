---
"@prisma/studio-core": patch
---

Fix MySQL introspection failing on MariaDB. The adapter now detects MariaDB via `select version()` and aggregates column metadata with `group_concat(json_object(...))` instead of `json_arrayagg`, which does not exist before MariaDB 10.5 and cannot be cast to JSON on any MariaDB version. String-aggregated introspection payloads are parsed on the client, which also hardens introspection against transports that return `json_arrayagg` results as strings.
