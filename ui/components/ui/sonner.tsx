import { Toaster as Sonner } from "sonner";

// import { useTheme } from "@/ui/studio/util/theme-provider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Sonner treats every pointer drag inside a toast as a swipe-to-dismiss. Keep
 * the gesture away from descriptions that overflow, so dragging their scrollbar,
 * touch-scrolling or selecting text doesn't dismiss the toast.
 */
function preventSwipeOnScrollableDescription(
  event: React.PointerEvent<HTMLElement>,
) {
  const description = (event.target as Element).closest("[data-description]");

  if (description && description.scrollHeight > description.clientHeight) {
    event.stopPropagation();
  }
}

const Toaster = ({ ...props }: ToasterProps) => {
  // const { theme = "system" } = useTheme();

  return (
    // The toaster renders outside the Studio root, so it needs its own `.ps`
    // scope for the utilities below to apply. `!` is required where Sonner's
    // own selectors are as specific as the scoped utilities.
    <div
      className="ps"
      onPointerDownCapture={preventSwipeOnScrollableDescription}
    >
      <Sonner
        // theme={theme as ToasterProps["theme"]}
        className="toaster group"
        toastOptions={{
          classNames: {
            toast:
              "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
            description:
              "group-[.toast]:text-muted-foreground! max-h-[20dvh] overflow-y-auto overscroll-contain touch-pan-y",
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
