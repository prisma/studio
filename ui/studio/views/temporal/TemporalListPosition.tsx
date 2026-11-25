import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/ui/components/ui/button";

import type { TemporalListContext } from "./temporal-list-context";
import { isShortcutBlockedTarget } from "./temporal-utils";

/**
 * Where the workflow on screen is in the list it was opened from, in the
 * header before its path: the list's name goes back to the list with its
 * filter, and the arrows (or j and k) open the next and previous row.
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
      aria-label={`Position in ${context.label}`}
      className="flex shrink-0 items-center gap-0.5 border-r border-border pr-2 text-xs"
      data-testid="temporal-list-position"
    >
      <Button
        asChild
        variant="ghost"
        size="xs"
        className="gap-1 px-1.5 text-muted-foreground hover:text-foreground"
      >
        <a
          href={context.href}
          title={`Back to ${context.label}`}
          data-testid="temporal-list-back"
        >
          <ArrowLeft />
          <span className="max-w-32 truncate">{context.label}</span>
        </a>
      </Button>
      <span
        className="px-1 font-mono text-2xs tabular-nums text-muted-foreground"
        data-testid="temporal-list-place"
      >
        {position + 1} of {count}
      </span>
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
