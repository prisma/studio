import { describe, expect, it } from "vitest";

import type { Executor } from "../executor";
import { createPostgresAdapter } from "./adapter";
import { mockTablesQuery } from "./introspection";

describe("postgres-core introspection hardening", () => {
  it("falls back to UTC when timezone introspection fails", async () => {
    const execute: Executor["execute"] = (query) => {
      if (query.sql.includes("current_setting('timezone')")) {
        return Promise.resolve([new Error("permission denied for timezone")]);
      }

      return Promise.resolve([null, mockTablesQuery() as never]);
    };
    const executor: Executor = { execute };
    const adapter = createPostgresAdapter({ executor });

    const [error, result] = await adapter.introspect({});

    expect(error).toBeNull();
    expect(result).toBeDefined();
    expect(result?.timezone).toBe("UTC");
    expect(Object.keys(result?.schemas.public?.tables ?? {})).toContain(
      "users",
    );
  });

  it("annotates introspection errors with the adapter source", async () => {
    const execute: Executor["execute"] = () =>
      Promise.resolve([new Error("tables query failed")]);
    const executor: Executor = { execute };
    const adapter = createPostgresAdapter({ executor });

    const [error] = await adapter.introspect({});

    expect(error?.adapterSource).toBe("postgresql");
    expect(error?.message).toBe("tables query failed");
  });
});
