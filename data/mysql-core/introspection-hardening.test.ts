import { describe, expect, it, vi } from "vitest";

import type { SequenceExecutor } from "../executor";
import { createMySQLAdapter } from "./adapter";
import { mockTablesQuery } from "./introspection";

describe("mysql-core introspection hardening", () => {
  it("falls back to UTC when timezone introspection fails", async () => {
    const execute: SequenceExecutor["execute"] = (query) => {
      if (query.sql.toLowerCase().includes("timezone")) {
        return Promise.resolve([new Error("timezone tables unavailable")]);
      }

      return Promise.resolve([null, mockTablesQuery() as never]);
    };
    const executor: SequenceExecutor = {
      execute,
      executeSequence: vi.fn() as SequenceExecutor["executeSequence"],
    };
    const adapter = createMySQLAdapter({ executor });

    const [error, result] = await adapter.introspect({});

    expect(error).toBeNull();
    expect(result).toBeDefined();
    expect(result?.timezone).toBe("UTC");
    expect(Object.keys(result?.schemas ?? {}).length).toBeGreaterThan(0);
  });
});
