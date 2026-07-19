# Product

## Register

product

## Users

Prisma developers and operators using Studio inside CLI, Console, or embedded host surfaces to inspect data, debug streams and query behavior, edit rows, run SQL, and understand database or stream state while actively working.

## Product Purpose

Prisma Studio provides an embeddable visual database and Streams workbench for exploring schema, browsing and editing data, filtering and searching records, inspecting query activity, and following stream event history. Success means users can move from live operational signals to the underlying data or stream events without leaving the task surface.

## Brand Personality

Precise, calm, operational. The interface should feel like a trustworthy Prisma tool: dense when needed, restrained, predictable, and respectful of existing host product chrome.

## Anti-references

Avoid decorative dashboards, marketing-style hero layouts, over-designed cards, non-standard controls, custom UI that bypasses ShadCN without justification, compatibility fallback paths, and noisy status copy that distracts from the active workflow.

## Design Principles

- Make current state inspectable: expose enough status, coverage, and diagnostics for operators to trust what they are seeing.
- Keep workflows close to the data: navigation, filters, query details, and stream diagnostics should connect directly to the relevant row, query, request, or event.
- Use familiar controls first: ShadCN primitives, standard table, sheet, and popover patterns, and existing Studio conventions should carry new features.
- Preserve task flow: background refresh, live updates, and AI helpers should assist without stealing focus or changing visible state unexpectedly.
- Stay embeddable: Studio owns its internal interaction model while leaving auth, routing, tenancy, and product chrome to the host.

## Accessibility & Inclusion

Target accessible product UI behavior: keyboard navigation for controls, visible focus states, readable contrast, reduced-motion-safe state changes, and screen-reader labels for icon-only actions.
