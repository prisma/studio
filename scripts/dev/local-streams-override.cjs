const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const DEFAULT_STREAMS_REPO_RELATIVE_PATH = "../streams";
const DEFAULT_STREAMS_PACKAGE_RELATIVE_PATH = path.join(
  DEFAULT_STREAMS_REPO_RELATIVE_PATH,
  "dist",
  "npm",
  "streams-local",
);
const DEFAULT_PRISMA_DEV_PACKAGE_RELATIVE_PATH = path.join(
  "..",
  "team-expansion",
  "dev",
  "server",
);
const ENABLED_VALUES = new Set(["1", "on", "true", "yes"]);

let hasLoggedOverride = false;

function isLocalStreamsOverrideEnabled(env = process.env) {
  const rawValue = env.STUDIO_USE_LOCAL_STREAMS;

  return (
    typeof rawValue === "string" &&
    ENABLED_VALUES.has(rawValue.trim().toLowerCase())
  );
}

function resolveLocalStreamsRepoDir(args = {}) {
  const { env = process.env, rootDir = process.cwd() } = args;

  return path.resolve(
    rootDir,
    env.STUDIO_LOCAL_STREAMS_REPO_DIR || DEFAULT_STREAMS_REPO_RELATIVE_PATH,
  );
}

function resolveLocalStreamsPackageDir(args = {}) {
  const { env = process.env, rootDir = process.cwd() } = args;
  const configuredPath = env.STUDIO_LOCAL_STREAMS_PACKAGE_DIR;

  if (typeof configuredPath === "string" && configuredPath.trim().length > 0) {
    return path.resolve(rootDir, configuredPath);
  }

  return path.resolve(rootDir, DEFAULT_STREAMS_PACKAGE_RELATIVE_PATH);
}

function resolveLocalPrismaDevPackageDir(args = {}) {
  const { env = process.env, rootDir = process.cwd() } = args;
  const configuredPath = env.STUDIO_LOCAL_PRISMA_DEV_PACKAGE_DIR;

  if (typeof configuredPath === "string" && configuredPath.trim().length > 0) {
    return path.resolve(rootDir, configuredPath);
  }

  return path.resolve(rootDir, DEFAULT_PRISMA_DEV_PACKAGE_RELATIVE_PATH);
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function ensureLocalStreamsPackageDir(args = {}) {
  const packageDir = resolveLocalStreamsPackageDir(args);
  const packageManifestPath = path.join(packageDir, "package.json");

  if (!existsSync(packageManifestPath)) {
    const repoDir = resolveLocalStreamsRepoDir(args);

    throw new Error(
      `Local streams override is enabled, but no built @prisma/streams-local package was found at ${packageDir}. Run \`bun run build:npm-packages\` in ${repoDir} or set STUDIO_LOCAL_STREAMS_PACKAGE_DIR.`,
    );
  }

  const packageManifest = readJsonFile(packageManifestPath);

  if (packageManifest.name !== "@prisma/streams-local") {
    throw new Error(
      `Local streams override expected @prisma/streams-local at ${packageManifestPath}, but found ${JSON.stringify(packageManifest.name)}.`,
    );
  }

  return packageDir;
}

function ensureLocalPrismaDevPackageDir(args = {}) {
  const packageDir = resolveLocalPrismaDevPackageDir(args);
  const packageManifestPath = path.join(packageDir, "package.json");

  if (!existsSync(packageManifestPath)) {
    throw new Error(
      `Local @prisma/dev override expected a package at ${packageDir}. Set \`STUDIO_LOCAL_PRISMA_DEV_PACKAGE_DIR\` to a built @prisma/dev package directory.`,
    );
  }

  const packageManifest = readJsonFile(packageManifestPath);

  if (packageManifest.name !== "@prisma/dev") {
    throw new Error(
      `Local @prisma/dev override expected @prisma/dev at ${packageManifestPath}, but found ${JSON.stringify(packageManifest.name)}.`,
    );
  }

  return packageDir;
}

function patchStudioPackage(pkg, args = {}) {
  const { logger } = args;

  if (
    pkg.name !== "@prisma/studio-core" ||
    !isLocalStreamsOverrideEnabled(args.env)
  ) {
    return pkg;
  }

  const packageDir = ensureLocalPrismaDevPackageDir(args);
  const dependencySpec = `file:${packageDir}`;

  if (!hasLoggedOverride && typeof logger?.log === "function") {
    logger.log(
      `[pnpmfile] Overriding Studio to use local @prisma/dev from ${packageDir}`,
    );
    hasLoggedOverride = true;
  }

  return {
    ...pkg,
    devDependencies: {
      ...pkg.devDependencies,
      "@prisma/dev": dependencySpec,
    },
  };
}

function patchPrismaDevPackage(pkg, args = {}) {
  const { logger } = args;

  if (pkg.name !== "@prisma/dev" || !isLocalStreamsOverrideEnabled(args.env)) {
    return pkg;
  }

  const packageDir = ensureLocalStreamsPackageDir(args);
  const dependencySpec = `link:${packageDir}`;

  if (!hasLoggedOverride && typeof logger?.log === "function") {
    logger.log(
      `[pnpmfile] Overriding @prisma/dev to use local @prisma/streams-local from ${packageDir}`,
    );
    hasLoggedOverride = true;
  }

  return {
    ...pkg,
    dependencies: {
      ...pkg.dependencies,
      "@prisma/streams-local": dependencySpec,
    },
  };
}

function patchStudioDevPackages(pkg, args = {}) {
  return patchPrismaDevPackage(patchStudioPackage(pkg, args), args);
}

module.exports = {
  DEFAULT_PRISMA_DEV_PACKAGE_RELATIVE_PATH,
  DEFAULT_STREAMS_PACKAGE_RELATIVE_PATH,
  DEFAULT_STREAMS_REPO_RELATIVE_PATH,
  ensureLocalPrismaDevPackageDir,
  ensureLocalStreamsPackageDir,
  isLocalStreamsOverrideEnabled,
  patchStudioDevPackages,
  patchStudioPackage,
  patchPrismaDevPackage,
  resolveLocalPrismaDevPackageDir,
  resolveLocalStreamsPackageDir,
  resolveLocalStreamsRepoDir,
};
