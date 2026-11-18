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
      <StudioHeader title="Console" />
      <div
        ref={scrollRef}
        className="flex grow flex-col gap-3 overflow-y-auto p-4"
      >
        {operationEvents.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No operation events yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Queries Studio runs against your database appear here.
            </p>
          </div>
        )}
        {operationEvents.map((event) => (
          <OperationEventEntry key={event.eventId} event={event} />
        ))}
      </div>
    </div>
  );
}
