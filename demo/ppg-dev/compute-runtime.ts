import { startDBServer } from "@prisma/dev/internal/db";
import { ServerState } from "@prisma/dev/internal/state";
import postgres from "postgres";

import {
  createPostgresJSConnectionConfig,
  createPostgresJSExecutor,
} from "../../data/postgresjs";
import type { DemoRuntime } from "./runtime";
import { seedDatabase } from "./seed-database";

/** The hosted demo needs an ephemeral TCP database without a Streams daemon. */
export async function startComputeRuntime(): Promise<DemoRuntime> {
  const cleanupCallbacks: DemoRuntime["cleanupCallbacks"] = [];
  const state = await ServerState.createExclusively({
    name: `studio-compute-${process.pid}`,
    persistenceMode: "stateless",
  });
  cleanupCallbacks.push(() => state.close());

  try {
    // The public Prisma Dev starter always launches Streams. Its database
    // entrypoint preserves the same PGlite assets and direct TCP protocol.
    const database = await startDBServer("database", state);
    cleanupCallbacks.push(() => database.close());
    await seedDatabase(database.connectionString);

    const connection = createPostgresJSConnectionConfig(
      database.connectionString,
    );
    const postgresClient = postgres(connection.connectionString, {
      ...connection.options,
      max: 1,
    });
    cleanupCallbacks.push(() => postgresClient.end({ timeout: 5 }));

    return {
      cleanupCallbacks,
      databaseConnectionString: database.connectionString,
      hasDatabase: true,
      mode: "local",
      postgresClient,
      postgresExecutor: createPostgresJSExecutor(postgresClient),
      prismaDevServer: null,
      seededAt: new Date().toISOString(),
      streamsServerUrl: null,
    };
  } catch (error) {
    for (const cleanup of [...cleanupCallbacks].reverse()) {
      await Promise.resolve()
        .then(cleanup)
        .catch(() => undefined);
    }
    throw error;
  }
}
