import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  TriangleAlertIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Query } from "../../../../data";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { useUiState } from "../../../hooks/use-ui-state";
import { cn } from "../../../lib/utils";
import { StudioOperationEvent } from "../../Studio";

interface OperationEventEntryProps {
  event: StudioOperationEvent;
}

const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString();
};

const getQueryPreview = (query?: Query<unknown>): string => {
  if (!query || !query.sql) return "No query";
  const sqlPreview = query.sql.substring(0, 100);
  return query.sql.length > 100 ? `${sqlPreview}...` : sqlPreview;
};

export function OperationEventEntry({ event }: OperationEventEntryProps) {
  const [isQueryExpanded, setIsQueryExpanded] = useUiState<boolean>(
    `operation-event:${event.eventId}:query-expanded`,
    false,
    { cleanupOnUnmount: true },
  );
  const isError = event.name === "studio_operation_error";

  return (
    <div className="flex flex-col gap-2">
      <Card
        className={cn(
          "w-full rounded-md border-border overflow-clip shadow-none",
        )}
      >
        <CardHeader
          className={cn(
            "px-3 py-2 font-normal",
            "border-b",
            isError
              ? "border-prism-red/25 bg-prism-red/8"
              : "border-prism-cyan/30 bg-prism-cyan/10",
          )}
        >
          <CardTitle className="flex items-center justify-between gap-3 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full text-[#151515]",
                  isError ? "bg-prism-red" : "bg-prism-cyan",
                )}
              >
                {isError ? (
                  <X size={10} strokeWidth={3} />
                ) : (
                  <Check size={10} strokeWidth={3} />
                )}
              </span>
              <span className="font-semibold text-foreground">
                {event.payload.operation}
                <span className="font-normal text-muted-foreground">
                  , {formatTimestamp(event.timestamp)}
                </span>
              </span>
            </div>
            <span className="font-sans text-xs font-medium text-foreground/70">
              {event.name === "studio_operation_success" ? "Success" : "Error"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-3">
          {event.payload.query && (
            <div data-response-type="query" className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setIsQueryExpanded(!isQueryExpanded)}
                className="flex w-fit items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-expanded={isQueryExpanded}
              >
                {isQueryExpanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
                SQL Query
              </button>
              {/* Copy lives on the block it copies. */}
              <div className="group relative">
                <div
                  className={cn(
                    "rounded-md bg-muted py-2 pr-10 pl-3 font-mono text-xs leading-5 text-foreground",
                    isQueryExpanded
                      ? "block max-h-64 overflow-y-auto whitespace-pre-wrap"
                      : "truncate whitespace-pre",
                  )}
                >
                  {isQueryExpanded
                    ? event.payload.query.sql
                    : getQueryPreview(event.payload.query)}
                </div>
                <Button
                  aria-label="Copy SQL query"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 size-7 text-muted-foreground hover:bg-background hover:text-foreground [&_svg]:size-3.5"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      event.payload.query?.sql || "",
                    );
                    toast.success("Query copied to clipboard");
                  }}
                >
                  <Copy data-icon="inline-start" />
                </Button>
              </div>
              <div className="flex min-w-0 items-baseline gap-2 text-xs">
                <span className="shrink-0 text-muted-foreground">
                  Parameters
                </span>
                <code className="min-w-0 break-all font-mono text-foreground/80">
                  {JSON.stringify(event.payload.query.parameters || [])}
                </code>
              </div>
            </div>
          )}
          {isError && event.payload.error && (
            <div data-response-type="error" className="flex flex-col gap-2">
              <div className="flex items-center justify-between relative">
                <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <TriangleAlertIcon size={12} />
                  Error Details
                </span>
              </div>
              {event.payload.error.adapterSource ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Adapter</span>
                  <div className="px-3 py-2.5 bg-muted rounded-md text-xs font-mono text-foreground overflow-x-auto">
                    {event.payload.error.adapterSource}
                  </div>
                </div>
              ) : null}
              <div className="px-3 py-2.5 bg-prism-red/8 border-l-2 border-prism-red rounded-md text-xs font-mono overflow-x-auto">
                <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
                  {event.payload.error instanceof AggregateError
                    ? event.payload.error.errors.map(
                        (err: Error, index: number) => (
                          <div key={index}>{err.message}</div>
                        ),
                      )
                    : event.payload.error.message}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
