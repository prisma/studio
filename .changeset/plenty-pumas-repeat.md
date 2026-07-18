---
"@prisma/studio-core": patch
---

Fix `TypeError: crypto.randomUUID is not a function` when Studio is served over plain HTTP on a non-localhost host (non-secure context, e.g. `http://192.168.x.x:5555`). UUID generation now falls back to a UUIDv4 built from `crypto.getRandomValues` when `crypto.randomUUID` is unavailable.
