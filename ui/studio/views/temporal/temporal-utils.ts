import type { TemporalSpanStatus } from "@/data/temporal";

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0ms";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 59.95) {
    return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  }
  // Round first, so 59.6 seconds carry into the next minute instead of printing "60s".
  const totalSeconds = Math.round(seconds);
  if (totalSeconds < 3600) {
    return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
  }
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 48 * 60) {
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  }
  const totalHours = Math.round(seconds / 3600);
  return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
}

/** Time that is left, in whole seconds while under a minute: "12s", "3m 7s". */
export function formatTimeLeft(ms: number): string {
  return ms < 60_000
    ? `${Math.max(0, Math.ceil(ms / 1_000))}s`
    : formatDuration(Math.ceil(ms / 1_000) * 1_000);
}

export function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 0) {
    const abs = Math.abs(diffSec);
    if (abs < 60) return `in ${abs}s`;
    const totalMinutes = Math.round(abs / 60);
    if (totalMinutes < 60) return `in ${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours >= 24) return `in ${Math.round(hours / 24)}d`;
    return minutes === 0 ? `in ${hours}h` : `in ${hours}h ${minutes}m`;
  }
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86_400)}d ago`;
}

export type TemporalTimeFormat = "local" | "relative" | "utc";

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** `2026-11-23 14:05:09` in the browser's time zone, or in UTC with a `UTC` suffix. */
export function formatAbsoluteTime(
  iso: string | undefined,
  zone: "local" | "utc",
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;

  return zone === "utc"
    ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatTime(
  iso: string | undefined,
  format: TemporalTimeFormat,
): string {
  return format === "relative"
    ? formatRelativeTime(iso)
    : formatAbsoluteTime(iso, format);
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Lists the first few IDs and counts the rest, for confirmation copy. */
export function summarizeIds(ids: string[], limit = 3): string {
  const shown = ids.slice(0, limit).join(", ");
  const rest = ids.length - limit;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface FailureMessageParts {
  cause?: FailureMessageParts;
  message: string;
  type?: string;
}

/**
 * Renders a failure as `Type: message` without repeating a type the message
 * already starts with. A failure that only wraps another one, such as a failed
 * Activity or child Workflow, also names its root cause, which holds the reason.
 */
export function formatFailureMessage(failure: FailureMessageParts): string {
  const own =
    !failure.type || failure.message.startsWith(failure.type)
      ? failure.message
      : `${failure.type}: ${failure.message}`;
  let rootCause = failure.cause;

  while (rootCause?.cause) {
    rootCause = rootCause.cause;
  }

  if (!rootCause) {
    return own;
  }

  const reason = formatFailureMessage({
    message: rootCause.message,
    type: rootCause.type,
  });

  return own.includes(reason) ? own : `${own}: ${reason}`;
}

/**
 * Grid shortcuts (j/k, the arrow keys, Space, Enter) must not fire while the
 * user types or works in an overlay. Space and Enter must still activate a
 * focused button or link, and the arrow keys must still move the selection of
 * a focused radio group or tab list.
 */
export function isShortcutBlockedTarget(
  target: EventTarget | null,
  key: string,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }

  if (
    target.closest(
      'input, textarea, select, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
    ) !== null
  ) {
    return true;
  }

  // A radio group and a tab list move their own selection with the arrow keys.
  if (
    key.startsWith("Arrow") &&
    target.closest('[role="radio"], [role="radiogroup"], [role="tab"]') !== null
  ) {
    return true;
  }

  const isActivationKey = key === " " || key === "Enter";

  return isActivationKey && target.closest("button, a[href]") !== null;
}

export function spanBarClasses(
  kind: string,
  status: TemporalSpanStatus,
): string {
  if (status === "failed") return "bg-destructive";
  if (status === "retrying" || status === "timed-out") return "bg-amber-500";
  if (status === "canceled") return "bg-muted-foreground/60";
  if (kind === "timer") return "bg-muted-foreground/50";
  if (kind === "child-workflow" || kind === "signal" || kind === "update") {
    return "bg-prism-cyan-500";
  }
  if (status === "running")
    return "bg-prism-cyan-500 motion-safe:animate-pulse";
  return "bg-prism-cyan-600/80 dark:bg-prism-cyan-500/80";
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

/** Visibility queries the sidebar offers as one-click workflow lists. */
export const TEMPORAL_SAVED_VIEWS = [
  { label: "Failed Executions", query: 'ExecutionStatus = "Failed"' },
  { label: "Running Executions", query: 'ExecutionStatus = "Running"' },
  { label: "Billing Queue", query: 'TaskQueue = "billing"' },
  { label: "ChargeOrder Runs", query: 'WorkflowType = "ChargeOrder"' },
];

/** How a List Filter starts: an attribute name, then a comparison operator. */
const LIST_FILTER_START =
  /^\s*\(*\s*(`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)\s*(=|!=|<>|<=|>=|<|>|(NOT\s+)?IN\b|STARTS_WITH\b|(NOT\s+)?BETWEEN\b|IS\b)/i;

/**
 * Turns what the user typed in the Workflows search field into a List Filter.
 * A filter passes through unchanged. Any other text, such as a pasted ID,
 * finds the workflows whose workflow ID, workflow type or run ID starts with it.
 */
export function toVisibilityQuery(input: string): string {
  const text = input.trim();

  if (text.length === 0 || LIST_FILTER_START.test(text)) {
    return text;
  }

  // Servers refuse a backslash in a STARTS_WITH value, so such text must match whole.
  const operator = text.includes("\\") ? "=" : "STARTS_WITH";
  const value = `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

  return ["WorkflowId", "WorkflowType", "RunId"]
    .map((attribute) => `${attribute} ${operator} ${value}`)
    .join(" OR ");
}

export type ListFilterOperator = "!=" | "<" | "=" | ">" | "STARTS_WITH";

export interface ListFilterCondition {
  attribute: string;
  operator: ListFilterOperator;
  value: string;
}

function quoteListFilterValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** Joins conditions with AND. A number or a boolean is written without quotes. */
export function buildListFilter(conditions: ListFilterCondition[]): string {
  return conditions
    .filter((condition) => condition.attribute && condition.value.trim())
    .map((condition) => {
      const value = condition.value.trim();
      const isBare = /^(-?\d+(\.\d+)?|true|false)$/i.test(value);
      const attribute = /^[A-Za-z_][A-Za-z0-9_]*$/.test(condition.attribute)
        ? condition.attribute
        : `\`${condition.attribute}\``;

      return `${attribute} ${condition.operator} ${isBare ? value : quoteListFilterValue(value)}`;
    })
    .join(" AND ");
}

const LIST_FILTER_CONDITION =
  /^\s*(`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)\s*(!=|=|<|>|STARTS_WITH)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s"']+)\s*$/i;

/**
 * Reads a List Filter that is a plain AND of comparisons, which is what the
 * filter builder writes. Returns null for anything else, such as OR or
 * parentheses; the builder then starts empty and leaves the text alone.
 */
export function parseListFilter(text: string): ListFilterCondition[] | null {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return [];
  }

  const conditions: ListFilterCondition[] = [];

  // Split on AND outside quotes.
  for (const part of trimmed.split(/\s+AND\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/i)) {
    const match = LIST_FILTER_CONDITION.exec(part);

    if (!match) {
      return null;
    }

    const raw = match[3]!;
    const isQuoted = raw.startsWith('"') || raw.startsWith("'");

    conditions.push({
      attribute: match[1]!.replaceAll("`", ""),
      operator: match[2]!.toUpperCase() as ListFilterOperator,
      value: isQuoted
        ? raw.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\")
        : raw,
    });
  }

  return conditions;
}
