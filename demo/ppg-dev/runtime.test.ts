import { describe, expect, it, vi } from "vitest";

import { startDemoRuntime } from "./runtime";
import type { DemoRuntimeOptions } from "./runtime-options";

function createFakePostgresClient() {
  return {
    end: vi.fn(() => Promise.resolve()),
  };
}

describe("startDemoRuntime", () => {
  it("starts the local Prisma Dev stack by default", async () => {
    const fakePostgresClient = createFakePostgresClient();
    const startPrismaDevServerMock = vi.fn().mockResolvedValue({
      close: vi.fn(() => Promise.resolve()),
      database: {
        connectionString: "postgres://local-demo-db",
      },
      experimental: {
        streams: {
          serverUrl: "http://127.0.0.1:51216",
        },
      },
    });
    const seedDatabaseMock = vi.fn(() => Promise.resolve());
    const createPostgresExecutorMock = vi.fn(() => ({
      execute: vi.fn(),
    }));

    const runtime = await startDemoRuntime(
      {
        databaseUrl: null,
        streamsServerUrl: null,
      },
      {
        createPostgresClient: vi.fn(() => fakePostgresClient as never),
        createPostgresExecutor: createPostgresExecutorMock as never,
        createSeededTimestamp: () => "2026-03-30T10:00:00.000Z",
        seedDatabase: seedDatabaseMock,
        startPrismaDevServer: startPrismaDevServerMock,
      },
    );

    expect(startPrismaDevServerMock).toHaveBeenCalledTimes(1);
    expect(seedDatabaseMock).toHaveBeenCalledWith("postgres://local-demo-db");
    expect(runtime.mode).toBe("local");
    expect(runtime.hasDatabase).toBe(true);
    expect(runtime.databaseConnectionString).toBe("postgres://local-demo-db");
    expect(runtime.seededAt).toBe("2026-03-30T10:00:00.000Z");
    expect(runtime.streamsServerUrl).toBe("http://127.0.0.1:51216");
    expect(runtime.prismaDevServer).not.toBeNull();
    expect(createPostgresExecutorMock).toHaveBeenCalledWith(fakePostgresClient);
    expect(runtime.cleanupCallbacks).toHaveLength(2);
  });

  it("uses external data sources without starting local Prisma Dev or seeding", async () => {
    const fakePostgresClient = createFakePostgresClient();
    const startPrismaDevServerMock = vi.fn();
    const seedDatabaseMock = vi.fn();
    const createPostgresExecutorMock = vi.fn(() => ({
      execute: vi.fn(),
    }));
    const options: DemoRuntimeOptions = {
      databaseUrl: "postgres://external-demo-db",
      streamsServerUrl: "http://127.0.0.1:51216",
    };

    const runtime = await startDemoRuntime(options, {
      createPostgresClient: vi.fn(() => fakePostgresClient as never),
      createPostgresExecutor: createPostgresExecutorMock as never,
      seedDatabase: seedDatabaseMock as never,
      startPrismaDevServer: startPrismaDevServerMock as never,
    });

    expect(startPrismaDevServerMock).not.toHaveBeenCalled();
    expect(seedDatabaseMock).not.toHaveBeenCalled();
    expect(runtime.mode).toBe("external");
    expect(runtime.hasDatabase).toBe(true);
    expect(runtime.databaseConnectionString).toBe(
      "postgres://external-demo-db",
    );
    expect(runtime.seededAt).toBeNull();
    expect(runtime.streamsServerUrl).toBe("http://127.0.0.1:51216");
    expect(runtime.prismaDevServer).toBeNull();
    expect(createPostgresExecutorMock).toHaveBeenCalledWith(fakePostgresClient);
    expect(runtime.cleanupCallbacks).toHaveLength(1);
  });

  it("supports streams-only mode without starting local Prisma Dev or creating a database client", async () => {
    const startPrismaDevServerMock = vi.fn();
    const seedDatabaseMock = vi.fn();
    const createPostgresClientMock = vi.fn();
    const createPostgresExecutorMock = vi.fn();
    const options: DemoRuntimeOptions = {
      databaseUrl: null,
      streamsServerUrl: "http://127.0.0.1:8787",
    };

    const runtime = await startDemoRuntime(options, {
      createPostgresClient: createPostgresClientMock as never,
      createPostgresExecutor: createPostgresExecutorMock as never,
      seedDatabase: seedDatabaseMock as never,
      startPrismaDevServer: startPrismaDevServerMock as never,
    });

    expect(startPrismaDevServerMock).not.toHaveBeenCalled();
    expect(seedDatabaseMock).not.toHaveBeenCalled();
    expect(createPostgresClientMock).not.toHaveBeenCalled();
    expect(createPostgresExecutorMock).not.toHaveBeenCalled();
    expect(runtime.mode).toBe("external");
    expect(runtime.hasDatabase).toBe(false);
    expect(runtime.databaseConnectionString).toBeNull();
    expect(runtime.postgresClient).toBeNull();
    expect(runtime.postgresExecutor).toBeNull();
    expect(runtime.seededAt).toBeNull();
    expect(runtime.streamsServerUrl).toBe("http://127.0.0.1:8787");
    expect(runtime.cleanupCallbacks).toHaveLength(0);
  });
});
