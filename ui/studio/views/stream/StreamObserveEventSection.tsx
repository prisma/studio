import { Badge } from "@/ui/components/ui/badge";

import type { StudioObserveEvlog } from "../../../hooks/use-stream-observe-request";
import { formatDurationMs } from "./StreamObserveShared";

export function EventSection(props: {
  eventsStream: string | null;
  evlog: StudioObserveEvlog | null;
}) {
  if (!props.eventsStream) {
    return (
      <div className="px-1 py-6 text-center text-sm text-muted-foreground">
        No evlog stream is available for request events.
      </div>
    );
  }

  const event = props.evlog?.primary ?? null;

  if (!event) {
    return (
      <div className="px-1 py-6 text-center text-sm text-muted-foreground">
        No evlog event was found for this request.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="stream-observe-event">
      <div className="flex flex-wrap items-center gap-1.5">
        {event.level ? (
          <Badge
            variant={event.level === "error" ? "destructive" : "secondary"}
          >
            {event.level}
          </Badge>
        ) : null}
        {event.method && event.path ? (
          <Badge className="font-mono font-normal" variant="outline">
            {event.method} {event.path}
          </Badge>
        ) : null}
        {event.status != null ? (
          <Badge variant="outline">{event.status}</Badge>
        ) : null}
        {event.duration != null ? (
          <Badge variant="outline">{formatDurationMs(event.duration)}</Badge>
        ) : null}
      </div>

      {event.message ? (
        <p className="text-sm font-medium text-foreground">{event.message}</p>
      ) : null}

      {event.why || event.fix || event.link ? (
        <div
          className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          data-testid="stream-observe-root-cause"
        >
          {event.why ? (
            <div>
              <span className="font-medium">Why </span>
              <span className="text-muted-foreground">{event.why}</span>
            </div>
          ) : null}
          {event.fix ? (
            <div>
              <span className="font-medium">Fix </span>
              <span className="text-muted-foreground">{event.fix}</span>
            </div>
          ) : null}
          {event.link ? (
            <a
              className="break-all text-xs text-muted-foreground underline underline-offset-2"
              href={event.link}
              rel="noreferrer"
              target="_blank"
            >
              {event.link}
            </a>
          ) : null}
        </div>
      ) : null}

      {props.evlog && props.evlog.matchCount > 1 ? (
        <p className="text-xs text-muted-foreground">
          {props.evlog.matchCount} events matched this lookup; showing the best
          match.
        </p>
      ) : null}

      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border/70 bg-muted/40 p-3 font-mono text-xs leading-5 text-foreground">
        {JSON.stringify(event.raw, null, 2)}
      </pre>
    </div>
  );
}
