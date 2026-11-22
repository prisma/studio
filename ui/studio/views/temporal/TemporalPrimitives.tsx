import {
  ArrowRightCircle,
  Ban,
  Check,
  CircleDot,
  Clock,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  TemporalFollowMode,
  TemporalWorkflowStatus,
} from "@/data/temporal";
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
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { cn } from "@/ui/lib/utils";

import { statusBadgeClasses } from "./temporal-utils";

export function WorkflowStatusIcon(props: {
  className?: string;
  status: TemporalWorkflowStatus;
}) {
  const { className, status } = props;
  switch (status) {
    case "Running":
      return (
        <CircleDot
          aria-hidden
          className={cn("size-3 motion-safe:animate-pulse", className)}
        />
      );
    case "Completed":
      return (
        <Check
          aria-hidden
          className={cn(
            "size-3 text-prism-cyan-600 dark:text-prism-cyan-400",
            className,
          )}
        />
      );
    case "Failed":
      return <XCircle aria-hidden className={cn("size-3", className)} />;
    case "TimedOut":
      return <Clock aria-hidden className={cn("size-3", className)} />;
    case "ContinuedAsNew":
      return (
        <ArrowRightCircle aria-hidden className={cn("size-3", className)} />
      );
    default:
      return <Ban aria-hidden className={cn("size-3", className)} />;
  }
}

export function WorkflowStatusBadge(props: {
  className?: string;
  status: TemporalWorkflowStatus;
}) {
  const { className, status } = props;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium text-[11px]",
        statusBadgeClasses(status),
        className,
      )}
    >
      <WorkflowStatusIcon status={status} />
      <span>{status}</span>
    </Badge>
  );
}

export function TemporalFollowControl(props: {
  onChange: (mode: TemporalFollowMode) => void;
  value: TemporalFollowMode;
}) {
  const { onChange, value } = props;
  return (
    <ToggleGroup
      aria-label="Live refresh mode"
      className="gap-0.5 rounded-md border border-border bg-secondary p-0.5"
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next === "paused" || next === "live" || next === "tail") {
          onChange(next);
        }
      }}
    >
      {(["paused", "live", "tail"] as const).map((mode) => (
        <ToggleGroupItem
          key={mode}
          value={mode}
          size="sm"
          className="h-6 border-0 bg-transparent px-2 text-[11px] font-normal capitalize text-muted-foreground shadow-none hover:bg-background/70 hover:text-foreground data-[state=on]:bg-background data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:shadow-2xs"
        >
          {mode}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function TemporalConfirmDialog(props: {
  confirmLabel: string;
  defaultReason?: string;
  description: string;
  isPending?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  showReasonInput?: boolean;
  title: string;
  variant?: "destructive" | "default";
}) {
  const {
    confirmLabel,
    defaultReason = "",
    description,
    isPending = false,
    onConfirm,
    onOpenChange,
    open,
    reasonLabel = "Reason",
    reasonPlaceholder = "Operator action via Prisma Studio",
    showReasonInput = false,
    title,
    variant = "destructive",
  } = props;

  const [reason, setReason] = useState(defaultReason);

  useEffect(() => {
    if (open) {
      setReason(defaultReason);
    }
  }, [defaultReason, open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {showReasonInput ? (
          <div className="space-y-1.5 py-1">
            <Label htmlFor="temporal-confirm-reason" className="text-xs">
              {reasonLabel}
            </Label>
            <Input
              id="temporal-confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              className="h-8 text-xs"
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className={cn(
              variant === "destructive" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            onClick={(e) => {
              e.preventDefault();
              void Promise.resolve(onConfirm(reason.trim())).then(() => {
                onOpenChange(false);
              });
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
