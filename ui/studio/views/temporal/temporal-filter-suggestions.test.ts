import { describe, expect, it } from "vitest";

import type { TemporalFacets } from "@/data/temporal";

import { suggestListFilter } from "./temporal-filter-suggestions";

const facets: TemporalFacets = {
  complete: true,
  searchAttributes: [
    { name: "CustomerRegion", type: "Keyword" },
    { name: "OrderTotal", type: "Double" },
  ],
  taskQueues: [
    { count: 4120, name: "billing" },
    { count: 900, name: "orders" },
  ],
  workflowTypes: [
    {
      count: 3,
      latestRun: { runId: "r", workflowId: "w" },
      name: "orderFulfillment",
    },
  ],
};
const nowMs = Date.parse("2026-11-23T12:00:00.000Z");

/** Suggestions for a text in which `|` marks the cursor. */
function suggest(marked: string) {
  const cursor = marked.indexOf("|");

  return suggestListFilter({
    cursor,
    facets,
    nowMs,
    text: marked.replace("|", ""),
  });
}

/** A suggestion's text with `|` at its cursor. */
function marked(suggestion: { cursor: number; text: string } | undefined) {
  return suggestion
    ? `${suggestion.text.slice(0, suggestion.cursor)}|${suggestion.text.slice(suggestion.cursor)}`
    : undefined;
}

describe("suggestListFilter", () => {
  it("completes the start of an attribute name and puts the cursor inside the quotes", () => {
    const result = suggest("Ta|");

    expect(result?.heading).toBe("Attributes");
    expect(result?.items.map((item) => item.label)).toEqual(["TaskQueue"]);
    expect(marked(result?.items[0])).toBe('TaskQueue = "|"');
  });

  it("finds an attribute by a part of its name, and offers the namespace's own attributes", () => {
    expect(suggest("queue|")?.items.map((item) => item.label)).toEqual([
      "TaskQueue",
    ]);
    expect(suggest("cust|")?.items.map((item) => item.label)).toEqual([
      "CustomerRegion",
    ]);
  });

  it("writes a number attribute without quotes and a time attribute with after", () => {
    expect(marked(suggest("OrderT|")?.items[0])).toBe("OrderTotal = |");
    expect(marked(suggest("StartT|")?.items[0])).toBe('StartTime > "|"');
  });

  it("offers the Task Queues with their counts once the cursor is in the value", () => {
    const result = suggest('TaskQueue = "|"');

    expect(result?.heading).toBe("Values for TaskQueue");
    expect(result?.items.map((item) => [item.label, item.detail])).toEqual([
      ["billing", "4,120"],
      ["orders", "900"],
    ]);
    expect(marked(result?.items[0])).toBe('TaskQueue = "billing"|');
  });

  it("leaves out the counts when the namespace is too large to count them", () => {
    const result = suggestListFilter({
      cursor: 13,
      facets: { ...facets, complete: false },
      nowMs,
      text: 'TaskQueue = ""',
    });

    expect(result?.items.map((item) => [item.label, item.detail])).toEqual([
      ["billing", undefined],
      ["orders", undefined],
    ]);
  });

  it("narrows the values as the user types, with or without an opening quote", () => {
    expect(marked(suggest('TaskQueue = "or|"')?.items[0])).toBe(
      'TaskQueue = "orders"|',
    );
    expect(marked(suggest("ExecutionStatus = Fa|")?.items[0])).toBe(
      'ExecutionStatus = "Failed"|',
    );
    expect(marked(suggest('WorkflowType STARTS_WITH "ord|')?.items[0])).toBe(
      'WorkflowType STARTS_WITH "orderFulfillment"|',
    );
  });

  it("writes a time preset as a timestamp", () => {
    const result = suggest('StartTime > "|"');

    expect(result?.items[1]?.label).toBe("1 hour ago");
    expect(marked(result?.items[1])).toBe(
      'StartTime > "2026-11-23T11:00:00.000Z"|',
    );
  });

  it("offers AND and OR after a complete comparison, then attributes again", () => {
    expect(
      suggest('TaskQueue = "billing" |')?.items.map((item) => item.label),
    ).toEqual(["AND", "OR"]);
    expect(marked(suggest('TaskQueue = "billing" a|')?.items[0])).toBe(
      'TaskQueue = "billing" AND |',
    );
    expect(marked(suggest('TaskQueue = "billing" AND Exec|')?.items[0])).toBe(
      'TaskQueue = "billing" AND ExecutionStatus = "|"',
    );
    expect(
      suggest('TaskQueue = "billing" AND |')?.items.length,
    ).toBeGreaterThan(5);
  });

  it("replaces only the name when a comparison already follows it", () => {
    expect(marked(suggest('Work| = "orderFulfillment"')?.items[0])).toBe(
      'WorkflowType| = "orderFulfillment"',
    );
  });

  it("offers nothing for an empty field, an ID, or a value it knows no choices for", () => {
    expect(suggest("|")).toBeNull();
    expect(suggest("order-7|")).toBeNull();
    expect(suggest("zzz|")).toBeNull();
    expect(suggest('WorkflowId = "|"')).toBeNull();
    expect(suggest("OrderTotal = 1|")).toBeNull();
  });
});
