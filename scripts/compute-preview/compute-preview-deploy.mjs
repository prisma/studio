#!/usr/bin/env node

import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  PREVIEW_PROJECT_NAME,
  buildComputeDeployArgs,
  buildPreviewDeployResult,
  buildPreviewRuntimeEnv,
  findNamedProject,
  findNamedService,
  formatDotenvFile,
  sanitizeComputeServiceName,
} from "./compute-preview-utils.mjs";

const execFileAsync = promisify(execFile);

async function main() {
  const branchName = getRequiredEnv("PREVIEW_BRANCH_NAME");
  const anthropicApiKey = getRequiredEnv("ANTHROPIC_API_KEY");
  const projectName = process.env.PREVIEW_PROJECT_NAME ?? PREVIEW_PROJECT_NAME;
  const deployPath = process.env.PREVIEW_DEPLOY_PATH ?? "deploy";
  const entrypoint =
    process.env.PREVIEW_ENTRYPOINT ?? "bundle/compute-entrypoint.js";
  const httpPort = process.env.PREVIEW_HTTP_PORT ?? "8080";
  const serviceName = sanitizeComputeServiceName(branchName);

  const project = await resolveProject(projectName);
  const service = await ensureService({
    projectId: project.id,
    region: project.defaultRegion ?? "eu-west-3",
    serviceName,
  });
  const runtimeEnvDir = await mkdtemp(
    join(tmpdir(), "studio-compute-preview-env-"),
  );
  const runtimeEnvPath = join(runtimeEnvDir, ".env");
  let deployResult;

  try {
    await writeFile(
      runtimeEnvPath,
      formatDotenvFile(
        buildPreviewRuntimeEnv({
          anthropicApiKey,
          httpPort,
        }),
      ),
      { mode: 0o600 },
    );
    deployResult = await runComputeJson(
      buildComputeDeployArgs({
        deployPath,
        entrypoint,
        envFilePath: runtimeEnvPath,
        httpPort,
        serviceId: service.id,
      }),
    );
  } finally {
    await rm(runtimeEnvDir, { force: true, recursive: true });
  }

  const result = buildPreviewDeployResult({
    branchName,
    region: project.defaultRegion ?? "eu-west-3",
    project,
    deployResult,
    service,
    serviceName,
  });

  writeOutputs(result);
  process.stdout.write(
    `${JSON.stringify({ previewUrl: result.serviceUrl }, null, 2)}\n`,
  );
}

async function resolveProject(projectName) {
  const projects = await runComputeJson(["projects", "list"]);
  const project = findNamedProject(projects, projectName);

  if (!project) {
    throw new Error(`Compute project "${projectName}" was not found.`);
  }

  return project;
}

async function ensureService(args) {
  const { projectId, region, serviceName } = args;
  const services = await runComputeJson([
    "services",
    "list",
    "--project",
    projectId,
  ]);
  const existingService = findNamedService(services, serviceName);

  if (existingService) {
    return existingService;
  }

  return await runComputeJson([
    "services",
    "create",
    "--project",
    projectId,
    "--name",
    serviceName,
    "--region",
    region,
  ]);
}

async function runComputeJson(args) {
  const { stderr, stdout } = await execFileAsync(
    "bunx",
    ["@prisma/compute-cli@latest", ...args, "--json"],
    {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const payload = JSON.parse(stdout);

  if (payload.ok !== true) {
    throw new Error(
      `Compute CLI returned a non-ok payload.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }

  return payload.data;
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

function writeOutputs(result) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  const lines = Object.entries({
    preview_branch_name: result.branchName,
    preview_project_id: result.projectId,
    preview_region: result.region,
    preview_service_id: result.serviceId,
    preview_service_name: result.serviceName,
    preview_service_url: result.serviceUrl,
    preview_version_id: result.versionId,
    preview_version_url: result.versionUrl,
  })
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${key}=${value}`);

  appendFileSync(outputPath, `${lines.join("\n")}\n`);
}

await main();
