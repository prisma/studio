import * as grpc from "@grpc/grpc-js";
import * as proto from "@temporalio/proto";

import {
  buildExecutionDetail,
  decodeFailure,
  decodePayloadMap,
  decodePayloads,
  decodeSinglePayload,
  decodeTimestampIso,
  normalizeWorkflowStatus,
  toProto3Json,
} from "../../data/temporal/history-grouping";
import {
  buildTypeMap,
  extractRunBuildId,
  pickTypeMapSample,
} from "../../data/temporal/type-map";
import type {
  TemporalActivityOperation,
  TemporalAdmissionUpdateInput,
  TemporalAttentionItem,
  TemporalAttentionResponse,
  TemporalBulkActionRequest,
  TemporalBulkActionResponse,
  TemporalBulkJob,
  TemporalBulkJobRequest,
  TemporalBulkScheduleRequest,
  TemporalBulkScheduleResponse,
  TemporalCapabilities,
  TemporalClusterHealthReason,
  TemporalClusterOverview,
  TemporalClusterShard,
  TemporalClusterTracesResponse,
  TemporalCreateScheduleInput,
  TemporalExecutionDetail,
  TemporalFacets,
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
  TemporalTypeInputsResponse,
  TemporalTypeMapResponse,
  TemporalUpdateResult,
  TemporalWorker,
  TemporalWorkersResponse,
  TemporalWorkflowExecution,
  TemporalWorkflowSort,
  TemporalWorkflowSortField,
  TemporalWorkflowStatus,
} from "../../data/temporal/types";
import {
  callCodec,
  type CodecDecodeResult,
  decodePayloadsInPlace,
  type RawTemporalPayload,
  type TemporalCodecConfig,
} from "./temporal-codec";

const ws = proto.temporal.api.workflowservice.v1;
const enums = proto.temporal.api.enums.v1;

const WORKFLOW_SERVICE_PREFIX =
  "/temporal.api.workflowservice.v1.WorkflowService";
const OPERATOR_SERVICE_PREFIX =
  "/temporal.api.operatorservice.v1.OperatorService";
const operator = proto.temporal.api.operatorservice.v1;

/** The names of `IndexedValueType`, as a List Filter builder needs them. */
const SEARCH_ATTRIBUTE_TYPES: Record<number, string> = {
  1: "Text",
  2: "Keyword",
  3: "Int",
  4: "Double",
  5: "Bool",
  6: "Datetime",
  7: "KeywordList",
};

export interface TemporalBffConfig {
  address: string;
  adminToken?: string;
  adminUrl?: string;
  apiKey?: string;
  /** The Codec Server that decodes payloads the application's Workers encode. */
  codec?: TemporalCodecConfig;
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
      ...(pa.paused ? { paused: true } : {}),
      ...(pa.activityOptions?.taskQueue?.name
        ? { taskQueue: pa.activityOptions.taskQueue.name }
        : {}),
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

/**
 * slate-temporal-next refuses a project's fifth concurrent list or count call
 * with RESOURCE_EXHAUSTED, so Studio queues its own calls below that. Lists and
 * counts queue apart, because a count can take seconds and the rows of a new
 * search must not wait for it.
 */
const MAX_CONCURRENT_VISIBILITY_CALLS = { count: 1, list: 2 };

interface VisibilityLane {
  inFlight: number;
  waiters: Array<() => void>;
}

/**
 * A server may end a list page before it is full and return a token for the
 * rest: slate-temporal-next examines at most 10,000 runs per page. This is how
 * many pages one list request follows.
 */
const MAX_LIST_PAGES_PER_REQUEST = 5;

/**
 * No server sorts a list by every column, and slate-temporal-next sorts by
 * none. So the BFF sorts: it reads every run that matches the filter, up to
 * this many, and keeps the sorted copy for a few seconds.
 */
const MAX_SORTED_RUNS = 10_000;
const SORTED_RUNS_PAGE_SIZE = 1_000;
const SORTED_RUNS_MIN_AGE_MS = 4_000;
/**
 * How long the BFF takes it that a filter still matches too many runs to copy.
 * Finding that out again costs a read of `MAX_SORTED_RUNS` runs.
 */
const TOO_MANY_RUNS_RECHECK_MS = 5 * 60_000;
const RUNNING_QUERY = 'ExecutionStatus = "Running"';
const SORTED_OFFSET_TOKEN = /^offset:(\d+)$/;

const WORKFLOW_SORT_FIELDS: Record<
  TemporalWorkflowSortField,
  (run: TemporalWorkflowExecution) => number | string
> = {
  // An open run has no close time; it sorts as the most recently closed.
  CloseTime: (run) =>
    run.closeTime ? Date.parse(run.closeTime) : Number.MAX_SAFE_INTEGER,
  Duration: (run) => run.durationMs,
  ExecutionStatus: (run) => run.status,
  HistoryLength: (run) => run.historyLength,
  StartTime: (run) => Date.parse(run.startTime),
  TaskQueue: (run) => run.taskQueue,
  WorkflowId: (run) => run.workflowId,
  WorkflowType: (run) => run.workflowType,
};

export function isWorkflowSortField(
  value: unknown,
): value is TemporalWorkflowSortField {
  return typeof value === "string" && value in WORKFLOW_SORT_FIELDS;
}

export function sortWorkflowRuns(
  runs: TemporalWorkflowExecution[],
  sort: TemporalWorkflowSort,
): TemporalWorkflowExecution[] {
  const read = WORKFLOW_SORT_FIELDS[sort.field];
  const sign = sort.direction === "asc" ? 1 : -1;

  return [...runs].sort((a, b) => {
    const left = read(a);
    const right = read(b);
    const order =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));

    // Equal values keep one fixed order, so a row never jumps between pages.
    return order !== 0
      ? order * sign
      : a.workflowId.localeCompare(b.workflowId) ||
          a.runId.localeCompare(b.runId);
  });
}

/** A value the BFF read from the server, and what reading it cost. */
interface Remembered<T> {
  fetchMs: number;
  takenAt: number;
  value: T;
}

interface RememberedEntry {
  latest?: Remembered<unknown>;
  refresh?: Promise<Remembered<unknown>>;
}

const REMEMBERED_MAX_KEPT = 16;

/** How many running Workflow Executions one attention check describes. */
const MAX_ATTENTION_RUNS = 1_500;
const ATTENTION_MIN_AGE_MS = 15_000;
/** How many runs a Workflow Type's diagram is drawn from, and how much of each the BFF reads. */
const TYPE_MAP_SAMPLE_RUNS = 40;
const TYPE_MAP_CANDIDATE_RUNS = 300;
const TYPE_MAP_HISTORY_PAGES = 2;
const TYPE_MAP_HISTORY_PAGE_SIZE = 500;
const TYPE_MAP_MIN_AGE_MS = 60_000;
/** How many recent runs of a type the start form reads the input of. */
const TYPE_INPUT_RUNS = 10;
const TYPE_INPUTS_MIN_AGE_MS = 30_000;
const FACETS_SAMPLE_MIN_AGE_MS = 30_000;
/** The Task Queues screen counts schedules per queue; it need not list them on every poll. */
const SCHEDULES_MIN_AGE_MS = 10_000;
const DESCRIBE_CONCURRENCY = 12;
/** A task nobody picked up for this long has no Worker polling its queue. */
const NO_WORKER_AFTER_MS = 30_000;
/** A run is slow when it runs this many times longer than 95% of closed runs of its type. */
const LONG_RUNNING_FACTOR = 3;
const LONG_RUNNING_MIN_SAMPLES = 20;
const RECENT_FAILURE_WINDOW_MS = 60 * 60_000;
const MAX_RECENT_FAILURES = 100;

function percentile(sortedValues: number[], share: number): number {
  return sortedValues[
    Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * share))
  ]!;
}

function formatSpan(ms: number): string {
  const seconds = Math.round(ms / 1000);

  if (seconds < 90) return `${seconds}s`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

async function forEachConcurrently<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        await work(items[index++]!);
      }
    }),
  );
}

interface CachedRunHistory {
  codec: CodecDecodeResult;
  historyLength: number;
  historyTailIncluded: boolean;
  historyTruncated: boolean;
  rawEvents: Record<string, unknown>[];
  rawHistoryJson: { events: unknown[] };
}

const HISTORY_CACHE_MAX_KEPT = 32;

export class TemporalGrpcBffClient {
  #client: grpc.Client;
  #config: TemporalBffConfig;
  #capabilitiesCache: TemporalCapabilities | null = null;
  #visibilityLanes: Record<"count" | "list", VisibilityLane> = {
    count: { inFlight: 0, waiters: [] },
    list: { inFlight: 0, waiters: [] },
  };
  #remembered = new Map<string, RememberedEntry>();
  /** The filters that matched too many runs to copy, and when the BFF found that. */
  #tooManyRuns = new Map<string, Remembered<null>>();
  #historyCache = new Map<string, CachedRunHistory>();
  #bulkJobs = new Map<string, TemporalBulkJob & { abort: boolean }>();

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
    return this.#call(
      WORKFLOW_SERVICE_PREFIX,
      method,
      reqCodec,
      resCodec,
      request,
      timeoutMs,
    );
  }

  /** A call to the OperatorService: Search Attributes and Nexus Endpoints. */
  operatorUnary<Req, Res>(
    method: string,
    reqCodec: { encode: (msg: Req) => { finish: () => Uint8Array } },
    resCodec: Pick<ProtoCodec<Req, Res>, "decode">,
    request: Req,
  ): Promise<Res> {
    return this.#call(
      OPERATOR_SERVICE_PREFIX,
      method,
      reqCodec,
      resCodec,
      request,
      10_000,
    );
  }

  #call<Req, Res>(
    servicePrefix: string,
    method: string,
    reqCodec: { encode: (msg: Req) => { finish: () => Uint8Array } },
    resCodec: Pick<ProtoCodec<Req, Res>, "decode">,
    request: Req,
    timeoutMs: number,
  ): Promise<Res> {
    const metadata = new grpc.Metadata();
    if (this.#config.apiKey) {
      metadata.set("authorization", `Bearer ${this.#config.apiKey}`);
    }
    const deadline = new Date(Date.now() + timeoutMs);

    return new Promise<Res>((resolve, reject) => {
      this.#client.makeUnaryRequest(
        `${servicePrefix}/${method}`,
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

  async #withVisibilitySlot<T>(
    kind: "count" | "list",
    call: () => Promise<T>,
  ): Promise<T> {
    const lane = this.#visibilityLanes[kind];

    if (lane.inFlight >= MAX_CONCURRENT_VISIBILITY_CALLS[kind]) {
      // The call that finishes hands its slot to the first waiter.
      await new Promise<void>((resolve) => {
        lane.waiters.push(resolve);
      });
    } else {
      lane.inFlight++;
    }

    try {
      return await call();
    } finally {
      const next = lane.waiters.shift();

      if (next) {
        next();
      } else {
        lane.inFlight--;
      }
    }
  }

  /**
   * The payloads for arguments typed in Studio. With a Codec Server set they
   * go through it first, so a Worker whose codec refuses plain payloads can read them.
   */
  async #encodeArgs(
    namespace: string,
    values: unknown[] | undefined,
  ): Promise<proto.temporal.api.common.v1.IPayloads | undefined> {
    const plain = encodeJsonPayloads(values);
    const codec = this.#config.codec;

    if (!plain?.payloads || !codec || codec.encodeOutgoing === false) {
      return plain;
    }

    return {
      payloads: await callCodec(
        codec,
        "encode",
        namespace,
        plain.payloads as RawTemporalPayload[],
      ),
    };
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
      codec: this.#config.codec
        ? { configured: true, endpoint: this.#config.codec.endpoint }
        : { configured: false },
      persistenceStore,
      nativeListOrder: isStn ? "workflow-id" : "newest-first",
      serverKind: isStn ? "slate-temporal-next" : "temporal",
      serverVersion:
        sysInfo?.serverVersion || clusterInfo?.serverVersion || "unknown",
      shardCount: clusterInfo?.historyShardCount ?? 1,
      supportsActivityOperations: !isStn,
      supportsAdminApi,
      supportsCountGroupByStatus: Boolean(
        sysInfo?.capabilities?.countGroupByExecutionStatus ?? true,
      ),
      supportsDescribeTaskQueue: !isStn,
      supportsNativeBatch: !isStn,
      supportsReset: !isStn,
      supportsSchedules: true,
      supportsWorkflowPause: !isStn,
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

  /**
   * Reads a value at most once per `minAgeMs`. A caller gets the copy the BFF
   * holds at once, and a copy that is too old is read again in the background,
   * so only the first caller waits for the server.
   */
  async #remember<T>(
    key: string,
    minAgeMs: number,
    read: () => Promise<T>,
  ): Promise<Remembered<T>> {
    let entry = this.#remembered.get(key);

    // Re-insert, so the map keeps the keys used most recently.
    this.#remembered.delete(key);
    entry ??= {};
    this.#remembered.set(key, entry);

    for (const oldKey of this.#remembered.keys()) {
      if (this.#remembered.size <= REMEMBERED_MAX_KEPT) {
        break;
      }

      this.#remembered.delete(oldKey);
    }

    const latest = entry.latest as Remembered<T> | undefined;
    const maxAgeMs = Math.max(minAgeMs, (latest?.fetchMs ?? 0) * 3);

    if (latest && Date.now() - latest.takenAt < maxAgeMs) {
      return latest;
    }

    const target = entry;
    const startedAt = Date.now();
    const refresh =
      (target.refresh as Promise<Remembered<T>> | undefined) ??
      read()
        .then((value) => {
          const result = {
            fetchMs: Date.now() - startedAt,
            takenAt: Date.now(),
            value,
          };

          target.latest = result;
          return result;
        })
        .finally(() => {
          target.refresh = undefined;
        });

    target.refresh = refresh;
    // A background refresh that fails keeps the copy the BFF holds.
    refresh.catch(() => undefined);

    return await (latest ?? refresh);
  }

  /** Every run that matches a filter, or null when more match than the BFF reads. */
  async matchingRuns(
    namespace: string,
    query: string,
  ): Promise<Remembered<TemporalWorkflowExecution[] | null>> {
    const key = `runs\n${namespace}\n${query}`;
    const tooMany = this.#tooManyRuns.get(key);

    if (tooMany && Date.now() - tooMany.takenAt < TOO_MANY_RUNS_RECHECK_MS) {
      return tooMany;
    }

    const remembered = await this.#readMatchingRuns(key, namespace, query);

    this.#tooManyRuns.delete(key);

    if (remembered.value === null) {
      this.#tooManyRuns.set(key, { ...remembered, value: null });

      for (const oldKey of this.#tooManyRuns.keys()) {
        if (this.#tooManyRuns.size <= REMEMBERED_MAX_KEPT) {
          break;
        }

        this.#tooManyRuns.delete(oldKey);
      }
    }

    return remembered;
  }

  #readMatchingRuns(
    key: string,
    namespace: string,
    query: string,
  ): Promise<Remembered<TemporalWorkflowExecution[] | null>> {
    return this.#remember(key, SORTED_RUNS_MIN_AGE_MS, async () => {
      const runs: TemporalWorkflowExecution[] = [];
      let pageToken: Uint8Array | undefined;

      do {
        const page = await this.#withVisibilitySlot("list", () =>
          this.unary(
            "ListWorkflowExecutions",
            ws.ListWorkflowExecutionsRequest,
            ws.ListWorkflowExecutionsResponse,
            {
              namespace,
              nextPageToken: pageToken,
              pageSize: SORTED_RUNS_PAGE_SIZE,
              query,
            },
            30_000,
          ),
        );

        for (const info of page.executions ?? []) {
          runs.push(normalizeExecutionInfo(namespace, info));
        }

        pageToken =
          page.nextPageToken && page.nextPageToken.length > 0
            ? page.nextPageToken
            : undefined;
      } while (pageToken && runs.length <= MAX_SORTED_RUNS);

      return runs.length > MAX_SORTED_RUNS ? null : runs;
    });
  }

  /** The Workflow Types and Task Queues in use, from every run of the namespace. */
  async getFacets(namespace: string): Promise<TemporalFacets> {
    const all = await this.matchingRuns(namespace, "");
    const firstPage = (query?: string) =>
      this.listWorkflows({
        includeCounts: false,
        namespace,
        pageSize: SORTED_RUNS_PAGE_SIZE,
        query,
      }).then((list) => list.executions);
    // A server may list by Workflow ID, so one page of a large namespace holds few
    // types. The running runs add the types and queues that are in use now.
    // Two pages of 1,000 runs take seconds to read, so the BFF keeps them a while.
    const sample: TemporalWorkflowExecution[] =
      all.value ??
      (
        await this.#remember(
          `facets-sample\n${namespace}`,
          FACETS_SAMPLE_MIN_AGE_MS,
          async () =>
            (await Promise.all([firstPage(), firstPage(RUNNING_QUERY)])).flat(),
        )
      ).value;
    const runs = [...new Map(sample.map((run) => [run.runId, run])).values()];
    const taskQueues = new Map<string, number>();
    const workflowTypes = new Map<
      string,
      { count: number; latest: TemporalWorkflowExecution }
    >();

    for (const run of runs) {
      taskQueues.set(run.taskQueue, (taskQueues.get(run.taskQueue) ?? 0) + 1);

      const type = workflowTypes.get(run.workflowType);

      if (!type) {
        workflowTypes.set(run.workflowType, { count: 1, latest: run });
      } else {
        type.count++;

        if (run.startTime > type.latest.startTime) {
          type.latest = run;
        }
      }
    }

    // A server without custom Search Attributes, or without this call, has none to offer.
    const registered = await this.operatorUnary(
      "ListSearchAttributes",
      operator.ListSearchAttributesRequest,
      operator.ListSearchAttributesResponse,
      { namespace },
    ).catch(() => null);

    return {
      complete: all.value !== null,
      searchAttributes: Object.entries(registered?.customAttributes ?? {})
        .map(([name, type]) => ({
          name,
          type: SEARCH_ATTRIBUTE_TYPES[Number(type)] ?? "Keyword",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      taskQueues: [...taskQueues]
        .map(([name, count]) => ({ count, name }))
        .sort((a, b) => b.count - a.count),
      workflowTypes: [...workflowTypes]
        .map(([name, { count, latest }]) => ({
          count,
          latestRun: { runId: latest.runId, workflowId: latest.workflowId },
          name,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Which Task Queue each Activity Type runs on, per Workflow Type. No list
   * call reports the queues that only run Activities, so this reads the history
   * of the newest closed run of every Workflow Type.
   */
  async #activityRouting(
    namespace: string,
  ): Promise<Map<string, Map<string, string>>> {
    const remembered = await this.#remember(
      `routing\n${namespace}`,
      5 * 60_000,
      async () => {
        // In a namespace too large to copy, the running runs name the types.
        const all =
          (await this.matchingRuns(namespace, "")).value ??
          (await this.matchingRuns(namespace, RUNNING_QUERY)).value ??
          [];
        // Two runs per type: the one with the longest history, and the newest
        // completed one. Together they name most Activities the type schedules.
        const samples = new Map<
          string,
          {
            completed?: TemporalWorkflowExecution;
            longest: TemporalWorkflowExecution;
          }
        >();

        for (const run of all) {
          const sample = samples.get(run.workflowType) ?? { longest: run };

          if (run.historyLength > sample.longest.historyLength) {
            sample.longest = run;
          }

          if (
            run.status === "Completed" &&
            (!sample.completed || run.startTime > sample.completed.startTime)
          ) {
            sample.completed = run;
          }

          samples.set(run.workflowType, sample);
        }

        const sampleRuns = [...samples.values()].flatMap((sample) =>
          sample.completed && sample.completed !== sample.longest
            ? [sample.longest, sample.completed]
            : [sample.longest],
        );
        const routing = new Map<string, Map<string, string>>();

        await forEachConcurrently(sampleRuns, 4, async (run) => {
          const history = await this.unary(
            "GetWorkflowExecutionHistory",
            ws.GetWorkflowExecutionHistoryRequest,
            ws.GetWorkflowExecutionHistoryResponse,
            {
              execution: { runId: run.runId, workflowId: run.workflowId },
              maximumPageSize: 500,
              namespace,
            },
          ).catch(() => null);
          const queues =
            routing.get(run.workflowType) ?? new Map<string, string>();

          for (const event of history?.history?.events ?? []) {
            const scheduled = event.activityTaskScheduledEventAttributes;

            if (scheduled?.activityType?.name && scheduled.taskQueue?.name) {
              queues.set(scheduled.activityType.name, scheduled.taskQueue.name);
            }
          }

          routing.set(run.workflowType, queues);
        });

        return routing;
      },
    );

    return remembered.value;
  }

  /**
   * The runs of a Workflow Type that the BFF knows. In a namespace too large
   * to copy that is one page of the type's runs, and the running ones, which
   * that page may not hold; `complete` is then false.
   */
  async #runsOfType(
    namespace: string,
    workflowType: string,
  ): Promise<{ complete: boolean; runs: TemporalWorkflowExecution[] }> {
    const all = (await this.matchingRuns(namespace, "")).value;
    const ofType = (runs: TemporalWorkflowExecution[]) =>
      runs.filter((run) => run.workflowType === workflowType);

    if (all) {
      return { complete: true, runs: ofType(all) };
    }

    const [page, running] = await Promise.all([
      this.listWorkflows({
        includeCounts: false,
        namespace,
        pageSize: TYPE_MAP_CANDIDATE_RUNS,
        query: `WorkflowType = "${workflowType.replaceAll('"', '\\"')}"`,
      }),
      this.matchingRuns(namespace, RUNNING_QUERY),
    ]);

    return {
      complete: false,
      runs: [
        ...new Map(
          [...page.executions, ...ofType(running.value ?? [])].map((run) => [
            run.runId,
            run,
          ]),
        ).values(),
      ],
    };
  }

  /**
   * The inputs of the newest runs of a Workflow Type, for the form that starts
   * a run of it. Reads the first history event of each run, which holds the
   * input, and decodes them all with one codec request.
   */
  async getTypeInputs(
    namespace: string,
    workflowType: string,
  ): Promise<TemporalTypeInputsResponse> {
    const remembered = await this.#remember(
      `type-inputs\n${namespace}\n${workflowType}`,
      TYPE_INPUTS_MIN_AGE_MS,
      async () => {
        const { runs } = await this.#runsOfType(namespace, workflowType);
        const newest = [...runs]
          .sort((a, b) => b.startTime.localeCompare(a.startTime))
          .slice(0, TYPE_INPUT_RUNS);
        const started = new Array<Record<string, unknown> | null>(
          newest.length,
        ).fill(null);

        await forEachConcurrently(
          newest.map((run, index) => ({ index, run })),
          6,
          async ({ index, run }) => {
            const history = await this.unary(
              "GetWorkflowExecutionHistory",
              ws.GetWorkflowExecutionHistoryRequest,
              ws.GetWorkflowExecutionHistoryResponse,
              {
                execution: { runId: run.runId, workflowId: run.workflowId },
                maximumPageSize: 1,
                namespace,
              },
            ).catch(() => null);
            const first = history?.history?.events?.[0];

            if (first) {
              started[index] =
                proto.temporal.api.history.v1.HistoryEvent.toObject(
                  proto.temporal.api.history.v1.HistoryEvent.create(first),
                  {
                    bytes: Buffer,
                    defaults: false,
                    enums: String,
                    longs: Number,
                  },
                ) as Record<string, unknown>;
            }
          },
        );

        await decodePayloadsInPlace(
          this.#config.codec,
          namespace,
          started.filter((event) => event !== null),
        );

        const queueCounts = new Map<string, number>();

        for (const run of runs) {
          queueCounts.set(
            run.taskQueue,
            (queueCounts.get(run.taskQueue) ?? 0) + 1,
          );
        }

        return {
          runs: newest.flatMap((run, index) => {
            const event = started[index];

            if (!event) {
              return [];
            }

            const attributes = event.workflowExecutionStartedEventAttributes as
              | {
                  input?: {
                    payloads?: Parameters<typeof decodeSinglePayload>[0][];
                  };
                }
              | undefined;
            const args = (attributes?.input?.payloads ?? []).map((payload) =>
              decodeSinglePayload(payload),
            );

            return [
              {
                args,
                // A payload that no codec decoded is a marker, not the value.
                isEncoded: args.some(
                  (arg) =>
                    arg !== null &&
                    typeof arg === "object" &&
                    "$encodedPayload" in arg,
                ),
                runId: run.runId,
                startTime: run.startTime,
                status: run.status,
                taskQueue: run.taskQueue,
                workflowId: run.workflowId,
              },
            ];
          }),
          taskQueue: [...queueCounts].sort((a, b) => b[1] - a[1])[0]?.[0],
        };
      },
    );

    return remembered.value;
  }

  /**
   * The diagram of a Workflow Type, drawn from the histories of a sample of its
   * runs. Reads one or two history pages per sampled run and no payloads.
   */
  async getTypeMap(
    namespace: string,
    workflowType: string,
  ): Promise<TemporalTypeMapResponse> {
    const remembered = await this.#remember(
      `type-map\n${namespace}\n${workflowType}`,
      TYPE_MAP_MIN_AGE_MS,
      async () => {
        const { complete, runs: candidates } = await this.#runsOfType(
          namespace,
          workflowType,
        );
        const sample = pickTypeMapSample(candidates, TYPE_MAP_SAMPLE_RUNS);
        const details = new Array<TemporalExecutionDetail | null>(
          sample.length,
        ).fill(null);
        let truncatedRunCount = 0;

        await forEachConcurrently(
          sample.map((run, index) => ({ index, run })),
          6,
          async ({ index, run }) => {
            const rawEvents: Record<string, unknown>[] = [];
            let nextPageToken: Uint8Array | undefined;

            for (let page = 0; page < TYPE_MAP_HISTORY_PAGES; page++) {
              const history = await this.unary(
                "GetWorkflowExecutionHistory",
                ws.GetWorkflowExecutionHistoryRequest,
                ws.GetWorkflowExecutionHistoryResponse,
                {
                  execution: { runId: run.runId, workflowId: run.workflowId },
                  maximumPageSize: TYPE_MAP_HISTORY_PAGE_SIZE,
                  namespace,
                  nextPageToken,
                },
              ).catch(() => null);

              for (const event of history?.history?.events ?? []) {
                rawEvents.push(
                  proto.temporal.api.history.v1.HistoryEvent.toObject(
                    proto.temporal.api.history.v1.HistoryEvent.create(event),
                    {
                      bytes: Buffer,
                      defaults: false,
                      enums: String,
                      longs: Number,
                    },
                  ) as Record<string, unknown>,
                );
              }

              nextPageToken =
                history?.nextPageToken && history.nextPageToken.length > 0
                  ? history.nextPageToken
                  : undefined;

              if (!nextPageToken) {
                break;
              }
            }

            if (nextPageToken) {
              truncatedRunCount++;
            }

            // A run whose history is gone or unreadable is left out.
            if (rawEvents.length > 0) {
              details[index] = buildExecutionDetail({
                execution: run,
                rawEvents,
              });
            }
          },
        );

        const validDetails = details.filter(
          (detail): detail is TemporalExecutionDetail => detail !== null,
        );
        const byVersion = new Map<string, TemporalExecutionDetail[]>();
        let hasBuildId = false;

        for (const detail of validDetails) {
          const buildId = extractRunBuildId(detail.rawEvents);
          if (buildId) {
            hasBuildId = true;
          }
          const key = buildId ?? "unversioned";
          const bucket = byVersion.get(key) ?? [];
          bucket.push(detail);
          byVersion.set(key, bucket);
        }

        const versions =
          hasBuildId && byVersion.size > 1
            ? [...byVersion.entries()]
                .map(([buildId, group]) => ({
                  buildId,
                  map: buildTypeMap(group),
                  runCount: group.length,
                }))
                .sort((a, b) => b.runCount - a.runCount)
            : undefined;

        return {
          ...buildTypeMap(validDetails),
          candidateCount: candidates.length,
          candidatesComplete: complete,
          truncatedRunCount,
          ...(versions ? { versions } : {}),
          workflowType,
        };
      },
    );

    return { ...remembered.value, ageMs: Date.now() - remembered.takenAt };
  }

  /**
   * Running Workflow Executions that will not finish without help, and recent
   * failures. No Visibility filter finds a retrying Activity or a task with no
   * Worker, so this describes every running run.
   */
  async getAttention(namespace: string): Promise<TemporalAttentionResponse> {
    const remembered = await this.#remember(
      `attention\n${namespace}`,
      ATTENTION_MIN_AGE_MS,
      async () => {
        const all = (await this.matchingRuns(namespace, "")).value;
        const running =
          all?.filter((run) => run.status === "Running") ??
          (await this.matchingRuns(namespace, RUNNING_QUERY)).value ??
          (
            await this.listWorkflows({
              includeCounts: false,
              namespace,
              pageSize: SORTED_RUNS_PAGE_SIZE,
              query: RUNNING_QUERY,
            })
          ).executions;
        const checked = [...running]
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .slice(0, MAX_ATTENTION_RUNS);
        const items: TemporalAttentionItem[] = [];
        const now = Date.now();
        const base = (run: TemporalWorkflowExecution) => ({
          runId: run.runId,
          startTime: run.startTime,
          status: run.status,
          taskQueue: run.taskQueue,
          workflowId: run.workflowId,
          workflowType: run.workflowType,
        });

        // How long 95% of the closed runs of each type took.
        const closedDurations = new Map<string, number[]>();

        for (const run of all ?? []) {
          if (run.status === "Completed" || run.status === "ContinuedAsNew") {
            const durations = closedDurations.get(run.workflowType) ?? [];

            durations.push(run.durationMs);
            closedDurations.set(run.workflowType, durations);
          }
        }

        const usualMs = new Map<string, number>();

        for (const [type, durations] of closedDurations) {
          if (durations.length >= LONG_RUNNING_MIN_SAMPLES) {
            usualMs.set(
              type,
              percentile(
                durations.sort((a, b) => a - b),
                0.95,
              ),
            );
          }
        }

        await forEachConcurrently(
          checked,
          DESCRIBE_CONCURRENCY,
          async (run) => {
            const described = await this.unary(
              "DescribeWorkflowExecution",
              ws.DescribeWorkflowExecutionRequest,
              ws.DescribeWorkflowExecutionResponse,
              {
                execution: { runId: run.runId, workflowId: run.workflowId },
                namespace,
              },
            ).catch(() => null);

            if (!described) {
              return;
            }

            const task = described.pendingWorkflowTask;
            const taskScheduledAt = decodeTimestampIso(task?.scheduledTime);

            if (task && (task.attempt ?? 1) > 1) {
              items.push({
                ...base(run),
                attempt: task.attempt ?? 1,
                detail: `The Workflow Task failed ${(task.attempt ?? 1) - 1} times. The Workflow code throws or is not deterministic.`,
                kind: "workflow-task-failing",
                since: taskScheduledAt,
              });
            } else if (
              task &&
              task.state ===
                enums.PendingWorkflowTaskState
                  .PENDING_WORKFLOW_TASK_STATE_SCHEDULED &&
              taskScheduledAt &&
              now - Date.parse(taskScheduledAt) > NO_WORKER_AFTER_MS
            ) {
              items.push({
                ...base(run),
                detail: `A Workflow Task has waited ${formatSpan(now - Date.parse(taskScheduledAt))} for a Worker on Task Queue ${run.taskQueue}.`,
                kind: "no-worker",
                since: taskScheduledAt,
              });
            }

            for (const activity of described.pendingActivities ?? []) {
              const activityType = activity.activityType?.name ?? "Activity";
              const attempt = activity.attempt ?? 1;
              const scheduledAt = decodeTimestampIso(activity.scheduledTime);
              const scheduledInFuture =
                scheduledAt !== undefined && Date.parse(scheduledAt) > now;

              if (attempt > 1 || activity.lastFailure) {
                const failure = decodeFailure(activity.lastFailure as never);

                items.push({
                  ...base(run),
                  ...(activity.activityId
                    ? { activityId: activity.activityId }
                    : {}),
                  ...(activity.paused ? { activityPaused: true } : {}),
                  activityType,
                  attempt,
                  detail: failure?.message ?? "The last attempt failed.",
                  kind: "activity-retrying",
                  maximumAttempts: activity.maximumAttempts ?? 0,
                  // While an Activity waits for its next attempt, a standard
                  // Temporal server reports that attempt as the scheduled time.
                  nextAttemptTime:
                    decodeTimestampIso(activity.nextAttemptScheduleTime) ??
                    (scheduledInFuture ? scheduledAt : undefined),
                  since:
                    decodeTimestampIso(activity.lastAttemptCompleteTime) ??
                    decodeTimestampIso(activity.lastStartedTime) ??
                    (scheduledInFuture ? undefined : scheduledAt),
                });
              } else if (
                normalizePendingActivityState(activity.state) === "Scheduled" &&
                scheduledAt &&
                now - Date.parse(scheduledAt) > NO_WORKER_AFTER_MS
              ) {
                items.push({
                  ...base(run),
                  activityType,
                  detail: `Activity ${activityType} has waited ${formatSpan(now - Date.parse(scheduledAt))} for a Worker.`,
                  kind: "no-worker",
                  since: scheduledAt,
                });
              }
            }

            const usual = usualMs.get(run.workflowType);

            if (
              usual &&
              run.durationMs >
                Math.max(usual * LONG_RUNNING_FACTOR, usual + 60_000)
            ) {
              items.push({
                ...base(run),
                detail: `Running for ${formatSpan(run.durationMs)}. 95% of ${run.workflowType} runs finish within ${formatSpan(usual)}.`,
                kind: "long-running",
                since: run.startTime,
              });
            }
          },
        );

        const recentFailures = (all ?? [])
          .filter(
            (run) =>
              (run.status === "Failed" || run.status === "TimedOut") &&
              run.closeTime &&
              now - Date.parse(run.closeTime) < RECENT_FAILURE_WINDOW_MS,
          )
          .sort((a, b) => b.closeTime!.localeCompare(a.closeTime!))
          .slice(0, MAX_RECENT_FAILURES);

        for (const run of recentFailures) {
          items.push({
            ...base(run),
            detail:
              run.status === "TimedOut"
                ? `Timed out after ${formatSpan(run.durationMs)}.`
                : `Failed after ${formatSpan(run.durationMs)}.`,
            kind: "failed",
            since: run.closeTime,
          });
        }

        return {
          checkedRunning: checked.length,
          items,
          totalRunning: running.length,
        };
      },
    );

    return { ...remembered.value, ageMs: Date.now() - remembered.takenAt };
  }

  async listWorkflows(args: {
    /** False skips the status counts, which cost a scan of the whole namespace. */
    includeCounts?: boolean;
    /** False skips the rows, for a caller that only wants the counts. */
    includeList?: boolean;
    namespace: string;
    nextPageToken?: string;
    pageSize?: number;
    query?: string;
    sort?: TemporalWorkflowSort;
  }): Promise<TemporalListWorkflowsResponse> {
    const {
      includeCounts = true,
      includeList = true,
      namespace,
      query = "",
      pageSize = 50,
      sort,
    } = args;
    const countQuery = query.trim()
      ? `${query.trim()} GROUP BY ExecutionStatus`
      : "GROUP BY ExecutionStatus";
    const sortedOffset = args.nextPageToken?.match(SORTED_OFFSET_TOKEN);
    const matching = sort ? await this.matchingRuns(namespace, query) : null;

    if (sort && matching?.value) {
      const offset = sortedOffset ? Number(sortedOffset[1]) : 0;
      const sortedRuns = sortWorkflowRuns(matching.value, sort);
      const countsByStatus: Partial<Record<TemporalWorkflowStatus, number>> =
        {};

      for (const run of sortedRuns) {
        countsByStatus[run.status] = (countsByStatus[run.status] ?? 0) + 1;
      }

      return {
        countsByStatus,
        executions: includeList
          ? sortedRuns.slice(offset, offset + pageSize)
          : [],
        ...(offset + pageSize < sortedRuns.length
          ? { nextPageToken: `offset:${offset + pageSize}` }
          : {}),
        sorted: {
          ageMs: Date.now() - matching.takenAt,
          rowCount: sortedRuns.length,
        },
        totalCount: sortedRuns.length,
      };
    }

    const listPages = async () => {
      const executions: TemporalWorkflowExecution[] = [];
      // An offset belongs to a sorted list, so it cannot continue this one.
      let pageToken: Uint8Array | undefined =
        args.nextPageToken && !sortedOffset
          ? Buffer.from(args.nextPageToken, "base64")
          : undefined;

      for (
        let page = 0;
        includeList && page < MAX_LIST_PAGES_PER_REQUEST;
        page++
      ) {
        const listRes = await this.#withVisibilitySlot("list", () =>
          this.unary(
            "ListWorkflowExecutions",
            ws.ListWorkflowExecutionsRequest,
            ws.ListWorkflowExecutionsResponse,
            {
              namespace,
              nextPageToken: pageToken,
              pageSize: pageSize - executions.length,
              query,
            },
          ),
        );

        for (const info of listRes.executions ?? []) {
          executions.push(normalizeExecutionInfo(namespace, info));
        }

        pageToken =
          listRes.nextPageToken && listRes.nextPageToken.length > 0
            ? listRes.nextPageToken
            : undefined;

        if (!pageToken || executions.length >= pageSize) {
          break;
        }
      }

      return { executions, pageToken };
    };

    const [{ executions, pageToken }, countRes] = await Promise.all([
      listPages(),
      includeCounts
        ? this.#withVisibilitySlot("count", () =>
            this.unary(
              "CountWorkflowExecutions",
              ws.CountWorkflowExecutionsRequest,
              ws.CountWorkflowExecutionsResponse,
              {
                namespace,
                query: countQuery,
              },
            ),
          ).catch(() => null)
        : null,
    ]);

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
      ...(pageToken
        ? { nextPageToken: Buffer.from(pageToken).toString("base64") }
        : {}),
      ...(sort
        ? {
            sortSkippedReason: `More than ${MAX_SORTED_RUNS.toLocaleString("en-US")} workflows match, so they are listed in the server's order. Add a filter to sort them.`,
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
    const describedRunId =
      describeRes.workflowExecutionInfo?.execution?.runId || runId;
    const describedHistoryLength = toNumber(
      describeRes.workflowExecutionInfo?.historyLength,
    );
    const cacheKey = describedRunId
      ? `${namespace}\n${workflowId}\n${describedRunId}`
      : null;
    const cached = cacheKey ? this.#historyCache.get(cacheKey) : undefined;

    if (
      cacheKey &&
      cached &&
      describedHistoryLength > 0 &&
      cached.historyLength === describedHistoryLength
    ) {
      this.#historyCache.delete(cacheKey);
      this.#historyCache.set(cacheKey, cached);

      const describeCodec = await decodePayloadsInPlace(
        this.#config.codec,
        namespace,
        describeRes,
      );
      const execution = normalizeExecutionInfo(
        namespace,
        describeRes.workflowExecutionInfo,
        {
          pendingActivities: describeRes.pendingActivities,
          pendingChildren: describeRes.pendingChildren,
        },
      );
      const codec: CodecDecodeResult = {
        decoded: cached.codec.decoded + describeCodec.decoded,
        encoded: cached.codec.encoded + describeCodec.encoded,
        ...((describeCodec.error ?? cached.codec.error)
          ? { error: describeCodec.error ?? cached.codec.error }
          : {}),
      };

      return {
        ...buildExecutionDetail({ execution, rawEvents: cached.rawEvents }),
        rawHistoryJson: cached.rawHistoryJson,
        ...(codec.decoded > 0 || codec.encoded > 0 ? { codec } : {}),
        ...(cached.historyTailIncluded ? { historyTailIncluded: true } : {}),
        ...(cached.historyTruncated ? { historyTruncated: true } : {}),
      };
    }

    // Fetch up to 2,000 history events across pages (safe for browser payload size)
    const rawEvents: Record<string, unknown>[] = [];
    const historyMessages: proto.temporal.api.history.v1.HistoryEvent[] = [];
    let nextPageToken: Uint8Array | undefined;
    for (let page = 0; page < 10; page += 1) {
      const histRes = await this.unary(
        "GetWorkflowExecutionHistory",
        ws.GetWorkflowExecutionHistoryRequest,
        ws.GetWorkflowExecutionHistoryResponse,
        {
          execution: {
            runId: describedRunId,
            workflowId,
          },
          maximumPageSize: 200,
          namespace,
          nextPageToken,
        },
      );
      const events = histRes.history?.events ?? [];
      for (const evt of events) {
        const message = proto.temporal.api.history.v1.HistoryEvent.create(evt);
        historyMessages.push(message);
        const obj = proto.temporal.api.history.v1.HistoryEvent.toObject(
          message,
          {
            bytes: Buffer,
            defaults: false,
            enums: String,
            longs: Number,
          },
        ) as Record<string, unknown>;
        rawEvents.push(obj);
      }
      nextPageToken =
        histRes.nextPageToken && histRes.nextPageToken.length > 0
          ? histRes.nextPageToken
          : undefined;

      if (!nextPageToken) {
        break;
      }
    }

    // When a history is truncated, read the latest events in reverse so the
    // closing outcome, failure details, and latest reset points are still shown.
    let historyTailIncluded = false;
    if (nextPageToken) {
      const reverseRes = await this.unary(
        "GetWorkflowExecutionHistoryReverse",
        ws.GetWorkflowExecutionHistoryReverseRequest,
        ws.GetWorkflowExecutionHistoryReverseResponse,
        {
          execution: {
            runId: describedRunId,
            workflowId,
          },
          maximumPageSize: 100,
          namespace,
        },
      ).catch(() => null);

      const tailEvents = [...(reverseRes?.history?.events ?? [])].reverse();
      if (tailEvents.length > 0) {
        const seenIds = new Set(
          rawEvents.map((event) => toNumber(event.eventId)),
        );
        for (const evt of tailEvents) {
          const message =
            proto.temporal.api.history.v1.HistoryEvent.create(evt);
          const id = toNumber(message.eventId);
          if (id > 0 && seenIds.has(id)) {
            continue;
          }
          seenIds.add(id);
          historyMessages.push(message);
          rawEvents.push(
            proto.temporal.api.history.v1.HistoryEvent.toObject(message, {
              bytes: Buffer,
              defaults: false,
              enums: String,
              longs: Number,
            }) as Record<string, unknown>,
          );
          historyTailIncluded = true;
        }
      }
    }

    // The history as the server stores it, in the form the SDKs' replayers read.
    const rawHistoryJson = {
      events: historyMessages.map((event) =>
        toProto3Json(
          proto.temporal.api.history.v1.HistoryEvent.toObject(event, {
            bytes: String,
            defaults: false,
            enums: String,
            longs: String,
          }),
        ),
      ),
    };

    // One codec request for the whole run: its history, memo and pending Activities.
    const codec = await decodePayloadsInPlace(this.#config.codec, namespace, [
      describeRes,
      rawEvents,
    ]);
    const execution = normalizeExecutionInfo(
      namespace,
      describeRes.workflowExecutionInfo,
      {
        pendingActivities: describeRes.pendingActivities,
        pendingChildren: describeRes.pendingChildren,
      },
    );

    if (cacheKey && describedHistoryLength > 0 && !codec.error) {
      this.#historyCache.delete(cacheKey);
      this.#historyCache.set(cacheKey, {
        codec,
        historyLength: describedHistoryLength,
        historyTailIncluded,
        historyTruncated: Boolean(nextPageToken),
        rawEvents,
        rawHistoryJson,
      });

      for (const oldKey of this.#historyCache.keys()) {
        if (this.#historyCache.size <= HISTORY_CACHE_MAX_KEPT) {
          break;
        }
        this.#historyCache.delete(oldKey);
      }
    }

    return {
      ...buildExecutionDetail({ execution, rawEvents }),
      rawHistoryJson,
      ...(codec.decoded > 0 || codec.encoded > 0 ? { codec } : {}),
      ...(historyTailIncluded ? { historyTailIncluded: true } : {}),
      ...(nextPageToken ? { historyTruncated: true } : {}),
    };
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
      input: await this.#encodeArgs(namespace, input.args),
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
          signalInput: await this.#encodeArgs(namespace, input.signalArgs),
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
          queryArgs: await this.#encodeArgs(args.namespace, args.args),
          queryType: args.queryType,
        },
      },
      10_000,
    );
    await decodePayloadsInPlace(this.#config.codec, args.namespace, res);

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
        input: await this.#encodeArgs(args.namespace, args.args),
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
            args: await this.#encodeArgs(args.namespace, args.args),
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
    await decodePayloadsInPlace(this.#config.codec, args.namespace, res);
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

  /**
   * Starts a new run from the history up to one completed Workflow Task and
   * terminates the current run. Signals that arrived after that point are
   * applied to the new run again.
   */
  async resetWorkflow(args: {
    eventId: number;
    namespace: string;
    reason?: string;
    runId: string;
    workflowId: string;
  }): Promise<{ runId: string }> {
    const res = await this.unary(
      "ResetWorkflowExecution",
      ws.ResetWorkflowExecutionRequest,
      ws.ResetWorkflowExecutionResponse,
      // `fromObject` turns the event id into the 64-bit integer the field holds.
      ws.ResetWorkflowExecutionRequest.fromObject({
        identity: "prisma-studio",
        namespace: args.namespace,
        reason: args.reason || "Reset via Prisma Studio",
        requestId: crypto.randomUUID(),
        workflowExecution: { runId: args.runId, workflowId: args.workflowId },
        workflowTaskFinishEventId: args.eventId,
      }),
    );

    this.#remembered.clear();

    return { runId: res.runId ?? "" };
  }

  /** Pauses, unpauses or resets one pending Activity of a run. */
  async activityOperation(args: {
    activityId: string;
    namespace: string;
    operation: TemporalActivityOperation;
    reason?: string;
    runId?: string;
    workflowId: string;
  }): Promise<{ ok: true }> {
    const request = {
      execution: {
        ...(args.runId ? { runId: args.runId } : {}),
        workflowId: args.workflowId,
      },
      id: args.activityId,
      identity: "prisma-studio",
      namespace: args.namespace,
    };

    if (args.operation === "pause") {
      await this.unary(
        "PauseActivity",
        ws.PauseActivityRequest,
        ws.PauseActivityResponse,
        { ...request, reason: args.reason || "Paused via Prisma Studio" },
      );
    } else if (args.operation === "unpause") {
      await this.unary(
        "UnpauseActivity",
        ws.UnpauseActivityRequest,
        ws.UnpauseActivityResponse,
        request,
      );
    } else {
      // A reset starts the attempts from one and runs the Activity at once.
      await this.unary(
        "ResetActivity",
        ws.ResetActivityRequest,
        ws.ResetActivityResponse,
        { ...request, resetHeartbeat: true },
      );
    }

    return { ok: true };
  }

  async setWorkflowPaused(args: {
    namespace: string;
    paused: boolean;
    reason?: string;
    runId?: string;
    workflowId: string;
  }): Promise<{ ok: true }> {
    const request = {
      identity: "prisma-studio",
      namespace: args.namespace,
      reason:
        args.reason ||
        `${args.paused ? "Paused" : "Resumed"} via Prisma Studio`,
      requestId: crypto.randomUUID(),
      runId: args.runId,
      workflowId: args.workflowId,
    };

    if (args.paused) {
      await this.unary(
        "PauseWorkflowExecution",
        ws.PauseWorkflowExecutionRequest,
        ws.PauseWorkflowExecutionResponse,
        request,
      );
    } else {
      await this.unary(
        "UnpauseWorkflowExecution",
        ws.UnpauseWorkflowExecutionRequest,
        ws.UnpauseWorkflowExecutionResponse,
        request,
      );
    }

    return { ok: true };
  }

  /**
   * Starts a bulk action and returns at once. The job runs in this process: it
   * acts on the given runs, or on every running run that matches `query`, six
   * at a time, and `getBulkJob` reports how far it is.
   */
  async startBulkJob(
    namespace: string,
    req: TemporalBulkJobRequest,
  ): Promise<TemporalBulkJob> {
    let items = req.items;

    if (!items) {
      const matching = await this.matchingRuns(namespace, req.query ?? "");

      if (!matching.value) {
        throw Object.assign(
          new Error(
            `More than ${MAX_SORTED_RUNS.toLocaleString("en-US")} workflows match. Add a filter to act on fewer.`,
          ),
          { httpStatus: 412 },
        );
      }

      // Only an open run (Running or Paused) can take a Signal, a cancellation or a termination.
      items = matching.value
        .filter((run) => run.status === "Running" || run.status === "Paused")
        .map((run) => ({ runId: run.runId, workflowId: run.workflowId }));
    }

    const job: TemporalBulkJob & { abort: boolean } = {
      abort: false,
      action: req.action,
      done: 0,
      errors: [],
      failed: 0,
      id: crypto.randomUUID(),
      ...(req.items ? {} : { query: req.query ?? "" }),
      startedAt: new Date().toISOString(),
      state: "running",
      total: items.length,
    };

    this.#bulkJobs.set(job.id, job);

    // Keep the newest jobs only; a finished job is read once or twice.
    for (const oldId of this.#bulkJobs.keys()) {
      if (this.#bulkJobs.size <= 20) {
        break;
      }

      this.#bulkJobs.delete(oldId);
    }

    const targets = items;
    let index = 0;

    void forEachConcurrently(
      Array.from({ length: Math.min(6, targets.length) }),
      6,
      async () => {
        while (index < targets.length && !job.abort) {
          const item = targets[index++]!;
          const result = await this.bulkAction(namespace, {
            action: req.action,
            items: [item],
            reason: req.reason,
            signalArgs: req.signalArgs,
            signalName: req.signalName,
          });

          job.done++;

          if (result.failed > 0) {
            job.failed++;

            if (job.errors.length < 20) {
              job.errors.push({
                error: result.results[0]?.error ?? "failed",
                workflowId: item.workflowId,
              });
            }
          }
        }
      },
    ).finally(() => {
      job.state = job.abort && job.done < job.total ? "aborted" : "completed";
      job.finishedAt = new Date().toISOString();
      // The lists the BFF holds are stale now.
      this.#remembered.clear();
    });

    return this.getBulkJob(job.id);
  }

  getBulkJob(id: string): TemporalBulkJob {
    const job = this.#bulkJobs.get(id);

    if (!job) {
      throw Object.assign(new Error(`No bulk job ${id}`), { httpStatus: 404 });
    }

    const { abort: _abort, ...publicJob } = job;

    return { ...publicJob, errors: [...job.errors] };
  }

  abortBulkJob(id: string): TemporalBulkJob {
    const job = this.#bulkJobs.get(id);

    if (job) {
      job.abort = true;
    }

    return this.getBulkJob(id);
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
    options: { nextPageToken?: string; pageSize?: number } = {},
  ): Promise<TemporalListSchedulesResponse> {
    const res = await this.unary(
      "ListSchedules",
      ws.ListSchedulesRequest,
      ws.ListSchedulesResponse,
      {
        maximumPageSize: options.pageSize ?? 100,
        namespace,
        ...(options.nextPageToken
          ? { nextPageToken: Buffer.from(options.nextPageToken, "base64") }
          : {}),
      },
    );

    const entries = (res.schedules ?? []).filter((entry) =>
      Boolean(entry.scheduleId),
    );
    const summaries: TemporalScheduleSummary[] = [];

    await forEachConcurrently(entries, 8, async (entry) => {
      const scheduleId = entry.scheduleId!;

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
    });

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
    await decodePayloadsInPlace(this.#config.codec, namespace, desc);

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

  /** The spec, policies and action a schedule form describes. */
  async #scheduleFromInput(
    namespace: string,
    input: TemporalCreateScheduleInput,
  ): Promise<proto.temporal.api.schedule.v1.ISchedule> {
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
    if (input.timezone && input.timezone.trim().length > 0) {
      spec.timezoneName = input.timezone.trim();
    }

    return {
      action: {
        startWorkflow: {
          input: await this.#encodeArgs(namespace, input.args ?? []),
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
    };
  }

  async createSchedule(
    namespace: string,
    input: TemporalCreateScheduleInput,
  ): Promise<{ ok: true; scheduleId: string }> {
    await this.unary(
      "CreateSchedule",
      ws.CreateScheduleRequest,
      ws.CreateScheduleResponse,
      {
        identity: "prisma-studio",
        namespace,
        requestId: crypto.randomUUID(),
        schedule: await this.#scheduleFromInput(namespace, input),
        scheduleId: input.scheduleId,
      },
    );

    return { ok: true, scheduleId: input.scheduleId };
  }

  /**
   * Replaces a schedule's cadence, policies, action and notes. Whether it is
   * paused and how many actions it has left stay as they are. The conflict
   * token makes the server refuse the change if the schedule changed since it was read.
   */
  async updateSchedule(
    namespace: string,
    scheduleId: string,
    input: TemporalCreateScheduleInput,
  ): Promise<{ ok: true; scheduleId: string }> {
    const current = await this.unary(
      "DescribeSchedule",
      ws.DescribeScheduleRequest,
      ws.DescribeScheduleResponse,
      { namespace, scheduleId },
    );
    const next = await this.#scheduleFromInput(namespace, {
      ...input,
      scheduleId,
    });

    await this.unary(
      "UpdateSchedule",
      ws.UpdateScheduleRequest,
      ws.UpdateScheduleResponse,
      {
        conflictToken: current.conflictToken,
        identity: "prisma-studio",
        namespace,
        requestId: crypto.randomUUID(),
        schedule: {
          ...next,
          state: {
            ...current.schedule?.state,
            notes: input.notes || "",
          },
        },
        scheduleId,
      },
    );

    return { ok: true, scheduleId };
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

  /**
   * Every Task Queue of the namespace, counted from all its runs. Queues that
   * only run Activities come from Workflow histories (`#activityRouting`), and
   * retries come from the attention check, because no list call reports either.
   *
   * A namespace too large to copy is counted from its running runs: a count of
   * the first page of all runs would be a count of whichever runs the server
   * lists first. The failed and total counts are then not known.
   */
  async listTaskQueues(namespace: string): Promise<TemporalTaskQueuesResponse> {
    const [all, scheduleList, attention, routing] = await Promise.all([
      this.matchingRuns(namespace, ""),
      this.#remember(`schedules\n${namespace}`, SCHEDULES_MIN_AGE_MS, () =>
        this.listSchedules(namespace),
      )
        .then((remembered) => remembered.value)
        .catch(() => ({ schedules: [] })),
      this.getAttention(namespace).catch(() => null),
      this.#activityRouting(namespace).catch(
        () => new Map<string, Map<string, string>>(),
      ),
    ]);
    const complete = all.value !== null;
    const running = complete
      ? null
      : await this.matchingRuns(namespace, RUNNING_QUERY);
    const runs =
      all.value ??
      running?.value ??
      (
        await this.listWorkflows({
          includeCounts: false,
          namespace,
          pageSize: SORTED_RUNS_PAGE_SIZE,
          query: RUNNING_QUERY,
        })
      ).executions;
    const counted = all.value ? all : running?.value ? running : null;

    const queueMap = new Map<string, TemporalTaskQueueSummary>();
    const typeCounts = new Map<string, Map<string, number>>();
    const ensureQueue = (name: string): TemporalTaskQueueSummary => {
      let existing = queueMap.get(name);
      if (!existing) {
        existing = {
          activeWorkflowCount: 0,
          activityTypes: [],
          failedWorkflowCount: complete ? 0 : null,
          health: "idle",
          name,
          pendingActivityCount: 0,
          pendingBacklogCount: 0,
          pollers: [],
          retryingActivityCount: 0,
          retryingWorkflowCount: 0,
          scheduleCount: 0,
          totalWorkflowCount: complete ? 0 : null,
          workflowTypes: [],
          workflows: [],
        };
        queueMap.set(name, existing);
      }
      return existing;
    };

    for (const sched of scheduleList.schedules) {
      ensureQueue(sched.taskQueue || "default").scheduleCount += 1;
    }

    const retryingRunIds = new Set(
      (attention?.items ?? [])
        .filter((item) => item.kind === "activity-retrying")
        .map((item) => item.runId),
    );

    for (const run of runs) {
      const queue = ensureQueue(run.taskQueue || "default");
      const counts = typeCounts.get(queue.name) ?? new Map<string, number>();

      counts.set(run.workflowType, (counts.get(run.workflowType) ?? 0) + 1);
      typeCounts.set(queue.name, counts);

      if (queue.totalWorkflowCount !== null) {
        queue.totalWorkflowCount += 1;
      }

      if (run.status === "Running") {
        queue.activeWorkflowCount += 1;

        if (retryingRunIds.has(run.runId)) {
          queue.retryingWorkflowCount += 1;
        }
      } else if (
        run.status === "Failed" &&
        queue.failedWorkflowCount !== null
      ) {
        queue.failedWorkflowCount += 1;
      }

      if (!queue.lastActivityTime || run.startTime > queue.lastActivityTime) {
        queue.lastActivityTime = run.startTime;
      }

      queue.workflows.push({
        hasRetryingActivity: retryingRunIds.has(run.runId),
        runId: run.runId,
        startTime: run.startTime,
        status: run.status,
        workflowId: run.workflowId,
        workflowType: run.workflowType,
      });
    }

    // The queue each Activity Type runs on, including queues no Workflow runs on.
    for (const [workflowType, activityQueues] of routing) {
      for (const [activityType, queueName] of activityQueues) {
        const queue = ensureQueue(queueName);

        if (!queue.activityTypes.includes(activityType)) {
          queue.activityTypes.push(activityType);
        }

        for (const item of attention?.items ?? []) {
          if (
            item.workflowType === workflowType &&
            item.activityType === activityType
          ) {
            queue.pendingActivityCount += 1;

            if (item.kind === "activity-retrying") {
              queue.retryingActivityCount += 1;
            }
          }
        }
      }
    }

    for (const queue of queueMap.values()) {
      queue.activityTypes.sort();
      queue.workflowTypes = [...(typeCounts.get(queue.name) ?? [])]
        .map(([name, count]) => ({ count, name }))
        .sort((a, b) => b.count - a.count);
      // The newest runs first; the browser shows a few of them.
      queue.workflows = queue.workflows
        .sort((a, b) => b.startTime.localeCompare(a.startTime))
        .slice(0, 25);
    }

    if (queueMap.size === 0) {
      ensureQueue("default");
    }

    let source: TemporalTaskQueuesResponse["source"] = "synthesized";
    describeQueues: for (const q of queueMap.values()) {
      for (const [taskQueueType, kind] of [
        [enums.TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW, "workflow"],
        [enums.TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY, "activity"],
      ] as const) {
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
              taskQueueType,
            },
          );
          source = "describe-task-queue";
          q.pollers.push(
            ...(desc.pollers ?? []).map<TemporalTaskQueuePoller>((p) => ({
              identity: p.identity || "worker",
              lastAccessTime:
                decodeTimestampIso(p.lastAccessTime as never) || undefined,
              ratePerSecond: p.ratePerSecond || undefined,
              taskQueueType: kind,
            })),
          );
          q.pendingBacklogCount += Number(
            desc.taskQueueStatus?.backlogCountHint ?? 0,
          );
        } catch {
          // UNIMPLEMENTED on slate-temporal-next: it does not report pollers.
          break describeQueues;
        }
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

    const waitingByQueue = new Map<string, number>();

    for (const item of attention?.items ?? []) {
      if (item.kind === "no-worker") {
        waitingByQueue.set(
          item.taskQueue,
          (waitingByQueue.get(item.taskQueue) ?? 0) + 1,
        );
      }
    }

    for (const q of queueMap.values()) {
      const hasWork = q.activeWorkflowCount > 0 || q.pendingActivityCount > 0;

      if (
        source === "describe-task-queue"
          ? hasWork && q.pollers.length === 0
          : (waitingByQueue.get(q.name) ?? 0) > 0
      ) {
        q.health = "stalled";
      } else if (q.pendingBacklogCount > 10) {
        q.health = "backlogged";
      } else if (q.retryingWorkflowCount > 0 || q.retryingActivityCount > 0) {
        q.health = "retrying";
      } else if (hasWork || q.pollers.length > 0 || q.scheduleCount > 0) {
        q.health = "healthy";
      } else {
        q.health = "idle";
      }
    }

    return {
      ageMs: counted ? Date.now() - counted.takenAt : 0,
      complete,
      matcherOldestReadyMs,
      pollersSupported: source === "describe-task-queue",
      queues: Array.from(queueMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      runningComplete: counted !== null,
      source,
    };
  }

  /**
   * Workers, Worker Deployments and Nexus Endpoints. The Workers come from the
   * pollers of every Task Queue, grouped by identity, because that works on
   * every server that reports pollers and needs no Worker heartbeats.
   */
  async getWorkers(namespace: string): Promise<TemporalWorkersResponse> {
    const [queues, deployments, endpoints] = await Promise.all([
      this.listTaskQueues(namespace),
      this.unary(
        "ListWorkerDeployments",
        ws.ListWorkerDeploymentsRequest,
        ws.ListWorkerDeploymentsResponse,
        { namespace, pageSize: 100 },
      ).catch(() => null),
      this.operatorUnary(
        "ListNexusEndpoints",
        operator.ListNexusEndpointsRequest,
        operator.ListNexusEndpointsResponse,
        { pageSize: 100 },
      ).catch(() => null),
    ]);
    const workers = new Map<string, TemporalWorker>();

    for (const queue of queues.queues) {
      for (const poller of queue.pollers) {
        const worker = workers.get(poller.identity) ?? {
          identity: poller.identity,
          taskQueues: [],
        };

        worker.taskQueues.push({
          name: queue.name,
          type: poller.taskQueueType,
        });

        if (
          poller.lastAccessTime &&
          (!worker.lastAccessTime ||
            poller.lastAccessTime > worker.lastAccessTime)
        ) {
          worker.lastAccessTime = poller.lastAccessTime;
        }

        workers.set(poller.identity, worker);
      }
    }

    return {
      deployments: deployments
        ? (deployments.workerDeployments ?? []).map((deployment) => ({
            createTime: decodeTimestampIso(deployment.createTime),
            currentVersion:
              deployment.routingConfig?.currentDeploymentVersion?.buildId ||
              deployment.routingConfig?.currentVersion ||
              undefined,
            name: deployment.name ?? "",
            rampingPercentage:
              deployment.routingConfig?.rampingVersionPercentage || undefined,
            rampingVersion:
              deployment.routingConfig?.rampingDeploymentVersion?.buildId ||
              deployment.routingConfig?.rampingVersion ||
              undefined,
          }))
        : null,
      nexusEndpoints: endpoints
        ? (endpoints.endpoints ?? []).map((endpoint) => {
            const target = endpoint.spec?.target;
            const description = decodeSinglePayload(
              endpoint.spec?.description as never,
            );

            return {
              createdTime: decodeTimestampIso(endpoint.createdTime),
              ...(typeof description === "string" && description
                ? { description }
                : {}),
              id: endpoint.id ?? "",
              name: endpoint.spec?.name ?? "",
              target: target?.worker
                ? `${target.worker.namespace}/${target.worker.taskQueue}`
                : (target?.external?.url ?? ""),
            };
          })
        : null,
      workers: queues.pollersSupported
        ? [...workers.values()].sort((a, b) =>
            a.identity.localeCompare(b.identity),
          )
        : null,
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
    const healthRaw = (loadRaw.health ?? {}) as Record<string, unknown>;
    const healthReasons = (
      Array.isArray(healthRaw.reasons)
        ? (healthRaw.reasons as Array<Record<string, unknown>>)
        : []
    ).map<TemporalClusterHealthReason>((reason) => ({
      ...(reason.scope === "shard" && typeof reason.shard === "number"
        ? { shard: reason.shard }
        : {}),
      signal: String(reason.signal ?? ""),
      unit: String(reason.unit ?? "count"),
      value: Number(reason.value ?? 0),
    }));

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
        healthReasons: healthReasons.filter((reason) => reason.shard === id),
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
        reasons: healthReasons,
        state: String(healthRaw.state ?? "ok"),
        tags: Array.isArray(healthRaw.tags) ? healthRaw.tags.map(String) : [],
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

const CRON_FIELD_BOUNDS = {
  dayOfMonth: [1, 31],
  dayOfWeek: [0, 6],
  hour: [0, 23],
  minute: [0, 59],
  month: [1, 12],
} as const;

/**
 * Writes a structured calendar as the five-field cron expression it came from.
 * Returns undefined for a calendar that five fields cannot express (seconds
 * other than 0, or a year).
 */
export function structuredCalendarToCron(
  calendar:
    proto.temporal.api.schedule.v1.IStructuredCalendarSpec | null | undefined,
): string | undefined {
  if (!calendar) {
    return undefined;
  }

  const seconds = calendar.second ?? [];
  const onlySecondZero =
    seconds.length === 0 ||
    (seconds.length === 1 &&
      (seconds[0]!.start ?? 0) === 0 &&
      (seconds[0]!.end ?? 0) === 0);

  if (!onlySecondZero || (calendar.year ?? []).length > 0) {
    return undefined;
  }

  const field = (name: keyof typeof CRON_FIELD_BOUNDS): string => {
    const [min, max] = CRON_FIELD_BOUNDS[name];
    const ranges = calendar[name] ?? [];

    if (ranges.length === 0) {
      // An absent field means its lowest value, except day of week, which means every day.
      return name === "dayOfWeek" ? "*" : String(min);
    }

    return ranges
      .map((range) => {
        const start = range.start ?? 0;
        const end = Math.max(range.end ?? 0, start);
        const step = range.step && range.step > 1 ? range.step : 1;
        const span =
          start === min && end === max
            ? "*"
            : start === end
              ? String(start)
              : `${start}-${end}`;

        return step > 1 ? `${span}/${step}` : span;
      })
      .join(",");
  };

  return [
    field("minute"),
    field("hour"),
    field("dayOfMonth"),
    field("month"),
    field("dayOfWeek"),
  ].join(" ");
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
  // A standard server stores a cron string as a structured calendar and returns that.
  const cronExpression =
    sched?.spec?.cronString?.[0] ||
    structuredCalendarToCron(sched?.spec?.structuredCalendar?.[0]) ||
    undefined;

  return {
    actionCount: Number(info?.actionCount ?? 0),
    cadenceSummary: cronExpression
      ? `Cron ${cronExpression}`
      : formatScheduleSpecSummary(sched?.spec),
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
    ...(sched?.spec?.timezoneName ? { timezone: sched.spec.timezoneName } : {}),
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
        const sortField = url.searchParams.get("sort");
        return Response.json(
          await client.listWorkflows({
            includeCounts: url.searchParams.get("counts") !== "0",
            includeList: url.searchParams.get("list") !== "0",
            namespace,
            nextPageToken,
            pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 50,
            query,
            ...(isWorkflowSortField(sortField)
              ? {
                  sort: {
                    direction:
                      url.searchParams.get("dir") === "asc" ? "asc" : "desc",
                    field: sortField,
                  },
                }
              : {}),
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

    const bulkJobsMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/bulk-jobs(?:\/([^/]+))?$/,
    );
    if (bulkJobsMatch) {
      const namespace = decodeURIComponent(bulkJobsMatch[1]!);
      const jobId = bulkJobsMatch[2];

      if (!jobId && request.method === "POST") {
        return Response.json(
          await client.startBulkJob(
            namespace,
            (await request.json()) as TemporalBulkJobRequest,
          ),
          { status: 202 },
        );
      }

      if (jobId && request.method === "GET") {
        return Response.json(client.getBulkJob(jobId));
      }

      if (jobId && request.method === "DELETE") {
        return Response.json(client.abortBulkJob(jobId));
      }
    }

    const actionMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflows\/([^/]+)\/(query|signal|update|cancel|terminate|reset-sticky|reset|activity|pause|unpause)$/,
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

      if (action === "reset") {
        return Response.json(
          await client.resetWorkflow({
            eventId: Number(body.eventId),
            namespace,
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId: runId ?? "",
            workflowId,
          }),
        );
      }

      if (action === "activity") {
        return Response.json(
          await client.activityOperation({
            activityId: String(body.activityId ?? ""),
            namespace,
            operation: body.operation as TemporalActivityOperation,
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId,
            workflowId,
          }),
        );
      }

      if (action === "pause" || action === "unpause") {
        return Response.json(
          await client.setWorkflowPaused({
            namespace,
            paused: action === "pause",
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId,
            workflowId,
          }),
        );
      }

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
        const nextPageToken =
          url.searchParams.get("nextPageToken") ?? undefined;
        const pageSizeParam = Number.parseInt(
          url.searchParams.get("pageSize") ?? "",
          10,
        );
        const pageSize =
          Number.isFinite(pageSizeParam) && pageSizeParam > 0
            ? Math.min(pageSizeParam, 200)
            : undefined;
        return Response.json(
          await client.listSchedules(namespace, { nextPageToken, pageSize }),
        );
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
      if (request.method === "PUT") {
        return Response.json(
          await client.updateSchedule(
            namespace,
            scheduleId,
            (await request.json()) as TemporalCreateScheduleInput,
          ),
        );
      }
      if (request.method === "DELETE") {
        return Response.json(
          await client.deleteSchedule(namespace, scheduleId),
        );
      }
    }

    const workersMatch = subPath.match(/^\/v1\/namespaces\/([^/]+)\/workers$/);
    if (workersMatch && request.method === "GET") {
      return Response.json(
        await client.getWorkers(decodeURIComponent(workersMatch[1]!)),
      );
    }

    const facetsMatch = subPath.match(/^\/v1\/namespaces\/([^/]+)\/facets$/);
    if (facetsMatch && request.method === "GET") {
      return Response.json(
        await client.getFacets(decodeURIComponent(facetsMatch[1]!)),
      );
    }

    const typeInputsMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflow-types\/([^/]+)\/inputs$/,
    );
    if (typeInputsMatch && request.method === "GET") {
      return Response.json(
        await client.getTypeInputs(
          decodeURIComponent(typeInputsMatch[1]!),
          decodeURIComponent(typeInputsMatch[2]!),
        ),
      );
    }

    const typeMapMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflow-types\/([^/]+)\/map$/,
    );
    if (typeMapMatch && request.method === "GET") {
      return Response.json(
        await client.getTypeMap(
          decodeURIComponent(typeMapMatch[1]!),
          decodeURIComponent(typeMapMatch[2]!),
        ),
      );
    }

    const attentionMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/attention$/,
    );
    if (attentionMatch && request.method === "GET") {
      return Response.json(
        await client.getAttention(decodeURIComponent(attentionMatch[1]!)),
      );
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
