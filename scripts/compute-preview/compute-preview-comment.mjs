#!/usr/bin/env node

import {
  PREVIEW_COMMENT_MARKER,
  buildPreviewCommentBody,
} from "./compute-preview-utils.mjs";

async function main() {
  const githubToken = getRequiredEnv("GITHUB_TOKEN");
  const repository = getRequiredEnv("GITHUB_REPOSITORY");
  const prNumber = getRequiredEnv("PREVIEW_PR_NUMBER");
  const branchName = getRequiredEnv("PREVIEW_BRANCH_NAME");
  const serviceName = getRequiredEnv("PREVIEW_SERVICE_NAME");
  const serviceUrl = getRequiredEnv("PREVIEW_SERVICE_URL");
  const versionUrl = process.env.PREVIEW_VERSION_URL?.trim();
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY value "${repository}".`);
  }

  const body = buildPreviewCommentBody({
    branchName,
    serviceName,
    serviceUrl,
    versionUrl,
  });
  const comments = await githubRequest({
    githubToken,
    method: "GET",
    path: `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
  });
  const existingComment = comments.find((comment) =>
    typeof comment.body === "string" &&
    comment.body.includes(PREVIEW_COMMENT_MARKER),
  );

  if (existingComment) {
    await githubRequest({
      body: { body },
      githubToken,
      method: "PATCH",
      path: `/repos/${owner}/${repo}/issues/comments/${existingComment.id}`,
    });
    return;
  }

  await githubRequest({
    body: { body },
    githubToken,
    method: "POST",
    path: `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
  });
}

async function githubRequest(args) {
  const { body, githubToken, method, path } = args;
  const response = await fetch(`https://api.github.com${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "studio-compute-preview",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    method,
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API request failed (${response.status} ${response.statusText}): ${await response.text()}`,
    );
  }

  return method === "GET" ? await response.json() : null;
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

await main();
