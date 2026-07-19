import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type EnvMap = Record<string, string | undefined>;
type Logger = {
  log(message: string): void;
};
type PrismaDevPackage = {
  dependencies: Record<string, string>;
  name: string;
};
type LocalStreamsOverrideModule = {
  ensureLocalPrismaDevPackageDir(args?: {
    env?: EnvMap;
    rootDir?: string;
  }): string;
  ensureLocalStreamsPackageDir(args?: {
    env?: EnvMap;
    rootDir?: string;
  }): string;
  isLocalStreamsOverrideEnabled(env?: EnvMap): boolean;
  patchPrismaDevPackage(
    pkg: PrismaDevPackage,
    args?: {
      env?: EnvMap;
      logger?: Logger;
      rootDir?: string;
    },
  ): PrismaDevPackage;
  patchStudioPackage(
    pkg: {
      devDependencies: Record<string, string>;
      name: string;
    },
    args?: {
      env?: EnvMap;
      logger?: Logger;
      rootDir?: string;
    },
  ): {
    devDependencies: Record<string, string>;
    name: string;
  };
  resolveLocalPrismaDevPackageDir(args?: {
    env?: EnvMap;
    rootDir?: string;
  }): string;
  resolveLocalStreamsPackageDir(args?: {
    env?: EnvMap;
    rootDir?: string;
  }): string;
};

const require = createRequire(import.meta.url);
const localStreamsOverride =
  require("./local-streams-override.cjs") as LocalStreamsOverrideModule;
const ensureLocalStreamsPackageDir = (args?: {
  env?: EnvMap;
  rootDir?: string;
}) => localStreamsOverride.ensureLocalStreamsPackageDir(args);
const ensureLocalPrismaDevPackageDir = (args?: {
  env?: EnvMap;
  rootDir?: string;
}) => localStreamsOverride.ensureLocalPrismaDevPackageDir(args);
const isLocalStreamsOverrideEnabled = (env?: EnvMap) =>
  localStreamsOverride.isLocalStreamsOverrideEnabled(env);
const patchPrismaDevPackage = (
  pkg: PrismaDevPackage,
  args?: {
    env?: EnvMap;
    logger?: Logger;
    rootDir?: string;
  },
) => localStreamsOverride.patchPrismaDevPackage(pkg, args);
const patchStudioPackage = (
  pkg: {
    devDependencies: Record<string, string>;
    name: string;
  },
  args?: {
    env?: EnvMap;
    logger?: Logger;
    rootDir?: string;
  },
) => localStreamsOverride.patchStudioPackage(pkg, args);
const resolveLocalPrismaDevPackageDir = (args?: {
  env?: EnvMap;
  rootDir?: string;
}) => localStreamsOverride.resolveLocalPrismaDevPackageDir(args);
const resolveLocalStreamsPackageDir = (args?: {
  env?: EnvMap;
  rootDir?: string;
}) => localStreamsOverride.resolveLocalStreamsPackageDir(args);

const tempDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createTempRoot(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirectories.push(directory);

  return directory;
}

function writeLocalStreamsPackage(
  packageDir: string,
  name = "@prisma/streams-local",
) {
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify({ name, version: "0.1.2" }, null, 2)}\n`,
  );
}

function writeLocalPrismaDevPackage(packageDir: string, name = "@prisma/dev") {
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify({ name, version: "0.24.1" }, null, 2)}\n`,
  );
}

describe("isLocalStreamsOverrideEnabled", () => {
  it("treats the local streams override as opt-in", () => {
    expect(isLocalStreamsOverrideEnabled({})).toBe(false);
    expect(
      isLocalStreamsOverrideEnabled({ STUDIO_USE_LOCAL_STREAMS: "true" }),
    ).toBe(true);
    expect(
      isLocalStreamsOverrideEnabled({ STUDIO_USE_LOCAL_STREAMS: "1" }),
    ).toBe(true);
  });
});

describe("resolveLocalStreamsPackageDir", () => {
  it("defaults to the sibling streams repo package output", () => {
    const rootDir = createTempRoot("studio-streams-default-");

    expect(resolveLocalStreamsPackageDir({ env: {}, rootDir })).toBe(
      join(rootDir, "..", "streams", "dist", "npm", "streams-local"),
    );
  });

  it("allows an explicit package directory override", () => {
    const rootDir = createTempRoot("studio-streams-explicit-");

    expect(
      resolveLocalStreamsPackageDir({
        env: {
          STUDIO_LOCAL_STREAMS_PACKAGE_DIR: "./vendor/streams-local",
        },
        rootDir,
      }),
    ).toBe(join(rootDir, "vendor", "streams-local"));
  });
});

describe("resolveLocalPrismaDevPackageDir", () => {
  it("defaults to the sibling team-expansion @prisma/dev package", () => {
    const rootDir = createTempRoot("studio-prisma-dev-default-");

    expect(resolveLocalPrismaDevPackageDir({ env: {}, rootDir })).toBe(
      join(rootDir, "..", "team-expansion", "dev", "server"),
    );
  });
});

describe("ensureLocalStreamsPackageDir", () => {
  it("accepts a built local streams package", () => {
    const rootDir = createTempRoot("studio-streams-package-");
    const packageDir = join(rootDir, "custom", "streams-local");
    writeLocalStreamsPackage(packageDir);

    expect(
      ensureLocalStreamsPackageDir({
        env: {
          STUDIO_LOCAL_STREAMS_PACKAGE_DIR: packageDir,
        },
        rootDir,
      }),
    ).toBe(packageDir);
  });

  it("fails with a targeted message when the built package is missing", () => {
    const rootDir = createTempRoot("studio-streams-missing-");

    expect(() =>
      ensureLocalStreamsPackageDir({
        env: {},
        rootDir,
      }),
    ).toThrow(/bun run build:npm-packages/);
  });

  it("fails when the package directory is not @prisma/streams-local", () => {
    const rootDir = createTempRoot("studio-streams-wrong-name-");
    const packageDir = join(rootDir, "custom", "streams-local");
    writeLocalStreamsPackage(packageDir, "not-streams-local");

    expect(() =>
      ensureLocalStreamsPackageDir({
        env: {
          STUDIO_LOCAL_STREAMS_PACKAGE_DIR: packageDir,
        },
        rootDir,
      }),
    ).toThrow(/expected @prisma\/streams-local/i);
  });
});

describe("ensureLocalPrismaDevPackageDir", () => {
  it("accepts a local @prisma/dev package", () => {
    const rootDir = createTempRoot("studio-prisma-dev-package-");
    const packageDir = join(rootDir, "custom", "prisma-dev");
    writeLocalPrismaDevPackage(packageDir);

    expect(
      ensureLocalPrismaDevPackageDir({
        env: {
          STUDIO_LOCAL_PRISMA_DEV_PACKAGE_DIR: packageDir,
        },
        rootDir,
      }),
    ).toBe(packageDir);
  });

  it("fails when the package directory is not @prisma/dev", () => {
    const rootDir = createTempRoot("studio-prisma-dev-wrong-name-");
    const packageDir = join(rootDir, "custom", "prisma-dev");
    writeLocalPrismaDevPackage(packageDir, "not-prisma-dev");

    expect(() =>
      ensureLocalPrismaDevPackageDir({
        env: {
          STUDIO_LOCAL_PRISMA_DEV_PACKAGE_DIR: packageDir,
        },
        rootDir,
      }),
    ).toThrow(/expected @prisma\/dev/i);
  });
});

describe("patchPrismaDevPackage", () => {
  it("rewrites @prisma/dev to the local streams package when enabled", () => {
    const rootDir = createTempRoot("studio-streams-patch-");
    const packageDir = join(rootDir, "custom", "streams-local");
    const log = vi.fn();
    const logger: Logger = { log };
    writeLocalStreamsPackage(packageDir);

    const patchedPackage = patchPrismaDevPackage(
      {
        dependencies: {
          "@prisma/streams-local": "0.1.2",
        },
        name: "@prisma/dev",
      },
      {
        env: {
          STUDIO_LOCAL_STREAMS_PACKAGE_DIR: packageDir,
          STUDIO_USE_LOCAL_STREAMS: "1",
        },
        logger,
        rootDir,
      },
    );

    expect(patchedPackage.dependencies["@prisma/streams-local"]).toBe(
      `link:${packageDir}`,
    );
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("leaves @prisma/dev unchanged when the override is disabled", () => {
    const packageDefinition = {
      dependencies: {
        "@prisma/streams-local": "0.1.2",
      },
      name: "@prisma/dev",
    };

    expect(
      patchPrismaDevPackage(packageDefinition, {
        env: {},
        logger: { log: vi.fn() },
        rootDir: createTempRoot("studio-streams-disabled-"),
      }),
    ).toBe(packageDefinition);
  });
});

describe("patchStudioPackage", () => {
  it("rewrites Studio to the local @prisma/dev package when enabled", () => {
    const rootDir = createTempRoot("studio-prisma-dev-root-patch-");
    const packageDir = join(rootDir, "custom", "prisma-dev");
    writeLocalPrismaDevPackage(packageDir);

    const patchedPackage = patchStudioPackage(
      {
        devDependencies: {
          "@prisma/dev": "0.24.1",
        },
        name: "@prisma/studio-core",
      },
      {
        env: {
          STUDIO_LOCAL_PRISMA_DEV_PACKAGE_DIR: packageDir,
          STUDIO_USE_LOCAL_STREAMS: "1",
        },
        logger: { log: vi.fn() },
        rootDir,
      },
    );

    expect(patchedPackage.devDependencies["@prisma/dev"]).toBe(
      `file:${packageDir}`,
    );
  });
});
