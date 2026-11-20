import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/ui/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.25 whitespace-nowrap rounded-md border border-transparent px-2 py-0.5 text-xs font-medium leading-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        default: "bg-chart-1/10 text-foreground",
        secondary: "bg-muted text-muted-foreground",
        destructive: "bg-destructive/15 text-destructive",
        success: "bg-prism-cyan/20 text-foreground",
        outline: "border-border bg-transparent text-foreground",
        warning: "bg-prism-yellow/25 text-foreground",
        info: "bg-prism-cyan/20 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
