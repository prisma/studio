import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

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
  type StudioObserveLookup,
  type StudioObserveRequestResult,
  useStreamObserveRequest,
} from "../../../hooks/use-stream-observe-request";
import { EventSection } from "./StreamObserveEventSection";
import {
  formatDurationMs,
  formatTimestamp,
  IdChip,
  parseTimeMs,
} from "./StreamObserveShared";
import { TimelineSection } from "./StreamObserveTimelineSection";
import { TraceSection } from "./StreamObserveTraceSection";

type ObserveSection = "event" | "timeline" | "trace";

const OBSERVE_SECTION_OPTIONS = [
  { label: "Timeline", value: "timeline" },
  { label: "Trace", value: "trace" },
  { label: "Event", value: "event" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: ObserveSection;
}>;

export interface StreamObserveSheetProps {
  eventsStream: string | null;
  lookup: StudioObserveLookup | null;
  onClose: () => void;
  tracesStream: string | null;
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
  const hasObserveSource = eventsStream !== null || tracesStream !== null;

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
                disabled={isFetching || !hasObserveSource}
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
              {!hasObserveSource ? (
                <div
                  className="flex flex-col items-center gap-2 px-1 py-6 text-center text-sm text-muted-foreground"
                  data-testid="stream-observe-unavailable"
                >
                  <span className="font-medium text-foreground">
                    Request observability is unavailable
                  </span>
                  <span>
                    No evlog or otel-traces stream is available for this lookup.
                  </span>
                </div>
              ) : isLoading ? (
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
