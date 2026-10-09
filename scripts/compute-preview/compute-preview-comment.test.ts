import { afterEach, describe, expect, it, vi } from "vitest";

import { updatePreviewComments } from "./compute-preview-comment.mjs";
import { PREVIEW_COMMENT_MARKER } from "./compute-preview-utils.mjs";

const preview = {
  githubToken: "test-token",
  repository: "prisma/studio",
  branchName: "feature/foo",
  serviceName: "demo",
  serviceUrl: "https://example.sin.prisma.build",
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200 });
}

afterEach(() => vi.unstubAllGlobals());

describe("push deployment PR feedback", () => {
  it("does nothing when the pushed branch has no open PR", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json([]));
    vi.stubGlobal("fetch", request);

    await updatePreviewComments(preview);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/prisma/studio/pulls?state=open&head=prisma%3Afeature%2Ffoo&per_page=100",
    );
  });

  it("updates the bot's existing comment when the branch is pushed again", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ number: 42 }]))
      .mockResolvedValueOnce(
        json([
          {
            id: 8,
            body: PREVIEW_COMMENT_MARKER,
            user: { login: "github-actions[bot]" },
          },
        ]),
      )
      .mockResolvedValueOnce(json({}));
    vi.stubGlobal("fetch", request);

    await updatePreviewComments(preview);

    expect(request.mock.calls[2]?.[0]).toBe(
      "https://api.github.com/repos/prisma/studio/issues/comments/8",
    );
    expect(request.mock.calls[2]?.[1]).toMatchObject({ method: "PATCH" });
    expect(request.mock.calls[2]?.[1]?.body).toContain("Stage: `feature/foo`");
    expect(request.mock.calls[2]?.[1]?.body).toContain(preview.serviceUrl);
  });

  it("creates the bot comment without trying to edit a contributor's matching marker", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ number: 42 }]))
      .mockResolvedValueOnce(
        json([
          {
            id: 9,
            body: PREVIEW_COMMENT_MARKER,
            user: { login: "contributor" },
          },
        ]),
      )
      .mockResolvedValueOnce(json({}));
    vi.stubGlobal("fetch", request);

    await updatePreviewComments(preview);

    expect(request.mock.calls[2]?.[0]).toBe(
      "https://api.github.com/repos/prisma/studio/issues/42/comments",
    );
    expect(request.mock.calls[2]?.[1]).toMatchObject({ method: "POST" });
  });

  it("surfaces GitHub API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Denied", { status: 403 })),
    );

    await expect(updatePreviewComments(preview)).rejects.toThrow(
      "GitHub API request failed (403",
    );
  });
});
