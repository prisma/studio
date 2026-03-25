import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ensurePnpmStore } from "./ensure-pnpm-store.mjs";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("ensurePnpmStore", () => {
  it("creates the pnpm store directory returned by pnpm", () => {
    const directory = mkdtempSync(join(tmpdir(), "studio-pnpm-store-"));
    tempDirectories.push(directory);

    const storePath = join(directory, ".pnpm-store");
    const execFile = vi.fn(() => `${storePath}\n`);

    expect(ensurePnpmStore({ execFile })).toBe(storePath);
    expect(execFile).toHaveBeenCalledWith("pnpm", ["store", "path", "--silent"], {
      encoding: "utf8",
    });
    expect(existsSync(storePath)).toBe(true);
  });
});
