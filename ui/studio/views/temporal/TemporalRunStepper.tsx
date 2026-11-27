import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from "lucide-react";
import { useEffect } from "react";

import type { TemporalGroupedSpan } from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";

/** The name of a step without the kind in front of it. */
export function runStepName(span: TemporalGroupedSpan): string {
  return span.label.replace(/^(?:Child|Signal|Update): /, "");
}

/**
 * Steps through a run's history: first, previous, a slider, next, and the end
 * of the history (now, for an open run). The run page shows the step it is on
 * in every history view: the open row of Grouped Spans, the marked events of
 * Raw Events, and the run's place on the Diagram.
 *
 * The left and right arrow keys move it from anywhere on the page, except
 * while focus is in a field or a control that uses those keys itself.
 */
export function TemporalRunStepper(props: {
  isOpen: boolean;
  onChange: (position: number | null) => void;
  /** The step the run page is on; null is the end of the history. */
  position: number | null;
  steps: TemporalGroupedSpan[];
}) {
  const { isOpen, onChange, position, steps } = props;
  const stepAt = position === null ? null : (steps[position] ?? null);
  const endLabel = isOpen ? "Now" : "End of the run";

  useEffect(() => {
    if (steps.length === 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;

      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest(
            '[role="dialog"], [role="menu"], [role="listbox"], [role="tablist"], [role="radiogroup"], [role="separator"]',
          ))
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onChange(Math.max(0, (position ?? steps.length) - 1));
      } else if (event.key === "ArrowRight" && position !== null) {
        event.preventDefault();
        onChange(position + 1 >= steps.length ? null : position + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onChange, position, steps.length]);

  if (steps.length === 0) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-2 text-xs"
      data-testid="temporal-run-stepper"
    >
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="xs"
          aria-label="First step"
          title="First step"
          className="w-6 px-0"
          disabled={position === 0}
          onClick={() => onChange(0)}
        >
          <SkipBack />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          aria-label="Previous step"
          title="Previous step (←)"
          className="w-6 px-0"
          disabled={position === 0}
          onClick={() => onChange((position ?? steps.length) - 1)}
        >
          <ChevronLeft />
        </Button>
        <input
          type="range"
          aria-label="Step of the run's history"
          aria-valuetext={
            stepAt
              ? `Step ${position! + 1} of ${steps.length}: ${runStepName(stepAt)}`
              : endLabel
          }
          className="mx-1 h-1 w-32 cursor-pointer accent-foreground @max-lg:w-20"
          max={steps.length}
          min={0}
          onChange={(event) => {
            const value = Number(event.target.value);

            onChange(value >= steps.length ? null : value);
          }}
          step={1}
          value={position ?? steps.length}
        />
        <Button
          variant="ghost"
          size="xs"
          aria-label="Next step"
          title="Next step (→)"
          className="w-6 px-0"
          disabled={position === null}
          onClick={() =>
            onChange(position! + 1 >= steps.length ? null : position! + 1)
          }
        >
          <ChevronRight />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          aria-label={endLabel}
          title={endLabel}
          className="w-6 px-0"
          disabled={position === null}
          onClick={() => onChange(null)}
        >
          <SkipForward />
        </Button>
      </div>
      <span
        className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground"
        data-testid="temporal-run-stepper-place"
      >
        {stepAt ? `Step ${position! + 1} of ${steps.length}` : endLabel}
      </span>
    </div>
  );
}
