import { useMemo, useState } from "react";

import { Badge } from "@/ui/components/ui/badge";
import { cn } from "@/ui/lib/utils";

import type { StudioObserveTrace } from "../../../hooks/use-stream-observe-request";
import {
  flattenTraceTree,
  formatDurationMs,
  formatShortId,
  formatTimestamp,
  IdChip,
  parseTimeMs,
} from "./StreamObserveShared";

export function TraceSection(props: {
  trace: StudioObserveTrace | null;
  tracesStream: string | null;
}) {
  const [expandedSpanId, setExpandedSpanId] = useState<string | null>(null);
  const { trace } = props;
  const rows = useMemo(
    () => (trace ? flattenTraceTree(trace.tree) : []),
    [trace],
  );
  const traceWindow = useMemo(() => {
    let startMs: number | null = null;
    let endMs: number | null = null;

    for (const row of rows) {
      const rowStartMs = parseTimeMs(row.startTime);
      const rowEndMs =
        parseTimeMs(row.endTime) ??
        (rowStartMs != null && row.duration != null
          ? rowStartMs + row.duration
          : rowStartMs);

      if (rowStartMs != null && (startMs == null || rowStartMs < startMs)) {
        startMs = rowStartMs;
      }

      if (rowEndMs != null && (endMs == null || rowEndMs > endMs)) {
        endMs = rowEndMs;
      }
    }

    return startMs != null && endMs != null && endMs > startMs
      ? { durationMs: endMs - startMs, startMs }
      : null;
  }, [rows]);

  if (!props.tracesStream) {
    return (
      <div className="px-1 py-6 text-center text-sm text-muted-foreground">
        No otel-traces stream is available for span correlation.
      </div>
    );
  }

  if (!trace || rows.length === 0) {
    return (
      <div className="px-1 py-6 text-center text-sm text-muted-foreground">
        No trace spans were found for this request.
      </div>
    );
  }

  const criticalPathSpanIds = new Set(trace.criticalPath);

  return (
    <div className="flex flex-col gap-3" data-testid="stream-observe-waterfall">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>
          {trace.spanCount} {trace.spanCount === 1 ? "span" : "spans"}
        </span>
        {trace.partial ? <Badge variant="secondary">partial</Badge> : null}
        {trace.duplicateSpans > 0 ? (
          <span>- {trace.duplicateSpans} duplicates deduplicated</span>
        ) : null}
        {trace.missingParents.length > 0 ? (
          <span>
            - missing parents:{" "}
            {trace.missingParents.map(formatShortId).join(", ")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col">
        {rows.map((row) => {
          const rowStartMs = parseTimeMs(row.startTime);
          const barLeftPercent =
            traceWindow && rowStartMs != null
              ? ((rowStartMs - traceWindow.startMs) / traceWindow.durationMs) *
                100
              : 0;
          const barWidthPercent =
            traceWindow && row.duration != null
              ? (row.duration / traceWindow.durationMs) * 100
              : 0;
          const isError = row.statusCode === "error";
          const isExpanded = expandedSpanId === row.spanId;
          const spanSource = trace.spansById.get(row.spanId);

          return (
            <div
              key={row.spanId}
              className="border-b border-border/60 last:border-b-0"
            >
              <button
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_minmax(0,42%)_4.5rem] items-center gap-3 py-1.5 text-left transition-colors hover:bg-accent/60",
                  isExpanded && "bg-accent/40",
                )}
                data-testid={`stream-observe-span-row-${row.spanId}`}
                onClick={() => {
                  setExpandedSpanId((currentValue) =>
                    currentValue === row.spanId ? null : row.spanId,
                  );
                }}
                type="button"
              >
                <span
                  className="flex min-w-0 items-center gap-1.5"
                  style={{ paddingLeft: `${row.depth * 14}px` }}
                >
                  <span
                    className={cn(
                      "truncate text-sm",
                      isError ? "text-destructive" : "text-foreground",
                    )}
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  {row.service ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.service}
                    </span>
                  ) : null}
                </span>
                <span className="relative h-3.5 overflow-hidden rounded-sm bg-muted/60">
                  <span
                    className={cn(
                      "absolute inset-y-0 rounded-sm",
                      isError
                        ? "bg-destructive/70"
                        : criticalPathSpanIds.has(row.spanId)
                          ? "bg-primary/70"
                          : "bg-primary/35",
                    )}
                    style={{
                      left: `${Math.min(Math.max(barLeftPercent, 0), 100)}%`,
                      minWidth: "2px",
                      width: `${Math.min(Math.max(barWidthPercent, 0), 100)}%`,
                    }}
                  />
                </span>
                <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDurationMs(row.duration)}
                </span>
              </button>

              {isExpanded ? (
                <div
                  className="border-t border-border/60 bg-muted/30 px-3 py-3"
                  data-testid="stream-observe-span-details"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant={isError ? "destructive" : "secondary"}>
                      {row.statusCode}
                    </Badge>
                    <Badge variant="outline">{row.kind}</Badge>
                    <IdChip label="span" value={row.spanId} />
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(row.startTime)}
                    </span>
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-5 text-foreground">
                    {JSON.stringify(spanSource ?? row, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {trace.errors.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Errors
          </span>
          {trace.errors.map((error) => (
            <div
              key={`${error.spanId}:${error.type ?? ""}:${error.message ?? ""}`}
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="destructive">{error.type ?? "error"}</Badge>
                {error.service ? (
                  <Badge variant="outline">{error.service}</Badge>
                ) : null}
                <span className="truncate text-xs text-muted-foreground">
                  {error.name}
                </span>
              </div>
              {error.message ? (
                <p className="mt-1 break-words text-sm text-foreground">
                  {error.message}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {trace.serviceMap.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Service calls
          </span>
          <div className="flex flex-wrap gap-1.5">
            {trace.serviceMap.map((edge) => (
              <Badge
                key={`${edge.from}->${edge.to}`}
                className="gap-1 font-normal"
                variant="outline"
              >
                <span>
                  {edge.from} -&gt; {edge.to}
                </span>
                <span className="text-muted-foreground">
                  {edge.count} {edge.count === 1 ? "call" : "calls"}
                  {edge.errorCount > 0
                    ? `, ${edge.errorCount} ${edge.errorCount === 1 ? "error" : "errors"}`
                    : ""}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
