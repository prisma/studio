export interface DemoConfig {
  ai: {
    enabled: boolean;
  };
  bootId: string;
  database: {
    enabled: boolean;
  };
  seededAt?: string;
  streams?: {
    url: string;
  };
}

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_ENV_VALUES = new Set(["0", "false", "no", "off"]);

function parseOptionalBooleanEnv(
  value: string | undefined,
): boolean | undefined {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (TRUE_ENV_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_ENV_VALUES.has(normalized)) {
    return false;
  }

  return undefined;
}

export function resolveDemoAiEnabled(args: {
  anthropicApiKey: string;
  envValue?: string;
}): boolean {
  if (args.anthropicApiKey.trim().length === 0) {
    return false;
  }

  return parseOptionalBooleanEnv(args.envValue) ?? true;
}

export function buildDemoConfig(args: {
  aiEnabled: boolean;
  bootId: string;
  databaseEnabled: boolean;
  seededAt?: string | null;
  streamsUrl?: string;
}): DemoConfig {
  const { aiEnabled, bootId, databaseEnabled, seededAt, streamsUrl } = args;

  return {
    ai: {
      enabled: aiEnabled,
    },
    bootId,
    database: {
      enabled: databaseEnabled,
    },
    ...(seededAt
      ? {
          seededAt,
        }
      : {}),
    ...(streamsUrl
      ? {
          streams: {
            url: streamsUrl,
          },
        }
      : {}),
  };
}
