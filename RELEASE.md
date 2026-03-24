# Releasing `@prisma/studio-core`

This repository supports two release paths. Both publish from `main`, use npm trusted publishing through GitHub OIDC, and publish the root package as `@prisma/studio-core`.

## One-Time Setup

Configure `@prisma/studio-core` in npm as a trusted publisher for the `prisma/studio` GitHub repository and the publish workflow. The workflow does not use `NPM_TOKEN`.

## Path 1: Changesets Release PR

Use this path for normal releases.

1. Add a changeset in your feature PR with `pnpm changeset`.
2. Merge the feature PR into `main`.
3. The `version packages` workflow opens or updates a release PR with `package.json` and `CHANGELOG.md` changes.
4. Review and merge that release PR into `main`.
5. The `publish` workflow publishes the new version to npm and creates or updates the GitHub release using the matching `CHANGELOG.md` section.

## Path 2: Manual Publish From Actions

Use this path when `main` already contains the version you want to publish and you want to publish it on demand.

1. Update `package.json` on `main` to the exact version you want to publish.
2. Update `CHANGELOG.md` on `main` if you want GitHub release notes for that version.
3. Open `Repository > Actions > publish`.
4. Run the workflow on `main` and enter the exact version.

The workflow checks that the requested version matches `package.json` on `main` and that npm does not already have that version. If `CHANGELOG.md` contains `## <version>`, that section becomes the GitHub release notes. If it does not, the publish still succeeds and the GitHub release is created with empty notes.

## Local Commands

- `pnpm changeset` creates a changeset file for the current work.
- `pnpm version-packages` applies pending changesets to `package.json` and `CHANGELOG.md`.
- `pnpm release:prepare` shows the publish decision the workflow would make from the current checkout.
- `pnpm check:exports` packs the package, validates the published export surface, and removes the temporary tarball.

## Rules

- Publish from `main` only.
- Do not publish a version that is not already present in `package.json` on `main`.
- Prefer the Changesets release PR path for normal releases.
- Use the manual Actions path only when you need explicit operator control over when an already-versioned commit is published.
