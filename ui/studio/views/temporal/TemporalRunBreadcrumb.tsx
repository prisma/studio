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

import {
  TemporalTime,
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

const linkClassName =
  "rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function CopyButton(props: {
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
 * Where a run is: its Workflow Type, its Workflow ID, and which run of that ID
 * it is. Each part leads somewhere:
 *
 * - the type opens the runs of that type, and the icon beside it its diagram;
 * - the Workflow ID opens every run of that ID;
 * - the run opens a list of the runs of the ID, to move to another one.
 *
 * A run read from a history file is not on the server, so its parts are text.
 */
export function TemporalRunBreadcrumb(props: {
  className?: string;
  execution: TemporalWorkflowExecution;
  isImported?: boolean;
  namespace: string;
  onOpenRun: (runId: string) => void;
  /** How many runs the Workflow ID has, when the server said. */
  runCount?: number;
  /** The runs of this Workflow ID, newest first. Undefined while they load. */
  runs?: TemporalWorkflowExecution[];
}) {
  const { className, execution, isImported, namespace, onOpenRun, runs } =
    props;
  const { createUrl } = useNavigation();
  const { runId, workflowId, workflowType } = execution;
  const workflowsUrl = (filter: string) =>
    createUrl({
      searchParam: filter,
      temporalNsParam: namespace,
      temporalSectionParam: "workflows",
      viewParam: "temporal",
    });
  const chainUrl = createUrl({
    temporalNsParam: namespace,
    temporalSectionParam: "workflow",
    temporalWfParam: workflowId,
    viewParam: "temporal",
  });
  const total = Math.max(props.runCount ?? 0, runs?.length ?? 0);
  const position = runs ? runPosition(runs, runId, total) : null;
  const shortRunId = runId.slice(0, 8);

  return (
    <nav
      aria-label="Where this run is"
      className={cn("flex min-w-0 items-center gap-1.5", className)}
      data-testid="temporal-run-breadcrumb"
    >
      <span className="flex min-w-0 shrink-0 items-center gap-0.5 font-sans text-sm font-semibold text-foreground">
        {isImported ? (
          <span title={workflowType}>{workflowType}</span>
        ) : (
          <>
            <a
              className={linkClassName}
              data-testid="temporal-crumb-type"
              href={workflowsUrl(
                `WorkflowType = ${quoteFilterValue(workflowType)}`,
              )}
              title={`Workflow Type ${workflowType}: open its executions`}
            >
              {workflowType}
            </a>
            <Button
              asChild
              variant="ghost"
              size="xs"
              className="w-6 px-0 text-muted-foreground"
            >
              <a
                aria-label={`Open the diagram of ${workflowType}`}
                data-testid="temporal-type-link"
                href={createUrl({
                  temporalNsParam: namespace,
                  temporalSectionParam: "types",
                  temporalTypeParam: workflowType,
                  viewParam: "temporal",
                })}
                title={`Open the diagram of ${workflowType}`}
              >
                <Waypoints />
              </a>
            </Button>
          </>
        )}
      </span>

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
        <CopyButton
          label={`Copy workflow ID ${workflowId}`}
          toastText="Copied Workflow ID"
          value={workflowId}
        />
      </span>

      <Separator />

      <span className="flex shrink-0 items-center gap-0.5 font-mono text-xs">
        {!isImported && runs && runs.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                aria-label={`Run ${shortRunId}${position ? `, run ${position} of ${total}` : ""}. Open another run of this Workflow ID`}
                className="gap-1.5 font-mono font-normal"
                data-testid="temporal-run-switcher"
              >
                <span className="text-foreground">Run {shortRunId}</span>
                {position ? (
                  <span className="font-sans text-muted-foreground">
                    {position} of {total.toLocaleString("en-US")}
                  </span>
                ) : null}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
                Runs of {workflowId}, newest first
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
                    <span className="font-mono text-foreground">
                      {run.runId.slice(0, 8)}
                    </span>
                    <span className="text-muted-foreground">
                      {workflowStatusLabel(run.status)}
                    </span>
                    <TemporalTime
                      className="ml-auto text-2xs text-muted-foreground"
                      iso={run.startTime}
                    />
                  </DropdownMenuItem>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="text-xs">
                <a href={chainUrl}>
                  View all {total.toLocaleString("en-US")} runs
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span
            aria-current="page"
            className="px-1 text-foreground"
            title={`Run ID: ${runId}`}
          >
            Run {shortRunId}
            {!isImported && runs?.length === 1 ? (
              <span className="ml-1.5 font-sans text-muted-foreground">
                the only run
              </span>
            ) : null}
          </span>
        )}
        <CopyButton
          label={`Copy run ID ${runId}`}
          toastText="Copied Run ID"
          value={runId}
        />
      </span>
    </nav>
  );
}
