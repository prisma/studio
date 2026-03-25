import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { createReleasePlan, extractSemver } from "./release-utils.mjs";

const readJsonFile = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

const readLatestNpmVersion = (packageName) => {
  try {
    const output = execFileSync("npm", ["view", packageName, "version", "--json"], {
      encoding: "utf8",
    }).trim();

    if (!output) {
      return "";
    }

    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? String(parsed.at(-1) ?? "") : String(parsed);
  } catch {
    return "";
  }
};

const writeGitHubOutput = (name, value) => {
  const githubOutputPath = process.env.GITHUB_OUTPUT;

  if (!githubOutputPath) {
    return;
  }

  appendFileSync(githubOutputPath, `${name}=${value}\n`);
};

/**
 * @typedef {object} PrepareReleaseOptions
 * @property {boolean} [allowMissingChangelog]
 * @property {string} [changelogPath]
 * @property {string} [expectedVersion]
 * @property {string} [latestNpmVersion]
 * @property {string} [packageJsonPath]
 * @property {string} [releaseNotesPath]
 */

/**
 * @param {PrepareReleaseOptions} [options]
 */
export function prepareRelease({
  allowMissingChangelog = process.env.ALLOW_MISSING_CHANGELOG === "true",
  changelogPath = "CHANGELOG.md",
  expectedVersion = process.env.EXPECTED_VERSION ?? "",
  latestNpmVersion,
  packageJsonPath = "package.json",
  releaseNotesPath = process.env.RELEASE_NOTES_PATH ?? "release-notes.md",
} = {}) {
  const changelog = readFileSync(changelogPath, "utf8");
  const packageJson = readJsonFile(packageJsonPath);
  const packageVersion = extractSemver(packageJson.version);

  if (!packageVersion) {
    throw new Error(`Could not parse package version from package.json: ${packageJson.version}`);
  }

  const resolvedLatestNpmVersion = latestNpmVersion ?? readLatestNpmVersion(packageJson.name);
  const releasePlan = createReleasePlan({
    allowMissingChangelog,
    changelog,
    expectedVersion,
    latestNpmVersion: resolvedLatestNpmVersion,
    packageVersion,
  });

  if (releasePlan.releaseNotes) {
    writeFileSync(releaseNotesPath, `${releasePlan.releaseNotes}\n`);
  } else {
    rmSync(releaseNotesPath, { force: true });
  }

  return {
    ...releasePlan,
    packageName: packageJson.name,
    releaseNotesPath,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const release = prepareRelease();

  const summaryLines = [
    `package.json version: ${release.packageVersion}`,
    `latest npm version: ${release.latestNpmVersion || "(none)"}`,
    `has changelog entry: ${release.hasReleaseNotes}`,
    `should publish package: ${release.shouldPublishPackage}`,
    `release reason: ${release.releaseReason}`,
  ];

  console.log(summaryLines.join("\n"));

  writeGitHubOutput("package_name", release.packageName);
  writeGitHubOutput("package_version", release.packageVersion);
  writeGitHubOutput("latest_npm_version", release.latestNpmVersion);
  writeGitHubOutput("has_release_notes", release.hasReleaseNotes ? "true" : "false");
  writeGitHubOutput("requested_version", release.requestedVersion);
  writeGitHubOutput(
    "should_publish_package",
    release.shouldPublishPackage ? "true" : "false",
  );
  writeGitHubOutput(
    "missing_changelog_for_new_version",
    release.missingChangelogForNewVersion ? "true" : "false",
  );
  writeGitHubOutput("release_notes_path", release.releaseNotesPath);
  writeGitHubOutput("release_reason", release.releaseReason);

  if (release.requestedVersionMismatch) {
    console.error(
      [
        `Requested version ${release.requestedVersion} does not match`,
        `package.json version ${release.packageVersion}.`,
      ].join(" "),
    );
    process.exit(1);
  }
}
