---
"@prisma/studio-core": patch
---

# Fix SQLite date-like column edits producing NaN

SQLite columns declared as `date`, `datetime`, or `timestamp` get NUMERIC affinity, so Studio treated their date-string values as numbers and coerced edits to `NaN`. Date-like declared types are now edited as text and stored as-is, and numeric cell edits, pastes, and filters only coerce input to a number when it actually parses as one — non-numeric text is kept as text, matching SQLite's NUMERIC-affinity semantics, so `NaN` is never written.
