import { Maximize2, Minus, Plus } from "lucide-react";
import { Panel, useReactFlow, useViewport } from "reactflow";

import { cn } from "../lib/utils";

const buttonClassName = cn(
  "flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors",
  "hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15",
  "[&_svg]:size-3.5",
);

/**
 * Canvas zoom bar matching Prisma Console: zoom out, current zoom, zoom in, and
 * fit view, in one horizontal white bar. Must render inside <ReactFlow>.
 */
export function CanvasZoomControls() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();

  return (
    <Panel position="bottom-left">
      <div
        aria-label="Canvas zoom"
        className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-xs"
        role="group"
      >
        <button
          aria-label="Zoom out"
          className={buttonClassName}
          onClick={() => zoomOut({ duration: 150 })}
          type="button"
        >
          <Minus />
        </button>
        <span
          aria-live="polite"
          className="min-w-11 text-center font-sans text-xs text-foreground tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          aria-label="Zoom in"
          className={buttonClassName}
          onClick={() => zoomIn({ duration: 150 })}
          type="button"
        >
          <Plus />
        </button>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        <button
          aria-label="Fit view"
          className={buttonClassName}
          onClick={() => fitView({ duration: 200, padding: 0.2 })}
          type="button"
        >
          <Maximize2 />
        </button>
      </div>
    </Panel>
  );
}
