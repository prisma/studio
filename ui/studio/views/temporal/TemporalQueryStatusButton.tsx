import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/utils";

import { formatDuration } from "./temporal-utils";

/** What the server works on for the user: the rows of a query, or the count of its matches. */
export type TemporalQueryPhase = "count" | "rows";

const PHASE_LABEL: Record<TemporalQueryPhase, string> = {
  count: "Counting matches",
  rows: "Loading rows",
};

/** How long the button shows what the last query took. */
const SHOW_DURATION_MS = 2_500;

function formatElapsed(ms: number): string {
  const seconds = ms / 1_000;

  return seconds < 10
    ? `${seconds.toFixed(1)}s`
    : seconds < 60
      ? `${Math.floor(seconds)}s`
      : formatDuration(ms);
}

/**
 * The refresh button of a list. While a query that the user asked for runs,
 * it is a status in the same place: what the server works on, and for how
 * long. When the query ends it shows for a moment how long the query took.
 *
 * A background poll is not such a query: it only spins the refresh icon.
 */
export function TemporalQueryStatusButton(props: {
  isError: boolean;
  /** A background poll is on its way. */
  isPolling: boolean;
  onRefresh: () => void;
  /** Null while no query that the user asked for runs. */
  phase: TemporalQueryPhase | null;
  /** Changes when the user asks for something else, so the time starts again. */
  queryKey: string;
}) {
  const { isError, isPolling, onRefresh, phase, queryKey } = props;
  const isRunning = phase !== null;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tookMs, setTookMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const start = Date.now();
    const timer = setInterval(() => setNow(Date.now()), 100);

    setStartedAt(start);
    setNow(start);
    setTookMs(null);

    return () => {
      clearInterval(timer);
      setStartedAt(null);
      setTookMs(Date.now() - start);
    };
  }, [isRunning, queryKey]);

  useEffect(() => {
    if (tookMs === null) {
      return;
    }

    const timer = setTimeout(() => setTookMs(null), SHOW_DURATION_MS);

    return () => clearTimeout(timer);
  }, [tookMs]);

  if (phase !== null) {
    return (
      <div
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 font-sans text-xs text-foreground shadow-xs"
        data-phase={phase}
        data-testid="temporal-query-status"
        role="status"
      >
        <Loader2
          aria-hidden
          className="size-3.5 text-muted-foreground motion-safe:animate-spin"
        />
        {/* A narrow page keeps the time and drops the words. */}
        <span className="@max-2xl:sr-only">{PHASE_LABEL[phase]}</span>
        {/* The time changes ten times a second; a screen reader hears the words only. */}
        <span
          aria-hidden
          className="min-w-8 text-right font-mono tabular-nums text-muted-foreground"
        >
          {formatElapsed(startedAt === null ? 0 : now - startedAt)}
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-8 px-0"
        aria-label="The query failed. Run it again"
        onClick={onRefresh}
      >
        <AlertTriangle className="text-destructive" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(tookMs === null ? "w-8 px-0" : "gap-1.5 px-2.5")}
      aria-label={
        tookMs === null
          ? "Refresh workflows"
          : `Refresh workflows. The last query took ${formatDuration(tookMs)}`
      }
      onClick={onRefresh}
    >
      {tookMs === null ? (
        <RefreshCw className={cn(isPolling && "motion-safe:animate-spin")} />
      ) : (
        <>
          <Check className="text-muted-foreground" />
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatDuration(tookMs)}
          </span>
        </>
      )}
    </Button>
  );
}
