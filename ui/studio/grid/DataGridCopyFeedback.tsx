import { Check, X } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";

export interface GridCopyFeedback {
  /** Changes on every copy so repeated copies of the same cell replay the cue. */
  key: number;
  /** CSS selector for the cell the cue anchors to, inside the grid container. */
  cellSelector: string | null;
  label: string;
  ok: boolean;
}

export const COPY_FEEDBACK_DURATION_MS = 1200;

/** Number of cells in tab/newline separated clipboard text, for the cue label. */
export function countCopiedCells(text: string): number {
  return text
    .split("\n")
    .reduce((total, line) => total + line.split("\t").length, 0);
}

export function getCopyFeedbackLabel(text: string): string {
  const cells = countCopiedCells(text);
  return cells > 1 ? `Copied ${cells} cells` : "Copied";
}

/**
 * Brief grey "✓ Copied" cue drawn inside the copied cell, at its right edge, so the
 * confirmation appears where the eye already is instead of in a corner toast.
 */
export function DataGridCopyFeedback(props: {
  containerRef: RefObject<HTMLElement | null>;
  feedback: GridCopyFeedback | null;
}) {
  const { containerRef, feedback } = props;
  const [position, setPosition] = useState<{
    right: number;
    top: number;
  } | null>(null);

  // Passive effect: runs after the grid container ref is attached.
  useEffect(() => {
    const container = containerRef.current;

    if (!feedback?.cellSelector || !container) {
      setPosition(null);
      return;
    }

    const cell = container.querySelector<HTMLElement>(feedback.cellSelector);

    if (!cell) {
      setPosition(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();

    setPosition({
      right: containerRect.right - cellRect.right + 6,
      top: cellRect.top - containerRect.top + cellRect.height / 2,
    });
  }, [containerRef, feedback]);

  return (
    <>
      <span aria-live="polite" className="sr-only" role="status">
        {feedback?.label ?? ""}
      </span>
      {feedback && position ? (
        <span
          aria-hidden
          className="pointer-events-none absolute z-30 flex -translate-y-1/2 items-center gap-1 bg-background pl-1.5 font-sans text-[11px] leading-4 text-muted-foreground animate-copy-feedback"
          data-copy-feedback={feedback.ok ? "ok" : "error"}
          key={feedback.key}
          style={{ right: position.right, top: position.top }}
        >
          {feedback.ok ? (
            <Check size={12} strokeWidth={2.25} />
          ) : (
            <X size={12} strokeWidth={2.25} />
          )}
          {feedback.label}
        </span>
      ) : null}
    </>
  );
}
