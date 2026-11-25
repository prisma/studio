import { ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";

import { cn } from "@/ui/lib/utils";

/** Nested objects and arrays this deep start open; deeper ones start folded. */
const OPEN_DEPTH = 2;

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return typeof value === "object" && value !== null;
}

function entriesOf(value: Container): Array<[string, unknown]> {
  return Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
}

/** "3 fields" or "2 items": what a folded object or array holds. */
export function payloadSizeText(value: Container): string {
  const count = entriesOf(value).length;

  return Array.isArray(value)
    ? `${count} ${count === 1 ? "item" : "items"}`
    : `${count} ${count === 1 ? "field" : "fields"}`;
}

/** Lets a long ID such as `inv_demo_2992660` wrap after `_`, `-`, `.`, `/`, `:` or `@` rather than mid-word. */
function withBreakPoints(text: string): React.ReactNode {
  if (text.length <= 12) {
    return text;
  }

  return text.split(/(?<=[_\-./:@])/).map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

function ScalarValue(props: { value: unknown }) {
  const { value } = props;

  if (value === null) {
    return <span className="text-muted-foreground italic">null</span>;
  }

  if (typeof value === "string") {
    return value === "" ? (
      <span className="text-muted-foreground italic">empty</span>
    ) : (
      <span className="break-words whitespace-pre-wrap text-foreground">
        {withBreakPoints(value)}
      </span>
    );
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return (
      <span className="text-sky-700 tabular-nums dark:text-sky-300">
        {String(value)}
      </span>
    );
  }

  return <span className="text-foreground">{String(value)}</span>;
}

function Fields(props: { depth: number; value: Container }) {
  const entries = entriesOf(props.value);

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground italic">
        {Array.isArray(props.value) ? "No items" : "No fields"}
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-[minmax(6ch,max-content)_minmax(min(18ch,50%),1fr)] items-baseline gap-x-3 gap-y-1">
      {entries.map(([name, value]) => (
        <Field key={name} depth={props.depth} name={name} value={value} />
      ))}
    </dl>
  );
}

function Field(props: { depth: number; name: string; value: unknown }) {
  const { depth, name, value } = props;
  const [isOpen, setIsOpen] = useState(depth < OPEN_DEPTH);

  if (!isContainer(value) || entriesOf(value).length === 0) {
    return (
      <div className="contents">
        <dt className="truncate text-2xs text-muted-foreground" title={name}>
          {name}
        </dt>
        <dd className="min-w-0">
          {isContainer(value) ? (
            <span className="text-muted-foreground italic">
              {Array.isArray(value) ? "No items" : "No fields"}
            </span>
          ) : (
            <ScalarValue value={value} />
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1">
      <dt>
        <button
          type="button"
          aria-expanded={isOpen}
          className="-ml-1 flex max-w-full items-center gap-1 rounded-sm px-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setIsOpen((open) => !open)}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 transition-transform",
              isOpen && "rotate-90",
            )}
          />
          <span className="truncate">{name}</span>
          <span className="shrink-0 font-sans text-2xs text-muted-foreground/80">
            {payloadSizeText(value)}
          </span>
        </button>
      </dt>
      {isOpen ? (
        <dd className="ml-1.5 border-l border-border pl-3">
          <Fields depth={depth + 1} value={value} />
        </dd>
      ) : null}
    </div>
  );
}

/**
 * A payload as a list of fields: names on the left, values on the right, with
 * nested objects and arrays indented and folded past two levels. Strings show
 * without quotes; numbers and booleans have their own colour.
 */
export function TemporalPayloadView(props: {
  className?: string;
  value: unknown;
}) {
  const { className, value } = props;

  return (
    <div
      className={cn(
        "overflow-auto rounded-md border border-border bg-background px-3 py-2.5 font-mono text-xs leading-5",
        className,
      )}
      data-testid="temporal-payload-view"
    >
      {isContainer(value) ? (
        <Fields depth={0} value={value} />
      ) : (
        <ScalarValue value={value} />
      )}
    </div>
  );
}
