import { Play, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { TemporalGroupedSpan } from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { Textarea } from "@/ui/components/ui/textarea";
import {
  type TemporalHandlerDefinition,
  useTemporalActions,
  useTemporalWorkflowMetadata,
} from "@/ui/hooks/use-temporal";

import { parseJsonArgsText, safeJsonPretty } from "./temporal-utils";
import {
  TemporalField,
  TemporalSectionLabel,
  TemporalSegmentedControl,
} from "./TemporalPrimitives";

type InteractKind = "query" | "signal" | "update";

const KIND_LABEL: Record<InteractKind, string> = {
  query: "Query",
  signal: "Signal",
  update: "Update",
};

const SUBMIT_LABEL: Record<InteractKind, string> = {
  query: "Run Query",
  signal: "Send Signal",
  update: "Execute Update",
};

const KIND_OPTIONS = [
  { label: "Query", value: "query" },
  { label: "Signal", value: "signal" },
  { label: "Update", value: "update" },
] as const;

interface InteractOutput {
  durationMs?: number;
  error?: string;
  label: string;
  value?: unknown;
}

/** The names of the Signals and Updates this run already received. */
function namesSeenInHistory(
  spans: TemporalGroupedSpan[],
  kind: "signal" | "update",
): string[] {
  const prefix = kind === "signal" ? "Signal: " : "Update: ";

  return Array.from(
    new Set(
      spans
        .filter((span) => span.kind === kind && span.label.startsWith(prefix))
        .map((span) => span.label.slice(prefix.length)),
    ),
  );
}

function withHistoryNames(
  reported: TemporalHandlerDefinition[],
  seen: string[],
): TemporalHandlerDefinition[] {
  const known = new Set(reported.map((handler) => handler.name));

  return [
    ...reported,
    ...seen
      .filter((name) => !known.has(name))
      .map((name) => ({ description: "Seen in this run's history", name })),
  ];
}

export function TemporalInteractPanel(props: {
  isRunning: boolean;
  namespace: string;
  runId?: string;
  spans: TemporalGroupedSpan[];
  workflowId: string;
}) {
  const { isRunning, namespace, runId, spans, workflowId } = props;
  const metadata = useTemporalWorkflowMetadata({
    namespace,
    runId,
    workflowId,
  });
  const { queryWorkflow, signalWorkflow, updateWorkflow } =
    useTemporalActions(namespace);

  const run = async (
    kind: InteractKind,
    name: string,
    args: unknown[],
  ): Promise<InteractOutput> => {
    try {
      if (kind === "query") {
        const res = await queryWorkflow.mutateAsync({
          args,
          queryType: name,
          runId,
          workflowId,
        });

        return {
          durationMs: res.durationMs,
          label: `Query "${name}"`,
          value: res.rejected
            ? { rejected: true, status: res.rejectedStatus }
            : res.result,
        };
      }

      if (kind === "signal") {
        await signalWorkflow.mutateAsync({
          args,
          runId,
          signalName: name,
          workflowId,
        });
        toast.success(`Sent signal "${name}" to ${workflowId}`);

        return {
          label: `Signal "${name}" delivered`,
          value: { ok: true, signal: name },
        };
      }

      const res = await updateWorkflow.mutateAsync({
        args,
        runId,
        updateName: name,
        workflowId,
      });

      return {
        durationMs: res.durationMs,
        error: res.failure?.message,
        label: `Update "${name}" (${res.outcome})`,
        value: res.result,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        label: `${KIND_LABEL[kind]} "${name}" failed`,
      };
    }
  };

  const groups = useMemo(
    () => [
      { handlers: metadata.data?.queries ?? [], kind: "query" as const },
      {
        handlers: withHistoryNames(
          metadata.data?.signals ?? [],
          namesSeenInHistory(spans, "signal"),
        ),
        kind: "signal" as const,
      },
      {
        handlers: withHistoryNames(
          metadata.data?.updates ?? [],
          namesSeenInHistory(spans, "update"),
        ),
        kind: "update" as const,
      },
    ],
    [metadata.data, spans],
  );
  const hasHandlers = groups.some((group) => group.handlers.length > 0);

  return (
    <div className="flex flex-col gap-5" data-testid="temporal-interact-panel">
      {metadata.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      ) : null}

      {!isRunning && hasHandlers ? (
        <p className="text-2xs text-muted-foreground">
          This run is closed. It still answers Queries, but takes no Signal or
          Update.
        </p>
      ) : null}

      {groups.map((group) =>
        group.handlers.length > 0 ? (
          <div key={group.kind} className="flex flex-col gap-1.5">
            <TemporalSectionLabel>
              {group.kind === "query"
                ? "Queries"
                : group.kind === "signal"
                  ? "Signals"
                  : "Updates"}
            </TemporalSectionLabel>
            <div className="flex flex-col rounded-md border border-border [&>*+*]:border-t [&>*+*]:border-border/60">
              {group.handlers.map((handler) => (
                <HandlerRow
                  key={handler.name}
                  // A closed run still answers Queries, but takes no Signal or Update.
                  disabled={group.kind !== "query" && !isRunning}
                  handler={handler}
                  kind={group.kind}
                  onRun={(args) => run(group.kind, handler.name, args)}
                />
              ))}
            </div>
          </div>
        ) : null,
      )}

      {!metadata.isLoading && !metadata.data ? (
        <p className="text-2xs text-muted-foreground">
          No Worker reported the handlers of this Workflow
          {metadata.error instanceof Error
            ? ` (${metadata.error.message})`
            : ""}
          . Type a name below.
        </p>
      ) : null}

      {metadata.data && !hasHandlers ? (
        <p className="text-2xs text-muted-foreground">
          This Workflow defines no Query, Signal or Update handler. You can
          still send one by name.
        </p>
      ) : null}

      <CustomInteraction collapsed={hasHandlers} onRun={run} />
    </div>
  );
}

function HandlerRow(props: {
  disabled: boolean;
  handler: TemporalHandlerDefinition;
  kind: InteractKind;
  onRun: (args: unknown[]) => Promise<InteractOutput>;
}) {
  const { disabled, handler, kind, onRun } = props;
  const [argsOpen, setArgsOpen] = useState(false);
  const [argsText, setArgsText] = useState("[]");
  const [isPending, setIsPending] = useState(false);
  const [output, setOutput] = useState<InteractOutput | null>(null);

  const submit = async (args: unknown[]) => {
    setIsPending(true);
    setOutput(await onRun(args));
    setIsPending(false);
  };
  const submitTypedArgs = () => {
    const parsed = parseJsonArgsText(argsText);

    if (parsed.error) {
      setOutput({ error: parsed.error, label: "Invalid JSON" });
      return;
    }

    void submit(parsed.args ?? []);
  };

  return (
    <div
      className="flex flex-col gap-2 px-2.5 py-2 text-xs"
      data-testid={`temporal-handler-${kind}-${handler.name}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono font-medium text-foreground">
          {handler.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            aria-expanded={argsOpen}
            onClick={() => setArgsOpen((open) => !open)}
          >
            Args
          </Button>
          {/* A Query changes nothing, so it runs in one click. A Signal or an Update asks for its arguments first. */}
          <Button
            variant="outline"
            size="xs"
            disabled={disabled || isPending}
            onClick={() => {
              if (kind === "query" && !argsOpen) {
                void submit([]);
              } else if (!argsOpen) {
                setArgsOpen(true);
              } else {
                submitTypedArgs();
              }
            }}
          >
            {kind === "query" ? <Play /> : <Send />}
            {kind === "query" ? "Run" : argsOpen ? "Send" : KIND_LABEL[kind]}
          </Button>
        </div>
      </div>
      {handler.description ? (
        <p className="-mt-1 text-2xs text-muted-foreground">
          {handler.description}
        </p>
      ) : null}
      {argsOpen ? (
        <Textarea
          aria-label={`Arguments for ${handler.name} (JSON array)`}
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          rows={2}
          className="font-mono text-xs md:text-xs"
          spellCheck={false}
        />
      ) : null}
      {output ? <InteractOutputBlock output={output} /> : null}
    </div>
  );
}

function CustomInteraction(props: {
  collapsed: boolean;
  onRun: (
    kind: InteractKind,
    name: string,
    args: unknown[],
  ) => Promise<InteractOutput>;
}) {
  const { collapsed, onRun } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<InteractKind>("query");
  const [name, setName] = useState("");
  const [argsText, setArgsText] = useState("[]");
  const [isPending, setIsPending] = useState(false);
  const [output, setOutput] = useState<InteractOutput | null>(null);

  if (collapsed && !isOpen) {
    return (
      <Button
        variant="ghost"
        size="xs"
        className="self-start text-muted-foreground"
        onClick={() => setIsOpen(true)}
      >
        Use another name
      </Button>
    );
  }

  const submit = async () => {
    const parsed = parseJsonArgsText(argsText);

    if (parsed.error) {
      setOutput({ error: parsed.error, label: "Invalid JSON" });
      return;
    }

    if (!name.trim()) {
      setOutput({ error: "Enter a name first", label: "Validation" });
      return;
    }

    setIsPending(true);
    setOutput(await onRun(kind, name.trim(), parsed.args ?? []));
    setIsPending(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <TemporalSegmentedControl
        ariaLabel="Interaction type"
        className="w-full"
        onChange={(next) => {
          setKind(next);
          setOutput(null);
        }}
        options={KIND_OPTIONS}
        value={kind}
      />
      <TemporalField
        htmlFor="temporal-interact-name"
        label={`${KIND_LABEL[kind]} Name`}
      >
        <Input
          id="temporal-interact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 font-mono text-xs"
        />
      </TemporalField>
      <TemporalField htmlFor="temporal-interact-args" label="Arguments (JSON)">
        <Textarea
          id="temporal-interact-args"
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          rows={3}
          className="font-mono text-xs md:text-xs"
          spellCheck={false}
        />
      </TemporalField>
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => void submit()}
        data-testid="temporal-interact-submit"
      >
        <Send />
        {SUBMIT_LABEL[kind]}
      </Button>
      {output ? <InteractOutputBlock output={output} /> : null}
    </div>
  );
}

function InteractOutputBlock(props: { output: InteractOutput }) {
  const { output } = props;

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2.5"
      data-testid="temporal-interact-output"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{output.label}</span>
        {output.durationMs != null ? (
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {output.durationMs}ms
          </span>
        ) : null}
      </div>
      {output.error ? (
        <pre className="whitespace-pre-wrap font-mono text-xs text-destructive">
          {output.error}
        </pre>
      ) : (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-xs text-foreground">
          {safeJsonPretty(output.value)}
        </pre>
      )}
    </div>
  );
}
