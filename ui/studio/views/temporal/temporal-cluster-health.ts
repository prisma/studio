import type { TemporalClusterHealthReason } from "@/data/temporal";

import { formatBytes } from "./temporal-utils";
import type { TemporalTone } from "./TemporalPrimitives";

export interface ClusterHealthState {
  key: string;
  label: string;
  /** What the state means for the requests the server receives. */
  meaning: string;
  tone: TemporalTone;
}

export interface ShardLifecycleState {
  key: string;
  label: string;
  /** What the lifecycle state means for whether this server serves the shard. */
  meaning: string;
  tone: TemporalTone;
}

/**
 * All seven shard lifecycle states of slate-temporal-next (`ShardLifecycle`),
 * in lifecycle progression order.
 */
export const SHARD_LIFECYCLE_STATES: readonly ShardLifecycleState[] = [
  {
    key: "opening",
    label: "Opening",
    meaning:
      "Opening storage and loading shard metadata before taking traffic.",
    tone: "info",
  },
  {
    key: "recovering",
    label: "Recovering",
    meaning:
      "Replaying ownership records and uncommitted state before serving.",
    tone: "info",
  },
  {
    key: "serving",
    label: "Serving",
    meaning: "Owning the shard and handling live workflow traffic.",
    tone: "neutral",
  },
  {
    key: "draining",
    label: "Draining",
    meaning:
      "Finishing in-flight commits during handoff; stops taking new work.",
    tone: "warning",
  },
  {
    key: "released",
    label: "Released",
    meaning: "Cleanly handed off to another server; no longer served here.",
    tone: "muted",
  },
  {
    key: "retired",
    label: "Retired",
    meaning: "Stopped permanently after a fatal storage or driver error.",
    tone: "danger",
  },
  {
    key: "failed_open",
    label: "Failed Open",
    meaning: "Could not open the shard; waiting for reassignment.",
    tone: "danger",
  },
];

const SHARD_LIFECYCLE_BY_KEY: Record<string, ShardLifecycleState> =
  Object.fromEntries(SHARD_LIFECYCLE_STATES.map((item) => [item.key, item]));

export function describeShardLifecycle(state: string): ShardLifecycleState {
  const normalized = state.toLowerCase();

  return (
    SHARD_LIFECYCLE_BY_KEY[normalized] ?? {
      key: state,
      label:
        state.length > 0
          ? `${state[0]!.toUpperCase()}${state.slice(1)}`
          : state,
      meaning: "Studio does not know this lifecycle state.",
      tone: "warning",
    }
  );
}

/**
 * The six health states of slate-temporal-next, best first, in the words of
 * its `docs/overload.md` §5.1. Only the states from `shedding` on refuse work.
 */
export const CLUSTER_HEALTH_STATES: readonly ClusterHealthState[] = [
  {
    key: "ok",
    label: "Ok",
    meaning: "At least 20% spare capacity and no delay in the last 10 seconds.",
    tone: "neutral",
  },
  {
    key: "busy",
    label: "Busy",
    meaning:
      "Less than 20% spare capacity, or a delay in the last 10 seconds. The server refuses no requests.",
    tone: "info",
  },
  {
    key: "shedding",
    label: "Shedding",
    meaning:
      "The server refused some requests in the last 10 seconds to stay within its capacity.",
    tone: "warning",
  },
  {
    key: "overworked",
    label: "Overworked",
    meaning:
      "The server has refused requests for 30 seconds or has had no spare capacity for 60 seconds.",
    tone: "warning",
  },
  {
    key: "critical",
    label: "Critical",
    meaning: "Work the server accepted is late.",
    tone: "danger",
  },
  {
    key: "fault",
    label: "Fault",
    meaning:
      "A background duty makes no progress, or the shard is retired. More capacity does not fix this.",
    tone: "danger",
  },
];

const CLUSTER_HEALTH_BY_KEY: Record<string, ClusterHealthState> =
  Object.fromEntries(CLUSTER_HEALTH_STATES.map((item) => [item.key, item]));

export function describeClusterHealth(state: string): ClusterHealthState {
  return (
    CLUSTER_HEALTH_BY_KEY[state] ?? {
      key: state,
      label: state,
      meaning: "Studio does not know this state.",
      tone: "warning",
    }
  );
}

const HEALTH_TAG_MEANINGS: Record<string, string> = {
  durable_slow: "The storage is slow to confirm writes.",
  edge_congested: "Requests queue before they reach the server.",
  hot_server: "The server is short of CPU or memory.",
  hot_shard:
    "A shard is congested while the server has CPU to spare. More servers do not help it.",
  worker_shortage:
    "Tasks wait for Workers. The Workers are the limit, not the server.",
};

/** What a health tag of the server means, or the tag itself when Studio does not know it. */
export function describeHealthTag(tag: string): string {
  return HEALTH_TAG_MEANINGS[tag] ?? tag;
}

/** A measurement behind a health state, as `headroom 12%` or `progress_sojourn 7.1 ms`. */
export function formatHealthReason(
  reason: Pick<TemporalClusterHealthReason, "signal" | "unit" | "value">,
): string {
  const { signal, unit, value } = reason;
  const number = Number.isInteger(value)
    ? String(value)
    : value.toFixed(Math.abs(value) < 10 ? 2 : 1);
  const amount =
    unit === "share"
      ? `${Math.round(value * 100)}%`
      : unit === "bytes"
        ? formatBytes(value)
        : unit === "per_s"
          ? `${number}/s`
          : unit === "count"
            ? number
            : `${number} ${unit}`;

  return `${signal} ${amount}`;
}
