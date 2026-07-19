---
"@prisma/studio-core": patch
---

Fix PostgreSQL enum array cell updates failing with "Update Operation failed" by always writing array values as explicit `array[...]` expressions with an array-type cast instead of relying on driver-specific array parameter serialization. Also preserve the original error name when errors are deserialized from the Studio BFF transport.
