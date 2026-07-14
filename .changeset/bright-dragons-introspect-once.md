---
"@prisma/studio-core": minor
---

# Fix duplicate startup introspection requests

Avoid cancelling and repeating introspection requests when Studio initially mounts.
