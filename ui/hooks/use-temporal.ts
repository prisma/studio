import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  TemporalAdmissionUpdateInput,
  TemporalBulkActionRequest,
  TemporalBulkActionResponse,
  TemporalBulkScheduleRequest,
  TemporalBulkScheduleResponse,
  TemporalCapabilities,
  TemporalClusterOverview,
  TemporalClusterTracesResponse,
  TemporalCreateScheduleInput,
  TemporalExecutionDetail,
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
  TemporalUpdateResult,
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
    throw new Error(message);
  }

  return (await res.json()) as T;
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
  followMode: TemporalFollowMode;
  namespace: string;
  pageSize?: number;
  query: string;
}) {
  const { temporalUrl } = useStudio();
  const { namespace, query, followMode, pageSize = 50 } = args;
  const enabled =
    typeof temporalUrl === "string" &&
    temporalUrl.length > 0 &&
    namespace.length > 0;

  return useQuery<TemporalListWorkflowsResponse>({
    enabled,
    placeholderData: (prev) => prev,
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.trim().length > 0) {
        params.set("query", query.trim());
      }
      params.set("pageSize", String(pageSize));
      return temporalFetch<TemporalListWorkflowsResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows?${params.toString()}`,
      );
    },
    queryKey: [
      "temporal",
      "workflows",
      temporalUrl,
      namespace,
      query,
      pageSize,
    ],
    refetchInterval: followMode === "paused" ? false : 2_500,
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
    queryFn: () => {
      const params = new URLSearchParams();
      if (runId) {
        params.set("runId", runId);
      }
      const qs = params.toString();
      return temporalFetch<TemporalExecutionDetail>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(workflowId!)}${qs ? `?${qs}` : ""}`,
      );
    },
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
      if (status && status !== "Running") return false;
      return 2_000;
    },
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

  return {
    bulkAction,
    cancelWorkflow,
    queryWorkflow,
    resetStickyTaskQueue,
    signalWorkflow,
    startWorkflow,
    terminateWorkflow,
    updateWorkflow,
  };
}

export function useTemporalSchedules(args: {
  followMode: TemporalFollowMode;
  namespace: string;
}) {
  const { temporalUrl } = useStudio();
  const { followMode, namespace } = args;
  const enabled =
    typeof temporalUrl === "string" &&
    temporalUrl.length > 0 &&
    namespace.length > 0;

  return useQuery<TemporalListSchedulesResponse>({
    enabled,
    placeholderData: (prev) => prev,
    queryFn: () =>
      temporalFetch<TemporalListSchedulesResponse>(
        temporalUrl!,
        `/v1/namespaces/${encodeURIComponent(namespace)}/schedules`,
      ),
    queryKey: ["temporal", "schedules", temporalUrl, namespace],
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
  };
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
