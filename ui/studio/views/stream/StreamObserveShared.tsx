import { Badge } from "@/ui/components/ui/badge";

import type { StudioObserveTraceTreeNode } from "../../../hooks/use-stream-observe-request";

export function formatDurationMs(durationMs: number | null): string {
  if (durationMs == null || !Number.isFinite(durationMs)) {
    return "-";
  }

  if (durationMs < 1) {
    return "<1 ms";
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 2 : 1)} s`;
}

export function formatTimestamp(isoTimestamp: string | null): string {
  if (!isoTimestamp) {
    return "-";
  }

  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

export function formatShortId(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 6)}...${id.slice(-4)}`;
}

export function formatOffsetMs(offsetMs: number): string {
  if (!Number.isFinite(offsetMs)) {
    return "";
  }

  const rounded = Math.round(offsetMs);

  return rounded >= 0 ? `+${rounded} ms` : `${rounded} ms`;
}

export function flattenTraceTree(
  nodes: StudioObserveTraceTreeNode[],
): StudioObserveTraceTreeNode[] {
  const rows: StudioObserveTraceTreeNode[] = [];
  const walk = (node: StudioObserveTraceTreeNode) => {
    rows.push(node);

    for (const child of node.children) {
      walk(child);
    }
  };

  for (const node of nodes) {
    walk(node);
  }

  return rows;
}

export function parseTimeMs(isoTimestamp: string | null): number | null {
  if (!isoTimestamp) {
    return null;
  }

  const parsed = Date.parse(isoTimestamp);

  return Number.isNaN(parsed) ? null : parsed;
}

export function IdChip(props: { label: string; value: string }) {
  return (
    <Badge
      className="max-w-full gap-1 truncate font-normal"
      title={`${props.label} ${props.value}`}
      variant="outline"
    >
      <span className="text-muted-foreground">{props.label}</span>
      <span className="truncate font-mono">{formatShortId(props.value)}</span>
    </Badge>
  );
}
