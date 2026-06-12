import {
  appendObservabilitySeed,
  buildObservabilityStreamSeed,
  type DemoObservabilitySeed,
  ensureObservabilityStreams,
} from "./seed-streams";

export interface ScaleSeedOptions {
  batches: number;
  now: Date;
  randomSeed: number;
  spacingMs: number;
  streamsServerUrl: string;
}

const DEFAULT_BATCHES = 140;
const DEFAULT_RANDOM_SEED = 0x51ca1e;
const DEFAULT_SPACING_MS = 30_000;

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function readOptionValue(args: string[], name: string): string | null {
  const inlinePrefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));

  if (inline) {
    return inline.slice(inlinePrefix.length);
  }

  const index = args.indexOf(name);

  if (index < 0) {
    return null;
  }

  const next = args[index + 1];

  return next && !next.startsWith("-") ? next : null;
}

export function parseScaleSeedArgs(args: string[]): ScaleSeedOptions {
  const streamsServerUrl =
    readOptionValue(args, "--streams-url") ??
    process.env.STREAMS_URL ??
    process.env.STUDIO_STREAMS_URL ??
    null;

  if (!streamsServerUrl) {
    throw new Error(
      "Missing --streams-url. Example: pnpm demo:ppg:seed-scale -- --streams-url http://127.0.0.1:55591",
    );
  }

  const batches = parsePositiveInteger(
    readOptionValue(args, "--batches") ?? String(DEFAULT_BATCHES),
    "--batches",
  );
  const randomSeed = parsePositiveInteger(
    readOptionValue(args, "--seed") ?? String(DEFAULT_RANDOM_SEED),
    "--seed",
  );
  const spacingMs = parsePositiveInteger(
    readOptionValue(args, "--spacing-ms") ?? String(DEFAULT_SPACING_MS),
    "--spacing-ms",
  );
  const nowRaw = readOptionValue(args, "--now");
  const now = nowRaw ? new Date(nowRaw) : new Date();

  if (Number.isNaN(now.getTime())) {
    throw new Error("--now must be an ISO timestamp");
  }

  return {
    batches,
    now,
    randomSeed,
    spacingMs,
    streamsServerUrl,
  };
}

export function buildObservabilityScaleSeed(
  options: Pick<
    ScaleSeedOptions,
    "batches" | "now" | "randomSeed" | "spacingMs"
  >,
): DemoObservabilitySeed {
  const events: Array<Record<string, unknown>> = [];
  const spans: Array<Record<string, unknown>> = [];

  for (let index = 0; index < options.batches; index += 1) {
    const batchSeed = buildObservabilityStreamSeed({
      now: new Date(options.now.getTime() - index * options.spacingMs),
      randomSeed: options.randomSeed + index,
    });

    events.push(...batchSeed.events);
    spans.push(...batchSeed.spans);
  }

  return { events, spans };
}

export async function runScaleSeed(options: ScaleSeedOptions): Promise<{
  events: number;
  spans: number;
}> {
  await ensureObservabilityStreams({
    streamsServerUrl: options.streamsServerUrl,
  });

  const seed = buildObservabilityScaleSeed(options);

  await appendObservabilitySeed({
    seed,
    streamsServerUrl: options.streamsServerUrl,
  });

  return {
    events: seed.events.length,
    spans: seed.spans.length,
  };
}

if (import.meta.main) {
  try {
    const options = parseScaleSeedArgs(Bun.argv.slice(2));
    const result = await runScaleSeed(options);

    console.info(
      `[demo] appended ${result.events} evlog events and ${result.spans} otel spans to ${options.streamsServerUrl}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
