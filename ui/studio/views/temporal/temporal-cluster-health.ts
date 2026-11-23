import type { TemporalClusterHealthReason } from "@/data/temporal";

import { formatBytes } from "./temporal-utils";
import type { TemporalTone } from "./TemporalPrimitives";

export interface ClusterHealthState {
  label: string;
  /** What the state means for the requests the server receives. */
  meaning: string;
  tone: TemporalTone;
}

/**
 * The six health states of slate-temporal-next, best first, in the words of
 * its `docs/overload.md` §5.1. Only the states from `shedding` on refuse work.
 */
const CLUSTER_HEALTH_STATES: Record<string, ClusterHealthState> = {
  ok: {
    label: "Ok",
    meaning: "At least 20% spare capacity and no delay in the last 10 seconds.",
    tone: "neutral",
  },
  busy: {
    label: "Busy",
    meaning:
      "Less than 20% spare capacity, or a delay in the last 10 seconds. The server refuses no requests.",
    tone: "info",
  },
  shedding: {
    label: "Shedding",
    meaning:
      "The server refused some requests in the last 10 seconds to stay within its capacity.",
    tone: "warning",
  },
  overworked: {
    label: "Overworked",
    meaning:
      "The server has refused requests for 30 seconds or has had no spare capacity for 60 seconds.",
    tone: "warning",
  },
  critical: {
    label: "Critical",
    meaning: "Work the server accepted is late.",
    tone: "danger",
  },
  fault: {
    label: "Fault",
    meaning:
      "A background duty makes no progress, or the shard is retired. More capacity does not fix this.",
    tone: "danger",
  },
};

export function describeClusterHealth(state: string): ClusterHealthState {
  return (
    CLUSTER_HEALTH_STATES[state] ?? {
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
