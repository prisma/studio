import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function packPackage(cwd = process.cwd()) {
  const output = execFileSync("npm", ["pack", "--json"], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_dry_run: "false",
    },
  });
  const packResult = JSON.parse(output);
  const filename = packResult[0]?.filename;

  if (!filename) {
    throw new Error("npm pack did not return a tarball filename.");
  }

  return join(cwd, filename);
}

export function cleanupPackedTarball(tarballPath) {
  if (existsSync(tarballPath)) {
    rmSync(tarballPath, { force: true });
  }
}

export function runExportCheck(cwd = process.cwd()) {
  const tarballPath = packPackage(cwd);

  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "attw",
        "--pack",
        ".",
        "--profile",
        "node16",
        "--exclude-entrypoints",
        "ui/index.css",
      ],
      {
        cwd,
        stdio: "inherit",
      },
    );
  } finally {
    cleanupPackedTarball(tarballPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runExportCheck();
}
