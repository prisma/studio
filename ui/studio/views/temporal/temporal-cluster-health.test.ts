import { describe, expect, it } from "vitest";

import {
  describeClusterHealth,
  describeHealthTag,
  formatHealthReason,
} from "./temporal-cluster-health";

describe("describeClusterHealth", () => {
  it("does not mark a busy shard as a warning, and says that it refuses nothing", () => {
    const busy = describeClusterHealth("busy");

    expect(busy.label).toBe("Busy");
    expect(busy.tone).toBe("info");
    expect(busy.meaning).toContain("refuses no requests");
  });

  it("marks the states that refuse work or need an operator", () => {
    expect(describeClusterHealth("shedding").tone).toBe("warning");
    expect(describeClusterHealth("critical").tone).toBe("danger");
    expect(describeClusterHealth("fault").tone).toBe("danger");
  });

  it("shows a state it does not know by the server's name for it", () => {
    expect(describeClusterHealth("draining").label).toBe("draining");
  });
});

describe("formatHealthReason", () => {
  it("writes a share as a percentage and keeps the unit of a time", () => {
    expect(
      formatHealthReason({ signal: "headroom", unit: "share", value: 0.12 }),
    ).toBe("headroom 12%");
    expect(
      formatHealthReason({
        signal: "progress_sojourn",
        unit: "ms",
        value: 7.1,
      }),
    ).toBe("progress_sojourn 7.10 ms");
    expect(
      formatHealthReason({ signal: "stock_bound", unit: "per_s", value: 1180 }),
    ).toBe("stock_bound 1180/s");
  });
});

describe("describeHealthTag", () => {
  it("says who is the limit when tasks wait for Workers", () => {
    expect(describeHealthTag("worker_shortage")).toContain("Workers");
    expect(describeHealthTag("new_tag")).toBe("new_tag");
  });
});
