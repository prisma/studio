const semverExpression = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/;

export function extractSemver(value) {
  if (!value) {
    return "";
  }

  const match = String(value).match(semverExpression);
  return match?.[1] ?? "";
}

const parseIdentifier = (value) => (/^[0-9]+$/.test(value) ? Number(value) : value);

const comparePrerelease = (a, b) => {
  const aParts = a ? a.split(".") : [];
  const bParts = b ? b.split(".") : [];
  const partCount = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < partCount; index++) {
    const aPart = aParts[index];
    const bPart = bParts[index];

    if (aPart === undefined) {
      return -1;
    }

    if (bPart === undefined) {
      return 1;
    }

    const aIdentifier = parseIdentifier(aPart);
    const bIdentifier = parseIdentifier(bPart);

    if (typeof aIdentifier === "number" && typeof bIdentifier === "number") {
      if (aIdentifier !== bIdentifier) {
        return aIdentifier > bIdentifier ? 1 : -1;
      }

      continue;
    }

    if (typeof aIdentifier === "number") {
      return -1;
    }

    if (typeof bIdentifier === "number") {
      return 1;
    }

    if (aIdentifier !== bIdentifier) {
      return aIdentifier > bIdentifier ? 1 : -1;
    }
  }

  return 0;
};

export function compareSemver(a, b) {
  const normalizedA = extractSemver(a);
  const normalizedB = extractSemver(b);

  if (!normalizedA || !normalizedB) {
    throw new Error(`Cannot compare invalid semantic versions: "${a}" and "${b}".`);
  }

  const [aCore, aPrerelease = ""] = normalizedA.split("-");
  const [bCore, bPrerelease = ""] = normalizedB.split("-");
  const aNumbers = aCore.split(".").map((part) => Number(part));
  const bNumbers = bCore.split(".").map((part) => Number(part));

  for (let index = 0; index < 3; index++) {
    const aNumber = aNumbers[index] ?? 0;
    const bNumber = bNumbers[index] ?? 0;

    if (aNumber !== bNumber) {
      return aNumber > bNumber ? 1 : -1;
    }
  }

  if (!aPrerelease && !bPrerelease) {
    return 0;
  }

  if (!aPrerelease) {
    return 1;
  }

  if (!bPrerelease) {
    return -1;
  }

  return comparePrerelease(aPrerelease, bPrerelease);
}

export function extractChangelogSection(changelog, version) {
  const lines = changelog.split(/\r?\n/u);
  const heading = `## ${version}`;
  const startIndex = lines.findIndex((line) => line.trim() === heading);

  if (startIndex === -1) {
    return null;
  }

  let endIndex = lines.length;

  for (let index = startIndex + 1; index < lines.length; index++) {
    if (lines[index].startsWith("## ")) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join("\n").trimEnd();
}

const hasSectionBody = (section) =>
  section
    .split(/\r?\n/u)
    .slice(1)
    .some((line) => line.trim() !== "");

export function createReleasePlan({
  allowMissingChangelog = false,
  changelog,
  expectedVersion = "",
  latestNpmVersion,
  packageVersion,
}) {
  const normalizedPackageVersion = extractSemver(packageVersion);

  if (!normalizedPackageVersion) {
    throw new Error(`Could not parse package version from package.json: ${packageVersion}`);
  }

  const normalizedExpectedVersion = extractSemver(expectedVersion);
  const normalizedNpmVersion = extractSemver(latestNpmVersion);
  const releaseNotesSection = extractChangelogSection(changelog, normalizedPackageVersion);
  const hasReleaseNotes = releaseNotesSection !== null && hasSectionBody(releaseNotesSection);
  const requestedVersionMismatch =
    normalizedExpectedVersion !== "" && normalizedExpectedVersion !== normalizedPackageVersion;
  const versionAheadOfNpm =
    !normalizedNpmVersion ||
    compareSemver(normalizedPackageVersion, normalizedNpmVersion) > 0;
  const missingChangelogForNewVersion = versionAheadOfNpm && !hasReleaseNotes;

  let releaseReason = "version_not_ahead_of_npm";

  if (requestedVersionMismatch) {
    releaseReason = "requested_version_mismatch";
  } else if (missingChangelogForNewVersion && !allowMissingChangelog) {
    releaseReason = "missing_changelog_entry";
  } else if (missingChangelogForNewVersion) {
    releaseReason = "version_ahead_of_npm_without_changelog";
  } else if (versionAheadOfNpm) {
    releaseReason = "version_ahead_of_npm";
  }

  return {
    allowMissingChangelog,
    hasReleaseNotes,
    latestNpmVersion: normalizedNpmVersion,
    missingChangelogForNewVersion,
    packageVersion: normalizedPackageVersion,
    requestedVersion: normalizedExpectedVersion,
    requestedVersionMismatch,
    releaseNotes: hasReleaseNotes ? releaseNotesSection : null,
    releaseReason,
    shouldPublishPackage:
      !requestedVersionMismatch &&
      versionAheadOfNpm &&
      (hasReleaseNotes || allowMissingChangelog),
    versionAheadOfNpm,
  };
}
