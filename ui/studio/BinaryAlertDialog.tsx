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
  /** Optional control shown above the buttons, such as a checkbox. */
  control?: ReactNode;
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
  prompt: ReactNode;
  /** Optional quieter second line under the prompt, such as a consequence. */
  promptDetail?: string;
  secondaryLabel: string;
  title: string;
};

/**
 * Two-button confirmation dialog shared by table and SQL views: a fixed-width
 * surface with the prompt on top and two equal full-width buttons, so the
 * layout stays balanced whatever the prompt length. The surface is slightly
 * translucent with a backdrop blur, so it reads as floating over Studio while
 * the prompt stays fully legible. Arrow keys move between
 * the buttons, Enter activates the focused one, and Escape cancels.
 */
export function BinaryAlertDialog(props: BinaryAlertDialogProps) {
  const {
    control,
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
        className="w-[360px] max-w-[calc(100vw-2rem)] gap-5 rounded-xl bg-background/85 p-5 font-sans backdrop-blur-md"
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
          <AlertDialogDescription className="font-sans text-sm leading-5 font-medium text-foreground">
            <span className="block text-balance">{prompt}</span>
            {promptDetail ? (
              <span className="mt-1.5 block font-normal text-muted-foreground">
                {promptDetail}
              </span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {control}
        <AlertDialogFooter className="grid grid-cols-2 gap-2">
          <AlertDialogAction
            ref={primaryButtonRef}
            variant={primaryVariant}
            className={cn("w-full", primaryClassName)}
            onClick={onPrimaryAction}
          >
            {primaryLabel}
          </AlertDialogAction>
          <AlertDialogCancel
            ref={secondaryButtonRef}
            variant="outline"
            className="w-full"
            onClick={handleSecondaryAction}
          >
            {secondaryLabel}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
