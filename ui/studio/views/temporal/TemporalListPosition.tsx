import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/ui/components/ui/button";

import type { TemporalListContext } from "./temporal-list-context";
import { isShortcutBlockedTarget } from "./temporal-utils";

/**
 * The previous and next rows of the list the workflow on screen was opened
 * from, as two arrows before its path, and as the j and k keys. The list
 * itself is in the left menu, and the browser's Back button returns to it.
 */
export function TemporalListPosition(props: {
  context: TemporalListContext;
  onOpenItem: (index: number) => void;
  /** The workflow's place in `context.items`. */
  position: number;
}) {
  const { context, onOpenItem, position } = props;
  const count = context.items.length;
  const hasPrevious = position > 0;
  const hasNext = position < count - 1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isShortcutBlockedTarget(event.target, event.key)
      ) {
        return;
      }

      if (event.key === "j" && position < count - 1) {
        event.preventDefault();
        onOpenItem(position + 1);
      } else if (event.key === "k" && position > 0) {
        event.preventDefault();
        onOpenItem(position - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, onOpenItem, position]);

  return (
    <nav
      aria-label={`Previous and next in ${context.label}`}
      className="flex shrink-0 items-center"
      data-testid="temporal-list-position"
    >
      <Button
        variant="ghost"
        size="xs"
        className="w-6 px-0"
        aria-label={`Previous in ${context.label}`}
        title={`Previous in ${context.label} (k)`}
        disabled={!hasPrevious}
        onClick={() => onOpenItem(position - 1)}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="w-6 px-0"
        aria-label={`Next in ${context.label}`}
        title={`Next in ${context.label} (j)`}
        disabled={!hasNext}
        onClick={() => onOpenItem(position + 1)}
      >
        <ChevronDown />
      </Button>
    </nav>
  );
}
