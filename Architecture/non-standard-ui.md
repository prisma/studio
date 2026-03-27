# Non-Standard UI Architecture

This document is normative for deliberate exceptions to standard ShadCN UI components.

Studio UI MUST default to standard ShadCN components and standard ShadCN composition patterns. Non-standard UI is allowed only when a product-specific interaction or layout cannot be expressed cleanly with the available ShadCN components.

## Rules

- Start from existing ShadCN components before introducing custom UI structure or styling.
- When a non-standard UI composite is necessary, keep its internals built from standard ShadCN primitives as much as possible.
- Every non-standard UI instance MUST be documented here with the reason it exists.
- User-facing implementation summaries MUST explicitly call out when a change uses a non-standard UI component or composite.

## Audit Scope

This inventory focuses on reusable UI patterns and named components in `ui/studio` and `ui/components/ui`.

It deliberately excludes:

- plain layout wrappers with no product interaction
- one-off typography spans or icon containers
- low-level data rendering cells where no meaningful ShadCN abstraction exists

## Approved Non-Standard UI

### DataGrid Pagination Control Group

- Canonical component:
  - [`ui/studio/grid/DataGridPagination.tsx`](ui/studio/grid/DataGridPagination.tsx)
- Closest standard ShadCN alternative:
  - `Pagination`
- Why it stays non-standard:
  - Studio needs a dense table-footer control that combines icon pagination, an editable page input, a preset rows-per-page dropdown, and an infinite-scroll toggle in one inline cluster.
  - The stock ShadCN `Pagination` component is page-link oriented and does not support this table-specific control model.
- Required internals:
  - `Button`, `Input`, `DropdownMenu`, `Switch`, `Label`

### Spreadsheet Cell Editor Popovers

- Canonical components:
  - [`ui/components/ui/popover-cell.tsx`](ui/components/ui/popover-cell.tsx)
  - [`ui/studio/cell/WriteableCell.tsx`](ui/studio/cell/WriteableCell.tsx)
- Closest standard ShadCN alternative:
  - `Popover`
- Why it stays non-standard:
  - Cell editing needs spreadsheet-specific behavior: commit on click-away, close on `Enter`/`Esc`, directional keyboard navigation, and tight sizing against the underlying grid cell.
  - The standard ShadCN `Popover` primitive does not provide that interaction contract by itself.

### Inline Filter Pills

- Canonical component:
  - [`ui/studio/views/table/InlineTableFilters.tsx`](ui/studio/views/table/InlineTableFilters.tsx)
- Closest standard ShadCN alternatives:
  - `Badge`, `Input`, `Select`, `Popover`, `DropdownMenu`
- Why it stays non-standard:
  - Studio needs editable filter pills that remain inline above the grid, preserve URL-backed filter semantics, and support compact keyboard-first authoring without opening a separate modal or panel.
  - That interaction is closer to a spreadsheet formula bar than to a standard ShadCN form or menu pattern.

### Grid Column Header Controls

- Canonical component:
  - [`ui/studio/grid/DataGridHeader.tsx`](ui/studio/grid/DataGridHeader.tsx)
- Closest standard ShadCN alternatives:
  - `ToggleGroup`, `DropdownMenu`
- Why it stays non-standard:
  - The grid requires an inline hover/focus pin-sort pill plus a full-height resize affordance on the same header boundary.
  - The architecture explicitly requires inline controls instead of dropdown-driven header actions.

### Stream Event List Rows

- Canonical component:
  - [`ui/studio/views/stream/StreamView.tsx`](ui/studio/views/stream/StreamView.tsx)
- Closest standard ShadCN alternatives:
  - `Card`
  - `Badge`
  - `Tooltip`
  - `Skeleton`
- Why it stays non-standard:
  - The stream view needs a dense multi-column summary row with inline expansion, single-open-row behavior, clipped preview text, and infinite-scroll loading inside one scroll container.
  - The same custom row composite also carries the short-lived highlight animation for newly revealed events, which needs to live on the exact row shell that preserves stream-scroll anchoring.
  - No stock ShadCN component provides that event-log interaction model, so Studio keeps a custom composite while still building it from standard ShadCN primitives.

## Standardization Candidates

These are the current high-signal places where Studio is bypassing a plausible standard ShadCN component or composition pattern.

### Introspection Status Notice

- Files:
  - [`ui/studio/IntrospectionStatusNotice.tsx`](ui/studio/IntrospectionStatusNotice.tsx)
- Current UI:
  - Hand-built bordered warning/error callout with retry action and inline query preview.
- Plausible standard ShadCN alternative:
  - `Alert` with `Button`
- Confidence:
  - High

### Input Action Footer

- Files:
  - [`ui/studio/input/InputActions.tsx`](ui/studio/input/InputActions.tsx)
- Current UI:
  - Raw buttons with keyboard-hint `kbd` boxes for save/cancel actions.
- Plausible standard ShadCN alternative:
  - `Button`
- Confidence:
  - High

### Enum Option Picker

- Files:
  - [`ui/studio/input/EnumInput.tsx`](ui/studio/input/EnumInput.tsx)
- Current UI:
  - Raw button list styled with `badgeVariants`.
- Plausible standard ShadCN alternative:
  - `ToggleGroup` for small option sets
  - `Select` or `Command` for larger option sets
- Confidence:
  - Medium

### Sidebar Navigation Shell

- Files:
  - [`ui/studio/Navigation.tsx`](ui/studio/Navigation.tsx)
- Current UI:
  - Custom sidebar sections, custom table search disclosure, custom sidebar item primitive.
- Plausible standard ShadCN alternative:
  - `Sidebar`
  - standard sidebar/menu composition
- Confidence:
  - Medium

### Schema Legend

- Files:
  - [`ui/studio/views/schema/SchemaView.tsx`](ui/studio/views/schema/SchemaView.tsx)
- Current UI:
  - Hand-built legend chips for primary key, nullable, and foreign key markers.
- Plausible standard ShadCN alternative:
  - `Badge`
- Confidence:
  - High

### Schema Visualizer Table Nodes

- Files:
  - [`ui/studio/views/schema/Visualiser.tsx`](ui/studio/views/schema/Visualiser.tsx)
- Current UI:
  - Hand-built card shell, custom empty-node message, custom field icon chips.
- Plausible standard ShadCN alternative:
  - `Card`
  - `Badge`
  - `Alert` or `Empty` for the no-tables node
- Confidence:
  - Medium

### Grid Empty State And Loading Bar

- Files:
  - [`ui/studio/grid/DataGrid.tsx`](ui/studio/grid/DataGrid.tsx)
  - [`ui/studio/grid/DataGridLoadingBar.tsx`](ui/studio/grid/DataGridLoadingBar.tsx)
- Current UI:
  - Custom empty-state message block and custom indeterminate top loading bar.
- Plausible standard ShadCN alternative:
  - `Empty`
  - `Progress`
- Confidence:
  - Medium

### Filter Tree Help And Empty States

- Files:
  - [`ui/studio/views/table/FilterTree.tsx`](ui/studio/views/table/FilterTree.tsx)
- Current UI:
  - Raw `div` blocks for the help popover preview and empty-state treatment inside the filter tree.
- Plausible standard ShadCN alternative:
  - `Card`
  - `Alert`
  - `Empty`
- Confidence:
  - Medium

### SQL Result Visualization Strip

- Files:
  - [`ui/studio/views/sql/SqlResultVisualization.tsx`](ui/studio/views/sql/SqlResultVisualization.tsx)
  - [`ui/studio/views/sql/SqlView.tsx`](ui/studio/views/sql/SqlView.tsx)
- Current UI:
  - Borderless Chart.js canvas injected into a `DataGrid` header row, wrapped in a custom sticky white band with centered/clamped sizing, plus a custom text-and-icon visualization trigger placed on the SQL result summary line.
- Plausible standard ShadCN alternative:
  - `Card`
  - `Button`
  - No standard ShadCN chart primitive exists; the chart body must remain custom.
- Confidence:
  - High
