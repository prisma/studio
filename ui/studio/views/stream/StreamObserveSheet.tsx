import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { cn } from "@/ui/lib/utils";

import {
  type StudioObserveEvlog,
  type StudioObserveLookup,
  type StudioObserveRequestResult,
  type StudioObserveTimelineItem,
  type StudioObserveTrace,
  type StudioObserveTraceTreeNode,
  useStreamObserveRequest,
} from "../../../hooks/use-stream-observe-request";

type ObserveSection = "event" | "timeline" | "trace";

const OBSERVE_SECTION_OPTIONS = [
  { label: "Timeline", value: "timeline" },
  { label: "Trace", value: "trace" },
  { label: "Event", value: "event" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: ObserveSection;
}>;

const TIMELINE_KIND_LABELS: Record<string, string> = {
  "evlog.event": "event",
  "otel.exception": "exception",
  "otel.span.end": "span end",
  "otel.span.event": "span event",
  "otel.span.start": "span",
};

export interface StreamObserveSheetProps {
  eventsStream: string | null;
  lookup: StudioObserveLookup | null;
  onClose: () => void;
  tracesStream: string | null;
}

function formatDurationMs(durationMs: number | null): string {
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

function formatTimestamp(isoTimestamp: string | null): string {
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

function formatShortId(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function formatOffsetMs(offsetMs: number): string {
  if (!Number.isFinite(offsetMs)) {
    return "";
  }

  const rounded = Math.round(offsetMs);

  return rounded >= 0 ? `+${rounded} ms` : `${rounded} ms`;
}

function flattenTraceTree(
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

function parseTimeMs(isoTimestamp: string | null): number | null {
  if (!isoTimestamp) {
    return null;
  }

  const parsed = Date.parse(isoTimestamp);

  return Number.isNaN(parsed) ? null : parsed;
}

function IdChip(props: { label: string; value: string }) {
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

function SummaryBadges(props: { result: StudioObserveRequestResult }) {
  const { summary } = props.result;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-testid="stream-observe-summary-badges"
    >
      {summary.status != null ? (
        <Badge variant={summary.isError ? "destructive" : "secondary"}>
          {summary.status}
        </Badge>
      ) : null}
      {summary.level ? (
        <Badge
          variant={summary.level === "error" ? "destructive" : "secondary"}
        >
          {summary.level}
        </Badge>
      ) : null}
      {summary.duration != null ? (
        <Badge variant="outline">{formatDurationMs(summary.duration)}</Badge>
      ) : null}
      {summary.service ? (
        <Badge variant="outline">{summary.service}</Badge>
      ) : null}
      {summary.environment ? (
        <Badge variant="outline">{summary.environment}</Badge>
      ) : null}
    </div>
  );
}

function CoverageWarnings(props: { warnings: string[] }) {
  if (props.warnings.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2"
      data-testid="stream-observe-warnings"
    >
      {props.warnings.map((warning) => (
        <div
          key={warning}
          className="flex items-start gap-2 text-xs text-muted-foreground"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">{warning}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineSection(props: {
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

function TraceSection(props: {
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

function EventSection(props: {
  eventsStream: string | null;
  evlog: StudioObserveEvlog | null;
}) {
  if (!props.eventsStream) {
    return (
      <div className="px-1 py-6 text-center text-sm text-muted-foreground">
        No evlog stream is available for request events.
      </div>
    );
  }

  const event = props.evlog?.primary ?? null;

  if (!event) {
    return (
      <div className="px-1 py-6 text-center text-sm text-muted-foreground">
        No evlog event was found for this request.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="stream-observe-event">
      <div className="flex flex-wrap items-center gap-1.5">
        {event.level ? (
          <Badge
            variant={event.level === "error" ? "destructive" : "secondary"}
          >
            {event.level}
          </Badge>
        ) : null}
        {event.method && event.path ? (
          <Badge className="font-mono font-normal" variant="outline">
            {event.method} {event.path}
          </Badge>
        ) : null}
        {event.status != null ? (
          <Badge variant="outline">{event.status}</Badge>
        ) : null}
        {event.duration != null ? (
          <Badge variant="outline">{formatDurationMs(event.duration)}</Badge>
        ) : null}
      </div>

      {event.message ? (
        <p className="text-sm font-medium text-foreground">{event.message}</p>
      ) : null}

      {event.why || event.fix || event.link ? (
        <div
          className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          data-testid="stream-observe-root-cause"
        >
          {event.why ? (
            <div>
              <span className="font-medium">Why </span>
              <span className="text-muted-foreground">{event.why}</span>
            </div>
          ) : null}
          {event.fix ? (
            <div>
              <span className="font-medium">Fix </span>
              <span className="text-muted-foreground">{event.fix}</span>
            </div>
          ) : null}
          {event.link ? (
            <a
              className="break-all text-xs text-muted-foreground underline underline-offset-2"
              href={event.link}
              rel="noreferrer"
              target="_blank"
            >
              {event.link}
            </a>
          ) : null}
        </div>
      ) : null}

      {props.evlog && props.evlog.matchCount > 1 ? (
        <p className="text-xs text-muted-foreground">
          {props.evlog.matchCount} events matched this lookup; showing the best
          match.
        </p>
      ) : null}

      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border/70 bg-muted/40 p-3 font-mono text-xs leading-5 text-foreground">
        {JSON.stringify(event.raw, null, 2)}
      </pre>
    </div>
  );
}

function ObserveLoadingState() {
  return (
    <div className="flex flex-col gap-2" data-testid="stream-observe-loading">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-6 w-full" />
      ))}
    </div>
  );
}

export function StreamObserveSheet(props: StreamObserveSheetProps) {
  const { eventsStream, lookup, onClose, tracesStream } = props;
  const [section, setSection] = useState<ObserveSection>("timeline");
  const lookupIdentity = lookup ? `${lookup.kind}:${lookup.value}` : null;

  useEffect(() => {
    setSection("timeline");
  }, [lookupIdentity]);

  const { error, isError, isFetching, isLoading, refetch, result } =
    useStreamObserveRequest({
      eventsStream,
      lookup,
      tracesStream,
    });
  const summaryStartTimeMs = parseTimeMs(result?.summary.startTime ?? null);

  return (
    <Sheet
      open={lookup !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent
        className="flex w-full flex-col gap-4 overflow-hidden sm:max-w-3xl"
        data-testid="stream-observe-sheet"
      >
        {lookup ? (
          <>
            <SheetHeader className="shrink-0 pr-8">
              <SheetTitle className="truncate">
                {result?.summary.title ?? "Request details"}
              </SheetTitle>
              <SheetDescription className="truncate">
                {result?.summary.method && result?.summary.path
                  ? `${result.summary.method} ${result.summary.path}`
                  : `Lookup by ${lookup.kind}`}
                {result?.summary.startTime
                  ? ` | ${formatTimestamp(result.summary.startTime)}`
                  : ""}
              </SheetDescription>
              {result ? <SummaryBadges result={result} /> : null}
              <div className="flex flex-wrap items-center gap-1.5">
                {result?.lookup.requestId ? (
                  <IdChip label="req" value={result.lookup.requestId} />
                ) : null}
                {result?.lookup.traceId ? (
                  <IdChip label="trace" value={result.lookup.traceId} />
                ) : null}
                {result?.lookup.spanId ? (
                  <IdChip label="span" value={result.lookup.spanId} />
                ) : null}
                {!result ? (
                  <IdChip label={lookup.kind} value={lookup.value} />
                ) : null}
              </div>
            </SheetHeader>

            {result ? (
              <CoverageWarnings warnings={result.coverage.warnings} />
            ) : null}

            <div className="flex shrink-0 items-center justify-between gap-2">
              <ToggleGroup
                aria-label="Request details section"
                className="gap-0 overflow-hidden rounded-sm border border-input bg-muted/60 shadow-none"
                onValueChange={(value) => {
                  if (
                    value === "timeline" ||
                    value === "trace" ||
                    value === "event"
                  ) {
                    setSection(value);
                  }
                }}
                type="single"
                value={section}
              >
                {OBSERVE_SECTION_OPTIONS.map((option, index) => {
                  return (
                    <ToggleGroupItem
                      className={cn(
                        "h-8 rounded-none border-0 px-2.5 shadow-none data-[state=on]:bg-background data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                        index < OBSERVE_SECTION_OPTIONS.length - 1 &&
                          "border-r border-input",
                      )}
                      data-testid={`stream-observe-section-${option.value}`}
                      key={option.value}
                      size="sm"
                      value={option.value}
                    >
                      {option.label}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
              <Button
                aria-label="Refresh request details"
                className="size-8"
                data-testid="stream-observe-refresh"
                disabled={isFetching}
                onClick={() => {
                  void refetch();
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <RefreshCw className={cn(isFetching && "animate-spin")} />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {isLoading ? (
                <ObserveLoadingState />
              ) : isError ? (
                <div
                  className="flex flex-col items-center gap-3 px-1 py-6 text-center text-sm text-muted-foreground"
                  data-testid="stream-observe-error"
                >
                  <span>
                    {error instanceof Error
                      ? error.message
                      : "Request details are unavailable right now."}
                  </span>
                  <Button
                    onClick={() => {
                      void refetch();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Retry
                  </Button>
                </div>
              ) : result ? (
                <>
                  {section === "timeline" ? (
                    <TimelineSection
                      startTimeMs={summaryStartTimeMs}
                      timeline={result.timeline}
                    />
                  ) : null}
                  {section === "trace" ? (
                    <TraceSection
                      trace={result.trace}
                      tracesStream={tracesStream}
                    />
                  ) : null}
                  {section === "event" ? (
                    <EventSection
                      eventsStream={eventsStream}
                      evlog={result.evlog}
                    />
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="shrink-0 text-xs text-muted-foreground">
              Sources: {eventsStream ? `events ${eventsStream}` : null}
              {eventsStream && tracesStream ? " | " : null}
              {tracesStream ? `traces ${tracesStream}` : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
