import * as grpc from "@grpc/grpc-js";
import * as proto from "@temporalio/proto";

import {
  buildExecutionDetail,
  decodeFailure,
  decodePayloadMap,
  decodePayloads,
  decodeTimestampIso,
  normalizeWorkflowStatus,
} from "../../data/temporal/history-grouping";
import type {
  TemporalAdmissionUpdateInput,
  TemporalBulkActionRequest,
  TemporalBulkActionResponse,
  TemporalBulkScheduleRequest,
  TemporalBulkScheduleResponse,
  TemporalCapabilities,
  TemporalClusterOverview,
  TemporalClusterShard,
  TemporalClusterTracesResponse,
  TemporalCreateScheduleInput,
  TemporalExecutionDetail,
  TemporalListSchedulesResponse,
  TemporalListWorkflowsResponse,
  TemporalNamespace,
  TemporalPatchScheduleInput,
  TemporalPendingActivity,
  TemporalPendingChildWorkflow,
  TemporalQueryResult,
  TemporalScheduleDetail,
  TemporalScheduleOverlapPolicy,
  TemporalScheduleRecentAction,
  TemporalScheduleSummary,
  TemporalStartWorkflowInput,
  TemporalStartWorkflowResult,
  TemporalTaskQueuePoller,
  TemporalTaskQueuesResponse,
  TemporalTaskQueueSummary,
  TemporalUpdateResult,
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
} from "../../data/temporal/types";

const ws = proto.temporal.api.workflowservice.v1;
const enums = proto.temporal.api.enums.v1;

const WORKFLOW_SERVICE_PREFIX =
  "/temporal.api.workflowservice.v1.WorkflowService";

export interface TemporalBffConfig {
  address: string;
  adminToken?: string;
  adminUrl?: string;
  apiKey?: string;
  tls?: boolean;
}

interface ProtoCodec<Req, Res> {
  decode: (reader: Uint8Array) => Res;
  encode: (message: Req) => { finish: () => Uint8Array };
  toObject?: (
    message: Res,
    options?: Record<string, unknown>,
  ) => Record<string, unknown>;
}

export function encodeJsonPayload(
  value: unknown,
): proto.temporal.api.common.v1.IPayload {
  return {
    data: Buffer.from(JSON.stringify(value), "utf8"),
    metadata: {
      encoding: Buffer.from("json/plain", "utf8"),
    },
  };
}

export function encodeJsonPayloads(
  values: unknown[] | undefined,
): proto.temporal.api.common.v1.IPayloads | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  return {
    payloads: values.map((v) => encodeJsonPayload(v)),
  };
}

export function encodePayloadMap(
  record: Record<string, unknown> | undefined,
): Record<string, proto.temporal.api.common.v1.IPayload> | undefined {
  if (!record || Object.keys(record).length === 0) {
    return undefined;
  }
  const fields: Record<string, proto.temporal.api.common.v1.IPayload> = {};
  for (const [k, v] of Object.entries(record)) {
    fields[k] = encodeJsonPayload(v);
  }
  return fields;
}

function toNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return Number.parseInt(val, 10) || 0;
  if (
    val &&
    typeof val === "object" &&
    "toNumber" in val &&
    typeof (val as { toNumber?: () => number }).toNumber === "function"
  ) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function normalizePendingActivityState(
  raw: unknown,
): TemporalPendingActivity["state"] {
  if (raw === 1 || raw === "PENDING_ACTIVITY_STATE_SCHEDULED")
    return "Scheduled";
  if (raw === 2 || raw === "PENDING_ACTIVITY_STATE_STARTED") return "Started";
  if (raw === 3 || raw === "PENDING_ACTIVITY_STATE_CANCEL_REQUESTED") {
    return "CancelRequested";
  }
  return "Unspecified";
}

function normalizeExecutionInfo(
  namespace: string,
  info:
    proto.temporal.api.workflow.v1.IWorkflowExecutionInfo | null | undefined,
  extras?: {
    pendingActivities?:
      proto.temporal.api.workflow.v1.IPendingActivityInfo[] | null;
    pendingChildren?:
      proto.temporal.api.workflow.v1.IPendingChildExecutionInfo[] | null;
  },
): TemporalWorkflowExecution {
  const startTime =
    decodeTimestampIso(info?.startTime) ?? new Date().toISOString();
  const closeTime = decodeTimestampIso(info?.closeTime);
  const executionTime = decodeTimestampIso(info?.executionTime);
  const startMs = Date.parse(startTime) || Date.now();
  const endMs = closeTime ? Date.parse(closeTime) : Date.now();

  const pendingActivities: TemporalPendingActivity[] | undefined =
    extras?.pendingActivities?.map((pa) => ({
      activityId: pa.activityId ?? "",
      activityType: pa.activityType?.name ?? "Activity",
      attempt: pa.attempt ?? 1,
      ...(pa.heartbeatDetails
        ? { heartbeatDetails: decodePayloads(pa.heartbeatDetails) }
        : {}),
      ...(decodeTimestampIso(pa.lastAttemptCompleteTime)
        ? {
            lastAttemptCompleteTime: decodeTimestampIso(
              pa.lastAttemptCompleteTime,
            ),
          }
        : {}),
      ...(pa.lastFailure
        ? { lastFailure: decodeFailure(pa.lastFailure as never) }
        : {}),
      ...(decodeTimestampIso(pa.lastHeartbeatTime)
        ? { lastHeartbeatTime: decodeTimestampIso(pa.lastHeartbeatTime) }
        : {}),
      ...(decodeTimestampIso(pa.lastStartedTime)
        ? { lastStartedTime: decodeTimestampIso(pa.lastStartedTime) }
        : {}),
      ...(pa.lastWorkerIdentity
        ? { lastWorkerIdentity: pa.lastWorkerIdentity }
        : {}),
      maximumAttempts: pa.maximumAttempts ?? 0,
      ...(decodeTimestampIso(pa.nextAttemptScheduleTime)
        ? {
            nextAttemptScheduleTime: decodeTimestampIso(
              pa.nextAttemptScheduleTime,
            ),
          }
        : {}),
      ...(decodeTimestampIso(pa.scheduledTime)
        ? { scheduledTime: decodeTimestampIso(pa.scheduledTime) }
        : {}),
      state: normalizePendingActivityState(pa.state),
    }));

  const pendingChildren: TemporalPendingChildWorkflow[] | undefined =
    extras?.pendingChildren?.map((pc) => ({
      initiatedId: String(toNumber(pc.initiatedId)),
      runId: pc.runId ?? "",
      workflowId: pc.workflowId ?? "",
      workflowType: pc.workflowTypeName ?? "ChildWorkflow",
    }));

  return {
    ...(closeTime ? { closeTime } : {}),
    durationMs: Math.max(0, endMs - startMs),
    ...(executionTime ? { executionTime } : {}),
    ...(info?.firstRunId ? { firstRunId: info.firstRunId } : {}),
    historyLength: toNumber(info?.historyLength),
    historySizeBytes: toNumber(info?.historySizeBytes),
    memo: decodePayloadMap(info?.memo?.fields as never),
    namespace,
    ...(info?.parentExecution?.runId
      ? { parentRunId: info.parentExecution.runId }
      : {}),
    ...(info?.parentExecution?.workflowId
      ? { parentWorkflowId: info.parentExecution.workflowId }
      : {}),
    ...(pendingActivities && pendingActivities.length > 0
      ? { pendingActivities }
      : {}),
    ...(pendingChildren && pendingChildren.length > 0
      ? { pendingChildren }
      : {}),
    ...(info?.rootExecution?.runId
      ? { rootRunId: info.rootExecution.runId }
      : {}),
    ...(info?.rootExecution?.workflowId
      ? { rootWorkflowId: info.rootExecution.workflowId }
      : {}),
    runId: info?.execution?.runId ?? "",
    searchAttributes: decodePayloadMap(
      info?.searchAttributes?.indexedFields as never,
    ),
    startTime,
    status: normalizeWorkflowStatus(info?.status),
    taskQueue: info?.taskQueue ?? "default",
    workflowId: info?.execution?.workflowId ?? "",
    workflowType: info?.type?.name ?? "Unknown",
  };
}

export class TemporalGrpcBffClient {
  #client: grpc.Client;
  #config: TemporalBffConfig;
  #capabilitiesCache: TemporalCapabilities | null = null;

  constructor(config: TemporalBffConfig) {
    this.#config = config;
    const creds = config.tls
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();
    this.#client = new grpc.Client(config.address, creds, {
      "grpc.max_receive_message_length": 64 * 1024 * 1024,
      "grpc.max_send_message_length": 16 * 1024 * 1024,
    });
  }

  close(): void {
    this.#client.close();
  }

  unary<Req, Res>(
    method: string,
    reqCodec: { encode: (msg: Req) => { finish: () => Uint8Array } },
    resCodec: Pick<ProtoCodec<Req, Res>, "decode">,
    request: Req,
    timeoutMs = 15_000,
  ): Promise<Res> {
    const metadata = new grpc.Metadata();
    if (this.#config.apiKey) {
      metadata.set("authorization", `Bearer ${this.#config.apiKey}`);
    }
    const deadline = new Date(Date.now() + timeoutMs);

    return new Promise<Res>((resolve, reject) => {
      this.#client.makeUnaryRequest(
        `${WORKFLOW_SERVICE_PREFIX}/${method}`,
        (arg: Req) => Buffer.from(reqCodec.encode(arg).finish()),
        (buf: Buffer) => resCodec.decode(new Uint8Array(buf)),
        request,
        metadata,
        { deadline },
        (err, response) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response as Res);
        },
      );
    });
  }

  async getCapabilities(): Promise<TemporalCapabilities> {
    if (this.#capabilitiesCache) {
      return this.#capabilitiesCache;
    }

    const [sysInfo, clusterInfo] = await Promise.all([
      this.unary(
        "GetSystemInfo",
        ws.GetSystemInfoRequest,
        ws.GetSystemInfoResponse,
        {},
      ).catch(() => null),
      this.unary(
        "GetClusterInfo",
        ws.GetClusterInfoRequest,
        ws.GetClusterInfoResponse,
        {},
      ).catch(() => null),
    ]);

    const persistenceStore = clusterInfo?.persistenceStore || "unknown";
    const isStn = persistenceStore.toLowerCase().includes("slatedb");

    let supportsAdminApi = false;
    if (this.#config.adminUrl) {
      try {
        const res = await fetch(`${this.#config.adminUrl}/readyz`, {
          signal: AbortSignal.timeout(1500),
        });
        supportsAdminApi = res.ok;
      } catch {
        supportsAdminApi = false;
      }
    }

    const caps: TemporalCapabilities = {
      address: this.#config.address,
      clusterName: clusterInfo?.clusterName || "active",
      persistenceStore,
      serverKind: isStn ? "slate-temporal-next" : "temporal",
      serverVersion:
        sysInfo?.serverVersion || clusterInfo?.serverVersion || "unknown",
      shardCount: clusterInfo?.historyShardCount ?? 1,
      supportsAdminApi,
      supportsCountGroupByStatus: Boolean(
        sysInfo?.capabilities?.countGroupByExecutionStatus ?? true,
      ),
      supportsDescribeTaskQueue: !isStn,
      supportsNativeBatch: !isStn,
      supportsReset: !isStn,
      supportsSchedules: true,
    };
    this.#capabilitiesCache = caps;
    return caps;
  }

  async listNamespaces(): Promise<TemporalNamespace[]> {
    try {
      const res = await this.unary(
        "ListNamespaces",
        ws.ListNamespacesRequest,
        ws.ListNamespacesResponse,
        { pageSize: 100 },
      );
      const list = (res.namespaces ?? [])
        .map((entry): TemporalNamespace | null => {
          const name = entry.namespaceInfo?.name;
          if (!name) return null;
          const retentionSec = toNumber(
            entry.config?.workflowExecutionRetentionTtl?.seconds,
          );
          return {
            ...(entry.namespaceInfo?.description
              ? { description: entry.namespaceInfo.description }
              : {}),
            id: entry.namespaceInfo?.id ?? name,
            name,
            ...(retentionSec > 0
              ? { retentionDays: Math.round(retentionSec / 86_400) }
              : {}),
            state: String(entry.namespaceInfo?.state ?? "Registered"),
          };
        })
        .filter((x): x is TemporalNamespace => x !== null);

      return list.length > 0
        ? list
        : [{ id: "default", name: "default", state: "Registered" }];
    } catch {
      return [{ id: "default", name: "default", state: "Registered" }];
    }
  }

  async listWorkflows(args: {
    namespace: string;
    nextPageToken?: string;
    pageSize?: number;
    query?: string;
  }): Promise<TemporalListWorkflowsResponse> {
    const { namespace, query = "", pageSize = 50, nextPageToken } = args;
    const countQuery = query.trim()
      ? `${query.trim()} GROUP BY ExecutionStatus`
      : "GROUP BY ExecutionStatus";

    const [listRes, countRes] = await Promise.all([
      this.unary(
        "ListWorkflowExecutions",
        ws.ListWorkflowExecutionsRequest,
        ws.ListWorkflowExecutionsResponse,
        {
          namespace,
          nextPageToken: nextPageToken
            ? Buffer.from(nextPageToken, "base64")
            : undefined,
          pageSize,
          query,
        },
      ),
      this.unary(
        "CountWorkflowExecutions",
        ws.CountWorkflowExecutionsRequest,
        ws.CountWorkflowExecutionsResponse,
        {
          namespace,
          query: countQuery,
        },
      ).catch(() => null),
    ]);

    const executions = (listRes.executions ?? []).map((info) =>
      normalizeExecutionInfo(namespace, info),
    );

    const countsByStatus: Partial<Record<TemporalWorkflowStatus, number>> = {};
    let totalCount = executions.length;

    if (countRes) {
      totalCount = toNumber(countRes.count);
      for (const group of countRes.groups ?? []) {
        const val = group.groupValues?.[0];
        const decoded = decodePayloads(
          val ? { payloads: [val as never] } : undefined,
        );
        const status = normalizeWorkflowStatus(decoded);
        countsByStatus[status] = toNumber(group.count);
      }
    } else {
      for (const exec of executions) {
        countsByStatus[exec.status] = (countsByStatus[exec.status] ?? 0) + 1;
      }
    }

    return {
      countsByStatus,
      executions,
      ...(listRes.nextPageToken && listRes.nextPageToken.length > 0
        ? {
            nextPageToken: Buffer.from(listRes.nextPageToken).toString(
              "base64",
            ),
          }
        : {}),
      totalCount,
    };
  }

  async getWorkflowDetail(args: {
    namespace: string;
    runId?: string;
    workflowId: string;
  }): Promise<TemporalExecutionDetail> {
    const { namespace, workflowId, runId } = args;
    const executionRef = {
      ...(runId ? { runId } : {}),
      workflowId,
    };

    const describeRes = await this.unary(
      "DescribeWorkflowExecution",
      ws.DescribeWorkflowExecutionRequest,
      ws.DescribeWorkflowExecutionResponse,
      {
        execution: executionRef,
        namespace,
      },
    );

    const execution = normalizeExecutionInfo(
      namespace,
      describeRes.workflowExecutionInfo,
      {
        pendingActivities: describeRes.pendingActivities,
        pendingChildren: describeRes.pendingChildren,
      },
    );

    // Fetch up to 2,000 history events across pages (safe for browser payload size)
    const rawEvents: Record<string, unknown>[] = [];
    let nextPageToken: Uint8Array | undefined;
    for (let page = 0; page < 10; page += 1) {
      const histRes = await this.unary(
        "GetWorkflowExecutionHistory",
        ws.GetWorkflowExecutionHistoryRequest,
        ws.GetWorkflowExecutionHistoryResponse,
        {
          execution: {
            runId: execution.runId || runId,
            workflowId,
          },
          maximumPageSize: 200,
          namespace,
          nextPageToken,
        },
      );
      const events = histRes.history?.events ?? [];
      for (const evt of events) {
        const obj = proto.temporal.api.history.v1.HistoryEvent.toObject(
          proto.temporal.api.history.v1.HistoryEvent.create(evt),
          {
            bytes: Buffer,
            defaults: false,
            enums: String,
            longs: Number,
          },
        ) as Record<string, unknown>;
        rawEvents.push(obj);
      }
      if (!histRes.nextPageToken || histRes.nextPageToken.length === 0) {
        break;
      }
      nextPageToken = histRes.nextPageToken;
    }

    return buildExecutionDetail({ execution, rawEvents });
  }

  async startWorkflow(
    namespace: string,
    input: TemporalStartWorkflowInput,
  ): Promise<TemporalStartWorkflowResult> {
    const reuseMap: Record<string, number> = {
      ALLOW_DUPLICATE:
        enums.WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE,
      ALLOW_DUPLICATE_FAILED_ONLY:
        enums.WorkflowIdReusePolicy
          .WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE_FAILED_ONLY,
      REJECT_DUPLICATE:
        enums.WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE,
      TERMINATE_IF_RUNNING:
        enums.WorkflowIdReusePolicy
          .WORKFLOW_ID_REUSE_POLICY_TERMINATE_IF_RUNNING,
    };

    const requestId = crypto.randomUUID();
    const baseReq = {
      identity: "prisma-studio",
      input: encodeJsonPayloads(input.args),
      memo: input.memo ? { fields: encodePayloadMap(input.memo) } : undefined,
      namespace,
      requestId,
      taskQueue: { name: input.taskQueue },
      ...(input.workflowExecutionTimeoutSeconds
        ? {
            workflowExecutionTimeout: proto.google.protobuf.Duration.fromObject(
              {
                seconds: input.workflowExecutionTimeoutSeconds,
              },
            ),
          }
        : {}),
      workflowId: input.workflowId,
      workflowIdReusePolicy:
        reuseMap[input.idReusePolicy ?? "ALLOW_DUPLICATE"] ??
        enums.WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE,
      ...(input.workflowRunTimeoutSeconds
        ? {
            workflowRunTimeout: proto.google.protobuf.Duration.fromObject({
              seconds: input.workflowRunTimeoutSeconds,
            }),
          }
        : {}),
      workflowType: { name: input.workflowType },
    };

    if (input.signalName && input.signalName.trim().length > 0) {
      const res = await this.unary(
        "SignalWithStartWorkflowExecution",
        ws.SignalWithStartWorkflowExecutionRequest,
        ws.SignalWithStartWorkflowExecutionResponse,
        {
          ...baseReq,
          signalInput: encodeJsonPayloads(input.signalArgs),
          signalName: input.signalName.trim(),
        },
      );
      return { runId: res.runId, workflowId: input.workflowId };
    }

    const res = await this.unary(
      "StartWorkflowExecution",
      ws.StartWorkflowExecutionRequest,
      ws.StartWorkflowExecutionResponse,
      baseReq,
    );
    return { runId: res.runId, workflowId: input.workflowId };
  }

  async queryWorkflow(args: {
    args?: unknown[];
    namespace: string;
    queryType: string;
    runId?: string;
    workflowId: string;
  }): Promise<TemporalQueryResult> {
    const t0 = performance.now();
    const res = await this.unary(
      "QueryWorkflow",
      ws.QueryWorkflowRequest,
      ws.QueryWorkflowResponse,
      {
        execution: {
          ...(args.runId ? { runId: args.runId } : {}),
          workflowId: args.workflowId,
        },
        namespace: args.namespace,
        query: {
          queryArgs: encodeJsonPayloads(args.args),
          queryType: args.queryType,
        },
      },
      10_000,
    );

    const durationMs = Math.round(performance.now() - t0);
    if (res.queryRejected) {
      return {
        durationMs,
        rejected: true,
        rejectedStatus: normalizeWorkflowStatus(res.queryRejected.status),
        result: null,
      };
    }

    return {
      durationMs,
      result: decodePayloads(res.queryResult as never),
    };
  }

  async signalWorkflow(args: {
    args?: unknown[];
    namespace: string;
    runId?: string;
    signalName: string;
    workflowId: string;
  }): Promise<{ ok: true }> {
    await this.unary(
      "SignalWorkflowExecution",
      ws.SignalWorkflowExecutionRequest,
      ws.SignalWorkflowExecutionResponse,
      {
        identity: "prisma-studio",
        input: encodeJsonPayloads(args.args),
        namespace: args.namespace,
        requestId: crypto.randomUUID(),
        signalName: args.signalName,
        workflowExecution: {
          ...(args.runId ? { runId: args.runId } : {}),
          workflowId: args.workflowId,
        },
      },
    );
    return { ok: true };
  }

  async updateWorkflow(args: {
    args?: unknown[];
    namespace: string;
    runId?: string;
    updateName: string;
    workflowId: string;
  }): Promise<TemporalUpdateResult> {
    const t0 = performance.now();
    const updateId = `studio-${crypto.randomUUID().slice(0, 8)}`;
    const res = await this.unary(
      "UpdateWorkflowExecution",
      ws.UpdateWorkflowExecutionRequest,
      ws.UpdateWorkflowExecutionResponse,
      {
        namespace: args.namespace,
        request: {
          input: {
            args: encodeJsonPayloads(args.args),
            name: args.updateName,
          },
          meta: {
            identity: "prisma-studio",
            updateId,
          },
        },
        waitPolicy: {
          lifecycleStage:
            enums.UpdateWorkflowExecutionLifecycleStage
              .UPDATE_WORKFLOW_EXECUTION_LIFECYCLE_STAGE_COMPLETED,
        },
        workflowExecution: {
          ...(args.runId ? { runId: args.runId } : {}),
          workflowId: args.workflowId,
        },
      },
      15_000,
    );

    const durationMs = Math.round(performance.now() - t0);
    if (res.outcome?.failure) {
      return {
        durationMs,
        failure: decodeFailure(res.outcome.failure as never),
        outcome: "rejected",
        updateId: res.updateRef?.updateId || updateId,
      };
    }

    if (res.outcome?.success) {
      return {
        durationMs,
        outcome: "completed",
        result: decodePayloads(res.outcome.success as never),
        updateId: res.updateRef?.updateId || updateId,
      };
    }

    return {
      durationMs,
      outcome: "accepted",
      updateId: res.updateRef?.updateId || updateId,
    };
  }

  async cancelWorkflow(args: {
    namespace: string;
    reason?: string;
    runId?: string;
    workflowId: string;
  }): Promise<{ ok: true }> {
    await this.unary(
      "RequestCancelWorkflowExecution",
      ws.RequestCancelWorkflowExecutionRequest,
      ws.RequestCancelWorkflowExecutionResponse,
      {
        identity: "prisma-studio",
        namespace: args.namespace,
        reason: args.reason || "Canceled via Prisma Studio",
        requestId: crypto.randomUUID(),
        workflowExecution: {
          ...(args.runId ? { runId: args.runId } : {}),
          workflowId: args.workflowId,
        },
      },
    );
    return { ok: true };
  }

  async terminateWorkflow(args: {
    namespace: string;
    reason?: string;
    runId?: string;
    workflowId: string;
  }): Promise<{ ok: true }> {
    await this.unary(
      "TerminateWorkflowExecution",
      ws.TerminateWorkflowExecutionRequest,
      ws.TerminateWorkflowExecutionResponse,
      {
        identity: "prisma-studio",
        namespace: args.namespace,
        reason: args.reason || "Terminated via Prisma Studio",
        workflowExecution: {
          ...(args.runId ? { runId: args.runId } : {}),
          workflowId: args.workflowId,
        },
      },
    );
    return { ok: true };
  }

  async bulkAction(
    namespace: string,
    req: TemporalBulkActionRequest,
  ): Promise<TemporalBulkActionResponse> {
    const results: TemporalBulkActionResponse["results"] = [];
    const concurrency = 6;
    let index = 0;

    const runWorker = async () => {
      while (index < req.items.length) {
        const item = req.items[index++]!;
        try {
          if (req.action === "cancel") {
            await this.cancelWorkflow({
              namespace,
              reason: req.reason,
              runId: item.runId,
              workflowId: item.workflowId,
            });
          } else if (req.action === "terminate") {
            await this.terminateWorkflow({
              namespace,
              reason: req.reason,
              runId: item.runId,
              workflowId: item.workflowId,
            });
          } else if (req.action === "signal") {
            if (!req.signalName) {
              throw new Error("signalName is required for bulk signal");
            }
            await this.signalWorkflow({
              args: req.signalArgs,
              namespace,
              runId: item.runId,
              signalName: req.signalName,
              workflowId: item.workflowId,
            });
          }
          results.push({
            ok: true,
            runId: item.runId,
            workflowId: item.workflowId,
          });
        } catch (err) {
          results.push({
            error: formatGrpcError(err),
            ok: false,
            runId: item.runId,
            workflowId: item.workflowId,
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, req.items.length) }, () =>
        runWorker(),
      ),
    );

    const succeeded = results.filter((r) => r.ok).length;
    return {
      action: req.action,
      failed: results.length - succeeded,
      results,
      succeeded,
    };
  }

  async resetStickyTaskQueue(args: {
    namespace: string;
    runId?: string;
    workflowId: string;
  }): Promise<{ ok: true }> {
    await this.unary(
      "ResetStickyTaskQueue",
      ws.ResetStickyTaskQueueRequest,
      ws.ResetStickyTaskQueueResponse,
      {
        execution: {
          ...(args.runId ? { runId: args.runId } : {}),
          workflowId: args.workflowId,
        },
        namespace: args.namespace,
      },
    );
    return { ok: true };
  }

  // ---------- Phase 2: Schedules ----------

  async listSchedules(
    namespace: string,
  ): Promise<TemporalListSchedulesResponse> {
    const res = await this.unary(
      "ListSchedules",
      ws.ListSchedulesRequest,
      ws.ListSchedulesResponse,
      {
        maximumPageSize: 100,
        namespace,
      },
    );

    const entries = res.schedules ?? [];
    const summaries: TemporalScheduleSummary[] = [];

    for (const entry of entries) {
      const scheduleId = entry.scheduleId || "";
      if (!scheduleId) continue;

      try {
        const desc = await this.unary(
          "DescribeSchedule",
          ws.DescribeScheduleRequest,
          ws.DescribeScheduleResponse,
          { namespace, scheduleId },
        );
        summaries.push(mapScheduleSummary(scheduleId, desc));
      } catch {
        const info = entry.info;
        summaries.push({
          actionCount: 0,
          cadenceSummary: formatScheduleSpecSummary(info?.spec),
          missedCatchupWindow: 0,
          nextActionTimes: (info?.futureActionTimes ?? [])
            .map((t) => decodeTimestampIso(t as never))
            .filter((s): s is string => typeof s === "string" && s.length > 0),
          notes: info?.notes || undefined,
          overlapPolicy: "SKIP",
          overlapSkipped: 0,
          paused: Boolean(info?.paused),
          recentActions: (info?.recentActions ?? []).map((a) => ({
            actualTime: decodeTimestampIso(a.actualTime as never) || undefined,
            runId: a.startWorkflowResult?.runId || undefined,
            scheduleTime:
              decodeTimestampIso(a.scheduleTime as never) || undefined,
            workflowId: a.startWorkflowResult?.workflowId || undefined,
          })),
          runningWorkflows: [],
          scheduleId,
          taskQueue: "default",
          workflowType: info?.workflowType?.name || "Unknown",
        });
      }
    }

    return {
      nextPageToken:
        res.nextPageToken && res.nextPageToken.length > 0
          ? Buffer.from(res.nextPageToken).toString("base64")
          : undefined,
      schedules: summaries.sort((a, b) =>
        a.scheduleId.localeCompare(b.scheduleId),
      ),
    };
  }

  async getScheduleDetail(
    namespace: string,
    scheduleId: string,
  ): Promise<TemporalScheduleDetail> {
    const desc = await this.unary(
      "DescribeSchedule",
      ws.DescribeScheduleRequest,
      ws.DescribeScheduleResponse,
      { namespace, scheduleId },
    );

    const summary = mapScheduleSummary(scheduleId, desc);
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    let matchingTimes = summary.nextActionTimes;
    try {
      const times = await this.listScheduleMatchingTimes({
        endTime: horizon.toISOString(),
        namespace,
        scheduleId,
        startTime: now.toISOString(),
      });
      if (times.length > 0) {
        matchingTimes = times.slice(0, 12);
      }
    } catch {
      // fall back to futureActionTimes from DescribeSchedule
    }

    const policies = desc.schedule?.policies;
    const spec = desc.schedule?.spec;
    return {
      ...summary,
      catchupWindowSeconds: decodeDurationSeconds(
        policies?.catchupWindow as never,
      ),
      jitterSeconds: decodeDurationSeconds(spec?.jitter as never),
      matchingTimes,
      memo: decodePayloadMap(desc.memo?.fields as never),
    };
  }

  async listScheduleMatchingTimes(args: {
    endTime: string;
    namespace: string;
    scheduleId: string;
    startTime: string;
  }): Promise<string[]> {
    const startMs = Date.parse(args.startTime);
    const endMs = Date.parse(args.endTime);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs
    ) {
      throw new Error("Invalid startTime/endTime range");
    }

    const res = await this.unary(
      "ListScheduleMatchingTimes",
      ws.ListScheduleMatchingTimesRequest,
      ws.ListScheduleMatchingTimesResponse,
      {
        endTime: proto.google.protobuf.Timestamp.fromObject({
          nanos: (endMs % 1000) * 1_000_000,
          seconds: Math.floor(endMs / 1000),
        }),
        namespace: args.namespace,
        scheduleId: args.scheduleId,
        startTime: proto.google.protobuf.Timestamp.fromObject({
          nanos: (startMs % 1000) * 1_000_000,
          seconds: Math.floor(startMs / 1000),
        }),
      },
    );

    return (res.startTime ?? [])
      .map((t) => decodeTimestampIso(t as never))
      .filter((s): s is string => typeof s === "string" && s.length > 0);
  }

  async createSchedule(
    namespace: string,
    input: TemporalCreateScheduleInput,
  ): Promise<{ ok: true; scheduleId: string }> {
    const spec: proto.temporal.api.schedule.v1.IScheduleSpec = {};
    if (input.cronExpression && input.cronExpression.trim().length > 0) {
      spec.cronString = [input.cronExpression.trim()];
    } else {
      const intervalSec = Math.max(10, input.intervalSeconds ?? 300);
      spec.interval = [
        {
          interval: proto.google.protobuf.Duration.fromObject({
            seconds: intervalSec,
          }),
        },
      ];
    }
    if (input.jitterSeconds && input.jitterSeconds > 0) {
      spec.jitter = proto.google.protobuf.Duration.fromObject({
        seconds: input.jitterSeconds,
      });
    }

    await this.unary(
      "CreateSchedule",
      ws.CreateScheduleRequest,
      ws.CreateScheduleResponse,
      {
        identity: "prisma-studio",
        namespace,
        requestId: crypto.randomUUID(),
        schedule: {
          action: {
            startWorkflow: {
              input: encodeJsonPayloads(input.args ?? []),
              taskQueue: { name: input.taskQueue },
              workflowId: input.workflowIdPrefix || input.scheduleId,
              workflowType: { name: input.workflowType },
            },
          },
          policies: {
            ...(input.catchupWindowSeconds
              ? {
                  catchupWindow: proto.google.protobuf.Duration.fromObject({
                    seconds: input.catchupWindowSeconds,
                  }),
                }
              : {}),
            overlapPolicy: overlapPolicyToEnum(input.overlapPolicy ?? "SKIP"),
          },
          spec,
          state: {
            notes: input.notes || "",
            paused: Boolean(input.paused),
          },
        },
        scheduleId: input.scheduleId,
      },
    );

    return { ok: true, scheduleId: input.scheduleId };
  }

  async patchSchedule(
    namespace: string,
    scheduleId: string,
    input: TemporalPatchScheduleInput,
  ): Promise<{ ok: true }> {
    const patch: proto.temporal.api.schedule.v1.ISchedulePatch = {};
    if (input.action === "pause") {
      patch.pause = input.note || "Paused via Prisma Studio";
    } else if (input.action === "unpause") {
      patch.unpause = input.note || "Unpaused via Prisma Studio";
    } else if (input.action === "trigger") {
      patch.triggerImmediately = {
        overlapPolicy: overlapPolicyToEnum(input.overlapPolicy ?? "ALLOW_ALL"),
      };
    } else if (input.action === "backfill") {
      const startMs = Date.parse(input.backfillStartTime ?? "");
      const endMs = Date.parse(input.backfillEndTime ?? "");
      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        endMs <= startMs
      ) {
        throw new Error("Backfill requires valid start and end timestamps");
      }
      patch.backfillRequest = [
        {
          endTime: proto.google.protobuf.Timestamp.fromObject({
            nanos: (endMs % 1000) * 1_000_000,
            seconds: Math.floor(endMs / 1000),
          }),
          overlapPolicy: overlapPolicyToEnum(
            input.overlapPolicy ?? "ALLOW_ALL",
          ),
          startTime: proto.google.protobuf.Timestamp.fromObject({
            nanos: (startMs % 1000) * 1_000_000,
            seconds: Math.floor(startMs / 1000),
          }),
        },
      ];
    }

    await this.unary(
      "PatchSchedule",
      ws.PatchScheduleRequest,
      ws.PatchScheduleResponse,
      {
        identity: "prisma-studio",
        namespace,
        patch,
        requestId: crypto.randomUUID(),
        scheduleId,
      },
    );

    return { ok: true };
  }

  async deleteSchedule(
    namespace: string,
    scheduleId: string,
  ): Promise<{ ok: true }> {
    await this.unary(
      "DeleteSchedule",
      ws.DeleteScheduleRequest,
      ws.DeleteScheduleResponse,
      {
        identity: "prisma-studio",
        namespace,
        scheduleId,
      },
    );
    return { ok: true };
  }

  async bulkScheduleAction(
    namespace: string,
    req: TemporalBulkScheduleRequest,
  ): Promise<TemporalBulkScheduleResponse> {
    const results: TemporalBulkScheduleResponse["results"] = [];
    for (const scheduleId of req.scheduleIds) {
      try {
        if (req.action === "delete") {
          await this.deleteSchedule(namespace, scheduleId);
        } else {
          await this.patchSchedule(namespace, scheduleId, {
            action: req.action,
            note: req.note,
          });
        }
        results.push({ ok: true, scheduleId });
      } catch (err) {
        results.push({
          error: formatGrpcError(err),
          ok: false,
          scheduleId,
        });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    return {
      action: req.action,
      failed: results.length - succeeded,
      results,
      succeeded,
    };
  }

  // ---------- Phase 2: Task Queues (Dual-Target) ----------

  async listTaskQueues(namespace: string): Promise<TemporalTaskQueuesResponse> {
    const wfList = await this.listWorkflows({
      namespace,
      pageSize: 100,
      query: "",
    });
    const scheduleList = await this.listSchedules(namespace).catch(() => ({
      schedules: [],
    }));

    const queueMap = new Map<string, TemporalTaskQueueSummary>();
    const ensureQueue = (name: string): TemporalTaskQueueSummary => {
      let existing = queueMap.get(name);
      if (!existing) {
        existing = {
          activeWorkflowCount: 0,
          failedWorkflowCount: 0,
          health: "idle",
          name,
          pendingBacklogCount: 0,
          pollers: [],
          retryingWorkflowCount: 0,
          scheduleCount: 0,
          totalWorkflowCount: 0,
          workflows: [],
        };
        queueMap.set(name, existing);
      }
      return existing;
    };

    for (const sched of scheduleList.schedules) {
      ensureQueue(sched.taskQueue || "default").scheduleCount += 1;
    }

    // Enrich running workflows with DescribeWorkflowExecution to detect retrying activities
    const retryingWfIds = new Set<string>();
    for (const exec of wfList.executions) {
      const q = ensureQueue(exec.taskQueue || "default");
      q.totalWorkflowCount += 1;
      if (exec.status === "Running") {
        q.activeWorkflowCount += 1;
        try {
          const desc = await this.unary(
            "DescribeWorkflowExecution",
            ws.DescribeWorkflowExecutionRequest,
            ws.DescribeWorkflowExecutionResponse,
            {
              execution: { runId: exec.runId, workflowId: exec.workflowId },
              namespace,
            },
          );
          if ((desc.pendingActivities ?? []).some((pa) => pa.lastFailure)) {
            retryingWfIds.add(exec.workflowId);
            q.retryingWorkflowCount += 1;
          }
        } catch {
          // ignore
        }
      } else if (exec.status === "Failed") {
        q.failedWorkflowCount += 1;
      }

      if (
        !q.lastActivityTime ||
        Date.parse(exec.startTime) > Date.parse(q.lastActivityTime)
      ) {
        q.lastActivityTime = exec.startTime;
      }

      q.workflows.push({
        hasRetryingActivity: retryingWfIds.has(exec.workflowId),
        runId: exec.runId,
        startTime: exec.startTime,
        status: exec.status,
        workflowId: exec.workflowId,
        workflowType: exec.workflowType,
      });
    }

    if (queueMap.size === 0) {
      ensureQueue("default");
    }

    let source: TemporalTaskQueuesResponse["source"] = "synthesized";
    for (const q of queueMap.values()) {
      try {
        const desc = await this.unary(
          "DescribeTaskQueue",
          ws.DescribeTaskQueueRequest,
          ws.DescribeTaskQueueResponse,
          {
            includeTaskQueueStatus: true,
            namespace,
            taskQueue: {
              kind: enums.TaskQueueKind.TASK_QUEUE_KIND_NORMAL,
              name: q.name,
            },
            taskQueueType: enums.TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW,
          },
        );
        source = "describe-task-queue";
        q.pollers = (desc.pollers ?? []).map<TemporalTaskQueuePoller>((p) => ({
          identity: p.identity || "worker",
          lastAccessTime:
            decodeTimestampIso(p.lastAccessTime as never) || undefined,
          ratePerSecond: p.ratePerSecond || undefined,
        }));
        q.pendingBacklogCount = Number(
          desc.taskQueueStatus?.backlogCountHint ?? 0,
        );
      } catch {
        // UNIMPLEMENTED on slate-temporal-next -> synthesized mode
        break;
      }
    }

    let matcherOldestReadyMs: number | undefined;
    if (this.#config.adminUrl) {
      try {
        const load = await this.adminFetch<Record<string, unknown>>("/v1/load");
        const hint = load.worker_hint as
          { matcher_oldest_ready_ms?: number } | undefined;
        if (typeof hint?.matcher_oldest_ready_ms === "number") {
          matcherOldestReadyMs = hint.matcher_oldest_ready_ms;
        }
      } catch {
        // ignore if admin unconfigured
      }
    }

    for (const q of queueMap.values()) {
      if (source === "describe-task-queue") {
        if (q.activeWorkflowCount > 0 && q.pollers.length === 0) {
          q.health = "stalled";
        } else if (q.pendingBacklogCount > 10) {
          q.health = "backlogged";
        } else if (q.retryingWorkflowCount > 0) {
          q.health = "retrying";
        } else if (q.pollers.length > 0 || q.activeWorkflowCount > 0) {
          q.health = "healthy";
        } else {
          q.health = "idle";
        }
      } else {
        if (
          q.activeWorkflowCount > 0 &&
          typeof matcherOldestReadyMs === "number" &&
          matcherOldestReadyMs > 20_000
        ) {
          q.health = "stalled";
        } else if (q.retryingWorkflowCount > 0) {
          q.health = "retrying";
        } else if (q.activeWorkflowCount > 0 || q.scheduleCount > 0) {
          q.health = "healthy";
        } else {
          q.health = "idle";
        }
      }
    }

    return {
      matcherOldestReadyMs,
      queues: Array.from(queueMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      source,
    };
  }

  // ---------- Phase 3: slate-temporal-next Admin HTTP Proxy ----------

  async adminFetch<T>(
    adminPath: string,
    init?: { body?: unknown; method?: string },
  ): Promise<T> {
    if (!this.#config.adminUrl) {
      throw Object.assign(
        new Error("slate-temporal-next Admin HTTP is not configured"),
        { httpStatus: 501 },
      );
    }

    const base = this.#config.adminUrl.replace(/\/+$/, "");
    const headers: Record<string, string> = {};
    if (this.#config.adminToken) {
      headers.authorization = `Bearer ${this.#config.adminToken}`;
    }
    if (init?.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const res = await fetch(`${base}${adminPath}`, {
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      headers,
      method: init?.method ?? "GET",
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }

    if (!res.ok) {
      const msg =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error?: unknown }).error)
          : `Admin API returned HTTP ${res.status}`;
      throw Object.assign(new Error(msg), { httpStatus: res.status });
    }

    return (parsed ?? {}) as T;
  }

  async getClusterOverview(window = "10s"): Promise<TemporalClusterOverview> {
    const safeWindow = ["10s", "60s", "1m", "5m", "1h"].includes(window)
      ? window
      : "10s";

    const [readyz, infoRaw, storageRaw, loadRaw, cellRaw, placementRaw] =
      await Promise.all([
        this.adminFetch<{
          phase?: string;
          ready?: boolean;
          subsystems?: Record<string, string>;
        }>("/readyz"),
        this.adminFetch<Record<string, unknown>>("/v1/info"),
        this.adminFetch<Record<string, unknown>>("/v1/storage"),
        this.adminFetch<Record<string, unknown>>(
          `/v1/load?windows=${encodeURIComponent(safeWindow)}`,
        ),
        this.adminFetch<Record<string, unknown>>("/v1/cell").catch(() => null),
        this.adminFetch<Record<string, unknown>>("/v1/placement").catch(
          () => null,
        ),
      ]);

    const auth = (infoRaw.auth ?? {}) as Record<string, unknown>;
    const grpcInfo = (infoRaw.grpc ?? {}) as Record<string, unknown>;
    const store = (infoRaw.store ?? {}) as Record<string, unknown>;
    const temporalApi = (infoRaw.temporal_api ?? {}) as Record<string, unknown>;

    const storageShards = Array.isArray(storageRaw.shards)
      ? (storageRaw.shards as Array<Record<string, unknown>>)
      : [];
    const storageByShard = new Map<number, Record<string, unknown>>();
    for (const s of storageShards) {
      if (typeof s.shard === "number") {
        storageByShard.set(s.shard, s);
      }
    }

    const loadShards = Array.isArray(loadRaw.shards)
      ? (loadRaw.shards as Array<Record<string, unknown>>)
      : [];

    const shards: TemporalClusterShard[] = loadShards.map((s) => {
      const id = Number(s.id ?? 0);
      const adm = (s.admission ?? {}) as Record<string, unknown>;
      const admMode = (adm.mode ?? {}) as Record<string, unknown>;
      const delay = (s.delay_ms ?? {}) as Record<string, unknown>;
      const progress = (delay.progress ?? {}) as Record<string, unknown>;
      const rates = (s.rates_per_s ?? {}) as Record<string, unknown>;
      const st = (s.storage ?? {}) as Record<string, unknown>;
      const util = (s.util ?? {}) as Record<string, unknown>;
      const committerBusy = (util.committer_busy ?? {}) as Record<
        string,
        unknown
      >;
      const extraStorage = storageByShard.get(id);
      const compactionObj = (extraStorage?.compaction ?? {}) as Record<
        string,
        unknown
      >;

      return {
        admissionMode: {
          batch: String(admMode.batch ?? "open"),
          existing: String(admMode.existing ?? "open"),
          new: String(admMode.new ?? "open"),
        },
        backlog: Boolean(adm.backlog),
        closedBy: typeof adm.closed_by === "string" ? adm.closed_by : undefined,
        committerBusy: Number(
          committerBusy["10s"] ?? committerBusy["60s"] ?? 0,
        ),
        compactionState: String(st.compaction ?? compactionObj.state ?? "idle"),
        durableSeq: Number(s.durable_seq ?? 0),
        effectLagMs: Number(delay.effect_lag ?? 0),
        generation: Number(s.generation ?? 0),
        health: String(s.health ?? "ok"),
        historyEventsPerS: Number(rates.history_events ?? 0),
        homeEntries: Number(s.home_entries ?? 0),
        hot: Boolean(s.hot),
        id,
        l0Ssts: Number(st.l0_ssts ?? extraStorage?.l0_ssts ?? 0),
        lifecycle: String(s.lifecycle ?? "serving"),
        of: Number(s.of ?? 1),
        placementVersion: Number(s.placement_version ?? 1),
        progressDelayMs: Number(progress.last ?? 0),
        rateLimitPerS:
          typeof adm.rate_limit_per_s === "number"
            ? adm.rate_limit_per_s
            : null,
        retentionLagS: Number(delay.retention_lag_s ?? 0),
        runsClosedPerS: Number(rates.runs_closed ?? 0),
        runsOpenedPerS: Number(rates.runs_opened ?? 0),
        storageBytes: Number(st.bytes ?? extraStorage?.active_bytes ?? 0),
        timerLagMs: Number(delay.timer_lag ?? 0),
        unflushedBytes: Number(st.unflushed_bytes ?? 0),
        walPutsPerS: Number(rates.wal_puts ?? 0),
      };
    });

    const dimsObj = (loadRaw.dims ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const dims = Object.entries(dimsObj).map(([name, val]) => {
      const hr = (val.headroom ?? {}) as Record<string, unknown>;
      return {
        capacity: typeof val.capacity === "number" ? val.capacity : null,
        headroom10s: typeof hr["10s"] === "number" ? hr["10s"] : undefined,
        name,
        unit: String(val.unit ?? "count"),
        usage: Number(val.usage ?? 0),
      };
    });

    const headroomRaw = (loadRaw.headroom ?? {}) as Record<string, unknown>;
    const headroomOverall = (headroomRaw.overall ?? {}) as Record<
      string,
      unknown
    >;
    const healthRaw = (loadRaw.health ?? {}) as Record<string, unknown>;
    const memoryRaw = (loadRaw.memory ?? {}) as Record<string, unknown>;
    const workerHintRaw = (loadRaw.worker_hint ?? {}) as Record<
      string,
      unknown
    >;

    return {
      admissionAvailable: true,
      cell: cellRaw,
      dims,
      headroom: {
        binding: String(headroomRaw.binding ?? "cpu"),
        overall10s:
          typeof headroomOverall["10s"] === "number"
            ? headroomOverall["10s"]
            : undefined,
        overall60s:
          typeof headroomOverall["60s"] === "number"
            ? headroomOverall["60s"]
            : undefined,
      },
      health: {
        reasons: Array.isArray(healthRaw.reasons)
          ? healthRaw.reasons.map(String)
          : [],
        state: String(healthRaw.state ?? "ok"),
      },
      info: {
        authMode: String(auth.mode ?? "unknown"),
        listen: String(grpcInfo.listen ?? this.#config.address),
        namespaces: Number(auth.namespaces ?? 1),
        phase: String(infoRaw.phase ?? readyz.phase ?? "serving"),
        placementVersion: Number(infoRaw.placement_version ?? 1),
        projects: Number(auth.projects ?? 1),
        revision: String(infoRaw.revision ?? "").slice(0, 12),
        schemaVersion: Number(infoRaw.schema_version ?? 0),
        shardCount: Number(infoRaw.shard_count ?? shards.length),
        slatedbRev: String(infoRaw.slatedb_rev ?? "").slice(0, 12),
        storeKind: String(store.kind ?? "memory"),
        temporalApiRelease: String(temporalApi.release ?? "unknown"),
        tlsEnabled: Boolean(grpcInfo.tls),
        uptimeSeconds: Number(infoRaw.uptime_seconds ?? 0),
        version: String(infoRaw.version ?? "0.1.0"),
      },
      memory: {
        budgetBytes:
          typeof memoryRaw.budget_bytes === "number"
            ? memoryRaw.budget_bytes
            : null,
        projectedBytes:
          typeof memoryRaw.projected_bytes === "number"
            ? memoryRaw.projected_bytes
            : null,
        rssBytes:
          typeof memoryRaw.rss_bytes === "number" ? memoryRaw.rss_bytes : null,
      },
      placement: placementRaw,
      readyz: {
        phase: String(readyz.phase ?? "serving"),
        ready: Boolean(readyz.ready),
        subsystems: readyz.subsystems ?? {},
      },
      shards,
      storageActiveBytes: Number(storageRaw.active_bytes ?? 0),
      window: safeWindow,
      workerHint: {
        matcherOldestReadyMs: Number(
          workerHintRaw.matcher_oldest_ready_ms ?? 0,
        ),
      },
    };
  }

  async getClusterTraces(
    drain = false,
  ): Promise<TemporalClusterTracesResponse> {
    const raw = await this.adminFetch<Record<string, unknown>>(
      `/v1/traces?drain=${drain ? "true" : "false"}`,
    );
    return {
      capacity: Number(raw.capacity ?? 4096),
      dropped: Number(raw.dropped ?? 0),
      droppedEvents: Number(raw.dropped_events ?? 0),
      sample: raw.sample ?? null,
      traces: Array.isArray(raw.traces)
        ? (raw.traces as Array<Record<string, unknown>>)
        : [],
    };
  }

  async setAdmission(
    input: TemporalAdmissionUpdateInput,
  ): Promise<Record<string, unknown>> {
    return await this.adminFetch<Record<string, unknown>>("/v1/admission", {
      body: {
        class: input.class,
        mode: input.mode,
        ...(input.mode === "limit" && input.ratePerS !== undefined
          ? { rate_per_s: input.ratePerS }
          : {}),
        scope: input.scope || "server",
        ttl_s: Math.min(3600, Math.max(5, Math.round(input.ttlS))),
      },
      method: "PUT",
    });
  }

  async liftAdmission(input: {
    class: "wait" | "existing" | "new" | "batch";
    scope?: string;
  }): Promise<Record<string, unknown>> {
    const scope = input.scope || "server";
    const qs = new URLSearchParams({
      class: input.class,
      scope,
    }).toString();
    return await this.adminFetch<Record<string, unknown>>(
      `/v1/admission?${qs}`,
      {
        method: "DELETE",
      },
    );
  }

  async handoffShard(
    shardId: number,
    targetServerId: string,
  ): Promise<Record<string, unknown>> {
    return await this.adminFetch<Record<string, unknown>>(
      `/v1/shards/${shardId}/handoff`,
      {
        body: { to: targetServerId },
        method: "POST",
      },
    );
  }

  async reloadTls(): Promise<Record<string, unknown>> {
    return await this.adminFetch<Record<string, unknown>>("/v1/tls/reload", {
      method: "POST",
    });
  }
}

function decodeDurationSeconds(
  dur?: {
    nanos?: number;
    seconds?: number | { toNumber?: () => number };
  } | null,
): number | undefined {
  if (!dur) return undefined;
  const s =
    typeof dur.seconds === "number"
      ? dur.seconds
      : typeof dur.seconds === "object" && dur.seconds?.toNumber
        ? dur.seconds.toNumber()
        : 0;
  return s > 0 ? s : undefined;
}

function overlapPolicyToEnum(policy: TemporalScheduleOverlapPolicy): number {
  switch (policy) {
    case "BUFFER_ONE":
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_BUFFER_ONE;
    case "BUFFER_ALL":
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_BUFFER_ALL;
    case "CANCEL_OTHER":
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_CANCEL_OTHER;
    case "TERMINATE_OTHER":
      return enums.ScheduleOverlapPolicy
        .SCHEDULE_OVERLAP_POLICY_TERMINATE_OTHER;
    case "ALLOW_ALL":
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_ALLOW_ALL;
    default:
      return enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_SKIP;
  }
}

function enumToOverlapPolicy(
  value?: number | null,
): TemporalScheduleOverlapPolicy {
  switch (value) {
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_BUFFER_ONE:
      return "BUFFER_ONE";
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_BUFFER_ALL:
      return "BUFFER_ALL";
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_CANCEL_OTHER:
      return "CANCEL_OTHER";
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_TERMINATE_OTHER:
      return "TERMINATE_OTHER";
    case enums.ScheduleOverlapPolicy.SCHEDULE_OVERLAP_POLICY_ALLOW_ALL:
      return "ALLOW_ALL";
    default:
      return "SKIP";
  }
}

function formatScheduleSpecSummary(
  spec?: proto.temporal.api.schedule.v1.IScheduleSpec | null,
): string {
  if (!spec) return "Custom schedule";
  if (spec.cronString && spec.cronString.length > 0) {
    return `Cron ${spec.cronString[0]}`;
  }
  if (spec.interval && spec.interval.length > 0) {
    const secs = decodeDurationSeconds(spec.interval[0]?.interval as never);
    if (secs) {
      if (secs % 86400 === 0) return `Every ${secs / 86400}d`;
      if (secs % 3600 === 0) return `Every ${secs / 3600}h`;
      if (secs % 60 === 0) return `Every ${secs / 60}m`;
      return `Every ${secs}s`;
    }
  }
  if (spec.structuredCalendar && spec.structuredCalendar.length > 0) {
    return "Calendar spec";
  }
  return "Custom schedule";
}

function mapScheduleSummary(
  scheduleId: string,
  desc: proto.temporal.api.workflowservice.v1.DescribeScheduleResponse,
): TemporalScheduleSummary {
  const sched = desc.schedule;
  const info = desc.info;
  const startWf = sched?.action?.startWorkflow;
  const recentActions: TemporalScheduleRecentAction[] = (
    info?.recentActions ?? []
  ).map((a) => ({
    actualTime: decodeTimestampIso(a.actualTime as never) || undefined,
    runId: a.startWorkflowResult?.runId || undefined,
    scheduleTime: decodeTimestampIso(a.scheduleTime as never) || undefined,
    workflowId: a.startWorkflowResult?.workflowId || undefined,
  }));

  const intervalSeconds = sched?.spec?.interval?.[0]
    ? decodeDurationSeconds(sched.spec.interval[0].interval as never)
    : undefined;
  const cronExpression = sched?.spec?.cronString?.[0] || undefined;

  return {
    actionCount: Number(info?.actionCount ?? 0),
    cadenceSummary: formatScheduleSpecSummary(sched?.spec),
    cronExpression,
    intervalSeconds,
    lastAction: recentActions[recentActions.length - 1],
    missedCatchupWindow: Number(info?.missedCatchupWindow ?? 0),
    nextActionTimes: (info?.futureActionTimes ?? [])
      .map((t) => decodeTimestampIso(t as never))
      .filter((s): s is string => typeof s === "string" && s.length > 0),
    notes: sched?.state?.notes || undefined,
    overlapPolicy: enumToOverlapPolicy(sched?.policies?.overlapPolicy),
    overlapSkipped: Number(info?.overlapSkipped ?? 0),
    paused: Boolean(sched?.state?.paused),
    recentActions,
    remainingActions: sched?.state?.limitedActions
      ? Number(sched.state.remainingActions ?? 0)
      : undefined,
    runningWorkflows: (info?.runningWorkflows ?? []).map((rw) => ({
      runId: rw.runId || "",
      workflowId: rw.workflowId || "",
    })),
    scheduleId,
    taskQueue: startWf?.taskQueue?.name || "default",
    workflowArgs: decodePayloads(startWf?.input as never),
    workflowIdPrefix: startWf?.workflowId || undefined,
    workflowType: startWf?.workflowType?.name || "Unknown",
  };
}

function formatGrpcError(err: unknown): string {
  if (err && typeof err === "object" && "details" in err) {
    const details = (err as { details?: unknown }).details;
    if (typeof details === "string" && details.length > 0) {
      return details;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

function grpcStatusToHttp(err: unknown): number {
  if (err && typeof err === "object" && "httpStatus" in err) {
    const status = (err as { httpStatus?: unknown }).httpStatus;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      return status;
    }
  }
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: number }).code;
    if (code === grpc.status.NOT_FOUND) return 404;
    if (code === grpc.status.INVALID_ARGUMENT) return 400;
    if (code === grpc.status.ALREADY_EXISTS) return 409;
    if (code === grpc.status.FAILED_PRECONDITION) return 412;
    if (code === grpc.status.UNIMPLEMENTED) return 501;
    if (code === grpc.status.UNAUTHENTICATED) return 401;
    if (code === grpc.status.PERMISSION_DENIED) return 403;
    if (code === grpc.status.RESOURCE_EXHAUSTED) return 429;
    if (code === grpc.status.DEADLINE_EXCEEDED) return 504;
  }
  return 500;
}

/**
 * Handles HTTP BFF requests under `/api/temporal/*` and translates them to
 * Temporal gRPC `WorkflowService` calls (working identically against both
 * `slate-temporal-next` and standard Temporal servers).
 */
export async function handleTemporalBffRequest(
  client: TemporalGrpcBffClient,
  request: Request,
  subPath: string,
  url: URL,
): Promise<Response> {
  try {
    if (request.method === "GET" && subPath === "/v1/capabilities") {
      return Response.json(await client.getCapabilities());
    }

    if (request.method === "GET" && subPath === "/v1/namespaces") {
      return Response.json({ namespaces: await client.listNamespaces() });
    }

    const nsWorkflowsMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflows$/,
    );
    if (nsWorkflowsMatch) {
      const namespace = decodeURIComponent(nsWorkflowsMatch[1]!);
      if (request.method === "GET") {
        const query = url.searchParams.get("query") ?? "";
        const pageSize = Number.parseInt(
          url.searchParams.get("pageSize") ?? "50",
          10,
        );
        const nextPageToken =
          url.searchParams.get("nextPageToken") ?? undefined;
        return Response.json(
          await client.listWorkflows({
            namespace,
            nextPageToken,
            pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 50,
            query,
          }),
        );
      }

      if (request.method === "POST") {
        const body = (await request.json()) as TemporalStartWorkflowInput;
        return Response.json(await client.startWorkflow(namespace, body), {
          status: 201,
        });
      }
    }

    const bulkMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflows\/bulk$/,
    );
    if (bulkMatch && request.method === "POST") {
      const namespace = decodeURIComponent(bulkMatch[1]!);
      const body = (await request.json()) as TemporalBulkActionRequest;
      return Response.json(await client.bulkAction(namespace, body));
    }

    const actionMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflows\/([^/]+)\/(query|signal|update|cancel|terminate|reset-sticky)$/,
    );
    if (actionMatch && request.method === "POST") {
      const namespace = decodeURIComponent(actionMatch[1]!);
      const workflowId = decodeURIComponent(actionMatch[2]!);
      const action = actionMatch[3]!;
      const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const runId = typeof body.runId === "string" ? body.runId : undefined;

      if (action === "reset-sticky") {
        return Response.json(
          await client.resetStickyTaskQueue({ namespace, runId, workflowId }),
        );
      }

      if (action === "query") {
        return Response.json(
          await client.queryWorkflow({
            args: Array.isArray(body.args) ? body.args : undefined,
            namespace,
            queryType: String(body.queryType ?? ""),
            runId,
            workflowId,
          }),
        );
      }
      if (action === "signal") {
        return Response.json(
          await client.signalWorkflow({
            args: Array.isArray(body.args) ? body.args : undefined,
            namespace,
            runId,
            signalName: String(body.signalName ?? ""),
            workflowId,
          }),
        );
      }
      if (action === "update") {
        return Response.json(
          await client.updateWorkflow({
            args: Array.isArray(body.args) ? body.args : undefined,
            namespace,
            runId,
            updateName: String(body.updateName ?? ""),
            workflowId,
          }),
        );
      }
      if (action === "cancel") {
        return Response.json(
          await client.cancelWorkflow({
            namespace,
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId,
            workflowId,
          }),
        );
      }
      if (action === "terminate") {
        return Response.json(
          await client.terminateWorkflow({
            namespace,
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId,
            workflowId,
          }),
        );
      }
    }

    const detailMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflows\/([^/]+)$/,
    );
    if (detailMatch && request.method === "GET") {
      const namespace = decodeURIComponent(detailMatch[1]!);
      const workflowId = decodeURIComponent(detailMatch[2]!);
      const runId = url.searchParams.get("runId") ?? undefined;
      return Response.json(
        await client.getWorkflowDetail({ namespace, runId, workflowId }),
      );
    }

    // ---------- Schedules routes ----------
    const nsSchedulesMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/schedules$/,
    );
    if (nsSchedulesMatch) {
      const namespace = decodeURIComponent(nsSchedulesMatch[1]!);
      if (request.method === "GET") {
        return Response.json(await client.listSchedules(namespace));
      }
      if (request.method === "POST") {
        const body = (await request.json()) as TemporalCreateScheduleInput;
        return Response.json(await client.createSchedule(namespace, body), {
          status: 201,
        });
      }
    }

    const bulkSchedulesMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/schedules\/bulk$/,
    );
    if (bulkSchedulesMatch && request.method === "POST") {
      const namespace = decodeURIComponent(bulkSchedulesMatch[1]!);
      const body = (await request.json()) as TemporalBulkScheduleRequest;
      return Response.json(await client.bulkScheduleAction(namespace, body));
    }

    const schedPatchMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/schedules\/([^/]+)\/(patch|matching-times)$/,
    );
    if (schedPatchMatch && request.method === "POST") {
      const namespace = decodeURIComponent(schedPatchMatch[1]!);
      const scheduleId = decodeURIComponent(schedPatchMatch[2]!);
      const action = schedPatchMatch[3]!;
      const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (action === "patch") {
        return Response.json(
          await client.patchSchedule(
            namespace,
            scheduleId,
            body as unknown as TemporalPatchScheduleInput,
          ),
        );
      }
      return Response.json({
        times: await client.listScheduleMatchingTimes({
          endTime: String(body.endTime ?? ""),
          namespace,
          scheduleId,
          startTime: String(body.startTime ?? ""),
        }),
      });
    }

    const schedDetailMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/schedules\/([^/]+)$/,
    );
    if (schedDetailMatch) {
      const namespace = decodeURIComponent(schedDetailMatch[1]!);
      const scheduleId = decodeURIComponent(schedDetailMatch[2]!);
      if (request.method === "GET") {
        return Response.json(
          await client.getScheduleDetail(namespace, scheduleId),
        );
      }
      if (request.method === "DELETE") {
        return Response.json(
          await client.deleteSchedule(namespace, scheduleId),
        );
      }
    }

    // ---------- Task Queues route ----------
    const taskQueuesMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/task-queues$/,
    );
    if (taskQueuesMatch && request.method === "GET") {
      const namespace = decodeURIComponent(taskQueuesMatch[1]!);
      return Response.json(await client.listTaskQueues(namespace));
    }

    // ---------- Cluster & Shards (slate-temporal-next Admin) ----------
    if (request.method === "GET" && subPath === "/v1/cluster/overview") {
      const window = url.searchParams.get("window") ?? "10s";
      return Response.json(await client.getClusterOverview(window));
    }

    if (request.method === "GET" && subPath === "/v1/cluster/traces") {
      const drain = url.searchParams.get("drain") === "true";
      return Response.json(await client.getClusterTraces(drain));
    }

    if (subPath === "/v1/cluster/admission") {
      const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (request.method === "PUT") {
        return Response.json(
          await client.setAdmission(
            body as unknown as TemporalAdmissionUpdateInput,
          ),
        );
      }
      if (request.method === "DELETE") {
        return Response.json(
          await client.liftAdmission({
            class: String(body.class ?? "new") as
              "wait" | "existing" | "new" | "batch",
            scope: typeof body.scope === "string" ? body.scope : undefined,
          }),
        );
      }
    }

    const handoffMatch = subPath.match(
      /^\/v1\/cluster\/shards\/(\d+)\/handoff$/,
    );
    if (handoffMatch && request.method === "POST") {
      const shardId = Number.parseInt(handoffMatch[1]!, 10);
      const body = (await request.json().catch(() => ({}))) as {
        to?: string;
      };
      return Response.json(
        await client.handoffShard(shardId, String(body.to ?? "")),
      );
    }

    if (request.method === "POST" && subPath === "/v1/cluster/tls/reload") {
      return Response.json(await client.reloadTls());
    }

    return Response.json({ error: `Not found: ${subPath}` }, { status: 404 });
  } catch (err) {
    return Response.json(
      { error: formatGrpcError(err) },
      { status: grpcStatusToHttp(err) },
    );
  }
}
