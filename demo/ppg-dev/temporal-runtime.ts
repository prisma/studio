import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as proto from "@temporalio/proto";

import { decodePayloads } from "../../data/temporal/history-grouping";
import { encodeJsonPayloads, TemporalGrpcBffClient } from "./temporal-bff";

const ws = proto.temporal.api.workflowservice.v1;
const enums = proto.temporal.api.enums.v1;

function sec(seconds: number) {
  return proto.google.protobuf.Duration.fromObject({ seconds });
}

export interface DemoTemporalRuntime {
  address: string;
  adminUrl?: string;
  client: TemporalGrpcBffClient;
  cleanup: () => Promise<void>;
}

function findLocalTemporalNextBinary(): string | null {
  const candidates = [
    process.env.STUDIO_TEMPORAL_BIN,
    path.join(
      os.homedir(),
      ".prisma-composer",
      "runtimes",
      "temporal",
      "stn-0.1.0-3eed2002-1",
      `${process.platform}-${process.arch}`,
      "bin",
      "slate-temporal-next",
    ),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function waitForReadyz(
  adminUrl: string,
  child: ChildProcess,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `slate-temporal-next exited early with code ${child.exitCode}`,
      );
    }
    try {
      const res = await fetch(`${adminUrl}/readyz`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `slate-temporal-next did not become ready at ${adminUrl}/readyz`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Lightweight pure-gRPC Temporal worker for the demo server (no native worker
 * bridge required). Executes ChargeOrder, MoneyTransfer, SubscriptionRenewal,
 * and arbitrary user-started workflows live against either slate-temporal-next
 * or temporal server start-dev.
 */
function startDemoTemporalWorker(
  client: TemporalGrpcBffClient,
  namespace: string,
  taskQueues: string[],
): () => void {
  let stopped = false;

  const processWorkflowTask = async (
    task: proto.temporal.api.workflowservice.v1.IPollWorkflowTaskQueueResponse,
  ) => {
    if (!task.taskToken || task.taskToken.length === 0) return;

    const wfType = task.workflowType?.name ?? "CustomWorkflow";
    const wfId = task.workflowExecution?.workflowId ?? "";
    const events = task.history?.events ?? [];

    let input: Record<string, unknown> = {};
    const completedActivities = new Map<string, unknown>();
    const failedActivities = new Map<string, string>();
    const scheduledActivities = new Set<string>();
    const firedTimers = new Set<string>();
    const startedTimers = new Set<string>();
    const signals: Array<{ args: unknown; name: string }> = [];

    for (const evt of events) {
      if (evt.workflowExecutionStartedEventAttributes) {
        const decoded = decodePayloads(
          evt.workflowExecutionStartedEventAttributes.input as never,
        );
        if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
          input = decoded as Record<string, unknown>;
        } else if (decoded !== undefined) {
          input = { value: decoded };
        }
      } else if (evt.activityTaskScheduledEventAttributes) {
        const actId = evt.activityTaskScheduledEventAttributes.activityId ?? "";
        scheduledActivities.add(actId);
      } else if (evt.activityTaskCompletedEventAttributes) {
        const schedId = Number(
          evt.activityTaskCompletedEventAttributes.scheduledEventId ?? 0,
        );
        const schedEvt = events.find((e) => Number(e.eventId) === schedId);
        const actId =
          schedEvt?.activityTaskScheduledEventAttributes?.activityId ??
          String(schedId);
        completedActivities.set(
          actId,
          decodePayloads(
            evt.activityTaskCompletedEventAttributes.result as never,
          ),
        );
      } else if (evt.activityTaskFailedEventAttributes) {
        const schedId = Number(
          evt.activityTaskFailedEventAttributes.scheduledEventId ?? 0,
        );
        const schedEvt = events.find((e) => Number(e.eventId) === schedId);
        const actId =
          schedEvt?.activityTaskScheduledEventAttributes?.activityId ??
          String(schedId);
        failedActivities.set(
          actId,
          evt.activityTaskFailedEventAttributes.failure?.message ??
            "Activity failed",
        );
      } else if (evt.timerStartedEventAttributes) {
        startedTimers.add(evt.timerStartedEventAttributes.timerId ?? "");
      } else if (evt.timerFiredEventAttributes) {
        const startedId = Number(
          evt.timerFiredEventAttributes.startedEventId ?? 0,
        );
        const startEvt = events.find((e) => Number(e.eventId) === startedId);
        firedTimers.add(
          startEvt?.timerStartedEventAttributes?.timerId ?? String(startedId),
        );
      } else if (evt.workflowExecutionSignaledEventAttributes) {
        signals.push({
          args: decodePayloads(
            evt.workflowExecutionSignaledEventAttributes.input as never,
          ),
          name: evt.workflowExecutionSignaledEventAttributes.signalName ?? "",
        });
      }
    }

    // Legacy query-only task (QueryWorkflow)
    if (task.query) {
      const qName = task.query.queryType ?? "";
      const answer =
        wfType === "MoneyTransfer"
          ? {
              attempts: completedActivities.has("deposit") ? 1 : 3,
              depositApprovedBySignal: signals.some(
                (s) => s.name === "approveDeposit" || s.name === "skipRetry",
              ),
              fraudHoldCleared: firedTimers.has("fraudHoldTimer"),
              phase: completedActivities.has("deposit")
                ? "completed"
                : scheduledActivities.has("deposit")
                  ? "depositing"
                  : startedTimers.has("fraudHoldTimer")
                    ? "fraud_hold"
                    : "withdrawing",
              query: qName,
              refundable: completedActivities.has("withdraw"),
              withdrawn: completedActivities.has("withdraw"),
            }
          : {
              completedSteps: Array.from(completedActivities.keys()),
              input,
              query: qName,
              signalsReceived: signals.map((s) => s.name),
              workflowId: wfId,
              workflowType: wfType,
            };

      await client.unary(
        "RespondQueryTaskCompleted",
        ws.RespondQueryTaskCompletedRequest,
        ws.RespondQueryTaskCompletedResponse,
        {
          completedType: enums.QueryResultType.QUERY_RESULT_TYPE_ANSWERED,
          namespace,
          queryResult: encodeJsonPayloads([answer]),
          taskToken: task.taskToken,
        },
      );
      return;
    }

    const commands: proto.temporal.api.command.v1.ICommand[] = [];
    const queueName = task.workflowExecutionTaskQueue?.name || "billing";

    if (wfType === "ChargeOrder") {
      if (!scheduledActivities.has("validateCart")) {
        commands.push({
          commandType: enums.CommandType.COMMAND_TYPE_SCHEDULE_ACTIVITY_TASK,
          scheduleActivityTaskCommandAttributes: {
            activityId: "validateCart",
            activityType: { name: "validateCart" },
            input: encodeJsonPayloads([input]),
            scheduleToCloseTimeout: sec(30),
            startToCloseTimeout: sec(10),
            taskQueue: { name: queueName },
          },
        });
      } else if (
        completedActivities.has("validateCart") &&
        !scheduledActivities.has("chargeCard")
      ) {
        commands.push({
          commandType: enums.CommandType.COMMAND_TYPE_SCHEDULE_ACTIVITY_TASK,
          scheduleActivityTaskCommandAttributes: {
            activityId: "chargeCard",
            activityType: { name: "chargeCard" },
            input: encodeJsonPayloads([{ ...input, workflowId: wfId }]),
            retryPolicy: { maximumAttempts: 2 },
            scheduleToCloseTimeout: sec(30),
            startToCloseTimeout: sec(10),
            taskQueue: { name: queueName },
          },
        });
      } else if (failedActivities.has("chargeCard")) {
        commands.push({
          commandType: enums.CommandType.COMMAND_TYPE_FAIL_WORKFLOW_EXECUTION,
          failWorkflowExecutionCommandAttributes: {
            failure: {
              applicationFailureInfo: {
                nonRetryable: true,
                type: "StripeCardDeclined",
              },
              message: failedActivities.get("chargeCard")!,
              source: "billing-worker",
              stackTrace:
                "at chargeCard (activities/stripe.ts:48:11)\nat ChargeOrder (workflows/chargeOrder.ts:24:18)",
            },
          },
        });
      } else if (
        completedActivities.has("chargeCard") &&
        !scheduledActivities.has("issueReceipt")
      ) {
        commands.push({
          commandType: enums.CommandType.COMMAND_TYPE_SCHEDULE_ACTIVITY_TASK,
          scheduleActivityTaskCommandAttributes: {
            activityId: "issueReceipt",
            activityType: { name: "issueReceipt" },
            input: encodeJsonPayloads([
              { charge: completedActivities.get("chargeCard"), ...input },
            ]),
            scheduleToCloseTimeout: sec(30),
            startToCloseTimeout: sec(10),
            taskQueue: { name: queueName },
          },
        });
      } else if (completedActivities.has("issueReceipt")) {
        commands.push({
          commandType:
            enums.CommandType.COMMAND_TYPE_COMPLETE_WORKFLOW_EXECUTION,
          completeWorkflowExecutionCommandAttributes: {
            result: encodeJsonPayloads([
              {
                charged: true,
                orderId: input.orderId ?? wfId,
                receipt: completedActivities.get("issueReceipt"),
              },
            ]),
          },
        });
      }
    } else if (wfType === "MoneyTransfer") {
      const skipRequested = signals.some(
        (s) => s.name === "approveDeposit" || s.name === "skipRetry",
      );
      if (skipRequested) {
        commands.push({
          commandType:
            enums.CommandType.COMMAND_TYPE_COMPLETE_WORKFLOW_EXECUTION,
          completeWorkflowExecutionCommandAttributes: {
            result: encodeJsonPayloads([
              { completedViaSignal: true, transferId: wfId },
            ]),
          },
        });
      } else if (!scheduledActivities.has("withdraw")) {
        commands.push({
          commandType: enums.CommandType.COMMAND_TYPE_SCHEDULE_ACTIVITY_TASK,
          scheduleActivityTaskCommandAttributes: {
            activityId: "withdraw",
            activityType: { name: "withdrawFunds" },
            input: encodeJsonPayloads([input]),
            scheduleToCloseTimeout: sec(30),
            startToCloseTimeout: sec(10),
            taskQueue: { name: queueName },
          },
        });
      } else if (
        completedActivities.has("withdraw") &&
        !startedTimers.has("fraudHoldTimer")
      ) {
        commands.push({
          commandType: enums.CommandType.COMMAND_TYPE_START_TIMER,
          startTimerCommandAttributes: {
            startToFireTimeout: sec(1),
            timerId: "fraudHoldTimer",
          },
        });
      } else if (
        firedTimers.has("fraudHoldTimer") &&
        !scheduledActivities.has("deposit")
      ) {
        commands.push({
          commandType: enums.CommandType.COMMAND_TYPE_SCHEDULE_ACTIVITY_TASK,
          scheduleActivityTaskCommandAttributes: {
            activityId: "deposit",
            activityType: { name: "depositFunds" },
            input: encodeJsonPayloads([{ ...input, workflowId: wfId }]),
            retryPolicy: {
              backoffCoefficient: 1.5,
              initialInterval: sec(6),
              maximumAttempts: 25,
              maximumInterval: sec(12),
            },
            scheduleToCloseTimeout: sec(3600),
            startToCloseTimeout: sec(10),
            taskQueue: { name: queueName },
          },
        });
      } else if (completedActivities.has("deposit")) {
        commands.push({
          commandType:
            enums.CommandType.COMMAND_TYPE_COMPLETE_WORKFLOW_EXECUTION,
          completeWorkflowExecutionCommandAttributes: {
            result: encodeJsonPayloads([
              {
                deposit: completedActivities.get("deposit"),
                settled: true,
                transferId: wfId,
              },
            ]),
          },
        });
      }
    } else if (wfType === "SubscriptionRenewal") {
      if (
        signals.some((s) => s.name === "renewNow") ||
        firedTimers.has("renewalWindow")
      ) {
        commands.push({
          commandType:
            enums.CommandType.COMMAND_TYPE_COMPLETE_WORKFLOW_EXECUTION,
          completeWorkflowExecutionCommandAttributes: {
            result: encodeJsonPayloads([
              { renewed: true, subscriptionId: wfId },
            ]),
          },
        });
      } else if (!startedTimers.has("renewalWindow")) {
        commands.push({
          commandType: enums.CommandType.COMMAND_TYPE_START_TIMER,
          startTimerCommandAttributes: {
            startToFireTimeout: sec(1800),
            timerId: "renewalWindow",
          },
        });
      }
    } else {
      // Generic echo workflow for user-started playground tests
      if (!scheduledActivities.has("step1")) {
        commands.push({
          commandType: enums.CommandType.COMMAND_TYPE_SCHEDULE_ACTIVITY_TASK,
          scheduleActivityTaskCommandAttributes: {
            activityId: "step1",
            activityType: { name: "executeStep" },
            input: encodeJsonPayloads([input]),
            scheduleToCloseTimeout: sec(30),
            startToCloseTimeout: sec(10),
            taskQueue: { name: queueName },
          },
        });
      } else if (completedActivities.has("step1")) {
        commands.push({
          commandType:
            enums.CommandType.COMMAND_TYPE_COMPLETE_WORKFLOW_EXECUTION,
          completeWorkflowExecutionCommandAttributes: {
            result: encodeJsonPayloads([
              {
                echo: input,
                ok: true,
                stepResult: completedActivities.get("step1"),
                workflowType: wfType,
              },
            ]),
          },
        });
      }
    }

    await client.unary(
      "RespondWorkflowTaskCompleted",
      ws.RespondWorkflowTaskCompletedRequest,
      ws.RespondWorkflowTaskCompletedResponse,
      {
        commands,
        identity: "studio-demo-worker",
        namespace,
        taskToken: task.taskToken,
      },
    );
  };

  const processActivityTask = async (
    task: proto.temporal.api.workflowservice.v1.IPollActivityTaskQueueResponse,
  ) => {
    if (!task.taskToken || task.taskToken.length === 0) return;

    const actType = task.activityType?.name ?? "executeStep";
    const decoded = decodePayloads(task.input as never);
    const input =
      decoded && typeof decoded === "object" && !Array.isArray(decoded)
        ? (decoded as Record<string, unknown>)
        : {};
    const wfId = String(
      input.workflowId ?? task.workflowExecution?.workflowId ?? "",
    );

    await sleep(60);

    if (
      actType === "chargeCard" &&
      (wfId.includes("fail") ||
        wfId === "ord-8492" ||
        wfId === "ord-8488" ||
        input.simulateDecline === true) &&
      !wfId.includes("retry")
    ) {
      await client.unary(
        "RespondActivityTaskFailed",
        ws.RespondActivityTaskFailedRequest,
        ws.RespondActivityTaskFailedResponse,
        {
          failure: {
            applicationFailureInfo: {
              nonRetryable: true,
              type: "StripeCardDeclined",
            },
            message: "StripeCardDeclined: card_declined (insufficient_funds)",
            source: "stripe-gateway",
            stackTrace: "at chargeCard (activities/stripe.ts:48:11)",
          },
          identity: "studio-demo-worker",
          namespace,
          taskToken: task.taskToken,
        },
      );
      return;
    }

    if (actType === "depositFunds" && input.simulateBankOutage === true) {
      await client.unary(
        "RespondActivityTaskFailed",
        ws.RespondActivityTaskFailedRequest,
        ws.RespondActivityTaskFailedResponse,
        {
          failure: {
            applicationFailureInfo: {
              nonRetryable: false,
              type: "BankGateway503",
            },
            message: "BankGateway503: upstream settlement service unavailable",
            source: "bank-connector",
            stackTrace: "at depositFunds (activities/bank.ts:91:15)",
          },
          identity: "studio-demo-worker",
          namespace,
          taskToken: task.taskToken,
        },
      );
      return;
    }

    const resultByActivity: Record<string, unknown> = {
      chargeCard: {
        amountCents: input.amountCents ?? 4900,
        chargeId: `ch_${wfId.replace(/[^a-z0-9]/gi, "").slice(-6) || "demo"}`,
        status: "succeeded",
      },
      depositFunds: {
        depositedAt: new Date().toISOString(),
        reference: `dep_${wfId}`,
      },
      executeStep: {
        executedAt: new Date().toISOString(),
        worker: "studio-demo-worker",
      },
      issueReceipt: {
        receiptId: `rcpt_${wfId}`,
        sentTo: input.email ?? "customer@acme.dev",
      },
      validateCart: {
        items: 3,
        valid: true,
      },
      withdrawFunds: {
        fromAccount: input.from ?? "acct_checking_01",
        withdrawnCents: input.amountCents ?? 25_000,
      },
    };

    await client.unary(
      "RespondActivityTaskCompleted",
      ws.RespondActivityTaskCompletedRequest,
      ws.RespondActivityTaskCompletedResponse,
      {
        identity: "studio-demo-worker",
        namespace,
        result: encodeJsonPayloads([
          resultByActivity[actType] ?? { ok: true, actType },
        ]),
        taskToken: task.taskToken,
      },
    );
  };

  for (const queue of taskQueues) {
    void (async () => {
      while (!stopped) {
        try {
          const task = await client.unary(
            "PollWorkflowTaskQueue",
            ws.PollWorkflowTaskQueueRequest,
            ws.PollWorkflowTaskQueueResponse,
            {
              identity: `studio-demo-wf-${queue}`,
              namespace,
              taskQueue: { name: queue },
            },
            15_000,
          );
          if (!stopped && task.taskToken && task.taskToken.length > 0) {
            await processWorkflowTask(task);
          }
        } catch {
          if (!stopped) await sleep(250);
        }
      }
    })();

    void (async () => {
      while (!stopped) {
        try {
          const task = await client.unary(
            "PollActivityTaskQueue",
            ws.PollActivityTaskQueueRequest,
            ws.PollActivityTaskQueueResponse,
            {
              identity: `studio-demo-act-${queue}`,
              namespace,
              taskQueue: { name: queue },
            },
            15_000,
          );
          if (!stopped && task.taskToken && task.taskToken.length > 0) {
            await processActivityTask(task);
          }
        } catch {
          if (!stopped) await sleep(250);
        }
      }
    })();
  }

  return () => {
    stopped = true;
  };
}

async function seedDemoWorkflows(client: TemporalGrpcBffClient): Promise<void> {
  const ns = "default";
  const seeds = [
    {
      args: [{ amountCents: 4900, currency: "USD", orderId: "ord-8491" }],
      memo: { customer: "acme-corp", owner: "billing-team" },
      taskQueue: "billing",
      workflowId: "ord-8491",
      workflowType: "ChargeOrder",
    },
    {
      args: [{ amountCents: 12900, currency: "USD", orderId: "ord-8490" }],
      memo: { customer: "globex", owner: "billing-team" },
      taskQueue: "billing",
      workflowId: "ord-8490",
      workflowType: "ChargeOrder",
    },
    {
      args: [{ amountCents: 4900, currency: "USD", orderId: "ord-8492" }],
      memo: { customer: "initech", owner: "billing-team" },
      taskQueue: "billing",
      workflowId: "ord-8492",
      workflowType: "ChargeOrder",
    },
    {
      args: [{ amountCents: 8900, currency: "USD", orderId: "ord-8488" }],
      memo: { customer: "umbrella", owner: "billing-team" },
      taskQueue: "billing",
      workflowId: "ord-8488",
      workflowType: "ChargeOrder",
    },
    {
      args: [
        {
          amountCents: 25000,
          from: "acct_checking_01",
          simulateBankOutage: true,
          to: "acct_savings_09",
        },
      ],
      memo: { priority: "high", region: "us-east-1" },
      taskQueue: "billing",
      workflowId: "xfer-901",
      workflowType: "MoneyTransfer",
    },
    {
      args: [
        {
          amountCents: 15000,
          from: "acct_ops_02",
          simulateBankOutage: false,
          to: "acct_vendor_14",
        },
      ],
      memo: { priority: "normal" },
      taskQueue: "billing",
      workflowId: "xfer-900",
      workflowType: "MoneyTransfer",
    },
    {
      args: [
        { nextChargeCents: 2900, plan: "pro-monthly", workspaceId: "ws_4401" },
      ],
      memo: { tier: "pro" },
      taskQueue: "default",
      workflowId: "sub-4401",
      workflowType: "SubscriptionRenewal",
    },
    {
      args: [
        {
          nextChargeCents: 9900,
          plan: "scale-monthly",
          workspaceId: "ws_4402",
        },
      ],
      memo: { tier: "scale" },
      taskQueue: "default",
      workflowId: "sub-4402",
      workflowType: "SubscriptionRenewal",
    },
  ];

  for (const s of seeds) {
    try {
      await client.startWorkflow(ns, s);
    } catch {
      // Ignore ALREADY_EXISTS when reconnecting to an external server
    }
  }

  // Wait briefly for activities to complete / enter retry, then terminate sub-4402 so Terminated status is represented
  await sleep(600);
  try {
    await client.terminateWorkflow({
      namespace: ns,
      reason: "Superseded by annual upgrade",
      workflowId: "sub-4402",
    });
  } catch {
    // ignore
  }

  // Seed realistic schedules for the Schedules Workbench
  const schedulesToSeed = [
    {
      args: [
        { amountCents: 19900, currency: "USD", orderId: "reconcile-batch" },
      ],
      intervalSeconds: 900,
      notes: "Reconciles settled Stripe charges every 15 minutes",
      overlapPolicy: "SKIP" as const,
      paused: false,
      scheduleId: "nightly-billing-reconcile",
      taskQueue: "billing",
      workflowIdPrefix: "billing-reconcile",
      workflowType: "ChargeOrder",
    },
    {
      args: [{ plan: "pro", sweep: true }],
      intervalSeconds: 300,
      notes: "Checks expiring subscriptions and schedules renewal runs",
      overlapPolicy: "BUFFER_ONE" as const,
      paused: false,
      scheduleId: "subscription-renewal-sweep",
      taskQueue: "default",
      workflowIdPrefix: "sub-sweep",
      workflowType: "SubscriptionRenewal",
    },
    {
      args: [
        {
          amountCents: 50000,
          fromAccount: "treasury_main",
          toAccount: "ledger_cold",
        },
      ],
      cronExpression: "0 2 * * 1",
      notes: "Paused for Q4 ledger schema cutover",
      overlapPolicy: "SKIP" as const,
      paused: true,
      scheduleId: "weekly-ledger-export",
      taskQueue: "billing",
      workflowIdPrefix: "ledger-export",
      workflowType: "MoneyTransfer",
    },
  ];

  for (const sched of schedulesToSeed) {
    try {
      await client.createSchedule(ns, sched);
    } catch {
      // ignore if already exists
    }
  }
}

function mintLocalAdminKey(binPath: string): {
  adminKey: string;
  adminToken: string;
} | null {
  try {
    const out = execFileSync(
      binPath,
      ["admin", "token", "new", "--id", "studio-demo"],
      { encoding: "utf8" },
    );
    const tokenMatch = out.match(/^token:\s*(\S+)/m);
    const keyMatch = out.match(/^admin-key:\s*(\S+)/m);
    if (tokenMatch?.[1] && keyMatch?.[1]) {
      return { adminKey: keyMatch[1], adminToken: tokenMatch[1] };
    }
  } catch {
    // fall back to unauthenticated /readyz-only mode
  }
  return null;
}

export async function startDemoTemporalRuntime(): Promise<DemoTemporalRuntime | null> {
  const externalAddress = process.env.STUDIO_TEMPORAL_ADDRESS?.trim();
  if (externalAddress) {
    const client = new TemporalGrpcBffClient({
      address: externalAddress,
      adminToken: process.env.STUDIO_TEMPORAL_ADMIN_TOKEN,
      adminUrl: process.env.STUDIO_TEMPORAL_ADMIN_URL,
      apiKey: process.env.STUDIO_TEMPORAL_API_KEY,
      tls: process.env.STUDIO_TEMPORAL_TLS === "1",
    });
    return {
      address: externalAddress,
      adminUrl: process.env.STUDIO_TEMPORAL_ADMIN_URL,
      cleanup: () => {
        client.close();
        return Promise.resolve();
      },
      client,
    };
  }

  if (process.env.STUDIO_TEMPORAL_DISABLED === "1") {
    return null;
  }

  const binPath = findLocalTemporalNextBinary();
  if (!binPath) {
    return null;
  }

  const grpcPort = Number.parseInt(
    process.env.STUDIO_TEMPORAL_PORT ?? "17233",
    10,
  );
  const adminPort = Number.parseInt(
    process.env.STUDIO_TEMPORAL_ADMIN_PORT ?? "17243",
    10,
  );
  const address = `127.0.0.1:${grpcPort}`;
  const adminUrl = `http://127.0.0.1:${adminPort}`;
  const minted = mintLocalAdminKey(binPath);

  const serveArgs = [
    "serve",
    "--listen",
    address,
    "--admin-listen",
    `127.0.0.1:${adminPort}`,
    "--insecure-local",
    "--shards",
    "1",
    "--store",
    "memory",
    "--namespace",
    "default",
    "--namespace",
    "staging",
  ];
  if (minted) {
    serveArgs.push("--admin-key", minted.adminKey);
  }

  const child = spawn(binPath, serveArgs, { stdio: "ignore" });

  await waitForReadyz(adminUrl, child);

  const client = new TemporalGrpcBffClient({
    address,
    adminToken: minted?.adminToken,
    adminUrl,
  });
  const stopWorker = startDemoTemporalWorker(client, "default", [
    "billing",
    "default",
  ]);
  await seedDemoWorkflows(client);

  return {
    address,
    adminUrl,
    cleanup: async () => {
      stopWorker();
      client.close();
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    },
    client,
  };
}
