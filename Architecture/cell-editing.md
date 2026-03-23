# Cell Editing Architecture

This document is normative for editable-cell behavior in Studio table views.

Cell editing MUST flow through `WriteableCell` + input components + mutation hooks. Do not introduce ad-hoc inline editors or direct adapter writes.

## Scope

This architecture governs:

- how edit popovers open/close
- how input components are selected and state-managed
- how staged edits move between cells
- how Save/Cancel actions behave
- how staged cell edits are persisted

## Canonical Components

- [`ui/studio/cell/WriteableCell.tsx`](../ui/studio/cell/WriteableCell.tsx)
- [`ui/components/ui/popover-cell.tsx`](../ui/components/ui/popover-cell.tsx)
- [`ui/studio/input/get-input.tsx`](../ui/studio/input/get-input.tsx)
- [`ui/studio/input/use-input.ts`](../ui/studio/input/use-input.ts)
- [`ui/studio/input/InputActions.tsx`](../ui/studio/input/InputActions.tsx)
- [`ui/studio/views/table/ActiveTableView.tsx`](../ui/studio/views/table/ActiveTableView.tsx)

## Open/Close Contract

Editable cells MUST use `PopoverCell` composition:

- `PopoverCell`
- `PopoverCellTrigger`
- `PopoverCellContent`

Open behavior rules:

- Primary click/double-click can open editor.
- Open MUST be suppressed when grid interaction suppression is active.
- Non-primary pointer buttons MUST NOT open editor.

Close behavior rules:

- Save action closes popover.
- Cancel action closes popover.
- Clicking or focusing outside the editor MUST close the popover and stage the current value when the input has a real change.
- Escape handling is controlled by `usePopoverActions`.

Do not bypass these rules by manually toggling arbitrary local booleans.

## Input State Contract

All editor input components MUST use `useInput` (or equivalent TanStack DB-backed state) for in-progress values.

- `useInput` stores value in `useUiState`.
- ephemeral input keys MUST use `cleanupOnUnmount: true`.
- editor state keys SHOULD be stable per mounted editor instance using `useStableUiStateKey`.

Do not move editor draft values into unrelated global stores.

## Input Type Dispatch Contract

`get-input.tsx` is the single dispatcher for editor component selection.

Selection rules MUST remain centralized here:

- arrays/json -> `JsonInput`
- datetime -> `DateInput`
- time -> `TimeInput`
- boolean -> `BooleanInput`
- enum -> `EnumInput`
- numeric -> `NumericInput`
- fallback -> `RawInput`

Do not duplicate datatype branching in callers.

## Readonly And Writeability Rules

A cell is editable only when both are true:

- table-level writeability allows it (`canWriteToCell`)
- column is not autoincrement and not computed

Readonly behavior MUST be enforced in editor input props and save actions.

## Save/Cancel Contract

All inputs MUST expose save/cancel through `InputActions` + `usePopoverActions`.

Required semantics:

- Enter/Return (without shift) stages the current value.
- Tab stages the current value and opens the next editable cell to the right. At the end of a row, it MUST wrap to the left-most editable cell on the next row when one exists.
- `Cmd/Ctrl` + arrow keys stage the current value and move editing into the adjacent editable cell in that direction when one exists.
- Pointer/focus dismissal outside the editor MUST stage the current value before the popover closes when the input changed.
- Escape triggers cancel.
- The inline editor popover MUST keep the cancel action but MUST NOT expose a per-cell save button once table-level staging is enabled.
- Staging should only submit when value changed according to component rules.
- Empty value semantics (`NULL`, default, empty string) MUST be explicit and type-aware per input component.

## Focused-Cell Contract

Table views MUST keep a shared focused-cell coordinate outside edit mode:

- Focus state lives separately from selection and staging state under `datagrid:${gridScope}:focused-cell`.
- Initial focus MUST land on the top-left content cell when visible rows exist.
- Exiting edit mode, whether by staging or cancel, MUST return focus to that same cell.
- Plain arrow keys MUST move the focused cell like a spreadsheet without changing the visible row set.
- Keyboard focus movement MUST keep the focused cell scrolled into view in the grid container.
- Arrow-key auto-repeat for focused-cell movement MUST be throttled enough to remain visually trackable (about 50ms minimum between moves).
- `Enter` MUST reopen the currently focused editable cell.
- `Shift` + arrow keys MUST start or extend grid cell selection from the focused cell when the target rows are persisted grid rows.
- Insert-row drafts MUST focus their first content cell when created.
- When filtering, sorting, or pagination changes the visible rows, focus MUST stay at the same screen coordinate and clamp to the nearest remaining row when needed.

## Persistence Contract

Existing-row cell edits MUST stage into table-scoped UI state before persistence:

- `ActiveTableView.handleCellInputSubmit` updates `tableUiState.stagedUpdates`.
- The rendered grid MUST merge staged updates over persisted rows so unsaved values stay visible.
- Staged existing-row saves MUST flow through `useActiveTableUpdateMany`, which writes one collection transaction and lets the collection choose `adapter.updateMany(...)` for multi-row batches or fall back to per-row `adapter.update(...)`.
- Insert-row drafts MUST use the same staged editor inputs and the same toolbar save/discard controls, with draft rows stored in `tableUiState.stagedRows`.
- Confirming a staged save MUST be a table-level modal flow that counts affected rows before invoking the shared batch persistence path.
- Discarding staged edits MUST be a table-level confirmation flow that counts affected staged cells before the staged rows and staged updates are cleared.

For bulk paste, value coercion is handled in table view before invoking update mutations.

Do not call adapter persistence methods directly from input components.

## Interaction With Grid Selection

Editor open behavior MUST respect grid-level selection architecture:

- context-menu suppression and selection gestures must not accidentally open editors.
- Escape in edit context must close editor first (selection clearing follows selection architecture rules only when not editing).

See [`Architecture/selection.md`](selection.md) for selection mode constraints.

## Forbidden Patterns

- Inline editing widgets that bypass `WriteableCell` popover.
- Direct adapter mutations from input components.
- Duplicated datatype-input selection logic outside `get-input.tsx`.
- Persisting input draft values to URL params.

## Testing Requirements

Any change to edit behavior MUST include tests for:

- popover suppression/open/close behavior
- save/cancel keyboard semantics
- type-specific empty/default/null handling for changed inputs
- mutation handoff to update hook path

Relevant suites include grid interaction and input component tests; add new tests if coverage is missing.
