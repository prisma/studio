import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PREVIEW_COMMENT_MARKER,
  buildComputeDeployArgs,
  buildPreviewCommentBody,
  buildPreviewDeployResult,
  buildPreviewRuntimeEnv,
  findNamedProject,
  findNamedService,
  formatDotenvFile,
  normalizePreviewUrl,
  sanitizeComputeServiceName,
} from "./compute-preview-utils.mjs";

describe("sanitizeComputeServiceName", () => {
  it("normalizes slashes and punctuation into a compute-safe slug", () => {
    expect(sanitizeComputeServiceName("codex/public-origin-main")).toBe(
      "codex-public-origin-main",
    );
    expect(sanitizeComputeServiceName(" Feature__Foo.Bar ")).toBe(
      "feature-foo-bar",
    );
  });

  it("falls back to preview when no alphanumeric characters remain", () => {
    expect(sanitizeComputeServiceName("///")).toBe("preview");
  });

  it("truncates long names deterministically with a hash suffix", () => {
    const branchName = "feature/" + "x".repeat(120);
    const serviceName = sanitizeComputeServiceName(branchName);

    expect(serviceName.length).toBeLessThanOrEqual(63);
    expect(serviceName).toMatch(/^feature-x+-[0-9a-f]{8}$/);
    expect(sanitizeComputeServiceName(branchName)).toBe(serviceName);
  });
});

describe("findNamedProject", () => {
  it("returns the matching project by name", () => {
    expect(
      findNamedProject(
        [
          { id: "proj_1", name: "foo" },
          { id: "proj_2", name: "studio-preview" },
        ],
        "studio-preview",
      ),
    ).toEqual({
      id: "proj_2",
      name: "studio-preview",
    });
  });
});

describe("findNamedService", () => {
  it("returns the matching service by name", () => {
    expect(
      findNamedService(
        [
          { id: "svc_1", name: "main" },
          { id: "svc_2", name: "codex-public-origin-main" },
        ],
        "codex-public-origin-main",
      ),
    ).toEqual({
      id: "svc_2",
      name: "codex-public-origin-main",
    });
  });
});

describe("buildPreviewCommentBody", () => {
  it("builds a short sticky PR comment with one preview URL", () => {
    expect(
      buildPreviewCommentBody({
        serviceUrl: "https://example.cdg.prisma.build",
      }),
    ).toBe(
      [
        PREVIEW_COMMENT_MARKER,
        "🖥️ Preview: https://example.cdg.prisma.build",
      ].join("\n"),
    );
  });
});

describe("normalizePreviewUrl", () => {
  it("adds https to bare Compute endpoint domains", () => {
    expect(normalizePreviewUrl("example.cdg.prisma.build")).toBe(
      "https://example.cdg.prisma.build",
    );
  });

  it("keeps already absolute URLs unchanged", () => {
    expect(normalizePreviewUrl("https://example.cdg.prisma.build")).toBe(
      "https://example.cdg.prisma.build",
    );
  });
});

describe("buildPreviewDeployResult", () => {
  it("maps current Compute CLI deploy output fields", () => {
    expect(
      buildPreviewDeployResult({
        branchName: "codex/stable-main-compute-preview",
        deployResult: {
          appEndpointDomain: "service.cdg.prisma.build",
          deploymentEndpointDomain: "version.cdg.prisma.build",
          deploymentId: "dep_123",
        },
        project: { id: "proj_123" },
        region: "eu-west-3",
        service: { id: "svc_123" },
        serviceName: "codex-stable-main-compute-preview",
      }),
    ).toEqual({
      branchName: "codex/stable-main-compute-preview",
      projectId: "proj_123",
      region: "eu-west-3",
      serviceId: "svc_123",
      serviceName: "codex-stable-main-compute-preview",
      serviceUrl: "https://service.cdg.prisma.build",
      versionId: "dep_123",
      versionUrl: "https://version.cdg.prisma.build",
    });
  });

  it("rejects deploy results without a preview URL", () => {
    expect(() =>
      buildPreviewDeployResult({
        branchName: "branch",
        deployResult: {},
        project: { id: "proj_123" },
        region: "eu-west-3",
        service: { id: "svc_123" },
        serviceName: "branch",
      }),
    ).toThrow("Compute deploy did not return a preview URL");
  });
});

describe("buildPreviewRuntimeEnv", () => {
  it("enables Studio AI with the configured Anthropic key", () => {
    expect(
      buildPreviewRuntimeEnv({
        anthropicApiKey: "sk-ant-test",
        httpPort: "8080",
      }),
    ).toEqual({
      ANTHROPIC_API_KEY: "sk-ant-test",
      STUDIO_DEMO_AI_ENABLED: "true",
      STUDIO_DEMO_PORT: "8080",
    });
  });
});

describe("formatDotenvFile", () => {
  it("quotes values for the Compute CLI env file", () => {
    expect(
      formatDotenvFile({
        ANTHROPIC_API_KEY: "sk-ant-test",
        STUDIO_DEMO_AI_ENABLED: "true",
      }),
    ).toBe(
      [
        'ANTHROPIC_API_KEY="sk-ant-test"',
        'STUDIO_DEMO_AI_ENABLED="true"',
        "",
      ].join("\n"),
    );
  });
});

describe("buildComputeDeployArgs", () => {
  it("uses the compute entrypoint and env file for deploys", () => {
    expect(
      buildComputeDeployArgs({
        deployPath: "deploy",
        entrypoint: "bundle/compute-entrypoint.js",
        envFilePath: "/tmp/preview.env",
        httpPort: "8080",
        serviceId: "svc_123",
      }),
    ).toEqual([
      "deploy",
      "--skip-build",
      "--path",
      "deploy",
      "--entrypoint",
      "bundle/compute-entrypoint.js",
      "--http-port",
      "8080",
      "--env",
      "/tmp/preview.env",
      "--service",
      "svc_123",
    ]);
  });
});

describe("compute preview deploy script", () => {
  it("requires the Anthropic key and passes a Compute env file to deploy", async () => {
    const deployScript = await readFile(
      join(import.meta.dirname, "compute-preview-deploy.mjs"),
      "utf8",
    );

    expect(deployScript).toContain('"bundle/compute-entrypoint.js"');
    expect(deployScript).toContain('getRequiredEnv("ANTHROPIC_API_KEY")');
    expect(deployScript).toContain("buildPreviewRuntimeEnv");
    expect(deployScript).toContain("envFilePath");
  });
});

describe("compute preview workflow", () => {
  it("deploys same-repo PR branches and the latest main branch", async () => {
    const workflow = await readFile(
      join(
        import.meta.dirname,
        "..",
        "..",
        ".github",
        "workflows",
        "compute-preview.yml",
      ),
      "utf8",
    );

    expect(workflow).toContain("push:");
    expect(workflow).toContain("- main");
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain(
      "PREVIEW_BRANCH_NAME: ${{ github.event.pull_request.head.ref || github.ref_name }}",
    );
    expect(workflow).toContain(
      "ANTHROPIC_API_KEY: ${{ secrets.STUDIO_PREVIEW_ANTHROPIC_API_KEY }}",
    );
    expect(workflow).not.toContain("PREVIEW_SERVICE_NAME:");
    expect(workflow).not.toContain("PREVIEW_VERSION_URL:");
  });
});
