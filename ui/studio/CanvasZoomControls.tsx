import { Maximize2, Minus, Plus } from "lucide-react";
import { Panel, useReactFlow, useViewport } from "reactflow";

import { Button } from "../components/ui/button";

const buttonClassName =
  "size-7 rounded-sm text-muted-foreground hover:text-foreground [&_svg]:size-3.5";

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
        <Button
          aria-label="Zoom out"
          className={buttonClassName}
          onClick={() => zoomOut({ duration: 150 })}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Minus />
        </Button>
        <span
          aria-live="polite"
          className="min-w-11 text-center font-sans text-xs text-foreground tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </span>
        <Button
          aria-label="Zoom in"
          className={buttonClassName}
          onClick={() => zoomIn({ duration: 150 })}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Plus />
        </Button>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        <Button
          aria-label="Fit view"
          className={buttonClassName}
          onClick={() => fitView({ duration: 200, padding: 0.2 })}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Maximize2 />
        </Button>
      </div>
    </Panel>
  );
}
