import type {
  WorkflowOverlayNodeStatus,
  WorkflowRunStatus,
} from "@/data/workflows";

export type WorkflowStatusTone =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "success";

export function getWorkflowStatusTone(
  status: WorkflowRunStatus | WorkflowOverlayNodeStatus | string | undefined,
): WorkflowStatusTone {
  switch (status) {
    case "approved":
    case "completed":
    case "succeeded":
      return "success";
    case "failed":
    case "rejected":
      return "destructive";
    case "paused":
    case "pending":
    case "queued":
    case "running":
    case "waiting":
    case "waiting_for_approval":
    case "waiting_for_timer":
      return "secondary";
    case "cancelled":
    case "expired":
    case "skipped":
      return "outline";
    default:
      return "default";
  }
}

export function formatWorkflowStatus(status: string | undefined): string {
  if (!status) {
    return "Unknown";
  }

  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatWorkflowDate(value: string | undefined): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatWorkflowDuration(args: {
  completedAt?: string;
  startedAt?: string;
}): string {
  if (!args.startedAt || !args.completedAt) {
    return "Open";
  }

  const startedAt = Date.parse(args.startedAt);
  const completedAt = Date.parse(args.completedAt);

  if (Number.isNaN(startedAt) || Number.isNaN(completedAt)) {
    return "Unknown";
  }

  const durationMs = Math.max(0, completedAt - startedAt);
  const seconds = Math.round(durationMs / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}
