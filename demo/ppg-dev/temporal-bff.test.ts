import { afterEach, describe, expect, it, vi } from "vitest";

import { TemporalGrpcBffClient } from "./temporal-bff";
import { structuredCalendarToCron } from "./temporal-bff-schedules";

function execution(workflowId: string) {
  return {
    execution: { runId: `run-${workflowId}`, workflowId },
    status: 1,
    type: { name: "orderFulfillment" },
  };
}

describe("TemporalGrpcBffClient.listWorkflows", () => {
  const clients: TemporalGrpcBffClient[] = [];

  function createClient() {
    const client = new TemporalGrpcBffClient({ address: "127.0.0.1:1" });
    clients.push(client);
    return client;
  }

  afterEach(() => {
    for (const client of clients.splice(0)) {
      client.close();
    }
  });

  it("asks for the next page when the server ends a page before it is full", async () => {
    const client = createClient();
    const listRequests: Array<{
      nextPageToken?: Uint8Array;
      pageSize: number;
    }> = [];
    vi.spyOn(client, "unary").mockImplementation(
      (method, _req, _res, request) => {
        if (method !== "ListWorkflowExecutions") {
          return Promise.reject(new Error("count is not needed here"));
        }

        const listRequest = request as (typeof listRequests)[number];
        listRequests.push(listRequest);

        // The first page holds one match and a token: the server stopped scanning early.
        return Promise.resolve(
          listRequest.nextPageToken
            ? { executions: [execution("order-2"), execution("order-3")] }
            : {
                executions: [execution("order-1")],
                nextPageToken: Buffer.from("k1"),
              },
        ) as never;
      },
    );

    const result = await client.listWorkflows({
      includeCounts: false,
      namespace: "default",
      pageSize: 3,
      query: 'ExecutionStatus = "Running"',
    });

    expect(result.executions.map((item) => item.workflowId)).toEqual([
      "order-1",
      "order-2",
      "order-3",
    ]);
    expect(listRequests.map((request) => request.pageSize)).toEqual([3, 2]);
    expect(result.nextPageToken).toBeUndefined();
  });

  it("skips the count when the caller does not need it", async () => {
    const client = createClient();
    const unary = vi
      .spyOn(client, "unary")
      .mockResolvedValue({ executions: [execution("order-1")] } as never);

    await client.listWorkflows({ includeCounts: false, namespace: "default" });

    expect(unary.mock.calls.map(([method]) => method)).toEqual([
      "ListWorkflowExecutions",
    ]);
  });

  it("skips the rows when the caller only wants the counts", async () => {
    const client = createClient();
    const unary = vi
      .spyOn(client, "unary")
      .mockResolvedValue({ count: 7, groups: [] } as never);

    const result = await client.listWorkflows({
      includeList: false,
      namespace: "default",
    });

    expect(unary.mock.calls.map(([method]) => method)).toEqual([
      "CountWorkflowExecutions",
    ]);
    expect(result.totalCount).toBe(7);
    expect(result.executions).toEqual([]);
  });

  it("keeps at most two list calls and one count call in flight", async () => {
    const client = createClient();
    const inFlight = { CountWorkflowExecutions: 0, ListWorkflowExecutions: 0 };
    const peak = { CountWorkflowExecutions: 0, ListWorkflowExecutions: 0 };
    vi.spyOn(client, "unary").mockImplementation(async (method) => {
      const name = method as keyof typeof inFlight;
      inFlight[name]++;
      peak[name] = Math.max(peak[name], inFlight[name]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight[name]--;

      return {
        count: 1,
        executions: [execution("order-1")],
        groups: [],
      } as never;
    });

    await Promise.all(
      Array.from({ length: 5 }, () =>
        client.listWorkflows({ namespace: "default", pageSize: 1 }),
      ),
    );

    expect(peak).toEqual({
      CountWorkflowExecutions: 1,
      ListWorkflowExecutions: 2,
    });
  });

  it("does not make a list call wait for running counts", async () => {
    const client = createClient();
    let releaseCounts = () => {};
    const countsBlocked = new Promise<void>((resolve) => {
      releaseCounts = resolve;
    });
    vi.spyOn(client, "unary").mockImplementation(async (method) => {
      if (method === "CountWorkflowExecutions") {
        await countsBlocked;
      }

      return {
        count: 1,
        executions: [execution("order-1")],
        groups: [],
      } as never;
    });

    const counts = Array.from({ length: 3 }, () =>
      client.listWorkflows({ includeList: false, namespace: "default" }),
    );
    const rows = await client.listWorkflows({
      includeCounts: false,
      namespace: "default",
    });

    expect(rows.executions).toHaveLength(1);
    releaseCounts();
    await Promise.all(counts);
  });
  it("sorts every matching run and pages through the sorted copy", async () => {
    const client = createClient();
    const started = (workflowId: string, seconds: number) => ({
      ...execution(workflowId),
      startTime: { seconds },
    });
    const unary = vi.spyOn(client, "unary").mockImplementation(((
      method: string,
      _req: unknown,
      _res: unknown,
      request: { nextPageToken?: Uint8Array },
    ) =>
      method === "ListWorkflowExecutions"
        ? Promise.resolve(
            request.nextPageToken
              ? { executions: [started("order-c", 300)] }
              : {
                  executions: [
                    started("order-a", 100),
                    started("order-b", 200),
                  ],
                  nextPageToken: Buffer.from("k1"),
                },
          )
        : Promise.reject(new Error("count is not needed here"))) as never);

    const first = await client.listWorkflows({
      namespace: "default",
      pageSize: 2,
      sort: { direction: "desc", field: "StartTime" },
    });
    const second = await client.listWorkflows({
      namespace: "default",
      nextPageToken: first.nextPageToken,
      pageSize: 2,
      sort: { direction: "desc", field: "StartTime" },
    });

    expect(first.executions.map((item) => item.workflowId)).toEqual([
      "order-c",
      "order-b",
    ]);
    expect(first.totalCount).toBe(3);
    expect(first.countsByStatus).toEqual({ Running: 3 });
    expect(second.executions.map((item) => item.workflowId)).toEqual([
      "order-a",
    ]);
    expect(second.nextPageToken).toBeUndefined();
    // The second page comes from the copy the first one read.
    expect(unary).toHaveBeenCalledTimes(2);
  });
});

describe("TemporalGrpcBffClient attention and task queues", () => {
  const clients: TemporalGrpcBffClient[] = [];
  const seconds = (msAgo: number) => ({
    seconds: Math.floor((Date.now() - msAgo) / 1000),
  });

  function createClient() {
    const client = new TemporalGrpcBffClient({ address: "127.0.0.1:1" });
    clients.push(client);
    return client;
  }

  /** Two running payouts, one of which retries an Activity on another queue. */
  function mockShop(client: TemporalGrpcBffClient) {
    vi.spyOn(client, "unary").mockImplementation(((
      method: string,
      _req: unknown,
      _res: unknown,
      request: { execution?: { workflowId?: string } },
    ) => {
      if (method === "ListWorkflowExecutions") {
        return Promise.resolve({
          executions: ["payout-1", "payout-2"].map((workflowId) => ({
            execution: { runId: `run-${workflowId}`, workflowId },
            startTime: seconds(120_000),
            status: 1,
            taskQueue: "billing",
            type: { name: "merchantPayout" },
          })),
        });
      }

      if (method === "DescribeWorkflowExecution") {
        return Promise.resolve(
          request.execution?.workflowId === "payout-1"
            ? {
                pendingActivities: [
                  {
                    activityType: { name: "bankTransfer" },
                    attempt: 4,
                    lastAttemptCompleteTime: seconds(20_000),
                    lastFailure: { message: "503 from the bank" },
                    maximumAttempts: 0,
                    // A standard Temporal server puts the next attempt here.
                    scheduledTime: seconds(-40_000),
                  },
                ],
              }
            : {
                pendingWorkflowTask: {
                  scheduledTime: seconds(60_000),
                  state: 1,
                },
              },
        );
      }

      if (method === "GetWorkflowExecutionHistory") {
        return Promise.resolve({
          history: {
            events: [
              {
                activityTaskScheduledEventAttributes: {
                  activityType: { name: "bankTransfer" },
                  taskQueue: { name: "bank" },
                },
              },
            ],
          },
        });
      }

      return Promise.reject(
        Object.assign(new Error("unimplemented"), { code: 12 }),
      );
    }) as never);
  }

  afterEach(() => {
    vi.restoreAllMocks();

    for (const client of clients.splice(0)) {
      client.close();
    }
  });

  it("reads the running runs for types and queues when the namespace is too large to copy", async () => {
    const client = createClient();

    vi.spyOn(client, "unary").mockImplementation(((
      method: string,
      _req: unknown,
      _res: unknown,
      request: { query?: string },
    ) =>
      method !== "ListWorkflowExecutions"
        ? Promise.reject(new Error("not needed here"))
        : Promise.resolve(
            request.query?.includes("Running")
              ? {
                  executions: [
                    { ...execution("order-1"), taskQueue: "orders" },
                  ],
                }
              : {
                  // Every page has a next page, so the copy of all runs gives up.
                  executions: [
                    {
                      ...execution("sub-1"),
                      taskQueue: "billing",
                      type: { name: "subscriptionBilling" },
                    },
                  ],
                  nextPageToken: Buffer.from("more"),
                },
          )) as never);

    const facets = await client.getFacets("default");

    expect(facets.complete).toBe(false);
    expect(facets.taskQueues.map((queue) => queue.name).sort()).toEqual([
      "billing",
      "orders",
    ]);
    expect(facets.workflowTypes.map((type) => type.name).sort()).toEqual([
      "orderFulfillment",
      "subscriptionBilling",
    ]);
  });

  /** A namespace too large to copy: every unfiltered page has a next page. */
  function mockLargeNamespace(client: TemporalGrpcBffClient) {
    const unfilteredPages = { count: 0 };

    vi.spyOn(client, "unary").mockImplementation(((
      method: string,
      _req: unknown,
      _res: unknown,
      request: { query?: string },
    ) => {
      if (method === "DescribeWorkflowExecution") {
        return Promise.resolve({});
      }

      if (method !== "ListWorkflowExecutions") {
        return Promise.reject(
          Object.assign(new Error("unimplemented"), { code: 12 }),
        );
      }

      if (request.query?.includes("Running")) {
        return Promise.resolve({
          executions: [
            { ...execution("sub-7"), taskQueue: "billing" },
            { ...execution("sub-8"), taskQueue: "billing" },
            { ...execution("order-1"), taskQueue: "orders" },
          ],
        });
      }

      unfilteredPages.count++;

      return Promise.resolve({
        executions: [
          { ...execution("sub-1"), status: 2, taskQueue: "billing" },
        ],
        nextPageToken: Buffer.from("more"),
      });
    }) as never);

    return unfilteredPages;
  }

  it("counts the running runs of a queue from every running run when the namespace is too large to copy", async () => {
    const client = createClient();
    mockLargeNamespace(client);

    const { complete, queues, runningComplete } =
      await client.listTaskQueues("default");
    const byName = Object.fromEntries(
      queues.map((queue) => [queue.name, queue]),
    );

    expect([complete, runningComplete]).toEqual([false, true]);
    expect(byName.billing).toMatchObject({
      activeWorkflowCount: 2,
      // Not known without every run, so not a number from a sample.
      failedWorkflowCount: null,
      totalWorkflowCount: null,
    });
    expect(byName.billing!.workflows.map((run) => run.workflowId)).toEqual([
      "sub-7",
      "sub-8",
    ]);
    expect(byName.orders!.activeWorkflowCount).toBe(1);
  });

  it("does not read a namespace again that was too large to copy a moment ago", async () => {
    const client = createClient();
    const unfilteredPages = mockLargeNamespace(client);

    expect((await client.matchingRuns("default", "")).value).toBeNull();

    const pagesOfFirstCopy = unfilteredPages.count;
    const now = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(now + 60_000);

    expect((await client.matchingRuns("default", "")).value).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unfilteredPages.count).toBe(pagesOfFirstCopy);
  });

  it("reports a retrying Activity and a task that no Worker picks up", async () => {
    const client = createClient();
    mockShop(client);

    const attention = await client.getAttention("default");

    expect(attention.totalRunning).toBe(2);
    expect(
      attention.items.map((item) => [item.workflowId, item.kind, item.detail]),
    ).toEqual(
      expect.arrayContaining([
        ["payout-1", "activity-retrying", "503 from the bank"],
        [
          "payout-2",
          "no-worker",
          expect.stringMatching(
            /^A Workflow Task has waited \d+s for a Worker on Task Queue billing\.$/,
          ),
        ],
      ]),
    );
  });

  it("tells the last attempt of a retrying Activity from its next attempt", async () => {
    const client = createClient();
    mockShop(client);

    const attention = await client.getAttention("default");
    const retrying = attention.items.find(
      (item) => item.kind === "activity-retrying",
    )!;

    expect(Date.parse(retrying.since!)).toBeLessThan(Date.now());
    expect(Date.parse(retrying.nextAttemptTime!)).toBeGreaterThan(Date.now());
  });

  it("lists a queue that only runs Activities and counts its retries", async () => {
    const client = createClient();
    mockShop(client);

    const { pollersSupported, queues } = await client.listTaskQueues("default");
    const byName = Object.fromEntries(
      queues.map((queue) => [queue.name, queue]),
    );

    expect(pollersSupported).toBe(false);
    expect(byName.billing).toMatchObject({
      activeWorkflowCount: 2,
      health: "stalled",
      retryingWorkflowCount: 1,
      workflowTypes: [{ count: 2, name: "merchantPayout" }],
    });
    expect(byName.bank).toMatchObject({
      activityTypes: ["bankTransfer"],
      health: "retrying",
      pendingActivityCount: 1,
      retryingActivityCount: 1,
      totalWorkflowCount: 0,
    });
  });
});

describe("TemporalGrpcBffClient.getTypeMap", () => {
  it("draws a Workflow Type from the histories of its runs and leaves the other types out", async () => {
    const client = new TemporalGrpcBffClient({ address: "127.0.0.1:1" });
    const historiesRead: string[] = [];
    const activity = (scheduledId: number, name: string) => [
      {
        activityTaskScheduledEventAttributes: { activityType: { name } },
        eventId: scheduledId,
        // EVENT_TYPE_ACTIVITY_TASK_SCHEDULED
        eventType: 10,
      },
      {
        activityTaskCompletedEventAttributes: {
          scheduledEventId: scheduledId,
        },
        eventId: scheduledId + 2,
        // EVENT_TYPE_ACTIVITY_TASK_COMPLETED
        eventType: 12,
      },
    ];

    vi.spyOn(client, "unary").mockImplementation(((
      method: string,
      _req: unknown,
      _res: unknown,
      request: { execution?: { workflowId?: string } },
    ) => {
      if (method === "ListWorkflowExecutions") {
        return Promise.resolve({
          executions: [
            { ...execution("order-1"), status: 2 },
            { ...execution("order-2"), status: 2 },
            {
              ...execution("sub-1"),
              type: { name: "subscriptionBilling" },
            },
          ],
        });
      }

      if (method === "GetWorkflowExecutionHistory") {
        historiesRead.push(request.execution!.workflowId!);

        return Promise.resolve({
          history: {
            events: [
              ...activity(5, "validateOrder"),
              ...activity(11, "chargePayment"),
            ],
          },
        });
      }

      return Promise.reject(new Error("not needed here"));
    }) as never);

    const map = await client.getTypeMap("default", "orderFulfillment");

    client.close();
    expect(historiesRead.sort()).toEqual(["order-1", "order-2"]);
    expect([map.runCount, map.candidateCount, map.candidatesComplete]).toEqual([
      2,
      2,
      true,
    ]);
    expect(map.nodes.map((node) => node.id)).toEqual([
      "start",
      "activity:validateOrder",
      "activity:chargePayment",
      "end:Completed",
    ]);
    expect(
      map.edges.find((edge) => edge.to === "activity:chargePayment"),
    ).toMatchObject({ from: "activity:validateOrder", runCount: 2 });
  });
});

describe("TemporalGrpcBffClient.getTypeInputs", () => {
  it("returns the arguments of the newest runs of a type and the queue they use", async () => {
    const client = new TemporalGrpcBffClient({ address: "127.0.0.1:1" });
    const payload = (value: unknown) => ({
      data: Buffer.from(JSON.stringify(value)),
      metadata: { encoding: Buffer.from("json/plain") },
    });

    vi.spyOn(client, "unary").mockImplementation(((
      method: string,
      _req: unknown,
      _res: unknown,
      request: { execution?: { workflowId?: string } },
    ) => {
      if (method === "ListWorkflowExecutions") {
        return Promise.resolve({
          executions: [
            {
              ...execution("order-1"),
              startTime: { seconds: 100 },
              taskQueue: "orders",
            },
            {
              ...execution("order-2"),
              startTime: { seconds: 200 },
              taskQueue: "orders",
            },
            { ...execution("sub-1"), type: { name: "subscriptionBilling" } },
          ],
        });
      }

      if (method === "GetWorkflowExecutionHistory") {
        return Promise.resolve({
          history: {
            events: [
              {
                eventId: 1,
                // EVENT_TYPE_WORKFLOW_EXECUTION_STARTED
                eventType: 1,
                workflowExecutionStartedEventAttributes: {
                  input: {
                    payloads:
                      request.execution!.workflowId === "order-2"
                        ? [payload({ plan: "pro" }), payload(3)]
                        : [
                            {
                              data: Buffer.from("secret"),
                              metadata: {
                                encoding: Buffer.from("binary/encrypted"),
                              },
                            },
                          ],
                  },
                },
              },
            ],
          },
        });
      }

      return Promise.reject(new Error("not needed here"));
    }) as never);

    const inputs = await client.getTypeInputs("default", "orderFulfillment");

    client.close();
    expect(inputs.taskQueue).toBe("orders");
    expect(
      inputs.runs.map((run) => [run.workflowId, run.isEncoded, run.args]),
    ).toEqual([
      ["order-2", false, [{ plan: "pro" }, 3]],
      [
        "order-1",
        true,
        [{ $encodedPayload: { encoding: "binary/encrypted", sizeBytes: 6 } }],
      ],
    ]);
  });
});

describe("TemporalGrpcBffClient.getClusterOverview", () => {
  it("gives each shard the measurements behind its health state", async () => {
    const client = new TemporalGrpcBffClient({
      address: "127.0.0.1:1",
      adminUrl: "http://admin.invalid",
    });

    vi.spyOn(client, "adminFetch").mockImplementation(((path: string) =>
      Promise.resolve(
        path.startsWith("/v1/load")
          ? {
              health: {
                reasons: [
                  {
                    scope: "server",
                    signal: "headroom",
                    unit: "share",
                    value: 0.12,
                  },
                  {
                    scope: "shard",
                    shard: 0,
                    signal: "progress_sojourn",
                    unit: "ms",
                    value: 7.1,
                  },
                ],
                state: "busy",
                tags: ["hot_server"],
              },
              shards: [{ health: "busy", id: 0 }],
            }
          : {},
      )) as never);

    const overview = await client.getClusterOverview();

    client.close();
    expect(overview.health).toEqual({
      reasons: [
        { signal: "headroom", unit: "share", value: 0.12 },
        { shard: 0, signal: "progress_sojourn", unit: "ms", value: 7.1 },
      ],
      state: "busy",
      tags: ["hot_server"],
    });
    expect(overview.shards[0]!.healthReasons).toEqual([
      { shard: 0, signal: "progress_sojourn", unit: "ms", value: 7.1 },
    ]);
  });
});

describe("TemporalGrpcBffClient bulk jobs", () => {
  it("acts on every running match of a filter and reports progress and failures", async () => {
    const client = new TemporalGrpcBffClient({ address: "127.0.0.1:1" });
    const signalled: string[] = [];

    vi.spyOn(client, "unary").mockImplementation(((
      method: string,
      _req: unknown,
      _res: unknown,
      request: { workflowExecution?: { workflowId?: string } },
    ) => {
      if (method === "ListWorkflowExecutions") {
        return Promise.resolve({
          executions: [
            { execution: { runId: "r1", workflowId: "sub-1" }, status: 1 },
            { execution: { runId: "r2", workflowId: "sub-2" }, status: 1 },
            { execution: { runId: "r3", workflowId: "sub-3" }, status: 2 },
          ],
        });
      }

      const workflowId = request.workflowExecution?.workflowId ?? "";

      signalled.push(workflowId);

      return workflowId === "sub-2"
        ? Promise.reject(new Error("workflow not found"))
        : Promise.resolve({});
    }) as never);

    let job = await client.startBulkJob("default", {
      action: "signal",
      query: 'WorkflowType = "subscriptionBilling"',
      signalName: "pauseSubscription",
    });

    // The completed run is left out: it can take no Signal.
    expect(job.total).toBe(2);

    await vi.waitFor(() => {
      job = client.getBulkJob(job.id);
      expect(job.state).toBe("completed");
    });

    expect(signalled.sort()).toEqual(["sub-1", "sub-2"]);
    expect(job).toMatchObject({
      done: 2,
      errors: [{ error: "workflow not found", workflowId: "sub-2" }],
      failed: 1,
    });
    client.close();
  });
});

describe("structuredCalendarToCron", () => {
  it("writes the calendar a server made from a cron string as that cron string", () => {
    // What Temporal stores for `30 8 * * 1-5`.
    expect(
      structuredCalendarToCron({
        dayOfMonth: [{ end: 31, start: 1 }],
        dayOfWeek: [{ end: 5, start: 1 }],
        hour: [{ start: 8 }],
        minute: [{ start: 30 }],
        month: [{ end: 12, start: 1 }],
        second: [{}],
      }),
    ).toBe("30 8 * * 1-5");
    expect(
      structuredCalendarToCron({
        dayOfMonth: [{ end: 31, start: 1 }],
        dayOfWeek: [{ end: 6 }],
        hour: [{ end: 23 }],
        minute: [{ end: 59, step: 15 }],
        month: [{ end: 12, start: 1 }],
      }),
    ).toBe("*/15 * * * *");
  });

  it("returns nothing for a calendar that five cron fields cannot express", () => {
    expect(
      structuredCalendarToCron({ second: [{ start: 30 }] }),
    ).toBeUndefined();
    expect(structuredCalendarToCron(undefined)).toBeUndefined();
  });
});

describe("TemporalGrpcBffClient.listSchedules", () => {
  it("describes schedules concurrently and passes pagination tokens through", async () => {
    const client = new TemporalGrpcBffClient({ address: "127.0.0.1:1" });
    let inFlight = 0;
    let peak = 0;
    let seenToken: Uint8Array | undefined;

    vi.spyOn(client, "unary").mockImplementation((async (
      method: string,
      _req: unknown,
      _res: unknown,
      request: { nextPageToken?: Uint8Array; scheduleId?: string },
    ) => {
      if (method === "ListSchedules") {
        seenToken = request.nextPageToken;
        return {
          nextPageToken: Buffer.from("page-2"),
          schedules: [
            { scheduleId: "s1" },
            { scheduleId: "s2" },
            { scheduleId: "s3" },
            { scheduleId: "s4" },
          ],
        };
      }

      if (method === "DescribeSchedule") {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight--;
        return {
          info: {},
          schedule: {
            action: {
              startWorkflow: {
                taskQueue: { name: "billing" },
                workflowType: { name: "ChargeOrder" },
              },
            },
          },
        };
      }

      return {};
    }) as never);

    const res = await client.listSchedules("default", {
      nextPageToken: Buffer.from("page-1").toString("base64"),
      pageSize: 50,
    });

    expect(seenToken?.toString()).toBe("page-1");
    expect(peak).toBeGreaterThan(1);
    expect(res.schedules.map((s) => s.scheduleId)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
    expect(res.nextPageToken).toBe(Buffer.from("page-2").toString("base64"));
    client.close();
  });
});

describe("TemporalGrpcBffClient.startBulkJob paused workflows", () => {
  it("includes paused workflows when acting on all matching runs", async () => {
    const client = new TemporalGrpcBffClient({ address: "127.0.0.1:1" });
    const terminated: string[] = [];

    vi.spyOn(client, "unary").mockImplementation(((
      method: string,
      _req: unknown,
      _res: unknown,
      request: { workflowExecution?: { workflowId?: string } },
    ) => {
      if (method === "ListWorkflowExecutions") {
        return Promise.resolve({
          executions: [
            {
              execution: { runId: "r1", workflowId: "wf-running" },
              status: 1,
              type: { name: "Order" },
            },
            {
              execution: { runId: "r2", workflowId: "wf-paused" },
              status: "WORKFLOW_EXECUTION_STATUS_PAUSED",
              type: { name: "Order" },
            },
            {
              execution: { runId: "r3", workflowId: "wf-completed" },
              status: 2,
              type: { name: "Order" },
            },
          ],
        });
      }

      if (method === "TerminateWorkflowExecution") {
        terminated.push(request.workflowExecution?.workflowId ?? "");
      }

      return Promise.resolve({});
    }) as never);

    let job = await client.startBulkJob("default", {
      action: "terminate",
      query: 'WorkflowType = "Order"',
    });

    expect(job.total).toBe(2);

    await vi.waitFor(() => {
      job = client.getBulkJob(job.id);
      expect(job.state).toBe("completed");
    });

    expect(terminated.sort()).toEqual(["wf-paused", "wf-running"]);
    client.close();
  });
});

describe("TemporalGrpcBffClient.getWorkflowDetail truncated history tail", () => {
  it("appends the tail via GetWorkflowExecutionHistoryReverse so closing failures still appear", async () => {
    const client = new TemporalGrpcBffClient({ address: "127.0.0.1:1" });
    let page = 0;

    vi.spyOn(client, "unary").mockImplementation(((method: string) => {
      if (method === "DescribeWorkflowExecution") {
        return Promise.resolve({
          workflowExecutionInfo: {
            execution: { runId: "run-long", workflowId: "wf-long" },
            historyLength: 2500,
            status: 3,
            type: { name: "LongWorkflow" },
          },
        });
      }

      if (method === "GetWorkflowExecutionHistory") {
        page++;
        return Promise.resolve({
          history: {
            events: [
              {
                eventId: page,
                eventType: page === 1 ? 1 : 7,
                ...(page === 1
                  ? {
                      workflowExecutionStartedEventAttributes: {
                        workflowType: { name: "LongWorkflow" },
                      },
                    }
                  : { workflowTaskCompletedEventAttributes: {} }),
              },
            ],
          },
          nextPageToken: Buffer.from(`p-${page}`),
        });
      }

      if (method === "GetWorkflowExecutionHistoryReverse") {
        return Promise.resolve({
          history: {
            events: [
              {
                eventId: 2500,
                eventType: 3,
                workflowExecutionFailedEventAttributes: {
                  failure: { message: "boom at event 2500" },
                },
              },
            ],
          },
        });
      }

      return Promise.resolve({});
    }) as never);

    const detail = await client.getWorkflowDetail({
      namespace: "default",
      runId: "run-long",
      workflowId: "wf-long",
    });

    expect(detail.historyTruncated).toBe(true);
    expect(detail.historyTailIncluded).toBe(true);
    expect(detail.failure?.message).toBe("boom at event 2500");
    expect(detail.rawEvents.at(-1)?.eventId).toBe(2500);
    client.close();
  });

  it("reuses cached history during live polling while historyLength is unchanged", async () => {
    const client = new TemporalGrpcBffClient({ address: "127.0.0.1:1" });
    let historyLength = 3;
    let historyCalls = 0;

    vi.spyOn(client, "unary").mockImplementation(((method: string) => {
      if (method === "DescribeWorkflowExecution") {
        return Promise.resolve({
          workflowExecutionInfo: {
            execution: { runId: "run-live", workflowId: "wf-live" },
            historyLength,
            status: 1,
            type: { name: "Order" },
          },
        });
      }

      if (method === "GetWorkflowExecutionHistory") {
        historyCalls++;
        return Promise.resolve({
          history: {
            events: [
              {
                eventId: 1,
                eventType: 1,
                workflowExecutionStartedEventAttributes: {
                  workflowType: { name: "Order" },
                },
              },
            ],
          },
        });
      }

      return Promise.resolve({});
    }) as never);

    await client.getWorkflowDetail({
      namespace: "default",
      runId: "run-live",
      workflowId: "wf-live",
    });
    await client.getWorkflowDetail({
      namespace: "default",
      runId: "run-live",
      workflowId: "wf-live",
    });
    expect(historyCalls).toBe(1);

    historyLength = 5;
    await client.getWorkflowDetail({
      namespace: "default",
      runId: "run-live",
      workflowId: "wf-live",
    });
    expect(historyCalls).toBe(2);
    client.close();
  });
});

describe("TemporalGrpcBffClient rolling sparkline history", () => {
  it("records rolling 5-minute samples across getClusterOverview polls", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-24T00:00:00.000Z"));
      const client = new TemporalGrpcBffClient({
        address: "127.0.0.1:1",
        adminUrl: "http://127.0.0.1:19999",
      });
      let lag = 2;

      vi.spyOn(client, "adminFetch").mockImplementation((async (
        adminPath: string,
      ) => {
        if (adminPath === "/readyz") {
          return { phase: "serving", ready: true, subsystems: {} };
        }
        if (adminPath === "/v1/info") {
          return { shard_count: 1, version: "0.1.0" };
        }
        if (adminPath === "/v1/storage") {
          return { active_bytes: 1024, shards: [] };
        }
        if (adminPath.startsWith("/v1/load")) {
          return {
            health: { reasons: [], state: "ok", tags: [] },
            shards: [
              {
                delay_ms: { progress: { last: lag } },
                id: 0,
                rates_per_s: {
                  history_events: 12,
                  runs_closed: 3,
                  runs_opened: 4,
                },
                storage: { l0_ssts: 1, unflushed_bytes: 512 },
              },
            ],
            worker_hint: { matcher_oldest_ready_ms: lag * 10 },
          };
        }
        return null;
      }) as never);

      const first = await client.getClusterOverview();
      expect(first.history).toHaveLength(1);
      expect(first.shards[0]?.progressDelayHistory).toEqual([2]);

      vi.advanceTimersByTime(3_000);
      lag = 9;
      const second = await client.getClusterOverview();
      expect(second.history).toHaveLength(2);
      expect(second.shards[0]?.progressDelayHistory).toEqual([2, 9]);
      expect(second.history?.map((s) => s.matcherOldestReadyMs)).toEqual([
        20, 90,
      ]);

      client.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TemporalGrpcBffClient.getCapabilities", () => {
  it("reports newest-first native list order for slate-temporal-next builds with the visibility feed", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(input);
        if (url.endsWith("/readyz")) {
          return Promise.resolve(new Response("ok", { status: 200 }));
        }
        if (url.endsWith("/metrics")) {
          return Promise.resolve(
            new Response(
              "# HELP stn_visibility_feed_entries_total\nstn_visibility_feed_entries_total 12\n",
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response("not found", { status: 404 }));
      });

    try {
      const client = new TemporalGrpcBffClient({
        address: "127.0.0.1:1",
        adminToken: "tok",
        adminUrl: "http://127.0.0.1:27243",
      });
      vi.spyOn(client, "unary").mockImplementation(((method: string) => {
        if (method === "GetClusterInfo") {
          return Promise.resolve({
            clusterName: "active",
            historyShardCount: 1,
            persistenceStore: "slatedb",
            serverVersion: "0.1.0",
          });
        }
        return Promise.resolve({
          capabilities: { countGroupByExecutionStatus: true },
          serverVersion: "0.1.0",
        });
      }) as never);

      const caps = await client.getCapabilities();
      expect(caps.serverKind).toBe("slate-temporal-next");
      expect(caps.supportsAdminApi).toBe(true);
      expect(caps.nativeListOrder).toBe("newest-first");
      client.close();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("keeps workflow-id native list order for older slate-temporal-next builds without the visibility feed", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(input);
        if (url.endsWith("/readyz")) {
          return Promise.resolve(new Response("ok", { status: 200 }));
        }
        if (url.endsWith("/metrics")) {
          return Promise.resolve(
            new Response("stn_visibility_calls_total 5\n", { status: 200 }),
          );
        }
        return Promise.resolve(new Response("not found", { status: 404 }));
      });

    try {
      const client = new TemporalGrpcBffClient({
        address: "127.0.0.1:1",
        adminUrl: "http://127.0.0.1:27243",
      });
      vi.spyOn(client, "unary").mockImplementation(((method: string) => {
        if (method === "GetClusterInfo") {
          return Promise.resolve({
            clusterName: "active",
            historyShardCount: 1,
            persistenceStore: "slatedb",
            serverVersion: "0.1.0",
          });
        }
        return Promise.resolve({
          capabilities: { countGroupByExecutionStatus: true },
          serverVersion: "0.1.0",
        });
      }) as never);

      const caps = await client.getCapabilities();
      expect(caps.nativeListOrder).toBe("workflow-id");
      client.close();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("serves StartTime desc natively without copying 10k runs on newest-first servers", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(input);
        if (url.endsWith("/readyz")) {
          return Promise.resolve(new Response("ok", { status: 200 }));
        }
        if (url.endsWith("/metrics")) {
          return Promise.resolve(
            new Response("stn_visibility_feed_entries_total 1\n", {
              status: 200,
            }),
          );
        }
        return Promise.resolve(new Response("not found", { status: 404 }));
      });

    try {
      const client = new TemporalGrpcBffClient({
        address: "127.0.0.1:1",
        adminUrl: "http://127.0.0.1:27243",
      });
      const listCalls: number[] = [];
      vi.spyOn(client, "unary").mockImplementation(((
        method: string,
        _req: unknown,
        _res: unknown,
        request: { pageSize?: number },
      ) => {
        if (method === "GetClusterInfo") {
          return Promise.resolve({
            clusterName: "active",
            historyShardCount: 1,
            persistenceStore: "slatedb",
            serverVersion: "0.1.0",
          });
        }
        if (method === "GetSystemInfo") {
          return Promise.resolve({
            capabilities: { countGroupByExecutionStatus: true },
            serverVersion: "0.1.0",
          });
        }
        if (method === "ListWorkflowExecutions") {
          listCalls.push(request.pageSize ?? 0);
          return Promise.resolve({
            executions: [
              {
                execution: { runId: "r-new", workflowId: "wf-new" },
                status: 1,
              },
            ],
          });
        }
        if (method === "CountWorkflowExecutions") {
          return Promise.resolve({ count: 25_000, groups: [] });
        }
        return Promise.resolve({});
      }) as never);

      await client.getCapabilities();
      const res = await client.listWorkflows({
        namespace: "default",
        pageSize: 50,
        sort: { direction: "desc", field: "StartTime" },
      });

      expect(listCalls).toEqual([50]);
      expect(res.sortSkippedReason).toBeUndefined();
      expect(res.totalCount).toBe(25_000);
      client.close();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
