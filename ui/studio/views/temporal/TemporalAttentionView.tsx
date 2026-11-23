import { CircleCheck, RefreshCw } from "lucide-react";

import type {
  TemporalAttentionItem,
  TemporalAttentionKind,
  TemporalFollowMode,
} from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/ui/table";
import { useTemporalAttention } from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import { formatRelativeTime, pluralize } from "./temporal-utils";
import {
  TemporalFollowControl,
  temporalIconScale,
  TemporalNamespaceBadge,
  TemporalSectionLabel,
  temporalTableHeadClass,
  TemporalTime,
  type TemporalTone,
  WorkflowStatusIcon,
} from "./TemporalPrimitives";

/** The groups in the order a person on call would work through them. */
const GROUPS: Array<{
  description: string;
  kind: TemporalAttentionKind;
  title: string;
  tone: TemporalTone;
}> = [
  {
    description:
      "The Workflow code throws or is not deterministic. These runs make no progress until the code is fixed.",
    kind: "workflow-task-failing",
    title: "Workflow Tasks Failing",
    tone: "danger",
  },
  {
    description:
      "A task waits and no Worker picks it up. Check that Workers poll the Task Queue.",
    kind: "no-worker",
    title: "Waiting for a Worker",
    tone: "danger",
  },
  {
    description:
      "An Activity failed and the server tries it again. It keeps trying until it succeeds or reaches its attempt limit.",
    kind: "activity-retrying",
    title: "Activities Retrying",
    tone: "warning",
  },
  {
    description:
      "These runs take much longer than closed runs of the same Workflow Type.",
    kind: "long-running",
    title: "Running Longer Than Usual",
    tone: "warning",
  },
  {
    description: "Runs that failed or timed out in the last hour.",
    kind: "failed",
    title: "Failed in the Last Hour",
    tone: "muted",
  },
];

const TONE_DOT: Record<TemporalTone, string> = {
  danger: "bg-destructive",
  info: "bg-prism-cyan-500",
  muted: "bg-muted-foreground/50",
  neutral: "bg-prism-cyan-500",
  warning: "bg-amber-500",
};

export function TemporalAttentionView(props: {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
}) {
  const { followMode, namespace, onFollowModeChange, onOpenExecution } = props;
  const { data, error, isError, isFetching, isLoading, refetch } =
    useTemporalAttention({ followMode, namespace });
  const items = data?.items ?? [];
  // One run can have two problems; the summary counts runs.
  const openProblems = new Set(
    items.filter((item) => item.kind !== "failed").map((item) => item.runId),
  ).size;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-attention-view"
    >
      <StudioHeader
        title="Needs Attention"
        endContent={
          <>
            <TemporalFollowControl
              value={followMode}
              onChange={onFollowModeChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-8 px-0"
              aria-label="Refresh"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
          </>
        }
      >
        <TemporalNamespaceBadge namespace={namespace} />
      </StudioHeader>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        {data ? (
          <>
            <span>
              <span className="font-medium tabular-nums text-foreground">
                {openProblems}
              </span>{" "}
              of {pluralize(data.totalRunning, "running workflow")}{" "}
              {openProblems === 1 ? "needs" : "need"} attention
            </span>
            {data.checkedRunning < data.totalRunning ? (
              <span>
                Checked the {data.checkedRunning.toLocaleString("en-US")} oldest
              </span>
            ) : null}
            <span className="ml-auto">
              Checked{" "}
              {formatRelativeTime(
                new Date(Date.now() - data.ageMs).toISOString(),
              )}
            </span>
          </>
        ) : (
          <span>Checking every running workflow</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <p className="font-medium text-destructive">
              {error instanceof Error
                ? error.message
                : "Could not check the running workflows"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <CircleCheck className="size-6 opacity-60" />
            <p>
              No running workflow in{" "}
              <code className="font-mono text-foreground">{namespace}</code>{" "}
              needs attention.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {GROUPS.map((group) => {
              const groupItems = items.filter(
                (item) => item.kind === group.kind,
              );

              return groupItems.length > 0 ? (
                <AttentionGroup
                  key={group.kind}
                  description={group.description}
                  dotClassName={TONE_DOT[group.tone]}
                  items={groupItems}
                  kind={group.kind}
                  onOpenExecution={onOpenExecution}
                  title={group.title}
                />
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AttentionGroup(props: {
  description: string;
  dotClassName: string;
  items: TemporalAttentionItem[];
  kind: TemporalAttentionKind;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  title: string;
}) {
  const { description, dotClassName, items, kind, onOpenExecution, title } =
    props;
  // Some servers report only when the next attempt is due, not when the last one ended.
  const showNextAttempt =
    kind === "activity-retrying" && items.every((item) => !item.since);
  // The longest-standing problem first.
  const sorted = [...items].sort((a, b) =>
    kind === "failed"
      ? (b.since ?? "").localeCompare(a.since ?? "")
      : (a.since ?? "").localeCompare(b.since ?? ""),
  );

  return (
    <section
      className="border-b border-border"
      data-testid={`temporal-attention-${kind}`}
    >
      <div className="flex flex-col gap-0.5 bg-muted/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", dotClassName)}
          />
          <TemporalSectionLabel className="text-foreground">
            {title}
          </TemporalSectionLabel>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {items.length}
          </span>
        </div>
        <p className="pl-4 text-2xs text-muted-foreground">{description}</p>
      </div>
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="border-border/70 hover:bg-transparent">
            <TableHead className={cn(temporalTableHeadClass, "w-[26%] pl-4")}>
              Workflow
            </TableHead>
            <TableHead className={temporalTableHeadClass}>Problem</TableHead>
            <TableHead className={cn(temporalTableHeadClass, "w-28")}>
              {kind === "failed"
                ? "Closed"
                : showNextAttempt
                  ? "Next Attempt"
                  : kind === "activity-retrying"
                    ? "Last Attempt"
                    : "Since"}
            </TableHead>
            <TableHead className={cn(temporalTableHeadClass, "w-24 pr-4")}>
              Queue
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item, index) => (
            <TableRow
              key={`${item.runId}:${item.activityType ?? ""}:${index}`}
              className="cursor-pointer border-border/60 hover:bg-muted/30"
              onClick={() => onOpenExecution(item.workflowId, item.runId)}
            >
              <TableCell className="max-w-0 py-1.5 pr-2 pl-4">
                <button
                  type="button"
                  className="flex h-6 max-w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={`${item.workflowId} (${item.workflowType})`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenExecution(item.workflowId, item.runId);
                  }}
                >
                  <WorkflowStatusIcon status={item.status} />
                  {/* The ID keeps its room; the type gives way first. */}
                  <span className="min-w-12 shrink truncate font-mono text-foreground hover:underline">
                    {item.workflowId}
                  </span>
                  <span className="min-w-0 shrink-[4] truncate text-muted-foreground">
                    {item.workflowType}
                  </span>
                </button>
              </TableCell>
              <TableCell className="max-w-0 px-2 py-2">
                <span className="block truncate" title={item.detail}>
                  {kind === "activity-retrying" ? (
                    <>
                      <span className="font-mono font-medium text-foreground">
                        {item.activityType}
                      </span>{" "}
                      <span className="text-foreground">
                        attempt {item.attempt}
                        {item.maximumAttempts
                          ? ` of ${item.maximumAttempts}`
                          : ""}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {item.detail}
                        {!showNextAttempt &&
                        item.nextAttemptTime &&
                        Date.parse(item.nextAttemptTime) > Date.now()
                          ? ` · next attempt ${formatRelativeTime(item.nextAttemptTime)}`
                          : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-foreground">{item.detail}</span>
                  )}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                <TemporalTime
                  iso={showNextAttempt ? item.nextAttemptTime : item.since}
                />
              </TableCell>
              <TableCell className="py-2 pr-4 pl-2 font-mono text-muted-foreground">
                {item.taskQueue}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
