import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildListFilter,
  formatAbsoluteTime,
  formatDuration,
  formatFailureMessage,
  formatRelativeTime,
  formatTime,
  isShortcutBlockedTarget,
  parseListFilter,
  toVisibilityQuery,
} from "./temporal-utils";

describe("formatDuration", () => {
  it("carries rounded seconds into the next minute", () => {
    expect(formatDuration(659_600)).toBe("11m 0s");
    expect(formatDuration(59_960)).toBe("1m 0s");
    expect(formatDuration(3_599_700)).toBe("1h 0m");
  });

  it("keeps sub-minute precision", () => {
    expect(formatDuration(277)).toBe("277ms");
    expect(formatDuration(5_750)).toBe("5.75s");
    expect(formatDuration(52_600)).toBe("52.6s");
    expect(formatDuration(188_000)).toBe("3m 8s");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the minutes for future times past one hour", () => {
    expect(formatRelativeTime("2026-11-22T16:00:00.000Z")).toBe("in 1h");
    expect(formatRelativeTime("2026-11-22T16:15:00.000Z")).toBe("in 1h 15m");
    expect(formatRelativeTime("2026-11-22T16:45:00.000Z")).toBe("in 1h 45m");
  });

  it("formats near-future and past times", () => {
    expect(formatRelativeTime("2026-11-22T15:00:30.000Z")).toBe("in 30s");
    expect(formatRelativeTime("2026-11-22T15:20:00.000Z")).toBe("in 20m");
    expect(formatRelativeTime("2026-11-24T15:00:00.000Z")).toBe("in 2d");
    expect(formatRelativeTime("2026-11-22T14:58:00.000Z")).toBe("2m ago");
  });
});

describe("formatFailureMessage", () => {
  it("prefixes the failure type", () => {
    expect(
      formatFailureMessage({ message: "upstream down", type: "Gateway503" }),
    ).toBe("Gateway503: upstream down");
  });

  it("does not repeat a type the message already starts with", () => {
    expect(
      formatFailureMessage({
        message: "StripeCardDeclined: card_declined",
        type: "StripeCardDeclined",
      }),
    ).toBe("StripeCardDeclined: card_declined");
  });

  it("returns the message when there is no type", () => {
    expect(formatFailureMessage({ message: "boom" })).toBe("boom");
  });

  it("names the root cause of a failure that only wraps another one", () => {
    expect(
      formatFailureMessage({
        cause: {
          cause: {
            message: "the card issuer refused the charge",
            type: "CardDeclined",
          },
          message: "Activity task failed",
        },
        message: "Activity task failed",
      }),
    ).toBe(
      "Activity task failed: CardDeclined: the card issuer refused the charge",
    );
  });

  it("does not repeat a root cause the message already holds", () => {
    expect(
      formatFailureMessage({
        cause: { message: "blocklist", type: "OrderRejected" },
        message: "OrderRejected: blocklist",
      }),
    ).toBe("OrderRejected: blocklist");
  });
});

describe("isShortcutBlockedTarget", () => {
  function mount(html: string): Element {
    document.body.innerHTML = html;
    return document.querySelector("[data-target]")!;
  }

  it("leaves the arrow keys to a focused radio group or tab list", () => {
    const radio = mount(
      '<div role="group"><button role="radio" data-target>UTC</button></div>',
    );

    expect(isShortcutBlockedTarget(radio, "ArrowDown")).toBe(true);
    expect(isShortcutBlockedTarget(radio, "j")).toBe(false);
    expect(
      isShortcutBlockedTarget(
        mount('<button role="tab" data-target>Raw Events</button>'),
        "ArrowUp",
      ),
    ).toBe(true);
    expect(
      isShortcutBlockedTarget(mount("<div data-target></div>"), "ArrowDown"),
    ).toBe(false);
  });

  it("lets Space and Enter activate a focused button or link", () => {
    const button = mount("<button data-target>Views</button>");

    expect(isShortcutBlockedTarget(button, " ")).toBe(true);
    expect(isShortcutBlockedTarget(button, "Enter")).toBe(true);
    expect(
      isShortcutBlockedTarget(
        mount('<a href="#x" data-target>Open</a>'),
        "Enter",
      ),
    ).toBe(true);
  });

  it("keeps row navigation keys working while a button has focus", () => {
    const checkbox = mount('<button role="checkbox" data-target></button>');

    expect(isShortcutBlockedTarget(checkbox, "j")).toBe(false);
    expect(isShortcutBlockedTarget(checkbox, "ArrowDown")).toBe(false);
  });

  it("blocks every shortcut in text fields, dialogs, and menus", () => {
    expect(isShortcutBlockedTarget(mount("<input data-target />"), "j")).toBe(
      true,
    );
    expect(
      isShortcutBlockedTarget(mount("<textarea data-target></textarea>"), "/"),
    ).toBe(true);
    expect(
      isShortcutBlockedTarget(
        mount('<div role="dialog"><p data-target>Body</p></div>'),
        "j",
      ),
    ).toBe(true);
    expect(
      isShortcutBlockedTarget(
        mount('<div role="menu"><div data-target>Item</div></div>'),
        "k",
      ),
    ).toBe(true);
  });

  it("allows shortcuts from the page body and table cells", () => {
    expect(isShortcutBlockedTarget(document.body, "Enter")).toBe(false);
    expect(
      isShortcutBlockedTarget(
        mount(
          "<table><tbody><tr><td data-target>cell</td></tr></tbody></table>",
        ),
        " ",
      ),
    ).toBe(false);
    expect(isShortcutBlockedTarget(null, "j")).toBe(false);
  });
});

describe("toVisibilityQuery", () => {
  it("passes a List Filter through unchanged", () => {
    for (const filter of [
      'ExecutionStatus = "Failed"',
      'WorkflowType IN ("a", "b")',
      '(TaskQueue = "billing" OR TaskQueue = "orders") AND ExecutionStatus != "Running"',
      'WorkflowId STARTS_WITH "order-"',
      "CloseTime IS NULL",
    ]) {
      expect(toVisibilityQuery(filter)).toBe(filter);
    }
  });

  it("searches workflow ID, workflow type and run ID for a pasted run ID", () => {
    expect(toVisibilityQuery(" 01a20443-35e6-74d3-85a3-ea1783221cd6 ")).toBe(
      'WorkflowId STARTS_WITH "01a20443-35e6-74d3-85a3-ea1783221cd6" OR WorkflowType STARTS_WITH "01a20443-35e6-74d3-85a3-ea1783221cd6" OR RunId STARTS_WITH "01a20443-35e6-74d3-85a3-ea1783221cd6"',
    );
  });

  it("searches by prefix for any other plain text", () => {
    expect(toVisibilityQuery("order-04")).toBe(
      'WorkflowId STARTS_WITH "order-04" OR WorkflowType STARTS_WITH "order-04" OR RunId STARTS_WITH "order-04"',
    );
  });

  it("escapes quotes, and matches text with a backslash exactly", () => {
    expect(toVisibilityQuery('say "hi"')).toContain(
      'WorkflowId STARTS_WITH "say \\"hi\\""',
    );
    expect(toVisibilityQuery("a\\b")).toBe(
      'WorkflowId = "a\\\\b" OR WorkflowType = "a\\\\b" OR RunId = "a\\\\b"',
    );
  });

  it("keeps an empty search empty", () => {
    expect(toVisibilityQuery("   ")).toBe("");
  });
});

describe("Temporal time formats", () => {
  it("writes a point in time in UTC with a UTC suffix", () => {
    expect(formatAbsoluteTime("2026-11-23T04:05:09.123Z", "utc")).toBe(
      "2026-11-23 04:05:09 UTC",
    );
    expect(formatTime("2026-11-23T04:05:09.123Z", "utc")).toBe(
      "2026-11-23 04:05:09 UTC",
    );
  });

  it("writes local time without a suffix and keeps a missing time as a dash", () => {
    expect(formatAbsoluteTime("2026-11-23T04:05:09Z", "local")).toMatch(
      /^2026-11-2[23] \d\d:\d\d:09$/,
    );
    expect(formatTime(undefined, "local")).toBe("—");
  });
});

describe("List Filter builder helpers", () => {
  it("writes conditions joined by AND and quotes text values", () => {
    expect(
      buildListFilter([
        { attribute: "WorkflowType", operator: "=", value: "orderFulfillment" },
        { attribute: "OrderTotal", operator: ">", value: "100" },
        { attribute: "WorkflowId", operator: "STARTS_WITH", value: 'a"b' },
        { attribute: "TaskQueue", operator: "=", value: "  " },
      ]),
    ).toBe(
      'WorkflowType = "orderFulfillment" AND OrderTotal > 100 AND WorkflowId STARTS_WITH "a\\"b"',
    );
  });

  it("reads back the filter it wrote", () => {
    const conditions = [
      { attribute: "ExecutionStatus", operator: "=", value: "Failed" },
      { attribute: "StartTime", operator: ">", value: "2026-11-22T10:00:00Z" },
      {
        attribute: "WorkflowId",
        operator: "STARTS_WITH",
        value: "order AND more",
      },
    ] as const;

    expect(parseListFilter(buildListFilter([...conditions]))).toEqual(
      conditions,
    );
  });

  it("does not read a filter with OR or parentheses", () => {
    expect(parseListFilter('A = "x" OR B = "y"')).toBeNull();
    expect(parseListFilter('(A = "x")')).toBeNull();
    expect(parseListFilter("")).toEqual([]);
  });
});
