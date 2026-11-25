import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Waypoints,
} from "lucide-react";
import { toast } from "sonner";

import type { TemporalWorkflowExecution } from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { cn } from "@/ui/lib/utils";

import { formatAbsoluteTime, formatRelativeTime } from "./temporal-utils";
import {
  useTemporalTimeFormat,
  WorkflowStatusIcon,
  workflowStatusLabel,
} from "./TemporalPrimitives";

/** A value inside a List Filter's quotes. */
export function quoteFilterValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * Which run of its Workflow ID a run is, counted from the oldest: 3 for the
 * third. `runs` holds the newest runs first and may hold fewer than `total`.
 */
export function runPosition(
  runs: Array<Pick<TemporalWorkflowExecution, "runId">>,
  runId: string,
  total: number,
): number | null {
  const index = runs.findIndex((run) => run.runId === runId);

  return index < 0 ? null : total - index;
}

/**
 * A run ID that still tells runs apart when it is cut: run IDs made close in
 * time start with the same characters and differ at the end.
 */
export function compactRunId(runId: string): string {
  return runId.length > 14 ? `${runId.slice(0, 8)}…${runId.slice(-4)}` : runId;
}

const linkClassName =
  "rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** An icon button that copies a value and confirms it with a toast. */
export function TemporalCopyButton(props: {
  label: string;
  toastText: string;
  value: string;
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      aria-label={props.label}
      title={props.label}
      className="w-6 shrink-0 px-0 text-muted-foreground"
      onClick={() => {
        void navigator.clipboard.writeText(props.value);
        toast.success(props.toastText);
      }}
    >
      <Copy />
    </Button>
  );
}

function Separator() {
  return (
    <ChevronRight
      aria-hidden
      className="size-3 shrink-0 text-muted-foreground/70"
    />
  );
}

/**
 * The first part of a run's path: its Workflow Type, which opens the type's
 * diagram on Workflow Types. A run read from a history file has no type on
 * the server, so its type is text.
 */
export function TemporalTypeCrumb(props: {
  isImported?: boolean;
  namespace: string;
  workflowType: string;
}) {
  const { isImported, namespace, workflowType } = props;
  const { createUrl } = useNavigation();

  if (isImported) {
    return (
      <span
        className="min-w-0 shrink truncate font-mono text-xs text-muted-foreground"
        title={workflowType}
      >
        {workflowType}
      </span>
    );
  }

  return (
    <a
      className={cn(
        linkClassName,
        "flex min-w-0 shrink-[3] items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground",
      )}
      data-testid="temporal-crumb-type"
      href={createUrl({
        temporalNsParam: namespace,
        temporalSectionParam: "types",
        temporalTypeParam: workflowType,
        viewParam: "temporal",
      })}
      title={`Workflow Type ${workflowType}: open its diagram`}
    >
      <Waypoints aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{workflowType}</span>
    </a>
  );
}

/**
 * Where a run is, as a path from the general to the particular: its Workflow
 * Type, its Workflow ID, and which run of that ID it is. The left menu shows
 * the screen the run was opened from, so the path does not repeat it. Each
 * part leads somewhere:
 *
 * - the Workflow Type opens its diagram;
 * - the Workflow ID opens every run of that ID;
 * - the run opens a list of the runs of the ID, to move to another one.
 *
 * A run read from a history file is not on the server, so its parts are text.
 */
export function TemporalRunBreadcrumb(props: {
  className?: string;
  execution: TemporalWorkflowExecution;
  isImported?: boolean;
  /** True when the Workflow ID has more runs than `runs` holds. */
  hasMoreRuns?: boolean;
  namespace: string;
  onOpenRun: (runId: string) => void;
  /** How many runs the Workflow ID has, when the server counted them. */
  runCount?: number;
  /** The newest runs of this Workflow ID, newest first. Undefined while they load. */
  runs?: TemporalWorkflowExecution[];
}) {
  const {
    className,
    execution,
    hasMoreRuns,
    isImported,
    namespace,
    onOpenRun,
    runs,
  } = props;
  const { createUrl } = useNavigation();
  const [timeFormat] = useTemporalTimeFormat();
  const { runId, workflowId } = execution;
  const chainUrl = createUrl({
    temporalNsParam: namespace,
    temporalSectionParam: "workflow",
    temporalWfParam: workflowId,
    viewParam: "temporal",
  });
  // With more runs than the list holds, only the server's count is a total.
  const total = hasMoreRuns ? props.runCount : (runs?.length ?? 0);
  const position =
    runs && total !== undefined ? runPosition(runs, runId, total) : null;
  const shortRunId = compactRunId(runId);
  const place =
    total === undefined
      ? `one of ${(runs?.length ?? 0).toLocaleString("en-US")}+ runs`
      : position
        ? `${position.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`
        : `one of ${total.toLocaleString("en-US")} runs`;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex min-w-0 items-center gap-1.5", className)}
      data-testid="temporal-run-breadcrumb"
    >
      <TemporalTypeCrumb
        isImported={isImported}
        namespace={namespace}
        workflowType={execution.workflowType}
      />
      <Separator />

      <span className="flex min-w-0 items-center gap-0.5 font-mono text-xs text-foreground">
        {isImported ? (
          <span className="truncate" title={workflowId}>
            {workflowId}
          </span>
        ) : (
          <a
            className={cn(linkClassName, "truncate")}
            data-testid="temporal-crumb-workflow-id"
            href={chainUrl}
            title={`Workflow ID ${workflowId}: view all runs of this ID`}
          >
            {workflowId}
          </a>
        )}
        <TemporalCopyButton
          label={`Copy workflow ID ${workflowId}`}
          toastText="Copied Workflow ID"
          value={workflowId}
        />
      </span>

      <Separator />

      {/* The run is what this page shows, so it is the page's heading. */}
      <h1 className="flex shrink-0 items-center gap-0.5 font-mono text-xs font-normal">
        {!isImported && runs && runs.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                aria-label={`Run ${runId}, ${place}. Open another run of this Workflow ID`}
                className="gap-1.5 font-mono font-normal"
                data-testid="temporal-run-switcher"
              >
                <span className="text-foreground">Run {shortRunId}</span>
                <span className="font-sans text-muted-foreground">{place}</span>
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[26rem] max-w-[calc(100vw-2rem)]"
            >
              <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
                {hasMoreRuns
                  ? `The newest ${runs.length.toLocaleString("en-US")} runs of ${workflowId}`
                  : `Runs of ${workflowId}, newest first`}
              </DropdownMenuLabel>
              <div className="max-h-72 overflow-y-auto">
                {runs.map((run) => (
                  <DropdownMenuItem
                    key={run.runId}
                    aria-current={run.runId === runId ? "true" : undefined}
                    className="gap-2 text-xs"
                    onSelect={() => {
                      if (run.runId !== runId) {
                        onOpenRun(run.runId);
                      }
                    }}
                  >
                    <Check
                      aria-hidden
                      className={cn(
                        "size-3 shrink-0",
                        run.runId === runId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <WorkflowStatusIcon status={run.status} />
                    <span
                      className="shrink-0 font-mono text-foreground"
                      title={run.runId}
                    >
                      {compactRunId(run.runId)}
                    </span>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {workflowStatusLabel(run.status)}
                    </span>
                    {/* To the second: runs of one ID often start within the same minute. */}
                    <time
                      className="ml-auto shrink-0 font-mono text-2xs text-muted-foreground tabular-nums"
                      dateTime={run.startTime}
                      title={`Started ${formatRelativeTime(run.startTime)}`}
                    >
                      {formatAbsoluteTime(
                        run.startTime,
                        timeFormat === "utc" ? "utc" : "local",
                      )}
                    </time>
                  </DropdownMenuItem>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="text-xs">
                <a href={chainUrl}>
                  {total === undefined
                    ? "View all runs"
                    : `View all ${total.toLocaleString("en-US")} runs`}
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span
            aria-current="page"
            className="px-1 text-foreground"
            title={
              !isImported && runs?.length === 1
                ? `Run ID: ${runId}, the only run of ${workflowId}`
                : `Run ID: ${runId}`
            }
          >
            Run {shortRunId}
          </span>
        )}
        <TemporalCopyButton
          label={`Copy run ID ${runId}`}
          toastText="Copied Run ID"
          value={runId}
        />
      </h1>
    </nav>
  );
}
