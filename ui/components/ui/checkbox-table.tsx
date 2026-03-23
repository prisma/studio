import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Square } from "lucide-react";
import * as React from "react";

import { cn } from "@/ui/lib/utils";

const CheckboxTable = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 bg-background data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className,
    )}
    {...props}
  >
    <span className="flex items-center justify-center text-current">
      {props.checked === "indeterminate" ||
        (props.checked === false && (
          <Square size={14} className="opacity-10" />
        ))}
      {props.checked === true && <Check size={16} />}
    </span>
  </CheckboxPrimitive.Root>
));
CheckboxTable.displayName = CheckboxPrimitive.Root.displayName;

export { CheckboxTable };
