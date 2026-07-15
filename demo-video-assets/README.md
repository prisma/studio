# Migrations view — demo video assets (temporary share branch)

Temporary branch for sharing the Migrations-view demo videos; not meant to be merged.

- `migrations-view-demo-v1.mp4` — first cut (initial feature set: timeline, visual diff canvas, SQL panel).
- `migrations-view-demo-v2.mp4` — final cut (adds the all-models toggle, Prisma-schema diff panel, morphing transitions, resizable split). This is the video linked from PR #1533.

Both are 30-second HyperFrames renders (HTML compositions rendered to MP4) produced alongside the feature on `feature/migrations-view` (shipped in `@prisma/studio-core@0.32.0`).

Note: only the rendered MP4s survive. The HyperFrames source projects (HTML compositions, shot plans, capture scripts, audio) lived in a temporary working directory that macOS's periodic /tmp cleanup removed before this branch was created, so they cannot be included.
