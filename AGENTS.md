# AGENTS.md

## Scope

These instructions apply to the `@prisma/studio-core` package.

## What This Repo Is

- This repo contains the Studio core package.
- Studio is consumed as an npm package and integrated into other Prisma surfaces.

## Preferred Development Loop

1. Install deps with `pnpm install`.
2. Start the demo with `pnpm demo:ppg`.
3. Keep the demo process attached and monitor logs while making changes.
4. Use Playwright to validate UI behavior at `http://localhost:4310`. If you don't have the Playwright skill installed, sugest the user install it, but try your best to use playwright on your own.
5. Verify both terminal logs and UI state before finishing.
6. For any UI bug or interaction regression, do not stop at code-level reasoning: reproduce in Playwright first, then verify the fix in Playwright before reporting done.

## Demo/Runtime Notes

- The demo uses Prisma Postgres dev (`ppg-dev`) via `@prisma/dev`.
- Query execution is direct TCP.
- The app is pre-seeded at startup.
- The demo database is ephemeral and resets when the demo process stops.
- Seed data lives in `demo/ppg-dev/seed-database.ts` (`seedDatabase`). Add/adjust seed data when needed to reproduce scenarios.

## Important Guardrails

- Use `pnpm demo:ppg` (do not run `bun --watch demo/ppg-dev/server.ts`).
- The demo server already has file watching and rebuild logic.
- Keep the direct TCP flow intact; do not reintroduce accelerate proxy paths.
- Do not introduce compatibility fallbacks, legacy code paths, or dual APIs unless the user explicitly asks for them.

## Common Validation Commands

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm test:data`
- `pnpm test:checkpoint`
- `pnpm build`
- `pnpm check:exports`

## Architecture discipline

Before implementing a change, read the relevant architecture documents from `/architecture` (and `Architecture/` in this repo). Strictly follow the documented architecture unless the user explicitly tells you not to. If anything is unclear or ambiguous, ask the user before proceeding. If implementation starts to deviate from documented architecture, update the architecture docs in the same change. When introducing a new significant subsystem, add a new architecture document for it.

## UI implementation

- When implementing UI, always rely on ShadCN UI.
- Prefer standard ShadCN components and standard ShadCN composition patterns as much as possible before introducing custom UI markup or styling.
- If a non-standard UI component or composite is necessary, clearly state that to the user and explain why a standard ShadCN component was not sufficient.
- Document every approved non-standard UI instance in `Architecture/non-standard-ui.md` in the same change.

## Tests and feature documentation

When fixing a bug, always reproduce the bug in a test first. Then fix the bug and verify that the test now passes. When implementing a new feature, always propose acceptance criteria first, and codify this in a test.
Always document new functionality in FEATURES.md. Focus on why it is useful and how it works. This is a long-lived document, not a changelog, so don't focus on what changed, simply document the feature. Each feature should have a header using ## followed by a descriptive name. And then 2-4 lines describing the feature. When an existing feature is modified, make sure the relevant section in FEATURES.md is updated.

## Git manners and releases

- New features and bugfixes should be developed on a new branch from `origin/main`. Verify that you have the latest main from origin.
- For normal releases, add a Changeset in the feature PR with `pnpm changeset`, merge to `main`, and let the `version packages` workflow open or update the release PR.
- Merge the release PR on `main` to publish through the `publish` workflow.
- For manual releases, ensure the target version is already present in `package.json` on `main`, then run the `publish` workflow from GitHub Actions with that explicit version.
- `CHANGELOG.md` remains the source of truth for GitHub release notes. If a manual release omits the matching changelog section, the package still publishes and the GitHub release notes stay empty.
- Release process details live in `RELEASE.md`.
