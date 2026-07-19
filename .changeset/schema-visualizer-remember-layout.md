---
"@prisma/studio-core": minor
---

Remember the schema visualizer's manual table layout. Dragged node positions are now stored in localStorage-backed UI state scoped per schema, so a manual arrangement survives leaving the visualizer and full page reloads. Tables without a remembered position (for example newly created ones) fall back to ELK auto-layout, and the `Reset layout` action clears the remembered layout.
