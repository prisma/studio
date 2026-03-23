import { hasWindow } from "std-env";

const DEFAULT_MAX_MUTATIONS_PER_TICK = 120;
const INSTRUMENTED_SYMBOL = Symbol(
  "prisma.studio.tanstack_db_mutation_guard.instrumented",
);

type MutationMethod = "insert" | "update" | "delete";

interface MutationRecord {
  collectionName: string;
  method: MutationMethod;
}

export interface TanStackDbMutationViolationDetails {
  message: string;
  mutationCount: number;
  maxMutationsPerTick: number;
  triggeredBy: MutationRecord;
  collectionBreakdown: Array<{ collectionName: string; count: number }>;
}

type MutationGuardMode = "warn" | "throw";

export interface TanStackDbMutationBurstGuardOptions {
  enabled?: boolean;
  maxMutationsPerTick?: number;
  mode?: MutationGuardMode;
  onViolation?: (details: TanStackDbMutationViolationDetails) => void;
}

export interface TanStackDbMutationBurstGuard {
  recordMutation(record: MutationRecord): void;
}

interface InstrumentableMutationCollection {
  insert: (...args: unknown[]) => unknown;
  update: (...args: unknown[]) => unknown;
  delete: (...args: unknown[]) => unknown;
  [INSTRUMENTED_SYMBOL]?: boolean;
}

function isInstrumentableMutationCollection(
  value: unknown,
): value is InstrumentableMutationCollection {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.insert === "function" &&
    typeof candidate.update === "function" &&
    typeof candidate.delete === "function"
  );
}

function buildViolationMessage(details: {
  mutationCount: number;
  maxMutationsPerTick: number;
  triggeredBy: MutationRecord;
}): string {
  const { maxMutationsPerTick, mutationCount, triggeredBy } = details;

  return [
    `[TanStack DB] Mutation burst detected: ${mutationCount} mutations in one event-loop tick`,
    `(threshold: ${maxMutationsPerTick}).`,
    `Triggered by ${triggeredBy.collectionName}.${triggeredBy.method}().`,
    "This often indicates render-driven write loops.",
    "Keep transient input state local and avoid collection writes on every keystroke.",
  ].join(" ");
}

function getCollectionBreakdown(
  collectionCounts: Map<string, number>,
): Array<{ collectionName: string; count: number }> {
  return [...collectionCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([collectionName, count]) => ({ collectionName, count }));
}

export function createTanStackDbMutationBurstGuard(
  options: TanStackDbMutationBurstGuardOptions = {},
): TanStackDbMutationBurstGuard {
  const enabled = options.enabled ?? process.env.NODE_ENV === "development";
  const maxMutationsPerTick =
    options.maxMutationsPerTick ?? DEFAULT_MAX_MUTATIONS_PER_TICK;
  const mode = options.mode ?? "warn";
  const onViolation = options.onViolation;

  let mutationCount = 0;
  let resetScheduled = false;
  let violationRaisedInTick = false;
  const collectionCounts = new Map<string, number>();

  function resetTickState() {
    mutationCount = 0;
    collectionCounts.clear();
    violationRaisedInTick = false;
    resetScheduled = false;
  }

  function scheduleReset() {
    if (resetScheduled) {
      return;
    }

    resetScheduled = true;
    setTimeout(resetTickState, 0);
  }

  function recordMutation(record: MutationRecord) {
    if (!enabled) {
      return;
    }

    scheduleReset();

    mutationCount += 1;
    collectionCounts.set(
      record.collectionName,
      (collectionCounts.get(record.collectionName) ?? 0) + 1,
    );

    if (mutationCount <= maxMutationsPerTick || violationRaisedInTick) {
      return;
    }

    violationRaisedInTick = true;

    const details: TanStackDbMutationViolationDetails = {
      collectionBreakdown: getCollectionBreakdown(collectionCounts),
      maxMutationsPerTick,
      message: buildViolationMessage({
        maxMutationsPerTick,
        mutationCount,
        triggeredBy: record,
      }),
      mutationCount,
      triggeredBy: record,
    };

    onViolation?.(details);

    if (mode === "throw") {
      throw new Error(details.message);
    }

    console.warn(details.message, {
      collectionBreakdown: details.collectionBreakdown,
      maxMutationsPerTick: details.maxMutationsPerTick,
      mutationCount: details.mutationCount,
      triggeredBy: details.triggeredBy,
    });
  }

  return {
    recordMutation,
  };
}

interface StrictModeWindow extends Window {
  __PRISMA_STUDIO_STRICT_TANSTACK_DB__?: boolean;
  __PRISMA_STUDIO_TANSTACK_DB_MAX_MUTATIONS_PER_TICK__?: number;
}

function isStrictModeEnabledFromWindow(): boolean {
  return (
    hasWindow &&
    (window as StrictModeWindow).__PRISMA_STUDIO_STRICT_TANSTACK_DB__ === true
  );
}

function shouldInstallDefaultInstrumentation(): boolean {
  return process.env.NODE_ENV === "development" || isStrictModeEnabledFromWindow();
}

function getDefaultGuardMode(): MutationGuardMode {
  if (isStrictModeEnabledFromWindow()) {
    return "throw";
  }

  return "warn";
}

function getDefaultMaxMutationsPerTick(): number {
  if (!hasWindow) {
    return DEFAULT_MAX_MUTATIONS_PER_TICK;
  }

  const override = (window as StrictModeWindow)
    .__PRISMA_STUDIO_TANSTACK_DB_MAX_MUTATIONS_PER_TICK__;

  return Number.isInteger(override) && (override as number) > 0
    ? (override as number)
    : DEFAULT_MAX_MUTATIONS_PER_TICK;
}

const defaultTanStackDbMutationBurstGuard = createTanStackDbMutationBurstGuard({
  maxMutationsPerTick: getDefaultMaxMutationsPerTick(),
  mode: getDefaultGuardMode(),
});

export function instrumentTanStackCollectionMutations<T>(
  collection: T,
  options: {
    collectionName: string;
    guard?: TanStackDbMutationBurstGuard;
  },
): T {
  if (!isInstrumentableMutationCollection(collection)) {
    return collection;
  }

  if (!options.guard && !shouldInstallDefaultInstrumentation()) {
    return collection;
  }

  const target = collection as InstrumentableMutationCollection;

  if (target[INSTRUMENTED_SYMBOL]) {
    return collection;
  }

  const guard = options.guard ?? defaultTanStackDbMutationBurstGuard;
  const { collectionName } = options;

  const originalInsert = target.insert.bind(target);
  const originalUpdate = target.update.bind(target);
  const originalDelete = target.delete.bind(target);

  target.insert = (...args) => {
    guard.recordMutation({ collectionName, method: "insert" });
    return originalInsert(...args);
  };

  target.update = (...args) => {
    guard.recordMutation({ collectionName, method: "update" });
    return originalUpdate(...args);
  };

  target.delete = (...args) => {
    guard.recordMutation({ collectionName, method: "delete" });
    return originalDelete(...args);
  };

  target[INSTRUMENTED_SYMBOL] = true;

  return collection;
}
