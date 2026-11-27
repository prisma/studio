---
"@prisma/studio-core": patch
---

Fix SQL editor lint markers: a statement that starts with a comment is no longer flagged as unsupported, Postgres errors now underline the right token instead of a spot 22 characters to the right, and missing names are matched as whole words outside comments and strings.
