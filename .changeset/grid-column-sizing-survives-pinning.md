---
"@prisma/studio-core": patch
---

Fix grid column widths being reset when columns are pinned or unpinned. Resizing a column and then changing any column's pin state (which round-trips through the URL-backed `pinnedColumnIds` prop) wiped all user column widths and custom column ordering back to defaults. The reset now only happens when the set of columns itself changes.
