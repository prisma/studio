#!/usr/bin/env bun
/**
 * Build the Studio PPG demo for deployment to Prisma Compute.
 *
 * Pre-builds browser assets (client JS via Bun.build, CSS via PostCSS), then
 * bundles server.ts with the pre-built assets injected through a virtual
 * module. `@prisma/dev` emits hashed PGlite runtime assets during Bun
 * bundling, but the current Compute boot path still expects stable filenames
 * like `pglite.wasm`, so this build also copies the Prisma Dev runtime assets
 * into the bundle directory with their canonical names.
 *
 * Usage (from the repo root):
 *
 *   bun demo/ppg-dev/build-compute.ts [outdir]
 *
 * Deploy:
 *
 *   bunx @prisma/compute-cli deploy --skip-build \
 *     --path <outdir> --entrypoint bundle/server.bundle.js \
 *     --http-port 8080 --env STUDIO_DEMO_PORT=8080 \
 *     --service <service-id>
 */

import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { copyPrismaDevRuntimeAssets } from "@prisma/dev";
import postcss, { type AcceptedPlugin } from "postcss";

const studioRoot = resolve(import.meta.dirname, "../..");
const outDir = resolve(process.argv[2] ?? "dist-compute");
const require = createRequire(import.meta.url);

if (
  !existsSync(join(studioRoot, "package.json")) ||
  !existsSync(join(studioRoot, "demo/ppg-dev/client.tsx")) ||
  !existsSync(join(studioRoot, "ui/index.css"))
) {
  console.error("[build] Error: could not locate the Studio repo root.");
  process.exit(1);
}

console.log("[build] Studio root:", studioRoot);
console.log("[build] Output dir: ", outDir);

console.log("[build] Building client JS...");

const pkg = (await Bun.file(join(studioRoot, "package.json")).json()) as Record<
  string,
  unknown
>;

const clientBuild = await Bun.build({
  define: { VERSION_INJECTED_AT_BUILD_TIME: JSON.stringify(pkg.version) },
  entrypoints: [join(studioRoot, "demo/ppg-dev/client.tsx")],
  format: "esm",
  minify: true,
  sourcemap: "none",
  splitting: false,
  target: "browser",
});

if (!clientBuild.success) {
  console.error("[build] Client JS build failed:");
  for (const log of clientBuild.logs) console.error("  ", log.message);
  process.exit(1);
}

const jsOutput = clientBuild.outputs.find((o) => o.path.endsWith(".js"));

if (!jsOutput) {
  console.error("[build] Client build produced no JS output.");
  process.exit(1);
}

const appScript = await jsOutput.text();

const assetEntries: Array<[string, string, string]> = [];

for (const output of clientBuild.outputs) {
  if (output === jsOutput) continue;
  const name = `/${basename(output.path)}`;
  const base64 = Buffer.from(await output.arrayBuffer()).toString("base64");
  assetEntries.push([name, base64, contentTypeForExt(extname(output.path))]);
}

console.log(`[build] Client JS: ${(appScript.length / 1024).toFixed(1)} KB`);

if (assetEntries.length > 0) {
  console.log(`[build] Additional browser assets: ${assetEntries.length}`);
}

console.log("[build] Processing CSS with PostCSS...");

const postcssConfigHref = pathToFileURL(
  join(studioRoot, "postcss.config.mjs"),
).href;
const postcssConfig = (await import(postcssConfigHref)) as {
  default: { plugins: AcceptedPlugin[] };
};

const cssEntrypoint = join(studioRoot, "ui/index.css");
const cssSource = await Bun.file(cssEntrypoint).text();
const cssResult = await postcss(postcssConfig.default.plugins).process(
  cssSource,
  { from: cssEntrypoint },
);
const appStyles = cssResult.css;

console.log(`[build] CSS: ${(appStyles.length / 1024).toFixed(1)} KB`);

console.log("[build] Bundling production server...");

await rm(outDir, { recursive: true, force: true });
const bundleDir = join(outDir, "bundle");
await mkdir(bundleDir, { recursive: true });

const assetsModuleSource = generateAssetsModule(
  appScript,
  appStyles,
  assetEntries,
);

const serverBuild = await Bun.build({
  entrypoints: [join(studioRoot, "demo/ppg-dev/server.ts")],
  minify: false,
  outdir: bundleDir,
  plugins: [
    {
      name: "prebuilt-assets",
      setup(build) {
        build.onResolve({ filter: /^virtual:prebuilt-assets$/ }, () => ({
          path: "virtual:prebuilt-assets",
          namespace: "prebuilt",
        }));
        build.onLoad({ filter: /.*/, namespace: "prebuilt" }, () => ({
          contents: assetsModuleSource,
          loader: "js",
        }));
      },
    },
  ],
  sourcemap: "none",
  target: "bun",
});

if (!serverBuild.success) {
  console.error("[build] Server bundle failed:");
  for (const log of serverBuild.logs) console.error("  ", log.message);
  process.exit(1);
}

// Rename the output to a deterministic name.
const produced = serverBuild.outputs[0];
const producedPath = produced?.path;
const finalPath = join(bundleDir, "server.bundle.js");

if (producedPath && producedPath !== finalPath) {
  await rename(producedPath, finalPath);
}

const copiedRuntimeAssets = await copyPrismaDevRuntimeAssets(bundleDir);
console.log(
  `[build] Copied Prisma Dev runtime assets: ${copiedRuntimeAssets.length}`,
);

await bundlePrismaStreamsTouchAssets(outDir);
console.log("[build] Bundled Prisma Streams worker assets.");

const { size: bundleBytes } = await stat(finalPath);
console.log(
  `[build] Server bundle: ${(bundleBytes / 1024 / 1024).toFixed(2)} MB`,
);

const allEntries = await readdir(outDir, { recursive: true });
const entryStats = await Promise.all(
  allEntries.map(async (f) => {
    const s = await stat(join(outDir, f));
    return { isFile: s.isFile(), size: s.size };
  }),
);
const fileCount = entryStats.filter((e) => e.isFile).length;
const totalSize = entryStats.reduce(
  (sum, e) => (e.isFile ? sum + e.size : sum),
  0,
);

console.log(`[build] Output: ${outDir}`);
console.log(
  `[build] Files: ${fileCount}, total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
);
console.log("[build] Done!");

function contentTypeForExt(ext: string): string {
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[ext] ?? "application/octet-stream";
}

function generateAssetsModule(
  script: string,
  styles: string,
  assets: Array<[string, string, string]>,
): string {
  const mapEntries = assets
    .map(
      ([path, b64, ct]) =>
        `  [${JSON.stringify(path)}, { bytes: Buffer.from(${JSON.stringify(b64)}, "base64").buffer, contentType: ${JSON.stringify(ct)} }]`,
    )
    .join(",\n");

  return [
    `export const appScript = ${JSON.stringify(script)};`,
    `export const appStyles = ${JSON.stringify(styles)};`,
    `export const builtAssets = new Map([\n${mapEntries}\n]);`,
  ].join("\n");
}

async function bundlePrismaStreamsTouchAssets(outDir: string): Promise<void> {
  const prismaDevPackagePath = require.resolve("@prisma/dev/package.json");
  const prismaDevRequire = createRequire(prismaDevPackagePath);
  const streamsLocalPackagePath = prismaDevRequire.resolve(
    "@prisma/streams-local/package.json",
  );
  const streamsLocalRoot = dirname(streamsLocalPackagePath);
  const sourceDir = join(streamsLocalRoot, "dist", "touch");
  const workerEntrypoint = join(sourceDir, "processor_worker.js");
  const hashVendorDir = join(sourceDir, "hash_vendor");
  const touchOutDir = join(outDir, "touch");

  if (!existsSync(workerEntrypoint) || !existsSync(hashVendorDir)) {
    throw new Error(
      `Could not locate Prisma Streams worker assets at ${sourceDir}.`,
    );
  }

  await mkdir(touchOutDir, { recursive: true });

  const workerBuild = await Bun.build({
    entrypoints: [workerEntrypoint],
    format: "esm",
    minify: false,
    outdir: touchOutDir,
    sourcemap: "none",
    target: "bun",
  });

  if (!workerBuild.success) {
    throw new Error(
      workerBuild.logs
        .map((log) => log.message)
        .join("\n"),
    );
  }

  const builtWorker = workerBuild.outputs[0]?.path;
  const finalWorkerPath = join(touchOutDir, "processor_worker.js");

  if (builtWorker && builtWorker !== finalWorkerPath) {
    await rename(builtWorker, finalWorkerPath);
  }

  await cp(hashVendorDir, join(touchOutDir, "hash_vendor"), {
    force: true,
    recursive: true,
  });
}
