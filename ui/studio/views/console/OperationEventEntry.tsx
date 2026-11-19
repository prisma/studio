import { Check, ChevronRight, Copy, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../../components/ui/button";
import { TableCell, TableRow } from "../../../components/ui/table";
import { useUiState } from "../../../hooks/use-ui-state";
import { cn } from "../../../lib/utils";
import { StudioOperationEvent } from "../../Studio";

interface OperationEventEntryProps {
  event: StudioOperationEvent;
}

export const OPERATION_EVENT_COLUMN_COUNT = 5;

const LABEL_CLASSES =
  "font-mono text-2xs uppercase tracking-loose text-muted-foreground";

const formatTimestamp = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
  });

function getErrorMessages(error: Error): string[] {
  return error instanceof AggregateError
    ? error.errors.map((inner: Error) => inner.message)
    : [error.message];
}

/**
 * One Console log row: status, operation, a one-line SQL preview (or the error
 * message when it failed), status and time. Clicking the row opens the full SQL,
 * parameters and copy underneath; failed rows start open.
 */
export function OperationEventEntry({ event }: OperationEventEntryProps) {
  const isError = event.name === "studio_operation_error";
  const [isExpanded, setIsExpanded] = useUiState<boolean>(
    `operation-event:${event.eventId}:query-expanded`,
    isError,
    { cleanupOnUnmount: true },
  );
  const { error, operation, query } = event.payload;
  const errorMessages = isError && error ? getErrorMessages(error) : [];
  const preview = errorMessages[0] ?? query?.sql ?? "No query";
  const detailsId = `operation-event-${event.eventId}-details`;

  return (
    <>
      <TableRow
        className={cn(
          "group/row cursor-pointer border-border text-xs hover:bg-muted/70",
          isExpanded && "border-b-0 bg-muted/40",
        )}
        data-operation-status={isError ? "error" : "success"}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <TableCell className="py-2.5 pr-0 pl-3">
          <span className="flex items-center gap-1.5">
            {/* Disclosure cue: the row expands, the chevron turns down. */}
            <ChevronRight
              aria-hidden
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover/row:text-foreground motion-reduce:transition-none",
                isExpanded && "rotate-90 text-foreground",
              )}
            />
            {/* Just the mark in the brand colour: a column of filled circles gets loud. */}
            {isError ? (
              <X
                aria-hidden
                className="size-4 shrink-0 text-prism-red"
                strokeWidth={2.5}
              />
            ) : (
              <Check
                aria-hidden
                className="size-4 shrink-0 text-prism-cyan"
                strokeWidth={2.5}
              />
            )}
          </span>
        </TableCell>
        <TableCell className="truncate px-3 py-2.5 font-mono font-medium text-foreground">
          {operation}
        </TableCell>
        <TableCell className="px-3 py-2.5">
          {/* The row is clickable; this button carries the state for keyboards and screen readers. */}
          <button
            aria-controls={detailsId}
            aria-expanded={isExpanded}
            className={cn(
              "block w-full truncate rounded-sm text-left font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isError ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            title={isExpanded ? "Hide details" : "Show details"}
            type="button"
          >
            {preview}
          </button>
        </TableCell>
        <TableCell
          className={cn(
            "px-3 py-2.5",
            isError ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {isError ? "Error" : "Success"}
        </TableCell>
        <TableCell className="py-2.5 pr-4 pl-3 text-right font-mono text-muted-foreground tabular-nums">
          {formatTimestamp(event.timestamp)}
        </TableCell>
      </TableRow>
      {isExpanded ? (
        <TableRow
          className="border-border bg-muted/40 hover:bg-muted/40"
          id={detailsId}
        >
          <TableCell
            className="pt-1 pr-4 pb-4 pl-17"
            colSpan={OPERATION_EVENT_COLUMN_COUNT}
          >
            <div className="flex flex-col gap-3">
              {query ? (
                <div data-response-type="query" className="flex flex-col gap-2">
                  <span className={LABEL_CLASSES}>SQL</span>
                  <div className="relative rounded-md border border-border bg-background">
                    <pre className="max-h-64 overflow-y-auto py-2 pr-10 pl-3 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground">
                      {query.sql}
                    </pre>
                    <Button
                      aria-label="Copy SQL query"
                      className="absolute top-1 right-1 size-7 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
                      onClick={() => {
                        void navigator.clipboard.writeText(query.sql || "");
                        toast.success("Query copied to clipboard");
                      }}
                      size="icon"
                      variant="ghost"
                    >
                      <Copy data-icon="inline-start" />
                    </Button>
                  </div>
                  <div className="flex min-w-0 items-baseline gap-2 text-xs">
                    <span className={cn("shrink-0", LABEL_CLASSES)}>
                      Parameters
                    </span>
                    <code className="min-w-0 break-all font-mono text-muted-foreground">
                      {JSON.stringify(query.parameters || [])}
                    </code>
                  </div>
                </div>
              ) : null}
              {isError && error ? (
                <div data-response-type="error" className="flex flex-col gap-2">
                  {error.adapterSource ? (
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className={LABEL_CLASSES}>Adapter</span>
                      <code className="font-mono text-muted-foreground">
                        {error.adapterSource}
                      </code>
                    </div>
                  ) : null}
                  <pre className="overflow-x-auto rounded-md border-l-2 border-prism-red bg-prism-red/8 px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground">
                    {errorMessages.join("\n")}
                  </pre>
                </div>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
