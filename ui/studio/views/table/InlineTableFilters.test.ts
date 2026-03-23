import { describe, expect, it } from "vitest";

import { getFilterPillTooltipContent } from "./InlineTableFilters";

describe("getFilterPillTooltipContent", () => {
  it("shows the raw AI request without a prefix for valid AI-generated filters", () => {
    expect(
      getFilterPillTooltipContent({
        aiSourceQuery: "top 5 users called Karl",
      }),
    ).toEqual({
      isWarning: false,
      primaryMessage: "top 5 users called Karl",
    });
  });

  it("keeps warning text primary and uses the raw AI request as secondary context", () => {
    expect(
      getFilterPillTooltipContent({
        aiSourceQuery: "email is abba",
        issueMessage: '"is" only supports null checks. Use value "null".',
      }),
    ).toEqual({
      isWarning: true,
      primaryMessage: '"is" only supports null checks. Use value "null".',
      secondaryMessage: "email is abba",
    });
  });
});
