import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useRef,
} from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import type { ButtonProps } from "../components/ui/button";
import { cn } from "../lib/utils";

function handleBinaryDialogKeyDown(args: {
  event: ReactKeyboardEvent<HTMLDivElement>;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  primaryRef: { current: HTMLButtonElement | null };
  secondaryRef: { current: HTMLButtonElement | null };
}) {
  const {
    event,
    onPrimaryAction,
    onSecondaryAction,
    primaryRef,
    secondaryRef,
  } = args;

  if (
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight" &&
    event.key !== "ArrowUp" &&
    event.key !== "ArrowDown" &&
    event.key !== "Enter"
  ) {
    return;
  }

  const activeElement = document.activeElement;
  const activeAction =
    activeElement === secondaryRef.current ? "secondary" : "primary";

  if (event.key === "Enter") {
    event.preventDefault();

    if (activeAction === "primary") {
      onPrimaryAction();
      return;
    }

    onSecondaryAction();
    return;
  }

  event.preventDefault();

  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    primaryRef.current?.focus();
    return;
  }

  secondaryRef.current?.focus();
}

export type BinaryAlertDialogProps = {
  /** Extra classes for the dialog surface, for example a wider max width. */
  className?: string;
  /**
   * Optional control shown at the start of the button row, such as a
   * "Don't ask again" checkbox. The buttons stay right-aligned.
   */
  footerStart?: ReactNode;
  /**
   * Which button receives focus when the dialog opens. Enter activates the
   * focused button, so destructive confirmations should focus `secondary`.
   */
  initialFocus?: "primary" | "secondary";
  onCloseAutoFocus?: (event: Event) => void;
  onOpenChange: (open: boolean) => void;
  onPrimaryAction: () => void;
  open: boolean;
  primaryClassName?: string;
  primaryLabel: string;
  primaryVariant?: ButtonProps["variant"];
  prompt: string;
  /** Optional quieter second line under the prompt, such as a consequence. */
  promptDetail?: string;
  secondaryLabel: string;
  title: string;
};

/**
 * Small two-button confirmation dialog shared by table and SQL views. Arrow
 * keys move between the buttons, Enter activates the focused one, and Escape
 * cancels.
 */
export function BinaryAlertDialog(props: BinaryAlertDialogProps) {
  const {
    className,
    footerStart,
    initialFocus = "primary",
    onCloseAutoFocus,
    onOpenChange,
    onPrimaryAction,
    open,
    primaryClassName,
    primaryLabel,
    primaryVariant = "default",
    prompt,
    promptDetail,
    secondaryLabel,
    title,
  } = props;
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const secondaryButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleSecondaryAction = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn(
          "max-w-[280px] gap-4 rounded-xl bg-background p-4 font-sans",
          className,
        )}
        onCloseAutoFocus={onCloseAutoFocus}
        onKeyDown={(event) =>
          handleBinaryDialogKeyDown({
            event,
            onPrimaryAction,
            onSecondaryAction: handleSecondaryAction,
            primaryRef: primaryButtonRef,
            secondaryRef: secondaryButtonRef,
          })
        }
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (initialFocus === "secondary"
            ? secondaryButtonRef
            : primaryButtonRef
          ).current?.focus();
        }}
      >
        <AlertDialogHeader className="gap-0 text-left">
          <AlertDialogTitle className="sr-only">{title}</AlertDialogTitle>
          <AlertDialogDescription className="font-sans text-sm leading-5 font-medium text-pretty text-foreground">
            {prompt}
            {promptDetail ? (
              <span className="mt-1 block font-normal text-muted-foreground">
                {promptDetail}
              </span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row items-center justify-end gap-2">
          {footerStart ? (
            <div className="mr-auto flex min-w-0 items-center">
              {footerStart}
            </div>
          ) : null}
          <AlertDialogAction
            ref={primaryButtonRef}
            size="sm"
            variant={primaryVariant}
            className={primaryClassName}
            onClick={onPrimaryAction}
          >
            {primaryLabel}
          </AlertDialogAction>
          <AlertDialogCancel
            ref={secondaryButtonRef}
            size="sm"
            variant="outline"
            onClick={handleSecondaryAction}
          >
            {secondaryLabel}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
