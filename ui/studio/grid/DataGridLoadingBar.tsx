import { cn } from "@/ui/lib/utils";

export interface DataGridLoadingBarProps {
  className?: string;
}

/**
 * The Prism ray as a loading state (prisma.io/brand: "the ray is a state, not a
 * decoration"). A 1.5px line made of the three exact brand colours in a row
 * sweeps across while a query runs; softened ends keep it light, not a bar.
 * It only appears after 400ms (fast queries never flash it) and fades in.
 * With reduced motion the ray holds still at the start.
 */
export function DataGridLoadingBar({ className }: DataGridLoadingBarProps) {
  return (
    <div
      data-loading-bar
      role="progressbar"
      aria-label="Loading rows"
      className={cn(
        "pointer-events-none z-50 h-[1.5px] w-full overflow-hidden animate-ray-in",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-full w-1/3 animate-indeterminate",
          "[mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]",
          "motion-reduce:animate-none",
        )}
      >
        <span className="h-full flex-1 bg-prism-cyan/20" />
        <span className="h-full flex-1 bg-prism-yellow/20" />
        <span className="h-full flex-1 bg-prism-red/20" />
      </div>
    </div>
  );
}
