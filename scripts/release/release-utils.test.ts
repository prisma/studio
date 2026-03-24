import { describe, expect, it } from "vitest";

import {
  compareSemver,
  createReleasePlan,
  extractChangelogSection,
  extractSemver,
} from "./release-utils.mjs";

const changelog = `# @prisma/studio-core

## Upcoming

- Work in progress

## 1.2.3

### Patch Changes

- Publish from the changelog entry.

## 1.2.2

### Patch Changes

- Previous release.
`;

describe("extractSemver", () => {
  it("extracts normal and prefixed semantic versions", () => {
    expect(extractSemver("1.2.3")).toBe("1.2.3");
    expect(extractSemver("v1.2.3-beta.4")).toBe("1.2.3-beta.4");
  });
});

describe("compareSemver", () => {
  it("orders prerelease and stable versions correctly", () => {
    expect(compareSemver("1.2.3", "1.2.2")).toBe(1);
    expect(compareSemver("1.2.3-alpha.1", "1.2.3-alpha.2")).toBe(-1);
    expect(compareSemver("1.2.3", "1.2.3-alpha.2")).toBe(1);
  });
});

describe("extractChangelogSection", () => {
  it("returns only the requested release section", () => {
    expect(extractChangelogSection(changelog, "1.2.3")).toBe(`## 1.2.3

### Patch Changes

- Publish from the changelog entry.`);
  });

  it("returns null when the version entry is missing", () => {
    expect(extractChangelogSection(changelog, "9.9.9")).toBeNull();
  });
});

describe("createReleasePlan", () => {
  it("publishes when the version is ahead of npm and the changelog entry exists", () => {
    expect(
      createReleasePlan({
        changelog,
        latestNpmVersion: "1.2.2",
        packageVersion: "1.2.3",
      }),
    ).toMatchObject({
      hasReleaseNotes: true,
      latestNpmVersion: "1.2.2",
      missingChangelogForNewVersion: false,
      releaseReason: "version_ahead_of_npm",
      shouldPublishPackage: true,
    });
  });

  it("blocks publishing when the version is ahead of npm but the changelog entry is missing", () => {
    expect(
      createReleasePlan({
        changelog,
        latestNpmVersion: "1.2.2",
        packageVersion: "1.2.4",
      }),
    ).toMatchObject({
      hasReleaseNotes: false,
      latestNpmVersion: "1.2.2",
      missingChangelogForNewVersion: true,
      releaseReason: "missing_changelog_entry",
      shouldPublishPackage: false,
    });
  });

  it("allows manual publishing without a changelog entry when explicitly enabled", () => {
    expect(
      createReleasePlan({
        allowMissingChangelog: true,
        changelog,
        latestNpmVersion: "1.2.2",
        packageVersion: "1.2.4",
      }),
    ).toMatchObject({
      allowMissingChangelog: true,
      hasReleaseNotes: false,
      latestNpmVersion: "1.2.2",
      missingChangelogForNewVersion: true,
      releaseReason: "version_ahead_of_npm_without_changelog",
      shouldPublishPackage: true,
    });
  });

  it("skips npm publish when npm already has the version", () => {
    expect(
      createReleasePlan({
        changelog,
        latestNpmVersion: "1.2.3",
        packageVersion: "1.2.3",
      }),
    ).toMatchObject({
      hasReleaseNotes: true,
      latestNpmVersion: "1.2.3",
      missingChangelogForNewVersion: false,
      releaseReason: "version_not_ahead_of_npm",
      shouldPublishPackage: false,
    });
  });

  it("blocks manual publish when the requested version does not match package.json", () => {
    expect(
      createReleasePlan({
        allowMissingChangelog: true,
        changelog,
        expectedVersion: "1.2.4",
        latestNpmVersion: "1.2.2",
        packageVersion: "1.2.3",
      }),
    ).toMatchObject({
      releaseReason: "requested_version_mismatch",
      requestedVersion: "1.2.4",
      requestedVersionMismatch: true,
      shouldPublishPackage: false,
    });
  });
});
