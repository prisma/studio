import { describe, expect, it } from "vitest";

import {
  formatDemoRuntimeUsage,
  parseDemoRuntimeOptions,
} from "./runtime-options";

describe("parseDemoRuntimeOptions", () => {
  it("returns local mode defaults when no external flags are provided", () => {
    expect(parseDemoRuntimeOptions([])).toEqual({
      databaseUrl: null,
      streamsServerUrl: null,
    });
  });

  it("parses explicit external database and streams flags", () => {
    expect(
      parseDemoRuntimeOptions([
        "--database-url",
        "postgres://postgres:postgres@127.0.0.1:5432/demo",
        "--streams-server-url",
        "http://127.0.0.1:51216",
      ]),
    ).toEqual({
      databaseUrl: "postgres://postgres:postgres@127.0.0.1:5432/demo",
      streamsServerUrl: "http://127.0.0.1:51216",
    });
    expect(
      parseDemoRuntimeOptions([
        "--database-url=postgres://postgres:postgres@127.0.0.1:5432/demo",
        "--streams-server-url=http://127.0.0.1:51216",
      ]),
    ).toEqual({
      databaseUrl: "postgres://postgres:postgres@127.0.0.1:5432/demo",
      streamsServerUrl: "http://127.0.0.1:51216",
    });
  });

  it("parses streams-only mode and normalizes a bare host:port URL", () => {
    expect(
      parseDemoRuntimeOptions(["--streams-server-url", "127.0.0.1:8787"]),
    ).toEqual({
      databaseUrl: null,
      streamsServerUrl: "http://127.0.0.1:8787",
    });
  });

  it("rejects a database url without a streams url", () => {
    expect(() =>
      parseDemoRuntimeOptions([
        "--database-url",
        "postgres://postgres:postgres@127.0.0.1:5432/demo",
      ]),
    ).toThrow("--database-url requires --streams-server-url");
  });

  it("rejects unknown flags and includes usage guidance", () => {
    expect(() => parseDemoRuntimeOptions(["--wat"])).toThrow(
      'Unknown demo flag "--wat".',
    );
    expect(formatDemoRuntimeUsage()).toContain(
      "pnpm demo:ppg -- --database-url",
    );
  });
});
