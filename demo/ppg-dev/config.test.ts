import { describe, expect, it } from "vitest";

import { buildDemoConfig, resolveDemoAiEnabled } from "./config";

describe("buildDemoConfig", () => {
  it("returns the demo config without any Agentation settings", () => {
    const config = buildDemoConfig({
      aiEnabled: true,
      bootId: "boot-123",
      databaseEnabled: true,
      seededAt: "2026-03-09T10:00:00.000Z",
      streamsUrl: "/api/streams",
    });

    expect(config).toEqual({
      ai: {
        enabled: true,
      },
      bootId: "boot-123",
      database: {
        enabled: true,
      },
      seededAt: "2026-03-09T10:00:00.000Z",
      streams: {
        url: "/api/streams",
      },
    });
    expect("agentation" in config).toBe(false);
  });

  it("omits the seeded timestamp when the demo is using external data sources", () => {
    const config = buildDemoConfig({
      aiEnabled: false,
      bootId: "boot-456",
      databaseEnabled: false,
      seededAt: null,
      streamsUrl: "/api/streams",
    });

    expect(config).toEqual({
      ai: {
        enabled: false,
      },
      bootId: "boot-456",
      database: {
        enabled: false,
      },
      streams: {
        url: "/api/streams",
      },
    });
    expect("seededAt" in config).toBe(false);
  });
});

describe("resolveDemoAiEnabled", () => {
  it("returns false when no Anthropic key is configured", () => {
    expect(
      resolveDemoAiEnabled({
        anthropicApiKey: "",
        envValue: "true",
      }),
    ).toBe(false);
  });

  it("defaults to enabled when the Anthropic key exists", () => {
    expect(
      resolveDemoAiEnabled({
        anthropicApiKey: "sk-ant-test",
      }),
    ).toBe(true);
  });

  it("accepts an explicit false env override", () => {
    expect(
      resolveDemoAiEnabled({
        anthropicApiKey: "sk-ant-test",
        envValue: "false",
      }),
    ).toBe(false);
    expect(
      resolveDemoAiEnabled({
        anthropicApiKey: "sk-ant-test",
        envValue: "0",
      }),
    ).toBe(false);
  });

  it("accepts an explicit true env override", () => {
    expect(
      resolveDemoAiEnabled({
        anthropicApiKey: "sk-ant-test",
        envValue: " true ",
      }),
    ).toBe(true);
  });

  it("ignores unrecognized env values and keeps the default enabled state", () => {
    expect(
      resolveDemoAiEnabled({
        anthropicApiKey: "sk-ant-test",
        envValue: "maybe",
      }),
    ).toBe(true);
  });
});
