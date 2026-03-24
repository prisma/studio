import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

function runProcess(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: {
        ...process.env,
        ...options?.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stderr, stdout });
    });
  });
}

async function hasBun(): Promise<boolean> {
  try {
    const result = await runProcess("bun", ["--version"]);

    return result.code === 0;
  } catch {
    return false;
  }
}

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate a local port."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function waitForHttp(url: string): Promise<Response> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return response;
      }

      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Timed out waiting for bundled demo server.");
}

const tempDirs = new Set<string>();

afterAll(async () => {
  await Promise.all(
    [...tempDirs].map(async (dir) => {
      await rm(dir, { force: true, recursive: true });
    }),
  );
});

describe("build-compute", () => {
  it("keeps Bun-emitted Prisma dev runtime assets next to the bundled server entrypoint", async () => {
    if (!(await hasBun())) {
      return;
    }

    const outputDir = await mkdtemp(
      join(tmpdir(), "studio-build-compute-output-"),
    );
    tempDirs.add(outputDir);

    const build = await runProcess(
      "bun",
      ["demo/ppg-dev/build-compute.ts", outputDir],
      {
        cwd: process.cwd(),
        env: {
          STUDIO_DEMO_AI_ENABLED: "false",
        },
      },
    );

    expect(build.code).toBe(0);
    expect(build.stderr).toBe("");

    const rootEntries = await readdir(outputDir);
    const bundleEntries = await readdir(join(outputDir, "bundle"));

    expect(rootEntries).toContain("bundle");
    expect(rootEntries.some((entry) => entry.endsWith(".tar.gz"))).toBe(false);
    expect(rootEntries.some((entry) => entry.endsWith(".wasm"))).toBe(false);
    expect(rootEntries.some((entry) => entry.endsWith(".data"))).toBe(false);

    expect(bundleEntries).toContain("server.bundle.js");
    expect(
      bundleEntries.some(
        (entry) => entry.includes(".tar-") && entry.endsWith(".gz"),
      ),
    ).toBe(true);
    expect(bundleEntries.some((entry) => entry.endsWith(".wasm"))).toBe(true);
    expect(bundleEntries.some((entry) => entry.endsWith(".data"))).toBe(true);

    const port = await getAvailablePort();
    const serverProcess = spawn("bun", ["./bundle/server.bundle.js"], {
      cwd: outputDir,
      env: {
        ...process.env,
        STUDIO_DEMO_AI_ENABLED: "false",
        STUDIO_DEMO_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    serverProcess.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    serverProcess.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    try {
      const response = await waitForHttp(`http://127.0.0.1:${port}/api/config`);
      const payload = (await response.json()) as {
        bootId?: unknown;
        streams?: {
          url?: unknown;
        };
      };

      expect(typeof payload.bootId).toBe("string");
      expect(typeof payload.streams?.url).toBe("string");
      expect(payload.streams?.url).toBe("/api/streams");
    } finally {
      serverProcess.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        serverProcess.once("close", () => resolve());
      });
    }

    expect(stderr).toBe("");
    expect(stdout).toContain(`http://localhost:${port}`);
  }, 120_000);
});
