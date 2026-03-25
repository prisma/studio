import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const readPnpmStorePath = ({ execFile = execFileSync } = {}) =>
  execFile("pnpm", ["store", "path", "--silent"], {
    encoding: "utf8",
  }).trim();

export function ensurePnpmStore({ execFile = execFileSync, mkdir = mkdirSync } = {}) {
  const storePath = readPnpmStorePath({ execFile });

  if (!storePath) {
    throw new Error("pnpm store path command returned an empty path.");
  }

  mkdir(storePath, { recursive: true });
  return storePath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const storePath = ensurePnpmStore();
  console.log(`Ensured pnpm store exists at ${storePath}`);
}
