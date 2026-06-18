import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStaticWorkflowStudioProvider,
  createWorkflowStudioClient,
  WorkflowStudioProviderError,
} from "./index";

const model = {
  kind: "prisma-workflow-studio-model",
  version: 1,
  workflows: [
    {
      id: "wf_1",
      name: "CustomerOnboarding",
      slug: "customer-onboarding",
      version: 1,
      canvas: { edges: [], nodes: [] },
    },
  ],
};

type TestFetch = (input: string, init?: RequestInit) => Promise<Response>;

describe("workflow studio client", () => {
  const fetchFn = vi.fn<TestFetch>();

  beforeEach(() => {
    fetchFn.mockReset();
  });

  it("creates a static read-only provider", async () => {
    const provider = createStaticWorkflowStudioProvider(model);
    const snapshot = await provider.getSnapshot();

    expect(provider.capabilities).toEqual({});
    expect(snapshot.workflows[0]?.name).toBe("CustomerOnboarding");
  });

  it("loads and normalizes the runtime snapshot", async () => {
    fetchFn.mockResolvedValueOnce(new Response(JSON.stringify(model)));
    const provider = createWorkflowStudioClient({
      baseUrl: "/api/prisma-workflows",
      fetch: fetchFn,
    });

    const snapshot = await provider.getSnapshot();

    expect(fetchFn).toHaveBeenCalledWith("/api/prisma-workflows/studio", {
      body: undefined,
      headers: {},
      method: "GET",
      signal: undefined,
    });
    expect(snapshot.workflows[0]?.slug).toBe("customer-onboarding");
  });

  it("encodes path parameters for runtime actions", async () => {
    fetchFn.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }))),
    );
    const provider = createWorkflowStudioClient({
      baseUrl: "/api/prisma-workflows/",
      fetch: fetchFn,
    });

    await provider.inspectRun?.("run/with slash");
    await provider.approve?.("approval/1", { reason: "looks good" });
    await provider.reject?.("approval/2");
    await provider.replay?.("run/with slash", { mode: "recorded" });
    await provider.runWorker?.();

    expect(fetchFn.mock.calls.map((call) => call[0])).toEqual([
      "/api/prisma-workflows/inspect/run%2Fwith%20slash",
      "/api/prisma-workflows/approve/approval%2F1",
      "/api/prisma-workflows/reject/approval%2F2",
      "/api/prisma-workflows/replay/run%2Fwith%20slash",
      "/api/prisma-workflows/run",
    ]);
  });

  it("throws provider errors for non-2xx responses", async () => {
    fetchFn.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "nope" }), {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );
    const provider = createWorkflowStudioClient({
      baseUrl: "/api/prisma-workflows",
      fetch: fetchFn,
    });

    await expect(provider.getSnapshot()).rejects.toBeInstanceOf(
      WorkflowStudioProviderError,
    );
  });
});
