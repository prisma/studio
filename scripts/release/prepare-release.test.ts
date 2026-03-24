import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareRelease } from "./prepare-release.mjs";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

const writeFixtureFiles = ({
  changelog,
  directory,
  version,
}: {
  changelog: string;
  directory: string;
  version: string;
}) => {
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify(
      {
        name: "@prisma/studio-core",
        version,
      },
      null,
      2,
    ),
  );
  writeFileSync(join(directory, "CHANGELOG.md"), changelog);
};

describe("prepareRelease", () => {
  it("allows a manual publish without changelog notes and removes stale notes files", () => {
    const directory = mkdtempSync(join(tmpdir(), "studio-prepare-release-"));
    tempDirectories.push(directory);

    writeFixtureFiles({
      changelog: "# @prisma/studio-core\n\n## 1.2.3\n\n- Previous release.\n",
      directory,
      version: "1.2.4",
    });

    const releaseNotesPath = join(directory, "release-notes.md");
    writeFileSync(releaseNotesPath, "stale notes\n");

    const release = prepareRelease({
      allowMissingChangelog: true,
      changelogPath: join(directory, "CHANGELOG.md"),
      expectedVersion: "1.2.4",
      latestNpmVersion: "1.2.3",
      packageJsonPath: join(directory, "package.json"),
      releaseNotesPath,
    });

    expect(release.hasReleaseNotes).toBe(false);
    expect(release.releaseReason).toBe("version_ahead_of_npm_without_changelog");
    expect(release.shouldPublishPackage).toBe(true);
    expect(existsSync(releaseNotesPath)).toBe(false);
  });

  it("rejects a manual publish when the requested version does not match package.json", () => {
    const directory = mkdtempSync(join(tmpdir(), "studio-prepare-release-mismatch-"));
    tempDirectories.push(directory);

    writeFixtureFiles({
      changelog: "# @prisma/studio-core\n\n## 1.2.3\n\n- Current release.\n",
      directory,
      version: "1.2.3",
    });

    const release = prepareRelease({
      allowMissingChangelog: true,
      changelogPath: join(directory, "CHANGELOG.md"),
      expectedVersion: "1.2.4",
      latestNpmVersion: "1.2.2",
      packageJsonPath: join(directory, "package.json"),
      releaseNotesPath: join(directory, "release-notes.md"),
    });

    expect(release.releaseReason).toBe("requested_version_mismatch");
    expect(release.requestedVersionMismatch).toBe(true);
    expect(release.shouldPublishPackage).toBe(false);
  });
});
