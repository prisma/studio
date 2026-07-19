import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  ensureLocalPrismaDevPackageDir,
  ensureLocalStreamsPackageDir,
  resolveLocalStreamsRepoDir,
} = require("./local-streams-override.cjs");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "../..");
const env = {
  ...process.env,
  STUDIO_USE_LOCAL_STREAMS: "1",
};

if (!env.STUDIO_LOCAL_STREAMS_PACKAGE_DIR) {
  const repoDir = resolveLocalStreamsRepoDir({ env, rootDir });
  const repoPackagePath = join(repoDir, "package.json");

  if (!existsSync(repoPackagePath)) {
    console.error(
      `[streams] No local streams repo found at ${repoDir}. Set STUDIO_LOCAL_STREAMS_REPO_DIR or STUDIO_LOCAL_STREAMS_PACKAGE_DIR.`,
    );
    process.exit(1);
  }

  console.log(`[streams] Building local npm package in ${repoDir}`);

  const buildResult = spawnSync("bun", ["run", "build:npm-packages"], {
    cwd: repoDir,
    env,
    stdio: "inherit",
  });

  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }
}

const packageDir = ensureLocalStreamsPackageDir({ env, rootDir });
env.STUDIO_LOCAL_STREAMS_PACKAGE_DIR = packageDir;
const prismaDevPackageDir = ensureLocalPrismaDevPackageDir({ env, rootDir });
env.STUDIO_LOCAL_PRISMA_DEV_PACKAGE_DIR = prismaDevPackageDir;

console.log(
  `[streams] Building local @prisma/dev package in ${prismaDevPackageDir}`,
);

const prismaDevBuildResult = spawnSync("pnpm", ["build"], {
  cwd: prismaDevPackageDir,
  env,
  stdio: "inherit",
});

if (prismaDevBuildResult.status !== 0) {
  process.exit(prismaDevBuildResult.status ?? 1);
}

console.log(
  `[streams] Reinstalling Studio dependencies with local @prisma/dev from ${prismaDevPackageDir} and local @prisma/streams-local from ${packageDir}`,
);

const installResult = spawnSync("pnpm", ["install", "--no-lockfile"], {
  cwd: rootDir,
  env,
  stdio: "inherit",
});

if (installResult.status !== 0) {
  process.exit(installResult.status ?? 1);
}
