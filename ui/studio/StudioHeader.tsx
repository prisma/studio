import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { useStudio } from "./context";

interface StudioHeaderProps {
  children?: React.ReactNode;
  className?: string;
  endContent?: React.ReactNode;
}

export function StudioHeader(props: StudioHeaderProps) {
  const { toggleNavigation, isNavigationOpen } = useStudio();
  return (
    <div
      className={cn(
        "bg-studio-header-background flex w-full rounded-t-lg border-b border-border bg-card p-2 py-3",
        props.className,
      )}
    >
      <div className="flex w-full items-center gap-3">
        <div className="flex min-w-0 grow items-center gap-2">
          <Button
            aria-label={
              isNavigationOpen ? "Close navigation" : "Open navigation"
            }
            variant="outline"
            size="icon"
            onClick={toggleNavigation}
          >
            {isNavigationOpen ? (
              <PanelLeftClose data-icon="inline-start" />
            ) : (
              <PanelLeftOpen data-icon="inline-start" />
            )}
          </Button>
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
