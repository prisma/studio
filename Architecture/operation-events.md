# Operation Events And Console Architecture

This document is normative for operation event emission, storage, and display.

Database and introspection operations MUST emit standardized Studio events and MUST flow through the central `onEvent` pipeline. Do not add ad-hoc logging paths for operation visibility.

## Scope

This architecture governs:

- operation success/error event shapes
- event enrichment and fan-out
- toast behavior for failures
- in-memory operation event retention
- Console view rendering contract

## Canonical Components

- [`ui/studio/Studio.tsx`](../ui/studio/Studio.tsx)
- [`ui/studio/context.tsx`](../ui/studio/context.tsx)
- [`ui/studio/views/console/ConsoleView.tsx`](../ui/studio/views/console/ConsoleView.tsx)
- [`ui/studio/views/console/OperationEventEntry.tsx`](../ui/studio/views/console/OperationEventEntry.tsx)
- data hooks that emit events (`use-introspection`, rows collection query/update/delete, insert)

## Event Type Contract

Event types are defined in `Studio.tsx` and MUST remain the shared contract:

- `studio_launched`
- `studio_operation_success`
- `studio_operation_error`

Operation payloads MUST include:

- `operation` name
- associated query when available
- error for failure events

Failure payloads SHOULD include `payload.error.adapterSource` when the adapter can identify its SQL dialect/source.

Enriched events MUST include:

- `eventId`
- `timestamp`

## Emission Rules

All adapter-backed operations MUST emit through `onEvent`:

- introspection
- table query
- raw SQL query
- update
- delete
- insert

Success path MUST emit `studio_operation_success`.
Failure path MUST emit `studio_operation_error` and propagate error behavior to caller.

## onEvent Pipeline Contract

`StudioContextProvider.onEvent` is the only allowed enrichment pipeline.

It MUST:

- suppress toasts for `AbortError`
- show toast for operation errors with Console navigation action
- append success/error operation events to `operationEventsCollection`
- cap operation history at 100 events (evict oldest first)
- forward enriched events to external `emitEvent` callback

Telemetry/checkpoint side effects for `studio_launched` are also owned by this pipeline.
Those telemetry side effects MUST honor Prisma's documented `CHECKPOINT_DISABLE=1` opt-out and skip the checkpoint request entirely when that environment variable is set.

Do not bypass this pipeline in feature code.

## Storage Contract

Operation event history is stored in:

- `operationEventsCollection` (`localOnlyCollectionOptions`)

Views MUST read operation events from Studio context, not from local ad-hoc stores.

## Console Rendering Contract

`ConsoleView` MUST:

- render events from `useStudio().operationEvents`
- auto-scroll to latest event when list changes
- show empty-state message when no events exist

`OperationEventEntry` MUST:

- render success/error status and timestamp
- render SQL query preview/expanded mode
- render query parameters
- render error details for failures
- render adapter source for failures when available
- support query-copy action

Per-entry transient UI toggles (e.g. query expanded state) should use scoped UI state keys with cleanup.

## Ordering Contract

Displayed operation events MUST be sorted by timestamp ascending before rendering, so Console naturally appends newest operations at bottom.

## Forbidden Patterns

- Emitting operation events directly to Console components.
- Storing operation logs in component-local arrays.
- Bypassing `onEvent` for adapter mutations/queries.
- Returning silent failures without `studio_operation_error`.

## Testing Requirements

Changes to this subsystem MUST include tests for:

- event emission on success and failure paths
- event enrichment (`eventId`, `timestamp`)
- event cap/eviction behavior
- toast suppression for `AbortError`
- telemetry opt-out when `CHECKPOINT_DISABLE=1`
- console rendering behavior for new event payload fields
