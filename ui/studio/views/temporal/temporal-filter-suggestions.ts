import type { TemporalFacets } from "@/data/temporal";

export type ListFilterAttributeKind = "number" | "status" | "text" | "time";

export interface ListFilterAttribute {
  kind: ListFilterAttributeKind;
  name: string;
}

export const LIST_FILTER_STATUSES = [
  "Running",
  "Completed",
  "Failed",
  "Canceled",
  "Terminated",
  "ContinuedAsNew",
  "TimedOut",
];

/** How long ago each quick choice for a time attribute is. */
export const LIST_FILTER_TIME_PRESETS: Array<{ label: string; ms: number }> = [
  { label: "15 minutes ago", ms: 15 * 60_000 },
  { label: "1 hour ago", ms: 60 * 60_000 },
  { label: "24 hours ago", ms: 24 * 60 * 60_000 },
  { label: "7 days ago", ms: 7 * 24 * 60 * 60_000 },
];

const BUILT_IN_ATTRIBUTES: ListFilterAttribute[] = [
  { kind: "status", name: "ExecutionStatus" },
  { kind: "text", name: "WorkflowType" },
  { kind: "text", name: "WorkflowId" },
  { kind: "text", name: "TaskQueue" },
  { kind: "text", name: "RunId" },
  { kind: "time", name: "StartTime" },
  { kind: "time", name: "CloseTime" },
];

/** The attributes a List Filter can compare: the built-in ones, then the namespace's own. */
export function listFilterAttributes(
  facets: TemporalFacets | undefined,
): ListFilterAttribute[] {
  return [
    ...BUILT_IN_ATTRIBUTES,
    ...(facets?.searchAttributes ?? []).map((attribute) => ({
      kind:
        attribute.type === "Int" || attribute.type === "Double"
          ? ("number" as const)
          : attribute.type === "Datetime"
            ? ("time" as const)
            : ("text" as const),
      name: attribute.name,
    })),
  ];
}

export interface ListFilterSuggestion {
  /** Where the cursor goes once the suggestion is in the field. */
  cursor: number;
  /** A count or a hint shown beside the label. */
  detail?: string;
  label: string;
  /** The whole text of the field with the suggestion in it. */
  text: string;
}

export interface ListFilterSuggestions {
  heading: string;
  items: ListFilterSuggestion[];
}

const MAX_SUGGESTIONS = 8;
const NAME = "`[^`]+`|[A-Za-z_][A-Za-z0-9_]*";
const OPERATOR = "!=|<=|>=|=|<|>|STARTS_WITH\\b";
/** `TaskQueue = ` at the end of the text: the cursor is where a value starts. */
const BEFORE_VALUE = new RegExp(`(${NAME})\\s*(?:${OPERATOR})\\s*$`, "i");
const BEFORE_BARE_VALUE = new RegExp(
  `(${NAME})\\s*(?:${OPERATOR})\\s*([^\\s"'()]*)$`,
  "i",
);
const STARTS_WITH_OPERATOR = new RegExp(`^\\s*(?:${OPERATOR})`, "i");

/**
 * Names that start with the typed text come first, then names in which a later
 * word starts with it: "queue" finds `TaskQueue`, and "ta" does not find
 * `ExecutionStatus`.
 */
function matchByName<T extends { name: string }>(
  candidates: T[],
  typed: string,
): T[] {
  const needle = typed.toLowerCase();
  const startsWith = candidates.filter((candidate) =>
    candidate.name.toLowerCase().startsWith(needle),
  );
  const wordStartsWith = candidates.filter(
    (candidate) =>
      !startsWith.includes(candidate) &&
      candidate.name
        .split(/(?=[A-Z])|[^A-Za-z0-9]+/)
        .some((word) => word.toLowerCase().startsWith(needle)),
  );

  return [...startsWith, ...wordStartsWith].slice(0, MAX_SUGGESTIONS);
}

/** The position of a quote that opens before the end of the text and does not close. */
function openQuoteStart(text: string): number {
  let quote: string | null = null;
  let start = -1;

  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;

    if (quote) {
      if (char === "\\") {
        index++;
      } else if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      start = index;
    }
  }

  return quote ? start : -1;
}

function valueCandidates(
  attribute: ListFilterAttribute,
  facets: TemporalFacets | undefined,
  nowMs: number,
): Array<{ detail?: string; name: string; value: string }> {
  if (attribute.kind === "status") {
    return LIST_FILTER_STATUSES.map((status) => ({
      name: status,
      value: status,
    }));
  }

  if (attribute.kind === "time") {
    return LIST_FILTER_TIME_PRESETS.map((preset) => ({
      detail: new Date(nowMs - preset.ms).toISOString(),
      name: preset.label,
      value: new Date(nowMs - preset.ms).toISOString(),
    }));
  }

  const counted =
    attribute.name === "TaskQueue"
      ? facets?.taskQueues
      : attribute.name === "WorkflowType"
        ? facets?.workflowTypes
        : undefined;

  return (counted ?? []).map((item) => ({
    // Without every run of the namespace the count is that of a sample.
    detail: facets?.complete ? item.count.toLocaleString("en-US") : undefined,
    name: item.name,
    value: item.name,
  }));
}

/**
 * What the Workflows search field offers at the cursor: attribute names where
 * a comparison starts, values after an operator, and AND or OR after a
 * complete comparison. Returns null when there is nothing to offer, as for
 * plain text that is not the start of an attribute name.
 */
export function suggestListFilter(args: {
  cursor: number;
  facets: TemporalFacets | undefined;
  nowMs: number;
  text: string;
}): ListFilterSuggestions | null {
  const { cursor, facets, nowMs, text } = args;
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const attributes = listFilterAttributes(facets);
  const attributeNamed = (name: string) =>
    attributes.find(
      (attribute) =>
        attribute.name.toLowerCase() === name.replaceAll("`", "").toLowerCase(),
    );
  const valueSuggestions = (
    attribute: ListFilterAttribute,
    typed: string,
    head: string,
    tail: string,
  ): ListFilterSuggestions | null => {
    const items = matchByName(
      valueCandidates(attribute, facets, nowMs),
      typed,
    ).map((candidate) => {
      const inserted = `"${candidate.value}"`;

      return {
        cursor: head.length + inserted.length,
        detail: candidate.detail,
        label: candidate.name,
        text: `${head}${inserted}${tail}`,
      };
    });

    return items.length > 0
      ? { heading: `Values for ${attribute.name}`, items }
      : null;
  };

  const quoteStart = openQuoteStart(before);

  if (quoteStart >= 0) {
    const head = before.slice(0, quoteStart);
    const attribute = attributeNamed(BEFORE_VALUE.exec(head)?.[1] ?? "");
    const quote = before[quoteStart]!;
    // The rest of this value: up to its closing quote, when it has one.
    const rest = new RegExp(`^[^${quote}\\s]*${quote}`).exec(after)?.[0] ?? "";

    return attribute
      ? valueSuggestions(
          attribute,
          before.slice(quoteStart + 1),
          head,
          after.slice(rest.length),
        )
      : null;
  }

  const bareValue = BEFORE_BARE_VALUE.exec(before);
  const bareAttribute = bareValue ? attributeNamed(bareValue[1]!) : undefined;

  if (bareValue && bareAttribute && bareAttribute.kind !== "number") {
    const typed = bareValue[2]!;

    return valueSuggestions(
      bareAttribute,
      typed,
      before.slice(0, before.length - typed.length),
      after.replace(/^[^\s()]*/, ""),
    );
  }

  const typed = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before)?.[0] ?? "";
  const head = before.slice(0, before.length - typed.length);
  const headText = head.trimEnd();
  const startsComparison =
    headText === "" || /(\bAND|\bOR|\(|\bNOT)$/i.test(headText);

  if (startsComparison) {
    // An empty field offers nothing: the user may be about to paste an ID.
    if (typed === "" && headText === "") {
      return null;
    }

    const restOfName = /^[A-Za-z0-9_]*/.exec(after)![0];
    const tail = after.slice(restOfName.length);
    const hasOperator = STARTS_WITH_OPERATOR.test(tail);
    const items = matchByName(attributes, typed).map((attribute) => {
      const comparison =
        attribute.kind === "number"
          ? `${attribute.name} = `
          : attribute.kind === "time"
            ? `${attribute.name} > ""`
            : `${attribute.name} = ""`;
      const inserted = hasOperator ? attribute.name : comparison;

      return {
        // Inside the quotes, so the value can be typed at once.
        cursor:
          head.length +
          inserted.length -
          (!hasOperator && attribute.kind !== "number" ? 1 : 0),
        detail: hasOperator
          ? undefined
          : comparison.slice(attribute.name.length + 1),
        label: attribute.name,
        text: `${head}${inserted}${tail}`,
      };
    });

    return items.length > 0 ? { heading: "Attributes", items } : null;
  }

  const afterValue =
    head !== headText && /("|'|\)|\d|\btrue|\bfalse)$/i.test(headText);

  if (afterValue) {
    const items = matchByName([{ name: "AND" }, { name: "OR" }], typed).map(
      (joiner) => ({
        cursor: head.length + joiner.name.length + 1,
        label: joiner.name,
        text: `${head}${joiner.name} ${after.trimStart()}`,
      }),
    );

    return items.length > 0 ? { heading: "Add a Condition", items } : null;
  }

  return null;
}
