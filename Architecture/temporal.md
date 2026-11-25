# Temporal Workbench Architecture

This document describes how Studio connects to Temporal servers (`slate-temporal-next` and standard Temporal servers such as `temporal server start-dev`) and renders the Temporal Workbench.

## Overview

Studio receives an optional `temporalUrl` prop (for example `"/api/temporal"`), parallel to `streamsUrl`. When absent, all Temporal navigation and views are omitted and no Temporal hooks execute.

Browser code never speaks gRPC directly. Instead, the host exposes a same-origin JSON HTTP BFF mounted at `temporalUrl`, which translates calls to standard Temporal `WorkflowService` gRPC RPCs using `@grpc/grpc-js` and `@temporalio/proto`.

## Dual-Target Support

The BFF probes `GetSystemInfo` and `GetClusterInfo` once to build a `TemporalCapabilities` descriptor:

- `serverKind`: `"slate-temporal-next"` when cluster metadata identifies `slate-temporal-next` / `slatedb`, `"temporal"` for standard Temporal servers, or `"unknown"`.
- Capability flags (`supportsCountGroupBy`, `supportsUpdate`, `supportsSchedules`, `supportsBatchJobs`, `supportsAdmin`) let the UI adapt cleanly without server-specific branching in every view.
- `nativeListOrder` says in which order a list without a sort comes: `workflow-id` on a `slate-temporal-next` without the visibility feed, `newest-first` (by start time) on one with it, and `open-first` on a standard server. `open-first` is the standard visibility order: running executions first, then closed ones by close time, newest first. It is not a sort by start time, so the UI shows no sort arrow for it, and a sort by start time is done by the BFF.
- `codec` says whether the BFF has a Codec Server (see "Codec Server").

## HTTP BFF Surface (`demo/ppg-dev/temporal-bff.ts`)

| Endpoint                                                                               | Temporal RPC                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/capabilities`                                                                 | `GetSystemInfo` + `GetClusterInfo`                                                                                                                                                                       |
| `GET /v1/namespaces`                                                                   | `ListNamespaces`                                                                                                                                                                                         |
| `GET /v1/namespaces/:ns/workflows`                                                     | `ListWorkflowExecutions` + `CountWorkflowExecutions` (`GROUP BY ExecutionStatus`); `counts=0` skips the count, `list=0` skips the rows, `sort` and `dir` sort the rows, `nextPageToken` continues a list |
| `GET /v1/namespaces/:ns/facets`                                                        | The Workflow Types and Task Queues in use, from every run of the namespace                                                                                                                               |
| `GET /v1/namespaces/:ns/attention`                                                     | `DescribeWorkflowExecution` of every running run: retrying Activities, tasks without a Worker, slow runs, recent failures                                                                                |
| `POST /v1/namespaces/:ns/workflows`                                                    | `StartWorkflowExecution` / `SignalWithStartWorkflowExecution`                                                                                                                                            |
| `GET /v1/namespaces/:ns/workflows/:wfId`                                               | `DescribeWorkflowExecution` + `GetWorkflowExecutionHistory`                                                                                                                                              |
| `POST /v1/namespaces/:ns/workflows/:wfId/query`                                        | `QueryWorkflow`                                                                                                                                                                                          |
| `POST /v1/namespaces/:ns/workflows/:wfId/signal`                                       | `SignalWorkflowExecution`                                                                                                                                                                                |
| `POST /v1/namespaces/:ns/workflows/:wfId/update`                                       | `UpdateWorkflowExecution`                                                                                                                                                                                |
| `POST /v1/namespaces/:ns/workflows/:wfId/cancel`                                       | `RequestCancelWorkflowExecution`                                                                                                                                                                         |
| `POST /v1/namespaces/:ns/workflows/:wfId/terminate`                                    | `TerminateWorkflowExecution`                                                                                                                                                                             |
| `POST /v1/namespaces/:ns/workflows/:wfId/reset-sticky`                                 | `ResetStickyTaskQueue`                                                                                                                                                                                   |
| `POST /v1/namespaces/:ns/workflows/:wfId/reset`                                        | `ResetWorkflowExecution` to a completed Workflow Task                                                                                                                                                    |
| `POST /v1/namespaces/:ns/workflows/:wfId/activity`                                     | `PauseActivity`, `UnpauseActivity` or `ResetActivity` for one pending Activity                                                                                                                           |
| `POST /v1/namespaces/:ns/workflows/:wfId/{pause,unpause}`                              | `PauseWorkflowExecution` / `UnpauseWorkflowExecution`                                                                                                                                                    |
| `POST /v1/namespaces/:ns/workflows/bulk`                                               | Fan-out `Signal`, `Cancel`, or `Terminate` across selected executions                                                                                                                                    |
| `POST /v1/namespaces/:ns/bulk-jobs`, `GET` / `DELETE /v1/namespaces/:ns/bulk-jobs/:id` | Start a bulk action in the background, read its progress, stop it                                                                                                                                        |
| `GET /v1/namespaces/:ns/workers`                                                       | Task Queue pollers grouped by identity, `ListWorkerDeployments`, `OperatorService.ListNexusEndpoints`                                                                                                    |
| `GET / POST /v1/namespaces/:ns/schedules`                                              | `ListSchedules` + `DescribeSchedule` / `CreateSchedule`                                                                                                                                                  |
| `GET / PUT / DELETE /v1/namespaces/:ns/schedules/:id`                                  | `DescribeSchedule` + `ListScheduleMatchingTimes` / `DescribeSchedule` + `UpdateSchedule` / `DeleteSchedule`                                                                                              |
| `POST /v1/namespaces/:ns/schedules/:id/{patch,matching-times}`                         | `PatchSchedule` (pause/unpause/trigger/backfill) / `ListScheduleMatchingTimes`                                                                                                                           |
| `POST /v1/namespaces/:ns/schedules/bulk`                                               | Bulk pause, resume, trigger, or delete schedules                                                                                                                                                         |
| `GET /v1/namespaces/:ns/task-queues`                                                   | Counts from every run, Activity queues from Workflow histories, `DescribeTaskQueue` pollers where the server has them                                                                                    |
| `GET /v1/namespaces/:ns/workflow-types/:type/map`                                      | The diagram of a Workflow Type, from the histories of a sample of its runs                                                                                                                               |
| `GET /v1/namespaces/:ns/workflow-types/:type/inputs`                                   | The arguments of the ten newest runs of a Workflow Type, for the form that starts a run                                                                                                                  |
| `GET /v1/cluster/overview`                                                             | `slate-temporal-next` `/readyz`, `/v1/info`, `/v1/storage`, `/v1/load`, `/v1/cell`, `/v1/placement`                                                                                                      |
| `GET /v1/cluster/traces`                                                               | `slate-temporal-next` `/v1/traces?drain=false                                                                                                                                                            | true` |
| `PUT / DELETE /v1/cluster/admission`                                                   | `slate-temporal-next` admission control override & lift                                                                                                                                                  |
| `POST /v1/cluster/shards/:id/handoff`                                                  | `slate-temporal-next` live shard handoff                                                                                                                                                                 |

## Listing and Counting at Scale

Not every server answers list and count calls from an index. `slate-temporal-next` scans the namespace: a list page examines at most 10,000 runs and may come back short with a token, rows come in Workflow Id order (`ORDER BY` is refused), a count takes time in proportion to the namespace, and a project's fifth concurrent list or count call is refused with `RESOURCE_EXHAUSTED`. The BFF and the UI therefore follow these rules:

- **Follow short pages.** `listWorkflows` asks for the next page until it has `pageSize` rows, the server has no more, or it has followed five pages.
- **Rows and counts are separate requests.** `GET /v1/namespaces/:ns/workflows` takes `counts=0` (rows only) and `list=0` (counts only). `useTemporalWorkflows` sends both and merges them, refreshing rows every 2.5 seconds and counts every 10 seconds, so a slow count never delays the rows. A caller that does not show counts passes `includeCounts: false`.
- **Queue lists and counts apart.** The BFF allows two list calls and one count call in flight, so the rows of a new search never wait for a running count.
- **Show a refusal at once.** `shouldRetryTemporalRequest` does not retry a 4xx answer such as an invalid filter; it retries server failures, 429 and network failures twice.
- **Mark rows of the previous search.** While a new search loads, the grid dims the old rows and sets `aria-busy`. Counts never carry over from the previous filter.
- **Do not rely on list order.** Anything that must be newest first asks for a `StartTime` window and sorts the rows itself, or asks the BFF to sort.

## Sorting, Paging and the BFF's Copy of the Runs

No server sorts a list by every column, and `slate-temporal-next` sorts by none. So the BFF sorts. `matchingRuns(namespace, filter)` reads every run that matches a filter in pages of 1,000, up to 10,000 runs, and `#remember` keeps the result:

- A caller gets the copy the BFF holds at once. A copy older than four seconds (or three times what reading it took) is read again in the background, so only the first caller waits for the server. The BFF keeps the 16 keys used most recently.
- `listWorkflows` with a `sort` sorts that copy and returns one page of it. Its page token is `offset:<n>`. The status counts and the total come from the same copy, so a sorted list costs no count call.
- When more than 10,000 runs match, the BFF does not sort. It returns the rows in the server's order with `sortSkippedReason`, and the grid shows that text.
- Without a `sort` the BFF passes the server's own page token through, so a list in the server's order pages without any copy.

The grid keeps the sort in the `sort` URL key (`StartTime:desc`) and the page tokens in component state. Its default is no sort on a server that lists newest first, and `StartTime` descending on a server that lists by Workflow Id. The same copy feeds three more answers: `getFacets` (Workflow Types and Task Queues for form suggestions), `getAttention` and `listTaskQueues`.

## Needs Attention

No Visibility filter finds a retrying Activity or a task that no Worker picks up. `getAttention` therefore calls `DescribeWorkflowExecution` for every running run (12 at a time, the 1,500 oldest at most) and keeps the answer for 15 seconds. It reports five kinds:

- `workflow-task-failing`: the pending Workflow Task is on attempt 2 or more. The Workflow code throws or is not deterministic.
- `no-worker`: a Workflow Task or a first-attempt Activity has been scheduled for more than 30 seconds.
- `activity-retrying`: a pending Activity is on attempt 2 or more, with its last failure, the time of its last attempt (`since`) and of its next one. A standard Temporal server reports the next attempt as the pending Activity's `scheduledTime` while it waits, so a scheduled time in the future counts as the next attempt, not the last.
- `long-running`: the run has lasted three times longer than 95% of the closed runs of its Workflow Type (at least 20 closed runs).
- `failed`: the run failed or timed out in the last hour.

The sidebar asks for it only while the Temporal service is open.

## Task Queues

`listTaskQueues` counts running, failed and total runs per queue from the BFF's copy of every run. A queue that only runs Activities has no run of its own, so `#activityRouting` reads the history of two runs per Workflow Type (the one with the longest history and the newest completed one) and maps each Activity Type to its Task Queue. Retrying and pending Activities come from the attention check. Pollers come from `DescribeTaskQueue`, for the Workflow and the Activity queue type; `pollersSupported` is false on a server that does not implement it, and a queue there is `stalled` when the attention check found a task without a Worker.

In a namespace too large to copy (`complete: false`), the queues are counted from the copy of the running runs, the one the attention check already holds, so `activeWorkflowCount` stays exact and costs no extra read. `failedWorkflowCount` and `totalWorkflowCount` are then `null`: a count from the first page of all runs would be a count of whichever runs the server lists first. The screen shows a dash for them, and the list under a queue is the newest of the counted runs with a link to exactly those runs in Workflows. `runningComplete` is false when even the running runs are more than the BFF copies. The schedule list is remembered for 10 seconds, so a poll of this screen makes no call to the server while the copies are fresh.

`matchingRuns` remembers for five minutes that a filter matched too many runs to copy. Without that, every refresh of the copy read 10,000 runs to find out again.

## Workflow Type Diagrams (`data/temporal/type-map.ts`, `TemporalTypesView.tsx`)

Temporal stores no definition of a Workflow, so `getTypeMap` (`GET /v1/namespaces/:ns/workflow-types/:type/map`) draws a type from the histories of a sample of its runs. `pickTypeMapSample` takes the 40 newest runs and makes sure every status the type has is among them at least three times, so a rare failure path is drawn too. The BFF reads at most 1,000 events per run and no payloads, and remembers the diagram for a minute. The request may ask for a larger sample (`?sample=`, up to 200 runs) and for a diagram drawn now (`?fresh=1`); the response says the sample size it used (`sampleSize`). `useTemporalTypeMap` sends `fresh=1` only on the first request after the user redraws, not on the polls that follow.

`buildTypeMap` makes one step of every Activity Type, Child Workflow Type, Signal and Update. Timers are told apart by the summary the code gave them or by the time they wait; a type with more than four distinct Timers gets one Timer step. Step B follows step A when A ended before B started and no other step ran wholly between them, in the order of the history's event IDs. Two steps that ran at the same time therefore both follow the step before them. A step that follows itself adds no arrow; the step's `spanCount` says how often it ran. An open run counts as waiting at its open steps, or at the last step it finished.

`temporal-type-map-layout.ts` lays the diagram out with ELK (layered, top to bottom, orthogonal routes). `orderTypeMapNodes` orders the steps so that only an arrow that closes a real loop points back, because the layout draws every arrow against the node order as a loop. `TemporalTypeMapCanvas.tsx` draws the nodes with React Flow and the arrows along ELK's routes. The diagram opens at no less than 80% zoom: one too tall for that opens with its start at the top, and the wheel scrolls down it.

The counts in a diagram are counts of the sampled runs. The page has no bar above the diagram: the header shows "Workflow Types › type" with an info button (`SampleInfo`) that explains the sample, which runs were sampled and how many of each status, and when the diagram was drawn, and offers a redraw from the next sample size (40, then 100, then 200, while the type has more runs). The header's refresh button reloads the types and redraws the diagram now at the same size, and "View All N Runs" opens the type's runs in Executions.

**Text on the arrows.** An arrow carries words, as plain text with no box, so it cannot be taken for a step. The words are the summary the Workflow code gave the step the arrow leads to (the SDK's `summary` option on an Activity or a Child Workflow; `buildTypeMap` keeps the one given most often in `summary`), on the arrow most runs took into that step. Without a summary they say what kind of transition it is: "after timer", "on signal", "on update", a loop, or the closing status where it is one branch of several. An arrow whose two steps already say everything has no words. The numbers stay out of the way: while the pointer is on any arrow, every arrow also shows the share of its source step's runs that took it, and an arrow of the selected step shows its count of runs. A faint arrow shows no text. The layout gets each text's width and places it on a straight part of its arrow, clear of the steps and of the other texts. The full sentence is the arrow's tooltip. Temporal's SDKs have no way to label a branch itself, only a step.

## Cluster Health (`temporal-cluster-health.ts`)

The load report of `slate-temporal-next` gives the server and each shard one of six states, best first: `ok`, `busy`, `shedding`, `overworked`, `critical`, `fault` (its `docs/overload.md` §5.1). Only the states from `shedding` on refuse work. `getClusterOverview` passes on the report's reasons (`{ scope, shard, signal, value, unit }`) and tags; each shard gets the reasons of its own. `describeClusterHealth` gives every state a label, a sentence on what it means, and a tone: `busy` is `info`, not `warning`.

## Codec Server

An application can compress or encrypt its payloads with a payload codec, and then only a Codec Server can decode them. `TemporalBffConfig.codec` names one (`endpoint`, an optional `authorization` header value, `encodeOutgoing`); the demo server reads `STUDIO_TEMPORAL_CODEC_ENDPOINT`, `STUDIO_TEMPORAL_CODEC_AUTH` and `STUDIO_TEMPORAL_CODEC_ENCODE`.

- `decodePayloadsInPlace` (`demo/ppg-dev/temporal-codec.ts`) finds every payload whose encoding is not one of the SDKs' standard encodings, at any depth, and replaces them through one `POST <endpoint>/decode`. The BFF runs it over a run's description and history, and over Query and Update results.
- Arguments typed in Studio go through `POST <endpoint>/encode` first, unless `encodeOutgoing` is false.
- The detail response carries `codec: { decoded, encoded, error? }`. A payload that stays encoded is shown as `{ "$encodedPayload": { encoding, sizeBytes } }`, and the Execution Debugger says how many there are or why the Codec Server failed.
- The BFF calls the Codec Server, not the browser. The endpoint is part of the host's configuration, so a page cannot make the BFF call an address of its choice.
- List rows are not decoded: the grid shows no payload, and decoding the memo of thousands of rows would cost a large codec call per refresh.

## Workflows Search Field

The field takes a List Filter or plain text. `toVisibilityQuery` (`temporal-utils.ts`) passes a filter through unchanged, and turns any other text, such as a pasted workflow ID or run ID, into `WorkflowId STARTS_WITH … OR WorkflowType STARTS_WITH … OR RunId STARTS_WITH …`. The URL keeps what the user typed; the translation happens where the grid calls `useTemporalWorkflows`. The Execution Debugger header has a copy button for the workflow ID and one for the run ID.

## Bulk Jobs

A bulk action runs as a job in the BFF process. `startBulkJob` takes the selected runs, or a List Filter: with a filter it acts on every running run of `matchingRuns` (so on 10,000 runs at most; above that it refuses and asks for a narrower filter). It works through the runs six at a time and returns at once. `getBulkJob` reports `total`, `done`, `failed` and the first 20 errors; `abortBulkJob` stops it after the calls in flight. The grid offers "Select all N running workflows that match" once every row of a page is selected, and shows the job in a dialog with a progress bar and a Stop button. A job is lost when the BFF restarts; the server-side `StartBatchOperation` is not used, because `slate-temporal-next` does not have it.

## Grid Columns and the Filter Builder

- `useWorkflowColumns` (`temporal-grid-columns.tsx`) holds which columns the grid shows, their order and their widths in persistent UI state (`temporal:grid-columns`). Besides the built-in columns, every memo field (`memo:<key>`) and Search Attribute (`attr:<key>`) found on the listed rows can be a column. The table has a fixed layout with one `<col>` per column, and each header has a `role="separator"` handle that resizes its column by dragging.
- `TemporalFilterBuilder` builds a List Filter from rows of attribute, operator and value. `buildListFilter` and `parseListFilter` (`temporal-utils.ts`) write and read a plain AND of comparisons; the builder does not read a filter with OR or parentheses and says so. Workflow Types and Task Queues are suggested from `getFacets`, which also returns the custom Search Attributes (`OperatorService.ListSearchAttributes`).

## Schedules

The schedule form creates a schedule or edits one. `updateSchedule` reads the schedule, replaces its spec, policies, action and notes, keeps whether it is paused, and sends `UpdateSchedule` with the conflict token it read. The form has the time zone a cron expression is read in and the catch-up window. A standard server returns a cron string as a structured calendar, so `structuredCalendarToCron` writes it back as five cron fields for the summary and the form. The open schedule is the `temporalSchedule` URL key.

## Workers

`getWorkers` returns three lists, and null for a list the server does not offer. Workers are the pollers of every Task Queue grouped by identity, which needs no Worker heartbeats. Worker Deployments come from `ListWorkerDeployments` and Nexus Endpoints from `OperatorService.ListNexusEndpoints`. The sidebar shows Workers only when the server reports pollers (`supportsDescribeTaskQueue`).

## Execution Debugger

- **Handlers.** `useTemporalWorkflowMetadata` sends the SDK's built-in `__temporal_workflow_metadata` Query. The Worker answers with the Queries, Signals and Updates the Workflow handles, their descriptions, and the current details text. `TemporalInteractPanel` shows one row per handler: a Query runs in one click, a Signal or an Update asks for its arguments first. Names that start with two underscores are the SDK's own and are left out. Signal and Update names seen in the run's history are added. With no Worker the panel falls back to a name field.
- **Call stack.** The Stack tab sends the `__stack_trace` Query and shows the text, or the Worker's reason for not answering. The TypeScript SDK records call stacks on Node.js only (it needs `v8.promiseHooks`), so a Worker on Bun answers "not enabled" and the tab says so.
- **Side panel.** A button at the right end of the run header (`PanelRightClose`, mirroring the left menu's button) closes and opens the panel of inspector tabs. Closed, the history views take the full width. The choice is persistent UI state (`temporal:inspector-open`).
- **Inspector tabs.** A running run has Interact, Pending, Related, Stack and Input, and opens on Interact. A closed run has no pending Activity and no call stack, so it has Interact, Related and "Input & Result", and opens on the last one. A tab the user chose stays chosen while the next run has it.
- **Path in the header (`TemporalRunBreadcrumb.tsx`).** The header reads as a path from the general to the particular, and every part of it leads somewhere: the Workflow Type (`TemporalTypeCrumb`, a link to its diagram on Workflow Types), the Workflow ID (a link to every run of that ID), and the run. The left menu marks the screen the run was opened from, so the path does not repeat it. The run is a menu of the runs of the Workflow ID when there are several, with "2 of 3" counted from the oldest; with one run it is text, and its title says it is the only run. After the path, `TemporalRunStatus` (`TemporalRunStatus.tsx`) shows the status badge, the duration and when the run closed. Hovering or focusing it shows a card with the starter's summary, the current details the Worker last reported, the outcome (the failure message, the next run, or the first 200 characters of the result), and the Type, Queue, start and close times, duration, history size, decoded payloads and parent. The page has no other row of facts: the namespace is in the left menu, and the parent run, Streams and Tables are items of the actions menu. The page reads the runs with the filter `WorkflowId = "…"`, which a server answers by ID without a scan. A run from a history file is not on the server, so its path is text. Under 56rem the path moves to a row under the header.
- **Run chain.** `buildExecutionDetail` returns `chain` (`previousRunId`, `nextRunId`, `firstRunId`) from `continuedExecutionRunId` and `newExecutionRunId`, and the run menu in the path lists both runs, since a continued run keeps its Workflow ID.
- **Related tab (`TemporalRelatedPanel.tsx`).** Two groups. "Parent and Child Workflows" is a tree: the root, the parent, this run, and the Child Workflows it started, each indented under the Workflow that started it; this run is marked and is not a link. "Runs of This Workflow ID" lists the other runs. A group with nothing in it is one sentence, not an empty list. The tab's label counts the runs it leads to (`relatedRunCount`).
- **Failures (`data/temporal/failure.ts`, `TemporalFailurePanel.tsx`).** `decodeFailure` keeps the application failure's type, `isNonRetryable` and `details`, the `timeoutType`, and the `retryState` (from the `ActivityTaskFailed` event for a step, from `activityFailureInfo` for a Workflow). `parseStackTrace` reads the frames the TypeScript, Python, Java and Go SDKs write and marks library code (`node_modules`, `@temporalio`, `site-packages`, `io.temporal.`, `go.temporal.io`). `failureOrigin` is the first frame of the root cause that is not library code. The panel shows the root cause's type and message, "Thrown in" with that frame, the reason the server did not retry (`describeRetryState`), how the failure was reported when it wraps a cause, and the details. The stack trace is closed at first. The Worker's source is not available to Studio, so the panel names the file and line and cannot show the code.
- **Timers.** A Timer's span holds `timerMs`, the `startToFireTimeout` of its start event, and its label is that length (`Timer 5m 50s`, from `formatTimerLength`); a Timer's own ID is a sequence number and says nothing. The row of an open Timer reads the clock every second (`useNow`) and shows the time left in place of a duration. Its details (`TemporalTimerDetail`) show the length, the time it fires and a progress bar, not an empty input and output, and say what sampled runs of the type do before and after it (`typeMapNeighbours`).
- **Diagram tab (`TemporalRunDiagram.tsx`).** The diagram of the run's Workflow Type with the run marked on it. `runPathOnTypeMap` draws the one run by the rules of the diagram (`buildTypeMap` with the diagram's `timersMerged`), so its steps and arrows have the diagram's IDs. The canvas shows a step the run took with an ink border and how often it took it, the step it is at with a cyan ring and a text ("This run is here · 3m 42s left"), and the other steps faint. Every step has three lines in this mode, so the layout does not change while the run moves on. The page reads the type's diagram only while this tab or a Timer's details are open.
- **Next steps and stepping.** `runMomentOnTypeMap(run, map, position)` gives the run's state when its step number `position` started: later steps are left out, and a step that closed later counts as open. `null` is the end of the history. It also gives `next`: the steps that follow the current step in the diagram, and the steps that sampled runs started while the current step was open (`during`, as a Signal that arrives while a Timer runs). The canvas draws those with a dashed border and "Possible next · 1 of 6 runs", or "This run went here next" at an earlier step. The run page holds one selected span (`selectedSpanId`), and its index among `runSteps` is `position`. `TemporalRunStepper`, beside the history view tabs, moves it with buttons, a native range input and the left and right arrow keys; the range input is the one control here that is not a ShadCN component, because the repository has no ShadCN slider. Every view follows it: the timeline marks the span, Grouped Spans opens its row, Raw Events puts a cyan left border on the span's events (`eventIds`), and the Diagram draws the run at that step and selects its node. A click on the timeline moves it without changing the tab; a click on a diagram node the run took moves it to the latest visit. At the end of the history, `TemporalRunDiagram` reports the open spans (`onActiveSpanIdsChange`) so the timeline highlights them. The Diagram's explanation, a link to the type's diagram and a redraw from more runs are behind an info button beside the tabs (`TemporalRunDiagramInfo`).
- **Summary and details.** The start event's user metadata gives `summary` and `details`; an Activity's, Timer's or Child Workflow's summary is its span's `userSummary`.
- **Timeline.** `TemporalTimeline` draws the spans on one time axis. `buildTimelineScale` (`data/temporal/timeline-scale.ts`) maps time to position, and with "Shorten idle time" a long stretch in which no span starts or ends takes a small fixed width. Two kinds of stretch are shortened: one in which the Workflow only waits (a Timer, or nothing at all) and that is at least 10 seconds and a quarter of the run's working time, and one with work in it that is three times longer than everything else (an Activity that has retried for hours). A stretch is kept when no other span lies outside it. A bar that crosses a shortened stretch is striped there. The panel is as tall as its rows, up to the height the user set, and says how many rows are below. Moving the pointer over the bars shows the time under it on the axis and a card with the span's start, duration, attempts and failure. The timeline zooms (buttons, or Ctrl or Cmd with the wheel), filters by span kind, resizes by its lower edge, keeps the name column's width that the user drags or keys in (`temporal:timeline-label-width`, persistent UI state; `null` follows the panel width, and the bars keep at least 140 px), draws the time before an Activity's last start as a thin line (queue wait, or earlier attempts), and shows a Child Workflow's spans inline when its row is expanded.
- **Raw events.** Each row names what the event belongs to (the Activity, Child Workflow, Signal or Timer, found through `scheduledEventId`, `initiatedEventId` or `startedEventId`) and a failure message. The Event Types menu hides event types. The open event is the `temporalEvent` URL key, so the page's link opens the raw list at that event, and each open event has a Copy Link button.
- **Reset.** On a server with `supportsReset`, a `WorkflowTaskCompleted` event has "Reset to Here", and the actions menu resets to the first or the last Workflow Task. A reset starts a new run from the history up to that event; the page opens the new run.
- **Activity and Workflow pause.** With `supportsActivityOperations`, each pending Activity has Pause or Unpause and Reset (attempts start from one). With `supportsWorkflowPause`, the actions menu pauses and resumes the Workflow. Both flags are false on `slate-temporal-next`.
- **History files.** "Download Replay JSON" writes the history as the server stores it, in proto3 JSON (`toProto3Json` turns protobuf.js timestamps and durations into `…Z` and `…s` strings, and a zero duration, which protobuf.js leaves as `{}`, into `0s`; the TypeScript SDK's `Worker.runReplayHistory` accepts the file), which SDK replayers and `temporal workflow replay` read. The grid's "Open a history file" reads such a file, or one from the Temporal CLI or UI, and `buildExecutionDetailFromHistory` builds the page from it in the browser; that page offers no action, because the run may not exist on this server.
- **Narrow pages.** The page and the Workflows grid are container-query containers (`@container`), because Studio is embedded and its sidebar opens and closes: the width of the page decides the layout, not the width of the window. Under 56rem the Workflow Type and Workflow Id move to a row under the header, the panels stack, and the page scrolls as one. The grid's header drops the Live control and the history file button as it narrows.

## Workflow IDs (`TemporalWorkflowIdsView.tsx`, `TemporalWorkflowChainView.tsx`)

`temporalSection=workflow` is the level between a Workflow Type and a run. Without `temporalWf` it is the list of Workflow IDs; with it, it is the page of one ID.

- **The list.** No server can list distinct Workflow IDs, so the list reads one page of 200 executions with no sort and no counts, and groups it by Workflow ID in the browser (`groupRunsByWorkflowId`). Its footer says which executions those are: the most recently started on a server that lists newest first, the first the server lists otherwise. The cost does not grow with the namespace.
- **Search.** The field's text is kept in `search` and sent as `WorkflowId STARTS_WITH "…"`, which a server answers from the ID without a scan. Opening an ID or a run from the list clears `search` in the new history entry, so the Executions list never inherits it and Back returns to the search.
- **The page of one ID.** It reads `WorkflowId = "…"` newest first, 100 runs a page. When the first page is the whole chain, the status counts, the status filter and the run numbers come from those rows. When it is not, `useTemporalWorkflowCounts` asks the server for the counts of the ID, and the status filter becomes part of the query (`AND ExecutionStatus = "…"`). A run's number counts from the oldest, so it shows only when the total is known and no server-side filter is on. With a server-side filter the Run column is left out, because it would hold only a dot that repeats the status.
- **Status filter in the URL.** The filter is `temporalStatus`, so reload, a shared link and the Back button keep it. Opening a run or another Workflow ID clears it in the new history entry. The page number stays in component state, as in the Executions grid.
- **Counts that fail, and no answer yet.** A server that cannot count the ID returns no total. The page then shows the loaded count with a plus sign, no run numbers and no status filter. While the first request is on its way, or after it failed, the page shows no run count at all: "0 runs" would be a false statement.
- **Row cursor.** `j`, `k` and the arrow keys move a cursor that the page scrolls into view, marked like the cursor of the Executions grid. The pointer does not move it. `isShortcutBlockedTarget` leaves the arrow keys to a focused radio group or tab list, so the time format control does not move the cursor.
- **Header.** The path is the Workflow Type of the runs (once the first run has loaded), then the Workflow ID; Workflow IDs is in the left menu, so the path does not name it. The status is the latest run's `TemporalRunStatus`; its card loads that run's result and details only when it opens, and adds the number of runs and when the first one started. Start Execution is the page's one primary button; a run opens from its row. There is no row of facts under the header.
- **Narrow pages.** Under 48rem the path and the status of the latest run move to a row under the header. The Paused and Live control is dropped under 42rem only while it reads Live, so a paused page always says so. The columns leave in this order: Closed and Size, Events, then Duration.
- **Run IDs.** The table shows the whole run ID on a wide page and the first 8 and last 4 characters on a narrow one. UUIDv7 run IDs made within about a minute share their first 8 characters.
- **State per ID.** `TemporalView` gives the page a `key` of namespace and Workflow ID, so paging, the filter and the remembered latest run start fresh for each ID.

## Times

`TemporalTime` writes every point in time in the format the user chose with `TemporalTimeFormatControl`: relative, local or UTC. The choice is persistent UI state (`temporal:time-format`), and the tooltip always holds all three.

## Saved Views

`useTemporalSavedViews` keeps the user's Workflows searches in persistent UI state (`temporal:saved-views`, 20 at most). A view holds a name, the search text and the sort. The sidebar lists three built-in views (Running, Failed, Timed Out) and then the user's own. A view is shared by copying the page's link, because the URL holds the whole search.

## Search Field Autocomplete (`TemporalSearchField.tsx`)

- `suggestListFilter` (`temporal-filter-suggestions.ts`) is a pure function of the text, the cursor position and the facets. It returns attribute names where a comparison starts, values after an operator, and AND or OR after a complete comparison. Each suggestion holds the whole new text and the new cursor position.
- Attribute names match by their start or by the start of a later word ("queue" finds `TaskQueue`). Values come from `getFacets` (Task Queues, Workflow Types), the fixed status list, and time presets. Other attributes get no value suggestions.
- In a namespace too large for the BFF to copy, `getFacets` reads one page of all runs and one page of the running runs, and reports `complete: false`. The suggestions then show no counts, and a Task Queue or Workflow Type with no run in those two pages is missing.
- The field is a `combobox` whose list is a `Popover` anchored to the form. The focus stays in the field. Tab takes the first or the chosen item. Enter takes an item only after the arrow keys chose one; otherwise it submits the text as typed.
- The filter builder reads the same attribute list (`listFilterAttributes`).

## Status Presets and Recent Filters (`TemporalStatusFilterBar.tsx`)

- The preset counts come from `useTemporalWorkflowCounts`: the counts of the namespace with no filter. It uses the query key of the unfiltered list's counts, so the grid, the sidebar and the bar share one response. The counts of the current filter are not used for the presets, so the row does not change when a filter is applied.
- `statusPresetOfQuery` decides which preset is selected: "All" for no search, a status for a filter on that status alone, and none for anything else.
- A search that is not a preset is drawn as a selected item after the presets, with the number of matches once the count of that filter has loaded (`hasCounts`). The item is the trigger of a `DropdownMenu` with the recent filters.
- `useTemporalRecentFilters` (`temporal-saved-views.ts`) keeps the last ten such searches in persistent UI state (`temporal:recent-filters`). The grid adds a search only after the server answered it, so a filter with a syntax error is not kept.
- While the rows of a new filter load, the selected item shows a spinner in place of its icon.
- Plain text in the search field is not a List Filter. Its item reads "starts with <text>", because the grid finds the runs whose workflow ID, type or run ID starts with it.

## Start Workflow Form (`TemporalStartSheet.tsx`)

Each opening of the sheet mounts a new form (`key` on the inner component), with its state taken from the preset. No effect resets the form, so a refresh of the facets while the sheet is open changes nothing the user typed.

The form opens with no Workflow Type. Once the type is one that has runs, `useTemporalTypeInputs` asks `GET /v1/namespaces/:ns/workflow-types/:type/inputs` (`getTypeInputs`): the BFF reads the first history event of the ten newest runs it knows of the type, decodes all inputs with one codec request, and returns them with the Task Queue that most runs of the type are on. A name that is still being typed is not a known type and sends no request. The form then fills in, once per type:

- the Task Queue, unless the user changed it;
- the input of the newest completed run (else the newest running, else the newest), unless the user changed the input. A note under the editor names that run. An input that no codec decoded (`isEncoded`) is never used.

The Workflow ID follows the type (`order-fulfillment-x7k2p`) until the user writes one.

`data/temporal/input-suggestions.ts` holds the logic of the editor's completions. `inputContextAt` reads the JSON text up to the cursor, which need not be valid, and says whether a key or a value goes there and at which path; an argument is its position in the list, an item of any other array is `*`. `suggestInputCompletions` offers the keys that recent runs have in that object and this input lacks, or the distinct values they have at that path, the most common first. `compareInputWithSamples` names keys that all recent runs pass and the input lacks, and keys that none passes; the form shows them as notes, not as errors.

`TemporalJsonEditor.tsx` is a CodeMirror editor with a small JSON tokenizer (no new dependency) and a completion source that calls `suggestInputCompletions`. Taking a key opens the values for it. Escape closes the list of suggestions before it closes the sheet: the sheet asks the editor through its `handle`.

## Query Status (`TemporalQueryStatusButton.tsx`)

The refresh button of the Workflows grid is a status while a query that the user asked for runs. The grid gives it a phase: `rows` while the rows of the current filter, sort or page are not here (`isLoading`, `isPlaceholderData`, or a click on refresh), then `count` while the first counts of the filter are on their way (`isCounting`). The elapsed time runs through both phases and starts again when the `queryKey` changes. A background poll is not a phase: it only spins the refresh icon, so the button does not change every 2.5 seconds in Live mode.

The status is a `role="status"` element with the phase in words; the time is `aria-hidden`, because it changes ten times a second.

## Run Preview in the Grid (`TemporalRunPreview.tsx`)

- A row's fold-out loads the run's detail only while it is open. `summarizeRunSteps` (`data/temporal/run-steps.ts`) groups the spans into steps: one for each Activity type, Child Workflow type, Signal and Update, and one for all Timers. At most six steps show; steps that failed or are still open are kept first.
- The steps share one time axis from `buildTimelineScale` with idle time shortened. A grey band marks the time that is not drawn to scale.
- The third block depends on the run: the failure and the step that failed, the pending Activities with attempt and next attempt, the result, or for a running Workflow the open Timers and Child Workflows. A Timer's fire time comes from `startToFireTimeout` of its `TimerStarted` event.
- The fold-out is `sticky left-0` and `100cqw` wide, the width of the grid's container, so it stays in view when the table is wider than the page and scrolls sideways.

## History Grouping (`data/temporal/history-grouping.ts`)

Raw Temporal history events are paired into grouped execution spans (`activity`, `timer`, `child-workflow`, `signal`, `update`, `workflow`) while keeping the full raw event stream accessible via a view toggle. Pending retrying activities from `DescribeWorkflowExecution` are merged into the span list so live retry attempts, backoff timestamps, and last failures appear directly in both the Gantt timeline and the Diagnostic Callout strip.

A Timer or an Activity that is still open when the run closes gets the status `canceled`, because the server drops both with the run. A Child Workflow keeps its status: with the Abandon policy it runs on.

Raw event attributes are decoded before they leave the BFF: `decodeAttributePayloads` replaces every nested Temporal payload with its decoded value, so the Raw Events view shows JSON instead of one entry per byte.

## UI Conventions (`ui/studio/views/temporal/`)

- **Spacing.** Stack children with `flex flex-col gap-*` and separate rows with `[&>*+*]:border-t`. Do not use Tailwind's `space-x-*`, `space-y-*`, or `divide-*` utilities. Studio's stylesheet emits the scoped preflight reset a second time after the utilities, and that reset has the same specificity as these `:where()`-based utilities, so it cancels them.
- **Shared primitives.** `TemporalPrimitives.tsx` holds the status badge, segmented control, form field, section label, namespace badge (used only in the sheets that create a run or a schedule; a screen's header leaves the namespace to the left menu), confirmation dialog, table header class, and the icon scale applied to each view root and each sheet.
- **Type scale.** Body text is `text-xs`. Labels and metadata are `text-2xs`. Do not use arbitrary pixel sizes.
- **Tables.** Column headers and row borders match the Queries table (`temporalTableHeadClass`, `border-border/70` on the header row, `border-border/60` on body rows). The shared `TableRow` sets a border width but no colour, so every row must pass a border colour.
- **Status.** Labels stay ink-coloured. The badge fill and icon carry the status.
- **Refresh mode.** `tail` and `live` poll on the same interval, so `TemporalFollowControl` shows two options: Paused and Live.
- **Confirmation.** Terminate, request cancel, delete, trigger, backfill, an Activity reset, a sticky queue reset, every bulk action, and closing an admission class each ask for confirmation through `TemporalConfirmDialog`. Pause and resume are one click and are disabled while the request runs.
- **A failed request.** A first load that fails shows `TemporalLoadError`: one sentence that names what could not load, the server's message as detail, and Retry. A screen that already shows data keeps it when a later request fails and shows `TemporalRefreshError` above it, so typed text and open rows are not lost. A query stops polling after a failed first load, so the error does not alternate with a skeleton, and a request the server refuses (4xx) is not sent again.
- **No number before the first answer.** A count, a total or "0" shows only once the server has answered. While a request is on its way, the place is empty or a skeleton.
- **Primary buttons.** A filled (default variant) button does one thing: it starts, sends, saves or confirms an action, such as Start Execution, Send, Create Schedule or a dialog's confirm. A screen or sheet has at most one. A link or a button that only opens or shows something (View All Runs, Inspect, Edit Filter, Close) is an outline or ghost button. An empty state's button that repeats the header's action is an outline button.
- **Data age.** A screen that shows sampled or polled data has an "As of" or "Checked" time that keeps counting while refresh is paused. Under a narrow page the Paused and Live control is dropped only while it reads Live.
- **Row cursor.** In Executions, Workflow IDs and the page of one Workflow ID, `j`, `k` and the arrow keys move a cursor that is kept by row key, scrolled into view, and marked with an inset bar. The pointer does not move it.

## URL State

All Temporal navigation state lives in the URL hash via `useNavigation()` (`view=temporal`, `temporalNs`, `temporalSection`, `temporalWf`, `temporalRun`, `temporalSchedule`, `temporalType`, `temporalEvent`, `temporalFollow`, `temporalStatus` for the status filter of one Workflow ID, and `search` and `sort` for the Workflows list). Opening or closing a run or a schedule writes the URL with `history: "push"`, so the browser's Back button returns to the screen before; every other change replaces the current entry. See [`Architecture/navigation-url-state.md`](navigation-url-state.md).

**A run keeps the screen it was opened from.** `temporalSection` names the left-menu entry a page belongs to, and opening a run does not change it: `temporalSection=workflow&temporalWf=…&temporalRun=…` is a run opened from the page of its Workflow ID, `temporalSection=attention&temporalWf=…` one opened from Attention. `TemporalView` shows the run page for any section that has a `temporalWf`, except `workflow` without a `temporalRun`, which is the page of the Workflow ID. `temporalSection=recent` is a run opened from the menu's Recent Runs. The left menu marks that screen. The run page's path is the hierarchy of the run instead: its Workflow Type, its Workflow ID, then the run.

## Sidebar

Temporal is one of the sidebar's data services (see "Data Services" in [`Architecture/navigation-url-state.md`](navigation-url-state.md)). Its scope picker is the namespace, its views are Workflow Types, Workflow IDs, Executions, Attention, Schedules, Task Queues, Workers (on servers that report pollers), and Cluster & Shards, and its object list holds the saved views (see "Saved Views") and the newest workflow runs started in the last five minutes, at most 20 and one per Workflow ID.

- Every Temporal sidebar entry is a link built with `createUrl`. A saved view is the Workflows list with its visibility query in `search`; a recent run is `temporalSection=recent` with `temporalWf` and `temporalRun`.
- The sidebar marks one entry as open, and opening a run never moves the mark: the entry is the one `temporalSection` names. A recent run is marked only when it was opened from Recent Runs (`temporalSection=recent`); the same run opened from Executions leaves Executions marked. A saved view is marked when its query equals `search` and no run is open.
- The sidebar's workflow query polls while another service is open, because it feeds the failed-workflow dot on the service switcher. It stops polling only when the Temporal view is open and paused.
- Links from a workflow to Streams and Tables are anchors with a full URL, never a series of `set*Param` calls.
