---
"@prisma/studio-core": patch
---

Fix white page background around Studio in dark mode. When Studio runs in a full-page shell whose document has no host-authored background, the resolved theme now syncs to the document root (`color-scheme` plus Studio's background color), so overscroll areas and the space behind Studio's rounded corners match the active theme. Host pages that style their own `<html>`/`<body>` background are left untouched.
