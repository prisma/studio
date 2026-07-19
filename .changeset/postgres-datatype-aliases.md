---
"@prisma/studio-core": patch
---

# Show common PostgreSQL type aliases

Display native PostgreSQL catalog type names by their common SQL aliases (`int8` -> `bigint`, `int4` -> `integer`, `int2` -> `smallint`, `float8` -> `double precision`, `float4` -> `real`, `bool` -> `boolean`, `bpchar` -> `char`) in the table header, filter column picker, and schema visualizer, including array types (`int8[]` -> `bigint[]`).
