# Temporal Workbench Architecture

This document describes how Studio connects to Temporal servers (`slate-temporal-next` and standard Temporal servers such as `temporal server start-dev`) and renders the Temporal Workbench.

## Overview

Studio receives an optional `temporalUrl` prop (for example `"/api/temporal"`), parallel to `streamsUrl`. When absent, all Temporal navigation and views are omitted and no Temporal hooks execute.

Browser code never speaks gRPC directly. Instead, the host exposes a same-origin JSON HTTP BFF mounted at `temporalUrl`, which translates calls to standard Temporal `WorkflowService` gRPC RPCs using `@grpc/grpc-js` and `@temporalio/proto`.

## Dual-Target Support

The BFF probes `GetSystemInfo` and `GetClusterInfo` once to build a `TemporalCapabilities` descriptor:

- `serverKind`: `"slate-temporal-next"` when cluster metadata identifies `slate-temporal-next` / `slatedb`, `"temporal"` for standard Temporal servers, or `"unknown"`.
- Capability flags (`supportsCountGroupBy`, `supportsUpdate`, `supportsSchedules`, `supportsBatchJobs`, `supportsAdmin`) let the UI adapt cleanly without server-specific branching in every view.

## HTTP BFF Surface (`demo/ppg-dev/temporal-bff.ts`)

| Endpoint | Temporal RPC |
| --- | --- |
| `GET /v1/capabilities` | `GetSystemInfo` + `GetClusterInfo` |
| `GET /v1/namespaces` | `ListNamespaces` |
| `GET /v1/namespaces/:ns/workflows` | `ListWorkflowExecutions` + `CountWorkflowExecutions` (`GROUP BY ExecutionStatus`) |
| `POST /v1/namespaces/:ns/workflows` | `StartWorkflowExecution` / `SignalWithStartWorkflowExecution` |
| `GET /v1/namespaces/:ns/workflows/:wfId` | `DescribeWorkflowExecution` + `GetWorkflowExecutionHistory` |
| `POST /v1/namespaces/:ns/workflows/:wfId/query` | `QueryWorkflow` |
| `POST /v1/namespaces/:ns/workflows/:wfId/signal` | `SignalWorkflowExecution` |
| `POST /v1/namespaces/:ns/workflows/:wfId/update` | `UpdateWorkflowExecution` |
| `POST /v1/namespaces/:ns/workflows/:wfId/cancel` | `RequestCancelWorkflowExecution` |
| `POST /v1/namespaces/:ns/workflows/:wfId/terminate` | `TerminateWorkflowExecution` |
| `POST /v1/namespaces/:ns/workflows/:wfId/reset-sticky` | `ResetStickyTaskQueue` |
| `POST /v1/namespaces/:ns/workflows/bulk` | Fan-out `Signal`, `Cancel`, or `Terminate` across selected executions |
| `GET / POST /v1/namespaces/:ns/schedules` | `ListSchedules` + `DescribeSchedule` / `CreateSchedule` |
| `GET / DELETE /v1/namespaces/:ns/schedules/:id` | `DescribeSchedule` + `ListScheduleMatchingTimes` / `DeleteSchedule` |
| `POST /v1/namespaces/:ns/schedules/:id/{patch,matching-times}` | `PatchSchedule` (pause/unpause/trigger/backfill) / `ListScheduleMatchingTimes` |
| `POST /v1/namespaces/:ns/schedules/bulk` | Bulk pause, resume, trigger, or delete schedules |
| `GET /v1/namespaces/:ns/task-queues` | `DescribeTaskQueue` with transparent synthesized fallback on `slate-temporal-next` |
| `GET /v1/cluster/overview` | `slate-temporal-next` `/readyz`, `/v1/info`, `/v1/storage`, `/v1/load`, `/v1/cell`, `/v1/placement` |
| `GET /v1/cluster/traces` | `slate-temporal-next` `/v1/traces?drain=false|true` |
| `PUT / DELETE /v1/cluster/admission` | `slate-temporal-next` admission control override & lift |
| `POST /v1/cluster/shards/:id/handoff` | `slate-temporal-next` live shard handoff |

## History Grouping (`data/temporal/history-grouping.ts`)

Raw Temporal history events are paired into grouped execution spans (`activity`, `timer`, `child-workflow`, `signal`, `update`, `workflow`) while keeping the full raw event stream accessible via a view toggle. Pending retrying activities from `DescribeWorkflowExecution` are merged into the span list so live retry attempts, backoff timestamps, and last failures appear directly in both the Gantt timeline and the Diagnostic Callout strip.

## URL State

All Temporal navigation state lives in the URL hash via `useNavigation()` (`view=temporal`, `temporalNs`, `temporalSection`, `temporalWf`, `temporalRun`, `temporalFollow`). See [`Architecture/navigation-url-state.md`](navigation-url-state.md).
