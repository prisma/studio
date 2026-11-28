---
"@prisma/studio-core": patch
---

Make row selection clear and accessible. Selected rows show a quiet tick in the first column instead of relying on a faint tint, and the column works like checkboxes: click to tick or untick a row, drag to tick (or, starting on a ticked row, untick) a range, and use the header box to see when some rows are selected and clear them in one click. Screen readers now hear each row's selection state and a status such as "3 rows selected". Selecting rows no longer remounts every cell in the grid. Selected cell ranges now use the same plain tint as rows, without a box around every cell.
