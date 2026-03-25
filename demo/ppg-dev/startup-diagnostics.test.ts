import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import {
  addDemoStartupFailureHint,
  ensurePortAvailable,
} from "./startup-diagnostics";

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

async function listenOnBusyPort(): Promise<{
  close(): Promise<void>;
  port: number;
}> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to determine busy port.");
  }

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    port: address.port,
  };
}

describe("ensurePortAvailable", () => {
  it("resolves when the port is available", async () => {
    const port = await getAvailablePort();

    await expect(
      ensurePortAvailable({
        envVar: "STUDIO_DEMO_PORT",
        port,
        serviceName: "Studio demo HTTP server",
      }),
    ).resolves.toBeUndefined();
  });

  it("returns an actionable port-conflict error when the port is busy", async () => {
    const busyPort = await listenOnBusyPort();

    try {
      await expect(
        ensurePortAvailable({
          envVar: "STUDIO_DEMO_PORT",
          port: busyPort.port,
          serviceName: "Studio demo HTTP server",
        }),
      ).rejects.toThrow(
        `Studio demo HTTP server could not start because port ${busyPort.port} is already in use.`,
      );
      await expect(
        ensurePortAvailable({
          envVar: "STUDIO_DEMO_PORT",
          port: busyPort.port,
          serviceName: "Studio demo HTTP server",
        }),
      ).rejects.toThrow("pnpm demo:ppg");
      await expect(
        ensurePortAvailable({
          envVar: "STUDIO_DEMO_PORT",
          port: busyPort.port,
          serviceName: "Studio demo HTTP server",
        }),
      ).rejects.toThrow("STUDIO_DEMO_PORT");
    } finally {
      await busyPort.close();
    }
  });
});

describe("addDemoStartupFailureHint", () => {
  it("adds a targeted hint for local streams startup failures", () => {
    const message = addDemoStartupFailureHint({
      appPort: 4310,
      errorMessage:
        "Error\n    at startLocalDurableStreamsServer (/tmp/streams-local.js:12:34)",
    });

    expect(message).toContain(
      "Prisma Dev could not start its local Streams server.",
    );
    expect(message).toContain("STUDIO_DEMO_PORT");
    expect(message).toContain("4310");
  });

  it("leaves unrelated startup errors unchanged", () => {
    const message = addDemoStartupFailureHint({
      appPort: 4310,
      errorMessage: "Error: boom",
    });

    expect(message).toBe("Error: boom");
  });
});
