import { ChevronRight } from "lucide-react";

import type {
  TemporalGroupedSpan,
  TemporalWorkflowExecution,
} from "@/data/temporal";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { cn } from "@/ui/lib/utils";

import {
  TEMPORAL_SPAN_STATUS,
  TemporalSectionLabel,
  TemporalSpanStatusIcon,
  TemporalTime,
  WorkflowStatusIcon,
  workflowStatusLabel,
} from "./TemporalPrimitives";
import { compactRunId } from "./TemporalRunBreadcrumb";

function childrenOf(spans: TemporalGroupedSpan[]): TemporalGroupedSpan[] {
  return spans.filter((span) => span.kind === "child-workflow");
}

/** The root of the tree, when it is neither this run nor its parent. */
function rootOf(execution: TemporalWorkflowExecution): string | undefined {
  return execution.rootWorkflowId &&
    execution.rootRunId !== execution.runId &&
    execution.rootRunId !== execution.parentRunId
    ? execution.rootWorkflowId
    : undefined;
}

/**
 * How many other runs the Related tab leads to: the root, the parent, the
 * Child Workflows, and the other runs of the Workflow ID.
 */
export function relatedRunCount(args: {
  execution: TemporalWorkflowExecution;
  /** How many runs the Workflow ID has, when the server counted more than `runs` holds. */
  runCount?: number;
  runs?: TemporalWorkflowExecution[];
  spans: TemporalGroupedSpan[];
}): number {
  const { execution, runCount, runs, spans } = args;

  return (
    (rootOf(execution) ? 1 : 0) +
    (execution.parentWorkflowId ? 1 : 0) +
    childrenOf(spans).length +
    Math.max(0, (runCount ?? runs?.length ?? 1) - 1)
  );
}

/** One Workflow in the tree. Without `onOpen` it is the run on screen. */
function TreeRow(props: {
  caption: string;
  depth: number;
  icon?: React.ReactNode;
  onOpen?: () => void;
  title: string;
}) {
  const { caption, depth, icon, onOpen, title } = props;
  const content = (
    <>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-mono text-foreground">{title}</span>
        <span className="text-2xs text-muted-foreground">{caption}</span>
      </span>
      {onOpen ? (
        <ChevronRight
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      ) : null}
    </>
  );
  const className = "flex w-full items-center gap-2 px-2.5 py-2 text-left";

  return (
    // The indent and the line at its left show which Workflow started which.
    <li
      className={cn(depth > 0 && "border-l border-border")}
      style={{ marginLeft: depth * 14 }}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            className,
            "rounded-md hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
          )}
        >
          {content}
        </button>
      ) : (
        <div
          aria-current="true"
          className={cn(className, "rounded-md bg-muted/60")}
        >
          {content}
        </div>
      )}
    </li>
  );
}

/**
 * The runs a run is related to, in two groups. The tree holds the Workflows
 * that started each other: the root, the parent, this run, and the Child
 * Workflows it started. The list holds the other runs of the same Workflow ID.
 * A group with nothing in it is one sentence, not an empty box.
 */
export function TemporalRelatedPanel(props: {
  execution: TemporalWorkflowExecution;
  /** True when the Workflow ID has more runs than `runs` holds. */
  hasMoreRuns?: boolean;
  isLoadingRuns: boolean;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  /** How many runs the Workflow ID has, when the server counted them. */
  runCount?: number;
  /** The newest runs of this Workflow ID, newest first. */
  runs?: TemporalWorkflowExecution[];
  spans: TemporalGroupedSpan[];
  /** The Workflows list with every run of this Workflow ID. */
  workflowIdUrl: string;
}) {
  const {
    execution,
    hasMoreRuns,
    isLoadingRuns,
    onOpenExecution,
    runs,
    spans,
    workflowIdUrl,
  } = props;
  const children = childrenOf(spans);
  const root = rootOf(execution);
  const parent = execution.parentWorkflowId;
  const ownDepth = (root ? 1 : 0) + (parent ? 1 : 0);
  // With more runs than the list holds, only the server's count is a total.
  const total = hasMoreRuns ? props.runCount : (runs?.length ?? 0);

  return (
    <div className="flex flex-col gap-5 text-xs" data-testid="temporal-related">
      <section className="flex flex-col gap-1.5">
        <TemporalSectionLabel>Parent and Child Workflows</TemporalSectionLabel>
        {!root && !parent && children.length === 0 ? (
          <p className="text-muted-foreground">
            No Workflow started this run, and it started no Child Workflow.
          </p>
        ) : (
          <>
            <ul
              className="flex flex-col gap-0.5"
              data-testid="temporal-related-tree"
            >
              {root ? (
                <TreeRow
                  caption="Root: started the first Workflow of this tree"
                  depth={0}
                  onOpen={() => onOpenExecution(root, execution.rootRunId)}
                  title={root}
                />
              ) : null}
              {parent ? (
                <TreeRow
                  caption="Parent: started this run"
                  depth={root ? 1 : 0}
                  onOpen={() => onOpenExecution(parent, execution.parentRunId)}
                  title={parent}
                />
              ) : null}
              <TreeRow
                caption={`This run · ${execution.workflowType}`}
                depth={ownDepth}
                icon={<WorkflowStatusIcon status={execution.status} />}
                title={execution.workflowId}
              />
              {children.map((span) => (
                <TreeRow
                  key={span.id}
                  caption={`Child · ${span.label.replace(/^Child: /, "")} · ${TEMPORAL_SPAN_STATUS[span.status].label}`}
                  depth={ownDepth + 1}
                  icon={<TemporalSpanStatusIcon status={span.status} />}
                  onOpen={
                    span.childWorkflowId
                      ? () =>
                          onOpenExecution(
                            span.childWorkflowId!,
                            span.childRunId,
                          )
                      : undefined
                  }
                  title={span.childWorkflowId ?? "Not started"}
                />
              ))}
            </ul>
            {children.length === 0 ? (
              <p className="text-2xs text-muted-foreground">
                This run started no Child Workflow.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <TemporalSectionLabel>
          Runs of This Workflow ID
          {total !== undefined && total > 1
            ? ` (${total.toLocaleString("en-US")})`
            : ""}
        </TemporalSectionLabel>
        {isLoadingRuns ? (
          <Skeleton className="h-9 w-full" />
        ) : !runs || runs.length <= 1 ? (
          <p className="text-muted-foreground">
            This is the only run of{" "}
            <span className="font-mono text-foreground">
              {execution.workflowId}
            </span>
            . A retry, a Continue-As-New or a new start with the same ID would
            add a run here.
          </p>
        ) : (
          <>
            {hasMoreRuns ? (
              <p className="text-2xs text-muted-foreground">
                The newest {runs.length.toLocaleString("en-US")}
                {total === undefined
                  ? ""
                  : ` of ${total.toLocaleString("en-US")}`}{" "}
                runs.
              </p>
            ) : null}
            <ul
              className="flex flex-col gap-0.5"
              data-testid="temporal-related-runs"
            >
              {runs.map((run) => {
                const isCurrent = run.runId === execution.runId;
                const content = (
                  <>
                    <WorkflowStatusIcon status={run.status} />
                    <span
                      className="shrink-0 font-mono text-foreground"
                      title={run.runId}
                    >
                      {compactRunId(run.runId)}
                    </span>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {isCurrent ? "This run" : workflowStatusLabel(run.status)}
                    </span>
                    <TemporalTime
                      className="ml-auto shrink-0 text-2xs text-muted-foreground"
                      iso={run.startTime}
                    />
                    {isCurrent ? null : (
                      <ChevronRight
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    )}
                  </>
                );
                const className =
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left";

                return (
                  <li key={run.runId}>
                    {isCurrent ? (
                      <div
                        aria-current="true"
                        className={cn(className, "bg-muted/60 pr-8")}
                      >
                        {content}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenExecution(run.workflowId, run.runId)
                        }
                        className={cn(
                          className,
                          "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                        )}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <a
              className="text-2xs font-medium text-foreground underline underline-offset-2 hover:no-underline"
              href={workflowIdUrl}
            >
              {total === undefined
                ? "View all runs"
                : `View all ${total.toLocaleString("en-US")} runs`}
            </a>
          </>
        )}
      </section>
    </div>
  );
}
