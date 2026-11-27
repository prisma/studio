import { ChevronRight } from "lucide-react";

import type {
  TemporalGroupedSpan,
  TemporalWorkflowExecution,
} from "@/data/temporal";
import { cn } from "@/ui/lib/utils";

import {
  TEMPORAL_SPAN_STATUS,
  TemporalSectionLabel,
  TemporalSpanStatusIcon,
  WorkflowStatusIcon,
} from "./TemporalPrimitives";

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
 * How many other Workflows the Related tab leads to: the root, the parent and
 * the Child Workflows. The other runs of the same Workflow ID are in the Runs tab.
 */
export function relatedRunCount(args: {
  execution: TemporalWorkflowExecution;
  spans: TemporalGroupedSpan[];
}): number {
  const { execution, spans } = args;

  return (
    (rootOf(execution) ? 1 : 0) +
    (execution.parentWorkflowId ? 1 : 0) +
    childrenOf(spans).length
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
 * The Workflows that started each other: the root, the parent, this run, and
 * the Child Workflows it started. With none of them it is one sentence, not an
 * empty box. The other runs of the same Workflow ID are in the Runs tab.
 */
export function TemporalRelatedPanel(props: {
  execution: TemporalWorkflowExecution;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  spans: TemporalGroupedSpan[];
}) {
  const { execution, onOpenExecution, spans } = props;
  const children = childrenOf(spans);
  const root = rootOf(execution);
  const parent = execution.parentWorkflowId;
  const ownDepth = (root ? 1 : 0) + (parent ? 1 : 0);

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
    </div>
  );
}
