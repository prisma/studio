# Wide Grid Performance Proposal

This document proposes the next optimization phase for wide tables in Studio.

## Problem

For very wide grids, interaction latency is dominated by synchronous UI work (render/layout/script), not network/data loading. Pagination can produce long main-thread tasks well above target responsiveness.

## Goal

- Keep interaction work below 50ms for page transitions in high-density tables.
- Preserve existing editing, selection, and copy/paste behavior.

## Constraints

- Database query path is already acceptable for this flow.
- Bottleneck is client render cost under many visible columns/cells.
- We must keep architecture rules in [`Architecture/tanstack-db-performance.md`](tanstack-db-performance.md).

## Proposed Solution

### 1) Add horizontal and vertical virtualization

- Use viewport virtualization for rows and columns.
- Render only visible cells plus a small overscan window.
- Keep pinned columns outside the virtualized center region.

Expected impact: major reduction in mounted cell count and per-render CPU.

### 2) Mount heavy cell interactivity on demand

- Split cell rendering into:
  - lightweight display shell (always mounted)
  - interactive editor/popover layer (mounted only for active/focused cell)
- Avoid per-cell event/listener overhead for non-active cells.

Expected impact: lower commit cost and less memory pressure.

### 3) Precompute row display model once per row/page

- Build a cheap display cache for the current page (`string`/formatted display values).
- Reuse cached display output in cell render paths.
- Avoid repeated stringify/format logic inside each render pass.

Expected impact: fewer repeated expensive transforms.

### 4) Keep expensive actions lazy

- Continue lazy copy text generation (already implemented).
- Avoid render-time work for actions users may never trigger.

Expected impact: lower baseline render cost.

### 5) Add explicit performance budgets and CI checks

- Add automated browser performance scenario on `all_data_types`:
  - page 1 -> page 2 -> page 1
  - capture max long task and total long task time
- Fail CI when budget regresses beyond threshold.

Expected impact: prevents future regressions.

## Column Virtualization Update Model (implemented)

Center-column virtualization is driven by scroll events, not render-time state:

- The virtualization window (`computeColumnVirtualizationWindow`) is computed
  inside the scroll/resize handlers from the live `scrollLeft`/`clientWidth`
  of the grid scroll container, synchronously and without an animation-frame
  hop. Deferring the window behind `requestAnimationFrame` plus a raw
  scroll-position state update let fast scrolling outrun the overscan area and
  caused blank columns and jumpy repaints.
- Only the resolved window (`startIndex`/`endIndex`/spacer widths) is stored
  in React state, and state is only updated when the window actually changes.
  Plain scrolling inside the overscan area therefore never re-renders the
  grid.
- The window is computed in center-column coordinates. Left-pinned columns
  occupy the start of the scrollable row and overlay the same amount of
  viewport width (they are sticky), so the container `scrollLeft` maps 1:1
  onto center-column offsets and must not be shifted by the pinned width.
- Focused-cell auto-scroll runs at most once per focused-cell change. The
  focused column can be outside the mounted window (its cell element does not
  exist), so retrying until the element appears would re-apply the computed
  scroll position on every scroll update and fight user scrolling. Vertical
  reveal falls back to any rendered cell of the focused row because rows are
  never virtualized.

## Rollout Plan

1. Implement column virtualization for center (non-pinned) columns.
2. Add row virtualization integration with pinned-column compatibility checks.
3. Introduce active-cell-only editor mounting.
4. Add display-value caching layer for current page rows.
5. Enable perf budget test and tune overscan values.

## Risks and Mitigations

- Risk: behavior regressions in selection/editing across virtual boundaries.
  - Mitigation: extend DataGrid interaction tests for virtual windows and off-screen selection anchors.
- Risk: copy/paste semantics change with partial DOM.
  - Mitigation: copy/paste uses data model ranges, not DOM traversal.
- Risk: pinned columns and virtualization interaction complexity.
  - Mitigation: keep pinned columns rendered in fixed regions; virtualize only middle region.

## Acceptance Criteria

- Wide-grid pagination interaction max long task < 50ms in benchmark scenario.
- No regressions in existing grid interaction test suite.
- No TanStack mutation burst warnings under normal typing/pagination workflows.
