# Demo Compute Bundling

## Purpose

The `demo/ppg-dev` server has two runtime modes:

- local development mode, where it rebuilds browser assets from source and watches the repo
- deploy mode, where it serves prebuilt browser assets from a bundled artifact
- external data-source mode, where the demo keeps serving the Studio shell locally but proxies Streams to a caller-provided upstream server and runs direct TCP queries against a caller-provided PostgreSQL connection string instead of starting local Prisma Dev

The deploy path exists because the demo server is not just a Bun server entrypoint. In development it expects the Studio repo checkout so it can rebuild `client.tsx` and `ui/index.css` at runtime.

Bundled deploy mode uses the embedded local Prisma Streams runtime exactly as published by `@prisma/streams-local`, so Studio does not carry a second demo-local memory autotune layer on top of Streams' own defaults.

## Build Responsibilities

`demo/ppg-dev/build-compute.ts` is the production packager for the demo.

It is responsible for:

1. building the browser JS from `demo/ppg-dev/client.tsx`
2. processing `ui/index.css` through the repo PostCSS pipeline
3. injecting those prebuilt assets into the bundled server through `virtual:prebuilt-assets`
4. copying Prisma Dev runtime assets into `bundle/` with their stable filenames
5. bundling Prisma Streams local's worker into `touch/processor_worker.js`
6. copying the worker's vendored `hash_vendor/` files into `touch/`
7. writing a self-contained output directory whose entrypoint is `bundle/server.bundle.js`

## Prisma Dev Runtime Assets

`@prisma/dev@0.24.6` exposes a Bun runtime-asset manifest for PGlite and also
exports `copyPrismaDevRuntimeAssets()`.

That means when `build-compute.ts` bundles `demo/ppg-dev/server.ts` with Bun:

- Bun sees `@prisma/dev`'s literal Bun manifest import
- Bun emits hashed PGlite `.wasm`, `.data`, and extension archives next to the bundled server entrypoint
- `build-compute.ts` then copies the same runtime assets into `deploy/bundle/` with their canonical names like `pglite.wasm` and `pglite-seed.tar.gz`

That extra copy is a Studio-side workaround for the current Compute boot path:
the deployed `@prisma/dev` runtime still resolves stable filenames relative to
the server bundle in some startup paths, so the Compute artifact needs both the
hashed Bun-emitted assets and the canonical names.

## Prisma Streams Worker Assets

`@prisma/dev` also starts Prisma Streams local and spawns a worker from
`../touch/processor_worker.js` relative to the bundled server entrypoint.

For the Compute artifact that means:

- the server entrypoint stays at `deploy/bundle/server.bundle.js`
- stable PGlite assets live in `deploy/bundle/`
- the Streams worker must live at `deploy/touch/processor_worker.js`
- the worker's vendored hashing modules must live at `deploy/touch/hash_vendor/`

The worker cannot be copied verbatim from `node_modules` because it still
imports package dependencies such as `better-result` and `ajv`. `build-compute.ts`
therefore Bun-bundles that worker into a standalone file before copying the
vendored hash modules alongside it.

## Runtime Detection

`demo/ppg-dev/server.ts` attempts to import `virtual:prebuilt-assets`.

- If the import resolves, the server runs in deploy mode.
- If the import fails, the server falls back to local development mode.

That keeps one server implementation for both workflows without adding a separate production-only server entrypoint.

## Local Development Shutdown

In local development mode, `demo/ppg-dev/server.ts` also owns the lifecycle of the Prisma Dev child runtime, including the local Prisma Streams server.

- The first shutdown signal MUST start orderly cleanup for the Bun HTTP server, Prisma Dev runtime, Postgres client, and file watchers.
- If cleanup stalls, a repeated shutdown signal MUST force the demo process to exit instead of being ignored.
- The demo process SHOULD also force-exit after a short timeout if cleanup never finishes, so orphaned Prisma Dev and Streams listeners do not block the next `pnpm demo:ppg` run.

## External Demo Mode

The `pnpm demo:ppg` entrypoint MAY also be launched against external data sources:

- `pnpm demo:ppg -- --streams-server-url <streams-url>`
- `pnpm demo:ppg -- --database-url <postgres-url> --streams-server-url <streams-url>`

When `--streams-server-url` is provided, Studio MUST treat the run as external mode.

- It MUST NOT start local Prisma Dev.
- It MUST NOT start a local Prisma Streams server.
- It MUST NOT set up local `prisma-wal` wiring, because that is part of the colocated Prisma Dev + Streams startup path.
- If `--database-url` is also provided, it MUST connect the BFF executor directly to that PostgreSQL URL.
- If `--database-url` is omitted, the demo MUST run in streams-only mode and MUST NOT expose database-driven Studio navigation or views.
- The browser config MUST continue to expose Streams through Studio's own `/api/streams` proxy path so the UI contract stays unchanged.
- The demo shell MUST NOT claim the database was locally seeded when external mode is active.

## Local Streams Development Override

Studio keeps `@prisma/dev` as the only runtime dependency in source, but local
development MAY temporarily override both the root `@prisma/dev` dependency and
that package's transitive `@prisma/streams-local` dependency through the
repo-level `.pnpmfile.cjs` hook.

- The override MUST remain opt-in through `STUDIO_USE_LOCAL_STREAMS=1`.
- `pnpm streams:use-local` MUST point Studio's root `@prisma/dev` dependency at
  the sibling `../team-expansion/dev/server` package (or a caller-provided
  `STUDIO_LOCAL_PRISMA_DEV_PACKAGE_DIR`) so local `@prisma/dev` source changes
  are exercised directly from this checkout.
- Default installs MUST continue to resolve the published npm package.
- `pnpm streams:use-local` MUST build `../streams/dist/npm/streams-local` (or a
  caller-provided override path) and reinstall dependencies with `--no-lockfile`
  so the repo can switch implementations without persisting a machine-local
  path to `pnpm-lock.yaml`.
- `pnpm streams:use-local` MUST also build or otherwise validate the linked
  local `@prisma/dev` package before reinstalling Studio, because the linked
  package's published entrypoints resolve from its `dist/` directory.
- `pnpm streams:use-npm` MUST restore the published npm dependencies with the
  same `--no-lockfile` behavior.
- Because `build-compute.ts` resolves `@prisma/streams-local` from the installed
  `@prisma/dev` dependency tree, bundled demo artifacts MUST follow whichever
  local or published streams package is currently installed.
