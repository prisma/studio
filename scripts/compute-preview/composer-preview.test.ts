import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  buildPreviewCommentBody,
  PREVIEW_COMMENT_MARKER,
} from "./compute-preview-utils.mjs";

describe("buildPreviewCommentBody", () => {
  it("retains the sticky marker and reports the Composer service and stage", () => {
    expect(
      buildPreviewCommentBody({
        branchName: "codex/public-origin-main",
        serviceName: "studio",
        serviceUrl: "https://example.cdg.prisma.build",
      }),
    ).toBe(
      [
        PREVIEW_COMMENT_MARKER,
        "Compute preview deployed with Prisma Composer.",
        "",
        "Stage: `codex/public-origin-main`",
        "Service: `studio`",
        "Preview: https://example.cdg.prisma.build",
      ].join("\n"),
    );
  });
});

describe("Composer preview workflow", () => {
  it("deploys branch pushes with OIDC and lets the action select production or the exact preview stage", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/compute-preview.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("prisma/cloud-deploy-action@");
    expect(workflow).toContain(
      "github.ref_type == 'branch' && !github.event.repository.fork",
    );
    expect(workflow).toContain("  push:");
    expect(workflow).toContain("id-token: write");
    expect(workflow).not.toContain("          stage:");
    expect(workflow).toContain("build-command: pnpm build:deploy");
    expect(workflow).toContain(
      "install-command: pnpm install --frozen-lockfile",
    );
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("steps.deploy.outputs.outcome == 'succeeded'");
    expect(workflow).not.toContain("PRISMA_API_TOKEN");
    expect(workflow).not.toContain("PRISMA_SERVICE_TOKEN");
    expect(workflow).not.toContain("PRISMA_WORKSPACE_ID");
    expect(workflow).not.toContain("  delete:");
    expect(workflow).not.toContain("destroy-preview:");
  });

  it("fails a skipped deployment and only posts preview comments for non-default branches", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/compute-preview.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain(
      "if: steps.deploy.outputs.outcome != 'succeeded'",
    );
    expect(workflow).toContain("exit 1");
    expect(workflow).toContain(
      "github.ref_name != github.event.repository.default_branch",
    );
    expect(workflow).toContain("PREVIEW_BRANCH_NAME: ${{ github.ref_name }}");
    expect(workflow).not.toContain("PREVIEW_PR_NUMBER:");
  });

  it("requires the deployed demo to start before reporting its preview URL", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/compute-preview.yml", import.meta.url),
      "utf8",
    );
    const startupStep = workflow.indexOf("- name: Verify demo startup");
    const commentStep = workflow.indexOf("- name: Comment preview URL on PR");

    expect(startupStep).toBeGreaterThan(0);
    expect(commentStep).toBeGreaterThan(startupStep);
    expect(workflow).toContain("--fail");
    expect(workflow).toContain("--retry-all-errors");
    expect(workflow).toContain('${PREVIEW_SERVICE_URL}/api/config');
    expect(workflow).toContain('typeof config.bootId !== "string"');
    expect(workflow).toContain('config.streams?.url !== "/api/streams"');
  });
});
