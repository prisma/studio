import { startPrismaDevServer } from "@prisma/dev";
import type { Sql } from "postgres";
import postgres from "postgres";

import { createPostgresJSExecutor } from "../../data/postgresjs";
import {
  type DemoRuntimeOptions,
  hasExternalDatabaseUrl,
  hasExternalStreamsServerUrl,
} from "./runtime-options";
import { seedDatabase } from "./seed-database";

type PrismaDevServer = Awaited<ReturnType<typeof startPrismaDevServer>>;
type PostgresExecutor = ReturnType<typeof createPostgresJSExecutor>;

export interface DemoRuntime {
  cleanupCallbacks: Array<() => Promise<void> | void>;
  databaseConnectionString: string | null;
  hasDatabase: boolean;
  mode: "external" | "local";
  postgresClient: Sql | null;
  postgresExecutor: PostgresExecutor | null;
  prismaDevServer: PrismaDevServer | null;
  seededAt: string | null;
  streamsServerUrl: string | null;
}

interface DemoRuntimeDependencies {
  createPostgresClient?: (
    connectionString: string,
    options: {
      max: number;
    },
  ) => Sql;
  createPostgresExecutor?: typeof createPostgresJSExecutor;
  createSeededTimestamp?: () => string;
  seedDatabase?: typeof seedDatabase;
  startPrismaDevServer?: typeof startPrismaDevServer;
}

export async function startDemoRuntime(
  options: DemoRuntimeOptions,
  dependencies: DemoRuntimeDependencies = {},
): Promise<DemoRuntime> {
  const cleanupCallbacks: Array<() => Promise<void> | void> = [];
  const createPostgresClient =
    dependencies.createPostgresClient ??
    ((connectionString, clientOptions) =>
      postgres(connectionString, clientOptions));
  const createExecutor =
    dependencies.createPostgresExecutor ?? createPostgresJSExecutor;
  const createSeededTimestamp =
    dependencies.createSeededTimestamp ?? (() => new Date().toISOString());
  const seedDatabaseImpl = dependencies.seedDatabase ?? seedDatabase;
  const startPrismaDevServerImpl =
    dependencies.startPrismaDevServer ?? startPrismaDevServer;

  if (
    hasExternalStreamsServerUrl(options) &&
    !hasExternalDatabaseUrl(options)
  ) {
    return {
      cleanupCallbacks,
      databaseConnectionString: null,
      hasDatabase: false,
      mode: "external",
      postgresClient: null,
      postgresExecutor: null,
      prismaDevServer: null,
      seededAt: null,
      streamsServerUrl: options.streamsServerUrl,
    };
  }

  if (hasExternalDatabaseUrl(options) && hasExternalStreamsServerUrl(options)) {
    const postgresClient = createPostgresClient(options.databaseUrl, {
      max: 1,
    });
    const postgresExecutor = createExecutor(postgresClient);

    cleanupCallbacks.push(() => postgresClient.end({ timeout: 5 }));

    return {
      cleanupCallbacks,
      databaseConnectionString: options.databaseUrl,
      hasDatabase: true,
      mode: "external",
      postgresClient,
      postgresExecutor,
      prismaDevServer: null,
      seededAt: null,
      streamsServerUrl: options.streamsServerUrl,
    };
  }

  const prismaDevServer = await startPrismaDevServerImpl({
    name: `studio-ppg-demo-${process.pid}`,
  });
  cleanupCallbacks.push(() => prismaDevServer.close());

  await seedDatabaseImpl(prismaDevServer.database.connectionString);

  const postgresClient = createPostgresClient(
    prismaDevServer.database.connectionString,
    {
      max: 1,
    },
  );
  const postgresExecutor = createExecutor(postgresClient);

  cleanupCallbacks.push(() => postgresClient.end({ timeout: 5 }));

  return {
    cleanupCallbacks,
    databaseConnectionString: prismaDevServer.database.connectionString,
    hasDatabase: true,
    mode: "local",
    postgresClient,
    postgresExecutor,
    prismaDevServer,
    seededAt: createSeededTimestamp(),
    streamsServerUrl: prismaDevServer.experimental.streams.serverUrl,
  };
}
