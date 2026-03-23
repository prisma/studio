# Column Header Controls Architecture

This document is normative for DataGrid column-header controls.

Column headers MUST use inline pin/sort controls in a compact overlay pill. Dropdown-based header controls are not allowed.

## Scope

This architecture governs:

- inline pin control behavior and visuals
- inline sort control behavior and visuals
- column resize handle geometry
- hover vs active visibility rules
- interaction contracts for pin/sort toggles

## Canonical Components

- [`ui/studio/grid/DataGridHeader.tsx`](../ui/studio/grid/DataGridHeader.tsx)
- [`ui/studio/grid/DataGridHeader.test.tsx`](../ui/studio/grid/DataGridHeader.test.tsx)
- [`ui/studio/views/table/ActiveTableView.tsx`](../ui/studio/views/table/ActiveTableView.tsx)

## Non-Negotiable Rules

- Header controls MUST be rendered inline in a tight, pill-shaped container on the right edge of the header.
- The controls pill MAY overlap header text and MUST NOT reflow header layout.
- Dropdown menus for pin/sort actions MUST NOT be used.

## Visibility Contract

- If neither pin nor sort is active for a column:
  - controls pill MUST be hidden by default
  - controls pill MUST fade in on header hover/focus
- If either pin or sort is active:
  - controls pill MUST remain visible even when the header is not hovered

## Pin Control Contract

- The pin control MUST use the existing pin icon.
- Active (pinned) state MUST render the icon in foreground/black.
- Inactive state MUST render the icon in muted grey.
- Clicking pin toggles:
  - unpinned -> left pinned
  - pinned -> unpinned
- When pinning or drag reordering repositions a column, the affected header and visible cells MUST animate into their new positions with CSS transform transitions so the user can track the movement instead of seeing an abrupt jump.

## Sort Control Contract

- The sort control MUST support exactly three stages:
  - `none -> asc -> desc -> none`
- Icon behavior:
  - active `asc`: up arrow in foreground/black
  - active `desc`: down arrow in foreground/black
  - inactive `none`: up arrow in muted grey
- Active sort icon MUST remain visible even when not hovering.

## Interaction Requirements

- Pin/sort button clicks MUST stop propagation so they do not interfere with column drag/resize interactions.
- Column resize handles MUST be centered on the real header boundary, not shifted inward from it.
- Column resize handles MUST expose a forgiving full-height hit target so resizing does not depend on pixel-perfect pointer placement.
- Narrowing a column MUST clip header content instead of letting metadata or labels force the column back open.
- Grid column sizing defaults MUST cap widths at 400px unless a column definition explicitly overrides that bound.
- Sort toggling MUST be deterministic and not rely on implicit menu order.
- Header drag reorder MUST be constrained within the current pinning zone (`left`, `center`, `right`).
- Dragging a pinned column over an unpinned column (or the reverse) MUST NOT preview a reorder and MUST NOT commit a reorder.
- While dragging across incompatible zones, the dragged header MUST continue to follow the pointer without reflowing other headers.
- If the pointer is released without a direct compatible drop target, drag resolution SHOULD use the last compatible hover target (or directional in-zone fallback) to avoid flaky no-op drops.
- The sticky top-left row-selection spacer header MUST remain above the pinned row-selector body cells while scrolling, so the corner header never gets occluded by the left selector column.

## Testing Requirements

Changes to header controls MUST include test coverage for:

- hidden-on-idle / visible-on-hover class behavior
- always-visible behavior when pin or sort is active
- pin toggle behavior for pinned and unpinned columns
- CSS transition motion when pinning or drag reordering repositions a column
- sort cycle behavior for `none`, `asc`, and `desc`
- centered full-height resize handle geometry
- shrink-safe header content that clips instead of forcing width
- sticky corner-header layering above pinned selector cells
