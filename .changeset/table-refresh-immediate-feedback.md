---
"@prisma/studio-core": patch
---

Fix the "Refresh table" button giving no immediate feedback. The button now spins and disables for the whole refresh (schema re-introspection plus the row refetch), and a failed refresh keeps the last successfully loaded rows visible with an inline error notice (message, source, failed SQL preview, and retry) instead of only a generic message-less toast. Operation-error toasts now also include the underlying error message as their description.
