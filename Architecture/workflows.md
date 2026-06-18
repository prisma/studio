# Prisma Workflow Studio Architecture

This document is normative for Prisma Workflow support in Studio.

## Scope

Studio's Workflow surface is an operator and debugger UI for Prisma Workflow apps deployed to Prisma Compute. It is not a workflow authoring canvas. The authoring experience lives in Prisma Workflow generation and deployment; Studio shows what is deployed, what is running, what needs human approval, and what failed.

## Provider Boundary

Workflow data MUST enter Studio through a top-level `WorkflowStudioProvider` on `<Studio workflows={...} />`. Workflow support MUST NOT be added to database adapters, because a Workflow app can be inspected without a database connection and because Workflow providers can be static, local, remote, or Compute-hosted.

The supported provider helpers live in [`data/workflows`](../data/workflows):

- `createWorkflowStudioClient({ baseUrl })` for live JSON endpoints
- `createStaticWorkflowStudioProvider({ staticModel })` for examples, tests, and embedded snapshots
- `normalizeWorkflowStudioModel` and `normalizeWorkflowRunDetail` for boundary validation and date normalization

The provider returns plain JSON-safe data. Dates from live endpoints may arrive as ISO strings, `Date` objects, or epoch milliseconds, but they MUST be normalized to ISO strings before UI components render them.

## Live Endpoint Contract

The live client uses this endpoint shape relative to `baseUrl`:

```http
GET  /studio
GET  /inspect/:runId
POST /run
POST /replay/:runId
POST /approve/:approvalId
POST /reject/:approvalId
```

`GET /studio` MUST return a Workflow Studio model with `kind: "prisma-workflow-studio"` and `version: 1`. `GET /inspect/:runId` MAY return richer run detail than the summary already included in `/studio`. Action endpoints return `{ "ok": true, "message": "..." }` or an HTTP error with JSON/plain-text diagnostics.

## Navigation Contract

Workflow navigation is URL-backed through `useNavigation` and Nuqs. The canonical keys are:

- `view=workflows`
- `workflow=<workflow-id>`
- `workflowTab=canvas|runs|approvals|ingest|deadLetters`
- `workflowRun=<run-id>`
- `workflowFrame=fit|manual`

The sidebar MUST hide the Workflows section when no provider is configured. When `hasDatabase={false}` and workflows are configured, Studio MUST default to `view=workflows` and MUST not require a database adapter.

## UI Contract

The Workflow view MUST support:

- graph inspection with nodes, edges, node status, retry/dead-letter signals, approval gates, and branch labels
- recent run inspection with a timeline and full payload/context/evidence diagnostics
- pending approval review with approve and reject actions
- ingest event inspection for triggers and external provider events
- dead-letter inspection with replay actions when the provider supports replay
- warning and capability surfacing so partial providers fail visibly instead of silently hiding unsupported actions

The UI should stay operational and dense. Use standard ShadCN primitives for actions, tabs, sheets, dialogs, alerts, badges, tables, and skeletons. The graph canvas is the deliberate custom composite because React Flow is the right primitive for pan/zoom workflow topology.

## Demo Contract

The local `ppg-dev` demo exposes mocked Workflow endpoints at `/api/prisma-workflows`. The fixture should remain complete enough to exercise the product story from the Prisma Workflow PRD: Stripe disputes, HubSpot customer context, Shopify order history, Zendesk tickets, Stripe metadata, an approval gate for high-value disputes, evidence submission, Slack summary, a `dispute_cases` persistence step, learning from approved responses, and replayable failures.

## Testing Requirements

Workflow changes MUST include focused coverage for:

- model and run-detail normalization, including static and live date shapes
- live client URL construction, encoded ids, action methods, and error handling
- workflows-only Studio navigation defaults
- sidebar and command-palette visibility with and without a Workflow provider
- Workflow view rendering, tab navigation, selected run display, approval actions, and replay actions
