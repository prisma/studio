# Temporal: the queries Studio needs to be fast

Written 2026-11-23, updated 2026-11-24 (twice). It has three parts:

1. The read queries the Temporal screens of Studio send, how long each takes today, and how fast each must be.
2. How Temporal's own product answers the same queries, from its public documentation and source code.
3. What `slate-temporal-next` would have to change to answer them as fast, and what Studio should change.

Facts about `slate-temporal-next` are from its `origin/main` at `264fb3e4` (2026-11-24). The hosted demo runs `3eed2002`, which is 174 commits older and still answers lists and counts with a scan. Every time in section 2 is from that older build. Section 5 lists what I did not verify.

The second update of 2026-11-24 adds section 4.8: every proposal checked against the server's `origin/main` at `c2bfee8a`, the changes that check forced, four gaps the earlier text did not cover, what Studio does on each kind of server, and the work packages with their state. Where 4.8 and an earlier section disagree, 4.8 is right.

The first update of 2026-11-24 adds: a second round of measurements on a larger namespace (section 2.5), three more queries (20 to 22), what Temporal offers on Workflow Types and code versions (section 3.7), the new state of the server (section 4.1), and proposals H to J for Workflow Types and their versions as metadata (section 4.3).

## 1. Summary

- Studio sends 22 kinds of read. Seven took 3 to 6 seconds on the hosted demo when it held 11,700 runs. Two more are fast only because the Studio server keeps a copy of the runs. All nine have one cause: the server answers every list and count by reading every run record of the namespace.
- The times grow with the namespace. Eight hours later the demo held 15,467 runs, and the count per status took 10 seconds. Above 10,000 runs the Studio server can no longer copy the namespace, and three screens showed numbers from a sample that were wrong (section 2.5).
- Temporal Cloud keeps a second store for these queries, an Elasticsearch index per cell. The index is sorted in the default list order and indexes every filter attribute. Temporal fills it after the workflow change, so it lags by design. Temporal Cloud also refuses the expensive queries: it does not support `ORDER BY`, it groups counts by status only, and it limits a namespace to 30 list or count calls a second.
- `slate-temporal-next` has a plan with the same shape (`docs/scaling/visibility-records.md`, "P2-10"): one record per run in Temporal's order, counters per status, filled by a feed after the state change. On 2026-11-23 its readers and the switch merged to `main`, so `main` no longer scans. Its cost check has missed twice, and the hosted demo does not run it yet.
- That plan fixes the count per status and the order of the rows. The other slow queries need additions that the plan does not have: closed runs grouped by status, counters and index rows by Workflow Type and Task Queue, a Workflow ID prefix index, and an index of runs with problems.
- Temporal has no call that lists the Workflow Types of a namespace or describes what a type does. Studio now draws a diagram of each type and fills the Start Workflow form from the histories of sampled runs. A small catalogue of types, and the code version of each run, would make both exact and cheap (proposals H and I).
- **At 10 million runs** the default Executions list, one run, the runs of one Workflow ID and the Cluster screen stay fast. Text search, a filter on a Workflow Type, a Task Queue or a rare status, the count of such a filter, the lists of types and queues, and Attention do not: each stops at the server's limit of examined records and then shows too little or fails. Section 4.8 is the plan that fixes them, with its write cost.
- Studio offers four things that Temporal's product does not: sorting by any column, lists of the values in use, a list of Task Queues, and the Needs Attention screen. There is no upstream design to copy for these. Section 4 proposes one for each.

## 2. The queries

### 2.1 How the times were measured

Each request went from a laptop to the hosted Studio server (Singapore), which calls the Temporal server next to it. Three samples each. A request that does no Temporal work takes 0.14 to 0.19 seconds, so subtract about 0.15 seconds for the network. The namespace held about 11,700 runs, of which about 420 were running.

The Studio server keeps copies of some answers. Where a time comes from a copy, the table says so.

### 2.2 Targets

These targets are my proposal. They are server time, without the network.

- **Interactive, 100 ms**: the answer follows a click or a key press, and the user waits for it with nothing else to look at.
- **Secondary, 500 ms**: the answer fills a part of a screen that is already usable.
- **Background, 2 s**: the answer refreshes on a timer.

### 2.3 The list

| #   | Query                                                       | Where Studio uses it                                           | Temporal calls today                                                                                          | Measured                                                             | Target                      |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------- |
| 1   | First page of runs, newest first                            | Workflows grid on open, every 2.5 s in Live mode               | `ListWorkflowExecutions`, no filter                                                                           | 0.24 to 0.27 s, but in Workflow ID order, not newest first           | 100 ms                      |
| 2   | Next page of the same list                                  | Grid paging                                                    | Same, with a page token                                                                                       | Same as 1                                                            | 100 ms                      |
| 3   | Runs of one status                                          | Status presets, saved views, sidebar links                     | `ExecutionStatus = "X"`                                                                                       | Running: 0.45 to 0.68 s. Timed Out (90 runs): 3.3 to 3.5 s           | 100 ms                      |
| 4   | Count per status, whole namespace                           | Status presets, sidebar badges, every 10 s                     | `CountWorkflowExecutions` with `GROUP BY ExecutionStatus`                                                     | 5.2 to 5.9 s. At 15,467 runs: 10.4 s, and 32 s once                  | 100 ms                      |
| 5   | Runs by Workflow Type or Task Queue, alone or with a status | Search field, filter builder, Task Queues "Open all" link      | `WorkflowType = "x" AND ExecutionStatus = "y"`                                                                | 5.3 to 6.7 s                                                         | 100 ms                      |
| 6   | Count for any other filter                                  | The match count beside a custom filter, the bulk action dialog | Count with that filter                                                                                        | 5.1 to 5.2 s                                                         | 500 ms                      |
| 7   | Runs whose Workflow ID, type or run ID starts with a text   | Plain text in the search field, command palette                | Three `STARTS_WITH` conditions joined by `OR`                                                                 | 5.4 to 5.9 s                                                         | 100 ms                      |
| 8   | Runs started in the last five minutes                       | "Recent runs" in the sidebar, every 2.5 s                      | `StartTime > "t"`, 100 rows, sorted by Studio                                                                 | 0.45 to 0.56 s                                                       | 500 ms                      |
| 9   | Runs sorted by a column                                     | Column headers of the grid                                     | None: the server refuses `ORDER BY`. Studio reads up to 10,000 matching runs and sorts its copy               | 5.4 s the first time, 0.18 s from the copy                           | 500 ms                      |
| 10  | The Workflow Types and Task Queues in use, with counts      | Search field autocomplete, filter builder, Start Workflow form | None exists. Studio reads every run, or two pages when there are more than 10,000                             | 4.8 to 5.9 s. At 15,467 runs: 6 to 7.6 s, with no counts             | 100 ms                      |
| 11  | One run: description and event history                      | Run page, grid fold-out, every few seconds in Live mode        | `DescribeWorkflowExecution` and `GetWorkflowExecutionHistory`                                                 | 0.23 to 0.29 s for 40 events, 0.38 to 0.62 s for 345                 | 100 ms for the first screen |
| 12  | All runs of one Workflow ID                                 | Run switcher in the header, "Related" tab                      | `WorkflowId = "x"`                                                                                            | 0.15 to 0.22 s for 18 runs. The server reads only that ID's records  | 100 ms                      |
| 13  | Runs that need attention                                    | Needs Attention screen, sidebar badge                          | `DescribeWorkflowExecution` for every running run, 1,500 at most, 12 at a time                                | 0.13 s from a copy that Studio rebuilds every 15 s                   | 500 ms                      |
| 14  | Task Queues with their load                                 | Task Queues screen                                             | None exists. Studio combines its copy of every run, the attention check, and the history of two runs per type | 0.9 to 1.3 s. At 15,467 runs: 1.2 to 3.3 s, with wrong counts        | 500 ms                      |
| 15  | Pollers and backlog of one Task Queue                       | Task Queues screen, Workers screen                             | `DescribeTaskQueue`, which our server does not implement                                                      | 0.8 to 1.1 s for the Workers screen, with no poller data             | 500 ms                      |
| 16  | Schedules with their next run times                         | Schedules screen                                               | `ListSchedules`, then `DescribeSchedule` for each row                                                         | 0.39 to 0.45 s with few schedules                                    | 500 ms                      |
| 17  | The handlers a Workflow has, and its call stack             | Interact tab, Stack tab                                        | `QueryWorkflow`                                                                                               | Not measured. A Worker answers, so the server only adds routing time | 500 ms                      |
| 18  | Namespaces and server features                              | Namespace picker, feature checks                               | `ListNamespaces`, `GetSystemInfo`, `GetClusterInfo`                                                           | 0.14 to 0.19 s                                                       | 500 ms                      |
| 19  | Every run that matches a filter                             | Bulk Signal, Cancel and Terminate on "all matches"             | Studio lists the matches page by page and calls each run                                                      | Not measured                                                         | Background                  |
| 20  | The steps of a Workflow Type, from a sample of its runs     | Workflow Types screen, Diagram tab of a run, Timer details     | None exists. Studio lists the type's runs and reads the history of 40 of them, 1,000 events each at most      | 1.1 s for a type. 0.13 s from a copy Studio keeps for a minute       | 500 ms                      |
| 21  | The inputs of the newest runs of a type                     | Start Workflow form                                            | None exists. Studio lists the type's runs and reads the first history event of 10 of them                     | Not measured on the hosted demo                                      | 500 ms                      |
| 22  | Health of the server and its shards, with the reasons       | Cluster & Shards screen                                        | The server's admin HTTP API: `/readyz`, `/v1/info`, `/v1/storage`, `/v1/load`, `/v1/cell`, `/v1/placement`    | 0.21 s                                                               | 500 ms                      |

### 2.4 What the list shows

- **Fast today**: 1, 2, 11, 12, 16, 18. These are point reads, short ranges, or a scan that stops after one page.
- **Slow today**: 3 (for a rare status), 4, 5, 6, 7, 9, 10, and the work behind 13 and 14. Each of these makes the server or Studio read every run of the namespace. The time grows with the namespace: the server's own measurement of a namespace with 1,010,000 runs is about 1 second for the first page, and its count did not finish in 30 seconds.
- **Wrong order today**: 1, 2, 3, 5. Rows come in Workflow ID order. A user expects the newest run first, so Studio asks for a sort (query 9), which is the slow path.
- **Copies hide the cost**: 9, 10, 13 and 14 look fast on a second request because the Studio server holds a copy of up to 10,000 runs. Above 10,000 runs it holds no copy, sorting stops, and the lists of types and queues become incomplete. The hosted demo is already above that size.
- **Fast by ID**: 12 is fast at any namespace size, because a filter on one Workflow ID reads only that ID's records. Studio now uses it on every run page.

### 2.5 The second round, on a larger namespace

Between the first measurements and the evening of 2026-11-23 the demo's namespace grew from about 11,700 runs to 15,467, of which about 540 were running. The demo starts runs all day, so it passed Studio's copy limit of 10,000 runs within hours. This round showed these things:

- **The scan's times grew with the namespace.** The count per status went from 5.2 to 5.9 s to 10.4 s. One count took 32 s. I did not find the cause of that one.
- **A page of 1,000 rows costs about half a second.** Reading 11,000 rows in pages of 1,000 took 5.9 s, which is 0.54 s a page. One page of 1,000 rows on its own took 0.87 s.
- **One count used most of the server.** The server has one CPU core. While a count ran, the load report showed 0.5 to 0.9 of the core in use and a CPU headroom of 0 to 18%. The shard reported the state `busy` during the day. I could not tie that report to one request, but Studio's own reads are the largest load on this demo.
- **Studio's failed copy was itself a cost.** Above the limit, every refresh read 11 pages to find out that the namespace was too large, and then discarded them. The Studio server now remembers that answer for five minutes.
- **Numbers from a sample were wrong.** The Task Queues screen counted the first 1,000 runs the server lists. Those come in Workflow ID order, so they were one Workflow Type. The screen showed 44 running runs on a queue that had 540, and listed 3 of 5 queues. Studio now counts the queues from the running runs only, which it can still copy. The counts of running runs are exact; the failed and total counts are not shown above the limit. This is the strongest reason for additions B and F.
- **Studio limits itself to two list calls and one count at a time**, so that it does not use the server's four calls per project. A copy that refreshes in the background therefore delays a list the user waits for.
- **The first request after a restart is slow.** The Studio server holds its copies in memory. After a deploy, the first request for the types and queues took 15.6 s, the first diagram of a type 11.6 to 24 s, and the Task Queues screen 2 to 4 s. Later requests took about 0.15 s each.

Times after the changes in Studio, at 15,467 runs: Task Queues 0.14 to 0.18 s, the types and queues 0.15 s from a copy kept for 30 seconds. Both still depend on a scan of the running runs in the background.

## 3. How Temporal's product answers them

### 3.1 A second store, built for these queries

Temporal calls this store Visibility. Its documentation says: "Visibility is a search index that Temporal updates asynchronously", and "Treat Visibility as eventually consistent and avoid depending on a fixed or guaranteed delay."

In Temporal Cloud the store is Elasticsearch. Each cell of Temporal Cloud has its own "Elasticsearch for Workflow visibility and search", beside its primary database.

Three properties of that index give the speed. They are in the open-source server, which Temporal Cloud builds on:

- **The index is stored in the default list order.** The index template sets `sort.field` to `CloseTime, StartTime, RunId`, all descending, with missing values first. A running workflow has no close time, so running workflows come first, newest first. A page of the default list is the start of the index.
- **Every filter attribute is indexed.** `ExecutionStatus`, `WorkflowType`, `WorkflowId`, `RunId` and `TaskQueue` are `keyword` fields, and the times are date fields. Elasticsearch keeps an index per field, so a filter on any combination does not read every record. That last sentence is how Elasticsearch works in general; Temporal's documents do not say it.
- **A page continues from the last row, not from an offset.** The page token holds the sort values of the last row (`search_after`). Page 500 costs the same as page 1.

Counts use the Elasticsearch count call, and `GROUP BY ExecutionStatus` uses a terms aggregation. The API says the result is approximate: "the count is an approximate number".

The index is written after the workflow change. The history service queues a visibility task, and a bulk writer sends it to Elasticsearch and waits for the acknowledgement.

### 3.2 The same design on a SQL database

The open-source server can also keep Visibility in PostgreSQL, MySQL or SQLite. The schema shows the same idea with plain indexes:

- One row per run in `executions_visibility`, with primary key `(namespace_id, run_id)`.
- A default index in the list order: `(namespace_id, COALESCE(close_time, '9999-12-31 23:59:59') DESC, start_time DESC, run_id)`.
- One more index for each filter attribute: status, Workflow Type, Workflow ID, Task Queue, parent, root, and each custom Search Attribute. Each starts with `namespace_id` and the attribute and ends with the same three ordering columns. A filter on one attribute therefore returns rows in the default order straight from an index.
- Custom Search Attributes are a fixed set of columns, so each can have its own index: 3 per type and 10 keywords on SQL, against 20 per type and 40 keywords in Temporal Cloud.

The file has about 100 indexes. Temporal pays for fast reads with slower writes to this store, and it can, because the store is written after the workflow change and not in its transaction.

### 3.3 Temporal refuses the expensive queries

- **No sorting.** "The ORDER BY operator is currently not supported in Temporal Cloud." The SQL store refuses it too.
- **Counts group by status only.** "The GROUP BY clause is only supported in the Count API and currently only grouping by ExecutionStatus is supported."
- **A rate limit.** Temporal Cloud allows 30 Visibility calls a second per namespace, and the limit cannot be changed in settings. It covers every list and count call, and `DescribeTaskQueue`.
- **Some fields exist on closed runs only.** "CloseTime, HistoryLength, StateTransitionCount, and ExecutionDuration are present only in a closed Workflow Execution." The store is not updated while a run makes progress.
- **Lower promises.** The latency objective of Temporal Cloud (p99 of 200 ms) covers Worker requests. Visibility has an availability target of 99.5% and is not covered by the service agreement.
- **Bounded histories.** A run's history ends at 51,200 events or 50 MB, so reading one run has a known upper cost.

### 3.4 Reads that do not use the second store

- **One run by ID.** `DescribeWorkflowExecution` "read[s] the primary store". Temporal Cloud's primary store is its own: sharded, with a write-ahead log, replicated across three availability zones, and it moves the history of a closed run to object storage.
- **Event history.** `GetWorkflowExecutionHistory` is paged. With `wait_new_event` the call stays open until a new event arrives, so a client that follows a run does not poll. `GetWorkflowExecutionHistoryReverse` returns the newest events first.
- **Task Queues.** `DescribeTaskQueue` returns the pollers and, when asked, statistics: an approximate backlog count, the age of the oldest task, and the rates at which tasks are added and dispatched, "averaging the last 30 seconds". A Worker leaves the poller list "if 5 minutes have passed since the last poll request". These come from the memory of the service that matches tasks to Workers, not from a scan.
- **Problems.** The server writes a Search Attribute, `TemporalReportedProblems`, that "stores information about Workflow task failures". A list filter can then find runs whose Workflow code fails. I found no such attribute for a retrying Activity.

### 3.5 What Temporal's product does not offer

Four Studio features have no counterpart, so there is no upstream design for them:

- Sorting the list by any column (query 9).
- The Workflow Types and Task Queues in use, with counts (query 10).
- A list of all Task Queues (query 14). `DescribeTaskQueue` needs a queue name.
- A list of retrying Activities and of tasks that no Worker picks up (query 13).

### 3.6 What is not public

Temporal has not published the database behind Temporal Cloud's primary store, the size or settings of its Elasticsearch clusters, or latency figures for list and count calls.

### 3.7 Workflow Types and code versions

A Workflow is code on a Worker. The server stores what each run did, not what a Workflow Type can do.

- **No list of Workflow Types.** The Workflow service has no call that lists the Workflow Types of a namespace, and none that returns a definition or a schema of a type. Its call names hold no "WorkflowType", "Definition" or "Registry".
- **Workers report their state, not their types.** Since server 1.29 a Worker can send heartbeats (`RecordWorkerHeartbeat`), and `ListWorkers` and `DescribeWorker` return them. The state is kept in the memory of the matching service, and the two calls are off by default. A heartbeat holds the Worker's identity and host, its Task Queue, its deployment version, the SDK name and version, its task slots and pollers, and its sticky cache. It holds no Workflow Types and no Activity Types.
- **A running Workflow can describe itself.** The SDKs answer the Query `__temporal_workflow_metadata` with the Queries, Signals and Updates the Workflow handles. Studio uses it. It needs a Worker, and it says nothing about the steps.
- **A code version is a Worker Deployment Version.** "A Build ID, in combination with a Worker Deployment name, identifies a single Worker Deployment Version." A Pinned Workflow "is guaranteed to complete on a single Worker Deployment Version"; an Auto-Upgrade Workflow moves to new versions as they roll out.
- **Each run carries its version.** `DescribeWorkflowExecution` returns `versioning_info` (the behaviour, and the deployment version that completed the last Workflow Task) and `worker_deployment_name`. Every `WorkflowTaskCompleted` event in the history holds the version of the Worker that completed it.
- **Versions are Search Attributes, so a list filter finds the runs of a version.** `TemporalWorkerDeploymentVersion` is "the Version string of the associated Worker Deployment, in the format `<deployment name>:<build id>`". `TemporalUsedWorkerDeploymentVersions` is "the list of all Worker Deployment Versions that completed Workflow Tasks for the Workflow Execution". `TemporalWorkflowVersioningBehavior` holds "Pinned" or "Auto-Upgrade". `TemporalChangeVersion` holds the patches a run took (`patched()` or `GetVersion`). `BuildIds` is the older form and is deprecated since server 1.31.

So Temporal answers "which runs ran on version X" with a filter. It does not answer "which types exist" or "what does this type do". Those two are Studio features with no upstream design, like the four in section 3.5.

## 4. Proposal for `slate-temporal-next`

### 4.1 Where the server stands

On the hosted demo (`3eed2002`):

- **List and Count read run records.** They scan the `run/` key space of every shard the server holds, merged by key, and check each record against the filter. The only narrowing is a filter that names Workflow IDs with `=` or `IN`.
- **Limits.** A page examines 10,000 records at most and may come back short. A count examines 100,000 at most and then fails. Four calls may run at once per project and eight per server; the next one is refused.
- **Reads are consistent.** A list shows every acknowledged change at once, which Temporal does not promise.

On `main` (`264fb3e4`), after the merges of 2026-11-23:

- **List and Count read Visibility records.** The plan in `docs/scaling/visibility-records.md` describes per-namespace records in three key spaces: `vis` (counters, then open runs newest first, then closed runs by close time), `vis_run` (one row per run in Workflow ID order) and `vis_due` (the feed's queue). Its readers (step 5) and the switch (step 6) are merged, and the namespace scan is deleted. So are the calls between servers (step 7), retention (half of step 8) and the move of closed records to the cold tier (step 10).
- **The cost check has missed twice.** The early check allowed 5% more CPU and measured 5.94%, then 5.91% on a second measurement, and was accepted as a miss. The gate of step 8 allows 1% of starts to be refused. It measured 2.147%, and 3.916% after a remedy. The priced month rose by 8.73% (from $432.8 to $470.6) and was not accepted. The feed's lag passed (p99 of 0.52 s against 1 s). One more round is planned, and `main` is frozen for code until it is decided.
- **The filters are the same.** A filter on Workflow Type or Task Queue still checks every record of the ordered scan, a count for such a filter still stops at 100,000 records, and `STARTS_WITH` still narrows nothing.

On both:

- **Refused or missing.** `ORDER BY`, filters on custom Search Attributes, `DescribeTaskQueue`, `GetWorkflowExecutionHistoryReverse`, `ListSearchAttributes`, batch operations, the Worker Deployment calls, and `RecordWorkerHeartbeat`, `ListWorkers` and `DescribeWorker`.
- **One run by ID is already fast.** Describe is a point read. History is a range scan of 1,000 events a page.
- **The server records the Worker's version.** Each `WorkflowTaskCompleted` event keeps the Worker's version stamp, which holds its Build ID, and the server uses the Build ID for reset points. It accepts `TemporalChangeVersion` and `BuildIds` as Search Attributes that a Workflow may set. It does not fill a version attribute itself.

### 4.2 What the plan fixes

Steps 5 and 6 of that plan are on `main`. Once the demo runs a build with them, they fix these. I have not measured that build.

- **Queries 1 and 2**: rows come newest first, from one range.
- **Query 4**: the count per status comes from the counter rows. The time no longer depends on the namespace size.
- **Query 3 for Running**: the plan reads only the open section.
- **Query 8**: the open section is in start-time order. For closed runs the reader could stop early, because a run that started after a time also closed after it. The plan narrows the closed section by `CloseTime` only, so this is a small addition.

It gives up consistent reads. Studio already opens a run by its ID after it starts one, and that read stays consistent, so Studio needs no change for this.

### 4.3 Additions the UI needs

The plan says these stay slow or refused. Each addition names the queries it fixes and what it costs. They are ordered by how often Studio sends the query.

**A. Group closed runs by status in the key (query 3).**

- Today's plan orders the closed section by close time only. A filter on Timed Out reads every closed record until the page is full. On the demo 90 of 11,700 runs match.
- Put the status before the close time in the key of a closed row: `NS P 02 status t(close) t(start) run`. A closed run never changes status, so the key stays fixed.
- A filter on one closed status then reads one range. The list with no filter merges six ranges by close time.
- Cost: no extra write. The page with no filter does six range reads where the plan does one.
- This changes a key layout that the feed already writes. It was cheapest before the readers switched. The switch is merged, and closed rows now also move to the cold tier, so the change needs a new key version and a rewrite of the closed rows, or a reset of the kept deployments.

**B. Counters by Workflow Type and by Task Queue (queries 6, 10, 14).**

- Add counter rows beside the status counters: a count per status for each Workflow Type and for each Task Queue.
- They answer three things without a scan: the values in use (query 10), the list of Task Queues with their running and failed counts (query 14), and the count for a filter on one type or one queue, with or without a status (most of query 6).
- Cost: one or two more counter updates in the job that already updates the status counter.
- A namespace could have very many types. Stop counting above a set number of distinct values, for example 1,000, and report that the list is incomplete.

**C. Index rows by Workflow Type and by Task Queue for closed runs (query 5).**

- Write an index row `NS P type value t(close) t(start) run` when a run closes, and the same for its Task Queue.
- A filter on one type reads the open section, which is small in most namespaces (420 of 11,700 on the demo), and then the index range for closed runs.
- Cost: two small rows per run, written once at the close. Rows only for closed runs avoid a delete and a second write when a run closes.
- This is the addition with the largest write cost, and the plan's cost check already failed. Measure it with that check before building the reader.

**D. A prefix index on the Workflow ID (query 7).**

- The plan says a prefix "narrows nothing", because `vis_run` stores the ID with a length before it and the comparison ignores case.
- Add a row keyed by the lower-case Workflow ID with an end marker in place of the length. `WorkflowId STARTS_WITH "x"` is then one range.
- For a Workflow Type prefix, look the prefix up in the type counters of B and use the index of C. For a full run ID, add a row from run ID to Workflow ID.
- Studio's plain-text search joins three conditions with `OR`. Studio should send them as three calls and merge the rows. The server then needs no plan for `OR`.
- Cost: one or two small rows per run, written at the start.

**E. An index of runs with problems (query 13).**

- Studio describes every running run to find retrying Activities. The server knows this when it happens.
- Write a small row when an Activity is scheduled for its second attempt, and when a Workflow Task fails. Delete it when the Activity or the task completes. Hold the attempt number, the last failure and the next attempt time, so a list needs no describe call per run.
- Report failing Workflow Tasks through `TemporalReportedProblems`, as upstream does, so other tools can use it. Retrying Activities need an extension, since upstream has none.
- For tasks that no Worker picks up, use the age of the oldest task per queue from F. That is one number per queue, not a check per run.
- Cost: writes happen only on a retry or a failure, not on the normal path.

**F. `DescribeTaskQueue` with statistics (query 15).**

- Return the pollers of the last five minutes and the statistics upstream defines: backlog count, age of the oldest task, and the add and dispatch rates.
- Keep them in memory where tasks are matched to pollers, as upstream does. Upstream calls them approximate, so they need no durable write.

**G. History for a run page that follows a run (query 11).**

- Implement `GetWorkflowExecutionHistoryReverse`, so the run page can show the newest events of a long history first.
- Studio should then read only the events after the last one it holds, where today it reads the history again every few seconds in Live mode.

**H. A catalogue of Workflow Types (queries 10, 14, 20, 21).**

- Studio needs four things about a type and has no call for any of them: that the type exists, which Task Queue its runs use, a few recent runs of each status, and its counts. Today it gets them from its copy of the namespace, or above 10,000 runs from one page of the type's runs plus the running runs.
- Keep one small row per Workflow Type in the namespace's Visibility partition: the counts per status (these are the counters of B), the Task Queues its runs started on, the times of the first and the newest start, and the run IDs of the newest few runs per status, for example five.
- The feed already handles every start and every close of a run, so it can update the row in the same job as the counters.
- With this row, the diagram of a type (query 20) and the Start Workflow form (query 21) need no list call and no copy: Studio reads the row and then the histories of the runs it names. The sample is then the newest runs of each status, which Studio cannot find today in a namespace above the copy limit.
- Temporal has no call for this, so it needs one outside the Temporal API. The server's admin HTTP API is the place: Studio's server already reads it for the Cluster screen. For example `GET /v1/namespaces/{namespace}/workflow-types`.
- Cost: the same counter update as B, plus a rewrite of a short list of run IDs on a start and on a close. Stop at a set number of types, as in B.

**I. The code version of each run as metadata (query 20).**

- A diagram drawn from sampled runs mixes code versions. When a Workflow's code changes, the diagram shows the old and the new steps together and its counts cover both. Studio cannot say "this is version 12" or compare two versions.
- The server already has the fact: the Build ID of the Worker is on every `WorkflowTaskCompleted` event. It is not in the run's record, so no list or count can use it.
- Keep, per run, the set of Build IDs that completed its Workflow Tasks, and report it as upstream does: `TemporalUsedWorkerDeploymentVersions` (or `BuildIds` for a Worker that sends only a Build ID) in the Search Attributes of the run, and the newest one in `versioning_info` of `DescribeWorkflowExecution`. Other tools then read it the standard way.
- Put it in the Visibility record, so a filter on the version works, and add it to the catalogue of H: per type, the versions seen, with the time each was first and last seen, its counts per status and its newest runs.
- Studio can then draw one diagram per version, draw the "possible next steps" of a run from runs of the same version, and show which versions still have open runs. That last list is also what a deploy needs before an old Worker is removed.
- This does not need the Worker Deployment calls. Those route tasks to versions; this only records which version ran.
- Cost: a run's version set changes when a Worker with a new Build ID completes a task for it, which is rare. Most runs write it once.
- A step that needs no server change: Studio can read the Build ID from the histories it already samples and group the 40 sampled runs by it. That gives a diagram per version from the sample, without the counts and without a filter.

**J. Step counts kept by the server (query 20). Not proposed now.**

- The server could count, per type and version, how many runs went from each step to each other step, and Studio would draw an exact diagram of all runs with no history reads.
- It would have to follow the steps of every run as its events are written, and write counters at every close. That is new work on the path of every run, for a screen that people open now and then.
- Reading 40 histories took 1.1 s for a type and 0.13 s from Studio's copy. H and I make that sample correct. Decide on J only if the sample proves too small.

### 4.4 What not to build

- **`ORDER BY`.** Temporal Cloud refuses it. Each sort order would need its own index. Studio should keep sorting its own copy for filters that match up to 10,000 runs and say when it cannot, as it does today. With A to D in place, the default order answers most needs.
- **Exact counts for every filter.** Keep the cap. Studio can show "more than 100,000". A call that returned the number counted so far, marked as a lower bound, would be better for the UI than an error.
- **Filters on custom Search Attributes**, for now. Upstream needs a fixed set of indexed columns for them. Studio uses them only as optional grid columns.

### 4.5 Changes in Studio

Done on 2026-11-23, without a server change:

- The Task Queues screen counts from the running runs when the namespace is above the copy limit, and shows no number it cannot count.
- The Studio server remembers for five minutes that a filter matched too many runs to copy.
- It keeps the sample for the types and queues for 30 seconds and the schedule list for 10 seconds.

Done on 2026-11-24, without a server change:

- `getWorkflowDetail` caches decoded history by `(runId, historyLength)` so Live polling skips `GetWorkflowExecutionHistory` and Codec Server calls while no new event arrives.
- When a history exceeds 2,000 events, `getWorkflowDetail` calls `GetWorkflowExecutionHistoryReverse` to append the latest 100 events, keeping closing failures and reset points visible on servers that support reverse history.
- `listSchedules` parallelizes `DescribeSchedule` calls (8 at a time) and passes pagination tokens through to the UI.
- Workflow Type diagrams extract Worker Build IDs from sampled `WorkflowTaskCompleted` events so operators can filter a diagram by code version without waiting for Proposal I.

These follow from the server changes and belong in this repository:

- Stop reading every run for the lists of types and queues, for Needs Attention and for the Task Queues screen, once B, E and F exist. This removes the 10,000-run limit on those screens.
- Read the catalogue of H for the Workflow Types screen and the Start Workflow form, in place of a list call and a copy.
- Upgrade Build ID diagram filtering from the 40-run sample to full visibility counts and filtering once Proposal I lands.
- Send the plain-text search as three calls (D).
- Call `ListSchedules` without a `DescribeSchedule` per row once `ListSchedules` carries Task Queue and Overlap Policy (see 4.7).
- Keep rows and counts as separate requests. A count for a custom filter stays the slowest call.

### 4.6 Order of work

| Step                                            | Fixes                         | Depends on                 |
| ----------------------------------------------- | ----------------------------- | -------------------------- |
| Run a build with the plan's readers on the demo | 1, 2, 4, 8, and 3 for Running | The plan's cost gate       |
| A: status in the closed key                     | 3                             | A new key version          |
| B: counters by type and queue                   | 10, 14, most of 6             | The feed                   |
| D: Workflow ID prefix                           | 7                             | The feed                   |
| C: index by type and queue                      | 5                             | A cost measurement         |
| E: problems index                               | 13                            | None of the above          |
| F: `DescribeTaskQueue`                          | 15, and part of 13 and 14     | None of the above          |
| G: reverse history                              | 11 for long histories         | None of the above          |
| H: catalogue of Workflow Types                  | 10, 14, 20, 21                | B, and an admin API call   |
| I: code version of each run                     | 20, per version               | H for the per-version rows |

E, F and G do not depend on the Visibility plan. Section 4.8.5 replaces this table: it has the packages as they are built, and 4.8.6 says what must happen before one can merge.

### 4.7 Additional Temporal-side improvements from the Studio review

The review of Studio's Temporal Workbench identified five capabilities that are better solved on the Temporal / `slate-temporal-next` server than worked around in the BFF:

1. **Include Task Queue and Overlap Policy in `ListSchedules` summaries.**
   `ListSchedulesResponse.schedules[].info` currently omits `taskQueue` and `overlapPolicy`, forcing Studio to run `DescribeSchedule` for every schedule on the page (parallelized 8 at a time). Returning those two fields on the list entry removes the N+1 calls completely.

2. **Incremental history reads (`after_event_id` or `wait_new_event` long-poll).**
   Studio's BFF now skips `GetWorkflowExecutionHistory` while `historyLength` is unchanged. When a live run grows from 1,500 to 1,502 events, however, the BFF still has to re-read and re-decode all 1,502 events because `GetWorkflowExecutionHistory` starts from event 1 unless the caller keeps a previous `nextPageToken`. Supporting an explicit `first_event_id` (or `wait_new_event` long-poll from the last seen token) lets Studio fetch and codec-decode only the 2 new events.

3. **`GetWorkflowExecutionHistoryReverse` in `slate-temporal-next` (Proposal G).**
   Studio now calls `GetWorkflowExecutionHistoryReverse` whenever a run exceeds 2,000 events so closing failures and latest reset points remain visible. Standard Temporal already answers this call; implementing it in `slate-temporal-next` unlocks the same behavior there with no further Studio change.

4. **Visibility-indexed Worker Build IDs (Proposal I).**
   Studio now groups the 40 sampled histories by the Build ID on `WorkflowTaskCompleted`. Indexing `BuildIds` / `TemporalUsedWorkerDeploymentVersions` on the Visibility record lets Studio filter the Workflows Grid by version, show accurate per-version open counts before retiring old Workers, and sample runs of one specific version.

5. **Operational workflow and activity RPCs in `slate-temporal-next`.**
   Studio already wires `ResetWorkflowExecution`, `PauseWorkflowExecution`, `UnpauseWorkflowExecution`, `PauseActivity`, `UnpauseActivity`, `ResetActivity`, and `StartBatchOperation` behind capability flags. Implementing them in `slate-temporal-next` unlocks inline remediation in Needs Attention, activity controls in the Debugger, and server-side batch jobs without client-side fan-out.

### 4.8 The plan for 10 million runs, checked against `main` (2026-11-24)

Two readers checked sections 4.3 to 4.7 against the server's `origin/main` at `c2bfee8a` and its active branches. This section holds what changed, the four gaps, the work packages and what Studio does on each server. File names are in the server repository; `M` is `crates/model/src`, `S` is `crates/server/src`.

#### 4.8.1 What the server does today

- **Keys.** `vis_due` is the feed's queue. `vis` holds the counters, then open runs newest first, then closed runs by close time. `vis_run` holds one row per run in Workflow ID order (`M/keys.rs`). These layouts are frozen: only additive proto fields and new key spaces are allowed without a migration or a reset.
- **Writes per run.** The run's own batch adds one `vis_due` row on a visible change. A job on the partition's home shard then writes the rows and the counters. Per run that is 2 puts and 2 deletes at the source and 4 row puts, 1 delete and up to 3 counter puts at the home: about 2 KB, 6% more process CPU and 0.38 ms more CPU a start.
- **The cost gate is already missed.** The gate allows 1% of starts refused at 150 starts a second. `main` measures 1.651%, and the priced month is 7.06% higher. Any proposal that adds writes per run starts from there.
- **Counters.** By status only. Open runs have one row; closed runs have one row per hour of their retention end, so they expire.
- **Limits.** 8 Visibility calls at once per server and 4 per project. A page examines 10,000 records, a count 100,000. One read partition per namespace.
- **What narrows a read.** A status picks the section, `CloseTime` bounds the closed range, and `WorkflowId =` or `IN` reads the `vis_run` rows. Nothing else narrows.
- **Cold tier.** A closed row and its `vis_run` row move to the cold tier 10 minutes after the close. Every new row kind for closed runs needs the same move and the same deletion at the end of retention.

#### 4.8.2 Changes to proposals A to J

| Proposal                      | Verdict                 | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A, status in the closed key   | Changed                 | The closed key is frozen, and the mover, the hourly job, the cold merge and the page token all read it. Build A as index rows in C's key space for closes that are not Completed. A Completed run then costs no extra write, and Failed, Timed Out, Canceled, Terminated and Continued as New each become one range.                                                                                                                                                                                                                                                     |
| B, counters by type and queue | Changed                 | Key the counter by the pair (Workflow Type, Task Queue), not once by type and once by queue. That is 1 counter update at a start and 2 at a close, where two separate counters cost 2 and 4. A count for one type or one queue sums a few rows. Closed counters are per hour, like the status counters, so they expire. Runs applied before B are not counted: the `vis_run` row gets an additive "counted" mark, and the counts are short for one Retention Period after the deploy. Stop at 1,000 distinct pairs per namespace and report that the list is incomplete. |
| C, index by type and queue    | Changed, larger         | Index open runs too (gap 1 below). One new key space under the namespace and partition: attribute, value, then the same tail as the `vis` row, so the page token and the point read of the record work unchanged. Rows hold no value, only the key. The mover, the hourly job and the cold tier's prefix rule must each learn the key space. This is the largest package.                                                                                                                                                                                                |
| D, Workflow ID prefix         | Kept                    | One key-only row per run, lower-case Workflow ID then run ID, with the lifecycle of the `vis_run` row. A full Run ID needs no row: Studio finds a run by ID through `DescribeWorkflowExecution` when the text is a UUID. A Workflow Type prefix is answered from B's counters.                                                                                                                                                                                                                                                                                           |
| E, problems index             | Changed                 | The feed reads only the run record, so the record gets a small summary: has a retrying Activity, has a failing Workflow Task. Only a change of that summary is a visible change, so a run without problems pays nothing. Listing uses an index row for open runs in C's key space. `TemporalReportedProblems` becomes a reserved attribute that a Workflow can no longer set.                                                                                                                                                                                            |
| F, `DescribeTaskQueue`        | Kept                    | The matcher keeps the latest poll time and the oldest task age per queue. Add poller identities and add and dispatch rates, in memory only. In a cell of several servers the call asks each server.                                                                                                                                                                                                                                                                                                                                                                      |
| G, reverse history            | Kept, small             | Events are keyed by event ID, so the last page is a range read. No write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| H, catalogue of types         | Dropped as a stored row | A stored row per type would be rewritten twice per run. Serve the same facts from B and C: `CountWorkflowExecutions` with `GROUP BY WorkflowType` (and `TaskQueue`) for the values and counts, and one page of C's index for the newest runs of a type and status. Both stay inside the Temporal API and the project's API key, so Studio needs no admin route.                                                                                                                                                                                                          |
| I, code version               | Changed                 | The run record already holds the Build IDs (`auto_reset_points`), and `DescribeWorkflowExecution` returns them; the earlier text was wrong. Copy them into the Visibility record without making that a visible change, so a run pays nothing extra and an open run shows a new Build ID at its next visible change. Add the filter to the parser.                                                                                                                                                                                                                        |
| J, step counts                | Still not proposed      | No change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

The items of section 4.7:

- **Task Queue and Overlap Policy on `ListSchedules`**: not possible inside the Temporal API. `ScheduleListInfo` has no such fields. Studio keeps its `DescribeSchedule` per row, 8 at a time.
- **Incremental history**: the server already supports `wait_new_event` and returns a token that continues an open run's history. Upstream has no "after event" field. This is a Studio change: keep the token and read only the new events.
- **Operational calls** (Reset, Pause and Unpause of a Workflow, Pause, Unpause and Reset of an Activity, batch operations): all unimplemented, and the server's plan leaves them out on purpose. They do not affect scale. Order when built: Activity controls, Reset, then Workflow pause (after B, because the counters treat every open run as Running) and batch.

#### 4.8.3 The four gaps

1. **Namespaces with many open runs.** A Workflow that models an entity, such as a subscription, stays open. A namespace of 10 million runs can hold 100,000 to 500,000 open ones. A type filter then reads the open section 10,000 records a page, and a count fails above 100,000. B answers the count. C must write its index row at the start of a run and delete it at the close: 2 puts at the start and 2 deletes at the close for type and queue, with keys taken from the feed's operation and no read.
2. **Write cost, and a second store.**
   - As first proposed, A to I take a run's Visibility writes from about 12 to about 35 and its bytes from about 2 KB to 6 to 10 KB. That is 7 to 14% more write-ahead log per run and about twice the point reads at the home shard, on a gate that already misses. These figures are estimates from row sizes.
   - The lean form of 4.8.2 (pair counters, key-only index rows, no stored catalogue, Build IDs without a visible change) is about 8 puts, 5 deletes and 3 reads per run, about 1.3 KB.
   - A second store on the same machine saves no CPU, and the rows need the `vis_run` row's version to stay idempotent. Keep them in the home's apply job. A separate store pays off only when it runs on other machines; that is a later decision, not part of this plan.
   - The index needs its own cost measurement before its readers are built. If the lean form still fails the gate, build B and D first: they answer the counts, the lists of types and queues and the text search, and leave the type filter on rare types slow.
3. **One Visibility partition.** More partitions do not make a Studio query faster: a list merges them and splits its budget of examined records between them. They raise how fast the home applies changes in a cell of several servers. The other agent's branch `p2-10-step-9` builds them. Every new row of this plan sits under the namespace and the partition, so it follows that work with no change of design.
4. **Many users polling.** A page holds one of 8 places for up to 10 seconds and a count for up to 30, so eight slow counts block every project. Two changes:
   - Server: a separate, larger pool for calls with a known small cost (counter reads, one index range, a read by Workflow ID), so they do not wait behind scans.
   - Studio: its server answers identical polls from one request. With N browsers on the same list, the Temporal server sees one call per interval, not N. This also keeps Studio under Temporal Cloud's limit of 30 calls a second per namespace.

#### 4.8.4 What Studio does on each server

Studio must work on a standard Temporal server, on Temporal Cloud, and on `slate-temporal-next` with and without these additions. It asks the server what it can do and never assumes.

| Studio need                          | Standard server and Temporal Cloud                                                                         | `slate-temporal-next` today                    | `slate-temporal-next` with this plan                          | How Studio finds out                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Filter by type, queue or status      | Fast: every attribute is indexed                                                                           | Stops at 10,000 examined records a page        | Fast (A, C)                                                   | It does not need to: the same filter is sent. A short page with a token is shown as "more may exist", not as empty                                     |
| Count for a filter                   | Works; approximate on Elasticsearch                                                                        | Fails above 100,000 examined records           | Exact for type, queue, status (B); other filters still capped | A failed count shows "more than 100,000", never 0                                                                                                      |
| Types and queues in use, with counts | No call exists: Studio samples runs                                                                        | Samples runs                                   | `GROUP BY WorkflowType` and `TaskQueue` on Count              | One probe per connection. A refusal selects the sample, and the screen says the list comes from a sample                                               |
| Text search on the Workflow ID       | Fast                                                                                                       | Narrows nothing                                | Fast (D)                                                      | Same filter. Studio sends the three `STARTS_WITH` conditions as three calls and merges them                                                            |
| Runs with problems                   | `TemporalReportedProblems` finds failing Workflow Tasks on recent servers; no call for retrying Activities | A describe call per running run, 1,500 at most | One list filter (E)                                           | One probe. Without it Studio keeps the check of at most 1,500 runs, runs it only while the Attention screen is open, and says how many runs it checked |
| Pollers and backlog of a queue       | `DescribeTaskQueue`                                                                                        | Unimplemented                                  | `DescribeTaskQueue` (F)                                       | `supportsDescribeTaskQueue`, from the first call                                                                                                       |
| Newest events of a long history      | `GetWorkflowExecutionHistoryReverse`                                                                       | Unimplemented                                  | Implemented (G)                                               | The call is tried once and remembered                                                                                                                  |
| Runs of one code version             | Search Attribute filter                                                                                    | Not filterable                                 | Filter on Build IDs (I)                                       | One probe; without it Studio groups its sample                                                                                                         |
| Sort by a column                     | Refused                                                                                                    | Refused                                        | Refused (4.4)                                                 | Studio sorts its own copy of up to 10,000 matches and says when it cannot                                                                              |

Rules that hold on every server:

- A capability is found by one cheap call per connection and kept in `TemporalCapabilities`. A refusal (`UNIMPLEMENTED` or `INVALID_ARGUMENT`) selects the fallback. It is never shown as an error.
- A fallback that reads a sample says so on the screen, with the size of the sample.
- No screen polls a call that costs the server a scan while that screen is not open.

#### 4.8.5 Work packages

One package is one branch and one implementer. Packages that share files run in order.

| Package | Holds                                                                                                                                                                          | Depends on                                                           | Write cost                                | State on 2026-11-24               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------- | --------------------------------- |
| P-G     | G, reverse history                                                                                                                                                             | Nothing                                                              | None                                      | Started                           |
| P-F     | F, `DescribeTaskQueue` with statistics                                                                                                                                         | Nothing                                                              | None (memory only)                        | Started                           |
| P-V1    | B, C with open rows, A as index rows, D: the model crate first (keys, apply operations, read plans, `GROUP BY`), then the server (feed, readers, mover, hourly job, cold tier) | The server part waits for `p2-10-step-9`, which rewrites the readers | The lean form of gap 2; its own cost legs | Model part started                |
| P-V2    | I, then E: the record's Build IDs and problem summary, their index rows and filters                                                                                            | P-V1's write side                                                    | None on the normal path                   | Not started                       |
| P-Q     | The separate pool for cheap Visibility calls (gap 4)                                                                                                                           | `p2-10-step-9`                                                       | None                                      | Not started                       |
| P-O     | Activity controls, Reset, Workflow pause, batch                                                                                                                                | Workflow pause waits for B                                           | None                                      | Not started; not needed for scale |

#### 4.8.6 What stands between a branch and `main`

These are the server repository's own rules, as its documents state them on 2026-11-24.

- `main` is frozen for code while the cost campaign C3 runs. After it, the one build slot is booked until 2026-11-26 22:00 UTC, and the plan closes on 2026-11-27.
- One agent, the plan's orchestrator, makes every merge, by direct push and never by pull request. It works on another machine.
- A code change must pass four gates there: `./dev check` (about 34 minutes), `./dev test-storage`, `./dev test-one-shard` and `./dev test-two-shard`. A change to a write path must also pass cost legs on a 1 vCPU machine, before and after, at 150 starts a second.
- The gates need a full build of the workspace and 150 GiB of free disk. The machine this plan was written on has 42 GiB, so here a package can compile and test the model crate and type-check the server, and no more.
- Each item needs its own record (`docs/cost/<item>/steps.md`), a row in the plan, tests whose guarded lines are reverted to show the test fails, and its design decisions recorded with ids.
- The plan leaves the unimplemented calls of the compatibility inventory out on purpose, and says a prefix index "is not planned". Adding these packages to the plan is the owner's decision.

So the branches of 4.8.5 are prepared up to the gates. They reach `main` when the owner adds them to the server's plan and its orchestrator runs the gates and merges them, read-only calls first.

#### 4.8.7 Studio changes that need no server change

These come from the same review and can be built now:

- Answer identical polls from one request in Studio's server (gap 4).
- Run the Attention check only while its screen is open, and take the sidebar badge from the last result.
- Keep the history token of an open run and read only new events (4.8.2).
- Show a short page that has a token as "more may exist", and a failed count as "more than 100,000".

## 5. Not verified

- I measured through the Studio server, not at the Temporal server. The times include the Studio server's own work.
- I read the server's code and plan through a code search and checked the plan's summary, key layout, list and count rules and step table myself. I did not run the server's tests or its cost check.
- The cost of A to E is estimated from the number of rows each writes. Only the plan's own cost check can confirm it.
- Whether the server already supports `wait_new_event` on `GetWorkflowExecutionHistory` is not checked.
- The targets in section 2.2 are a proposal, not a measured user need.
- I have not measured a build with the plan's readers. Section 4.2 says what the plan's document says they do.
- The second round (section 2.5) has one to four samples per request, not three each.
- Query 21 is not measured on the hosted demo, because the Start Workflow form that sends it is not deployed there.
- The facts in section 3.7 about Temporal's API come from its proto files and documentation as a fetch tool read them for me on 2026-11-24. I did not read those pages myself. The last part of the Workflow service file was read as a summary, not word for word.
- I did not check that the histories on the hosted demo carry a Build ID. The server's code keeps the stamp a Worker sends; whether the demo's Workers send one is not checked.
- The costs of H and I are estimates, like those of A to E.
- Section 4.8 rests on two readers' reports of the server's code at `c2bfee8a`, with file and line for each claim. I did not read those lines myself. The write counts and sizes of the lean form are estimates from row sizes, not measurements.
- Whether the lean form passes the server's cost gate is not known. `main` misses that gate before any of this is added.
- I did not check which key-space bytes and proto field numbers are free on `main` and on `p2-10-step-9`. The implementer of P-V1 claims them and records the claim.
- What a standard server's `TemporalReportedProblems` holds, and from which version, is taken from its documentation, not tested.

## 6. Sources

Temporal documentation:

- [Worker Versioning](https://docs.temporal.io/production-deployment/worker-deployments/worker-versioning)
- [Visibility](https://docs.temporal.io/visibility)
- [List Filter](https://docs.temporal.io/list-filter)
- [Search Attributes](https://docs.temporal.io/search-attribute)
- [Temporal Cloud limits](https://docs.temporal.io/cloud/limits)
- [Temporal Cloud objectives](https://docs.temporal.io/cloud/slo)
- [Temporal Cloud overview](https://docs.temporal.io/cloud/overview)
- [Self-hosted Visibility setup](https://docs.temporal.io/self-hosted-guide/visibility)
- [Events and Event History](https://docs.temporal.io/workflow-execution/event)
- [Task Queue commands of the CLI](https://docs.temporal.io/cli/task-queue)

Temporal blog:

- [Temporal Cloud's custom persistence layer](https://temporal.io/blog/higher-throughput-and-lower-latency-temporal-clouds-custom-persistence-layer)
- [Building durable cloud control systems with Temporal](https://temporal.io/blog/building-durable-cloud-control-systems-with-temporal)

Temporal source code:

- [PostgreSQL Visibility schema](https://github.com/temporalio/temporal/blob/main/schema/postgresql/v12/visibility/schema.sql)
- [Elasticsearch index template](https://github.com/temporalio/temporal/blob/main/schema/elasticsearch/visibility/versioned/v15/index_template_v7.json)
- [Elasticsearch Visibility store](https://github.com/temporalio/temporal/blob/main/common/persistence/visibility/store/elasticsearch/visibility_store.go)
- [SQL Visibility store](https://github.com/temporalio/temporal/blob/main/common/persistence/visibility/store/sql/visibility_store.go)
- [Workflow service requests and responses](https://github.com/temporalio/api/blob/master/temporal/api/workflowservice/v1/request_response.proto)
- [Task queue messages](https://github.com/temporalio/api/blob/master/temporal/api/taskqueue/v1/message.proto)
- [Workflow service calls](https://github.com/temporalio/api/blob/master/temporal/api/workflowservice/v1/service.proto)
- [Worker messages, with the heartbeat](https://github.com/temporalio/api/blob/master/temporal/api/worker/v1/message.proto)
- [Workflow messages, with the versioning info](https://github.com/temporalio/api/blob/master/temporal/api/workflow/v1/message.proto)
- [Release notes of server 1.29](https://github.com/temporalio/temporal/releases/tag/v1.29.0)

`slate-temporal-next` at `c2bfee8a`, for section 4.8:

- `crates/model/src/keys.rs`, `crates/model/src/visibility/{apply,read,parse,moves}.rs`, `crates/server/src/visibility.rs`, `crates/server/src/visibility/{feed,reader,moves}.rs`: the keys, the feed, the readers, the limits and the move to the cold tier.
- `crates/server/src/matcher.rs`, `crates/server/src/reads.rs`, `crates/model/src/{activity,workflow_task}.rs`: pollers and task ages, history reads, and where a retry and a failed Workflow Task are recorded.
- `docs/scaling/five-day-plan.md`, `docs/cost/p2-10/steps.md`, `docs/testing.md`, `HANDOFF.md`: the freeze, the gates, the cost results and who merges.
- Branch `p2-10-step-9`: Visibility partitions.

`slate-temporal-next` at `264fb3e4`:

- `docs/scaling/visibility-records.md`: the Visibility plan, its key layout (section 1.1), List and Count (section 4), cost (section 7) and steps with their results (section 10).
- `crates/model/src/workflow_task.rs`: the Worker's version stamp on a completed Workflow Task, and the reset points.
- `crates/model/src/search_attributes.rs`: the Search Attributes a Workflow may set.
- `crates/model/src/visibility/parse.rs`: the supported filter.
- `compatibility/inventory.md`: the calls that are not implemented.
- `docs/cost/p2-9-code/steps.md`: the measured list and count times.

`slate-temporal-next` at `258ea584`, for the scan that the hosted demo still runs:

- `docs/visibility-mvp.md`: the scan.
- `crates/server/src/visibility.rs` and `crates/server/src/visibility/scan.rs`: the scan and its limits.

Studio:

- [`Architecture/temporal.md`](temporal.md): the Studio server's routes, and how it lists, sorts and copies runs.
- `data/temporal/type-map.ts`: how a diagram of a Workflow Type is drawn from run histories.
