import { createHash } from "node:crypto";

export const PREVIEW_PROJECT_NAME = "studio-preview";
export const PREVIEW_COMMENT_MARKER = "<!-- studio-compute-preview -->";
export const MAX_COMPUTE_SERVICE_NAME_LENGTH = 63;

export function sanitizeComputeServiceName(branchName) {
  const normalized = branchName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const fallbackName = normalized.length > 0 ? normalized : "preview";

  if (fallbackName.length <= MAX_COMPUTE_SERVICE_NAME_LENGTH) {
    return fallbackName;
  }

  const suffix = createHash("sha256")
    .update(branchName)
    .digest("hex")
    .slice(0, 8);
  const prefixLength =
    MAX_COMPUTE_SERVICE_NAME_LENGTH - suffix.length - 1;
  const truncatedPrefix = fallbackName
    .slice(0, prefixLength)
    .replace(/-+$/g, "");

  return `${truncatedPrefix}-${suffix}`;
}

export function findNamedProject(projects, projectName) {
  return projects.find((project) => project.name === projectName);
}

export function findNamedService(services, serviceName) {
  return services.find((service) => service.name === serviceName);
}

export function buildPreviewCommentBody(args) {
  const {
    branchName,
    serviceName,
    serviceUrl,
    versionUrl,
  } = args;

  const lines = [
    PREVIEW_COMMENT_MARKER,
    "Compute preview deployed.",
    "",
    `Branch: \`${branchName}\``,
    `Service: \`${serviceName}\``,
    `Preview: ${serviceUrl}`,
  ];

  if (versionUrl) {
    lines.push(`Version: ${versionUrl}`);
  }

  return lines.join("\n");
}
