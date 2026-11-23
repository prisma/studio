import { ChevronDown, ChevronRight, Copy, XCircle } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import type { TemporalFailureInfo } from "@/data/temporal";
import {
  describeRetryState,
  failureOrigin,
  parseStackTrace,
  rootCauseOf,
  shortenPath,
  type StackFrame,
} from "@/data/temporal/failure";
import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/utils";

import { pluralize, safeJsonPretty } from "./temporal-utils";

function frameLocation(frame: StackFrame, short: boolean): string {
  const file = frame.file
    ? short
      ? shortenPath(frame.file)
      : frame.file
    : "unknown file";

  return frame.line === undefined ? file : `${file}:${frame.line}`;
}

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text);
  toast.success(`Copied ${what}`);
}

/** `Start-To-Close` for `START_TO_CLOSE`. */
function timeoutName(timeoutType: string): string {
  return timeoutType
    .toLowerCase()
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join("-");
}

/** The failures from the outer one down to the cause that holds the reason. */
function chainOf(failure: TemporalFailureInfo): TemporalFailureInfo[] {
  const chain: TemporalFailureInfo[] = [];

  for (
    let current: TemporalFailureInfo | undefined = failure;
    current;
    current = current.cause
  ) {
    chain.push(current);
  }

  return chain;
}

function Fact(props: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 text-foreground">{props.children}</dd>
    </div>
  );
}

/**
 * A failure of a Workflow or of one of its steps, as an answer to three
 * questions: what failed, where in the code, and what the server did about
 * it. The stack trace is one click away, with library code told apart from
 * the user's own.
 *
 * Studio does not have the Worker's source, so "where" is the function, the
 * file and the line from the stack trace, not the code itself.
 */
export function TemporalFailurePanel(props: {
  /** Which attempt failed, for an Activity. */
  attempt?: number;
  className?: string;
  failure: TemporalFailureInfo;
}) {
  const { attempt, className, failure } = props;
  const stackId = useId();
  const [isStackOpen, setIsStackOpen] = useState(false);
  const root = rootCauseOf(failure);
  const chain = chainOf(failure);
  const origin = failureOrigin(failure);
  const stackTrace = root.stackTrace ?? failure.stackTrace;
  const frames = parseStackTrace(stackTrace);
  const libraryFrameCount = frames.filter((frame) => frame.isLibrary).length;
  const timeoutType = root.timeoutType ?? failure.timeoutType;
  const retry =
    describeRetryState(failure.retryState ?? root.retryState) ??
    (root.isNonRetryable
      ? "Not retried: the failure is marked non-retryable."
      : // A timeout that wraps the reason is what ended the retries.
        failure.timeoutType && failure !== root
        ? `Not retried: its ${timeoutName(failure.timeoutType)} timeout passed.`
        : undefined);
  const title =
    root.type ??
    failure.type ??
    (timeoutType ? `${timeoutName(timeoutType)} Timeout` : "Failure");
  // A message that only repeats the type says nothing more.
  const message = root.message.startsWith(`${title}: `)
    ? root.message.slice(title.length + 2)
    : root.message;

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-destructive/30 bg-destructive/5 font-sans text-xs",
        className,
      )}
      data-testid="temporal-failure"
    >
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center gap-1.5">
          <XCircle aria-hidden className="size-3.5 shrink-0 text-destructive" />
          <span className="font-mono text-sm font-semibold text-foreground">
            {title}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground">
          {message}
        </p>
      </div>

      <dl className="flex flex-col gap-1.5 border-t border-destructive/20 p-3">
        {origin ? (
          <Fact label="Thrown in">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              {origin.functionName ? (
                <span className="font-mono font-medium">
                  {origin.functionName}
                </span>
              ) : null}
              <span
                className="truncate font-mono text-muted-foreground"
                title={frameLocation(origin, false)}
              >
                {frameLocation(origin, true)}
              </span>
              <Button
                variant="ghost"
                size="xs"
                aria-label="Copy the file and line"
                title="Copy the file and line"
                className="h-5 w-5 px-0 text-muted-foreground"
                onClick={() =>
                  copy(
                    `${frameLocation(origin, false)}${origin.column === undefined ? "" : `:${origin.column}`}`,
                    "the file and line",
                  )
                }
              >
                <Copy />
              </Button>
            </span>
          </Fact>
        ) : null}
        {retry || attempt ? (
          <Fact label="Retry">
            {attempt ? `Attempt ${attempt}. ` : ""}
            {retry ?? ""}
          </Fact>
        ) : null}
        {chain.length > 1 ? (
          <Fact label="Reported as">
            {chain
              .slice(0, -1)
              .map((item) => item.message)
              .join(" → ")}
          </Fact>
        ) : null}
        {root.details !== undefined ? (
          <Fact label="Details">
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {safeJsonPretty(root.details)}
            </pre>
          </Fact>
        ) : null}
      </dl>

      {stackTrace ? (
        <div className="border-t border-destructive/20">
          <div className="flex items-center justify-between gap-2 pr-2">
            <button
              type="button"
              aria-controls={stackId}
              aria-expanded={isStackOpen}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-b-md px-3 py-2 text-left text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              onClick={() => setIsStackOpen((open) => !open)}
            >
              {isStackOpen ? (
                <ChevronDown aria-hidden className="size-3.5 shrink-0" />
              ) : (
                <ChevronRight aria-hidden className="size-3.5 shrink-0" />
              )}
              <span className="font-medium text-foreground">Stack Trace</span>
              {frames.length > 0 ? (
                <span>
                  {pluralize(frames.length, "frame")}
                  {libraryFrameCount > 0
                    ? `, ${libraryFrameCount} in library code`
                    : ""}
                </span>
              ) : null}
            </button>
            {isStackOpen ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() => copy(stackTrace, "the stack trace")}
              >
                <Copy />
                Copy
              </Button>
            ) : null}
          </div>
          {isStackOpen ? (
            <div id={stackId} className="max-h-64 overflow-auto px-3 pb-3">
              {frames.length > 0 ? (
                <ol className="flex flex-col gap-1">
                  {frames.map((frame, index) => (
                    <li
                      key={index}
                      className={cn(
                        "flex flex-wrap items-baseline gap-x-2 font-mono",
                        // Library code is fainter, so the user's own frames stand out.
                        frame.isLibrary
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                      title={frame.raw}
                    >
                      <span className={cn(!frame.isLibrary && "font-medium")}>
                        {frame.functionName ?? "(anonymous)"}
                      </span>
                      <span className="text-2xs text-muted-foreground">
                        {frameLocation(frame, true)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-foreground">
                  {stackTrace}
                </pre>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
