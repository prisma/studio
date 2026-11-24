import { useRef } from "react";
import { Toaster as Sonner } from "sonner";

// import { useTheme } from "@/ui/studio/util/theme-provider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function getScrollableDescription(target: EventTarget) {
  const description = (target as Element).closest("[data-description]");

  return description && description.scrollHeight > description.clientHeight
    ? description
    : null;
}

const Toaster = ({ ...props }: ToasterProps) => {
  // const { theme = "system" } = useTheme();
  const lastPointerY = useRef(0);

  function trackPointer(event: React.PointerEvent) {
    lastPointerY.current = event.clientY;
  }

  /**
   * Sonner swipes the toast on every drag. Drags on a description that overflows
   * scroll it (touch, pen) or use its scrollbar and text (mouse) instead. Only
   * moves are kept from Sonner: it pauses the close timer between press and
   * release.
   */
  function scrollInsteadOfSwipe(event: React.PointerEvent) {
    const description = getScrollableDescription(event.target);

    if (!description) {
      return;
    }

    event.stopPropagation();

    if (event.pointerType !== "mouse" && event.buttons > 0) {
      description.scrollTop += lastPointerY.current - event.clientY;
    }

    trackPointer(event);
  }

  return (
    // The toaster renders outside the Studio root, so it needs its own `.ps`
    // scope for the utilities below to apply. `!` is required where Sonner's
    // own selectors are as specific as the scoped utilities.
    <div
      className="ps"
      onPointerDownCapture={trackPointer}
      onPointerMoveCapture={scrollInsteadOfSwipe}
    >
      <Sonner
        // theme={theme as ToasterProps["theme"]}
        className="toaster group"
        toastOptions={{
          classNames: {
            toast:
              "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
            description:
              "group-[.toast]:text-muted-foreground! max-h-[20dvh] overflow-y-auto overscroll-contain touch-none",
            actionButton:
              "group-[.toast]:bg-primary! group-[.toast]:text-primary-foreground!",
            cancelButton:
              "group-[.toast]:bg-muted! group-[.toast]:text-muted-foreground!",
          },
        }}
        {...props}
      />
    </div>
  );
};

export { Toaster };
