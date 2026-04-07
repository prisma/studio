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
  - The surrounding stream chrome now also mixes a control-only header, a fixed footer summary cluster, follow-mode-specific scroll behavior, and a search-only footer progress fill with a scroll-trigger loading pulse that standard ShadCN layout primitives do not model as one reusable component.
  - No stock ShadCN component provides that event-log interaction model, so Studio keeps a custom composite while still building it from standard ShadCN primitives.

### Inline Stream Search Validation Message

- Canonical component:
  - [`ui/studio/input/ExpandableSearchControl.tsx`](ui/studio/input/ExpandableSearchControl.tsx)
- Closest standard ShadCN alternatives:
  - `Command`
  - `Popover`
  - `Alert`
- Why it stays non-standard:
  - The stream header search needs syntax feedback and context-aware suggestions that stay visually attached to the expanding inline field without introducing a portal-backed overlay or a full alert block inside the header chrome.
  - Studio therefore keeps a custom anchored assist panel directly under the input, while still building the suggestion list from standard ShadCN `Command` primitives.
  - Keeping the feedback and suggestions inline avoids the layering and focus issues of a separate popover in this compact header layout, and it lets the suggestion list open immediately with starter field suggestions, stay content-sized above the sticky header row, hold partial field prefixes locally, preserve a stable keyboard selection during background refreshes, and still draw value candidates from remembered rows even when the currently visible filtered result set is empty.

### Stream Routing Key Selector

- Canonical components:
  - [`ui/studio/views/stream/StreamRoutingKeySelector.tsx`](ui/studio/views/stream/StreamRoutingKeySelector.tsx)
  - [`ui/hooks/use-stream-routing-keys.ts`](../ui/hooks/use-stream-routing-keys.ts)
- Closest standard ShadCN alternatives:
  - `Popover`
  - `Command`
  - `Input`
- Why it stays non-standard:
  - The stream header needs a compact routing-key picker that can sit beside the expanding search field, page through a potentially massive lexicographically sorted keyspace, and still support keyboard-first selection without rendering every key at once.
  - The API only exposes cursor-based routing-key pages, and the selector now also owns a clearable selected-key state that must work even when the stream has no search schema.
  - When a key is selected, the closed trigger also needs to expand into a compact inline pill that keeps the chosen routing key visible without stealing the full search-field slot.
  - Studio therefore keeps a custom popover composite with a prefix input, a virtualized infinite list, and a hover-only clear affordance on the trigger itself instead of trying to force that behavior into a stock `Command` list.

### Stream Aggregation Strip

- Canonical components:
  - [`ui/studio/views/stream/StreamAggregationsPanel.tsx`](ui/studio/views/stream/StreamAggregationsPanel.tsx)
  - [`ui/studio/views/stream/StreamView.tsx`](ui/studio/views/stream/StreamView.tsx)
- Closest standard ShadCN alternatives:
  - `Card`
  - `Button`
  - `Popover`
- Why it stays non-standard:
  - The stream view needs a compact, single-band aggregation surface that mixes horizontally scrollable metric cards, inline sparkline backgrounds, quick time-range toggles, follow-mode-driven refresh behavior, and a small custom-range popover directly above an independently scrollable event log.
  - No stock ShadCN component covers that event-log-adjacent observability layout, especially once each metric column has to support fixed-width horizontal scrolling, stacked percentile cards with plain-text secondary labels, auto-scaled unit display, TanStack DB-backed per-series preferences that survive range switches and stream navigation, hover-revealed dropdown controls without reflowing the card chrome, and a tighter split date/time absolute-range editor instead of the browser's native `datetime-local` chrome.
- Required internals:
  - `Badge`
  - `Button`
  - `Card`
  - `DropdownMenu`
  - `Input`
  - `Label`
  - `Popover`
  - `Skeleton`

### Stream Footer Diagnostics Popover

- Canonical components:
  - [`ui/studio/views/stream/StreamDiagnosticsPopover.tsx`](ui/studio/views/stream/StreamDiagnosticsPopover.tsx)
  - [`ui/studio/views/stream/StreamView.tsx`](ui/studio/views/stream/StreamView.tsx)
- Closest standard ShadCN alternatives:
  - `Popover`
  - `Card`
  - `Badge`
- Why it stays non-standard:
  - Studio needs a compact, stream-specific diagnostics surface anchored to the footer summary itself, mixing logical payload size, explicit object-storage and local-storage buckets, node-local request accounting, search-family coverage, and state-aware run-accelerator status in one dense popover.
  - The storage breakdowns also need collapsible ledger-style accounting boxes whose headers surface the section totals when folded shut, plus faint shared-cap annotations that sit beside right-aligned byte values and one shared cap marker spanning both Routing and Exact cache rows, which is not a stock ShadCN pattern.
  - No stock ShadCN pattern covers that descriptor-driven observability layout, especially when the UI must distinguish logical bytes from physical storage signals, separate search coverage from historical run indexes, hide unconfigured routing rows, and keep the remaining cost caveats explicit instead of inventing unavailable totals.

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
  - Custom sidebar sections, shared inline search-and-refresh disclosure for both tables and streams, custom sidebar item primitive, and a draggable resize separator on the sidebar edge.
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
