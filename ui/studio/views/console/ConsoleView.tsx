import { useEffect, useRef } from "react";

import { useStudio } from "../../context";
import { StudioHeader } from "../../StudioHeader";
import { ViewProps } from "../View";
import { OperationEventEntry } from "./OperationEventEntry";

export function ConsoleView(_props: ViewProps) {
  const { operationEvents } = useStudio();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [operationEvents]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <StudioHeader />
      <div
        ref={scrollRef}
        className="flex flex-col grow p-4 overflow-y-auto gap-2 bg-background/50"
      >
        {operationEvents.length === 0 && (
          <div className="flex justify-center items-center h-full text-muted-foreground">
            No operation events yet.
          </div>
        )}
        {operationEvents.map((event) => (
          <OperationEventEntry key={event.eventId} event={event} />
        ))}
      </div>
    </div>
  );
}
