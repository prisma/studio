# Selection Architecture

This document is normative for Studio grid selection behavior. New selection features MUST follow these rules and MUST use the existing state machine + TanStack DB integration.

## Goals

- Keep exactly one active selection mode at any time.
- Make transitions explicit and type-checked.
- Keep selection state centralized in TanStack DB-backed UI state.
- Prevent regressions when switching tables/scopes.

## Source Of Truth

Selection state MUST be stored in a single value:

- Key: `datagrid:${gridScope}:selection-state`
- Storage hook: `useUiState<GridSelectionMachineState>(...)`
- `gridScope`: `selectionScopeKey ?? "__default__"`

Selection MUST NOT be split across multiple independent UI state keys (for example separate persisted `selectionStart`/`selectionEnd`).
Focused-cell state is related but separate UI state and MUST NOT be folded into the selection machine. Focus lives at `datagrid:${gridScope}:focused-cell` and acts as the keyboard anchor that can seed `cell.select` transitions.

## State Model

The only allowed selection states are:

```ts
type GridSelectionMachineState =
  | { mode: "none" }
  | { mode: "cell"; start: GridCellCoordinate; end: GridCellCoordinate }
  | { mode: "row"; rowIds: string[] };
```

Invariants:

- `mode: "none"` means no active selection.
- `mode: "cell"` means rectangular cell-range selection only.
- `mode: "row"` means row-selection mode only.
- Cell and row modes MUST NOT be active simultaneously.
- `rowIds` MUST be normalized (`trim`, non-empty, de-duplicated) before being stored.

## Events And Transitions

All updates MUST go through `transitionGridSelectionMachine(state, event)`.

Allowed events:

- `cell.select { start, end }`
- `cell.clear`
- `row.select { rowIds }`
- `row.clear`
- `escape`
- `reset`

Transition rules:

- `cell.select` enters/replaces cell mode.
- `row.select` enters/replaces row mode.
- `cell.clear` clears only cell mode; other modes remain unchanged.
- `row.clear` clears only row mode; other modes remain unchanged.
- `escape` clears all selection and goes to `none`.
- `reset` clears all selection and goes to `none`.

Do not implement ad-hoc branching that bypasses these transitions.

## Derived Reads (Required Selectors)

Consumers MUST derive behavior from selectors in `selection-state-machine.ts`:

- `getCellSelectionRange(state)`
- `getCellSelectionAnchor(state)`
- `getCellSelectionFocus(state)`
- `getSelectedRowIds(state)`
- `hasRowSelectionMode(state)`
- `hasAnySelection(state)`

For React Table row selection mapping, use:

- `rowSelectionStateToIds(rowSelectionState)`
- `rowIdsToRowSelectionState(rowIds)`

Consumers SHOULD NOT reimplement these conversions locally.

## DataGrid Integration Contract

`DataGrid.tsx` MUST follow these rules:

- Persist selection through `useUiState(...selection-state...)`.
- Update selection only by dispatching machine events via `setSelectionState((prev) => transitionGridSelectionMachine(prev, event))`.
- Keep React Table row selection and machine row mode synchronized.
- Entering row selection mode MUST clear cell selection.
- Entering/expanding cell selection MUST clear row selection mode when needed.
- `Escape` MUST clear active selection mode(s), except when an editable element is focused.
- Table/scope changes (pagination, column set, `selectionScopeKey`) MUST reset selection to `none`.

## Required Update Pattern

Use this write pattern everywhere:

```ts
setSelectionState((previous) =>
  transitionGridSelectionMachine(previous, {
    type: "cell.select",
    start,
    end,
  }),
);
```

Do not mutate selection objects in place and do not assign custom shape variants.

## Required Read Pattern (TanStack DB)

Read persisted selection through `useUiState` and selectors:

```ts
const [selectionState] = useUiState<GridSelectionMachineState>(
  `datagrid:${gridScope}:selection-state`,
  GRID_SELECTION_MACHINE_INITIAL_STATE,
);

const range = getCellSelectionRange(selectionState);
const selectedRowIds = getSelectedRowIds(selectionState);
```

Because `useUiState` is backed by a TanStack DB local collection (`uiLocalStateCollection`), selection reads are live and shared by components using the same key.

## Mode Ownership Rules

- Text-selection mode (native browser selection) is not stored in the machine.
- Focused-cell state is not selection mode. It may exist while selection mode is `none`, and `Shift` + arrow selection may use that focused cell as the starting anchor.
- As soon as interaction commits to grid cell-range selection, machine mode MUST become `cell`.
- As soon as interaction commits to row selection, machine mode MUST become `row`.
- At any commit point, there MUST be only one active mode in UI and state.

## Testing Requirements

Any change to selection behavior MUST update tests in both layers:

- Pure state-machine tests (`selection-state-machine.test.ts`):
  - Must verify transitions and invariants without browser dependencies.
- Grid interaction tests (`DataGrid.interactions.test.tsx` and related suites):
  - Must verify pointer/keyboard/context-menu behavior and synchronization with row selection.

New transition types or mode semantics MUST be added to state-machine tests first, then wired into UI behavior.

## Forbidden Patterns

- Multiple persisted selection keys for the same grid scope.
- Direct state assignment that bypasses `transitionGridSelectionMachine`.
- Mixed cell + row selection rendering in a single frame/state.
- Duplicated conversion logic for row-selection maps and row-id arrays.

## Migration Rule

If selection requirements expand, evolve the machine by adding typed events/states and exhaustive handling (`assertNever`). Do not add one-off flags in `DataGrid` to represent new modes.
