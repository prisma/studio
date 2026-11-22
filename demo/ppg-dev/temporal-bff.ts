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
  TemporalBulkActionRequest,
  TemporalBulkActionResponse,
  TemporalCapabilities,
  TemporalExecutionDetail,
  TemporalListWorkflowsResponse,
  TemporalNamespace,
  TemporalPendingActivity,
  TemporalPendingChildWorkflow,
  TemporalQueryResult,
  TemporalStartWorkflowInput,
  TemporalStartWorkflowResult,
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
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: number }).code;
    if (code === grpc.status.NOT_FOUND) return 404;
    if (code === grpc.status.INVALID_ARGUMENT) return 400;
    if (code === grpc.status.ALREADY_EXISTS) return 409;
    if (code === grpc.status.FAILED_PRECONDITION) return 412;
    if (code === grpc.status.UNIMPLEMENTED) return 501;
    if (code === grpc.status.UNAUTHENTICATED) return 401;
    if (code === grpc.status.PERMISSION_DENIED) return 403;
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
      /^\/v1\/namespaces\/([^/]+)\/workflows\/([^/]+)\/(query|signal|update|cancel|terminate)$/,
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

    return Response.json({ error: `Not found: ${subPath}` }, { status: 404 });
  } catch (err) {
    return Response.json(
      { error: formatGrpcError(err) },
      { status: grpcStatusToHttp(err) },
    );
  }
}
