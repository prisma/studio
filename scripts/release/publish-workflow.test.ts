import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/publish.yml", import.meta.url),
);
const workflow = readFileSync(workflowPath, "utf8");

describe("publish workflow", () => {
  it("primes the pnpm store before release planning so skipped publishes do not fail cache cleanup", () => {
    const ensureStoreStep = "run: node scripts/release/ensure-pnpm-store.mjs";
    const prepareReleaseStep = "run: node scripts/release/prepare-release.mjs";

    expect(workflow).toContain(ensureStoreStep);
    expect(workflow.indexOf(ensureStoreStep)).toBeGreaterThan(-1);
    expect(workflow.indexOf(prepareReleaseStep)).toBeGreaterThan(-1);
    expect(workflow.indexOf(ensureStoreStep)).toBeLessThan(workflow.indexOf(prepareReleaseStep));
  });
});
