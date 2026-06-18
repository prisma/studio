import {
  normalizeWorkflowRunDetail,
  normalizeWorkflowStudioModel,
} from "./normalize";
import {
  type WorkflowStudioActionResult,
  type WorkflowStudioApprovalDecision,
  type WorkflowStudioProvider,
  type WorkflowStudioProviderCapabilities,
  WorkflowStudioProviderError,
  type WorkflowStudioProviderOptions,
  type WorkflowStudioReplayInput,
  type WorkflowStudioRunInspectOptions,
} from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface WorkflowStudioClientOptions {
  baseUrl: string | URL;
  capabilities?: WorkflowStudioProviderCapabilities;
  customHeaders?: Record<string, string>;
  fetch?: FetchLike;
  staticModel?: unknown;
}

export function createWorkflowStudioClient(
  options: WorkflowStudioClientOptions,
): WorkflowStudioProvider {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchFn = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const headers = options.customHeaders ?? {};
  const capabilities = options.capabilities ?? {
    approve: true,
    reject: true,
    replay: true,
    runWorker: true,
  };

  if (!fetchFn) {
    throw new WorkflowStudioProviderError(
      "Workflow Studio client requires a fetch implementation.",
      {},
    );
  }

  return {
    capabilities,
    staticModel: options.staticModel,
    async getSnapshot(providerOptions?: WorkflowStudioProviderOptions) {
      const payload = await requestJson({
        fetchFn,
        headers,
        method: "GET",
        signal: providerOptions?.signal,
        url: joinEndpoint(baseUrl, "studio"),
      });

      return normalizeWorkflowStudioModel(payload);
    },
    async inspectRun(
      runId: string,
      providerOptions?: WorkflowStudioRunInspectOptions,
    ) {
      const query = new URLSearchParams();

      for (const include of providerOptions?.include ?? []) {
        query.append("include", include);
      }

      const payload = await requestJson({
        fetchFn,
        headers,
        method: "GET",
        signal: providerOptions?.signal,
        url: withQuery(joinEndpoint(baseUrl, "inspect", runId), query),
      });

      return normalizeWorkflowRunDetail(payload);
    },
    async approve(
      approvalId: string,
      input?: WorkflowStudioApprovalDecision,
      providerOptions?: WorkflowStudioProviderOptions,
    ) {
      return await requestAction({
        body: input,
        fetchFn,
        headers,
        signal: providerOptions?.signal,
        url: joinEndpoint(baseUrl, "approve", approvalId),
      });
    },
    async reject(
      approvalId: string,
      input?: WorkflowStudioApprovalDecision,
      providerOptions?: WorkflowStudioProviderOptions,
    ) {
      return await requestAction({
        body: input,
        fetchFn,
        headers,
        signal: providerOptions?.signal,
        url: joinEndpoint(baseUrl, "reject", approvalId),
      });
    },
    async replay(
      runId: string,
      input?: WorkflowStudioReplayInput,
      providerOptions?: WorkflowStudioProviderOptions,
    ) {
      return await requestAction({
        body: input,
        fetchFn,
        headers,
        signal: providerOptions?.signal,
        url: joinEndpoint(baseUrl, "replay", runId),
      });
    },
    async runWorker(providerOptions?: WorkflowStudioProviderOptions) {
      return await requestAction({
        fetchFn,
        headers,
        signal: providerOptions?.signal,
        url: joinEndpoint(baseUrl, "run"),
      });
    },
  };
}

export function createStaticWorkflowStudioProvider(
  model: unknown,
): WorkflowStudioProvider {
  return {
    capabilities: {},
    staticModel: model,
    getSnapshot() {
      return Promise.resolve(normalizeWorkflowStudioModel(model));
    },
  };
}

async function requestAction(args: {
  body?: unknown;
  fetchFn: FetchLike;
  headers: Record<string, string>;
  signal?: AbortSignal;
  url: string;
}): Promise<WorkflowStudioActionResult> {
  const payload = await requestJson({
    body: args.body,
    fetchFn: args.fetchFn,
    headers: args.headers,
    method: "POST",
    signal: args.signal,
    url: args.url,
  });

  if (isActionResult(payload)) {
    return payload;
  }

  return {
    ok: true,
    value: payload,
  };
}

async function requestJson(args: {
  body?: unknown;
  fetchFn: FetchLike;
  headers: Record<string, string>;
  method: "GET" | "POST";
  signal?: AbortSignal;
  url: string;
}): Promise<unknown> {
  const response = await args.fetchFn(args.url, {
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
    headers: {
      ...args.headers,
      ...(args.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    method: args.method,
    signal: args.signal,
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new WorkflowStudioProviderError(
      `Workflow Studio request failed (${response.status} ${response.statusText}).`,
      {
        payload,
        status: response.status,
      },
    );
  }

  return payload;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new WorkflowStudioProviderError(
      "Workflow Studio response was not valid JSON.",
      {
        payload: text,
        status: response.status,
      },
    );
  }
}

function isActionResult(input: unknown): input is WorkflowStudioActionResult {
  return (
    typeof input === "object" &&
    input !== null &&
    "ok" in input &&
    typeof input.ok === "boolean"
  );
}

function normalizeBaseUrl(baseUrl: string | URL): string {
  const value = String(baseUrl);
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function joinEndpoint(baseUrl: string, ...segments: readonly string[]): string {
  const encodedPath = segments
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${baseUrl}/${encodedPath}`;
}

function withQuery(url: string, query: URLSearchParams): string {
  const queryString = query.toString();
  return queryString.length === 0 ? url : `${url}?${queryString}`;
}
