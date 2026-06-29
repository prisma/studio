# Compute Preview Deploys

This document is normative for branch-scoped and latest-main Compute preview
deployments.

## Purpose

Pull requests and the latest `main` branch need live Studio previews without
manually creating and cleaning up Compute services.

The preview deployment path uses the existing `pnpm build:deploy` artifact and
publishes it into the dedicated Compute project named `studio-preview`.

## Triggering

- A preview deploy MUST run when a pull request is opened, reopened, or updated
  with new commits.
- A stable `main` preview deploy MUST run whenever `main` receives new commits.
- Preview deploys MUST only run for branches inside this repository. Forked pull
  requests MUST NOT receive the Compute token.
- A preview service MUST be destroyed when the corresponding Git branch is
  deleted.
- Because the GitHub `delete` event is evaluated from the default branch
  workflow set, this workflow MUST be merged to `main` before branch-deletion
  cleanup becomes automatic for later branches.

## Service Naming

- Pull request preview services MUST be keyed by the pull request branch name.
- The latest-main preview service MUST be keyed by the literal branch name
  `main`.
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
  `bunx @prisma/compute-cli@latest deploy --skip-build --path deploy --entrypoint bundle/compute-entrypoint.js --http-port 8080`.
- The Compute artifact MUST include `bundle/compute-entrypoint.js`, which
  defaults `STUDIO_DEMO_PORT` to `8080` before importing
  `bundle/server.bundle.js`.
- Preview deploys MUST pass runtime environment through a temporary Compute CLI
  env file rather than embedding secrets into the artifact.
- Preview runtime env MUST include `STUDIO_DEMO_PORT=8080`,
  `STUDIO_DEMO_AI_ENABLED=true`, and `ANTHROPIC_API_KEY` from the GitHub
  Actions secret `STUDIO_PREVIEW_ANTHROPIC_API_KEY`.

## Main Preview

- The stable preview for the latest `main` MUST use `main` as the service key so
  the Compute service URL remains stable across pushes.
- Successful `main` preview deploys SHOULD write the live service URL to the
  GitHub Actions job summary.

## PR Feedback

- Successful preview deploys MUST post the live service URL back to the pull
  request.
- The PR comment MUST be sticky: later deploys for the same PR update the
  existing preview comment instead of creating duplicates.
- The visible PR comment content MUST include only one preview URL. Branch,
  service, and version identifiers MUST stay out of the visible comment body.
