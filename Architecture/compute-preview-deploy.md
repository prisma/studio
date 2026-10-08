# Compute Preview Deploys

This document is normative for the hosted demo and branch-scoped Prisma Composer deployments.

## Purpose and Application

Studio needs a stable hosted demo and isolated branch previews without managing
Compute resources by hand. `module.ts` declares the `studio` app with one `studio`
service from `demo/ppg-dev/compute-service.ts`. This is demo infrastructure;
Composer MUST stay in dev dependencies and MUST NOT enter the published library API.

The service MUST use Composer's directory build adapter to include the complete
`deploy/` artifact, with `bundle/server.bundle.js` as its entry. Prisma Dev and
Streams remain inside that service so each environment starts with its own ephemeral,
seeded database and event streams. Query execution MUST remain direct TCP.

`prisma.config.ts` MUST register `prismaCloud()`, `nodeBuild()`, and `prismaState()`
in its `composer` section. Hosted state lets a fresh CI checkout converge the same
environment without custom resource state. The configured `ap-southeast-1` region
is used only when creating a project; an existing project keeps its region.
The CLI, Composer packages, and Alchemy executable MUST be pinned in dev
dependencies. Alchemy is direct because pnpm does not expose transitive bins.

## Git Connection and Credentials

The `prisma/studio` repository MUST be connected to the intended Prisma project
through the Prisma GitHub App. The Composer app name MUST match that project's
name. A local CLI project link is stored in gitignored `.prisma/local.json` and
MUST NOT be committed or relied upon by CI.

The workflow MUST authenticate through GitHub OIDC with `id-token: write`.
The official deploy action exchanges the job's identity for a short-lived workspace
token and selects its workspace. Studio MUST NOT configure a long-lived Prisma
service token or workspace-ID variable in the workflow.

The Console framework importer is not required for this library repository.
Creating an empty `studio` project and running `prisma project link studio` followed
by `prisma git connect https://github.com/prisma/studio` connects it to the Composer
app and workflow already in the repository. No generic root `start` script or
automatically scaffolded deployment workflow is required.

The CLI connection MUST be used for this setup. Console's Connect GitHub button
also runs the framework importer and can reject the library repository before
connecting it. CLI authentication MUST target the workspace containing the empty
project; the browser's current workspace does not change an existing CLI session.

## Branch Identity and Triggering

- Deploys MUST run on branch pushes and MAY be rerun manually. Opening a PR alone
  does not trigger a deployment. Fork repositories MUST skip the deployment job.
- Deploys MUST check out the triggering commit. The official action MUST select
  production for the default branch and an isolated stage for other branches.
  Studio MUST NOT override the stage with a PR merge ref or force `main` into a stage.
- Stage names MUST retain the exact Git ref, including slashes and case. Composer
  validates Git refs; Studio MUST NOT slug or truncate them. Distinct branches
  such as `feature/foo` and `feature-foo` must stay distinct.
- The service name MUST remain `studio` inside every environment. Composer manages
  the project, branch, service, versions, runtime configuration, and hosted state.
- Deployments for one branch MUST share a concurrency group and MUST NOT cancel
  an in-progress Composer operation, which owns a hosted state lease.

## Build and Deploy

The workflow MUST use the pinned official `prisma/cloud-deploy-action` with
`install-command: pnpm install --frozen-lockfile`, `build-command: pnpm build:deploy`,
and `module: module.ts`. The action runs the installed Prisma CLI under Bun.

The job MUST prepare an empty `.prisma-composer/tmp` directory and expose its
absolute path as `TMPDIR` to Composer. The directory adapter traces runtime file
accesses in the self-contained Prisma Dev bundle; using the system temp directory
would include unrelated host files and sockets in that trace. Generated Composer
and Alchemy directories MUST be gitignored and excluded from lint/typecheck.

The bundled server MUST read its HTTP port from `service.port()` through the
prebuilt-assets module and bind `0.0.0.0`. The source demo continues to use
`STUDIO_DEMO_PORT` (default `4310`). There is no fixed-port Compute wrapper.

The workflow MUST fail when the deploy action skips for missing credentials rather
than silently reporting success. A skipped action MUST NOT post a success comment.

## Teardown and PR Feedback

The repository connection owns branch deletion: Prisma removes the matching
preview's services, databases, and buckets. Production and the default branch are
protected. Studio MUST NOT maintain a custom destroy job or resource-enumeration
helper. The connection's cleanup does not depend on a workflow firing on deletion.

Successful non-default branch deploys MUST update one sticky PR comment on each
already-open PR for that same repository branch, using the action's `url` output.
The existing `<!-- studio-compute-preview -->` marker MUST be retained, and the
comment MUST show the exact stage name and `studio` service. Only comments owned
by `github-actions[bot]` may be edited. A branch without an open PR still deploys;
its URL remains available in the action's workflow summary.

## Migration

Existing hand-created services are not Composer-managed state. The migration
MUST NOT try to adopt, delete, or add compatibility paths for them. New Composer
environments can be provisioned alongside them; older services require explicit
cleanup in Prisma Console. If a target branch already contains resources but has
no Composer state, Composer refuses to overwrite it. Use a fresh empty project or
clear the obsolete environment explicitly before deploying.

Before merging, connect the intended project, rerun the branch workflow, and verify
the preview URL. The merge push then deploys the stable demo on the default branch.
