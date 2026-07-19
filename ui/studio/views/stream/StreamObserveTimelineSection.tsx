import { Badge } from "@/ui/components/ui/badge";
import { cn } from "@/ui/lib/utils";

import type { StudioObserveTimelineItem } from "../../../hooks/use-stream-observe-request";
import {
  formatDurationMs,
  formatOffsetMs,
  formatTimestamp,
  parseTimeMs,
} from "./StreamObserveShared";

const TIMELINE_KIND_LABELS: Record<string, string> = {
  "evlog.event": "event",
  "otel.exception": "exception",
  "otel.span.end": "span end",
  "otel.span.event": "span event",
  "otel.span.start": "span",
};

export function TimelineSection(props: {
  startTimeMs: number | null;
  timeline: StudioObserveTimelineItem[];
}) {
  const visibleItems = props.timeline.filter(
    (item) => item.kind !== "otel.span.end",
  );

  if (visibleItems.length === 0) {
    return (
      <div className="px-1 py-6 text-center text-sm text-muted-foreground">
        No timeline items were found for this request.
      </div>
    );
  }

  const baseTimeMs =
    props.startTimeMs ?? parseTimeMs(visibleItems[0]?.time ?? null);

  return (
    <div className="flex flex-col" data-testid="stream-observe-timeline">
      {visibleItems.map((item) => {
        const itemTimeMs = parseTimeMs(item.time);
        const offsetMs =
          baseTimeMs != null && itemTimeMs != null
            ? itemTimeMs - baseTimeMs
            : null;
        const isException =
          item.kind === "otel.exception" || item.severity === "error";

        return (
          <div
            key={item.id}
            className="flex items-center gap-3 border-b border-border/60 py-2 last:border-b-0"
            data-testid="stream-observe-timeline-item"
          >
            <span
              className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground"
              title={formatTimestamp(item.time)}
            >
              {offsetMs != null ? formatOffsetMs(offsetMs) : "-"}
            </span>
            <Badge
              className="w-24 shrink-0 justify-center font-normal"
              variant={isException ? "destructive" : "secondary"}
            >
              {TIMELINE_KIND_LABELS[item.kind] ?? item.kind}
            </Badge>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                isException ? "text-destructive" : "text-foreground",
              )}
              title={item.title}
            >
              {item.title}
            </span>
            {item.service ? (
              <Badge className="shrink-0 font-normal" variant="outline">
                {item.service}
              </Badge>
            ) : null}
            <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {item.duration != null ? formatDurationMs(item.duration) : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
