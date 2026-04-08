import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

interface IntrospectionStatusNoticeProps {
  className?: string;
  compact?: boolean;
  description: string;
  isRetrying: boolean;
  message?: string;
  onRetry: () => void;
  queryPreview: string | null;
  source: string;
  title: string;
  variant?: "error" | "warning";
}

export function IntrospectionStatusNotice(
  props: IntrospectionStatusNoticeProps,
) {
  const {
    className,
    compact = false,
    description,
    isRetrying,
    message,
    onRetry,
    queryPreview,
    source,
    title,
    variant = "error",
  } = props;

  return (
    <div
      className={cn(
        "rounded-md border text-foreground",
        compact ? "px-3 py-2 text-xs" : "px-4 py-4 text-sm shadow-sm",
        variant === "error"
          ? "border-red-500/30 bg-red-500/10"
          : "border-amber-500/30 bg-amber-500/10",
        className,
      )}
    >
      <div
        className={cn(
          "gap-3",
          compact ? "flex items-start justify-between" : "flex flex-col",
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle size={14} />
            <span>{title}</span>
          </div>
          <p className="mt-1 text-foreground/80">{description}</p>
          {message ? (
            <p className="mt-2 text-foreground/70">{message}</p>
          ) : null}
          <p className="mt-2 text-foreground-neutral-weak">Source: {source}</p>
          {queryPreview ? (
            <code
              className={cn(
                "mt-2 block rounded-sm border border-border/60 bg-background/60 p-2 font-mono text-[11px] text-foreground/70",
                compact ? "truncate" : "whitespace-pre-wrap break-all",
              )}
            >
              {queryPreview}
            </code>
          ) : null}
        </div>
        <Button
          className={cn(compact ? "shrink-0" : "self-start")}
          onClick={onRetry}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw
            className={cn("mr-1 size-3", isRetrying && "animate-spin")}
          />
          Retry
        </Button>
      </div>
    </div>
  );
}
