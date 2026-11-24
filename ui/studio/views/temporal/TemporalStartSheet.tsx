import { ChevronDown, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  TemporalFacets,
  TemporalStartWorkflowInput,
  TemporalTypeInputRun,
} from "@/data/temporal";
import { compareInputWithSamples } from "@/data/temporal/input-suggestions";
import { Button } from "@/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
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
import {
  useTemporalActions,
  useTemporalTypeInputs,
} from "@/ui/hooks/use-temporal";
import { isMacPlatform } from "@/ui/lib/platform";
import { cn } from "@/ui/lib/utils";

import {
  formatRelativeTime,
  parseJsonArgsText,
  safeJsonPretty,
} from "./temporal-utils";
import { TemporalCombobox } from "./TemporalCombobox";
import {
  TemporalJsonEditor,
  type TemporalJsonEditorHandle,
} from "./TemporalJsonEditor";
import {
  TemporalField,
  temporalIconScale,
  TemporalNamespaceBadge,
  WorkflowStatusIcon,
} from "./TemporalPrimitives";

export interface TemporalStartPreset {
  args?: unknown[];
  clonedFromWorkflowId?: string;
  taskQueue?: string;
  workflowId?: string;
  workflowType?: string;
}

interface TemporalStartSheetProps {
  /** The Workflow Types and Task Queues in use, which the form offers. */
  facets?: TemporalFacets;
  namespace: string;
  onOpenChange: (open: boolean) => void;
  onStarted: (workflowId: string, runId: string) => void;
  open: boolean;
  preset?: TemporalStartPreset | null;
}

type IdReusePolicy = NonNullable<TemporalStartWorkflowInput["idReusePolicy"]>;

/** What each policy does when a run with the same Workflow ID exists. */
const ID_REUSE_POLICIES: Record<
  IdReusePolicy,
  { hint: string; label: string }
> = {
  ALLOW_DUPLICATE: {
    hint: "Starts unless a run with this ID is open.",
    label: "Allow Duplicate",
  },
  ALLOW_DUPLICATE_FAILED_ONLY: {
    hint: "Starts only if the last run with this ID did not complete.",
    label: "Failed Only",
  },
  REJECT_DUPLICATE: {
    hint: "Starts only if no run has had this ID.",
    label: "Reject Duplicate",
  },
  TERMINATE_IF_RUNNING: {
    hint: "Terminates an open run with this ID, then starts.",
    label: "Terminate If Running",
  },
};

const EMPTY_INPUT = "[{}]";
const MAX_RECENT_INPUTS = 8;

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/** `order-fulfillment-x7k2p` for the type `orderFulfillment`. */
function defaultWorkflowId(type: string, suffix: string): string {
  const slug =
    type
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "") || "wf";

  return `${slug}-${suffix}`;
}

function oneLine(args: unknown[]): string {
  return JSON.stringify(args.length === 1 ? args[0] : args);
}

/**
 * The form that starts a Workflow run. Once the user has chosen a Workflow
 * Type that has runs, the form fills in the Task Queue those runs use and the
 * input of the newest of them, and the editor completes keys and values from
 * their inputs. A field the user has changed is never filled in again.
 */
export function TemporalStartSheet(props: TemporalStartSheetProps) {
  const { onOpenChange, open } = props;
  // Each opening is a new form. The lists of known types and queues refresh
  // while the sheet is open, and that must not undo what the user typed.
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setOpening((count) => count + 1);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <StartForm key={opening} {...props} />
    </Sheet>
  );
}

function StartForm(props: TemporalStartSheetProps) {
  const { facets, namespace, onOpenChange, onStarted, open, preset } = props;
  const { startWorkflow } = useTemporalActions(namespace);

  const [workflowType, setWorkflowType] = useState(preset?.workflowType ?? "");
  const [taskQueue, setTaskQueue] = useState(preset?.taskQueue ?? "");
  // Null until the user writes an ID: until then the ID follows the type.
  const [typedWorkflowId, setTypedWorkflowId] = useState<string | null>(
    () =>
      preset?.workflowId ??
      (preset?.clonedFromWorkflowId
        ? `${preset.clonedFromWorkflowId}-retry-${randomSuffix().slice(0, 3)}`
        : null),
  );
  const [idSuffix, setIdSuffix] = useState(randomSuffix);
  const [idReusePolicy, setIdReusePolicy] =
    useState<IdReusePolicy>("ALLOW_DUPLICATE");
  const [argsText, setArgsText] = useState(() =>
    preset?.args === undefined ? EMPTY_INPUT : safeJsonPretty(preset.args),
  );
  /** The recent run whose input is in the editor. */
  const [filledFrom, setFilledFrom] = useState<TemporalTypeInputRun | null>(
    null,
  );
  const [isQueueTouched, setIsQueueTouched] = useState(
    Boolean(preset?.taskQueue),
  );
  const [isInputTouched, setIsInputTouched] = useState(
    preset?.args !== undefined,
  );
  const [useSignalWithStart, setUseSignalWithStart] = useState(false);
  const [signalName, setSignalName] = useState("");
  const [signalArgsText, setSignalArgsText] = useState("[]");
  // The type whose recent runs filled the form, so a later refresh of those
  // runs does not change a form the user is reading.
  const filledForType = useRef<string | null>(null);
  const editor = useRef<TemporalJsonEditorHandle | null>(null);

  const typeName = workflowType.trim();
  const typeOptions = useMemo(
    () =>
      (facets?.workflowTypes ?? []).map((type) => ({
        // Without every run of the namespace the count is that of a sample.
        detail: facets?.complete
          ? `${type.count.toLocaleString("en-US")} ${type.count === 1 ? "run" : "runs"}`
          : undefined,
        value: type.name,
      })),
    [facets],
  );
  const isKnownType = typeOptions.some((option) => option.value === typeName);
  // A type with no run has no input to read, and a half-typed name is not a type.
  const recent = useTemporalTypeInputs({
    enabled: open && isKnownType,
    namespace,
    workflowType: typeName,
  });
  const recentRuns = isKnownType ? recent.data?.runs : undefined;
  /** The recent runs with an input Studio can read, one per distinct input. */
  const readableRuns = useMemo(() => {
    const byInput = new Map<string, TemporalTypeInputRun>();

    for (const run of recentRuns ?? []) {
      const key = JSON.stringify(run.args);

      if (!run.isEncoded && !byInput.has(key)) {
        byInput.set(key, run);
      }
    }

    return [...byInput.values()];
  }, [recentRuns]);
  const samples = useMemo(
    () => readableRuns.map((run) => run.args),
    [readableRuns],
  );
  const typeQueue = isKnownType ? recent.data?.taskQueue : undefined;
  const queueOptions = useMemo(() => {
    const names = (facets?.taskQueues ?? []).map((queue) => queue.name);

    // The queue that runs of the chosen type use comes first.
    return [
      ...(typeQueue ? [typeQueue] : []),
      ...names.filter((name) => name !== typeQueue),
    ].map((name) => ({
      detail: name === typeQueue ? `used by ${typeName}` : undefined,
      value: name,
    }));
  }, [facets, typeName, typeQueue]);

  useEffect(() => {
    if (!open || !recent.data || !isKnownType) {
      return;
    }

    if (filledForType.current === typeName) {
      return;
    }

    filledForType.current = typeName;

    if (!isQueueTouched && recent.data.taskQueue) {
      setTaskQueue(recent.data.taskQueue);
    }

    // The input of a run that completed is more likely one that works.
    const model =
      readableRuns.find((run) => run.status === "Completed") ??
      readableRuns.find((run) => run.status === "Running") ??
      readableRuns[0];

    if (!isInputTouched && model) {
      setArgsText(safeJsonPretty(model.args));
      setFilledFrom(model);
    }
  }, [
    isInputTouched,
    isKnownType,
    isQueueTouched,
    open,
    readableRuns,
    recent.data,
    typeName,
  ]);

  const changeType = (next: string) => {
    setWorkflowType(next);

    // The input of another type's run does not belong to this type.
    if (!isInputTouched && filledFrom) {
      setArgsText(EMPTY_INPUT);
      setFilledFrom(null);
    }
  };
  const fillFrom = (run: TemporalTypeInputRun) => {
    setArgsText(safeJsonPretty(run.args));
    setFilledFrom(run);
    setIsInputTouched(false);
  };

  const workflowId = typedWorkflowId ?? defaultWorkflowId(typeName, idSuffix);
  const parsedArgs = parseJsonArgsText(argsText);
  const parsedSignalArgs = useSignalWithStart
    ? parseJsonArgsText(signalArgsText)
    : { args: [] };
  const differences =
    parsedArgs.args && samples.length >= 2
      ? compareInputWithSamples(parsedArgs.args, samples)
      : { missing: [], unknown: [] };
  const encodedCount = (recentRuns ?? []).filter((run) => run.isEncoded).length;

  const missingField =
    typeName.length === 0
      ? "Choose a Workflow Type."
      : taskQueue.trim().length === 0
        ? "Enter a Task Queue."
        : workflowId.trim().length === 0
          ? "Enter a Workflow ID."
          : parsedArgs.error
            ? "Fix the input JSON."
            : useSignalWithStart && signalName.trim().length === 0
              ? "Enter a signal name."
              : useSignalWithStart && parsedSignalArgs.error
                ? "Fix the signal arguments JSON."
                : null;
  const canSubmit = missingField === null && !startWorkflow.isPending;

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
        workflowType: typeName,
      });
      toast.success(`Started ${typeName} (${res.workflowId})`);
      onOpenChange(false);
      onStarted(res.workflowId, res.runId);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start execution",
      );
    }
  };

  return (
    <SheetContent
      side="right"
      className={cn(
        "flex w-full flex-col gap-0 p-0 sm:max-w-xl",
        temporalIconScale,
      )}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        document.getElementById("temporal-start-type")?.focus();
      }}
      onEscapeKeyDown={(event) => {
        // Escape closes the editor's list of suggestions first, not the form.
        if (editor.current?.closeSuggestions()) {
          event.preventDefault();
        }
      }}
      onKeyDown={(event) => {
        // The editor handles the same keys itself and marks them handled.
        if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey) &&
          !event.defaultPrevented
        ) {
          event.preventDefault();
          void handleSubmit();
        }
      }}
    >
      <SheetHeader className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <SheetTitle className="text-base">
            {preset?.clonedFromWorkflowId
              ? "Clone & Start Execution"
              : "Start Workflow Execution"}
          </SheetTitle>
          <TemporalNamespaceBadge namespace={namespace} />
        </div>
        <SheetDescription className="text-xs">
          {preset?.clonedFromWorkflowId
            ? `Pre-filled from ${preset.clonedFromWorkflowId}. Edit the inputs or ID, then start a new run.`
            : "Choose a Workflow Type. The form fills in the Task Queue and the input that recent runs of it use."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 *:shrink-0">
        <div className="grid grid-cols-2 gap-4">
          <TemporalField htmlFor="temporal-start-type" label="Workflow Type">
            <TemporalCombobox
              id="temporal-start-type"
              listLabel="Workflow Types"
              onChange={changeType}
              options={typeOptions}
              placeholder="Choose or type"
              value={workflowType}
            />
            {typeName.length > 0 && typeOptions.length > 0 && !isKnownType ? (
              <FieldNote testId="temporal-start-type-note">
                No run of this type yet. A Worker must have it registered.
              </FieldNote>
            ) : null}
          </TemporalField>

          <TemporalField htmlFor="temporal-start-queue" label="Task Queue">
            <TemporalCombobox
              id="temporal-start-queue"
              listLabel="Task Queues"
              onChange={(next) => {
                setTaskQueue(next);
                setIsQueueTouched(true);
              }}
              options={queueOptions}
              placeholder="Choose or type"
              value={taskQueue}
            />
            {taskQueue.trim().length > 0 &&
            queueOptions.length > 0 &&
            !queueOptions.some(
              (option) => option.value === taskQueue.trim(),
            ) ? (
              <FieldNote testId="temporal-start-queue-note">
                No run uses this queue yet. A run waits until a Worker polls it.
              </FieldNote>
            ) : null}
          </TemporalField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <TemporalField
            htmlFor="temporal-start-id"
            label="Workflow ID"
            action={
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="-mr-1.5 h-5 px-1.5 text-2xs font-normal text-muted-foreground"
                onClick={() => {
                  setIdSuffix(randomSuffix());
                  setTypedWorkflowId(null);
                }}
              >
                Generate
              </Button>
            }
          >
            <Input
              id="temporal-start-id"
              value={workflowId}
              onChange={(e) => setTypedWorkflowId(e.target.value)}
              placeholder="Workflow ID"
              className="h-8 font-mono text-xs"
            />
          </TemporalField>

          <TemporalField htmlFor="temporal-start-reuse" label="ID Reuse Policy">
            <Select
              value={idReusePolicy}
              onValueChange={(v) => setIdReusePolicy(v as IdReusePolicy)}
            >
              <SelectTrigger id="temporal-start-reuse" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ID_REUSE_POLICIES).map(([value, policy]) => (
                  <SelectItem key={value} value={value}>
                    {policy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldNote>{ID_REUSE_POLICIES[idReusePolicy].hint}</FieldNote>
          </TemporalField>
        </div>

        <TemporalField
          htmlFor="temporal-start-args"
          label="Input (JSON list of arguments)"
          action={
            <div className="flex items-center">
              {readableRuns.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-5 gap-1 px-1.5 text-2xs font-normal text-muted-foreground"
                      data-testid="temporal-start-recent-inputs"
                    >
                      Recent Inputs
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-96">
                    <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
                      Inputs of the newest runs of {typeName}
                    </DropdownMenuLabel>
                    {readableRuns.slice(0, MAX_RECENT_INPUTS).map((run) => (
                      <DropdownMenuItem
                        key={run.runId}
                        className="flex flex-col items-stretch gap-0.5"
                        onSelect={() => fillFrom(run)}
                      >
                        <span className="flex items-center gap-1.5 text-xs">
                          <WorkflowStatusIcon status={run.status} />
                          <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                            {run.workflowId}
                          </span>
                          <span className="shrink-0 text-2xs text-muted-foreground">
                            {formatRelativeTime(run.startTime)}
                          </span>
                        </span>
                        <span className="truncate font-mono text-2xs text-muted-foreground">
                          {oneLine(run.args)}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="-mr-1.5 h-5 px-1.5 text-2xs font-normal text-muted-foreground"
                onClick={() => {
                  if (!parsedArgs.error) {
                    setArgsText(safeJsonPretty(parsedArgs.args));
                  }
                }}
              >
                Format
              </Button>
            </div>
          }
        >
          <TemporalJsonEditor
            ariaLabel="Input, a JSON list of arguments"
            handle={editor}
            id="temporal-start-args"
            isInvalid={Boolean(parsedArgs.error)}
            onChange={(next) => {
              // The editor also reports the text the form itself put in.
              if (next !== argsText) {
                setArgsText(next);
                setIsInputTouched(true);

                // An emptied editor holds nothing of the run it was filled from.
                if (next.trim() === "") {
                  setFilledFrom(null);
                }
              }
            }}
            onSubmit={() => void handleSubmit()}
            samples={samples}
            value={argsText}
          />
          <div
            className="flex flex-col gap-1"
            data-testid="temporal-start-input-notes"
          >
            {parsedArgs.error ? (
              <p className="text-xs text-destructive">{parsedArgs.error}</p>
            ) : null}
            {filledFrom ? (
              <FieldNote>
                {isInputTouched
                  ? "Based on the input of "
                  : filledFrom.status === "Completed"
                    ? "The input of the newest completed run, "
                    : "The input of "}
                <span className="font-mono text-foreground">
                  {filledFrom.workflowId}
                </span>
                , started {formatRelativeTime(filledFrom.startTime)}.
                {isInputTouched
                  ? ""
                  : " Change what must differ before you start."}
              </FieldNote>
            ) : isKnownType && recent.isLoading ? (
              <FieldNote>Reading the inputs of recent runs…</FieldNote>
            ) : null}
            {differences.missing.length > 0 ? (
              <FieldNote>
                Every recent run also passes{" "}
                <KeyList keys={differences.missing} />.
              </FieldNote>
            ) : null}
            {differences.unknown.length > 0 ? (
              <FieldNote>
                No recent run passes <KeyList keys={differences.unknown} />.
              </FieldNote>
            ) : null}
            {samples.length > 0 ? (
              <FieldNote>
                The editor suggests the keys and values of{" "}
                {samples.length === 1
                  ? "the recent run"
                  : `${samples.length} recent runs`}
                . Press Ctrl+Space to see them.
              </FieldNote>
            ) : encodedCount > 0 ? (
              <FieldNote>
                The inputs of recent runs are encoded, and no Codec Server
                decoded them, so the form cannot suggest an input.
              </FieldNote>
            ) : null}
          </div>
        </TemporalField>

        <div className="flex flex-col gap-4 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="temporal-sws-toggle" className="text-xs">
                Signal-With-Start
              </Label>
              <p className="text-2xs text-muted-foreground">
                Deliver a signal in the same request that starts the workflow.
              </p>
            </div>
            <Switch
              id="temporal-sws-toggle"
              checked={useSignalWithStart}
              onCheckedChange={setUseSignalWithStart}
            />
          </div>

          {useSignalWithStart ? (
            <>
              <TemporalField htmlFor="temporal-sws-name" label="Signal Name">
                <Input
                  id="temporal-sws-name"
                  value={signalName}
                  onChange={(e) => setSignalName(e.target.value)}
                  placeholder="Signal name"
                  className="h-8 font-mono text-xs"
                />
              </TemporalField>
              <TemporalField
                htmlFor="temporal-sws-args"
                label="Signal Arguments (JSON)"
              >
                <Textarea
                  id="temporal-sws-args"
                  value={signalArgsText}
                  onChange={(e) => setSignalArgsText(e.target.value)}
                  rows={3}
                  className="font-mono text-xs md:text-xs"
                  spellCheck={false}
                />
                {parsedSignalArgs.error ? (
                  <p className="text-xs text-destructive">
                    {parsedSignalArgs.error}
                  </p>
                ) : null}
              </TemporalField>
            </>
          ) : null}
        </div>
      </div>

      <SheetFooter className="border-t border-border px-5 py-3 sm:items-center">
        {missingField ? (
          <p className="text-2xs text-muted-foreground sm:mr-auto">
            {missingField}
          </p>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          data-testid="temporal-start-submit"
        >
          <Play />
          {startWorkflow.isPending ? "Starting…" : "Start Execution"}
          <kbd className="ml-1 font-sans text-2xs opacity-70">
            {isMacPlatform() ? "⌘↵" : "Ctrl+↵"}
          </kbd>
        </Button>
      </SheetFooter>
    </SheetContent>
  );
}

function FieldNote(props: { children: React.ReactNode; testId?: string }) {
  return (
    <p
      className="text-2xs leading-snug text-muted-foreground"
      data-testid={props.testId}
    >
      {props.children}
    </p>
  );
}

function KeyList(props: { keys: string[] }) {
  return (
    <>
      {props.keys.map((key, index) => (
        <span key={key}>
          {index > 0 ? ", " : ""}
          <span className="font-mono text-foreground">{key}</span>
        </span>
      ))}
    </>
  );
}
