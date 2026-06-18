import { Check, Play, RefreshCw, RotateCcw, ThumbsDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  WorkflowApproval,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowDeadLetter,
  WorkflowExecutionOverlay,
  WorkflowIngestEvent,
  WorkflowRun,
  WorkflowRunStep,
  WorkflowStudioProvider,
  WorkflowStudioWorkflow,
} from "@/data/workflows";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/components/ui/alert-dialog";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/ui/table";
import { Textarea } from "@/ui/components/ui/textarea";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useWorkflows } from "@/ui/hooks/use-workflows";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import type { ViewProps } from "../View";
import {
  formatWorkflowDate,
  formatWorkflowDuration,
  formatWorkflowStatus,
  getWorkflowStatusTone,
} from "./workflow-status";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { WorkflowJsonInspector } from "./WorkflowJsonInspector";

type WorkflowTab = "approvals" | "canvas" | "deadLetters" | "ingest" | "runs";
type WorkflowAction = "approve" | "reject" | "replay" | "runWorker";

const workflowTabs: ReadonlyArray<{ id: WorkflowTab; label: string }> = [
  { id: "canvas", label: "Canvas" },
  { id: "runs", label: "Runs" },
  { id: "approvals", label: "Approvals" },
  { id: "ingest", label: "Ingest events" },
  { id: "deadLetters", label: "Dead letters" },
];

interface PendingApprovalAction {
  action: "approve" | "reject";
  approval: WorkflowApproval;
}

export function WorkflowView(_props: ViewProps) {
  const {
    createUrl,
    workflowFrameParam,
    workflowParam,
    workflowRunParam,
    workflowTabParam,
  } = useNavigation();
  const { data, error, isFetching, provider, refetch } = useWorkflows();
  const [pendingApprovalAction, setPendingApprovalAction] =
    useState<PendingApprovalAction | null>(null);
  const [approvalReason, setApprovalReason] = useState("");
  const [pendingReplayRun, setPendingReplayRun] = useState<WorkflowRun | null>(
    null,
  );
  const workflow = resolveWorkflow(data.workflows, workflowParam);
  const activeTab = resolveWorkflowTab(workflowTabParam);
  const selectedRun = workflow
    ? (workflow.runs.find((run) => run.id === workflowRunParam) ??
      workflow.runs[0])
    : undefined;
  const selectedRunFrames = workflow
    ? workflow.timelineFrames.filter((frame) => {
        return selectedRun ? frame.overlay.runId === selectedRun.id : false;
      })
    : [];
  const selectedFrameSequence = Number.parseInt(workflowFrameParam ?? "", 10);
  const selectedFrame =
    selectedRunFrames.find(
      (frame) => frame.sequence === selectedFrameSequence,
    ) ?? selectedRunFrames.at(-1);
  const selectedRunOverlay = selectedRun
    ? workflow?.overlays.find((overlay) => overlay.runId === selectedRun.id)
    : undefined;
  const capabilities = provider?.capabilities ?? {};
  const canApprove =
    capabilities.approve === true && hasWorkflowAction(provider, "approve");
  const canReject =
    capabilities.reject === true && hasWorkflowAction(provider, "reject");
  const canReplay =
    capabilities.replay === true && hasWorkflowAction(provider, "replay");
  const canRunWorker =
    capabilities.runWorker === true && hasWorkflowAction(provider, "runWorker");

  async function refreshWorkflows() {
    await refetch();
  }

  async function runWorker() {
    if (!provider?.runWorker) {
      return;
    }

    try {
      await provider.runWorker();
      toast.success("Workflow worker processed pending work.");
      await refreshWorkflows();
    } catch (actionError) {
      toast.error(formatActionError(actionError));
    }
  }

  async function submitApprovalAction() {
    if (!provider || !pendingApprovalAction) {
      return;
    }

    const { action, approval } = pendingApprovalAction;

    try {
      if (action === "approve") {
        await provider.approve?.(approval.id, {
          reason: approvalReason.trim() || undefined,
        });
        toast.success("Approval accepted.");
      } else {
        await provider.reject?.(approval.id, {
          reason: approvalReason.trim() || undefined,
        });
        toast.success("Approval rejected.");
      }

      setPendingApprovalAction(null);
      setApprovalReason("");
      await refreshWorkflows();
    } catch (actionError) {
      toast.error(formatActionError(actionError));
    }
  }

  async function replayRun() {
    if (!provider?.replay || !pendingReplayRun) {
      return;
    }

    try {
      await provider.replay(pendingReplayRun.id, { mode: "recorded" });
      toast.success("Workflow replay requested.");
      setPendingReplayRun(null);
      await refreshWorkflows();
    } catch (actionError) {
      toast.error(formatActionError(actionError));
    }
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => void refreshWorkflows()}
        disabled={isFetching}
      >
        <RefreshCw data-icon="inline-start" />
        Refresh
      </Button>
      {canRunWorker ? (
        <Button size="sm" variant="outline" onClick={() => void runWorker()}>
          <Play data-icon="inline-start" />
          Run worker
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <StudioHeader endContent={headerActions}>
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold">
              {workflow?.name ?? "Workflows"}
            </div>
            <div className="text-xs text-muted-foreground">
              {workflow
                ? `Version ${workflow.latestVersion}`
                : "No workflow selected"}
            </div>
          </div>
          {workflow ? (
            <>
              <Metric label="Runs today" value={String(workflow.runsToday)} />
              <Metric
                label="Failure rate"
                value={`${Math.round(workflow.failureRate * 100)}%`}
              />
              <Metric
                label="Pending approvals"
                value={String(
                  workflow.approvals.filter(
                    (approval) => approval.status === "pending",
                  ).length,
                )}
              />
            </>
          ) : null}
        </div>
      </StudioHeader>

      {error ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          Could not load workflows: {formatActionError(error)}
        </div>
      ) : !workflow ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          No workflows are available for this Studio session.
        </div>
      ) : (
        <>
          <WorkflowTabs
            activeTab={activeTab}
            createUrl={createUrl}
            workflow={workflow}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            {activeTab === "canvas" ? (
              <WorkflowCanvas
                frame={selectedFrame}
                runOverlay={selectedRunOverlay}
                workflow={workflow}
              />
            ) : null}
            {activeTab === "runs" ? (
              <RunsTable
                createUrl={createUrl}
                onReplay={setPendingReplayRun}
                replayEnabled={canReplay}
                selectedRunId={selectedRun?.id}
                workflow={workflow}
              />
            ) : null}
            {activeTab === "approvals" ? (
              <ApprovalsTable
                approveEnabled={canApprove}
                onAction={(approval, action) => {
                  setPendingApprovalAction({ action, approval });
                }}
                rejectEnabled={canReject}
                workflow={workflow}
              />
            ) : null}
            {activeTab === "ingest" ? (
              <IngestEventsTable events={workflow.ingestEvents} />
            ) : null}
            {activeTab === "deadLetters" ? (
              <DeadLettersTable deadLetters={workflow.deadLetters} />
            ) : null}
          </div>
          {selectedRun && activeTab === "runs" ? (
            <RunDetail
              createUrl={createUrl}
              frames={selectedRunFrames}
              run={selectedRun}
              selectedFrameSequence={selectedFrame?.sequence}
              workflow={workflow}
            />
          ) : null}
        </>
      )}

      <Dialog
        open={pendingApprovalAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingApprovalAction(null);
            setApprovalReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingApprovalAction?.action === "approve"
                ? "Approve workflow step"
                : "Reject workflow step"}
            </DialogTitle>
            <DialogDescription>
              The runtime derives actor identity from the host session. Add an
              optional reason for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={approvalReason}
            onChange={(event) => setApprovalReason(event.currentTarget.value)}
            placeholder="Reason"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingApprovalAction(null);
                setApprovalReason("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void submitApprovalAction()}>
              {pendingApprovalAction?.action === "approve"
                ? "Approve"
                : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingReplayRun !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingReplayRun(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replay workflow run</AlertDialogTitle>
            <AlertDialogDescription>
              Studio will request a recorded replay. External side-effect modes
              stay under runtime control.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void replayRun()}>
              Replay run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WorkflowTabs(props: {
  activeTab: WorkflowTab;
  createUrl: ReturnType<typeof useNavigation>["createUrl"];
  workflow: WorkflowStudioWorkflow;
}) {
  const { activeTab, createUrl, workflow } = props;

  return (
    <div className="flex items-center gap-1 border-t border-border px-3 py-2">
      {workflowTabs.map((tab) => (
        <Button
          key={tab.id}
          asChild
          size="sm"
          variant={activeTab === tab.id ? "secondary" : "ghost"}
        >
          <a
            href={createUrl({
              viewParam: "workflows",
              workflowParam: workflow.slug || workflow.id,
              workflowTabParam: tab.id,
            })}
          >
            {tab.label}
          </a>
        </Button>
      ))}
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-1">
      <div className="font-mono text-xs text-foreground">{props.value}</div>
      <div className="text-[11px] text-muted-foreground">{props.label}</div>
    </div>
  );
}

function RunsTable(props: {
  createUrl: ReturnType<typeof useNavigation>["createUrl"];
  onReplay: (run: WorkflowRun) => void;
  replayEnabled: boolean;
  selectedRunId?: string;
  workflow: WorkflowStudioWorkflow;
}) {
  const { createUrl, onReplay, replayEnabled, selectedRunId, workflow } = props;

  return (
    <Table containerProps={{ className: "h-full" }}>
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow>
          <TableHead>Run</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Current node</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead className="w-40">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {workflow.runs.length === 0 ? (
          <EmptyTableRow colSpan={6} label="No workflow runs" />
        ) : (
          workflow.runs.map((run) => (
            <TableRow
              key={run.id}
              data-state={run.id === selectedRunId ? "selected" : undefined}
            >
              <TableCell className="px-2 font-mono text-xs">
                <a
                  className="text-primary hover:underline"
                  href={createUrl({
                    viewParam: "workflows",
                    workflowParam: workflow.slug || workflow.id,
                    workflowTabParam: "runs",
                    workflowRunParam: run.id,
                  })}
                >
                  {run.id}
                </a>
              </TableCell>
              <TableCell className="px-2">
                <StatusBadge status={run.status} />
              </TableCell>
              <TableCell className="px-2 text-sm">
                {run.currentNode ?? "None"}
              </TableCell>
              <TableCell className="px-2 text-sm">
                {formatWorkflowDate(run.createdAt)}
              </TableCell>
              <TableCell className="px-2 text-sm">
                {formatWorkflowDuration(run)}
              </TableCell>
              <TableCell className="px-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!replayEnabled}
                  onClick={() => onReplay(run)}
                >
                  <RotateCcw data-icon="inline-start" />
                  Replay
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function RunDetail(props: {
  createUrl: ReturnType<typeof useNavigation>["createUrl"];
  frames: readonly {
    sequence: number;
    eventType: string;
    nodeId?: string;
    createdAt?: string;
    overlay: WorkflowExecutionOverlay;
    state?: Record<string, unknown>;
    stateDiff?: unknown;
  }[];
  run: WorkflowRun;
  selectedFrameSequence?: number;
  workflow: WorkflowStudioWorkflow;
}) {
  const { createUrl, frames, run, selectedFrameSequence, workflow } = props;
  const selectedFrame =
    frames.find((frame) => frame.sequence === selectedFrameSequence) ??
    frames.at(-1);
  const activeOverlay =
    selectedFrame?.overlay ??
    workflow.overlays.find((overlay) => overlay.runId === run.id);
  const runApprovals = workflow.approvals.filter(
    (approval) => approval.runId === run.id,
  );

  return (
    <div
      className="flex h-[min(40rem,70vh)] min-h-96 shrink-0 flex-col border-t border-border bg-background"
      data-workflow-run-detail=""
    >
      <RunProgressMap
        activeOverlay={activeOverlay}
        approvals={runApprovals}
        run={run}
        selectedFrame={selectedFrame}
        workflow={workflow}
      />
      <div
        className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)] border-t border-border"
        data-workflow-run-detail-split=""
      >
        <div className="flex min-h-0 flex-col">
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Timeline
              </div>
              <div className="text-xs text-muted-foreground">
                {frames.length} {frames.length === 1 ? "event" : "events"}
              </div>
            </div>
            <Badge variant={getWorkflowStatusTone(run.status)}>
              {formatWorkflowStatus(run.status)}
            </Badge>
          </div>
          <Table containerProps={{ className: "min-h-0 flex-1" }}>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-20 px-3">Seq</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Node</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {frames.length === 0 ? (
                <EmptyTableRow colSpan={4} label="No timeline frames" />
              ) : (
                frames.map((frame) => (
                  <TableRow
                    key={frame.sequence}
                    data-state={
                      frame.sequence === selectedFrame?.sequence
                        ? "selected"
                        : undefined
                    }
                  >
                    <TableCell className="h-9 px-3 font-mono text-xs">
                      <a
                        className="text-primary hover:underline"
                        href={createUrl({
                          viewParam: "workflows",
                          workflowParam: workflow.slug || workflow.id,
                          workflowTabParam: "runs",
                          workflowRunParam: run.id,
                          workflowFrameParam: String(frame.sequence),
                        })}
                      >
                        {frame.sequence}
                      </a>
                    </TableCell>
                    <TableCell className="h-9 px-2 text-sm">
                      {frame.eventType}
                    </TableCell>
                    <TableCell className="h-9 px-2 text-sm">
                      {frame.nodeId ?? "Workflow"}
                    </TableCell>
                    <TableCell className="h-9 px-2 text-sm">
                      {formatWorkflowDate(frame.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <aside className="flex min-h-0 flex-col border-l border-border bg-muted/10">
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Run details
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {run.id}
              </div>
            </div>
          </div>
          <div
            className="flex min-h-0 flex-col gap-4 overflow-auto p-4"
            data-workflow-run-detail-inspector=""
          >
            <WorkflowJsonInspector label="Run state" value={run.state} />
            <WorkflowJsonInspector
              label="Selected frame state diff"
              value={selectedFrame?.stateDiff ?? {}}
            />
            <WorkflowJsonInspector label="Run input" value={run.input ?? {}} />
            <WorkflowJsonInspector
              label="Run output"
              value={run.output ?? {}}
            />
            <WorkflowJsonInspector label="Run error" value={run.error ?? {}} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function RunProgressMap(props: {
  activeOverlay: WorkflowExecutionOverlay | undefined;
  approvals: readonly WorkflowApproval[];
  run: WorkflowRun;
  selectedFrame:
    | {
        sequence: number;
        state?: Record<string, unknown>;
        stateDiff?: unknown;
      }
    | undefined;
  workflow: WorkflowStudioWorkflow;
}) {
  const { activeOverlay, approvals, run, selectedFrame, workflow } = props;
  const geometry = resolveRunMapGeometry(workflow.canvas.nodes);
  const edges = visibleRunMapEdges(workflow.canvas.edges);
  const stepByNode = latestStepByNode(run.steps ?? []);
  const currentNodeIds = resolveCurrentNodeIds(run, activeOverlay);
  const nextNodeIds = resolveNextNodeIds(
    edges,
    workflow.canvas.nodes,
    activeOverlay,
    currentNodeIds,
  );
  const reachedNodes = workflow.canvas.nodes.filter((node) =>
    isReachedStatus(resolveNodeStatus(node, activeOverlay, stepByNode)),
  );
  const nextLabels = workflow.canvas.nodes
    .filter((node) => nextNodeIds.has(node.id))
    .map((node) => node.label);

  return (
    <div className="flex h-[23rem] shrink-0 flex-col bg-muted/20">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-border bg-background px-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Run map</div>
          <div className="text-xs text-muted-foreground">
            Reached {reachedNodes.length} of {workflow.canvas.nodes.length}{" "}
            nodes
          </div>
        </div>
        <div className="min-w-0 text-right text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Next steps</span>
          <span className="ml-2">
            {nextLabels.length === 0 ? "None" : nextLabels.join(", ")}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" data-workflow-run-map="">
        <div
          className="relative"
          style={{ height: geometry.height, width: geometry.width }}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            height={geometry.height}
            width={geometry.width}
          >
            {edges.map((edge) => {
              const from = geometry.nodes.get(edge.from);
              const to = geometry.nodes.get(edge.to);

              if (!from || !to) {
                return null;
              }

              const active = isReachedStatus(
                resolveNodeStatus(
                  workflow.canvas.nodes.find((node) => node.id === edge.from),
                  activeOverlay,
                  stepByNode,
                ),
              );

              return (
                <path
                  key={edge.id}
                  className={active ? "stroke-primary" : "stroke-border"}
                  d={edgePath(from, to)}
                  fill="none"
                  strokeWidth={1.5}
                />
              );
            })}
          </svg>
          {workflow.canvas.nodes.map((node) => {
            const position = geometry.nodes.get(node.id);

            if (!position) {
              return null;
            }

            const step = stepByNode.get(node.id);
            const approval = approvals.find(
              (candidate) => candidate.nodeId === node.id,
            );
            const status = resolveNodeStatus(node, activeOverlay, stepByNode);
            const payload = resolveNodePayload({
              approval,
              node,
              run,
              selectedFrame,
              step,
            });
            const current = currentNodeIds.has(node.id);
            const next = nextNodeIds.has(node.id);

            return (
              <div
                key={node.id}
                className={cn(
                  "absolute flex h-28 w-40 flex-col rounded-md border border-border bg-card p-2 text-card-foreground shadow-sm",
                  isReachedStatus(status) && "border-primary/40 bg-primary/5",
                  current && "ring-2 ring-primary/30",
                  next && "border-primary",
                )}
                data-workflow-run-map-node=""
                style={{ left: position.x, top: position.y }}
              >
                <div className="min-w-0">
                  <div
                    className="truncate text-xs font-medium"
                    title={node.label}
                  >
                    {node.label}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {node.kind}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant={getWorkflowStatusTone(status)}>
                    {formatWorkflowStatus(status)}
                  </Badge>
                  {current ? <Badge variant="secondary">Current</Badge> : null}
                  {next ? <Badge variant="outline">Next</Badge> : null}
                </div>
                <div className="mt-2 grid min-w-0 gap-1 text-[11px]">
                  <PayloadPreview label="In" value={payload.input} />
                  <PayloadPreview label="Out" value={payload.output} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface RunMapNodePosition {
  centerY: number;
  rightX: number;
  x: number;
  y: number;
}

function resolveRunMapGeometry(nodes: readonly WorkflowCanvasNode[]) {
  const nodeWidth = 160;
  const nodeHeight = 112;
  const padding = 16;
  const xScale = 0.82;
  const yScale = 0.67;
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const positions = new Map<string, RunMapNodePosition>();

  for (const node of nodes) {
    const x = (node.x - minX) * xScale + padding;
    const y = (node.y - minY) * yScale + padding;

    positions.set(node.id, {
      centerY: y + nodeHeight / 2,
      rightX: x + nodeWidth,
      x,
      y,
    });
  }

  return {
    height: Math.max(176, (maxY - minY) * yScale + nodeHeight + padding * 2),
    nodes: positions,
    width: Math.max(640, (maxX - minX) * xScale + nodeWidth + padding * 2),
  };
}

function latestStepByNode(steps: readonly WorkflowRunStep[]) {
  const byNode = new Map<string, WorkflowRunStep>();

  for (const step of steps) {
    const existing = byNode.get(step.nodeId);

    if (!existing || (step.attempt ?? 0) >= (existing.attempt ?? 0)) {
      byNode.set(step.nodeId, step);
    }
  }

  return byNode;
}

function resolveCurrentNodeIds(
  run: WorkflowRun,
  activeOverlay: WorkflowExecutionOverlay | undefined,
) {
  const ids = new Set<string>();

  if (run.currentNode) {
    ids.add(run.currentNode);
  }

  for (const [nodeId, overlay] of Object.entries(activeOverlay?.nodes ?? {})) {
    if (overlay.status === "running" || overlay.status === "waiting") {
      ids.add(nodeId);
    }
  }

  return ids;
}

function resolveNextNodeIds(
  edges: readonly WorkflowCanvasEdge[],
  nodes: readonly WorkflowCanvasNode[],
  activeOverlay: WorkflowExecutionOverlay | undefined,
  currentNodeIds: ReadonlySet<string>,
) {
  const nextNodeIds = new Set<string>();
  const stepByNode = new Map<string, WorkflowRunStep>();

  for (const edge of edges) {
    if (!currentNodeIds.has(edge.from)) {
      continue;
    }

    const target = nodes.find((node) => node.id === edge.to);
    const targetStatus = resolveNodeStatus(target, activeOverlay, stepByNode);

    if (!isReachedStatus(targetStatus)) {
      nextNodeIds.add(edge.to);
    }
  }

  return nextNodeIds;
}

function visibleRunMapEdges(
  edges: readonly WorkflowCanvasEdge[],
): WorkflowCanvasEdge[] {
  const byPair = new Map<string, WorkflowCanvasEdge>();

  for (const edge of edges) {
    const pair = `${edge.from}\u0000${edge.to}`;
    const existing = byPair.get(pair);

    if (
      !existing ||
      (existing.label !== undefined && edge.label === undefined)
    ) {
      byPair.set(pair, edge);
    }
  }

  return [...byPair.values()];
}

function resolveNodeStatus(
  node: WorkflowCanvasNode | undefined,
  activeOverlay: WorkflowExecutionOverlay | undefined,
  stepByNode: ReadonlyMap<string, WorkflowRunStep>,
): string {
  if (!node) {
    return "not_started";
  }

  const overlayStatus = activeOverlay?.nodes[node.id]?.status;

  if (overlayStatus) {
    return overlayStatus;
  }

  const step = stepByNode.get(node.id);

  if (step) {
    return statusFromRunStep(step.status);
  }

  return node.status ?? "not_started";
}

function statusFromRunStep(status: string): string {
  switch (status) {
    case "completed":
      return "succeeded";
    case "failed":
    case "running":
    case "skipped":
      return status;
    case "queued":
      return "not_started";
    default:
      return status;
  }
}

function isReachedStatus(status: string): boolean {
  return status !== "not_started" && status !== "queued";
}

function resolveNodePayload(args: {
  approval: WorkflowApproval | undefined;
  node: WorkflowCanvasNode;
  run: WorkflowRun;
  selectedFrame:
    | {
        state?: Record<string, unknown>;
        stateDiff?: unknown;
      }
    | undefined;
  step: WorkflowRunStep | undefined;
}) {
  if (args.step) {
    return {
      input: args.step.input,
      output: args.step.output,
    };
  }

  if (args.approval) {
    return {
      input: args.approval.payload,
      output: args.approval.decision,
    };
  }

  if (args.node.kind === "trigger") {
    return {
      input: args.run.input,
      output: args.selectedFrame?.state ?? args.selectedFrame?.stateDiff,
    };
  }

  if (args.node.kind === "state") {
    return {
      input: args.selectedFrame?.stateDiff,
      output: args.selectedFrame?.state ?? args.run.state,
    };
  }

  return {
    input: undefined,
    output: undefined,
  };
}

function PayloadPreview(props: { label: string; value: unknown }) {
  return (
    <div className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-1">
      <span className="text-muted-foreground">{props.label}</span>
      <span
        className="truncate font-mono text-foreground"
        title={payloadTitle(props.value)}
      >
        {summarizePayload(props.value)}
      </span>
    </div>
  );
}

function summarizePayload(value: unknown): string {
  if (value === undefined || value === null) {
    return "None";
  }

  if (typeof value === "string") {
    return truncatePayload(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value);

    return keys.length === 0 ? "{}" : keys.slice(0, 3).join(", ");
  }

  return truncatePayload(String(value));
}

function payloadTitle(value: unknown): string {
  if (value === undefined) {
    return "None";
  }

  try {
    return JSON.stringify(value, null, 2) ?? "None";
  } catch {
    return String(value);
  }
}

function truncatePayload(value: string): string {
  return value.length > 42 ? `${value.slice(0, 39)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function edgePath(from: RunMapNodePosition, to: RunMapNodePosition): string {
  const middleX = from.rightX + Math.max(24, (to.x - from.rightX) / 2);

  return [
    `M ${from.rightX} ${from.centerY}`,
    `C ${middleX} ${from.centerY}`,
    `${middleX} ${to.centerY}`,
    `${to.x} ${to.centerY}`,
  ].join(" ");
}

function ApprovalsTable(props: {
  approveEnabled: boolean;
  onAction: (approval: WorkflowApproval, action: "approve" | "reject") => void;
  rejectEnabled: boolean;
  workflow: WorkflowStudioWorkflow;
}) {
  const { approveEnabled, onAction, rejectEnabled, workflow } = props;
  const approvals = useMemo(
    () =>
      [...workflow.approvals].sort((left, right) => {
        if (left.status === "pending" && right.status !== "pending") {
          return -1;
        }

        if (right.status === "pending" && left.status !== "pending") {
          return 1;
        }

        return 0;
      }),
    [workflow.approvals],
  );

  return (
    <Table containerProps={{ className: "h-full" }}>
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow>
          <TableHead>Approval</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Run</TableHead>
          <TableHead>Assignees</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead className="w-52">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {approvals.length === 0 ? (
          <EmptyTableRow colSpan={6} label="No approvals" />
        ) : (
          approvals.map((approval) => (
            <TableRow key={approval.id}>
              <TableCell className="px-2 text-sm">
                {approval.approvalName}
              </TableCell>
              <TableCell className="px-2">
                <StatusBadge status={approval.status} />
              </TableCell>
              <TableCell className="px-2 font-mono text-xs">
                {approval.runId}
              </TableCell>
              <TableCell className="px-2 text-sm">
                {approval.assignees.join(", ") || "Unassigned"}
              </TableCell>
              <TableCell className="px-2 text-sm">
                {formatWorkflowDate(approval.requestedAt)}
              </TableCell>
              <TableCell className="flex gap-2 px-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!approveEnabled || approval.status !== "pending"}
                  onClick={() => onAction(approval, "approve")}
                >
                  <Check data-icon="inline-start" />
                  Approve
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!rejectEnabled || approval.status !== "pending"}
                  onClick={() => onAction(approval, "reject")}
                >
                  <ThumbsDown data-icon="inline-start" />
                  Reject
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function IngestEventsTable(props: { events: readonly WorkflowIngestEvent[] }) {
  return (
    <Table containerProps={{ className: "h-full" }}>
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>External ID</TableHead>
          <TableHead>Received</TableHead>
          <TableHead>Payload</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.events.length === 0 ? (
          <EmptyTableRow colSpan={6} label="No ingest events" />
        ) : (
          props.events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="px-2 text-sm">{event.source}</TableCell>
              <TableCell className="px-2 text-sm">{event.eventType}</TableCell>
              <TableCell className="px-2">
                <StatusBadge status={event.status} />
              </TableCell>
              <TableCell className="px-2 font-mono text-xs">
                {event.externalId}
              </TableCell>
              <TableCell className="px-2 text-sm">
                {formatWorkflowDate(event.receivedAt)}
              </TableCell>
              <TableCell className="px-2">
                <WorkflowJsonInspector
                  label="Payload"
                  value={{
                    normalizedPayload: event.normalizedPayload,
                    rawPayload: event.rawPayload,
                  }}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function DeadLettersTable(props: {
  deadLetters: readonly WorkflowDeadLetter[];
}) {
  return (
    <Table containerProps={{ className: "h-full" }}>
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow>
          <TableHead>Kind</TableHead>
          <TableHead>Resource</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Payload</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.deadLetters.length === 0 ? (
          <EmptyTableRow colSpan={5} label="No dead letters" />
        ) : (
          props.deadLetters.map((deadLetter) => (
            <TableRow key={deadLetter.id}>
              <TableCell className="px-2 text-sm">{deadLetter.kind}</TableCell>
              <TableCell className="px-2 font-mono text-xs">
                {deadLetter.resourceId}
              </TableCell>
              <TableCell className="px-2 text-sm">
                {deadLetter.reason}
              </TableCell>
              <TableCell className="px-2 text-sm">
                {formatWorkflowDate(deadLetter.createdAt)}
              </TableCell>
              <TableCell className="px-2">
                <WorkflowJsonInspector
                  label="Dead letter payload"
                  value={deadLetter.payload ?? {}}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function StatusBadge(props: { status: string | undefined }) {
  return (
    <Badge
      variant={getWorkflowStatusTone(props.status)}
      className={cn("whitespace-nowrap")}
    >
      {formatWorkflowStatus(props.status)}
    </Badge>
  );
}

function EmptyTableRow(props: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={props.colSpan}
        className="h-28 text-center text-sm text-muted-foreground"
      >
        {props.label}
      </TableCell>
    </TableRow>
  );
}

function resolveWorkflow(
  workflows: readonly WorkflowStudioWorkflow[],
  workflowParam: string | null,
): WorkflowStudioWorkflow | undefined {
  if (!workflowParam) {
    return workflows[0];
  }

  return (
    workflows.find(
      (workflow) =>
        workflow.id === workflowParam || workflow.slug === workflowParam,
    ) ?? workflows[0]
  );
}

function resolveWorkflowTab(tab: string | null): WorkflowTab {
  for (const candidate of workflowTabs) {
    if (candidate.id === tab) {
      return candidate.id;
    }
  }

  return "canvas";
}

function formatActionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasWorkflowAction(
  provider: WorkflowStudioProvider | undefined,
  action: WorkflowAction,
): boolean {
  return (
    provider !== undefined &&
    typeof Reflect.get(provider, action) === "function"
  );
}
