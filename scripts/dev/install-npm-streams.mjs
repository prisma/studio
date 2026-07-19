import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "../..");
const env = { ...process.env };

delete env.STUDIO_USE_LOCAL_STREAMS;
delete env.STUDIO_LOCAL_PRISMA_DEV_PACKAGE_DIR;
delete env.STUDIO_LOCAL_STREAMS_PACKAGE_DIR;
delete env.STUDIO_LOCAL_STREAMS_REPO_DIR;

console.log(
  "[streams] Reinstalling Studio dependencies with the published @prisma/dev and @prisma/streams-local packages",
);

const installResult = spawnSync("pnpm", ["install", "--no-lockfile"], {
  cwd: rootDir,
  env,
  stdio: "inherit",
});

process.exit(installResult.status ?? 1);
