---
"@prisma/studio-core": patch
---

Fix broken horizontal scrolling in wide data tables. The column virtualization window now follows scrolling synchronously and only re-renders the grid when the set of mounted columns changes, so scrolling no longer jumps between columns and the last column is reachable. Focused-cell auto-scroll now runs at most once per focus change, so clicking a cell to edit no longer snaps the viewport back and off-screen focus targets no longer fight user scrolling. Also corrects the virtualization window offset when columns are pinned.
