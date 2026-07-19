#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  PREVIEW_PROJECT_NAME,
  findNamedProject,
  findNamedService,
  sanitizeComputeServiceName,
} from "./compute-preview-utils.mjs";

const execFileAsync = promisify(execFile);

async function main() {
  const branchName = getRequiredEnv("PREVIEW_BRANCH_NAME");
  const projectName = process.env.PREVIEW_PROJECT_NAME ?? PREVIEW_PROJECT_NAME;
  const serviceName = sanitizeComputeServiceName(branchName);
  const projects = await runComputeJson(["projects", "list"]);
  const project = findNamedProject(projects, projectName);

  if (!project) {
    throw new Error(`Compute project "${projectName}" was not found.`);
  }

  const services = await runComputeJson([
    "services",
    "list",
    "--project",
    project.id,
  ]);
  const service = findNamedService(services, serviceName);

  if (!service) {
    process.stdout.write(
      `${JSON.stringify(
        { branchName, projectId: project.id, serviceName, destroyed: false },
        null,
        2,
      )}\n`,
    );
    return;
  }

  await runComputeJson(["services", "destroy", service.id]);
  process.stdout.write(
    `${JSON.stringify(
      { branchName, projectId: project.id, serviceId: service.id, serviceName, destroyed: true },
      null,
      2,
    )}\n`,
  );
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

await main();
