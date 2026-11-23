import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

import type {
  TemporalActivityOperation,
  TemporalAdmissionUpdateInput,
  TemporalAttentionResponse,
  TemporalBulkActionRequest,
  TemporalBulkActionResponse,
  TemporalBulkJob,
  TemporalBulkJobRequest,
  TemporalBulkScheduleRequest,
  TemporalBulkScheduleResponse,
  TemporalCapabilities,
  TemporalClusterOverview,
  TemporalClusterTracesResponse,
  TemporalCreateScheduleInput,
  TemporalExecutionDetail,
  TemporalFacets,
  TemporalFollowMode,
  TemporalListSchedulesResponse,
  TemporalListWorkflowsResponse,
  TemporalNamespace,
  TemporalPatchScheduleInput,
  TemporalQueryResult,
  TemporalScheduleDetail,
  TemporalStartWorkflowInput,
  TemporalStartWorkflowResult,
  TemporalTaskQueuesResponse,
  TemporalTypeInputsResponse,
  TemporalTypeMapResponse,
  TemporalUpdateResult,
  TemporalWorkersResponse,
  TemporalWorkflowSort,
} from "@/data/temporal";

import { useStudio } from "../studio/context";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function temporalFetch<T>(
  baseUrl: string,
  subPath: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${trimTrailingSlash(baseUrl)}${subPath}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Temporal request failed (${res.status} ${res.statusText})`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // ignore parse failure
    }
    throw Object.assign(new Error(message), { status: res.status });
  }

  return (await res.json()) as T;
}

/**
 * A request the server refused (an invalid filter, an unknown workflow) fails
 * the same way every time, so its error is shown at once. A server failure, a
 * busy server (429) and a network failure are tried twice more.
 */
export function shouldRetryTemporalRequest(
  failureCount: number,
  error: unknown,
): boolean {
  const status = (error as { status?: unknown }).status;
  const wasRefused =
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 429;

  return !wasRefused && failureCount < 2;
}

export function useTemporalCapabilities() {
  const { temporalUrl } = useStudio();
  const enabled = typeof temporalUrl === "string" && temporalUrl.length > 0;

  return useQuery<TemporalCapabilities>({
    enabled,
    queryFn: () =>
      temporalFetch<TemporalCapabilities>(temporalUrl!, "/v1/capabilities"),
    queryKey: ["temporal", "capabilities", temporalUrl],
    staleTime: 60_000,
  });
}

export function useTemporalNamespaces() {
  const { temporalUrl } = useStudio();
  const enabled = typeof temporalUrl === "string" && temporalUrl.length > 0;

  return useQuery<TemporalNamespace[]>({
    enabled,
    queryFn: async () => {
      const data = await temporalFetch<{ namespaces: TemporalNamespace[] }>(
        temporalUrl!,
        "/v1/namespaces",
      );
      return data.namespaces;
    },
    queryKey: ["temporal", "namespaces", temporalUrl],
    staleTime: 30_000,
  });
}

export function useTemporalWorkflows(args: {
  /** False sends no request, for a caller that has nothing to ask yet. */
  enabled?: boolean;
  followMode: TemporalFollowMode;
  /** False skips the status counts, which cost the server a scan of the namespace. */
  includeCounts?: boolean;
  namespace: string;
  pageSize?: number;
  /** The token the previous page returned. Empty for the first page. */
  pageToken?: string;
  query: string;
  sort?: TemporalWorkflowSort;
}) {
  const { temporalUrl } = useStudio();
  const {
    namespace,
    query,
    followMode,
    includeCounts = true,
    pageSize = 50,
    pageToken = "",
    sort,
  } = args;
  const sortKey = sort ? `${sort.field}:${sort.direction}` : "";
  const enabled =
    args.enabled !== false &&
    typeof temporalUrl === "string" &&
    temporalUrl.length > 0 &&
    namespace.length > 0;
  const fetchWorkflows = (part: "counts" | "rows") => {
    const params = new URLSearchParams();
    if (query.trim().length > 0) {
      params.set("query", query.trim());
    }
    params.set("pageSize", String(pageSize));
    params.set(part === "rows" ? "counts" : "list", "0");
    if (sort) {
      params.set("sort", sort.field);
      params.set("dir", sort.direction);
    }
    if (part === "rows" && pageToken.length > 0) {
      params.set("nextPageToken", pageToken);
    }
    return temporalFetch<TemporalListWorkflowsResponse>(
      temporalUrl!,
      `/v1/namespaces/${encodeURIComponent(namespace)}/workflows?${params.toString()}`,
    );
  };

  const rows = useQuery<TemporalListWorkflowsResponse>({
    enabled,
    placeholderData: (prev) => prev,
    queryFn: () => fetchWorkflows("rows"),
    queryKey: [
      "temporal",
      "workflows",
      temporalUrl,
      namespace,
      query,
      pageSize,
      "rows",
      sortKey,
      pageToken,
    ],
    refetchInterval: followMode === "paused" ? false : 2_500,
    retry: shouldRetryTemporalRequest,
  });
  // A count can take seconds, because some servers scan the whole namespace
  // for it. So counts load apart from the rows and refresh less often.
  // No placeholder: the counts of the previous filter would be wrong for a new one.
  const counts = useQuery<TemporalListWorkflowsResponse>({
    enabled: enabled && includeCounts,
    queryFn: () => fetchWorkflows("counts"),
    queryKey: [
      "temporal",
      "workflows",
      temporalUrl,
      namespace,
      query,
      0,
      "counts",
      sortKey,
    ],
    refetchInterval: followMode === "paused" ? false : 10_000,
    retry: shouldRetryTemporalRequest,
  });
  const data = useMemo(
    () =>
      rows.data && counts.data
        ? {
            ...rows.data,
            countsByStatus: counts.data.countsByStatus,
            totalCount: counts.data.totalCount,
          }
        : rows.data,
    [counts.data, rows.data],
  );

  return {
    ...rows,
    data,
    /** False while the counts of this filter are still on their way. */
    hasCounts: counts.data !== undefined,
    /** True while the first counts of this filter are on their way. */
    isCounting: counts.isPending && counts.fetchStatus === "fetching",
    refetch: () => {
      void counts.refetch();
      return rows.refetch();
    },
  };
}

/**
 * How many runs the namespace has in each status, with no filter. The same
 * request as the counts of the unfiltered Workflows list, so they share one
 * response.
 */
export function useTemporalWorkflowCounts(args: {
  followMode: TemporalFollowMode;
  namespace: string;
}) {
  const { temporalUrl } = useStudio();
  const { followMode, namespace } = args;

  return useQuery<TemporalListWorkflowsResponse>({
    enabled:
      typeof temporalUrl === "string" &&
      temporalUrl.length > 0 &&
      namespace.length > 0,
    queryFn: () =>
      temporalFetch<TemporalListWorkflowsResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows?list=0`,
      ),
    queryKey: [
      "temporal",
      "workflows",
      temporalUrl,
      namespace,
      "",
      0,
      "counts",
      "",
    ],
    refetchInterval: followMode === "paused" ? false : 10_000,
    retry: shouldRetryTemporalRequest,
  });
}

export function useTemporalWorkflowDetail(args: {
  enabled?: boolean;
  followMode?: TemporalFollowMode;
  namespace: string;
  runId?: string;
  workflowId?: string;
}) {
  const { temporalUrl } = useStudio();
  const {
    namespace,
    workflowId,
    runId,
    followMode = "paused",
    enabled = true,
  } = args;
  const isReady =
    enabled &&
    typeof temporalUrl === "string" &&
    temporalUrl.length > 0 &&
    namespace.length > 0 &&
    typeof workflowId === "string" &&
    workflowId.length > 0;

  return useQuery<TemporalExecutionDetail>({
    enabled: isReady,
    placeholderData: (prev) => prev,
    queryFn: () =>
      fetchWorkflowDetail(temporalUrl!, namespace, workflowId!, runId),
    queryKey: [
      "temporal",
      "workflow-detail",
      temporalUrl,
      namespace,
      workflowId,
      runId,
    ],
    refetchInterval: (query) => {
      if (followMode === "paused") return false;
      const status = query.state.data?.execution.status;
      if (status && status !== "Running" && status !== "Paused") return false;
      return 2_000;
    },
  });
}

function fetchWorkflowDetail(
  temporalUrl: string,
  namespace: string,
  workflowId: string,
  runId: string | undefined,
) {
  const qs = runId ? `?runId=${encodeURIComponent(runId)}` : "";

  return temporalFetch<TemporalExecutionDetail>(
    temporalUrl,
    `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(workflowId)}${qs}`,
  );
}

/** The details of several runs at once, for the Child Workflows a timeline shows inline. */
export function useTemporalWorkflowDetails(args: {
  namespace: string;
  runs: Array<{ runId?: string; workflowId: string }>;
}) {
  const { temporalUrl } = useStudio();
  const { namespace, runs } = args;

  return useQueries({
    queries: runs.map((run) => ({
      enabled: typeof temporalUrl === "string" && temporalUrl.length > 0,
      queryFn: () =>
        fetchWorkflowDetail(temporalUrl!, namespace, run.workflowId, run.runId),
      queryKey: [
        "temporal",
        "workflow-detail",
        temporalUrl,
        namespace,
        run.workflowId,
        run.runId,
      ] as const,
      staleTime: 5_000,
    })),
  });
}

export interface TemporalHandlerDefinition {
  description?: string;
  name: string;
}

export interface TemporalWorkflowMetadata {
  currentDetails?: string;
  queries: TemporalHandlerDefinition[];
  signals: TemporalHandlerDefinition[];
  updates: TemporalHandlerDefinition[];
}

function readHandlerDefinitions(value: unknown): TemporalHandlerDefinition[] {
  return Array.isArray(value)
    ? value.flatMap((item: { description?: unknown; name?: unknown }) =>
        // Names that start with two underscores are the SDK's own handlers.
        typeof item?.name === "string" && !item.name.startsWith("__")
          ? [
              {
                ...(typeof item.description === "string" && item.description
                  ? { description: item.description }
                  : {}),
                name: item.name,
              },
            ]
          : [],
      )
    : [];
}

/**
 * The Queries, Signals and Updates a Workflow handles, and its current details
 * text. The Worker answers this through the SDK's built-in
 * `__temporal_workflow_metadata` Query, so it needs a running Worker.
 */
export function useTemporalWorkflowMetadata(args: {
  enabled?: boolean;
  namespace: string;
  runId?: string;
  workflowId: string;
}) {
  const { temporalUrl } = useStudio();
  const { enabled = true, namespace, runId, workflowId } = args;

  return useQuery<TemporalWorkflowMetadata>({
    enabled:
      enabled &&
      typeof temporalUrl === "string" &&
      temporalUrl.length > 0 &&
      workflowId.length > 0,
    queryFn: async () => {
      const response = await temporalFetch<TemporalQueryResult>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(workflowId)}/query`,
        {
          body: JSON.stringify({
            queryType: "__temporal_workflow_metadata",
            runId,
          }),
          method: "POST",
        },
      );
      const result = (response.result ?? {}) as {
        currentDetails?: unknown;
        definition?: Record<string, unknown>;
      };

      return {
        ...(typeof result.currentDetails === "string" && result.currentDetails
          ? { currentDetails: result.currentDetails }
          : {}),
        queries: readHandlerDefinitions(result.definition?.queryDefinitions),
        signals: readHandlerDefinitions(result.definition?.signalDefinitions),
        updates: readHandlerDefinitions(result.definition?.updateDefinitions),
      };
    },
    queryKey: [
      "temporal",
      "workflow-metadata",
      temporalUrl,
      namespace,
      workflowId,
      runId,
    ],
    retry: false,
    staleTime: 30_000,
  });
}

/** The Workflow's call stack, from the SDK's built-in `__stack_trace` Query. */
export function useTemporalWorkflowStack(args: {
  enabled?: boolean;
  namespace: string;
  runId?: string;
  workflowId: string;
}) {
  const { temporalUrl } = useStudio();
  const { enabled = true, namespace, runId, workflowId } = args;

  return useQuery<string>({
    enabled:
      enabled &&
      typeof temporalUrl === "string" &&
      temporalUrl.length > 0 &&
      workflowId.length > 0,
    queryFn: async () => {
      const response = await temporalFetch<TemporalQueryResult>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(workflowId)}/query`,
        {
          body: JSON.stringify({ queryType: "__stack_trace", runId }),
          method: "POST",
        },
      );

      return typeof response.result === "string"
        ? response.result
        : JSON.stringify(response.result, null, 2);
    },
    queryKey: [
      "temporal",
      "workflow-stack",
      temporalUrl,
      namespace,
      workflowId,
      runId,
    ],
    retry: false,
  });
}

export function useTemporalActions(namespace: string) {
  const { temporalUrl } = useStudio();
  const queryClient = useQueryClient();

  const invalidate = async (workflowId?: string) => {
    await queryClient.invalidateQueries({
      queryKey: ["temporal", "workflows", temporalUrl, namespace],
    });
    if (workflowId) {
      await queryClient.invalidateQueries({
        queryKey: [
          "temporal",
          "workflow-detail",
          temporalUrl,
          namespace,
          workflowId,
        ],
      });
    }
  };

  const startWorkflow = useMutation({
    mutationFn: (input: TemporalStartWorkflowInput) =>
      temporalFetch<TemporalStartWorkflowResult>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows`,
        {
          body: JSON.stringify(input),
          method: "POST",
        },
      ),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const queryWorkflow = useMutation({
    mutationFn: (args: {
      args?: unknown[];
      queryType: string;
      runId?: string;
      workflowId: string;
    }) =>
      temporalFetch<TemporalQueryResult>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(args.workflowId)}/query`,
        {
          body: JSON.stringify({
            args: args.args,
            queryType: args.queryType,
            runId: args.runId,
          }),
          method: "POST",
        },
      ),
  });

  const signalWorkflow = useMutation({
    mutationFn: (args: {
      args?: unknown[];
      runId?: string;
      signalName: string;
      workflowId: string;
    }) =>
      temporalFetch<{ ok: true }>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(args.workflowId)}/signal`,
        {
          body: JSON.stringify({
            args: args.args,
            runId: args.runId,
            signalName: args.signalName,
          }),
          method: "POST",
        },
      ),
    onSuccess: async (_, vars) => {
      await invalidate(vars.workflowId);
    },
  });

  const updateWorkflow = useMutation({
    mutationFn: (args: {
      args?: unknown[];
      runId?: string;
      updateName: string;
      workflowId: string;
    }) =>
      temporalFetch<TemporalUpdateResult>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(args.workflowId)}/update`,
        {
          body: JSON.stringify({
            args: args.args,
            runId: args.runId,
            updateName: args.updateName,
          }),
          method: "POST",
        },
      ),
    onSuccess: async (_, vars) => {
      await invalidate(vars.workflowId);
    },
  });

  const cancelWorkflow = useMutation({
    mutationFn: (args: {
      reason?: string;
      runId?: string;
      workflowId: string;
    }) =>
      temporalFetch<{ ok: true }>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(args.workflowId)}/cancel`,
        {
          body: JSON.stringify({ reason: args.reason, runId: args.runId }),
          method: "POST",
        },
      ),
    onSuccess: async (_, vars) => {
      await invalidate(vars.workflowId);
    },
  });

  const terminateWorkflow = useMutation({
    mutationFn: (args: {
      reason?: string;
      runId?: string;
      workflowId: string;
    }) =>
      temporalFetch<{ ok: true }>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(args.workflowId)}/terminate`,
        {
          body: JSON.stringify({ reason: args.reason, runId: args.runId }),
          method: "POST",
        },
      ),
    onSuccess: async (_, vars) => {
      await invalidate(vars.workflowId);
    },
  });

  const bulkAction = useMutation({
    mutationFn: (req: TemporalBulkActionRequest) =>
      temporalFetch<TemporalBulkActionResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/bulk`,
        {
          body: JSON.stringify(req),
          method: "POST",
        },
      ),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const resetStickyTaskQueue = useMutation({
    mutationFn: (args: { runId?: string; workflowId: string }) =>
      temporalFetch<{ ok: true }>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(args.workflowId)}/reset-sticky`,
        {
          body: JSON.stringify({ runId: args.runId }),
          method: "POST",
        },
      ),
    onSuccess: async (_, vars) => {
      await invalidate(vars.workflowId);
    },
  });

  const postWorkflowAction = <T>(
    workflowId: string,
    action: string,
    body: Record<string, unknown>,
  ) =>
    temporalFetch<T>(
      temporalUrl!,
      `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(workflowId)}/${action}`,
      { body: JSON.stringify(body), method: "POST" },
    );

  const resetWorkflow = useMutation({
    mutationFn: (args: {
      eventId: number;
      reason?: string;
      runId: string;
      workflowId: string;
    }) => postWorkflowAction<{ runId: string }>(args.workflowId, "reset", args),
    onSuccess: async (_, vars) => {
      await invalidate(vars.workflowId);
    },
  });

  const activityOperation = useMutation({
    mutationFn: (args: {
      activityId: string;
      operation: TemporalActivityOperation;
      runId?: string;
      workflowId: string;
    }) => postWorkflowAction<{ ok: true }>(args.workflowId, "activity", args),
    onSuccess: async (_, vars) => {
      await invalidate(vars.workflowId);
    },
  });

  const setWorkflowPaused = useMutation({
    mutationFn: (args: {
      paused: boolean;
      runId?: string;
      workflowId: string;
    }) =>
      postWorkflowAction<{ ok: true }>(
        args.workflowId,
        args.paused ? "pause" : "unpause",
        { runId: args.runId },
      ),
    onSuccess: async (_, vars) => {
      await invalidate(vars.workflowId);
    },
  });

  return {
    activityOperation,
    bulkAction,
    cancelWorkflow,
    queryWorkflow,
    resetWorkflow,
    resetStickyTaskQueue,
    setWorkflowPaused,
    signalWorkflow,
    startWorkflow,
    terminateWorkflow,
    updateWorkflow,
  };
}

export function useTemporalSchedules(args: {
  enabled?: boolean;
  followMode: TemporalFollowMode;
  namespace: string;
  pageToken?: string;
}) {
  const { temporalUrl } = useStudio();
  const { followMode, namespace, pageToken = "" } = args;
  const enabled =
    args.enabled !== false &&
    typeof temporalUrl === "string" &&
    temporalUrl.length > 0 &&
    namespace.length > 0;

  return useQuery<TemporalListSchedulesResponse>({
    enabled,
    placeholderData: (prev) => prev,
    queryFn: () => {
      const qs = pageToken
        ? `?nextPageToken=${encodeURIComponent(pageToken)}`
        : "";
      return temporalFetch<TemporalListSchedulesResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/schedules${qs}`,
      );
    },
    queryKey: ["temporal", "schedules", temporalUrl, namespace, pageToken],
    refetchInterval: followMode === "paused" ? false : 5_000,
  });
}

export function useTemporalScheduleDetail(args: {
  namespace: string;
  scheduleId?: string;
}) {
  const { temporalUrl } = useStudio();
  const { namespace, scheduleId } = args;
  const enabled =
    typeof temporalUrl === "string" &&
    temporalUrl.length > 0 &&
    namespace.length > 0 &&
    typeof scheduleId === "string" &&
    scheduleId.length > 0;

  return useQuery<TemporalScheduleDetail>({
    enabled,
    placeholderData: (prev) => prev,
    queryFn: () =>
      temporalFetch<TemporalScheduleDetail>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/schedules/${encodeURIComponent(scheduleId!)}`,
      ),
    queryKey: [
      "temporal",
      "schedule-detail",
      temporalUrl,
      namespace,
      scheduleId,
    ],
  });
}

export function useTemporalScheduleActions(namespace: string) {
  const { temporalUrl } = useStudio();
  const queryClient = useQueryClient();

  const invalidate = async (scheduleId?: string) => {
    await queryClient.invalidateQueries({
      queryKey: ["temporal", "schedules", temporalUrl, namespace],
    });
    if (scheduleId) {
      await queryClient.invalidateQueries({
        queryKey: [
          "temporal",
          "schedule-detail",
          temporalUrl,
          namespace,
          scheduleId,
        ],
      });
    }
  };

  const createSchedule = useMutation({
    mutationFn: (input: TemporalCreateScheduleInput) =>
      temporalFetch<{ ok: true; scheduleId: string }>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/schedules`,
        {
          body: JSON.stringify(input),
          method: "POST",
        },
      ),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const updateSchedule = useMutation({
    mutationFn: (input: TemporalCreateScheduleInput) =>
      temporalFetch<{ ok: true; scheduleId: string }>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/schedules/${encodeURIComponent(input.scheduleId)}`,
        {
          body: JSON.stringify(input),
          method: "PUT",
        },
      ),
    onSuccess: async (_, input) => {
      await invalidate(input.scheduleId);
    },
  });

  const patchSchedule = useMutation({
    mutationFn: (args: {
      input: TemporalPatchScheduleInput;
      scheduleId: string;
    }) =>
      temporalFetch<{ ok: true }>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/schedules/${encodeURIComponent(args.scheduleId)}/patch`,
        {
          body: JSON.stringify(args.input),
          method: "POST",
        },
      ),
    onSuccess: async (_, vars) => {
      await invalidate(vars.scheduleId);
    },
  });

  const deleteSchedule = useMutation({
    mutationFn: (scheduleId: string) =>
      temporalFetch<{ ok: true }>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/schedules/${encodeURIComponent(scheduleId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const previewMatchingTimes = useMutation({
    mutationFn: (args: {
      endTime: string;
      scheduleId: string;
      startTime: string;
    }) =>
      temporalFetch<{ times: string[] }>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/schedules/${encodeURIComponent(args.scheduleId)}/matching-times`,
        {
          body: JSON.stringify({
            endTime: args.endTime,
            startTime: args.startTime,
          }),
          method: "POST",
        },
      ),
  });

  const bulkScheduleAction = useMutation({
    mutationFn: (req: TemporalBulkScheduleRequest) =>
      temporalFetch<TemporalBulkScheduleResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/schedules/bulk`,
        {
          body: JSON.stringify(req),
          method: "POST",
        },
      ),
    onSuccess: async () => {
      await invalidate();
    },
  });

  return {
    bulkScheduleAction,
    createSchedule,
    deleteSchedule,
    patchSchedule,
    previewMatchingTimes,
    updateSchedule,
  };
}

/**
 * A bulk action that the BFF runs in the background. `start` returns once the
 * job exists; `job` then follows its progress until it finishes.
 */
export function useTemporalBulkJob(namespace: string) {
  const { temporalUrl } = useStudio();
  const queryClient = useQueryClient();
  const basePath = `/v1/namespaces/${encodeURIComponent(namespace)}/bulk-jobs`;
  const start = useMutation({
    mutationFn: (request: TemporalBulkJobRequest) =>
      temporalFetch<TemporalBulkJob>(temporalUrl!, basePath, {
        body: JSON.stringify(request),
        method: "POST",
      }),
  });
  const jobId = start.data?.id;
  const job = useQuery<TemporalBulkJob>({
    enabled: Boolean(jobId),
    queryFn: async () => {
      const next = await temporalFetch<TemporalBulkJob>(
        temporalUrl!,
        `${basePath}/${jobId}`,
      );

      if (next.state !== "running") {
        void queryClient.invalidateQueries({
          queryKey: ["temporal", "workflows", temporalUrl, namespace],
        });
      }

      return next;
    },
    queryKey: ["temporal", "bulk-job", temporalUrl, namespace, jobId],
    refetchInterval: (query) =>
      query.state.data && query.state.data.state !== "running" ? false : 500,
  });
  const abort = useMutation({
    mutationFn: () =>
      temporalFetch<TemporalBulkJob>(temporalUrl!, `${basePath}/${jobId}`, {
        method: "DELETE",
      }),
  });

  return {
    abort,
    job: start.data ? (job.data ?? start.data) : undefined,
    reset: start.reset,
    start,
  };
}

/** The Workflow Types and Task Queues in use, for suggestions in forms and filters. */
export function useTemporalFacets(namespace: string) {
  const { temporalUrl } = useStudio();

  return useQuery<TemporalFacets>({
    enabled:
      typeof temporalUrl === "string" &&
      temporalUrl.length > 0 &&
      namespace.length > 0,
    queryFn: () =>
      temporalFetch<TemporalFacets>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/facets`,
      ),
    queryKey: ["temporal", "facets", temporalUrl, namespace],
    staleTime: 30_000,
  });
}

/** The inputs of the newest runs of a Workflow Type, for the form that starts a run. */
export function useTemporalTypeInputs(args: {
  /** False sends no request, as for a type that no run has used. */
  enabled: boolean;
  namespace: string;
  workflowType: string;
}) {
  const { temporalUrl } = useStudio();
  const { enabled, namespace, workflowType } = args;

  return useQuery<TemporalTypeInputsResponse>({
    enabled:
      enabled &&
      typeof temporalUrl === "string" &&
      temporalUrl.length > 0 &&
      namespace.length > 0 &&
      workflowType.length > 0,
    queryFn: () =>
      temporalFetch<TemporalTypeInputsResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflow-types/${encodeURIComponent(workflowType)}/inputs`,
      ),
    queryKey: ["temporal", "type-inputs", temporalUrl, namespace, workflowType],
    staleTime: 30_000,
  });
}

/** The diagram of a Workflow Type, drawn from a sample of its runs. */
export function useTemporalTypeMap(args: {
  followMode: TemporalFollowMode;
  namespace: string;
  workflowType: string | null;
}) {
  const { temporalUrl } = useStudio();
  const { followMode, namespace, workflowType } = args;

  return useQuery<TemporalTypeMapResponse>({
    enabled:
      typeof temporalUrl === "string" &&
      temporalUrl.length > 0 &&
      namespace.length > 0 &&
      workflowType !== null,
    // The diagram of another type is not a placeholder for this one.
    placeholderData: (previous) =>
      previous?.workflowType === workflowType ? previous : undefined,
    queryFn: () =>
      temporalFetch<TemporalTypeMapResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflow-types/${encodeURIComponent(workflowType!)}/map`,
      ),
    queryKey: [
      "temporal",
      "type-map",
      temporalUrl,
      namespace,
      workflowType ?? "",
    ],
    // The BFF draws a type again at most once a minute.
    refetchInterval: followMode === "paused" ? false : 30_000,
  });
}

/** Running Workflow Executions that need help, and recent failures. */
export function useTemporalAttention(args: {
  enabled?: boolean;
  followMode: TemporalFollowMode;
  namespace: string;
}) {
  const { temporalUrl } = useStudio();
  const { enabled = true, followMode, namespace } = args;

  return useQuery<TemporalAttentionResponse>({
    enabled:
      enabled &&
      typeof temporalUrl === "string" &&
      temporalUrl.length > 0 &&
      namespace.length > 0,
    placeholderData: (prev) => prev,
    queryFn: () =>
      temporalFetch<TemporalAttentionResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/attention`,
      ),
    queryKey: ["temporal", "attention", temporalUrl, namespace],
    refetchInterval: followMode === "paused" ? false : 10_000,
    retry: shouldRetryTemporalRequest,
  });
}

/** Workers, Worker Deployments and Nexus Endpoints of the namespace. */
export function useTemporalWorkers(args: {
  followMode: TemporalFollowMode;
  namespace: string;
}) {
  const { temporalUrl } = useStudio();
  const { followMode, namespace } = args;

  return useQuery<TemporalWorkersResponse>({
    enabled:
      typeof temporalUrl === "string" &&
      temporalUrl.length > 0 &&
      namespace.length > 0,
    placeholderData: (prev) => prev,
    queryFn: () =>
      temporalFetch<TemporalWorkersResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workers`,
      ),
    queryKey: ["temporal", "workers", temporalUrl, namespace],
    refetchInterval: followMode === "paused" ? false : 10_000,
  });
}

export function useTemporalTaskQueues(args: {
  followMode: TemporalFollowMode;
  namespace: string;
}) {
  const { temporalUrl } = useStudio();
  const { followMode, namespace } = args;
  const enabled =
    typeof temporalUrl === "string" &&
    temporalUrl.length > 0 &&
    namespace.length > 0;

  return useQuery<TemporalTaskQueuesResponse>({
    enabled,
    placeholderData: (prev) => prev,
    queryFn: () =>
      temporalFetch<TemporalTaskQueuesResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/task-queues`,
      ),
    queryKey: ["temporal", "task-queues", temporalUrl, namespace],
    refetchInterval: followMode === "paused" ? false : 4_000,
  });
}

export function useTemporalClusterOverview(args: {
  enabled?: boolean;
  followMode: TemporalFollowMode;
  window: string;
}) {
  const { temporalUrl } = useStudio();
  const { enabled = true, followMode, window } = args;
  const isReady =
    enabled && typeof temporalUrl === "string" && temporalUrl.length > 0;

  return useQuery<TemporalClusterOverview>({
    enabled: isReady,
    placeholderData: (prev) => prev,
    queryFn: () =>
      temporalFetch<TemporalClusterOverview>(
        temporalUrl!,
        `/v1/cluster/overview?window=${encodeURIComponent(window)}`,
      ),
    queryKey: ["temporal", "cluster-overview", temporalUrl, window],
    refetchInterval: followMode === "paused" ? false : 3_000,
  });
}

export function useTemporalClusterTraces(args: {
  enabled?: boolean;
  followMode: TemporalFollowMode;
}) {
  const { temporalUrl } = useStudio();
  const { enabled = true, followMode } = args;
  const isReady =
    enabled && typeof temporalUrl === "string" && temporalUrl.length > 0;

  return useQuery<TemporalClusterTracesResponse>({
    enabled: isReady,
    placeholderData: (prev) => prev,
    queryFn: () =>
      temporalFetch<TemporalClusterTracesResponse>(
        temporalUrl!,
        `/v1/cluster/traces?drain=false`,
      ),
    queryKey: ["temporal", "cluster-traces", temporalUrl],
    refetchInterval: followMode === "paused" ? false : 5_000,
  });
}

export function useTemporalClusterActions() {
  const { temporalUrl } = useStudio();
  const queryClient = useQueryClient();

  const invalidateCluster = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["temporal", "cluster-overview", temporalUrl, "10s"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["temporal", "cluster-overview", temporalUrl, "60s"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["temporal", "cluster-overview", temporalUrl, "1m"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["temporal", "cluster-overview", temporalUrl, "5m"],
    });
  };

  const setAdmission = useMutation({
    mutationFn: (input: TemporalAdmissionUpdateInput) =>
      temporalFetch<Record<string, unknown>>(
        temporalUrl!,
        "/v1/cluster/admission",
        {
          body: JSON.stringify(input),
          method: "PUT",
        },
      ),
    onSuccess: async () => {
      await invalidateCluster();
    },
  });

  const liftAdmission = useMutation({
    mutationFn: (input: {
      class: "wait" | "existing" | "new" | "batch";
      scope?: string;
    }) =>
      temporalFetch<Record<string, unknown>>(
        temporalUrl!,
        "/v1/cluster/admission",
        {
          body: JSON.stringify(input),
          method: "DELETE",
        },
      ),
    onSuccess: async () => {
      await invalidateCluster();
    },
  });

  const handoffShard = useMutation({
    mutationFn: (input: { shardId: number; targetServerId: string }) =>
      temporalFetch<Record<string, unknown>>(
        temporalUrl!,
        `/v1/cluster/shards/${input.shardId}/handoff`,
        {
          body: JSON.stringify({ to: input.targetServerId }),
          method: "POST",
        },
      ),
    onSuccess: async () => {
      await invalidateCluster();
    },
  });

  const drainTraces = useMutation({
    mutationFn: () =>
      temporalFetch<TemporalClusterTracesResponse>(
        temporalUrl!,
        "/v1/cluster/traces?drain=true",
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["temporal", "cluster-traces", temporalUrl],
      });
    },
  });

  const reloadTls = useMutation({
    mutationFn: () =>
      temporalFetch<Record<string, unknown>>(
        temporalUrl!,
        "/v1/cluster/tls/reload",
        { method: "POST" },
      ),
  });

  return {
    drainTraces,
    handoffShard,
    liftAdmission,
    reloadTls,
    setAdmission,
  };
}
