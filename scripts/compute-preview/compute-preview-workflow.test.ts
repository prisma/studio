import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { describe, expect, it } from "vitest";

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/compute-preview.yml", import.meta.url),
);
const workflow = readFileSync(workflowPath, "utf8");

describe("compute preview workflow", () => {
  it("deploys one stable main preview when main receives new commits", () => {
    expect(workflow).toContain(
      [
        "  push:",
        "    branches:",
        "      - main",
      ].join("\n"),
    );
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain(
      "PREVIEW_BRANCH_NAME: ${{ github.head_ref || github.ref_name }}",
    );
  });

  it("keeps PR comments and branch cleanup scoped to PR previews", () => {
    expect(workflow).toContain(
      [
        "      - name: Comment preview URL on PR",
        "        if: github.event_name == 'pull_request'",
      ].join("\n"),
    );
    expect(workflow).toContain(
      "if: github.event_name == 'delete' && github.event.ref_type == 'branch'",
    );
    expect(workflow).toContain(
      "PREVIEW_BRANCH_NAME: ${{ github.event.ref }}",
    );
  });
});
