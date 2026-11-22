import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  TemporalBulkActionRequest,
  TemporalBulkActionResponse,
  TemporalCapabilities,
  TemporalExecutionDetail,
  TemporalFollowMode,
  TemporalListWorkflowsResponse,
  TemporalNamespace,
  TemporalQueryResult,
  TemporalStartWorkflowInput,
  TemporalStartWorkflowResult,
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

  return {
    bulkAction,
    cancelWorkflow,
    queryWorkflow,
    signalWorkflow,
    startWorkflow,
    terminateWorkflow,
    updateWorkflow,
  };
}
