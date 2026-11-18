import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { useStudio } from "./context";

interface StudioHeaderProps {
  children?: React.ReactNode;
  className?: string;
  endContent?: React.ReactNode;
  /** Names the current view so every screen says where you are. */
  title?: string;
}

export function StudioHeader(props: StudioHeaderProps) {
  const { toggleNavigation, isNavigationOpen } = useStudio();
  return (
    <div
      className={cn(
        "flex w-full border-b border-border bg-card px-2 py-2.5",
        // Header icons at 14px with a finer stroke, in scale with 14px labels.
        "[&_button_svg]:size-3.5 [&_button_svg]:stroke-[1.75]",
        props.className,
      )}
    >
      <div className="flex w-full items-center gap-3">
        <div className="flex min-w-0 grow items-center gap-2">
          <Button
            aria-label={
              isNavigationOpen ? "Close navigation" : "Open navigation"
            }
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={toggleNavigation}
          >
            {isNavigationOpen ? (
              <PanelLeftClose data-icon="inline-start" />
            ) : (
              <PanelLeftOpen data-icon="inline-start" />
            )}
          </Button>
          {props.title ? (
            <h1 className="shrink-0 pr-1 font-sans text-sm font-semibold text-foreground">
              {props.title}
            </h1>
          ) : null}
          {props.children}
        </div>

        {props.endContent != null ? (
          <div
            data-testid="studio-header-end-controls"
            className="flex shrink-0 items-center gap-2 pl-2"
          >
            {props.endContent}
          </div>
        ) : null}
      </div>
    </div>
  );
}
