# Demo Compute Bundling

## Purpose

The `demo/ppg-dev` server has two runtime modes:

- local development mode, where it rebuilds browser assets from source and watches the repo
- deploy mode, where it serves prebuilt browser assets from a bundled artifact

The deploy path exists because the demo server is not just a Bun server entrypoint. In development it expects the Studio repo checkout so it can rebuild `client.tsx` and `ui/index.css` at runtime.

## Build Responsibilities

`demo/ppg-dev/build-compute.ts` is the production packager for the demo.

It is responsible for:

1. building the browser JS from `demo/ppg-dev/client.tsx`
2. processing `ui/index.css` through the repo PostCSS pipeline
3. injecting those prebuilt assets into the bundled server through `virtual:prebuilt-assets`
4. writing a self-contained output directory whose entrypoint is `bundle/server.bundle.js`

It is not responsible for manually collecting Prisma Postgres dev runtime assets anymore, but it does need to carry Prisma Streams worker runtime files that Bun does not discover automatically.

## Prisma Dev Runtime Assets

`@prisma/dev@0.23.1` exposes a Bun runtime-asset manifest for PGlite.

That means when `build-compute.ts` bundles `demo/ppg-dev/server.ts` with Bun:

- Bun sees `@prisma/dev`'s literal Bun manifest import
- Bun emits the required `pglite.wasm`, `pglite.data`, and extension `*.tar.gz` files automatically
- those files land next to the server bundle in `deploy/bundle/`

Studio no longer scans `node_modules/@electric-sql/pglite/dist` or copies those files by hand.

## Prisma Streams Runtime Assets

Prisma Dev can also start a local Prisma Streams server. That runtime spawns a touch interpreter worker from `@prisma/streams-local`.

`build-compute.ts` MUST therefore copy:

- `@prisma/streams-local/dist/touch`
- the worker's bare runtime dependency package, `better-result`

into the output directory.

This is an explicit exception to the "no manual runtime asset copying" rule above: Bun handles the main PGlite runtime assets automatically, but the spawned Streams worker is resolved at runtime from the packaged filesystem and must remain self-contained after deployment.

## Runtime Detection

`demo/ppg-dev/server.ts` attempts to import `virtual:prebuilt-assets`.

- If the import resolves, the server runs in deploy mode.
- If the import fails, the server falls back to local development mode.

That keeps one server implementation for both workflows without adding a separate production-only server entrypoint.
