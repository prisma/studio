export interface DemoRuntimeOptions {
  databaseUrl: string | null;
  streamsServerUrl: string | null;
}

const DATABASE_URL_FLAG = "--database-url";
const STREAMS_SERVER_URL_FLAG = "--streams-server-url";
const HELP_FLAGS = new Set(["-h", "--help"]);

export function formatDemoRuntimeUsage(): string {
  return `Usage:
  pnpm demo:ppg
  pnpm demo:ppg -- --streams-server-url <streams-url>
  pnpm demo:ppg -- --database-url <postgres-url> --streams-server-url <streams-url>

Flags:
  ${DATABASE_URL_FLAG}       Direct TCP PostgreSQL connection string for external database mode.
  ${STREAMS_SERVER_URL_FLAG} Base URL of an external Prisma Streams server.

Notes:
  - ${STREAMS_SERVER_URL_FLAG} may be passed with or without an explicit http:// or https:// scheme.
  - When ${STREAMS_SERVER_URL_FLAG} is provided, the demo does not start local Prisma Dev, local Streams, or prisma-wal wiring.
  - ${DATABASE_URL_FLAG} requires ${STREAMS_SERVER_URL_FLAG}.`;
}

export function hasExternalDatabaseUrl(
  options: DemoRuntimeOptions,
): options is {
  databaseUrl: string;
  streamsServerUrl: string | null;
} {
  return (
    typeof options.databaseUrl === "string" && options.databaseUrl.length > 0
  );
}

export function hasExternalStreamsServerUrl(
  options: DemoRuntimeOptions,
): options is {
  databaseUrl: string | null;
  streamsServerUrl: string;
} {
  return (
    typeof options.streamsServerUrl === "string" &&
    options.streamsServerUrl.length > 0
  );
}

function normalizeStreamsServerUrl(value: string): string {
  const trimmed = value.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  return withScheme.endsWith("/") ? withScheme.slice(0, -1) : withScheme;
}

export function parseDemoRuntimeOptions(
  argv: readonly string[],
): DemoRuntimeOptions {
  let databaseUrl: string | null = null;
  let streamsServerUrl: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument) {
      continue;
    }

    if (HELP_FLAGS.has(argument)) {
      throw new Error(formatDemoRuntimeUsage());
    }

    if (argument === DATABASE_URL_FLAG) {
      const value = argv[index + 1]?.trim();

      if (!value) {
        throw new Error(
          `Missing value for ${DATABASE_URL_FLAG}.\n${formatDemoRuntimeUsage()}`,
        );
      }

      databaseUrl = value;
      index += 1;
      continue;
    }

    if (argument.startsWith(`${DATABASE_URL_FLAG}=`)) {
      const value = argument.slice(`${DATABASE_URL_FLAG}=`.length).trim();

      if (!value) {
        throw new Error(
          `Missing value for ${DATABASE_URL_FLAG}.\n${formatDemoRuntimeUsage()}`,
        );
      }

      databaseUrl = value;
      continue;
    }

    if (argument === STREAMS_SERVER_URL_FLAG) {
      const value = argv[index + 1]?.trim();

      if (!value) {
        throw new Error(
          `Missing value for ${STREAMS_SERVER_URL_FLAG}.\n${formatDemoRuntimeUsage()}`,
        );
      }

      streamsServerUrl = normalizeStreamsServerUrl(value);
      index += 1;
      continue;
    }

    if (argument.startsWith(`${STREAMS_SERVER_URL_FLAG}=`)) {
      const value = argument.slice(`${STREAMS_SERVER_URL_FLAG}=`.length).trim();

      if (!value) {
        throw new Error(
          `Missing value for ${STREAMS_SERVER_URL_FLAG}.\n${formatDemoRuntimeUsage()}`,
        );
      }

      streamsServerUrl = normalizeStreamsServerUrl(value);
      continue;
    }

    throw new Error(
      `Unknown demo flag "${argument}".\n${formatDemoRuntimeUsage()}`,
    );
  }

  if (databaseUrl && !streamsServerUrl) {
    throw new Error(
      `${DATABASE_URL_FLAG} requires ${STREAMS_SERVER_URL_FLAG}.\n${formatDemoRuntimeUsage()}`,
    );
  }

  return {
    databaseUrl,
    streamsServerUrl,
  };
}
