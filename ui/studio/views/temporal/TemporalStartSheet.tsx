import { Play, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { TemporalStartWorkflowInput } from "@/data/temporal";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
import { Switch } from "@/ui/components/ui/switch";
import { Textarea } from "@/ui/components/ui/textarea";
import { useTemporalActions } from "@/ui/hooks/use-temporal";

import { parseJsonArgsText, safeJsonPretty } from "./temporal-utils";

export interface TemporalStartPreset {
  args?: unknown[];
  clonedFromWorkflowId?: string;
  taskQueue?: string;
  workflowId?: string;
  workflowType?: string;
}

interface TemporalStartSheetProps {
  knownTaskQueues: string[];
  knownWorkflowTypes: string[];
  namespace: string;
  onOpenChange: (open: boolean) => void;
  onStarted: (workflowId: string, runId: string) => void;
  open: boolean;
  preset?: TemporalStartPreset | null;
}

function defaultWorkflowId(type: string): string {
  const slug =
    type
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "") || "wf";
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

export function TemporalStartSheet(props: TemporalStartSheetProps) {
  const {
    open,
    onOpenChange,
    namespace,
    preset,
    knownWorkflowTypes,
    knownTaskQueues,
    onStarted,
  } = props;
  const { startWorkflow } = useTemporalActions(namespace);

  const [workflowType, setWorkflowType] = useState("ChargeOrder");
  const [workflowId, setWorkflowId] = useState("");
  const [taskQueue, setTaskQueue] = useState("billing");
  const [idReusePolicy, setIdReusePolicy] =
    useState<NonNullable<TemporalStartWorkflowInput["idReusePolicy"]>>(
      "ALLOW_DUPLICATE",
    );
  const [argsText, setArgsText] = useState(
    '[\n  {\n    "orderId": "ord-9001",\n    "amountCents": 4900,\n    "currency": "USD"\n  }\n]',
  );
  const [useSignalWithStart, setUseSignalWithStart] = useState(false);
  const [signalName, setSignalName] = useState("");
  const [signalArgsText, setSignalArgsText] = useState("[]");

  useEffect(() => {
    if (!open) return;
    const nextType =
      preset?.workflowType || knownWorkflowTypes[0] || "ChargeOrder";
    setWorkflowType(nextType);
    setTaskQueue(preset?.taskQueue || knownTaskQueues[0] || "billing");
    setWorkflowId(
      preset?.workflowId ||
        (preset?.clonedFromWorkflowId
          ? `${preset.clonedFromWorkflowId}-retry-${Math.random().toString(36).slice(2, 5)}`
          : defaultWorkflowId(nextType)),
    );
    if (preset?.args !== undefined) {
      setArgsText(safeJsonPretty(preset.args));
    } else if (nextType === "ChargeOrder") {
      setArgsText(
        safeJsonPretty([
          { amountCents: 4900, currency: "USD", orderId: "ord-9001" },
        ]),
      );
    } else if (nextType === "MoneyTransfer") {
      setArgsText(
        safeJsonPretty([
          {
            amountCents: 15000,
            from: "acct_checking_01",
            simulateBankOutage: false,
            to: "acct_vendor_14",
          },
        ]),
      );
    } else {
      setArgsText("[{}]");
    }
    setUseSignalWithStart(false);
    setSignalName("");
    setSignalArgsText("[]");
  }, [open, preset, knownWorkflowTypes, knownTaskQueues]);

  const parsedArgs = parseJsonArgsText(argsText);
  const parsedSignalArgs = useSignalWithStart
    ? parseJsonArgsText(signalArgsText)
    : { args: [] };

  const canSubmit =
    workflowType.trim().length > 0 &&
    workflowId.trim().length > 0 &&
    taskQueue.trim().length > 0 &&
    !parsedArgs.error &&
    (!useSignalWithStart ||
      (signalName.trim().length > 0 && !parsedSignalArgs.error)) &&
    !startWorkflow.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const res = await startWorkflow.mutateAsync({
        args: parsedArgs.args ?? [],
        idReusePolicy,
        ...(useSignalWithStart
          ? {
              signalArgs: parsedSignalArgs.args ?? [],
              signalName: signalName.trim(),
            }
          : {}),
        taskQueue: taskQueue.trim(),
        workflowId: workflowId.trim(),
        workflowType: workflowType.trim(),
      });
      toast.success(`Started ${workflowType.trim()} (${res.workflowId})`);
      onOpenChange(false);
      onStarted(res.workflowId, res.runId);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start workflow",
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base">
              {preset?.clonedFromWorkflowId
                ? `Clone & Re-run`
                : "Start Workflow"}
            </SheetTitle>
            <Badge variant="outline" className="font-mono text-[11px]">
              ns: {namespace}
            </Badge>
          </div>
          <SheetDescription className="text-xs">
            {preset?.clonedFromWorkflowId
              ? `Pre-filled from ${preset.clonedFromWorkflowId}. Edit inputs or ID and start a fresh live run.`
              : "Start a new workflow execution and open the live Execution Debugger in tail mode."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="temporal-start-type" className="text-xs">
                Workflow Type
              </Label>
              <Input
                id="temporal-start-type"
                value={workflowType}
                onChange={(e) => setWorkflowType(e.target.value)}
                placeholder="ChargeOrder"
                className="h-8 font-mono text-xs"
              />
              {knownWorkflowTypes.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {knownWorkflowTypes.slice(0, 4).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setWorkflowType(t)}
                      className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="temporal-start-queue" className="text-xs">
                Task Queue
              </Label>
              <Input
                id="temporal-start-queue"
                value={taskQueue}
                onChange={(e) => setTaskQueue(e.target.value)}
                placeholder="billing"
                className="h-8 font-mono text-xs"
              />
              {knownTaskQueues.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {knownTaskQueues.slice(0, 4).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setTaskQueue(q)}
                      className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="temporal-start-id" className="text-xs">
                  Workflow ID
                </Label>
                <button
                  type="button"
                  onClick={() => setWorkflowId(defaultWorkflowId(workflowType))}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <Sparkles className="size-3" />
                  Generate
                </button>
              </div>
              <Input
                id="temporal-start-id"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
                placeholder="ord-9001"
                className="h-8 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">ID Reuse Policy</Label>
              <Select
                value={idReusePolicy}
                onValueChange={(v) =>
                  setIdReusePolicy(
                    v as NonNullable<
                      TemporalStartWorkflowInput["idReusePolicy"]
                    >,
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALLOW_DUPLICATE">
                    Allow Duplicate
                  </SelectItem>
                  <SelectItem value="ALLOW_DUPLICATE_FAILED_ONLY">
                    Failed Only
                  </SelectItem>
                  <SelectItem value="REJECT_DUPLICATE">
                    Reject Duplicate
                  </SelectItem>
                  <SelectItem value="TERMINATE_IF_RUNNING">
                    Terminate If Running
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="temporal-start-args" className="text-xs">
                Input Arguments (JSON array or single value)
              </Label>
              <button
                type="button"
                onClick={() => {
                  if (!parsedArgs.error) {
                    setArgsText(safeJsonPretty(parsedArgs.args));
                  }
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Format JSON
              </button>
            </div>
            <Textarea
              id="temporal-start-args"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={7}
              className="font-mono text-xs leading-relaxed"
              spellCheck={false}
            />
            {parsedArgs.error ? (
              <p className="text-xs text-destructive">{parsedArgs.error}</p>
            ) : null}
          </div>

          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">Signal-With-Start</div>
                <div className="text-[11px] text-muted-foreground">
                  Deliver a signal atomically when starting the workflow
                </div>
              </div>
              <Switch
                checked={useSignalWithStart}
                onCheckedChange={setUseSignalWithStart}
              />
            </div>

            {useSignalWithStart ? (
              <div className="mt-3 space-y-2.5 border-t border-border pt-3">
                <div className="space-y-1">
                  <Label htmlFor="temporal-sws-name" className="text-xs">
                    Signal Name
                  </Label>
                  <Input
                    id="temporal-sws-name"
                    value={signalName}
                    onChange={(e) => setSignalName(e.target.value)}
                    placeholder="approveDeposit"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="temporal-sws-args" className="text-xs">
                    Signal Args (JSON)
                  </Label>
                  <Textarea
                    id="temporal-sws-args"
                    value={signalArgsText}
                    onChange={(e) => setSignalArgsText(e.target.value)}
                    rows={3}
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                  {parsedSignalArgs.error ? (
                    <p className="text-xs text-destructive">
                      {parsedSignalArgs.error}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <SheetFooter className="border-t border-border px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            data-testid="temporal-start-submit"
          >
            <Play className="mr-1.5 size-3.5" />
            {startWorkflow.isPending ? "Starting..." : "Start & Tail Run"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
