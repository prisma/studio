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

export function buildPreviewRuntimeEnv(args) {
  const { anthropicApiKey, httpPort } = args;

  return {
    ANTHROPIC_API_KEY: anthropicApiKey,
    STUDIO_DEMO_AI_ENABLED: "true",
    STUDIO_DEMO_PORT: httpPort,
  };
}

export function formatDotenvFile(env) {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n")}\n`;
}

export function buildComputeDeployArgs(args) {
  const {
    deployPath,
    entrypoint,
    envFilePath,
    httpPort,
    serviceId,
  } = args;
  const deployArgs = [
    "deploy",
    "--skip-build",
    "--path",
    deployPath,
    "--entrypoint",
    entrypoint,
    "--http-port",
    httpPort,
  ];

  if (envFilePath) {
    deployArgs.push("--env", envFilePath);
  }

  deployArgs.push("--service", serviceId);

  return deployArgs;
}

export function normalizePreviewUrl(value) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;
}

export function buildPreviewDeployResult(args) {
  const { branchName, deployResult, project, region, service, serviceName } =
    args;
  const serviceUrl = normalizePreviewUrl(
    deployResult.appEndpointDomain ?? deployResult.serviceEndpointDomain,
  );

  if (!serviceUrl) {
    throw new Error("Compute deploy did not return a preview URL.");
  }

  return {
    branchName,
    projectId: project.id,
    region,
    serviceId: service.id,
    serviceName,
    serviceUrl,
    versionId: deployResult.deploymentId ?? deployResult.versionId,
    versionUrl: normalizePreviewUrl(
      deployResult.deploymentEndpointDomain ??
        deployResult.versionEndpointDomain,
    ),
  };
}

export function buildPreviewCommentBody(args) {
  const { serviceUrl } = args;

  const lines = [
    PREVIEW_COMMENT_MARKER,
    `🖥️ Preview: ${serviceUrl}`,
  ];

  return lines.join("\n");
}
