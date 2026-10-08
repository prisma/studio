#!/usr/bin/env node

import {
  buildPreviewCommentBody,
  PREVIEW_COMMENT_MARKER,
} from "./compute-preview-utils.mjs";

async function main() {
  const githubToken = getRequiredEnv("GITHUB_TOKEN");
  const repository = getRequiredEnv("GITHUB_REPOSITORY");
  const branchName = getRequiredEnv("PREVIEW_BRANCH_NAME");
  const serviceName = getRequiredEnv("PREVIEW_SERVICE_NAME");
  const serviceUrl = getRequiredEnv("PREVIEW_SERVICE_URL");

  await updatePreviewComments({
    githubToken,
    repository,
    branchName,
    serviceName,
    serviceUrl,
  });
}

export async function updatePreviewComments(args) {
  const { githubToken, repository, branchName, serviceName, serviceUrl } = args;
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY value "${repository}".`);
  }

  const body = buildPreviewCommentBody({
    branchName,
    serviceName,
    serviceUrl,
  });
  const pullRequests = await githubRequest({
    githubToken,
    method: "GET",
    path: `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branchName}`)}&per_page=100`,
  });

  for (const pullRequest of pullRequests) {
    const comments = await githubRequest({
      githubToken,
      method: "GET",
      path: `/repos/${owner}/${repo}/issues/${pullRequest.number}/comments?per_page=100`,
    });
    const existingComment = comments.find(
      (comment) =>
        comment.user?.login === "github-actions[bot]" &&
        typeof comment.body === "string" &&
        comment.body.includes(PREVIEW_COMMENT_MARKER),
    );

    await githubRequest({
      body: { body },
      githubToken,
      method: existingComment ? "PATCH" : "POST",
      path: existingComment
        ? `/repos/${owner}/${repo}/issues/comments/${existingComment.id}`
        : `/repos/${owner}/${repo}/issues/${pullRequest.number}/comments`,
    });
  }
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

if (import.meta.main) await main();
