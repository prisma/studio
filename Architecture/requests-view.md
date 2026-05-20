# Requests View Architecture

This document is normative for the Studio Requests view.

The Requests view is a database-session view that presents request-level observability data in the existing Studio shell. The first implementation uses deterministic dummy data, but its UI contract is shaped so real request, span, and log data can replace that source later without changing navigation.

## Scope

This architecture governs:

- routing into `view=requests`
- sidebar and command-palette entry points
- request list ordering and summary columns
- in-place request expansion
- trace and log detail toggling
- dummy request/span/log data shape

## Canonical Components

- [`ui/studio/Navigation.tsx`](../ui/studio/Navigation.tsx)
- [`ui/studio/CommandPalette.tsx`](../ui/studio/CommandPalette.tsx)
- [`ui/studio/Studio.tsx`](../ui/studio/Studio.tsx)
- [`ui/studio/views/requests/RequestsView.tsx`](../ui/studio/views/requests/RequestsView.tsx)
- [`ui/hooks/use-navigation.tsx`](../ui/hooks/use-navigation.tsx)
- [`ui/hooks/use-ui-state.ts`](../ui/hooks/use-ui-state.ts)

## Non-Negotiable Rules

- Requests routing MUST use the existing URL-backed `view` param with the value `requests`.
- The left navigation MUST render Requests in the Studio block immediately after Console and before SQL while database-backed Studio views are available.
- The request list MUST render most recent requests first.
- Summary rows MUST include timestamp, service, path, message, and duration.
- Request expansion MUST happen in place under the clicked row instead of navigating away or opening a modal.
- Expanded request state and the selected detail view MUST use `useUiState` with deterministic request-scoped keys.
- Trace details MUST show proportional span durations for external requests and Prisma OpenTelemetry-style subsystem spans when dummy data includes them.
- Log details MUST handle both string messages and structured object payloads without dropping the original structured object.

## Dummy Data Contract

Until Studio is wired to a real request source, dummy rows live in the Requests view module. Each request row MUST include:

- a stable request id
- timestamp
- service
- method and path
- status
- message
- duration in milliseconds
- trace id
- zero or more trace spans
- zero or more associated log lines

Each span MUST include:

- stable span id
- display name
- service
- kind (`request`, `framework`, `external`, or `prisma`)
- start offset in milliseconds
- duration in milliseconds
- nesting depth
- status

Each log line MUST include:

- stable log id
- timestamp
- level
- service
- message as either a string or structured object

## UI State Contract

The expanded request id MUST be stored through `useUiState` using:

- `requests:expanded-request`

The active detail view for each expanded request MUST be stored through `useUiState` using:

- `requests:${requestId}:detail-view`

These keys keep request-detail interaction consistent with the existing Studio UI state architecture and avoid introducing component-local shared view state.

## Forbidden Patterns

- Do not introduce a second routing system for requests.
- Do not store expanded request state in module globals.
- Do not replace structured log objects with stringified summaries as the source data.
- Do not open trace or log details in a modal or side panel for the default row click behavior.

## Testing Requirements

Requests view changes MUST include tests for:

- `view=requests` routing in `Studio`
- sidebar placement directly under Console
- newest-first dummy request list rendering with the required summary columns
- in-place row expansion
- trace detail rendering for external and Prisma spans
- log detail rendering for both string and structured object payloads
