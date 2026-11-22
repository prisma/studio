import type {
  TemporalSpanStatus,
  TemporalWorkflowStatus,
} from "@/data/temporal";

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0ms";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  if (mins < 60) {
    return `${mins}m ${remSec}s`;
  }
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  return `${hours}h ${remMin}m`;
}

export function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 0) {
    const abs = Math.abs(diffSec);
    if (abs < 60) return `in ${abs}s`;
    if (abs < 3600) return `in ${Math.round(abs / 60)}m`;
    return `in ${Math.round(abs / 3600)}h`;
  }
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86_400)}d ago`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function statusBadgeClasses(status: TemporalWorkflowStatus): string {
  switch (status) {
    case "Running":
      return "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400";
    case "Completed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "Failed":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "TimedOut":
      return "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "Canceled":
    case "Terminated":
      return "border-border bg-muted text-muted-foreground";
    case "ContinuedAsNew":
      return "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400";
    default:
      return "border-border bg-secondary text-secondary-foreground";
  }
}

export function statusDotClasses(status: TemporalWorkflowStatus): string {
  switch (status) {
    case "Running":
      return "bg-sky-500";
    case "Completed":
      return "bg-emerald-500";
    case "Failed":
      return "bg-destructive";
    case "TimedOut":
      return "bg-amber-500";
    case "ContinuedAsNew":
      return "bg-violet-500";
    default:
      return "bg-muted-foreground";
  }
}

export function spanBarClasses(
  kind: string,
  status: TemporalSpanStatus,
): string {
  if (status === "failed") return "bg-destructive";
  if (status === "retrying" || status === "timed-out") return "bg-amber-500";
  if (status === "canceled") return "bg-muted-foreground/60";
  if (kind === "timer") return "bg-amber-400 dark:bg-amber-500";
  if (kind === "child-workflow" || kind === "signal" || kind === "update") {
    return "bg-sky-500";
  }
  if (status === "running") return "bg-sky-500 animate-pulse";
  return "bg-emerald-500";
}

export function safeJsonPretty(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function parseJsonArgsText(text: string): {
  args?: unknown[];
  error?: string;
} {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { args: [] };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return { args: Array.isArray(parsed) ? parsed : [parsed] };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Invalid JSON",
    };
  }
}
