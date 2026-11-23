/** A span of time on the timeline, in milliseconds from the start of the run. */
export interface TimelineInterval {
  durationMs: number;
  /** True for a span in which the Workflow only waits, such as a Timer. */
  idle?: boolean;
  startOffsetMs: number;
}

/** A stretch in which nothing starts or ends, drawn at a fixed small width. */
export interface TimelineGap {
  durationMs: number;
  endFraction: number;
  startFraction: number;
}

export interface TimelineScale {
  gaps: TimelineGap[];
  /** Where a point in time sits on the axis, from 0 (start) to 1 (end). */
  toFraction: (offsetMs: number) => number;
  /** The point in time at a position on the axis: the inverse of `toFraction`. */
  toOffsetMs: (fraction: number) => number;
  totalDurationMs: number;
}

/** A quiet stretch must be this long before the timeline shortens it. */
const MIN_GAP_MS = 10_000;
/** ...and, when the Workflow only waits in it, this large a share of the run's work. */
const MIN_GAP_SHARE = 0.25;
/** A stretch with work in it is shortened only when it is this many times longer than the rest. */
const DOMINANT_FACTOR = 3;
/** The share of the busy width that one shortened stretch takes. */
const GAP_WIDTH_SHARE = 0.1;
/** All shortened stretches together take at most this share of the busy width. */
const MAX_GAPS_WIDTH_SHARE = 0.6;

interface Piece {
  collapsed: boolean;
  endMs: number;
  startMs: number;
  weight: number;
  /** No Activity or Child Workflow runs in this piece: the Workflow only waits. */
  waiting: boolean;
}

/**
 * Maps time to a position on the timeline. With `collapseIdle`, a long stretch
 * in which no span starts or ends takes a small fixed width, so one 30-minute
 * timer does not flatten every Activity around it into a dot.
 *
 * Two kinds of stretch are shortened: one in which the Workflow only waits
 * and that is long next to all the work of the run (every sleep of a
 * subscription that bills once a month), and one that is long next to
 * everything else on the timeline (an Activity that has retried for hours).
 */
export function buildTimelineScale(
  intervals: TimelineInterval[],
  totalDurationMs: number,
  options: { collapseIdle: boolean },
): TimelineScale {
  const total = Math.max(1, totalDurationMs);
  const boundaries = new Set<number>([0, total]);

  for (const interval of intervals) {
    const start = Math.min(total, Math.max(0, interval.startOffsetMs));
    const end = Math.min(total, start + Math.max(0, interval.durationMs));

    boundaries.add(start);
    boundaries.add(end);
  }

  const points = [...boundaries].sort((a, b) => a - b);
  const work = intervals
    .filter((interval) => !interval.idle && interval.durationMs > 0)
    .map((interval) => ({
      end: interval.startOffsetMs + interval.durationMs,
      start: interval.startOffsetMs,
    }));
  const pieces: Piece[] = [];

  for (let index = 1; index < points.length; index++) {
    const startMs = points[index - 1]!;
    const endMs = points[index]!;

    pieces.push({
      collapsed: false,
      endMs,
      startMs,
      waiting: !work.some((span) => span.start < endMs && span.end > startMs),
      weight: endMs - startMs,
    });
  }

  // Shortening a stretch only helps when another span lies outside it.
  const hasSpanOutside = (piece: Piece) =>
    intervals.some((interval) => {
      const start = interval.startOffsetMs;
      const end = start + Math.max(0, interval.durationMs);

      return end <= piece.startMs || start >= piece.endMs;
    });

  if (options.collapseIdle) {
    const workMs = pieces
      .filter((piece) => !piece.waiting)
      .reduce((sum, piece) => sum + piece.weight, 0);
    let busyMs = total;

    if (workMs > 0) {
      for (const piece of pieces) {
        const length = piece.endMs - piece.startMs;

        if (
          piece.waiting &&
          length >= MIN_GAP_MS &&
          length > workMs * MIN_GAP_SHARE &&
          hasSpanOutside(piece)
        ) {
          piece.collapsed = true;
          busyMs -= length;
        }
      }
    }

    // Longest first: each shortened stretch lowers the bar for the next one.
    for (const piece of pieces
      .filter((candidate) => !candidate.collapsed)
      .sort((a, b) => b.weight - a.weight)) {
      const length = piece.endMs - piece.startMs;
      const restMs = busyMs - length;

      if (length < MIN_GAP_MS || length <= restMs * DOMINANT_FACTOR) {
        break;
      }

      if (!hasSpanOutside(piece)) {
        continue;
      }

      piece.collapsed = true;
      busyMs = restMs;
    }

    const gapCount = pieces.filter((piece) => piece.collapsed).length;
    const gapWeight = Math.max(
      1,
      busyMs * Math.min(GAP_WIDTH_SHARE, MAX_GAPS_WIDTH_SHARE / gapCount),
    );

    for (const piece of pieces) {
      if (piece.collapsed) {
        piece.weight = gapWeight;
      }
    }
  }

  const totalWeight = pieces.reduce((sum, piece) => sum + piece.weight, 0) || 1;
  const starts: number[] = [];
  let walked = 0;

  for (const piece of pieces) {
    starts.push(walked / totalWeight);
    walked += piece.weight;
  }

  const toFraction = (offsetMs: number): number => {
    const at = Math.min(total, Math.max(0, offsetMs));
    let low = 0;
    let high = pieces.length - 1;

    while (low < high) {
      const middle = (low + high) >> 1;

      if (pieces[middle]!.endMs < at) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    const piece = pieces[low];

    if (!piece) {
      return 0;
    }

    const length = piece.endMs - piece.startMs;
    const within = length > 0 ? (at - piece.startMs) / length : 0;

    return starts[low]! + (within * piece.weight) / totalWeight;
  };

  const toOffsetMs = (fraction: number): number => {
    const at = Math.min(1, Math.max(0, fraction));
    let index = pieces.length - 1;

    while (index > 0 && starts[index]! > at) {
      index--;
    }

    const piece = pieces[index];

    if (!piece) {
      return 0;
    }

    const width = piece.weight / totalWeight;
    const within = width > 0 ? Math.min(1, (at - starts[index]!) / width) : 0;

    return piece.startMs + within * (piece.endMs - piece.startMs);
  };

  return {
    gaps: pieces
      .filter((piece) => piece.collapsed)
      .map((piece) => ({
        durationMs: piece.endMs - piece.startMs,
        endFraction: toFraction(piece.endMs),
        startFraction: toFraction(piece.startMs),
      })),
    toFraction,
    toOffsetMs,
    totalDurationMs: total,
  };
}
