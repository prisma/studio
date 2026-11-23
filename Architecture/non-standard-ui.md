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

### Stream Request Observability Sheet

- Canonical components:
  - [`ui/studio/views/stream/StreamObserveSheet.tsx`](../ui/studio/views/stream/StreamObserveSheet.tsx)
  - [`ui/studio/views/stream/StreamObserveTimelineSection.tsx`](../ui/studio/views/stream/StreamObserveTimelineSection.tsx)
  - [`ui/studio/views/stream/StreamObserveTraceSection.tsx`](../ui/studio/views/stream/StreamObserveTraceSection.tsx)
  - [`ui/studio/views/stream/StreamObserveEventSection.tsx`](../ui/studio/views/stream/StreamObserveEventSection.tsx)
  - [`ui/hooks/use-stream-observe-request.ts`](../ui/hooks/use-stream-observe-request.ts)
- Closest standard ShadCN alternatives:
  - `Sheet`
  - `ToggleGroup`
  - `Table`
  - `Badge`
  - `Skeleton`
- Why it stays non-standard:
  - The request detail surface needs to combine a merged event/span timeline, a trace waterfall with proportional span bars, expandable raw span details, service-call edges, root-cause event fields, source stream labels, and coverage warnings in one compact sheet.
  - ShadCN provides the surrounding primitives, but no stock component models that request-correlation workflow or the proportional waterfall rows.
  - The section selector still uses `ToggleGroup`, the shell uses `Sheet`, and the status chips use `Badge`; only the request-specific timeline and waterfall composition remain custom.

### Queries Live Table And Detail Sheet

- Canonical component:
  - [`ui/studio/views/queries/QueriesView.tsx`](ui/studio/views/queries/QueriesView.tsx)
- Closest standard ShadCN alternatives:
  - `Table`
  - `Card`
  - `Sheet`
  - `Select`
  - `ToggleGroup`
  - `Badge`
  - `Skeleton`
- Why it stays non-standard:
  - Query insights need a live operational table with provider-driven polling, a live activity chart, table filtering, sort controls, row selection, and previous/next navigation inside a detail sheet.
  - The activity chart is a Studio-specific SVG timeline that derives throughput and latency from snapshot deltas, supports a bounded time-window switcher, and exposes point-level hover readings. No standard ShadCN chart primitive covers that observability display.
  - The same surface conditionally embeds AI recommendations when Studio's shared `llm` hook is available, while disappearing entirely when the embedder does not provide query-insights data.
  - No stock ShadCN component models that combined observability workflow, so Studio keeps a custom composite built from standard ShadCN primitives.

### Temporal Workbench Composites

- Canonical components:
  - [`ui/studio/views/temporal/TemporalPrimitives.tsx`](../ui/studio/views/temporal/TemporalPrimitives.tsx)
  - [`ui/studio/views/temporal/TemporalExecutionDebugger.tsx`](../ui/studio/views/temporal/TemporalExecutionDebugger.tsx)
- Closest standard ShadCN alternatives:
  - `Badge`, `ToggleGroup`, `Table`, `Sheet`, `AlertDialog`, `Tabs`
- Why it stays non-standard:
  - The Execution Debugger needs a Gantt timeline whose rows share one time axis with proportional span bars, and expandable span and raw-event rows. No ShadCN component models a proportional timeline.
  - The inspector's `Interact` / `Pending` / `Meta` tab strip is a hand-built `tablist`, because Studio does not ship the ShadCN `Tabs` component. It sets `role="tab"`, `aria-selected`, `aria-controls`, a `tabpanel`, and arrow-key movement itself. Replace it with `Tabs` if Studio adds that component.
  - `TemporalStatusBadge` wraps `Badge` so every Temporal status uses one of five tones with an ink-coloured label and a coloured icon. `TemporalSegmentedControl` wraps `ToggleGroup` for the refresh mode, history view, and interaction type switches.
- Required internals:
  - `Badge`, `Button`, `ToggleGroup`, `Table`, `Input`, `Textarea`, `Select`, `Sheet`, `Dialog`, `AlertDialog`, `DropdownMenu`, `Skeleton`

### Temporal Timeline

- Files:
  - [`ui/studio/views/temporal/TemporalTimeline.tsx`](ui/studio/views/temporal/TemporalTimeline.tsx)
  - [`data/temporal/timeline-scale.ts`](data/temporal/timeline-scale.ts)
- Current UI:
  - Rows of positioned bars on a shared time axis inside one scroll container, with a sticky label column, a sticky duration column, a sticky axis row, hatched bands for shortened idle time, zoom on Ctrl or Cmd with the wheel, and a `role="separator"` strip that resizes the panel by dragging.
  - A vertical line and a time label that follow the pointer, and a details card for the row under it. Both are moved through refs on `pointermove`, so no row renders again. The card is `aria-hidden`: the label buttons open the same details in the span list for keyboard users.
- Why not a standard component:
  - ShadCN has no Gantt or timeline component. The bars need positions computed from a piecewise time scale, and the wheel listener must be attached as non-passive to stop the browser's page zoom, which React's `onWheel` cannot do.
- Plausible standard ShadCN alternative:
  - `Table` for the rows (without the time axis)
  - `Resizable` for the panel height, if the package is added
- Confidence:
  - Medium

### Temporal Search Field Suggestions

- Files:
  - [`ui/studio/views/temporal/TemporalSearchField.tsx`](ui/studio/views/temporal/TemporalSearchField.tsx)
- Current UI:
  - A text field with `role="combobox"` and a `role="listbox"` of suggestions in a ShadCN `Popover` anchored to the field. The options are `div` elements that never take the focus; `aria-activedescendant` names the chosen one.
- Why not a standard component:
  - The ShadCN `Command` component filters a fixed list by its whole input. Here the suggestions depend on the cursor position inside a longer text, and accepting one replaces a part of that text and moves the cursor.
- Plausible standard ShadCN alternative:
  - `Command` inside a `Popover`, for a field that holds one value
- Confidence:
  - Medium

### Temporal Run Path

- Files:
  - [`ui/studio/views/temporal/TemporalRunBreadcrumb.tsx`](ui/studio/views/temporal/TemporalRunBreadcrumb.tsx)
- Current UI:
  - A `nav` in the header of a run: links for the Workflow Type and the Workflow ID, a ShadCN `DropdownMenu` for the run, copy buttons, and chevrons between them.
- Why not a standard component:
  - The repository has no ShadCN `Breadcrumb` component, and the last part is a menu of sibling runs, which that component does not have.
- Plausible standard ShadCN alternative:
  - `Breadcrumb` with a `DropdownMenu` in its last item
- Confidence:
  - High

### Temporal Combobox

- Files:
  - [`ui/studio/views/temporal/TemporalCombobox.tsx`](ui/studio/views/temporal/TemporalCombobox.tsx)
- Current UI:
  - A text field with `role="combobox"`, a button that opens the whole list, and a `role="listbox"` in a ShadCN `Popover` anchored to the field. Used for Workflow Type and Task Queue in the Start Workflow form. The field keeps the focus; the arrow keys choose an item and Enter or Tab takes it. A value that is not in the list stays in the field.
- Why not a standard component:
  - The ShadCN `Select` allows only listed values, and a `Command` in a `Popover` puts its search field inside the popover, so the form field itself would be a button. A Workflow Type can exist on a Worker before any run used it, so the field must take free text.
- Plausible standard ShadCN alternative:
  - `Command` inside a `Popover` with an item "Use the typed text"
- Confidence:
  - Medium

### Temporal Input Editor

- Files:
  - [`ui/studio/views/temporal/TemporalJsonEditor.tsx`](ui/studio/views/temporal/TemporalJsonEditor.tsx)
  - [`data/temporal/input-suggestions.ts`](data/temporal/input-suggestions.ts)
- Current UI:
  - A CodeMirror editor for the input of a new Workflow run, with JSON colouring and a list of suggested keys and values from recent runs. It uses the same libraries and colour rules as the SQL editor.
- Why not a standard component:
  - The ShadCN `Textarea` has no completion at the cursor and no syntax colouring.
- Plausible standard ShadCN alternative:
  - `Textarea` with the "Recent Inputs" menu only
- Confidence:
  - High

### Temporal Run Preview

- Files:
  - [`ui/studio/views/temporal/TemporalRunPreview.tsx`](ui/studio/views/temporal/TemporalRunPreview.tsx)
  - [`data/temporal/run-steps.ts`](data/temporal/run-steps.ts)
- Current UI:
  - A list of steps in the fold-out of a Workflows grid row. Each row has a status icon, the step name, a track with one positioned bar for each time the step ran (a diamond for a Signal or an Update), and the total duration. A grey band marks time that is not drawn to scale. The tracks are `aria-hidden`; the name, count and duration carry the same facts as text.
- Why not a standard component:
  - ShadCN has no timeline. The bars need the same piecewise time scale as the Temporal Timeline.
- Plausible standard ShadCN alternative:
  - `Table` with the step name, count and duration (without the tracks)
- Confidence:
  - Medium

### Temporal Workflow Type Diagram

- Files:
  - [`ui/studio/views/temporal/TemporalTypeMapCanvas.tsx`](ui/studio/views/temporal/TemporalTypeMapCanvas.tsx)
  - [`ui/studio/views/temporal/TemporalRunDiagram.tsx`](ui/studio/views/temporal/TemporalRunDiagram.tsx)
  - [`ui/studio/views/temporal/temporal-type-map-layout.ts`](ui/studio/views/temporal/temporal-type-map-layout.ts)
- Current UI:
  - A React Flow canvas with one node per step of a Workflow Type, a pill for the start and one for each closing status, and arrows with the number of runs that took them. The run screen shows the same canvas with one run marked on it (`TemporalRunDiagram.tsx`), plus a stepper bar above the canvas with ShadCN `Button` controls and a native `<input type="range">` slider that moves through the run's steps. The arrows follow routes that ELK computes around the nodes. Nodes cannot be moved. A click selects a node, and a panel under the canvas then lists its facts and runs as text and buttons.
- Why not a standard component:
  - ShadCN has no graph. The schema visualizer already uses React Flow and ELK, so the diagram uses the same two libraries.
  - The repository does not ship the ShadCN `Slider` component, so the history stepper uses a native range input styled with `accent-foreground` alongside ShadCN `Button` controls.
- Plausible standard ShadCN alternative:
  - `Table` with one row per step: runs, failures, median duration (without the order of the steps)
  - `Slider`, if Studio adds that ShadCN component
- Confidence:
  - Medium

### Temporal Grid Column Resize Handles

- Files:
  - [`ui/studio/views/temporal/TemporalWorkflowsGrid.tsx`](ui/studio/views/temporal/TemporalWorkflowsGrid.tsx)
- Current UI:
  - A `role="separator"` strip on the right edge of each column header. Dragging it changes that column's `<col>` width in a fixed-layout ShadCN `Table`.
- Why not a standard component:
  - The ShadCN `Table` has no column resizing. The database grid's resizing belongs to its own data-grid component, which the Temporal grid does not use because its rows expand inline.
- Plausible standard ShadCN alternative:
  - `Resizable` panels do not apply to table columns; a data-table built on TanStack Table would.
- Confidence:
  - Medium

## Standardization Candidates

These are the current high-signal places where Studio is bypassing a plausible standard ShadCN component or composition pattern.

### Migration Diff Canvas Cards

- Canonical components:
  - [`ui/studio/views/migrations/MigrationsView.tsx`](ui/studio/views/migrations/MigrationsView.tsx)
  - [`ui/schema-diff/diff-layout.ts`](../ui/schema-diff/diff-layout.ts)
- Closest standard ShadCN alternative:
  - `Card` with `Badge`
- Why it stays non-standard:
  - Studio, Console, and MCP hosts share `ui/schema-diff/SchemaDiff.tsx`; the Migrations view renders model/enum diff cards as React Flow custom nodes on a pan/zoom canvas with ELK layout; ShadCN `Card` cannot express canvas nodes with connection handles, status-driven color systems, or per-field diff glyph rows.
  - The FigJam-inspired treatment (status-colored sticky-note cards, tape accents, deterministic tilt, before → after change pills) is a deliberate product decision for this view so schema changes read as an approachable visual story rather than a table.
- Required internals:
  - `Badge`, `Button`, `Skeleton` for the surrounding chrome; the timeline list items are custom buttons because they combine an index chip, name, timestamp, and diff-stat chips in one selectable row, which `Button` alone does not model.

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

### Sidebar Service Switcher

- Files:
  - [`ui/studio/Navigation.tsx`](ui/studio/Navigation.tsx)
- Current UI:
  - A row of anchors styled as a segmented control, one per connected data service. A layout effect sets `data-mode` to the widest form that fits (`full`, `text`, `compact`), and the open service is marked with `aria-current="page"`.
- Why not a standard component:
  - Each entry must be a real link that carries the service's last location, so it can be opened in a new tab and works with the browser history. `ToggleGroup` and `Tabs` render buttons and keep their own selection state, which would duplicate the `view` URL param.
- Plausible standard ShadCN alternative:
  - `ToggleGroup`
  - `Tabs`
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
  - [`ui/components/charts`](ui/components/charts)
- Current UI:
  - Bklit ShadCN chart primitives injected into a `DataGrid` header row, wrapped in a custom sticky background band with centered/clamped sizing, plus a custom text-and-icon visualization trigger placed on the SQL result summary line.
- Plausible standard ShadCN alternative:
  - `Card`
  - `Button`
  - The Bklit registry components provide the chart primitives, but the SQL result surface still needs a custom `DataGrid.getBeforeHeaderRows(...)` composition so the chart scrolls with the result grid.
- Confidence:
  - High
