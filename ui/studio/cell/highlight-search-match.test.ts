import { describe, expect, it } from "vitest";

import { getSearchMatchSegments } from "./highlight-search-match";

describe("getSearchMatchSegments", () => {
  it("returns a single non-match segment when search is empty", () => {
    expect(getSearchMatchSegments("Tristan Ops", "   ")).toEqual([
      { isMatch: false, text: "Tristan Ops" },
    ]);
  });

  it("matches case-insensitively and returns all occurrences", () => {
    expect(getSearchMatchSegments("TrIage tri TRI", "tri")).toEqual([
      { isMatch: true, text: "TrI" },
      { isMatch: false, text: "age " },
      { isMatch: true, text: "tri" },
      { isMatch: false, text: " " },
      { isMatch: true, text: "TRI" },
    ]);
  });

  it("treats search term characters as plain text", () => {
    expect(getSearchMatchSegments("50%_off and 50%_OFF", "%_o")).toEqual([
      { isMatch: false, text: "50" },
      { isMatch: true, text: "%_o" },
      { isMatch: false, text: "ff and 50" },
      { isMatch: true, text: "%_O" },
      { isMatch: false, text: "FF" },
    ]);
  });

  it("matches datetime text when term omits the date-time separator", () => {
    expect(
      getSearchMatchSegments(
        "joined_at=2025-12-04T06:37:43.095Z",
        "2025-12-0406:37:43.095",
      ),
    ).toEqual([
      { isMatch: false, text: "joined_at=" },
      { isMatch: true, text: "2025-12-04T06:37:43.095" },
      { isMatch: false, text: "Z" },
    ]);
  });

  it("matches datetime text when term uses a different separator", () => {
    expect(
      getSearchMatchSegments(
        "joined_at=2025-12-04 06:37:43.095",
        "2025-12-04T06:37:43.095",
      ),
    ).toEqual([
      { isMatch: false, text: "joined_at=" },
      { isMatch: true, text: "2025-12-04 06:37:43.095" },
    ]);
  });
});
