import { describe, expect, it } from "vitest";

import {
  getStudioServiceForView,
  recordStudioServiceLocation,
} from "./navigation-ui-state";

describe("getStudioServiceForView", () => {
  it("maps each view to the service that owns it", () => {
    expect(getStudioServiceForView("stream")).toBe("streams");
    expect(getStudioServiceForView("temporal")).toBe("temporal");

    for (const view of ["table", "schema", "queries", "console", "sql"]) {
      expect(getStudioServiceForView(view)).toBe("database");
    }

    expect(getStudioServiceForView(null)).toBe("database");
  });
});

describe("recordStudioServiceLocation", () => {
  it("records the hash as the last location of the open service", () => {
    expect(
      recordStudioServiceLocation(
        { database: "#view=table&table=user" },
        {
          activeService: "temporal",
          hashService: "temporal",
          rawHash: "view=temporal&temporalWf=ord-1",
        },
      ),
    ).toEqual({
      database: "#view=table&table=user",
      temporal: "#view=temporal&temporalWf=ord-1",
    });
  });

  it("does not record a hash that names another service than the resolved view", () => {
    const locations = { database: "#view=table&table=user" };

    expect(
      recordStudioServiceLocation(locations, {
        activeService: "database",
        hashService: "streams",
        rawHash: "view=stream&stream=app-events",
      }),
    ).toBe(locations);
  });

  it("returns the same object when the location is already recorded", () => {
    const locations = { streams: "#view=stream&stream=app-events" };

    expect(
      recordStudioServiceLocation(locations, {
        activeService: "streams",
        hashService: "streams",
        rawHash: "view=stream&stream=app-events",
      }),
    ).toBe(locations);
  });
});
