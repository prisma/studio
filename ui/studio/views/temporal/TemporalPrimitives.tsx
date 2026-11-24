import {
  AlertTriangle,
  ArrowRightCircle,
  Ban,
  Check,
  CircleDot,
  CirclePause,
  Clock,
  type LucideIcon,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  TemporalFollowMode,
  TemporalSpanStatus,
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
import { Badge, type BadgeProps } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { useUiState } from "@/ui/hooks/use-ui-state";
import { cn } from "@/ui/lib/utils";

import {
  formatAbsoluteTime,
  formatRelativeTime,
  formatTime,
  type TemporalTimeFormat,
} from "./temporal-utils";

/**
 * Button icons at 14px with a finer stroke, the scale `StudioHeader` sets for
 * header controls. Portalled sheets and dialogs need it on their own content.
 */
export const temporalIconScale =
  "[&_button_svg]:size-3.5 [&_button_svg]:stroke-[1.75]";

/** Column-header type shared with the Queries table. */
export const temporalTableHeadClass =
  "h-9 whitespace-nowrap px-2 font-mono text-2xs font-medium uppercase tracking-loose";

export type TemporalTone = "danger" | "info" | "muted" | "neutral" | "warning";

const TONE_BADGE: Record<
  TemporalTone,
  { className?: string; iconClassName: string; variant: BadgeProps["variant"] }
> = {
  danger: {
    className: "text-foreground",
    iconClassName: "text-destructive",
    variant: "destructive",
  },
  info: {
    iconClassName: "text-prism-cyan-700 dark:text-prism-cyan-300",
    variant: "info",
  },
  muted: { iconClassName: "text-muted-foreground", variant: "secondary" },
  neutral: {
    iconClassName: "text-prism-cyan-600 dark:text-prism-cyan-400",
    variant: "outline",
  },
  warning: {
    iconClassName: "text-amber-700 dark:text-amber-300",
    variant: "warning",
  },
};

/**
 * Status badge whose label stays ink-coloured; the fill and icon carry the
 * status, so the label keeps its contrast on every tint.
 */
export function TemporalStatusBadge(props: {
  children: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
  tone: TemporalTone;
}) {
  const { children, className, icon: Icon, tone } = props;
  const style = TONE_BADGE[tone];

  return (
    <Badge variant={style.variant} className={cn(style.className, className)}>
      {Icon ? (
        <Icon
          aria-hidden
          className={cn("size-3 shrink-0", style.iconClassName)}
        />
      ) : null}
      {children}
    </Badge>
  );
}

/** How a span's status is named and coloured on every Temporal screen. */
export const TEMPORAL_SPAN_STATUS: Record<
  TemporalSpanStatus,
  { icon: LucideIcon; label: string; tone: TemporalTone }
> = {
  canceled: { icon: XCircle, label: "Canceled", tone: "muted" },
  completed: { icon: Check, label: "Completed", tone: "neutral" },
  failed: { icon: XCircle, label: "Failed", tone: "danger" },
  fired: { icon: Check, label: "Fired", tone: "neutral" },
  retrying: { icon: AlertTriangle, label: "Retrying", tone: "warning" },
  running: { icon: CircleDot, label: "Running", tone: "info" },
  "timed-out": { icon: Clock, label: "Timed Out", tone: "warning" },
};

const WORKFLOW_STATUS: Record<
  TemporalWorkflowStatus,
  { icon: LucideIcon; label: string; tone: TemporalTone }
> = {
  Canceled: { icon: Ban, label: "Canceled", tone: "muted" },
  Completed: { icon: Check, label: "Completed", tone: "neutral" },
  ContinuedAsNew: {
    icon: ArrowRightCircle,
    label: "Continued as New",
    tone: "neutral",
  },
  Failed: { icon: XCircle, label: "Failed", tone: "danger" },
  Paused: { icon: CirclePause, label: "Paused", tone: "warning" },
  Running: { icon: CircleDot, label: "Running", tone: "info" },
  Terminated: { icon: Ban, label: "Terminated", tone: "muted" },
  TimedOut: { icon: Clock, label: "Timed Out", tone: "warning" },
  Unspecified: { icon: Ban, label: "Unspecified", tone: "muted" },
};

/** A status as the screens name it: "Timed Out" for `TimedOut`. */
export function workflowStatusLabel(status: TemporalWorkflowStatus): string {
  return WORKFLOW_STATUS[status].label;
}

export function WorkflowStatusIcon(props: {
  className?: string;
  status: TemporalWorkflowStatus;
}) {
  const { className, status } = props;
  const { icon: Icon, tone } = WORKFLOW_STATUS[status];

  return (
    <Icon
      aria-hidden
      className={cn(
        "size-3 shrink-0",
        TONE_BADGE[tone].iconClassName,
        className,
      )}
    />
  );
}

export function TemporalSpanStatusIcon(props: {
  className?: string;
  status: TemporalSpanStatus;
}) {
  const { className, status } = props;
  const { icon: Icon, label, tone } = TEMPORAL_SPAN_STATUS[status];

  return (
    <Icon
      aria-label={label}
      role="img"
      className={cn(
        "size-3 shrink-0",
        TONE_BADGE[tone].iconClassName,
        className,
      )}
    />
  );
}

export function WorkflowStatusBadge(props: {
  className?: string;
  status: TemporalWorkflowStatus;
}) {
  const { className, status } = props;
  const { icon, label, tone } = WORKFLOW_STATUS[status];

  return (
    <TemporalStatusBadge className={className} icon={icon} tone={tone}>
      {label}
    </TemporalStatusBadge>
  );
}

/** Uppercase mono label above a block of content, as the navigation uses for its group labels. */
export function TemporalSectionLabel(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-mono text-2xs uppercase tracking-loose text-muted-foreground",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

/**
 * The body of a screen whose first request failed: what could not load, the
 * server's message as detail, and Retry. A screen that already shows data
 * keeps it and uses `TemporalRefreshError` instead.
 */
export function TemporalLoadError(props: {
  /** More actions beside Retry, such as a link to another screen. */
  children?: React.ReactNode;
  error: unknown;
  onRetry: () => void;
  /** One sentence, such as "Could not load the Task Queues of namespace default." */
  title: React.ReactNode;
}) {
  const { children, error, onRetry, title } = props;

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground"
      data-testid="temporal-load-error"
      role="alert"
    >
      <p className="font-medium text-foreground">{title}</p>
      {error instanceof Error && error.message ? (
        <p className="max-w-prose font-mono text-xs break-words">
          {error.message}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
        {children}
      </div>
    </div>
  );
}

/**
 * A strip above data that a later request failed to refresh. The data stays on
 * screen, so what the user typed or opened is not lost.
 */
export function TemporalRefreshError(props: {
  className?: string;
  error: unknown;
  onRetry: () => void;
}) {
  const { className, error, onRetry } = props;
  const detail = error instanceof Error ? error.message : "";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-amber-500/10 px-4 py-1.5 text-xs text-foreground",
        className,
      )}
      data-testid="temporal-refresh-error"
      role="status"
    >
      <span className="min-w-0">
        Could not refresh. This is the last data that loaded.
        {detail ? (
          <span className="ml-2 font-mono text-2xs break-words text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
      <Button variant="outline" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/** Shows which Temporal namespace a screen reads from and acts on. */
export function TemporalNamespaceBadge(props: { namespace: string }) {
  return (
    <Badge
      variant="secondary"
      className="shrink-0 font-mono font-normal"
      title={`Temporal namespace: ${props.namespace}`}
    >
      {props.namespace}
    </Badge>
  );
}

/** Label row plus control, with a fixed label height so side-by-side fields line up. */
export function TemporalField(props: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  htmlFor: string;
  label: string;
}) {
  const { action, children, className, htmlFor, label } = props;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex h-5 items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-xs">
          {label}
        </Label>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Single-choice segmented control built on the ShadCN `ToggleGroup`. */
export function TemporalSegmentedControl<T extends string>(props: {
  ariaLabel: string;
  className?: string;
  onChange: (value: T) => void;
  options: ReadonlyArray<{
    count?: number;
    label: string;
    title?: string;
    value: T;
  }>;
  value: T;
}) {
  const { ariaLabel, className, onChange, options, value } = props;

  return (
    <ToggleGroup
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-8 w-fit max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded-md border border-border bg-secondary/70 p-0.5",
        className,
      )}
      type="single"
      value={value}
      onValueChange={(next) => {
        const match = options.find((option) => option.value === next);

        if (match) {
          onChange(match.value);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          title={option.title}
          className="h-full flex-auto shrink-0 gap-1.5 whitespace-nowrap rounded-sm px-3 text-xs font-normal data-[state=on]:bg-background data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:shadow-xs data-[state=on]:ring-1 data-[state=on]:ring-border/80"
        >
          <span>{option.label}</span>
          {option.count !== undefined ? (
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {option.count.toLocaleString("en-US")}
            </span>
          ) : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export const TEMPORAL_TIME_FORMAT_UI_STATE_KEY = "temporal:time-format";

const TIME_FORMAT_OPTIONS = [
  { label: "Relative", title: "For example: 5m ago", value: "relative" },
  { label: "Local", title: "Your browser's time zone", value: "local" },
  { label: "UTC", title: "Coordinated Universal Time", value: "utc" },
] as const;

/** How every Temporal screen writes a point in time. The browser remembers the choice. */
export function useTemporalTimeFormat() {
  return useUiState<TemporalTimeFormat>(
    TEMPORAL_TIME_FORMAT_UI_STATE_KEY,
    "relative",
    { persistent: true },
  );
}

/**
 * The current time, read again every `intervalMs` while `isActive`. For text
 * that counts down, such as the time a Timer has left.
 */
export function useNow(intervalMs: number, isActive: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) {
      return;
    }

    setNow(Date.now());

    const timer = setInterval(() => setNow(Date.now()), intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs, isActive]);

  return now;
}

/** A point in time in the chosen format. The tooltip always holds all three. */
export function TemporalTime(props: { className?: string; iso?: string }) {
  const { className, iso } = props;
  const [format] = useTemporalTimeFormat();

  if (!iso) {
    return <span className={className}>—</span>;
  }

  return (
    <time
      className={className}
      dateTime={iso}
      title={`${formatAbsoluteTime(iso, "local")} local\n${formatAbsoluteTime(iso, "utc")}\n${formatRelativeTime(iso)}`}
    >
      {formatTime(iso, format)}
    </time>
  );
}

export function TemporalTimeFormatControl(props: { className?: string }) {
  const [format, setFormat] = useTemporalTimeFormat();

  return (
    <TemporalSegmentedControl
      ariaLabel="Time format"
      className={props.className}
      onChange={setFormat}
      options={TIME_FORMAT_OPTIONS}
      value={format}
    />
  );
}

const FOLLOW_OPTIONS = [
  {
    label: "Paused",
    title: "Refresh only when you press Refresh",
    value: "paused",
  },
  {
    label: "Live",
    title: "Refresh automatically every few seconds",
    value: "live",
  },
] as const;

/** `tail` refreshes on the same interval as `live`, so the control shows both as Live. */
export function TemporalFollowControl(props: {
  onChange: (mode: TemporalFollowMode) => void;
  value: TemporalFollowMode;
}) {
  const { onChange, value } = props;

  return (
    <TemporalSegmentedControl
      ariaLabel="Automatic refresh"
      onChange={onChange}
      options={FOLLOW_OPTIONS}
      value={value === "paused" ? "paused" : "live"}
    />
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="temporal-confirm-reason">{reasonLabel}</Label>
            <Input
              id="temporal-confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            variant={variant}
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
