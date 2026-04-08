import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Query } from "../../../../data";
import { Badge } from "../../../components/ui/badge";
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
          "w-full rounded-sm border-ring/20 overflow-clip shadow-none",
        )}
      >
        <CardHeader
          className={cn(
            "p-3 font-normal",
            isError
              ? "border-red-500/60 bg-red-500/10"
              : "border-green-500/60 bg-green-500/10",
          )}
        >
          <CardTitle className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-2">
              {isError ? (
                <AlertCircle size={16} className="text-red-500" />
              ) : (
                <CheckCircle size={16} className="text-green-500" />
              )}
              <span className="">
                {event.payload.operation}, {formatTimestamp(event.timestamp)}
              </span>
            </div>
            <Badge
              variant={isError ? "destructive" : "success"}
              className="font-normal text-xs"
            >
              {event.name === "studio_operation_success" ? "Success" : "Error"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-3">
          {event.payload.query && (
            <div data-response-type="query" className="flex flex-col gap-2">
              <div className="flex items-center justify-between relative">
                <button
                  type="button"
                  onClick={() => setIsQueryExpanded(!isQueryExpanded)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground-neutral"
                  aria-expanded={isQueryExpanded}
                >
                  {isQueryExpanded ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                  SQL Query
                </button>
                <Button
                  aria-label="Copy SQL query"
                  variant="outline"
                  size="icon"
                  className="size-6"
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
              <div
                className={cn(
                  "p-3 bg-secondary/50 border border-border rounded-sm text-xs font-mono overflow-x-auto",
                  isQueryExpanded
                    ? "block whitespace-pre-wrap max-h-64 overflow-y-auto"
                    : "max-h-10 overflow-hidden",
                )}
              >
                {isQueryExpanded
                  ? event.payload.query.sql
                  : getQueryPreview(event.payload.query)}
              </div>
              {
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Parameters
                  </span>
                  <div className="p-3 bg-secondary/50 border border-border rounded-sm text-xs font-mono overflow-x-auto">
                    {JSON.stringify(
                      event.payload.query.parameters || [],
                      null,
                      2,
                    )}
                  </div>
                </div>
              }
            </div>
          )}
          {isError && event.payload.error && (
            <div data-response-type="error" className="flex flex-col gap-2">
              <div className="flex items-center justify-between relative">
                <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground-neutral">
                  <TriangleAlertIcon size={12} />
                  Error Details
                </span>
              </div>
              {event.payload.error.adapterSource ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Adapter</span>
                  <div className="p-3 bg-secondary/50 border border-border rounded-sm text-xs font-mono overflow-x-auto">
                    {event.payload.error.adapterSource}
                  </div>
                </div>
              ) : null}
              <div className="p-3 bg-secondary/50 border border-red-400/20 rounded-sm text-xs font-mono overflow-x-auto">
                <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono">
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
