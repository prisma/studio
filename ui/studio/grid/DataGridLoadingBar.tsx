import { cn } from "@/ui/lib/utils";

export interface DataGridLoadingBarProps {
  className?: string;
}

export function DataGridLoadingBar({ className }: DataGridLoadingBarProps) {
  return (
    <div
      data-loading-bar
      className={cn(
        "h-[2px] w-full overflow-hidden bg-table-border z-50",
        className,
      )}
    >
      <div className="animate-indeterminate h-full w-1/3 rounded-r-full bg-primary" />
    </div>
  );
}
