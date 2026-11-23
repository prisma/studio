import { Pause, Play, RotateCcw } from "lucide-react";

import type {
  TemporalActivityOperation,
  TemporalActivityPolicy,
  TemporalPendingActivity,
} from "@/data/temporal";
import { projectActivityRetrySchedule } from "@/data/temporal/retry-schedule";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/utils";

import { formatDuration, formatTimeLeft } from "./temporal-utils";
import { TemporalFailurePanel } from "./TemporalFailurePanel";
import { TemporalSectionLabel, useNow } from "./TemporalPrimitives";

/**
 * Live Retry & Timeout Budget Visualizer for a pending or retrying Activity.
 * Shows remaining timeout budgets, countdown to the next attempt, upcoming
 * backoff schedule, and when retries will give up.
 */
export function TemporalPendingActivityCard(props: {
  canAct: boolean;
  isPendingAction: boolean;
  onActivityOperation: (
    activityId: string,
    operation: TemporalActivityOperation,
  ) => void;
  pending: TemporalPendingActivity;
  policy?: TemporalActivityPolicy;
  scheduledTimestamp?: string;
  supportsActivityOperations: boolean;
}) {
  const {
    canAct,
    isPendingAction,
    onActivityOperation,
    pending,
    policy,
    scheduledTimestamp,
    supportsActivityOperations,
  } = props;
  const nowMs = useNow(1_000, !pending.paused);
  const projection = projectActivityRetrySchedule({
    attempt: pending.attempt,
    expirationTimeIso: pending.expirationTime,
    lastHeartbeatIso: pending.lastHeartbeatTime,
    lastStartedIso: pending.lastStartedTime,
    maximumAttempts: pending.maximumAttempts,
    nextAttemptIso: pending.nextAttemptScheduleTime,
    nowMs,
    paused: pending.paused,
    policy,
    scheduledTimeIso: scheduledTimestamp ?? pending.scheduledTime,
    state: pending.state,
  });

  const isRetrying = pending.attempt > 1 || Boolean(pending.lastFailure);

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-border p-3 text-xs"
      data-testid={`temporal-pending-activity-${pending.activityId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono font-medium text-foreground">
          {pending.activityType}
        </span>
        <Badge variant="outline">
          Attempt {pending.attempt}
          {pending.maximumAttempts > 0 ? `/${pending.maximumAttempts}` : ""}
        </Badge>
      </div>

      <div className="text-2xs text-muted-foreground">
        ID{" "}
        <span className="font-mono text-foreground">{pending.activityId}</span>{" "}
        · State{" "}
        <span className="text-foreground">
          {pending.paused ? "Paused" : pending.state}
        </span>
        {pending.taskQueue ? (
          <>
            {" "}
            · Queue{" "}
            <span className="font-mono text-foreground">
              {pending.taskQueue}
            </span>
          </>
        ) : null}
      </div>

      {canAct && supportsActivityOperations ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="xs"
            disabled={isPendingAction}
            onClick={() =>
              onActivityOperation(
                pending.activityId,
                pending.paused ? "unpause" : "pause",
              )
            }
          >
            {pending.paused ? <Play /> : <Pause />}
            {pending.paused ? "Unpause" : "Pause"}
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={isPendingAction}
            title="Start the attempts from one and run the Activity now"
            onClick={() => onActivityOperation(pending.activityId, "reset")}
          >
            <RotateCcw />
            Reset
          </Button>
        </div>
      ) : null}

      {projection.budgets.length > 0 ? (
        <div
          className="flex flex-col gap-2"
          data-testid="temporal-activity-budgets"
        >
          <TemporalSectionLabel>Timeout Budgets</TemporalSectionLabel>
          {projection.budgets.map((budget) => {
            const pct = Math.round(budget.share * 100);
            const barTone =
              budget.share >= 0.9
                ? "bg-destructive"
                : budget.share >= 0.75
                  ? "bg-amber-500"
                  : "bg-prism-cyan-600 dark:bg-prism-cyan-400";
            return (
              <div key={budget.label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-2xs">
                  <span className="text-muted-foreground">{budget.label}</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {budget.leftMs > 0
                      ? `${formatTimeLeft(budget.leftMs)} left`
                      : "expired"}{" "}
                    <span className="text-muted-foreground">
                      / {formatDuration(budget.totalMs)}
                    </span>
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${budget.label} timeout budget`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      barTone,
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {isRetrying || projection.upcoming.length > 0 ? (
        <div
          className="flex flex-col gap-1.5"
          data-testid="temporal-activity-retry-schedule"
        >
          <div className="flex items-baseline justify-between gap-2">
            <TemporalSectionLabel>Retry Schedule</TemporalSectionLabel>
            {!pending.paused && projection.nextAttemptInMs !== undefined ? (
              <span className="font-mono text-2xs tabular-nums text-foreground">
                Next{" "}
                {projection.nextAttemptInMs > 0
                  ? `in ${formatTimeLeft(projection.nextAttemptInMs)}`
                  : "due now"}
              </span>
            ) : null}
          </div>

          {pending.paused ? (
            <p className="text-2xs text-muted-foreground">
              Retries are paused until this Activity is unpaused.
            </p>
          ) : projection.upcoming.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {projection.upcoming.map((step, index) => (
                <span
                  key={step.attempt}
                  className={cn(
                    "inline-flex items-baseline gap-1 rounded border px-1.5 py-0.5 font-mono text-2xs tabular-nums",
                    index === 0
                      ? "border-amber-500/50 bg-amber-500/10 text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground",
                  )}
                >
                  <span className="font-medium text-foreground">
                    #{step.attempt}
                  </span>
                  <span>
                    {index === 0
                      ? step.intervalMs > 0
                        ? `in ${formatTimeLeft(step.intervalMs)}`
                        : "now"
                      : `+${formatDuration(step.intervalMs)}`}
                  </span>
                  {step.isFinal ? (
                    <span className="font-sans text-destructive">final</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}

          <p className="text-2xs text-muted-foreground">
            {projection.givesUpReason === "max-attempts" &&
            projection.givesUpAtMs !== undefined ? (
              <>
                Gives up after attempt{" "}
                <span className="font-mono text-foreground">
                  {pending.maximumAttempts || policy?.maximumAttempts}
                </span>
                {projection.givesUpAtMs > nowMs
                  ? ` (~${formatTimeLeft(projection.givesUpAtMs - nowMs)})`
                  : ""}
                .
              </>
            ) : projection.givesUpReason === "schedule-to-close" &&
              projection.givesUpAtMs !== undefined ? (
              <>
                Gives up at Schedule-to-Close timeout
                {projection.givesUpAtMs > nowMs
                  ? ` (${formatTimeLeft(projection.givesUpAtMs - nowMs)} left)`
                  : ""}
                .
              </>
            ) : (
              "Retries indefinitely (no attempt cap or Schedule-to-Close timeout)."
            )}
          </p>
        </div>
      ) : null}

      {pending.lastFailure ? (
        <TemporalFailurePanel
          attempt={pending.attempt}
          failure={pending.lastFailure}
        />
      ) : null}
    </div>
  );
}
