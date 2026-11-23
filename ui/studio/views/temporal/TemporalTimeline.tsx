import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { TemporalGroupedSpan, TemporalSpanKind } from "@/data/temporal";
import { buildTimelineScale } from "@/data/temporal/timeline-scale";
import { Button } from "@/ui/components/ui/button";
import { Label } from "@/ui/components/ui/label";
import { Switch } from "@/ui/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { useTemporalWorkflowDetails } from "@/ui/hooks/use-temporal";
import { useUiState } from "@/ui/hooks/use-ui-state";
import { cn } from "@/ui/lib/utils";

import { formatDuration, spanBarClasses } from "./temporal-utils";
import {
  TEMPORAL_SPAN_STATUS,
  TemporalStatusBadge,
} from "./TemporalPrimitives";

const WIDE_LABEL_WIDTH = 220;
const NARROW_LABEL_WIDTH = 148;
/** Below this width the label column gives room to the bars. */
const NARROW_BELOW = 560;
const DURATION_WIDTH = 72;
const ROW_HEIGHT = 24;
const MIN_ZOOM = 1;
const MAX_ZOOM = 64;
const MIN_HEIGHT = 96;
const DEFAULT_HEIGHT = 264;
const HOVER_CARD_WIDTH = 280;

const KIND_FILTERS: Array<{ kinds: TemporalSpanKind[]; label: string }> = [
  { kinds: ["activity"], label: "Activities" },
  { kinds: ["timer"], label: "Timers" },
  { kinds: ["child-workflow"], label: "Children" },
  { kinds: ["signal", "update"], label: "Messages" },
];

const KIND_NAME: Record<TemporalSpanKind, string> = {
  activity: "Activity",
  "child-workflow": "Child Workflow",
  signal: "Signal",
  timer: "Timer",
  update: "Update",
  workflow: "Workflow",
  "workflow-task": "Workflow Task",
};

interface TimelineRow {
  /** The run a nested row belongs to; clicking the row opens that run. */
  child?: { runId?: string; workflowId: string };
  depth: number;
  durationMs: number;
  key: string;
  span: TemporalGroupedSpan;
  startOffsetMs: number;
}

interface AxisLabel {
  align: "centre" | "end" | "start";
  left: number;
  text: string;
  title?: string;
  tone: "gap" | "tick";
}

/** A Child Workflow's bar is an outline, so the spans nested under it read as its content. */
function barClasses(row: TimelineRow): string {
  const { span } = row;

  if (span.kind === "child-workflow" && row.depth === 0) {
    return span.status === "failed"
      ? "bg-destructive/20 ring-1 ring-inset ring-destructive"
      : span.status === "timed-out" || span.status === "retrying"
        ? "bg-amber-500/20 ring-1 ring-inset ring-amber-500"
        : span.status === "canceled"
          ? "bg-muted-foreground/15 ring-1 ring-inset ring-muted-foreground/60"
          : "bg-prism-cyan-500/20 ring-1 ring-inset ring-prism-cyan-600 dark:ring-prism-cyan-400";
  }

  return spanBarClasses(span.kind, span.status);
}

/** Keeps axis labels that do not run into the label before them. */
function withoutCollisions(labels: AxisLabel[]): AxisLabel[] {
  const kept: AxisLabel[] = [];
  let lastRight = -Infinity;

  for (const label of [...labels].sort((a, b) => a.left - b.left)) {
    // 7px for each monospace character; a gap label also has "⋯ " and its padding.
    const width = label.text.length * 7 + (label.tone === "gap" ? 24 : 0);
    const start =
      label.align === "start"
        ? label.left
        : label.align === "end"
          ? label.left - width
          : label.left - width / 2;

    if (start >= lastRight + 10) {
      kept.push(label);
      lastRight = start + width;
    }
  }

  return kept;
}

/**
 * The run's spans on a shared time axis. Non-standard UI: see
 * `Architecture/non-standard-ui.md`, "Temporal Timeline".
 */
export function TemporalTimeline(props: {
  /** Span highlighted by an adjacent view, such as the Diagram stepper. */
  highlightedSpanId?: string | null;
  namespace: string;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  onSelectSpan: (spanId: string | null) => void;
  selectedSpanId: string | null;
  spans: TemporalGroupedSpan[];
  startTime: string;
  totalDurationMs: number;
}) {
  const {
    highlightedSpanId,
    namespace,
    onOpenExecution,
    onSelectSpan,
    selectedSpanId,
    spans,
    startTime,
    totalDurationMs,
  } = props;
  const [zoom, setZoom] = useState(1);
  const [collapseIdle, setCollapseIdle] = useUiState(
    "temporal:timeline-collapse-idle",
    true,
    { persistent: true },
  );
  const [height, setHeight] = useUiState(
    "temporal:timeline-height",
    DEFAULT_HEIGHT,
    { persistent: true },
  );
  const [shownKinds, setShownKinds] = useState<string[]>(
    KIND_FILTERS.map((filter) => filter.label),
  );
  const [expandedChildIds, setExpandedChildIds] = useState<string[]>([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [rowsBelow, setRowsBelow] = useState(0);
  const [containerWidth, setContainerWidth] = useState(900);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const axisTrackRef = useRef<HTMLSpanElement | null>(null);
  const cursorLineRef = useRef<HTMLSpanElement | null>(null);
  const cursorLabelRef = useRef<HTMLSpanElement | null>(null);
  const hoverCardRef = useRef<HTMLDivElement | null>(null);
  const hoveredKeyRef = useRef<string | null>(null);

  const labelWidth =
    containerWidth < NARROW_BELOW ? NARROW_LABEL_WIDTH : WIDE_LABEL_WIDTH;
  const trackBaseWidth = Math.max(
    140,
    containerWidth - labelWidth - DURATION_WIDTH,
  );

  const measureRowsBelow = () => {
    const element = scrollRef.current;

    if (element) {
      setRowsBelow(
        Math.max(
          0,
          Math.round(
            (element.scrollHeight - element.scrollTop - element.clientHeight) /
              ROW_HEIGHT,
          ),
        ),
      );
    }
  };

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const measure = () => {
      setContainerWidth(element.clientWidth);
      measureRowsBelow();
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const expandedChildSpans = useMemo(
    () =>
      spans.filter(
        (span) =>
          span.kind === "child-workflow" &&
          span.childWorkflowId &&
          expandedChildIds.includes(span.id),
      ),
    [expandedChildIds, spans],
  );
  const childDetails = useTemporalWorkflowDetails({
    namespace,
    runs: expandedChildSpans.map((span) => ({
      runId: span.childRunId,
      workflowId: span.childWorkflowId!,
    })),
  });
  const childDetailKey = childDetails
    .map((detail) => `${detail.status}:${detail.dataUpdatedAt}`)
    .join("|");

  const rows = useMemo(() => {
    const visibleKinds = new Set(
      KIND_FILTERS.filter((filter) =>
        shownKinds.includes(filter.label),
      ).flatMap((filter) => filter.kinds),
    );
    const parentStartMs = Date.parse(startTime);
    const result: TimelineRow[] = [];

    for (const span of spans) {
      if (!visibleKinds.has(span.kind)) {
        continue;
      }

      result.push({
        depth: 0,
        durationMs: span.durationMs,
        key: span.id,
        span,
        startOffsetMs: span.startOffsetMs,
      });

      const childIndex = expandedChildSpans.indexOf(span);
      const child = childIndex >= 0 ? childDetails[childIndex]?.data : null;

      for (const childSpan of child?.spans ?? []) {
        result.push({
          child: {
            runId: child!.execution.runId,
            workflowId: child!.execution.workflowId,
          },
          depth: 1,
          durationMs: childSpan.durationMs,
          key: `${span.id}/${childSpan.id}`,
          span: childSpan,
          // A child's spans count from its own start, so place them by clock time.
          startOffsetMs: Math.max(
            0,
            Date.parse(childSpan.timestamp) - parentStartMs,
          ),
        });
      }
    }

    return result;
    // `childDetailKey` changes when a child's detail loads or refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childDetailKey, expandedChildSpans, shownKinds, spans, startTime]);

  // The panel is as tall as its rows, up to the height the user set.
  useEffect(measureRowsBelow, [height, rows.length]);

  useEffect(() => {
    if (!highlightedSpanId || !scrollRef.current) {
      return;
    }

    const rowElement = scrollRef.current.querySelector<HTMLElement>(
      `[data-testid="temporal-timeline-row-${CSS.escape(highlightedSpanId)}"]`,
    );

    rowElement?.scrollIntoView({ block: "nearest" });
  }, [highlightedSpanId]);

  const scale = useMemo(
    () =>
      buildTimelineScale(
        rows.map((row) => ({
          durationMs: row.durationMs,
          // During a Timer the Workflow only waits.
          idle: row.span.kind === "timer",
          startOffsetMs: row.startOffsetMs,
        })),
        totalDurationMs,
        { collapseIdle },
      ),
    [collapseIdle, rows, totalDurationMs],
  );
  const trackWidth = Math.round(trackBaseWidth * zoom);
  const hoveredRow = hoveredKey
    ? (rows.find((row) => row.key === hoveredKey) ?? null)
    : null;

  const axisLabels = useMemo(() => {
    const labels: AxisLabel[] = collapseIdle
      ? scale.gaps.map((gap) => {
          const centre = (gap.startFraction + gap.endFraction) / 2;

          return {
            // A label near an edge stays inside the axis.
            align: centre > 0.9 ? "end" : centre > 0.1 ? "centre" : "start",
            left:
              (centre > 0.9
                ? gap.endFraction
                : centre > 0.1
                  ? centre
                  : gap.startFraction) * trackWidth,
            text: formatDuration(gap.durationMs),
            title: `Nothing started or ended for ${formatDuration(gap.durationMs)}. The timeline shortens this stretch.`,
            tone: "gap",
          } satisfies AxisLabel;
        })
      : [0.25, 0.5, 0.75].map(
          (fraction) =>
            ({
              align: "centre",
              left: fraction * trackWidth,
              text: formatDuration(totalDurationMs * fraction),
              tone: "tick",
            }) satisfies AxisLabel,
        );

    // The shortened stretches win over the start label when both want the same place.
    return withoutCollisions(
      collapseIdle
        ? [
            ...labels,
            {
              align: "start",
              left: 0,
              text: "0ms",
              tone: "tick",
            } satisfies AxisLabel,
          ].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "gap" ? -1 : 1))
        : [{ align: "start", left: 0, text: "0ms", tone: "tick" }, ...labels],
    );
  }, [collapseIdle, scale.gaps, totalDurationMs, trackWidth]);

  const zoomTo = (next: number, anchorX?: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const element = scrollRef.current;

    if (element && clamped !== zoom) {
      // Keep the point under the cursor (or the centre) in place.
      const anchor = anchorX ?? trackBaseWidth / 2;
      const position = (element.scrollLeft + anchor) / zoom;

      requestAnimationFrame(() => {
        element.scrollLeft = Math.max(0, position * clamped - anchor);
      });
    }

    setZoom(clamped);
  };
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  const currentZoomRef = useRef(zoom);
  currentZoomRef.current = zoom;
  const labelWidthRef = useRef(labelWidth);
  labelWidthRef.current = labelWidth;

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    // React attaches wheel listeners as passive, and those cannot stop the page zoom.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.25 : 0.8;

      zoomRef.current(
        currentZoomRef.current * factor,
        event.clientX - bounds.left - labelWidthRef.current,
      );
    };

    element.addEventListener("wheel", onWheel, { passive: false });

    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const startY = event.clientY;
    const startHeight = Math.min(
      height,
      scrollRef.current?.clientHeight ?? height,
    );
    const handle = event.currentTarget;

    handle.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent) => {
      setHeight(
        Math.min(
          window.innerHeight - 260,
          Math.max(MIN_HEIGHT, startHeight + move.clientY - startY),
        ),
      );
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  const hideCursor = () => {
    cursorLineRef.current?.style.setProperty("opacity", "0");
    cursorLabelRef.current?.style.setProperty("opacity", "0");
    hoverCardRef.current?.style.setProperty("opacity", "0");
    hoveredKeyRef.current = null;
    setHoveredKey(null);
  };

  /**
   * Moves the time cursor and the hover card with the pointer. Both are placed
   * through refs, so a pointer move renders no row again.
   */
  const followPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const axis = axisTrackRef.current;
    const wrapper = wrapperRef.current;
    const line = cursorLineRef.current;
    const label = cursorLabelRef.current;
    const card = hoverCardRef.current;

    if (!axis || !wrapper || !line || !label || !card) {
      return;
    }

    const axisBounds = axis.getBoundingClientRect();
    const x = event.clientX - axisBounds.left;
    const track = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-timeline-track]",
    );

    if (!track || x < 0 || x > axisBounds.width) {
      hideCursor();
      return;
    }

    line.style.opacity = "1";
    line.style.transform = `translateX(${x}px)`;
    label.style.opacity = "1";
    label.style.left = `${Math.min(axisBounds.width - 30, Math.max(30, x))}px`;
    label.textContent = `+${formatDuration(scale.toOffsetMs(x / axisBounds.width))}`;

    const key = track.dataset.timelineTrack ?? null;

    if (key !== hoveredKeyRef.current) {
      hoveredKeyRef.current = key;
      setHoveredKey(key);
    }

    const wrapperBounds = wrapper.getBoundingClientRect();
    const rowBounds = track.getBoundingClientRect();
    const left = Math.min(
      wrapperBounds.width - HOVER_CARD_WIDTH - 8,
      Math.max(8, event.clientX - wrapperBounds.left + 14),
    );
    const below = rowBounds.bottom - wrapperBounds.top + 6;
    // Near the bottom of the window the card opens above the row.
    const top =
      rowBounds.bottom + card.offsetHeight + 12 > window.innerHeight
        ? rowBounds.top - wrapperBounds.top - card.offsetHeight - 6
        : below;

    card.style.opacity = "1";
    card.style.transform = `translate(${left}px, ${top}px)`;
  };

  return (
    <div
      ref={wrapperRef}
      className="relative flex shrink-0 flex-col border-b border-border bg-muted/20"
      data-testid="temporal-gantt-timeline"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-border/60 px-4 py-1.5">
        <ToggleGroup
          type="multiple"
          aria-label="Span kinds on the timeline"
          className="justify-start gap-1"
          value={shownKinds}
          onValueChange={setShownKinds}
        >
          {KIND_FILTERS.map((filter) => (
            <ToggleGroupItem
              key={filter.label}
              value={filter.label}
              className="h-6 px-2 text-2xs font-normal text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground"
            >
              {filter.label}{" "}
              <span className="font-mono tabular-nums">
                {
                  spans.filter((span) => filter.kinds.includes(span.kind))
                    .length
                }
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Switch
              id="temporal-timeline-collapse"
              checked={collapseIdle}
              onCheckedChange={setCollapseIdle}
            />
            <Label
              htmlFor="temporal-timeline-collapse"
              className="text-2xs font-normal text-muted-foreground"
            >
              Shorten idle time
            </Label>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="xs"
              className="w-6 px-0"
              aria-label="Zoom out"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => zoomTo(zoom / 2)}
            >
              <Minus />
            </Button>
            <span
              className="w-10 text-center font-mono text-2xs tabular-nums text-muted-foreground"
              data-testid="temporal-timeline-zoom"
            >
              {zoom < 10
                ? zoom.toFixed(1).replace(/\.0$/, "")
                : Math.round(zoom)}
              ×
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="w-6 px-0"
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => zoomTo(zoom * 2)}
            >
              <Plus />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="w-6 px-0"
              aria-label="Fit the whole run"
              disabled={zoom === 1}
              onClick={() => zoomTo(1)}
            >
              <Maximize2 />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto"
        style={{ maxHeight: height }}
        onScroll={measureRowsBelow}
        onPointerMove={followPointer}
        onPointerLeave={hideCursor}
        data-testid="temporal-timeline-scroll"
      >
        <div
          className="relative flex flex-col"
          style={{ width: labelWidth + trackWidth + DURATION_WIDTH }}
        >
          <div className="sticky top-0 z-20 flex h-6 shrink-0 items-center border-b border-border/60 bg-muted font-mono text-2xs text-muted-foreground">
            <span
              className="sticky left-0 z-10 h-full shrink-0 bg-muted"
              style={{ width: labelWidth }}
            />
            <span
              ref={axisTrackRef}
              className="relative h-full"
              style={{ width: trackWidth }}
            >
              {axisLabels.map((label) => (
                <span
                  key={`${label.tone}:${label.left}`}
                  className={cn(
                    "absolute top-1 whitespace-nowrap",
                    label.align === "centre" && "-translate-x-1/2",
                    label.align === "end" && "-translate-x-full",
                    label.tone === "gap" &&
                      "rounded-sm bg-background px-1 text-foreground",
                  )}
                  style={{ left: label.left }}
                  title={label.title}
                >
                  {label.tone === "gap" ? (
                    <span aria-hidden className="text-muted-foreground">
                      ⋯{" "}
                    </span>
                  ) : null}
                  {label.text}
                </span>
              ))}
              <span
                ref={cursorLabelRef}
                aria-hidden
                className="pointer-events-none absolute top-0.5 z-10 -translate-x-1/2 whitespace-nowrap rounded-sm bg-foreground px-1.5 leading-5 text-background opacity-0"
              />
            </span>
            <span
              className="sticky right-0 z-10 h-full shrink-0 bg-muted pr-3 text-right leading-6 text-foreground"
              style={{ width: DURATION_WIDTH }}
              title="The run's duration"
            >
              {formatDuration(totalDurationMs)}
            </span>
          </div>

          {/* The time under the pointer. The sticky label and duration columns cover it at the edges. */}
          <span
            ref={cursorLineRef}
            aria-hidden
            className="pointer-events-none absolute top-6 bottom-0 z-[5] w-px bg-foreground/50 opacity-0"
            style={{ left: labelWidth }}
          />

          {rows.length === 0 ? (
            <p className="sticky left-0 w-fit p-4 text-xs text-muted-foreground">
              No spans of the chosen kinds.
            </p>
          ) : null}

          {rows.map((row) => {
            const { span } = row;
            const isSelected = !row.child && selectedSpanId === span.id;
            const isHighlighted = !row.child && highlightedSpanId === span.id;
            const isChildSpan =
              !row.child &&
              span.kind === "child-workflow" &&
              Boolean(span.childWorkflowId);
            const isExpanded = expandedChildIds.includes(span.id);
            const left = scale.toFraction(row.startOffsetMs);
            const right = scale.toFraction(row.startOffsetMs + row.durationMs);
            // The time between scheduling and the last start: queue wait, or earlier attempts.
            const waitEnd =
              span.kind === "activity" && span.queueWaitMs
                ? scale.toFraction(row.startOffsetMs + span.queueWaitMs)
                : left;
            const hadRetries = (span.attempt ?? 1) > 1;
            const isMessage = span.kind === "signal" || span.kind === "update";
            const label = span.userSummary ?? span.label;
            const select = () => {
              if (row.child) {
                onOpenExecution(row.child.workflowId, row.child.runId);
              } else {
                onSelectSpan(isSelected ? null : span.id);
              }
            };

            return (
              <div
                key={row.key}
                className={cn(
                  "group flex h-6 shrink-0 items-center text-xs hover:bg-muted",
                  isSelected && "bg-muted",
                  isHighlighted && "bg-prism-cyan-500/12",
                )}
                data-highlighted={isHighlighted ? "true" : undefined}
                data-testid={`temporal-timeline-row-${row.key}`}
              >
                <div
                  className={cn(
                    "sticky left-0 z-10 flex h-full shrink-0 items-center gap-1 bg-[color-mix(in_oklab,var(--muted)_20%,var(--background))] pr-2 group-hover:bg-muted",
                    isSelected && "bg-muted",
                    isHighlighted &&
                      "bg-[color-mix(in_oklab,var(--prism-cyan-500)_14%,var(--background))] group-hover:bg-[color-mix(in_oklab,var(--prism-cyan-500)_18%,var(--background))]",
                  )}
                  style={{
                    paddingLeft: 8 + row.depth * 16,
                    width: labelWidth,
                  }}
                >
                  {isChildSpan ? (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Hide" : "Show"} the spans of ${span.childWorkflowId}`}
                      className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() =>
                        setExpandedChildIds((ids) =>
                          isExpanded
                            ? ids.filter((id) => id !== span.id)
                            : [...ids, span.id],
                        )
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <button
                    type="button"
                    aria-pressed={row.child ? undefined : isSelected}
                    onClick={select}
                    className={cn(
                      "h-full min-w-0 flex-1 truncate rounded-sm text-left font-mono text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      isHighlighted && "font-medium",
                    )}
                    title={
                      row.child
                        ? `${label}: open ${row.child.workflowId}`
                        : label
                    }
                  >
                    {label}
                    {hadRetries ? (
                      <span className="text-amber-700 dark:text-amber-300">
                        {" "}
                        ×{span.attempt}
                      </span>
                    ) : null}
                  </button>
                  {isChildSpan ? (
                    <button
                      type="button"
                      aria-label={`Open ${span.childWorkflowId}`}
                      className="hidden size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:flex"
                      onClick={() =>
                        onOpenExecution(span.childWorkflowId!, span.childRunId)
                      }
                    >
                      <ExternalLink className="size-3" />
                    </button>
                  ) : null}
                </div>

                {/* The label button carries the same action for keyboard users. */}
                <div
                  aria-hidden
                  className="relative h-full shrink-0 cursor-pointer"
                  style={{ width: trackWidth }}
                  data-timeline-track={row.key}
                  onClick={select}
                >
                  {scale.gaps.map((gap) => (
                    <span
                      key={gap.startFraction}
                      className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--border)_3px_4px)] opacity-70"
                      style={{
                        left: `${gap.startFraction * 100}%`,
                        width: `${(gap.endFraction - gap.startFraction) * 100}%`,
                      }}
                    />
                  ))}
                  {waitEnd > left ? (
                    <span
                      className={cn(
                        "absolute top-1/2 h-1 -translate-y-1/2 rounded-sm",
                        hadRetries
                          ? "bg-amber-500/70"
                          : "bg-muted-foreground/40",
                      )}
                      style={{
                        left: `${left * 100}%`,
                        width: `${(waitEnd - left) * 100}%`,
                      }}
                    />
                  ) : null}
                  {isMessage ? (
                    <span
                      className={cn(
                        "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px]",
                        spanBarClasses(span.kind, span.status),
                        isHighlighted &&
                          "ring-2 ring-prism-cyan-600 ring-offset-1 ring-offset-background dark:ring-prism-cyan-300",
                      )}
                      style={{ left: `${left * 100}%` }}
                    />
                  ) : (
                    <span
                      className={cn(
                        "absolute top-1/2 h-2.5 min-w-[3px] -translate-y-1/2 overflow-hidden rounded-sm",
                        barClasses(row),
                        row.depth > 0 && "h-1.5 opacity-80",
                        isHighlighted &&
                          "ring-2 ring-prism-cyan-600 ring-offset-1 ring-offset-background dark:ring-prism-cyan-300",
                      )}
                      style={{
                        left: `${waitEnd * 100}%`,
                        width: `${Math.max(0, right - waitEnd) * 100}%`,
                      }}
                    />
                  )}
                  {/* Stripes over the part of a bar that lies in a shortened stretch. */}
                  {scale.gaps.map((gap) =>
                    gap.endFraction > waitEnd && gap.startFraction < right ? (
                      <span
                        key={gap.startFraction}
                        className="absolute top-1/2 h-2.5 -translate-y-1/2 bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--background)_3px_5px)] opacity-60"
                        style={{
                          left: `${Math.max(gap.startFraction, waitEnd) * 100}%`,
                          width: `${(Math.min(gap.endFraction, right) - Math.max(gap.startFraction, waitEnd)) * 100}%`,
                        }}
                      />
                    ) : null,
                  )}
                </div>

                <span
                  className={cn(
                    "sticky right-0 z-10 h-full shrink-0 bg-[color-mix(in_oklab,var(--muted)_20%,var(--background))] pr-3 text-right font-mono text-2xs leading-6 tabular-nums text-muted-foreground group-hover:bg-muted",
                    isSelected && "bg-muted",
                    isHighlighted &&
                      "bg-[color-mix(in_oklab,var(--prism-cyan-500)_14%,var(--background))] font-medium text-foreground group-hover:bg-[color-mix(in_oklab,var(--prism-cyan-500)_18%,var(--background))]",
                  )}
                  style={{ width: DURATION_WIDTH }}
                >
                  {formatDuration(row.durationMs)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {rowsBelow > 0 ? (
        <span
          className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-2xs text-muted-foreground shadow-sm"
          data-testid="temporal-timeline-more"
        >
          {rowsBelow} more below
        </span>
      ) : null}

      <div
        ref={hoverCardRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-30 flex flex-col gap-1.5 rounded-md border border-border bg-canvas p-2.5 text-xs opacity-0 shadow-md"
        style={{ width: HOVER_CARD_WIDTH }}
        data-testid="temporal-timeline-hover-card"
      >
        {hoveredRow ? <SpanHoverCard row={hoveredRow} /> : null}
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the timeline"
        className="h-1.5 shrink-0 cursor-row-resize touch-none border-t border-border/60 hover:bg-border"
        onPointerDown={startResize}
      />
    </div>
  );
}

function SpanHoverCard(props: { row: TimelineRow }) {
  const { row } = props;
  const { span } = row;
  const status = TEMPORAL_SPAN_STATUS[span.status];
  const failedAttempts = (span.attempt ?? 1) - 1;
  const isMessage = span.kind === "signal" || span.kind === "update";

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words font-mono font-medium text-foreground">
          {span.userSummary ?? span.label}
        </span>
        <TemporalStatusBadge
          className="shrink-0"
          icon={status.icon}
          tone={status.tone}
        >
          {status.label}
        </TemporalStatusBadge>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
        <dt>{KIND_NAME[span.kind]}</dt>
        <dd className="truncate text-right font-mono text-foreground">
          {span.userSummary ? span.label : (span.taskQueue ?? "")}
        </dd>
        <dt>{isMessage ? "Received" : "Started"}</dt>
        <dd className="text-right font-mono tabular-nums text-foreground">
          +{formatDuration(row.startOffsetMs)}
        </dd>
        {isMessage ? null : (
          <>
            <dt>
              {span.status === "running" || span.status === "retrying"
                ? "Running for"
                : "Took"}
            </dt>
            <dd className="text-right font-mono tabular-nums text-foreground">
              {formatDuration(row.durationMs)}
            </dd>
          </>
        )}
        {span.queueWaitMs ? (
          <>
            <dt>
              {failedAttempts > 0
                ? `${failedAttempts} failed ${failedAttempts === 1 ? "attempt" : "attempts"}`
                : "Waited for a Worker"}
            </dt>
            <dd className="text-right font-mono tabular-nums text-foreground">
              {formatDuration(span.queueWaitMs)}
            </dd>
          </>
        ) : failedAttempts > 0 ? (
          <>
            <dt>Attempt</dt>
            <dd className="text-right font-mono tabular-nums text-foreground">
              {span.attempt}
            </dd>
          </>
        ) : null}
      </dl>
      {span.error ? (
        <p className="line-clamp-2 rounded-sm bg-destructive/10 px-1.5 py-1 font-mono text-2xs text-foreground">
          {span.error.message}
        </p>
      ) : null}
      <p className="text-2xs text-muted-foreground">
        {row.child
          ? `Click to open ${row.child.workflowId}`
          : "Click to show the input and the output"}
      </p>
    </>
  );
}
