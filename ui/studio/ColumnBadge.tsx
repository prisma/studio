import { Key, KeyRound } from "lucide-react";

import { cn } from "@/ui/lib/utils";

export type ColumnBadgeKind = "foreign-key" | "nullable" | "primary-key";

const BADGE_STYLES: Record<ColumnBadgeKind, string> = {
  "foreign-key":
    "bg-prism-cyan-50 text-prism-cyan-800 ring-prism-cyan-200 dark:bg-prism-cyan-950 dark:text-prism-cyan-300 dark:ring-prism-cyan-800",
  nullable:
    "bg-secondary text-muted-foreground ring-border dark:ring-brand-neutral-700",
  "primary-key":
    "bg-prism-yellow-50 text-prism-yellow-800 ring-prism-yellow-200 dark:bg-prism-yellow-950 dark:text-prism-yellow-300 dark:ring-prism-yellow-800",
};

const BADGE_SIZES = {
  md: { badge: "size-[18px]", icon: 11, text: "text-[11px]" },
  sm: { badge: "size-4", icon: 10, text: "text-[10px]" },
} as const;

/**
 * Round column marker shared by the Visualizer cards, its legend and the grid
 * header: primary key (round key, yellow), foreign key (key, cyan) and
 * nullable (Prisma's optional `?`, neutral).
 */
export function ColumnBadge({
  className,
  kind,
  size = "md",
}: {
  className?: string;
  kind: ColumnBadgeKind;
  size?: keyof typeof BADGE_SIZES;
}) {
  const sizing = BADGE_SIZES[size];

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
        sizing.badge,
        BADGE_STYLES[kind],
        className,
      )}
    >
      {kind === "primary-key" ? (
        <KeyRound size={sizing.icon} strokeWidth={2.25} />
      ) : kind === "foreign-key" ? (
        <Key size={sizing.icon} strokeWidth={2.25} />
      ) : (
        <span
          className={cn("font-sans leading-none font-semibold", sizing.text)}
        >
          ?
        </span>
      )}
    </span>
  );
}
