---
"@prisma/studio-core": patch
---

Declare `kysely` as a runtime dependency (`^0.28.20`) instead of bundling a private copy into `dist/`. This replaces the bundled kysely 0.28.10, which is affected by CVE-2026-32763, CVE-2026-33468 and CVE-2026-44635. Studio's `noParameters` mode on MySQL was exposed to CVE-2026-33468: a string value containing a backslash could break out of its inlined literal. Kysely now appears in your dependency tree, so `npm audit` and other dependency scanners can see it, your package manager can install future kysely patch releases without a new Studio release, and the `kysely` type imports in Studio's `.d.ts` files now resolve.
