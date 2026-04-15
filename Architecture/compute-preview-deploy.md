# Compute Preview Deploys

This document is normative for branch-scoped Compute preview deployments.

## Purpose

Pull requests need a live Studio preview without manually creating and cleaning up
Compute services for every branch.

The preview deployment path uses the existing `pnpm build:deploy` artifact and
publishes it into the dedicated Compute project named `studio-preview`.

## Triggering

- A preview deploy MUST run when a pull request is opened, reopened, or updated
  with new commits.
- Preview deploys MUST only run for branches inside this repository. Forked pull
  requests MUST NOT receive the Compute token.
- A preview service MUST be destroyed when the corresponding Git branch is
  deleted.
- Because the GitHub `delete` event is evaluated from the default branch
  workflow set, this workflow MUST be merged to `main` before branch-deletion
  cleanup becomes automatic for later branches.

## Service Naming

- Preview services MUST be keyed by the pull request branch name.
- Because Compute service names need a filesystem- and URL-safe shape, the raw
  branch name MUST be normalized to a lowercase slug containing only
  alphanumeric segments separated by `-`.
- If the normalized branch slug exceeds the Compute name budget, it MUST be
  truncated and keep a stable hash suffix so repeated deploys resolve to the
  same service.
- The same normalization MUST be used for deploy and destroy flows.

## Deploy Flow

- The workflow MUST build the preview artifact with `pnpm build:deploy`.
- The workflow MUST authenticate with Compute through the GitHub Actions secret
  `STUDIO_PREVIEW_COMPUTE_TOKEN`, exposed to the CLI as `PRISMA_API_TOKEN`.
- The deploy helper MUST resolve the `studio-preview` Compute project by name at
  runtime instead of hardcoding an opaque service id.
- If the branch preview service does not exist, the helper MUST create it in the
  project's default region.
- If the service already exists, the helper MUST deploy a new version to that
  same service.
- Deployments MUST use the published CLI entrypoint:
  `bunx @prisma/compute-cli@latest deploy --skip-build --path deploy --entrypoint bundle/server.bundle.js --http-port 8080 --env STUDIO_DEMO_PORT=8080`.

## PR Feedback

- Successful preview deploys MUST post the live service URL back to the pull
  request.
- The PR comment MUST be sticky: later deploys for the same PR update the
  existing preview comment instead of creating duplicates.
- The comment MUST include the original branch name plus the resolved Compute
  service name so any slug normalization stays visible.
