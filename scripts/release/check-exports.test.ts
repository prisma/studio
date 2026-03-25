import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupPackedTarball, packPackage } from "./check-exports.mjs";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("packPackage", () => {
  it("creates a tarball that can be cleaned up after export checks", () => {
    const directory = mkdtempSync(join(tmpdir(), "studio-release-"));
    tempDirectories.push(directory);

    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify(
        {
          files: ["index.js"],
          name: "release-fixture",
          version: "1.2.3",
        },
        null,
        2,
      ),
    );
    writeFileSync(join(directory, "index.js"), "module.exports = 1;\n");

    const tarballPath = packPackage(directory);

    expect(tarballPath).toBe(join(directory, "release-fixture-1.2.3.tgz"));
    expect(existsSync(tarballPath)).toBe(true);

    cleanupPackedTarball(tarballPath);

    expect(existsSync(tarballPath)).toBe(false);
  });

  it("creates a tarball even when npm dry-run is inherited from publish", () => {
    const directory = mkdtempSync(join(tmpdir(), "studio-release-dry-run-"));
    tempDirectories.push(directory);

    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify(
        {
          files: ["index.js"],
          name: "release-fixture-dry-run",
          version: "4.5.6",
        },
        null,
        2,
      ),
    );
    writeFileSync(join(directory, "index.js"), "module.exports = 1;\n");

    const previousDryRun = process.env.npm_config_dry_run;
    process.env.npm_config_dry_run = "true";

    try {
      const tarballPath = packPackage(directory);

      expect(tarballPath).toBe(join(directory, "release-fixture-dry-run-4.5.6.tgz"));
      expect(existsSync(tarballPath)).toBe(true);

      cleanupPackedTarball(tarballPath);

      expect(existsSync(tarballPath)).toBe(false);
    } finally {
      if (previousDryRun === undefined) {
        delete process.env.npm_config_dry_run;
      } else {
        process.env.npm_config_dry_run = previousDryRun;
      }
    }
  });
});
