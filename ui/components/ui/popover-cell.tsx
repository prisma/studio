import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  createContext,
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { isGridInteractionSuppressionActive } from "@/ui/lib/grid-interaction-suppression";
import { cn } from "@/ui/lib/utils";

interface PopoverCellContextValue {
  commitInteractOutside: () => void;
  open: boolean;
  registerInteractOutsideAction: (action: (() => void) | null) => void;
  setOpen: (open: boolean) => void;
}

const PopoverCellContext = createContext<PopoverCellContextValue | null>(null);

const PopoverCell = ({
  children,
  onOpenChange,
  open: controlledOpen,
  ...props
}: PropsWithChildren<PopoverPrimitive.PopoverProps>) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const interactOutsideActionRef = useRef<(() => void) | null>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );
  const registerInteractOutsideAction = useCallback(
    (action: (() => void) | null) => {
      interactOutsideActionRef.current = action;
    },
    [],
  );
  const commitInteractOutside = useCallback(() => {
    interactOutsideActionRef.current?.();
  }, []);

  return (
    <PopoverCellContext.Provider
      value={{
        commitInteractOutside,
        open,
        registerInteractOutsideAction,
        setOpen,
      }}
    >
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen} {...props}>
        {children}
      </PopoverPrimitive.Root>
    </PopoverCellContext.Provider>
  );
};
PopoverCell.displayName = "PopoverCell";

type PopoverCellTriggerProps = React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Trigger
>;

const PopoverCellTrigger = forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  PopoverCellTriggerProps
>(({ children, onDoubleClick, className, ...props }, ref) => {
  const context = useContext(PopoverCellContext);
  const { onClick, ...forwardedProps } = props;

  return (
    <PopoverPrimitive.Trigger
      className={cn("w-full h-full cursor-pointer", className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }

        if (shouldSuppressCellOpen(event)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        context?.setOpen(true);
      }}
      onDoubleClick={(event) => {
        onDoubleClick?.(event);
        if (event.defaultPrevented) {
          return;
        }

        if (shouldSuppressCellOpen(event)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        context?.setOpen(true);
      }}
      ref={(node) => {
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      {...forwardedProps}
    >
      {children}
    </PopoverPrimitive.Trigger>
  );
});
PopoverCellTrigger.displayName = "PopoverCellTrigger";

const PopoverCellContent = forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
  (
    {
      className,
      align = "center",
      onInteractOutside,
      sideOffset = 4,
      ...props
    },
    ref,
  ) => {
    const context = useContext(PopoverCellContext);

    return (
      <PopoverPrimitive.Portal>
        <div className="ps">
          <PopoverPrimitive.Content
            {...props}
            align={align}
            className={cn(
              "flex flex-col gap-2 z-50 border border-border bg-popover text-popover-foreground shadow-md outline-none",
              className,
            )}
            data-studio-cell-editor="true"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
            onInteractOutside={(event) => {
              onInteractOutside?.(event);

              if (event.defaultPrevented) {
                return;
              }

              context?.commitInteractOutside();
            }}
            // we are handling this ourselves, do not let radix take over
            onEscapeKeyDown={(event) => event.preventDefault()}
            ref={ref}
            sideOffset={sideOffset}
          />
        </div>
      </PopoverPrimitive.Portal>
    );
  },
);
PopoverCellContent.displayName = PopoverPrimitive.Content.displayName;

function shouldSuppressCellOpen(event: MouseEvent<HTMLElement>): boolean {
  if (event.button !== 0) {
    return true;
  }

  if (isGridInteractionSuppressionActive()) {
    return true;
  }

  return false;
}

export function usePopoverActions(actions: {
  onSave?: () => boolean | void;
  onCancel?: () => void;
  onNavigate?: (direction: "down" | "left" | "right" | "tab" | "up") => void;
}) {
  const { onCancel, onNavigate, onSave } = actions;

  const context = useContext(PopoverCellContext);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const commitIfChanged = useCallback(() => {
    onSaveRef.current?.();
  }, []);

  useEffect(() => {
    if (!context) {
      return;
    }

    context.registerInteractOutsideAction(commitIfChanged);

    return () => {
      context.registerInteractOutsideAction(null);
    };
  }, [commitIfChanged, context]);

  const handleSave = useCallback(() => {
    onSave?.();
    blurActiveElement();
    context?.setOpen(false);
  }, [context, onSave]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    blurActiveElement();
    context?.setOpen(false);
  }, [context, onCancel]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => {
      if (
        (event.key === "Enter" || event.key === "Return") &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        handleSave();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleCancel();
        return;
      }

      if (event.key === "Tab") {
        if (!onNavigate) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        handleSave();
        onNavigate("tab");
        return;
      }

      if ((!event.metaKey && !event.ctrlKey) || !onNavigate) {
        return;
      }

      const direction =
        event.key === "ArrowLeft"
          ? "left"
          : event.key === "ArrowRight"
            ? "right"
            : event.key === "ArrowUp"
              ? "up"
              : event.key === "ArrowDown"
                ? "down"
                : null;

      if (!direction) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleSave();
      onNavigate(direction);
    },
    [handleCancel, handleSave, onNavigate],
  );

  return { handleCancel, handleKeyDown, handleSave };
}

function blurActiveElement() {
  if (
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
  ) {
    document.activeElement.blur();
  }
}

export { PopoverCell, PopoverCellTrigger, PopoverCellContent };
