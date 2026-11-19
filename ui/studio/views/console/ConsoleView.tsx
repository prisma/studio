import { useEffect, useRef } from "react";

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { useStudio } from "../../context";
import { StudioHeader } from "../../StudioHeader";
import { ViewProps } from "../View";
import { OperationEventEntry } from "./OperationEventEntry";

const HEAD_CLASSES =
  "h-9 px-3 whitespace-nowrap font-mono text-2xs font-medium uppercase tracking-loose";

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
      <div ref={scrollRef} className="flex grow flex-col overflow-y-auto">
        {operationEvents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No operation events yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Queries Studio runs against your database appear here.
            </p>
          </div>
        ) : (
          // A log: one row per operation, oldest first, newest at the bottom.
          <Table
            className="table-fixed"
            containerProps={{ className: "h-auto overflow-visible" }}
          >
            <colgroup>
              <col className="w-14" />
              <col className="w-32" />
              <col />
              <col className="w-24" />
              <col className="w-28" />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="h-9 pl-3" />
                <TableHead className={HEAD_CLASSES}>Operation</TableHead>
                <TableHead className={HEAD_CLASSES}>SQL</TableHead>
                <TableHead className={HEAD_CLASSES}>Status</TableHead>
                <TableHead className={`${HEAD_CLASSES} pr-4 text-right`}>
                  Time
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operationEvents.map((event) => (
                <OperationEventEntry key={event.eventId} event={event} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
