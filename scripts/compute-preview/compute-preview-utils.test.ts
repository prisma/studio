import { describe, expect, it } from "vitest";

import {
  PREVIEW_COMMENT_MARKER,
  buildPreviewCommentBody,
  findNamedProject,
  findNamedService,
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
  it("builds a sticky PR comment with the preview URL", () => {
    expect(
      buildPreviewCommentBody({
        branchName: "codex/public-origin-main",
        serviceName: "codex-public-origin-main",
        serviceUrl: "https://example.cdg.prisma.build",
        versionUrl: "https://version.cdg.prisma.build",
      }),
    ).toBe(
      [
        PREVIEW_COMMENT_MARKER,
        "Compute preview deployed.",
        "",
        "Branch: `codex/public-origin-main`",
        "Service: `codex-public-origin-main`",
        "Preview: https://example.cdg.prisma.build",
        "Version: https://version.cdg.prisma.build",
      ].join("\n"),
    );
  });
});
